use http_body_util::Full;
use hyper::body::Bytes;
use hyper::Request;

use mocker::args::Mode;

use crate::helpers::{
    build_client, get, make_test_args, read_body, read_body_json, start_echo_server, start_mocker,
};

//-
// 9. Mock file format
//-

#[tokio::test]
async fn mock_file_has_correct_format() {
    let echo = start_echo_server().await;
    let origin = format!("http://{}", echo.addr);
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args(&origin, Mode::Write, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();

    let req = Request::builder()
        .method("POST")
        .uri(format!("http://{}/format-test", mocker.addr))
        .header("content-type", "text/plain")
        .body(Full::new(Bytes::from("test body")))
        .unwrap();

    let resp = client.request(req).await.unwrap();
    assert_eq!(resp.status(), 200);
    let _ = read_body(resp).await;

    // Wait for file write
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;

    // Find the mock file
    let mut entries = tokio::fs::read_dir(tmp.path()).await.unwrap();
    let mut mock_path = None;
    while let Some(entry) = entries.next_entry().await.unwrap() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("json") {
            mock_path = Some(path);
            break;
        }
    }

    let mock_path = mock_path.expect("Mock file should exist");
    let data = tokio::fs::read(&mock_path).await.unwrap();
    let mock_json: serde_json::Value = serde_json::from_slice(&data).unwrap();

    // Verify structure: request and response fields
    assert!(
        mock_json.get("request").is_some(),
        "Missing 'request' field"
    );
    assert!(
        mock_json.get("response").is_some(),
        "Missing 'response' field"
    );

    let request = &mock_json["request"];
    assert_eq!(request["method"], "POST");
    assert_eq!(request["url"], "/format-test");
    assert!(request.get("headers").is_some());
    assert!(request.get("body").is_some());

    let response = &mock_json["response"];
    assert!(response.get("statusCode").is_some());
    assert!(response.get("headers").is_some());
    assert!(response.get("body").is_some());
    assert_eq!(response["statusCode"], 200);
}

// ===========================================================================
// Mock persistence
// ===========================================================================

//-
// Mock file survives process restart — file on disk is valid JSON
//-

#[tokio::test]
async fn mock_file_is_valid_json_on_disk() {
    let echo = start_echo_server().await;
    let origin = format!("http://{}", echo.addr);
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args(&origin, Mode::Write, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();
    let resp = get(&client, &format!("http://{}/persist-test", mocker.addr)).await;
    assert_eq!(resp.status(), 200);
    let _ = read_body(resp).await;

    tokio::time::sleep(std::time::Duration::from_millis(100)).await;

    // Find the mock file and verify it's valid JSON
    let mock_path = find_mock_file(tmp.path()).await;
    let data = tokio::fs::read(&mock_path).await.unwrap();
    let parsed: serde_json::Value = serde_json::from_slice(&data).unwrap();
    assert!(parsed.is_object());
}

//-
// Mock contains request method
//-

#[tokio::test]
async fn mock_contains_request_method() {
    let echo = start_echo_server().await;
    let origin = format!("http://{}", echo.addr);
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args(&origin, Mode::Write, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();

    let req = Request::builder()
        .method("POST")
        .uri(format!("http://{}/method-check", mocker.addr))
        .body(Full::new(Bytes::from("body")))
        .unwrap();

    let resp = client.request(req).await.unwrap();
    let _ = read_body(resp).await;
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;

    let mock_json = read_mock_file(tmp.path()).await;
    assert_eq!(mock_json["request"]["method"], "POST");
}

//-
// Mock contains request URL
//-

#[tokio::test]
async fn mock_contains_request_url() {
    let echo = start_echo_server().await;
    let origin = format!("http://{}", echo.addr);
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args(&origin, Mode::Write, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();
    let resp = get(&client, &format!("http://{}/url-check", mocker.addr)).await;
    let _ = read_body(resp).await;
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;

    let mock_json = read_mock_file(tmp.path()).await;
    assert_eq!(mock_json["request"]["url"], "/url-check");
}

//-
// Mock contains request headers
//-

#[tokio::test]
async fn mock_contains_request_headers() {
    let echo = start_echo_server().await;
    let origin = format!("http://{}", echo.addr);
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args(&origin, Mode::Write, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();

    let req = Request::builder()
        .method("GET")
        .uri(format!("http://{}/headers-check", mocker.addr))
        .header("x-test-header", "test-value")
        .body(Full::new(Bytes::new()))
        .unwrap();

    let resp = client.request(req).await.unwrap();
    let _ = read_body(resp).await;
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;

    let mock_json = read_mock_file(tmp.path()).await;
    assert!(mock_json["request"]["headers"].is_object());
}

//-
// Mock contains response statusCode
//-

#[tokio::test]
async fn mock_contains_response_status_code() {
    let echo = start_echo_server().await;
    let origin = format!("http://{}", echo.addr);
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args(&origin, Mode::Write, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();
    let resp = get(&client, &format!("http://{}/sc-check", mocker.addr)).await;
    let _ = read_body(resp).await;
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;

    let mock_json = read_mock_file(tmp.path()).await;
    assert_eq!(mock_json["response"]["statusCode"], 200);
}

//-
// Mock contains response headers
//-

#[tokio::test]
async fn mock_contains_response_headers() {
    let echo = start_echo_server().await;
    let origin = format!("http://{}", echo.addr);
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args(&origin, Mode::Write, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();
    let resp = get(&client, &format!("http://{}/rh-check", mocker.addr)).await;
    let _ = read_body(resp).await;
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;

    let mock_json = read_mock_file(tmp.path()).await;
    assert!(mock_json["response"]["headers"].is_object());
}

//-
// Mock contains response body
//-

#[tokio::test]
async fn mock_contains_response_body() {
    let echo = start_echo_server().await;
    let origin = format!("http://{}", echo.addr);
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args(&origin, Mode::Write, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();
    let resp = get(&client, &format!("http://{}/rb-check", mocker.addr)).await;
    let _ = read_body(resp).await;
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;

    let mock_json = read_mock_file(tmp.path()).await;
    assert!(mock_json["response"].get("body").is_some());
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
