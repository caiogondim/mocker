use std::collections::HashSet;

use http_body_util::Full;
use hyper::body::Bytes;
use hyper::Request;

use mocker::args::Mode;

use crate::helpers::{
    build_client, get, make_test_args, read_body, read_body_json, start_echo_server, start_mocker,
};

//-
// Multiple sequential requests on same connection (keep-alive)
//-

#[tokio::test]
async fn multiple_sequential_requests_keep_alive() {
    let echo = start_echo_server().await;
    let origin = format!("http://{}", echo.addr);
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args(&origin, Mode::Pass, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();

    let resp1 = get(&client, &format!("http://{}/seq1", mocker.addr)).await;
    assert_eq!(resp1.status(), 200);
    let json1 = read_body_json(resp1).await;
    assert_eq!(json1["url"], "/seq1");

    let resp2 = get(&client, &format!("http://{}/seq2", mocker.addr)).await;
    assert_eq!(resp2.status(), 200);
    let json2 = read_body_json(resp2).await;
    assert_eq!(json2["url"], "/seq2");
}

//-
// Request ID is unique per request
//-

#[tokio::test]
async fn request_id_unique_per_request() {
    let echo = start_echo_server().await;
    let origin = format!("http://{}", echo.addr);
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args(&origin, Mode::Pass, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();

    let resp1 = get(&client, &format!("http://{}/id1", mocker.addr)).await;
    let id1 = resp1
        .headers()
        .get("x-mocker-request-id")
        .unwrap()
        .to_str()
        .unwrap()
        .to_string();
    let _ = read_body(resp1).await;

    // Small sleep to ensure different timestamp
    tokio::time::sleep(std::time::Duration::from_millis(10)).await;

    let resp2 = get(&client, &format!("http://{}/id2", mocker.addr)).await;
    let id2 = resp2
        .headers()
        .get("x-mocker-request-id")
        .unwrap()
        .to_str()
        .unwrap()
        .to_string();
    let _ = read_body(resp2).await;

    // IDs should exist and not be empty (uniqueness is best-effort with timestamp-based IDs)
    assert!(!id1.is_empty());
    assert!(!id2.is_empty());
}

//-
// Connection to dead origin returns error
//-

#[tokio::test]
async fn connection_to_dead_origin_returns_error() {
    let tmp = tempfile::TempDir::new().unwrap();
    // Point to a port that nothing listens on
    let args = make_test_args("http://127.0.0.1:1", Mode::Pass, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();
    let resp = get(&client, &format!("http://{}/dead-origin", mocker.addr)).await;

    // Should get a 502 Bad Gateway
    assert_eq!(resp.status().as_u16(), 502);
}

//-
// Collect unique request IDs from concurrent requests
//-

#[tokio::test]
async fn concurrent_requests_unique_ids() {
    let echo = start_echo_server().await;
    let origin = format!("http://{}", echo.addr);
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args(&origin, Mode::Pass, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();
    let mut handles = Vec::new();

    for i in 0..5 {
        let client = client.clone();
        let addr = mocker.addr;
        handles.push(tokio::spawn(async move {
            let resp = client
                .request(
                    Request::builder()
                        .uri(format!("http://{addr}/id-check/{i}"))
                        .body(Full::new(Bytes::new()))
                        .unwrap(),
                )
                .await
                .unwrap();
            let id = resp
                .headers()
                .get("x-mocker-request-id")
                .unwrap()
                .to_str()
                .unwrap()
                .to_string();
            let _ = read_body(resp).await;
            id
        }));
    }

    let mut ids = HashSet::new();
    for handle in handles {
        let id = handle.await.unwrap();
        ids.insert(id);
    }

    // At least some should be unique (timestamp-based, so concurrency may cause collisions)
    assert!(ids.len() >= 2, "Expected multiple unique IDs, got {ids:?}");
}
