use std::collections::HashMap;
use std::time::Duration;

use http_body_util::{BodyExt, Full};
use hyper::body::Bytes;
use hyper::Request;
use hyper_util::client::legacy::connect::HttpConnector;
use hyper_util::client::legacy::Client;

use crate::error::MockerError;
use crate::util::backoff::Backoff;
use crate::util::retry::retry;

const PROXY_TIMEOUT: Duration = Duration::from_secs(30);

/// The result of proxying a request to the origin server.
pub struct ProxyResponse {
    pub status: u16,
    pub headers: Vec<(String, String)>,
    pub body: Vec<u8>,
}

/// Forward a request to the origin server, optionally with retries.
pub async fn proxy_request(
    client: &Client<HttpConnector, Full<Bytes>>,
    origin: &str,
    method: &str,
    url: &str,
    headers: &[(String, String)],
    body: Vec<u8>,
    retries: u32,
    overwrite_request_headers: &HashMap<String, serde_json::Value>,
    proxy_url: &str,
) -> Result<ProxyResponse, MockerError> {
    let target_base = if proxy_url.is_empty() {
        origin
    } else {
        proxy_url
    };
    let full_url = format!("{target_base}{url}");

    let headers = headers.to_vec();
    let overwrite = overwrite_request_headers.clone();

    if retries > 0 {
        let full_url = full_url.clone();
        let method = method.to_string();
        let client = client.clone();
        retry(
            move || {
                let full_url = full_url.clone();
                let method = method.clone();
                let headers = headers.clone();
                let body = body.clone();
                let overwrite = overwrite.clone();
                let client = client.clone();
                async move {
                    do_request(&client, &full_url, &method, &headers, body, &overwrite).await
                }
            },
            retries,
            |result| matches!(result, Ok(resp) if resp.status >= 500),
            Backoff::new(1000, 30000),
        )
        .await
    } else {
        do_request(client, &full_url, method, &headers, body, &overwrite).await
    }
}

