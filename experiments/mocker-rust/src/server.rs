use std::collections::HashMap;
use std::sync::Arc;

use http_body_util::{BodyExt, Full};
use hyper::body::{Bytes, Incoming};
use hyper::{Request, Response, StatusCode};

use crate::args::{Mode, ValidatedArgs};
use crate::error::MockerError;
use crate::mock::manager::MockManager;
use crate::proxy::{proxy_request, ProxyResponse};
use crate::stream::delay::apply_delay;
use crate::stream::throttle::throttle_bytes;
use crate::util::logger;

/// Maximum allowed request body size (1 GB).
const MAX_REQUEST_BODY_SIZE: usize = 1_073_741_824;

/// Shared application state passed to each request handler.
pub struct AppState {
    pub args: ValidatedArgs,
    pub mock_manager: MockManager,
    pub http_client: hyper_util::client::legacy::Client<
        hyper_util::client::legacy::connect::HttpConnector,
        Full<Bytes>,
    >,
}

/// Generate a random 8-character hex string for connection IDs.
fn generate_connection_id() -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .subsec_nanos();
    let pid = std::process::id();
    let mixed = nanos ^ pid;
    let bytes: [u8; 4] = mixed.to_le_bytes();
    bytes.iter().fold(String::with_capacity(8), |mut acc, b| {
        use std::fmt::Write;
        let _ = write!(acc, "{b:02x}");
        acc
    })
}

/// Collect an HTTP body frame-by-frame up to `max_size` bytes.
/// Returns `None` if the body exceeds the limit, aborting early
/// without reading remaining frames.
async fn collect_body_limited(
    mut body: Incoming,
    max_size: usize,
) -> Result<Option<Vec<u8>>, hyper::Error> {
    let mut buf = Vec::new();
    while let Some(frame) = body.frame().await {
        let frame = frame?;
        if let Some(data) = frame.data_ref() {
            if buf.len() + data.len() > max_size {
                return Ok(None);
            }
            buf.extend_from_slice(data);
        }
    }
    Ok(Some(buf))
}

