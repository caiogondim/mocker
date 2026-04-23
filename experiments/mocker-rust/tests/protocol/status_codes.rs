use http_body_util::Full;
use hyper::body::Bytes;
use hyper::Request;

use mocker::args::Mode;

use crate::helpers::{build_client, make_test_args, start_mocker, start_status_code_server};

//-
// 3. Preserves response status codes
//-

async fn assert_status_code_preserved(status: u16) {
    let echo = start_status_code_server().await;
    let origin = format!("http://{}", echo.addr);
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args(&origin, Mode::Pass, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();

    let req = Request::builder()
        .method("GET")
        .uri(format!("http://{}/test", mocker.addr))
        .header("response-status-code", status.to_string())
        .body(Full::new(Bytes::new()))
        .unwrap();

    let resp = client.request(req).await.unwrap();
    assert_eq!(resp.status().as_u16(), status);
}

#[tokio::test]
async fn preserves_status_code_201() {
    assert_status_code_preserved(201).await;
}

#[tokio::test]
async fn preserves_status_code_204() {
    assert_status_code_preserved(204).await;
}

#[tokio::test]
async fn preserves_status_code_301() {
    assert_status_code_preserved(301).await;
}

#[tokio::test]
async fn preserves_status_code_404() {
    assert_status_code_preserved(404).await;
}

#[tokio::test]
async fn preserves_status_code_500() {
    assert_status_code_preserved(500).await;
}

// ===========================================================================
// Status codes (comprehensive)
// ===========================================================================

#[tokio::test]
async fn preserves_status_code_200() {
    assert_status_code_preserved(200).await;
}

#[tokio::test]
async fn preserves_status_code_202() {
    assert_status_code_preserved(202).await;
}

#[tokio::test]
async fn preserves_status_code_301_with_location() {
    let echo = start_status_code_server().await;
    let origin = format!("http://{}", echo.addr);
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args(&origin, Mode::Pass, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();

    let req = Request::builder()
        .method("GET")
        .uri(format!("http://{}/redirect", mocker.addr))
        .header("response-status-code", "301")
        .header("response-header-location", "https://example.com/new")
        .body(Full::new(Bytes::new()))
        .unwrap();

    let resp = client.request(req).await.unwrap();
    assert_eq!(resp.status().as_u16(), 301);
    assert_eq!(
        resp.headers().get("location").unwrap().to_str().unwrap(),
        "https://example.com/new"
    );
}

#[tokio::test]
async fn preserves_status_code_302() {
    assert_status_code_preserved(302).await;
}

#[tokio::test]
async fn preserves_status_code_304() {
    assert_status_code_preserved(304).await;
}

#[tokio::test]
async fn preserves_status_code_400() {
    assert_status_code_preserved(400).await;
}

#[tokio::test]
async fn preserves_status_code_401_with_www_authenticate() {
    let echo = start_status_code_server().await;
    let origin = format!("http://{}", echo.addr);
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args(&origin, Mode::Pass, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();

    let req = Request::builder()
        .method("GET")
        .uri(format!("http://{}/auth", mocker.addr))
        .header("response-status-code", "401")
        .header("response-header-www-authenticate", "Bearer realm=\"api\"")
        .body(Full::new(Bytes::new()))
        .unwrap();

    let resp = client.request(req).await.unwrap();
    assert_eq!(resp.status().as_u16(), 401);
    assert_eq!(
        resp.headers()
            .get("www-authenticate")
            .unwrap()
            .to_str()
            .unwrap(),
        "Bearer realm=\"api\""
    );
}

#[tokio::test]
async fn preserves_status_code_403() {
    assert_status_code_preserved(403).await;
}

#[tokio::test]
async fn preserves_status_code_405() {
    assert_status_code_preserved(405).await;
}

#[tokio::test]
async fn preserves_status_code_409() {
    assert_status_code_preserved(409).await;
}

#[tokio::test]
async fn preserves_status_code_429_with_retry_after() {
    let echo = start_status_code_server().await;
    let origin = format!("http://{}", echo.addr);
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args(&origin, Mode::Pass, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();

    let req = Request::builder()
        .method("GET")
        .uri(format!("http://{}/rate-limited", mocker.addr))
        .header("response-status-code", "429")
        .header("response-header-retry-after", "120")
        .body(Full::new(Bytes::new()))
        .unwrap();

    let resp = client.request(req).await.unwrap();
    assert_eq!(resp.status().as_u16(), 429);
    assert_eq!(
        resp.headers().get("retry-after").unwrap().to_str().unwrap(),
        "120"
    );
}

#[tokio::test]
async fn preserves_status_code_502() {
    assert_status_code_preserved(502).await;
}

#[tokio::test]
async fn preserves_status_code_503() {
    assert_status_code_preserved(503).await;
}
