use http_body_util::Full;
use hyper::body::Bytes;
use hyper::Request;

use mocker::args::Mode;

use crate::helpers::{
    build_client, get, make_test_args, start_echo_server, start_mocker, start_status_code_server,
};

//-
// 4. Preserves response headers
//-

#[tokio::test]
async fn preserves_response_headers() {
    let echo = start_status_code_server().await;
    let origin = format!("http://{}", echo.addr);
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args(&origin, Mode::Pass, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();

    let req = Request::builder()
        .method("GET")
        .uri(format!("http://{}/test", mocker.addr))
        .header("response-header-x-custom-header", "custom-value")
        .header("response-header-x-another", "another-value")
        .body(Full::new(Bytes::new()))
        .unwrap();

    let resp = client.request(req).await.unwrap();

    assert_eq!(
        resp.headers()
            .get("x-custom-header")
            .unwrap()
            .to_str()
            .unwrap(),
        "custom-value"
    );
    assert_eq!(
        resp.headers().get("x-another").unwrap().to_str().unwrap(),
        "another-value"
    );
}

//-
// 5. Adds x-powered-by header
//-

#[tokio::test]
async fn adds_x_powered_by_header() {
    let echo = start_echo_server().await;
    let origin = format!("http://{}", echo.addr);
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args(&origin, Mode::Pass, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();
    let resp = get(&client, &format!("http://{}/test", mocker.addr)).await;

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
// 6. Adds x-mocker-request-id header
//-

#[tokio::test]
async fn adds_x_mocker_request_id_header() {
    let echo = start_echo_server().await;
    let origin = format!("http://{}", echo.addr);
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args(&origin, Mode::Pass, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();
    let resp = get(&client, &format!("http://{}/test", mocker.addr)).await;

    let request_id = resp
        .headers()
        .get("x-mocker-request-id")
        .expect("x-mocker-request-id header missing");
    let id_str = request_id.to_str().unwrap();
    assert!(!id_str.is_empty());
}

//-
// 7. Adds x-mocker-response-from: Origin when proxying
//-

#[tokio::test]
async fn adds_x_mocker_response_from_origin() {
    let echo = start_echo_server().await;
    let origin = format!("http://{}", echo.addr);
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args(&origin, Mode::Pass, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();
    let resp = get(&client, &format!("http://{}/test", mocker.addr)).await;

    assert_eq!(
        resp.headers()
            .get("x-mocker-response-from")
            .unwrap()
            .to_str()
            .unwrap(),
        "Origin"
    );
}

//-
// 11. Health check endpoints
//-

#[tokio::test]
async fn health_check_live() {
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args("http://localhost:1", Mode::Pass, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();
    let resp = get(&client, &format!("http://{}/.well-known/live", mocker.addr)).await;

    assert_eq!(resp.status(), 200);
}

#[tokio::test]
async fn health_check_ready() {
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args("http://localhost:1", Mode::Pass, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();
    let resp = get(
        &client,
        &format!("http://{}/.well-known/ready", mocker.addr),
    )
    .await;

    assert_eq!(resp.status(), 200);
}