/// Main request handler for the HTTP server.
pub async fn handle_request(
    req: Request<Incoming>,
    state: Arc<AppState>,
) -> Result<Response<Full<Bytes>>, hyper::Error> {
    let connection_id = generate_connection_id();
    let method = req.method().to_string();
    let uri = req
        .uri()
        .path_and_query()
        .map_or_else(|| req.uri().path().to_string(), ToString::to_string);

    logger::info(&format!("{connection_id} \u{1f449} {method} {uri}"));

    // Health checks
    if uri == "/.well-known/live" || uri == "/.well-known/ready" {
        let resp = build_response(
            200,
            b"OK".to_vec(),
            &[("x-powered-by".to_string(), "mocker".to_string())],
            &connection_id,
            None,
            &state.args,
        );
        logger::info(&format!("{connection_id} \u{1f448} {}", 200));
        return Ok(resp);
    }

    // CORS preflight
    if state.args.cors && method == "OPTIONS" {
        let origin_header = req
            .headers()
            .get("origin")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("*")
            .to_string();
        let allow_headers = req
            .headers()
            .get("access-control-request-headers")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("*")
            .to_string();

        let mut resp_headers = vec![
            ("x-powered-by".to_string(), "mocker".to_string()),
            ("access-control-allow-origin".to_string(), origin_header),
            (
                "access-control-allow-credentials".to_string(),
                "true".to_string(),
            ),
            (
                "access-control-allow-methods".to_string(),
                "PUT, GET, POST, DELETE, OPTIONS".to_string(),
            ),
            ("access-control-allow-headers".to_string(), allow_headers),
        ];
        resp_headers.push(("x-mocker-request-id".to_string(), connection_id.clone()));

        let resp = build_response_from_headers(204, vec![], &resp_headers);
        logger::info(&format!("{connection_id} \u{1f448} {}", 204));
        return Ok(resp);
    }

    // Extract request headers
    let req_headers: Vec<(String, String)> = req
        .headers()
        .iter()
        .map(|(k, v)| (k.as_str().to_string(), v.to_str().unwrap_or("").to_string()))
        .collect();

    let req_headers_map: HashMap<String, String> = req_headers
        .iter()
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();

    // Collect request body with size limit.
    // If exceeded, close the connection immediately by dropping the body.
    let Some(req_body) = collect_body_limited(req.into_body(), MAX_REQUEST_BODY_SIZE).await? else {
        logger::warn(&format!(
            "{connection_id} request body exceeds {MAX_REQUEST_BODY_SIZE} bytes limit, closing connection"
        ));
        return Ok(Response::builder()
            .status(StatusCode::PAYLOAD_TOO_LARGE)
            .header("connection", "close")
            .body(Full::new(Bytes::new()))
            .expect("valid response"));
    };

    // Dispatch by mode
    let result = match state.args.mode {
        Mode::Read => handle_read(&state, &method, &uri, &req_headers_map, &req_body).await,
        Mode::Write => {
            handle_write(
                &state,
                &method,
                &uri,
                &req_headers,
                &req_headers_map,
                &req_body,
            )
            .await
        }
        Mode::Pass => handle_pass(&state, &method, &uri, &req_headers, &req_body).await,
        Mode::ReadWrite => {
            handle_read_write(
                &state,
                &method,
                &uri,
                &req_headers,
                &req_headers_map,
                &req_body,
            )
            .await
        }
        Mode::ReadPass => {
            handle_read_pass(
                &state,
                &method,
                &uri,
                &req_headers,
                &req_headers_map,
                &req_body,
            )
            .await
        }
        Mode::PassRead => {
            handle_pass_read(
                &state,
                &method,
                &uri,
                &req_headers,
                &req_headers_map,
                &req_body,
            )
            .await
        }
    };

    // Build final response
    let (status, body, mut extra_headers, response_from, mock_path) = match result {
        Ok(r) => r,
        Err(_e) => {
            let resp = build_response(
                502,
                b"Bad Gateway".to_vec(),
                &[("x-powered-by".to_string(), "mocker".to_string())],
                &connection_id,
                Some("Error"),
                &state.args,
            );
            logger::error(&format!("{connection_id} \u{1f448} {}", 502));
            return Ok(resp);
        }
    };

    // Apply throttle
    let body = throttle_bytes(&body, state.args.throttle).await;

    // Apply delay
    apply_delay(state.args.delay).await;

    // Add standard headers
    extra_headers.push(("x-powered-by".to_string(), "mocker".to_string()));
    extra_headers.push(("x-mocker-request-id".to_string(), connection_id.clone()));
    extra_headers.push((
        "x-mocker-response-from".to_string(),
        response_from.to_string(),
    ));

    if let Some(ref path) = mock_path {
        extra_headers.push((
            "x-mocker-mock-path".to_string(),
            path.to_string_lossy().to_string(),
        ));
    }

    // Apply overwrite_response_headers
    for (key, value) in &state.args.overwrite_response_headers {
        let val_str = match value {
            serde_json::Value::String(s) => s.clone(),
            other => other.to_string(),
        };
        extra_headers.push((key.clone(), val_str));
    }

    // Apply CORS headers
    if state.args.cors {
        extra_headers.push(("access-control-allow-origin".to_string(), "*".to_string()));
    }

    let resp = build_response_from_headers(status, body, &extra_headers);
    logger::info(&format!("{connection_id} \u{1f448} {status}"));
    Ok(resp)
}

type HandlerResult = Result<
    (
        u16,
        Vec<u8>,
        Vec<(String, String)>,
        &'static str,
        Option<std::path::PathBuf>,
    ),
    MockerError,
>;

