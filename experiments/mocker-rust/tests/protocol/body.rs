use http_body_util::Full;
use hyper::body::Bytes;
use hyper::Request;

use mocker::args::Mode;

use crate::helpers::{
    build_client, get, make_test_args, read_body, read_body_json, start_echo_server, start_mocker,
    start_status_code_server,
};

//-
// 2. Preserves request body
//-

#[tokio::test]
async fn preserves_request_body() {
    let echo = start_echo_server().await;
    let origin = format!("http://{}", echo.addr);
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args(&origin, Mode::Pass, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();
    let body_content = "hello world request body";

    let req = Request::builder()
        .method("POST")
        .uri(format!("http://{}/test", mocker.addr))
        .body(Full::new(Bytes::from(body_content)))
        .unwrap();

    let resp = client.request(req).await.unwrap();
    let json = read_body_json(resp).await;

    assert_eq!(json["body"], body_content);
}

//-
// 8. Handles empty response body (204)
//-

#[tokio::test]
async fn handles_empty_response_body() {
    let echo = start_status_code_server().await;
    let origin = format!("http://{}", echo.addr);
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args(&origin, Mode::Pass, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();

    let req = Request::builder()
        .method("GET")
        .uri(format!("http://{}/test", mocker.addr))
        .header("response-status-code", "204")
        .body(Full::new(Bytes::new()))
        .unwrap();

    let resp = client.request(req).await.unwrap();
    assert_eq!(resp.status().as_u16(), 204);

    let body = read_body(resp).await;
    assert!(body.is_empty());
}

//-
// 9. Handles large response body (1MB)
//-

#[tokio::test]
async fn handles_large_response_body() {
    // Use echo server: the response body will contain the JSON-encoded echo,
    // including the 1MB request body, so the response is at least 1MB.
    let echo = start_echo_server().await;
    let origin = format!("http://{}", echo.addr);
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args(&origin, Mode::Pass, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();
    let large_body = "x".repeat(1_000_000);

    let req = Request::builder()
        .method("POST")
        .uri(format!("http://{}/test", mocker.addr))
        .body(Full::new(Bytes::from(large_body.clone())))
        .unwrap();

    let resp = client.request(req).await.unwrap();
    assert_eq!(resp.status(), 200);

    let json = read_body_json(resp).await;
    assert_eq!(json["body"].as_str().unwrap().len(), 1_000_000);
}

//-
// 10. Handles JSON response body
//-

#[tokio::test]
async fn handles_json_response_body() {
    let echo = start_echo_server().await;
    let origin = format!("http://{}", echo.addr);
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args(&origin, Mode::Pass, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();
    let resp = get(&client, &format!("http://{}/test", mocker.addr)).await;

    // Echo server always returns application/json content-type
    assert!(resp
        .headers()
        .get("content-type")
        .unwrap()
        .to_str()
        .unwrap()
        .contains("application/json"));

    // Body should parse as JSON
    let json = read_body_json(resp).await;
    assert!(json.is_object());
}

//-
// 18. Response with content-type text/plain
//-

#[tokio::test]
async fn response_with_content_type_text_plain() {
    let echo = start_status_code_server().await;
    let origin = format!("http://{}", echo.addr);
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args(&origin, Mode::Pass, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();

    let req = Request::builder()
        .method("GET")
        .uri(format!("http://{}/text", mocker.addr))
        .header("response-header-content-type", "text/plain")
        .body(Full::new(Bytes::new()))
        .unwrap();

    let resp = client.request(req).await.unwrap();
    assert_eq!(resp.status(), 200);
    assert!(resp
        .headers()
        .get("content-type")
        .unwrap()
        .to_str()
        .unwrap()
        .contains("text/plain"));

    let body = read_body(resp).await;
    assert_eq!(body, b"OK");
}

//-
// 19. Response with content-type application/octet-stream
//-

#[tokio::test]
async fn response_with_content_type_octet_stream() {
    let echo = start_status_code_server().await;
    let origin = format!("http://{}", echo.addr);
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args(&origin, Mode::Pass, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();

    let req = Request::builder()
        .method("GET")
        .uri(format!("http://{}/binary-resp", mocker.addr))
        .header("response-header-content-type", "application/octet-stream")
        .body(Full::new(Bytes::new()))
        .unwrap();

    let resp = client.request(req).await.unwrap();
    assert_eq!(resp.status(), 200);
    assert!(resp
        .headers()
        .get("content-type")
        .unwrap()
        .to_str()
        .unwrap()
        .contains("application/octet-stream"));
}

//-
// 20. Response with no content-type
//-

#[tokio::test]
async fn response_with_no_content_type() {
    let echo = start_status_code_server().await;
    let origin = format!("http://{}", echo.addr);
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args(&origin, Mode::Pass, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();

    // status code server doesn't set content-type unless told to
    let req = Request::builder()
        .method("GET")
        .uri(format!("http://{}/no-ct", mocker.addr))
        .body(Full::new(Bytes::new()))
        .unwrap();

    let resp = client.request(req).await.unwrap();
    assert_eq!(resp.status(), 200);
    let body = read_body(resp).await;
    assert_eq!(body, b"OK");
}

// ===========================================================================
// Body integrity
// ===========================================================================

//-
// 10KB body roundtrip
//-

#[tokio::test]
async fn body_10kb_roundtrip() {
    let echo = start_echo_server().await;
    let origin = format!("http://{}", echo.addr);
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args(&origin, Mode::Pass, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();
    let body_content = "x".repeat(10_000);

    let req = Request::builder()
        .method("POST")
        .uri(format!("http://{}/10kb", mocker.addr))
        .body(Full::new(Bytes::from(body_content.clone())))
        .unwrap();

    let resp = client.request(req).await.unwrap();
    let json = read_body_json(resp).await;
    assert_eq!(json["body"].as_str().unwrap().len(), 10_000);
}

//-
// 100KB body roundtrip
//-

#[tokio::test]
async fn body_100kb_roundtrip() {
    let echo = start_echo_server().await;
    let origin = format!("http://{}", echo.addr);
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args(&origin, Mode::Pass, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();
    let body_content = "y".repeat(100_000);

    let req = Request::builder()
        .method("POST")
        .uri(format!("http://{}/100kb", mocker.addr))
        .body(Full::new(Bytes::from(body_content.clone())))
        .unwrap();

    let resp = client.request(req).await.unwrap();
    let json = read_body_json(resp).await;
    assert_eq!(json["body"].as_str().unwrap().len(), 100_000);
}

//-
// JSON body with unicode
//-

#[tokio::test]
async fn json_body_with_unicode() {
    let echo = start_echo_server().await;
    let origin = format!("http://{}", echo.addr);
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args(&origin, Mode::Pass, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();
    let body_content = r#"{"emoji":"🥸"}"#;

    let req = Request::builder()
        .method("POST")
        .uri(format!("http://{}/unicode", mocker.addr))
        .header("content-type", "application/json")
        .body(Full::new(Bytes::from(body_content)))
        .unwrap();

    let resp = client.request(req).await.unwrap();
    let json = read_body_json(resp).await;
    assert!(json["body"].as_str().unwrap().contains("🥸"));
}

//-
// JSON body with special chars (HTML)
//-

#[tokio::test]
async fn json_body_with_special_chars() {
    let echo = start_echo_server().await;
    let origin = format!("http://{}", echo.addr);
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args(&origin, Mode::Pass, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();
    let body_content = r#"{"html":"<script>alert(1)</script>"}"#;

    let req = Request::builder()
        .method("POST")
        .uri(format!("http://{}/special", mocker.addr))
        .header("content-type", "application/json")
        .body(Full::new(Bytes::from(body_content)))
        .unwrap();

    let resp = client.request(req).await.unwrap();
    let json = read_body_json(resp).await;
    assert!(json["body"]
        .as_str()
        .unwrap()
        .contains("<script>alert(1)</script>"));
}

//-
// JSON array body
//-

#[tokio::test]
async fn json_array_body() {
    let echo = start_echo_server().await;
    let origin = format!("http://{}", echo.addr);
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args(&origin, Mode::Pass, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();
    let body_content = "[1,2,3]";

    let req = Request::builder()
        .method("POST")
        .uri(format!("http://{}/array", mocker.addr))
        .header("content-type", "application/json")
        .body(Full::new(Bytes::from(body_content)))
        .unwrap();

    let resp = client.request(req).await.unwrap();
    let json = read_body_json(resp).await;
    assert_eq!(json["body"], "[1,2,3]");
}

//-
// Response with chunked transfer-encoding — verify complete body received
//-

#[tokio::test]
async fn response_chunked_transfer_complete_body() {
    // The echo server already uses hyper which sends chunked by default.
    // Verify the full body is received through the proxy.
    let echo = start_echo_server().await;
    let origin = format!("http://{}", echo.addr);
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args(&origin, Mode::Pass, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();
    let resp = get(&client, &format!("http://{}/chunked-test", mocker.addr)).await;
    assert_eq!(resp.status(), 200);
    let json = read_body_json(resp).await;
    assert!(json.is_object());
    assert_eq!(json["url"], "/chunked-test");
}
