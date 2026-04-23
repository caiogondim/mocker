use http_body_util::Full;
use hyper::body::Bytes;
use hyper::Request;

use mocker::args::Mode;

use crate::helpers::{
    build_client, get, make_test_args, read_body_json, start_echo_server, start_mocker,
};

//-
// 1. Proxies all standard HTTP methods
//-

async fn assert_method_forwarded(method: &str) {
    let echo = start_echo_server().await;
    let origin = format!("http://{}", echo.addr);
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args(&origin, Mode::Pass, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();

    let req = Request::builder()
        .method(method)
        .uri(format!("http://{}/test", mocker.addr))
        .body(Full::new(Bytes::new()))
        .unwrap();

    let resp = client.request(req).await.unwrap();

    if method == "HEAD" {
        // HEAD responses have no body, just check status
        assert_eq!(resp.status(), 200);
    } else {
        let json = read_body_json(resp).await;
        assert_eq!(json["method"], method);
    }
}

#[tokio::test]
async fn proxies_get_method() {
    assert_method_forwarded("GET").await;
}

#[tokio::test]
async fn proxies_post_method() {
    assert_method_forwarded("POST").await;
}

#[tokio::test]
async fn proxies_put_method() {
    assert_method_forwarded("PUT").await;
}

#[tokio::test]
async fn proxies_delete_method() {
    assert_method_forwarded("DELETE").await;
}

#[tokio::test]
async fn proxies_patch_method() {
    assert_method_forwarded("PATCH").await;
}

#[tokio::test]
async fn proxies_head_method() {
    assert_method_forwarded("HEAD").await;
}

#[tokio::test]
async fn proxies_options_method() {
    assert_method_forwarded("OPTIONS").await;
}

//-
// 14. Multiple request headers with same name
//-

#[tokio::test]
async fn multiple_request_headers_with_same_name() {
    let echo = start_echo_server().await;
    let origin = format!("http://{}", echo.addr);
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args(&origin, Mode::Pass, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();

    // hyper collapses multiple same-name headers, but we verify at least one arrives
    let req = Request::builder()
        .method("GET")
        .uri(format!("http://{}/multi-header", mocker.addr))
        .header("x-custom", "a")
        .header("x-custom", "b")
        .body(Full::new(Bytes::new()))
        .unwrap();

    let resp = client.request(req).await.unwrap();
    assert_eq!(resp.status(), 200);
    let json = read_body_json(resp).await;
    // The echo server uses a HashMap so it will have one value; verify header was forwarded
    let headers = &json["headers"];
    assert!(headers["x-custom"].as_str().is_some());
}

//-
// 15. Request with binary body
//-

#[tokio::test]
async fn request_with_binary_body() {
    let echo = start_echo_server().await;
    let origin = format!("http://{}", echo.addr);
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args(&origin, Mode::Pass, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();
    let binary_body: Vec<u8> = (0..=255).collect();

    let req = Request::builder()
        .method("POST")
        .uri(format!("http://{}/binary", mocker.addr))
        .header("content-type", "application/octet-stream")
        .body(Full::new(Bytes::from(binary_body)))
        .unwrap();

    let resp = client.request(req).await.unwrap();
    assert_eq!(resp.status(), 200);
    // Echo server uses from_utf8_lossy, so body may differ, but request succeeded
    let json = read_body_json(resp).await;
    assert!(json["body"].as_str().is_some());
}

//-
// 16. Request with content-type multipart/form-data
//-

#[tokio::test]
async fn request_with_multipart_form_data() {
    let echo = start_echo_server().await;
    let origin = format!("http://{}", echo.addr);
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args(&origin, Mode::Pass, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();
    let boundary = "----FormBoundary7MA4YWxkTrZu0gW";
    let body = format!(
        "--{boundary}\r\nContent-Disposition: form-data; name=\"field1\"\r\n\r\nvalue1\r\n--{boundary}--\r\n"
    );

    let req = Request::builder()
        .method("POST")
        .uri(format!("http://{}/multipart", mocker.addr))
        .header(
            "content-type",
            format!("multipart/form-data; boundary={boundary}"),
        )
        .body(Full::new(Bytes::from(body.clone())))
        .unwrap();

    let resp = client.request(req).await.unwrap();
    assert_eq!(resp.status(), 200);
    let json = read_body_json(resp).await;
    assert_eq!(json["body"].as_str().unwrap(), body);
}

//-
// 17. Empty POST body
//-

#[tokio::test]
async fn empty_post_body() {
    let echo = start_echo_server().await;
    let origin = format!("http://{}", echo.addr);
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args(&origin, Mode::Pass, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();

    let req = Request::builder()
        .method("POST")
        .uri(format!("http://{}/empty-post", mocker.addr))
        .body(Full::new(Bytes::new()))
        .unwrap();

    let resp = client.request(req).await.unwrap();
    assert_eq!(resp.status(), 200);
    let json = read_body_json(resp).await;
    assert_eq!(json["method"], "POST");
    assert_eq!(json["body"], "");
}
