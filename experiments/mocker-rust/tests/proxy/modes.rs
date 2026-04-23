use std::collections::HashMap;

use http_body_util::Full;
use hyper::body::Bytes;
use hyper::Request;

use mocker::args::Mode;
use mocker::mock::manager::MockManager;

use crate::helpers::{
    build_client, get, make_test_args, read_body, read_body_json, start_echo_server, start_mocker,
    start_status_code_server,
};

fn to_json_headers(pairs: &[(&str, &str)]) -> HashMap<String, serde_json::Value> {
    pairs
        .iter()
        .map(|(k, v)| (k.to_string(), serde_json::Value::String(v.to_string())))
        .collect()
}

//-
// 1. Pass mode: pure proxy
//-

#[tokio::test]
async fn pass_mode_proxies_to_origin() {
    let echo = start_echo_server().await;
    let origin = format!("http://{}", echo.addr);
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args(&origin, Mode::Pass, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();
    let resp = get(&client, &format!("http://{}/hello", mocker.addr)).await;

    assert_eq!(resp.status(), 200);
    let json = read_body_json(resp).await;
    assert_eq!(json["method"], "GET");
    assert_eq!(json["url"], "/hello");
}

//-
// 2. Read mode: serves from mock
//-

#[tokio::test]
async fn read_mode_serves_from_mock() {
    let tmp = tempfile::TempDir::new().unwrap();

    // Pre-create a mock using MockManager
    let mock_manager = MockManager::new(
        tmp.path().to_path_buf(),
        {
            let mut s = std::collections::HashSet::new();
            s.insert("method".to_string());
            s.insert("url".to_string());
            s
        },
        HashMap::new(),
    );

    let req_headers = to_json_headers(&[("content-type", "application/json")]);
    let resp_headers = to_json_headers(&[("content-type", "application/json")]);

    mock_manager
        .set(
            "GET",
            "/mocked-endpoint",
            &req_headers,
            b"",
            200,
            &resp_headers,
            br#"{"mocked":true}"#,
            "",
        )
        .await
        .unwrap();

    // Start mocker in read mode (origin doesn't matter since we have a mock)
    let args = make_test_args("http://localhost:1", Mode::Read, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();

    let req = Request::builder()
        .method("GET")
        .uri(format!("http://{}/mocked-endpoint", mocker.addr))
        .header("content-type", "application/json")
        .body(Full::new(Bytes::new()))
        .unwrap();

    let resp = client.request(req).await.unwrap();
    assert_eq!(resp.status(), 200);

    let json = read_body_json(resp).await;
    assert_eq!(json["mocked"], true);
}

//-
// 3. Read mode: 404 when no mock
//-

#[tokio::test]
async fn read_mode_returns_404_when_no_mock() {
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args("http://localhost:1", Mode::Read, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();
    let resp = get(&client, &format!("http://{}/nonexistent", mocker.addr)).await;

    assert_eq!(resp.status(), 404);
}

//-
// 4. Write mode: saves mock to disk
//-

#[tokio::test]
async fn write_mode_saves_mock_to_disk() {
    let echo = start_echo_server().await;
    let origin = format!("http://{}", echo.addr);
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args(&origin, Mode::Write, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();
    let resp = get(&client, &format!("http://{}/write-test", mocker.addr)).await;
    assert_eq!(resp.status(), 200);

    // Consume the response body so the connection is released
    let _ = read_body(resp).await;

    // Give a moment for the file to be written
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;

    // Check that a .json mock file was created in the temp dir
    let mut entries = tokio::fs::read_dir(tmp.path()).await.unwrap();
    let mut json_files = Vec::new();
    while let Some(entry) = entries.next_entry().await.unwrap() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("json") {
            json_files.push(path);
        }
    }

    assert!(
        !json_files.is_empty(),
        "Expected at least one .json mock file in {:?}",
        tmp.path()
    );
}

//-
// 5. Read-write mode: reads mock if exists
//-

#[tokio::test]
async fn read_write_mode_reads_mock_if_exists() {
    let tmp = tempfile::TempDir::new().unwrap();

    // Pre-create a mock
    let mock_manager = MockManager::new(
        tmp.path().to_path_buf(),
        {
            let mut s = std::collections::HashSet::new();
            s.insert("method".to_string());
            s.insert("url".to_string());
            s
        },
        HashMap::new(),
    );

    let req_headers = to_json_headers(&[("content-type", "text/plain")]);
    let resp_headers = to_json_headers(&[("content-type", "application/json")]);

    mock_manager
        .set(
            "GET",
            "/cached",
            &req_headers,
            b"",
            200,
            &resp_headers,
            br#"{"cached":true}"#,
            "",
        )
        .await
        .unwrap();

    // Start mocker in read-write mode
    let args = make_test_args("http://localhost:1", Mode::ReadWrite, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();

    let req = Request::builder()
        .method("GET")
        .uri(format!("http://{}/cached", mocker.addr))
        .header("content-type", "text/plain")
        .body(Full::new(Bytes::new()))
        .unwrap();

    let resp = client.request(req).await.unwrap();
    assert_eq!(resp.status(), 200);

    assert_eq!(
        resp.headers()
            .get("x-mocker-response-from")
            .unwrap()
            .to_str()
            .unwrap(),
        "Mock"
    );

    let json = read_body_json(resp).await;
    assert_eq!(json["cached"], true);
}

//-
// 6. Read-write mode: proxies and writes if no mock
//-

#[tokio::test]
async fn read_write_mode_proxies_and_writes_if_no_mock() {
    let echo = start_echo_server().await;
    let origin = format!("http://{}", echo.addr);
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args(&origin, Mode::ReadWrite, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();
    let resp = get(&client, &format!("http://{}/new-endpoint", mocker.addr)).await;
    assert_eq!(resp.status(), 200);

    assert_eq!(
        resp.headers()
            .get("x-mocker-response-from")
            .unwrap()
            .to_str()
            .unwrap(),
        "Origin"
    );

    let _ = read_body(resp).await;

    // Wait for file write
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;

    // Verify mock file was created
    let mut entries = tokio::fs::read_dir(tmp.path()).await.unwrap();
    let mut json_count = 0;
    while let Some(entry) = entries.next_entry().await.unwrap() {
        if entry.path().extension().and_then(|e| e.to_str()) == Some("json") {
            json_count += 1;
        }
    }

    assert!(json_count > 0, "Expected a mock file to be written");
}

//-
// 7. Read-pass mode: reads mock if exists
//-

#[tokio::test]
async fn read_pass_mode_reads_mock_if_exists() {
    let tmp = tempfile::TempDir::new().unwrap();

    let mock_manager = MockManager::new(
        tmp.path().to_path_buf(),
        {
            let mut s = std::collections::HashSet::new();
            s.insert("method".to_string());
            s.insert("url".to_string());
            s
        },
        HashMap::new(),
    );

    let req_headers = to_json_headers(&[("content-type", "text/plain")]);
    let resp_headers = to_json_headers(&[("content-type", "application/json")]);

    mock_manager
        .set(
            "GET",
            "/from-mock",
            &req_headers,
            b"",
            200,
            &resp_headers,
            br#"{"source":"mock"}"#,
            "",
        )
        .await
        .unwrap();

    let args = make_test_args("http://localhost:1", Mode::ReadPass, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();

    let req = Request::builder()
        .method("GET")
        .uri(format!("http://{}/from-mock", mocker.addr))
        .header("content-type", "text/plain")
        .body(Full::new(Bytes::new()))
        .unwrap();

    let resp = client.request(req).await.unwrap();
    assert_eq!(resp.status(), 200);
    assert_eq!(
        resp.headers()
            .get("x-mocker-response-from")
            .unwrap()
            .to_str()
            .unwrap(),
        "Mock"
    );

    let json = read_body_json(resp).await;
    assert_eq!(json["source"], "mock");
}

//-
// 8. Read-pass mode: proxies when no mock
//-

#[tokio::test]
async fn read_pass_mode_proxies_when_no_mock() {
    let echo = start_echo_server().await;
    let origin = format!("http://{}", echo.addr);
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args(&origin, Mode::ReadPass, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();
    let resp = get(&client, &format!("http://{}/no-mock", mocker.addr)).await;
    assert_eq!(resp.status(), 200);

    assert_eq!(
        resp.headers()
            .get("x-mocker-response-from")
            .unwrap()
            .to_str()
            .unwrap(),
        "Origin"
    );

    let json = read_body_json(resp).await;
    assert_eq!(json["method"], "GET");
}

// ===========================================================================
// Mode behavior (edge cases)
// ===========================================================================

//-
// Read mode: different URLs get different 404s
//-

#[tokio::test]
async fn read_mode_different_urls_get_independent_404s() {
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args("http://localhost:1", Mode::Read, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();

    let resp_a = get(&client, &format!("http://{}/a", mocker.addr)).await;
    assert_eq!(resp_a.status(), 404);
    let _ = read_body(resp_a).await;

    let resp_b = get(&client, &format!("http://{}/b", mocker.addr)).await;
    assert_eq!(resp_b.status(), 404);
    let _ = read_body(resp_b).await;
}

//-
// Write mode: only writes 2xx responses
//-

#[tokio::test]
async fn write_mode_does_not_write_non_2xx() {
    let echo = start_echo_server().await;
    let origin = format!("http://{}", echo.addr);
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args(&origin, Mode::Write, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();

    let req = Request::builder()
        .method("GET")
        .uri(format!("http://{}/error-endpoint", mocker.addr))
        .header("response-status-code", "500")
        .body(Full::new(Bytes::new()))
        .unwrap();

    let resp = client.request(req).await.unwrap();
    assert_eq!(resp.status().as_u16(), 500);
    let _ = read_body(resp).await;

    tokio::time::sleep(std::time::Duration::from_millis(100)).await;

    // Verify no mock file was created
    let mut entries = tokio::fs::read_dir(tmp.path()).await.unwrap();
    let mut json_count = 0;
    while let Some(entry) = entries.next_entry().await.unwrap() {
        if entry.path().extension().and_then(|e| e.to_str()) == Some("json") {
            json_count += 1;
        }
    }
    assert_eq!(json_count, 0, "No mock file should be written for 500");
}

//-
// Write mode: overwrites existing mock
//-

#[tokio::test]
async fn write_mode_overwrites_existing_mock() {
    let echo = start_echo_server().await;
    let origin = format!("http://{}", echo.addr);
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args(&origin, Mode::Write, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();

    // First request
    let resp1 = get(&client, &format!("http://{}/overwrite-check", mocker.addr)).await;
    let _ = read_body(resp1).await;
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;

    // Second request to same endpoint overwrites
    let resp2 = get(&client, &format!("http://{}/overwrite-check", mocker.addr)).await;
    let _ = read_body(resp2).await;
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;

    // Should still be exactly one mock file
    let mut entries = tokio::fs::read_dir(tmp.path()).await.unwrap();
    let mut json_count = 0;
    while let Some(entry) = entries.next_entry().await.unwrap() {
        if entry.path().extension().and_then(|e| e.to_str()) == Some("json") {
            json_count += 1;
        }
    }
    assert_eq!(json_count, 1, "Should still have exactly one mock file");
}

//-
// Read-write: mock served has x-mocker-response-from: Mock
//-

#[tokio::test]
async fn read_write_mock_has_response_from_mock() {
    let echo = start_echo_server().await;
    let origin = format!("http://{}", echo.addr);
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args(&origin, Mode::ReadWrite, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();

    // First request creates mock (from origin)
    let resp1 = get(&client, &format!("http://{}/rw-from", mocker.addr)).await;
    assert_eq!(
        resp1
            .headers()
            .get("x-mocker-response-from")
            .unwrap()
            .to_str()
            .unwrap(),
        "Origin"
    );
    let _ = read_body(resp1).await;
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;

    // Second request served from mock
    let resp2 = get(&client, &format!("http://{}/rw-from", mocker.addr)).await;
    assert_eq!(
        resp2
            .headers()
            .get("x-mocker-response-from")
            .unwrap()
            .to_str()
            .unwrap(),
        "Mock"
    );
    let _ = read_body(resp2).await;
}

//-
// Pass-read: origin 500 triggers mock fallback
//-

#[tokio::test]
async fn pass_read_origin_500_triggers_mock_fallback() {
    let tmp = tempfile::TempDir::new().unwrap();

    // Pre-create a mock
    let mock_manager = MockManager::new(
        tmp.path().to_path_buf(),
        {
            let mut s = std::collections::HashSet::new();
            s.insert("method".to_string());
            s.insert("url".to_string());
            s
        },
        HashMap::new(),
    );

    let req_headers = to_json_headers(&[]);
    let resp_headers = to_json_headers(&[("content-type", "application/json")]);

    mock_manager
        .set(
            "GET",
            "/fallback",
            &req_headers,
            b"",
            200,
            &resp_headers,
            br#"{"fallback":true}"#,
            "",
        )
        .await
        .unwrap();

    // Start a server that always returns 500
    let status = start_status_code_server().await;
    let origin = format!("http://{}", status.addr);
    let args = make_test_args(&origin, Mode::PassRead, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();

    let req = Request::builder()
        .method("GET")
        .uri(format!("http://{}/fallback", mocker.addr))
        .header("response-status-code", "500")
        .body(Full::new(Bytes::new()))
        .unwrap();

    let resp = client.request(req).await.unwrap();
    // Should fallback to mock
    assert_eq!(resp.status(), 200);
    assert_eq!(
        resp.headers()
            .get("x-mocker-response-from")
            .unwrap()
            .to_str()
            .unwrap(),
        "Mock"
    );
    let json = read_body_json(resp).await;
    assert_eq!(json["fallback"], true);
}

//-
// Pass-read: origin 200 does not write mock
//-

#[tokio::test]
async fn pass_read_origin_200_does_not_write_mock() {
    let echo = start_echo_server().await;
    let origin = format!("http://{}", echo.addr);
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args(&origin, Mode::PassRead, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();
    let resp = get(&client, &format!("http://{}/no-write", mocker.addr)).await;
    assert_eq!(resp.status(), 200);
    let _ = read_body(resp).await;

    tokio::time::sleep(std::time::Duration::from_millis(100)).await;

    let mut entries = tokio::fs::read_dir(tmp.path()).await.unwrap();
    let mut json_count = 0;
    while let Some(entry) = entries.next_entry().await.unwrap() {
        if entry.path().extension().and_then(|e| e.to_str()) == Some("json") {
            json_count += 1;
        }
    }
    assert_eq!(json_count, 0, "pass-read mode should not write mock files");
}