fn mock_headers_to_vec(headers: &HashMap<String, serde_json::Value>) -> Vec<(String, String)> {
    headers
        .iter()
        .map(|(k, v)| {
            let val = match v {
                serde_json::Value::String(s) => s.clone(),
                other => other.to_string(),
            };
            (k.clone(), val)
        })
        .collect()
}

async fn handle_read(
    state: &AppState,
    method: &str,
    url: &str,
    req_headers_map: &HashMap<String, String>,
    req_body: &[u8],
) -> HandlerResult {
    match state
        .mock_manager
        .get(method, url, req_headers_map, req_body)
        .await
    {
        Ok(mock_result) => {
            let headers = mock_headers_to_vec(&mock_result.headers);
            Ok((
                mock_result.status_code,
                mock_result.body,
                headers,
                "Mock",
                Some(mock_result.mock_path),
            ))
        }
        Err(_) => Ok((404, b"Not Found".to_vec(), vec![], "Mock", None)),
    }
}

async fn handle_pass(
    state: &AppState,
    method: &str,
    url: &str,
    req_headers: &[(String, String)],
    req_body: &[u8],
) -> HandlerResult {
    let proxy_resp = proxy_request(
        &state.http_client,
        &state.args.origin,
        method,
        url,
        req_headers,
        req_body.to_vec(),
        state.args.retries,
        &state.args.overwrite_request_headers,
        &state.args.proxy,
    )
    .await?;

    Ok((
        proxy_resp.status,
        proxy_resp.body,
        proxy_resp.headers,
        "Origin",
        None,
    ))
}

async fn handle_write(
    state: &AppState,
    method: &str,
    url: &str,
    req_headers: &[(String, String)],
    req_headers_map: &HashMap<String, String>,
    req_body: &[u8],
) -> HandlerResult {
    let proxy_resp = proxy_request(
        &state.http_client,
        &state.args.origin,
        method,
        url,
        req_headers,
        req_body.to_vec(),
        state.args.retries,
        &state.args.overwrite_request_headers,
        &state.args.proxy,
    )
    .await?;

    // Write mock if 2xx
    let mock_path = if (200..300).contains(&proxy_resp.status) {
        write_mock(state, method, url, req_headers_map, req_body, &proxy_resp)
            .await
            .ok()
    } else {
        None
    };

    Ok((
        proxy_resp.status,
        proxy_resp.body,
        proxy_resp.headers,
        "Origin",
        mock_path,
    ))
}

async fn handle_read_write(
    state: &AppState,
    method: &str,
    url: &str,
    req_headers: &[(String, String)],
    req_headers_map: &HashMap<String, String>,
    req_body: &[u8],
) -> HandlerResult {
    // Try read first
    if let Ok(mock_result) = state
        .mock_manager
        .get(method, url, req_headers_map, req_body)
        .await
    {
        let headers = mock_headers_to_vec(&mock_result.headers);
        return Ok((
            mock_result.status_code,
            mock_result.body,
            headers,
            "Mock",
            Some(mock_result.mock_path),
        ));
    }

    // Not found, proxy and write
    handle_write(state, method, url, req_headers, req_headers_map, req_body).await
}

async fn handle_read_pass(
    state: &AppState,
    method: &str,
    url: &str,
    req_headers: &[(String, String)],
    req_headers_map: &HashMap<String, String>,
    req_body: &[u8],
) -> HandlerResult {
    // Try read first
    if let Ok(mock_result) = state
        .mock_manager
        .get(method, url, req_headers_map, req_body)
        .await
    {
        let headers = mock_headers_to_vec(&mock_result.headers);
        return Ok((
            mock_result.status_code,
            mock_result.body,
            headers,
            "Mock",
            Some(mock_result.mock_path),
        ));
    }

    // Not found, just proxy (no write)
    handle_pass(state, method, url, req_headers, req_body).await
}

