use std::collections::{HashMap, HashSet};
use std::net::SocketAddr;
use std::path::Path;
use std::sync::Arc;

use http_body_util::{BodyExt, Full};
use hyper::body::{Bytes, Incoming};
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper::{Request, Response};
use hyper_util::rt::TokioIo;
use tokio::net::TcpListener;

use mocker::args::{LogLevel, Mode, Update, ValidatedArgs};
use mocker::mock::manager::MockManager;
use mocker::server::{handle_request, AppState};
use mocker::util::logger;

/// RAII guard for test servers. Aborts the spawned task on drop.
pub struct TestServer {
    pub addr: SocketAddr,
    handle: tokio::task::JoinHandle<()>,
}

impl Drop for TestServer {
    fn drop(&mut self) {
        self.handle.abort();
    }
}

/// Start an echo HTTP server that returns request details as JSON.
///
/// The response body is a JSON object with:
///   - method: the HTTP method
///   - url: the request URI
///   - headers: object of request headers
///   - body: the request body as a string
///
/// If the request contains a `response-status-code` header, the echo server
/// responds with that status code. Otherwise it responds with 200.
///
/// If the request contains a `response-header-*` header, the corresponding
/// header (without the `response-header-` prefix) is added to the response.
pub async fn start_echo_server() -> TestServer {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();

    let handle = tokio::spawn(async move {
        loop {
            let Ok((stream, _)) = listener.accept().await else {
                break;
            };
            tokio::spawn(async move {
                let _ = http1::Builder::new()
                    .serve_connection(
                        TokioIo::new(stream),
                        service_fn(|req: Request<Incoming>| async move {
                            let method = req.method().to_string();
                            let uri = req
                                .uri()
                                .path_and_query()
                                .map_or_else(|| req.uri().path().to_string(), ToString::to_string);

                            // Extract response status code from request header
                            let status_code: u16 = req
                                .headers()
                                .get("response-status-code")
                                .and_then(|v| v.to_str().ok())
                                .and_then(|v| v.parse().ok())
                                .unwrap_or(200);

                            // Collect response-header-* headers
                            let mut extra_response_headers: Vec<(String, String)> = Vec::new();
                            for (key, value) in req.headers() {
                                let key_str = key.as_str();
                                if let Some(suffix) = key_str.strip_prefix("response-header-") {
                                    if let Ok(val) = value.to_str() {
                                        extra_response_headers
                                            .push((suffix.to_string(), val.to_string()));
                                    }
                                }
                            }

                            // Collect request headers
                            let headers_map: HashMap<String, String> = req
                                .headers()
                                .iter()
                                .map(|(k, v)| {
                                    (k.as_str().to_string(), v.to_str().unwrap_or("").to_string())
                                })
                                .collect();

                            // Read body
                            let body_bytes = req
                                .into_body()
                                .collect()
                                .await
                                .map(|c| c.to_bytes().to_vec())
                                .unwrap_or_default();

                            let body_str = String::from_utf8_lossy(&body_bytes).to_string();

                            let echo = serde_json::json!({
                                "method": method,
                                "url": uri,
                                "headers": headers_map,
                                "body": body_str,
                            });

                            let resp_body = serde_json::to_vec(&echo).unwrap();

                            let mut builder = Response::builder()
                                .status(status_code)
                                .header("content-type", "application/json");

                            for (k, v) in &extra_response_headers {
                                builder = builder.header(k.as_str(), v.as_str());
                            }

                            Ok::<_, hyper::Error>(
                                builder.body(Full::new(Bytes::from(resp_body))).unwrap(),
                            )
                        }),
                    )
                    .await;
            });
        }
    });

    TestServer { addr, handle }
}