async fn do_request(
    client: &Client<HttpConnector, Full<Bytes>>,
    full_url: &str,
    method: &str,
    headers: &[(String, String)],
    body: Vec<u8>,
    overwrite_request_headers: &HashMap<String, serde_json::Value>,
) -> Result<ProxyResponse, MockerError> {
    let uri: hyper::Uri = full_url
        .parse()
        .map_err(|e: hyper::http::uri::InvalidUri| MockerError::HttpError(e.to_string()))?;

    let hyper_method = hyper::Method::from_bytes(method.as_bytes())
        .map_err(|e| MockerError::HttpError(e.to_string()))?;

    let mut builder = Request::builder().method(hyper_method).uri(uri);

    // Apply original headers
    for (key, value) in headers {
        builder = builder.header(key.as_str(), value.as_str());
    }

    // Apply overwrite headers (these override originals)
    for (key, value) in overwrite_request_headers {
        let val_str = match value {
            serde_json::Value::String(s) => s.clone(),
            other => other.to_string(),
        };
        builder = builder.header(key.as_str(), val_str.as_str());
    }

    let req = builder
        .body(Full::new(Bytes::from(body)))
        .map_err(|e| MockerError::HttpError(e.to_string()))?;

    let resp = tokio::time::timeout(PROXY_TIMEOUT, client.request(req))
        .await
        .map_err(|_| MockerError::HttpError("proxy request timed out".to_string()))?
        .map_err(|e| MockerError::HttpError(e.to_string()))?;

    let status = resp.status().as_u16();

    let resp_headers: Vec<(String, String)> = resp
        .headers()
        .iter()
        .map(|(k, v)| (k.as_str().to_string(), v.to_str().unwrap_or("").to_string()))
        .collect();

    let resp_body = resp
        .into_body()
        .collect()
        .await
        .map_err(|e| MockerError::HttpError(e.to_string()))?
        .to_bytes()
        .to_vec();

    Ok(ProxyResponse {
        status,
        headers: resp_headers,
        body: resp_body,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use hyper::server::conn::http1;
    use hyper::service::service_fn;
    use hyper::Response;
    use hyper_util::rt::{TokioExecutor, TokioIo};
    use std::net::SocketAddr;
    use tokio::net::TcpListener;

    fn make_client() -> Client<HttpConnector, Full<Bytes>> {
        Client::builder(TokioExecutor::new()).build_http()
    }

    async fn start_test_server(
        status: u16,
        body: &'static str,
    ) -> (SocketAddr, tokio::task::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        let handle = tokio::spawn(async move {
            // Accept just one connection for the test
            if let Ok((stream, _)) = listener.accept().await {
                let io = TokioIo::new(stream);
                let _ = http1::Builder::new()
                    .serve_connection(
                        io,
                        service_fn(move |_req: Request<hyper::body::Incoming>| {
                            let body = body.to_string();
                            async move {
                                let resp = Response::builder()
                                    .status(status)
                                    .header("x-test", "hello")
                                    .body(Full::new(Bytes::from(body)))
                                    .unwrap();
                                Ok::<_, hyper::Error>(resp)
                            }
                        }),
                    )
                    .await;
            }
        });

        (addr, handle)
    }

    #[tokio::test]
    async fn test_proxy_request_basic() {
        let (addr, _handle) = start_test_server(200, "ok").await;
        let origin = format!("http://{addr}");
        let client = make_client();

        let result = proxy_request(
            &client,
            &origin,
            "GET",
            "/test",
            &[],
            vec![],
            0,
            &HashMap::new(),
            "",
        )
        .await
        .unwrap();

        assert_eq!(result.status, 200);
        assert_eq!(result.body, b"ok");
        assert!(result
            .headers
            .iter()
            .any(|(k, v)| k == "x-test" && v == "hello"));
    }

    #[tokio::test]
    async fn test_proxy_request_with_overwrite_headers() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        let handle = tokio::spawn(async move {
            if let Ok((stream, _)) = listener.accept().await {
                let io = TokioIo::new(stream);
                let _ = http1::Builder::new()
                    .serve_connection(
                        io,
                        service_fn(|req: Request<hyper::body::Incoming>| async move {
                            let host = req
                                .headers()
                                .get("host")
                                .map(|v| v.to_str().unwrap_or("").to_string())
                                .unwrap_or_default();
                            let resp = Response::builder()
                                .status(200)
                                .body(Full::new(Bytes::from(host)))
                                .unwrap();
                            Ok::<_, hyper::Error>(resp)
                        }),
                    )
                    .await;
            }
        });

        let origin = format!("http://{addr}");
        let mut overwrite = HashMap::new();
        overwrite.insert(
            "host".to_string(),
            serde_json::Value::String("custom-host.example.com".to_string()),
        );

        let client = make_client();
        let result =
            proxy_request(&client, &origin, "GET", "/", &[], vec![], 0, &overwrite, "").await;

        // The request should succeed
        assert!(result.is_ok());
        drop(handle);
    }

    #[tokio::test]
    async fn test_proxy_request_connection_refused() {
        let client = make_client();
        let result = proxy_request(
            &client,
            "http://127.0.0.1:1",
            "GET",
            "/test",
            &[],
            vec![],
            0,
            &HashMap::new(),
            "",
        )
        .await;

        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_proxy_request_invalid_method() {
        let client = make_client();
        let result = proxy_request(
            &client,
            "http://127.0.0.1:1",
            "INVALID METHOD WITH SPACES",
            "/test",
            &[],
            vec![],
            0,
            &HashMap::new(),
            "",
        )
        .await;

        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_proxy_response_fields() {
        let (addr, _handle) = start_test_server(201, "created").await;
        let origin = format!("http://{addr}");
        let client = make_client();

        let result = proxy_request(
            &client,
            &origin,
            "POST",
            "/resource",
            &[],
            vec![],
            0,
            &HashMap::new(),
            "",
        )
        .await
        .unwrap();

        assert_eq!(result.status, 201);
        assert_eq!(result.body, b"created");
    }

    #[tokio::test]
    async fn test_proxy_request_with_proxy_url() {
        let (addr, _handle) = start_test_server(200, "proxied").await;
        let proxy_url = format!("http://{addr}");
        let client = make_client();

        let result = proxy_request(
            &client,
            "http://original-host.example.com",
            "GET",
            "/path",
            &[],
            vec![],
            0,
            &HashMap::new(),
            &proxy_url,
        )
        .await
        .unwrap();

        assert_eq!(result.status, 200);
        assert_eq!(result.body, b"proxied");
    }
}