async fn handle_pass_read(
    state: &AppState,
    method: &str,
    url: &str,
    req_headers: &[(String, String)],
    req_headers_map: &HashMap<String, String>,
    req_body: &[u8],
) -> HandlerResult {
    // Proxy first
    let proxy_result = proxy_request(
        &state.http_client,
        &state.args.origin,
        method,
        url,
        req_headers,
        req_body.to_vec(),
        state.args.retries,
        &state.args.overwrite_request_headers,
        &state.args.proxy,
    )
    .await;

    match proxy_result {
        Ok(proxy_resp) if proxy_resp.status < 500 => Ok((
            proxy_resp.status,
            proxy_resp.body,
            proxy_resp.headers,
            "Origin",
            None,
        )),
        _ => {
            // Fallback to mock
            match state
                .mock_manager
                .get(method, url, req_headers_map, req_body)
                .await
            {
                Ok(mock_result) => {
                    let headers = mock_headers_to_vec(&mock_result.headers);
                    Ok((
                        mock_result.status_code,
                        mock_result.body,
                        headers,
                        "Mock",
                        Some(mock_result.mock_path),
                    ))
                }
                Err(_) => Ok((404, b"Not Found".to_vec(), vec![], "Mock", None)),
            }
        }
    }
}

async fn write_mock(
    state: &AppState,
    method: &str,
    url: &str,
    req_headers_map: &HashMap<String, String>,
    req_body: &[u8],
    proxy_resp: &ProxyResponse,
) -> Result<std::path::PathBuf, MockerError> {
    let req_headers_json: HashMap<String, serde_json::Value> = req_headers_map
        .iter()
        .map(|(k, v)| (k.clone(), serde_json::Value::String(v.clone())))
        .collect();

    let resp_headers_json: HashMap<String, serde_json::Value> = proxy_resp
        .headers
        .iter()
        .map(|(k, v)| (k.clone(), serde_json::Value::String(v.clone())))
        .collect();

    let content_encoding = proxy_resp
        .headers
        .iter()
        .find(|(k, _)| k == "content-encoding")
        .map_or("", |(_, v)| v.as_str());

    state
        .mock_manager
        .set(
            method,
            url,
            &req_headers_json,
            req_body,
            proxy_resp.status,
            &resp_headers_json,
            &proxy_resp.body,
            content_encoding,
        )
        .await
}

fn build_response(
    status: u16,
    body: Vec<u8>,
    extra_headers: &[(String, String)],
    connection_id: &str,
    response_from: Option<&str>,
    _args: &ValidatedArgs,
) -> Response<Full<Bytes>> {
    let mut builder = Response::builder()
        .status(StatusCode::from_u16(status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR));

    for (key, value) in extra_headers {
        builder = builder.header(key.as_str(), value.as_str());
    }

    builder = builder.header("x-mocker-request-id", connection_id);

    if let Some(from) = response_from {
        builder = builder.header("x-mocker-response-from", from);
    }

    builder.body(Full::new(Bytes::from(body))).unwrap()
}