/// Start a status code server that returns the status code specified in the
/// `response-status-code` request header. Also forwards `response-header-*`
/// headers to the response. Body is empty for 204 and "OK" otherwise.
pub async fn start_status_code_server() -> TestServer {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();

    let handle = tokio::spawn(async move {
        loop {
            let Ok((stream, _)) = listener.accept().await else {
                break;
            };
            tokio::spawn(async move {
                let _ = http1::Builder::new()
                    .serve_connection(
                        TokioIo::new(stream),
                        service_fn(|req: Request<Incoming>| async move {
                            let status_code: u16 = req
                                .headers()
                                .get("response-status-code")
                                .and_then(|v| v.to_str().ok())
                                .and_then(|v| v.parse().ok())
                                .unwrap_or(200);

                            let mut extra_headers: Vec<(String, String)> = Vec::new();
                            for (key, value) in req.headers() {
                                let key_str = key.as_str();
                                if let Some(suffix) = key_str.strip_prefix("response-header-") {
                                    if let Ok(val) = value.to_str() {
                                        extra_headers.push((suffix.to_string(), val.to_string()));
                                    }
                                }
                            }

                            // Consume the body
                            let _ = req.into_body().collect().await;

                            let body = if status_code == 204 {
                                Vec::new()
                            } else {
                                b"OK".to_vec()
                            };

                            let mut builder = Response::builder().status(status_code);
                            for (k, v) in &extra_headers {
                                builder = builder.header(k.as_str(), v.as_str());
                            }

                            Ok::<_, hyper::Error>(
                                builder.body(Full::new(Bytes::from(body))).unwrap(),
                            )
                        }),
                    )
                    .await;
            });
        }
    });

    TestServer { addr, handle }
}

/// Create a `ValidatedArgs` with the given mode and origin, pointing mocks_dir
/// at the given path.
pub fn make_test_args(origin: &str, mode: Mode, mocks_dir: &Path) -> ValidatedArgs {
    ValidatedArgs {
        origin: origin.to_string(),
        port: 0,
        mocks_dir: mocks_dir.to_path_buf(),
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

/// Create a `ValidatedArgs` with custom overwrite_response_headers.
pub fn make_test_args_with_overwrite_response_headers(
    origin: &str,
    mode: Mode,
    mocks_dir: &Path,
    overwrite_response_headers: HashMap<String, serde_json::Value>,
) -> ValidatedArgs {
    let mut args = make_test_args(origin, mode, mocks_dir);
    args.overwrite_response_headers = overwrite_response_headers;
    args
}

/// Start a mocker server with the given configuration.
pub async fn start_mocker(args: ValidatedArgs) -> TestServer {
    logger::set_level(logger::LogLevel::Silent);

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

    let handle = tokio::spawn(async move {
        loop {
            let Ok((stream, _)) = listener.accept().await else {
                break;
            };
            let state = state.clone();
            tokio::spawn(async move {
                let _ = http1::Builder::new()
                    .serve_connection(
                        TokioIo::new(stream),
                        service_fn(move |req| {
                            let state = state.clone();
                            async move { handle_request(req, state).await }
                        }),
                    )
                    .await;
            });
        }
    });

    TestServer { addr, handle }
}

/// Build a hyper client for making requests.
pub fn build_client() -> hyper_util::client::legacy::Client<
    hyper_util::client::legacy::connect::HttpConnector,
    Full<Bytes>,
> {
    hyper_util::client::legacy::Client::builder(hyper_util::rt::TokioExecutor::new()).build_http()
}

/// Make a GET request and return the response.
pub async fn get(
    client: &hyper_util::client::legacy::Client<
        hyper_util::client::legacy::connect::HttpConnector,
        Full<Bytes>,
    >,
    url: &str,
) -> hyper::Response<Incoming> {
    client
        .request(
            Request::builder()
                .uri(url)
                .body(Full::new(Bytes::new()))
                .unwrap(),
        )
        .await
        .unwrap()
}

/// Read the full body of a response as bytes.
pub async fn read_body(resp: hyper::Response<Incoming>) -> Vec<u8> {
    resp.into_body()
        .collect()
        .await
        .unwrap()
        .to_bytes()
        .to_vec()
}

/// Read the full body of a response as a JSON value.
pub async fn read_body_json(resp: hyper::Response<Incoming>) -> serde_json::Value {
    let bytes = read_body(resp).await;
    serde_json::from_slice(&bytes).unwrap()
}
