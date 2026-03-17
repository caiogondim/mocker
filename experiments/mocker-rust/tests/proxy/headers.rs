use std::collections::HashMap;

use http_body_util::Full;
use hyper::body::Bytes;
use hyper::Request;

use mocker::args::Mode;

use crate::helpers::{
    build_client, get, make_test_args, make_test_args_with_overwrite_response_headers, read_body,
    read_body_json, start_echo_server, start_mocker,
};

//-
// 11. Request with custom headers forwarded to origin
//-

#[tokio::test]
async fn custom_headers_forwarded_to_origin() {
    let echo = start_echo_server().await;
    let origin = format!("http://{}", echo.addr);
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args(&origin, Mode::Pass, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();

    let req = Request::builder()
        .method("GET")
        .uri(format!("http://{}/headers-test", mocker.addr))
        .header("x-custom-request-header", "test-value-123")
        .header("authorization", "Bearer token-abc")
        .body(Full::new(Bytes::new()))
        .unwrap();

    let resp = client.request(req).await.unwrap();
    let json = read_body_json(resp).await;

    let headers = &json["headers"];
    assert_eq!(headers["x-custom-request-header"], "test-value-123");
    assert_eq!(headers["authorization"], "Bearer token-abc");
}

//-
// 12. Response header overwriting
//-

#[tokio::test]
async fn overwrite_response_headers_applies() {
    let echo = start_echo_server().await;
    let origin = format!("http://{}", echo.addr);
    let tmp = tempfile::TempDir::new().unwrap();

    let mut overwrite = HashMap::new();
    overwrite.insert(
        "x-injected-header".to_string(),
        serde_json::Value::String("injected-value".to_string()),
    );

    let args =
        make_test_args_with_overwrite_response_headers(&origin, Mode::Pass, tmp.path(), overwrite);
    let mocker = start_mocker(args).await;

    let client = build_client();
    let resp = get(&client, &format!("http://{}/overwrite-test", mocker.addr)).await;

    assert_eq!(
        resp.headers()
            .get("x-injected-header")
            .unwrap()
            .to_str()
            .unwrap(),
        "injected-value"
    );
}

// ===========================================================================
// Header behavior
// ===========================================================================

//-
// Content-length removed from mock
//-

#[tokio::test]
async fn content_length_removed_from_mock() {
    let echo = start_echo_server().await;
    let origin = format!("http://{}", echo.addr);
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args(&origin, Mode::Write, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();
    let resp = get(&client, &format!("http://{}/cl-check", mocker.addr)).await;
    let _ = read_body(resp).await;
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;

    let mock_json = read_mock_file(tmp.path()).await;
    // content-length should be stripped from mock response headers
    assert!(
        mock_json["response"]["headers"]
            .get("content-length")
            .is_none(),
        "content-length should not be in mock response headers"
    );
}

//-
// Content-encoding removed from mock
//-

#[tokio::test]
async fn content_encoding_removed_from_mock() {
    let echo = start_echo_server().await;
    let origin = format!("http://{}", echo.addr);
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args(&origin, Mode::Write, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();
    let resp = get(&client, &format!("http://{}/ce-check", mocker.addr)).await;
    let _ = read_body(resp).await;
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;

    let mock_json = read_mock_file(tmp.path()).await;
    assert!(
        mock_json["response"]["headers"]
            .get("content-encoding")
            .is_none(),
        "content-encoding should not be in mock response headers"
    );
}

//-
// x-powered-by on every response (including 404 and health checks)
//-

#[tokio::test]
async fn x_powered_by_on_404() {
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args("http://localhost:1", Mode::Read, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();
    let resp = get(&client, &format!("http://{}/nonexistent", mocker.addr)).await;
    assert_eq!(resp.status(), 404);
    assert_eq!(
        resp.headers()
            .get("x-powered-by")
            .unwrap()
            .to_str()
            .unwrap(),
        "mocker"
    );
}

#[tokio::test]
async fn x_powered_by_on_health_check() {
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args("http://localhost:1", Mode::Pass, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();
    let resp = get(&client, &format!("http://{}/.well-known/live", mocker.addr)).await;
    assert_eq!(resp.status(), 200);
    assert_eq!(
        resp.headers()
            .get("x-powered-by")
            .unwrap()
            .to_str()
            .unwrap(),
        "mocker"
    );
}

//-
// Overwrite response headers
//-

#[tokio::test]
async fn overwrite_response_headers_overrides_origin() {
    let echo = start_echo_server().await;
    let origin = format!("http://{}", echo.addr);
    let tmp = tempfile::TempDir::new().unwrap();

    let mut overwrite = HashMap::new();
    overwrite.insert(
        "x-custom-override".to_string(),
        serde_json::Value::String("override-value".to_string()),
    );

    let args =
        make_test_args_with_overwrite_response_headers(&origin, Mode::Pass, tmp.path(), overwrite);
    let mocker = start_mocker(args).await;

    let client = build_client();
    let resp = get(&client, &format!("http://{}/override", mocker.addr)).await;

    assert_eq!(
        resp.headers()
            .get("x-custom-override")
            .unwrap()
            .to_str()
            .unwrap(),
        "override-value"
    );
}

//-
// Overwrite response headers: null produces "null" string
//-

#[tokio::test]
async fn overwrite_response_headers_null_value() {
    let echo = start_echo_server().await;
    let origin = format!("http://{}", echo.addr);
    let tmp = tempfile::TempDir::new().unwrap();

    let mut overwrite = HashMap::new();
    overwrite.insert("x-null-header".to_string(), serde_json::Value::Null);

    let args =
        make_test_args_with_overwrite_response_headers(&origin, Mode::Pass, tmp.path(), overwrite);
    let mocker = start_mocker(args).await;

    let client = build_client();
    let resp = get(&client, &format!("http://{}/null-header", mocker.addr)).await;

    // With current implementation, null becomes the string "null"
    let header_val = resp.headers().get("x-null-header");
    assert!(header_val.is_some());
    assert_eq!(header_val.unwrap().to_str().unwrap(), "null");
}

//-
// Helper
//-

async fn find_mock_file(dir: &std::path::Path) -> std::path::PathBuf {
    let mut entries = tokio::fs::read_dir(dir).await.unwrap();
    while let Some(entry) = entries.next_entry().await.unwrap() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("json") {
            return path;
        }
    }
    panic!("No mock file found in {:?}", dir);
}

async fn read_mock_file(dir: &std::path::Path) -> serde_json::Value {
    let path = find_mock_file(dir).await;
    let data = tokio::fs::read(&path).await.unwrap();
    serde_json::from_slice(&data).unwrap()
}