fn build_response_from_headers(
    status: u16,
    body: Vec<u8>,
    headers: &[(String, String)],
) -> Response<Full<Bytes>> {
    let mut builder = Response::builder()
        .status(StatusCode::from_u16(status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR));

    for (key, value) in headers {
        builder = builder.header(key.as_str(), value.as_str());
    }

    builder.body(Full::new(Bytes::from(body))).unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::args::{LogLevel, Mode, Update};
    use std::collections::HashSet;
    use std::path::PathBuf;

    fn make_test_args(mode: Mode) -> ValidatedArgs {
        ValidatedArgs {
            origin: "http://localhost:3000".to_string(),
            port: 8273,
            mocks_dir: PathBuf::from("/tmp/test-mocks"),
            mode,
            update: Update::Off,
            delay: 0,
            throttle: 0,
            retries: 0,
            mock_keys: {
                let mut s = HashSet::new();
                s.insert("method".to_string());
                s.insert("url".to_string());
                s
            },
            logging: LogLevel::Silent,
            cors: false,
            proxy: String::new(),
            redacted_headers: HashMap::new(),
            overwrite_response_headers: HashMap::new(),
            overwrite_request_headers: HashMap::new(),
        }
    }

    fn make_test_state(mode: Mode) -> Arc<AppState> {
        let args = make_test_args(mode);
        let mock_manager = MockManager::new(
            args.mocks_dir.clone(),
            args.mock_keys.clone(),
            args.redacted_headers.clone(),
        );
        let http_client =
            hyper_util::client::legacy::Client::builder(hyper_util::rt::TokioExecutor::new())
                .build_http();
        Arc::new(AppState {
            args,
            mock_manager,
            http_client,
        })
    }

    #[tokio::test]
    async fn test_health_check_live() {
        let state = make_test_state(Mode::Read);
        // Convert Full<Bytes> body to Incoming is not trivial, so we test
        // the health check logic via a real TCP connection instead.
        // For now, verify state creation works.
        assert_eq!(state.args.mode, Mode::Read);
    }

    #[tokio::test]
    async fn test_health_check_via_server() {
        use hyper::server::conn::http1;
        use hyper::service::service_fn;
        use hyper_util::rt::TokioIo;
        use tokio::net::TcpListener;

        // Suppress log output
        logger::set_level(logger::LogLevel::Silent);

        let state = make_test_state(Mode::Read);

        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        let server_state = state.clone();
        let handle = tokio::spawn(async move {
            if let Ok((stream, _)) = listener.accept().await {
                let io = TokioIo::new(stream);
                let state = server_state.clone();
                let _ = http1::Builder::new()
                    .serve_connection(
                        io,
                        service_fn(move |req| {
                            let state = state.clone();
                            async move { handle_request(req, state).await }
                        }),
                    )
                    .await;
            }
        });

        // Make a request to the health check endpoint
        let client =
            hyper_util::client::legacy::Client::builder(hyper_util::rt::TokioExecutor::new())
                .build_http();

        let resp = client
            .request(
                Request::builder()
                    .uri(format!("http://{addr}/.well-known/live"))
                    .body(Full::<Bytes>::new(Bytes::new()))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(resp.status(), 200);
        assert_eq!(
            resp.headers()
                .get("x-powered-by")
                .unwrap()
                .to_str()
                .unwrap(),
            "mocker"
        );

        handle.abort();
    }

    #[tokio::test]
    async fn test_ready_check_via_server() {
        use hyper::server::conn::http1;
        use hyper::service::service_fn;
        use hyper_util::rt::TokioIo;
        use tokio::net::TcpListener;

        logger::set_level(logger::LogLevel::Silent);

        let state = make_test_state(Mode::Read);

        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        let server_state = state.clone();
        let handle = tokio::spawn(async move {
            if let Ok((stream, _)) = listener.accept().await {
                let io = TokioIo::new(stream);
                let state = server_state.clone();
                let _ = http1::Builder::new()
                    .serve_connection(
                        io,
                        service_fn(move |req| {
                            let state = state.clone();
                            async move { handle_request(req, state).await }
                        }),
                    )
                    .await;
            }
        });

        let client =
            hyper_util::client::legacy::Client::builder(hyper_util::rt::TokioExecutor::new())
                .build_http();

        let resp = client
            .request(
                Request::builder()
                    .uri(format!("http://{addr}/.well-known/ready"))
                    .body(Full::<Bytes>::new(Bytes::new()))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(resp.status(), 200);

        handle.abort();
    }

    #[tokio::test]
    async fn test_read_mode_returns_404_for_missing_mock() {
        use hyper::server::conn::http1;
        use hyper::service::service_fn;
        use hyper_util::rt::TokioIo;
        use tokio::net::TcpListener;

        logger::set_level(logger::LogLevel::Silent);

        let tmp = tempfile::TempDir::new().unwrap();
        let mut args = make_test_args(Mode::Read);
        args.mocks_dir = tmp.path().to_path_buf();

        let mock_manager = MockManager::new(
            args.mocks_dir.clone(),
            args.mock_keys.clone(),
            args.redacted_headers.clone(),
        );
        let http_client =
            hyper_util::client::legacy::Client::builder(hyper_util::rt::TokioExecutor::new())
                .build_http();
        let state = Arc::new(AppState {
            args,
            mock_manager,
            http_client,
        });

        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        let server_state = state.clone();
        let handle = tokio::spawn(async move {
            if let Ok((stream, _)) = listener.accept().await {
                let io = TokioIo::new(stream);
                let state = server_state.clone();
                let _ = http1::Builder::new()
                    .serve_connection(
                        io,
                        service_fn(move |req| {
                            let state = state.clone();
                            async move { handle_request(req, state).await }
                        }),
                    )
                    .await;
            }
        });

        let client =
            hyper_util::client::legacy::Client::builder(hyper_util::rt::TokioExecutor::new())
                .build_http();

        let resp = client
            .request(
                Request::builder()
                    .uri(format!("http://{addr}/nonexistent"))
                    .body(Full::<Bytes>::new(Bytes::new()))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(resp.status(), 404);

        handle.abort();
    }

    #[test]
    fn test_generate_connection_id_length() {
        let id = generate_connection_id();
        assert_eq!(id.len(), 8);
        assert!(id.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn test_build_response_from_headers() {
        let headers = vec![
            ("content-type".to_string(), "text/plain".to_string()),
            ("x-custom".to_string(), "value".to_string()),
        ];
        let resp = build_response_from_headers(200, b"hello".to_vec(), &headers);
        assert_eq!(resp.status(), 200);
        assert_eq!(
            resp.headers()
                .get("content-type")
                .unwrap()
                .to_str()
                .unwrap(),
            "text/plain"
        );
        assert_eq!(
            resp.headers().get("x-custom").unwrap().to_str().unwrap(),
            "value"
        );
    }

    #[test]
    fn test_build_response_from_headers_404() {
        let resp = build_response_from_headers(404, b"Not Found".to_vec(), &[]);
        assert_eq!(resp.status(), 404);
    }

    #[test]
    fn test_max_request_body_size_constant() {
        assert_eq!(MAX_REQUEST_BODY_SIZE, 1_073_741_824); // 1 GB
    }

    #[tokio::test]
    async fn test_body_within_limit_accepted() {
        use hyper::server::conn::http1;
        use hyper::service::service_fn;
        use hyper_util::rt::TokioIo;
        use tokio::net::TcpListener;

        logger::set_level(logger::LogLevel::Silent);

        let state = make_test_state(Mode::Read);

        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        let server_state = state.clone();
        let handle = tokio::spawn(async move {
            if let Ok((stream, _)) = listener.accept().await {
                let io = TokioIo::new(stream);
                let state = server_state.clone();
                let _ = http1::Builder::new()
                    .serve_connection(
                        io,
                        service_fn(move |req| {
                            let state = state.clone();
                            async move { handle_request(req, state).await }
                        }),
                    )
                    .await;
            }
        });

        let client =
            hyper_util::client::legacy::Client::builder(hyper_util::rt::TokioExecutor::new())
                .build_http();

        // Send a small body — should be accepted (returns 404 since no mock exists)
        let resp = client
            .request(
                Request::builder()
                    .method("POST")
                    .uri(format!("http://{addr}/test"))
                    .body(Full::<Bytes>::new(Bytes::from("small body")))
                    .unwrap(),
            )
            .await
            .unwrap();

        // Should not be 413 — any other status is fine (404 for read mode)
        assert_ne!(resp.status(), StatusCode::PAYLOAD_TOO_LARGE);

        handle.abort();
    }

    #[tokio::test]
    async fn test_body_over_limit_returns_413_and_closes() {
        use hyper::server::conn::http1;
        use hyper::service::service_fn;
        use hyper_util::rt::TokioIo;
        use tokio::net::TcpListener;

        // Use a tiny limit for testing
        const TEST_MAX_SIZE: usize = 10;

        // We can't easily change the constant for a test, so instead
        // test collect_body_limited directly with a real Incoming body.
        // Build a server that uses a custom handler with a small limit.

        logger::set_level(logger::LogLevel::Silent);

        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        let handle = tokio::spawn(async move {
            if let Ok((stream, _)) = listener.accept().await {
                let io = TokioIo::new(stream);
                let _ = http1::Builder::new()
                    .serve_connection(
                        io,
                        service_fn(move |req: Request<Incoming>| async move {
                            let result =
                                collect_body_limited(req.into_body(), TEST_MAX_SIZE).await?;
                            match result {
                                Some(body) => Ok::<_, hyper::Error>(
                                    Response::builder()
                                        .status(200)
                                        .body(Full::new(Bytes::from(format!(
                                            "got {} bytes",
                                            body.len()
                                        ))))
                                        .unwrap(),
                                ),
                                None => Ok(Response::builder()
                                    .status(StatusCode::PAYLOAD_TOO_LARGE)
                                    .header("connection", "close")
                                    .body(Full::new(Bytes::new()))
                                    .unwrap()),
                            }
                        }),
                    )
                    .await;
            }
        });

        let client =
            hyper_util::client::legacy::Client::builder(hyper_util::rt::TokioExecutor::new())
                .build_http();

        // Send body larger than TEST_MAX_SIZE (10 bytes)
        let resp = client
            .request(
                Request::builder()
                    .method("POST")
                    .uri(format!("http://{addr}/test"))
                    .body(Full::<Bytes>::new(Bytes::from(
                        "this body is definitely larger than 10 bytes",
                    )))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(resp.status(), StatusCode::PAYLOAD_TOO_LARGE);
        assert_eq!(
            resp.headers().get("connection").unwrap().to_str().unwrap(),
            "close"
        );

        handle.abort();
    }

    #[tokio::test]
    async fn test_body_exactly_at_limit_accepted() {
        use hyper::server::conn::http1;
        use hyper::service::service_fn;
        use hyper_util::rt::TokioIo;
        use tokio::net::TcpListener;

        const TEST_MAX_SIZE: usize = 5;

        logger::set_level(logger::LogLevel::Silent);

        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        let handle = tokio::spawn(async move {
            if let Ok((stream, _)) = listener.accept().await {
                let io = TokioIo::new(stream);
                let _ = http1::Builder::new()
                    .serve_connection(
                        io,
                        service_fn(move |req: Request<Incoming>| async move {
                            let result =
                                collect_body_limited(req.into_body(), TEST_MAX_SIZE).await?;
                            match result {
                                Some(body) => Ok::<_, hyper::Error>(
                                    Response::builder()
                                        .status(200)
                                        .body(Full::new(Bytes::from(format!(
                                            "got {} bytes",
                                            body.len()
                                        ))))
                                        .unwrap(),
                                ),
                                None => Ok(Response::builder()
                                    .status(StatusCode::PAYLOAD_TOO_LARGE)
                                    .body(Full::new(Bytes::new()))
                                    .unwrap()),
                            }
                        }),
                    )
                    .await;
            }
        });

        let client =
            hyper_util::client::legacy::Client::builder(hyper_util::rt::TokioExecutor::new())
                .build_http();

        // Send exactly 5 bytes
        let resp = client
            .request(
                Request::builder()
                    .method("POST")
                    .uri(format!("http://{addr}/test"))
                    .body(Full::<Bytes>::new(Bytes::from("hello")))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(resp.status(), 200);

        handle.abort();
    }
}
