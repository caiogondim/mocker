use http_body_util::Full;
use hyper::body::Bytes;
use hyper::Request;

use mocker::args::Mode;

use crate::helpers::{
    build_client, make_test_args, read_body_json, start_echo_server, start_mocker,
};

//-
// 10. Concurrent requests
//-

#[tokio::test]
async fn concurrent_requests_all_succeed() {
    let echo = start_echo_server().await;
    let origin = format!("http://{}", echo.addr);
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args(&origin, Mode::Pass, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();
    let mut handles = Vec::new();

    for i in 0..10 {
        let client = client.clone();
        let addr = mocker.addr;
        handles.push(tokio::spawn(async move {
            let resp = client
                .request(
                    Request::builder()
                        .uri(format!("http://{addr}/concurrent/{i}"))
                        .body(Full::new(Bytes::new()))
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(resp.status(), 200);
            resp.status().as_u16()
        }));
    }

    for handle in handles {
        let status = handle.await.unwrap();
        assert_eq!(status, 200);
    }
}

// ===========================================================================
// Concurrent behavior
// ===========================================================================

//-
// 20 concurrent requests to same endpoint
//-

#[tokio::test]
async fn twenty_concurrent_requests_same_endpoint() {
    let echo = start_echo_server().await;
    let origin = format!("http://{}", echo.addr);
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args(&origin, Mode::Pass, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();
    let mut handles = Vec::new();

    for _ in 0..20 {
        let client = client.clone();
        let addr = mocker.addr;
        handles.push(tokio::spawn(async move {
            let resp = client
                .request(
                    Request::builder()
                        .uri(format!("http://{addr}/same-endpoint"))
                        .body(Full::new(Bytes::new()))
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(resp.status(), 200);
        }));
    }

    for handle in handles {
        handle.await.unwrap();
    }
}

//-
// Concurrent requests to different endpoints
//-

#[tokio::test]
async fn concurrent_requests_different_endpoints() {
    let echo = start_echo_server().await;
    let origin = format!("http://{}", echo.addr);
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args(&origin, Mode::Pass, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();

    let client_a = client.clone();
    let addr_a = mocker.addr;
    let handle_a = tokio::spawn(async move {
        let resp = client_a
            .request(
                Request::builder()
                    .uri(format!("http://{addr_a}/endpoint-a"))
                    .body(Full::new(Bytes::new()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), 200);
        let json = read_body_json(resp).await;
        assert_eq!(json["url"], "/endpoint-a");
    });

    let client_b = client.clone();
    let addr_b = mocker.addr;
    let handle_b = tokio::spawn(async move {
        let resp = client_b
            .request(
                Request::builder()
                    .uri(format!("http://{addr_b}/endpoint-b"))
                    .body(Full::new(Bytes::new()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), 200);
        let json = read_body_json(resp).await;
        assert_eq!(json["url"], "/endpoint-b");
    });

    handle_a.await.unwrap();
    handle_b.await.unwrap();
}
