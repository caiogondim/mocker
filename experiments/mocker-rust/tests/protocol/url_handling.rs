use mocker::args::Mode;

use crate::helpers::{
    build_client, get, make_test_args, read_body_json, start_echo_server, start_mocker,
};

//-
// 12. URL path and query preserved
//-

#[tokio::test]
async fn url_path_and_query_preserved() {
    let echo = start_echo_server().await;
    let origin = format!("http://{}", echo.addr);
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args(&origin, Mode::Pass, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();
    let resp = get(
        &client,
        &format!("http://{}/path/to/resource?foo=bar&baz=qux", mocker.addr),
    )
    .await;

    let json = read_body_json(resp).await;
    assert_eq!(json["url"], "/path/to/resource?foo=bar&baz=qux");
}

//-
// 13. URL with special characters preserved
//-

#[tokio::test]
async fn url_with_special_characters_preserved() {
    let echo = start_echo_server().await;
    let origin = format!("http://{}", echo.addr);
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args(&origin, Mode::Pass, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();
    let resp = get(
        &client,
        &format!(
            "http://{}/path%20with%20spaces/file%2Fname?q=%E4%BD%A0%E5%A5%BD",
            mocker.addr
        ),
    )
    .await;

    let json = read_body_json(resp).await;
    let url = json["url"].as_str().unwrap();
    assert!(url.contains("path%20with%20spaces"));
    assert!(url.contains("file%2Fname"));
}

//-
// Root path
//-

#[tokio::test]
async fn root_path_forwarded() {
    let echo = start_echo_server().await;
    let origin = format!("http://{}", echo.addr);
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args(&origin, Mode::Pass, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();
    let resp = get(&client, &format!("http://{}/", mocker.addr)).await;
    let json = read_body_json(resp).await;
    assert_eq!(json["url"], "/");
}

//-
// Path with trailing slash preserved
//-

#[tokio::test]
async fn path_with_trailing_slash_preserved() {
    let echo = start_echo_server().await;
    let origin = format!("http://{}", echo.addr);
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args(&origin, Mode::Pass, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();
    let resp = get(&client, &format!("http://{}/path/", mocker.addr)).await;
    let json = read_body_json(resp).await;
    assert_eq!(json["url"], "/path/");
}

//-
// Long URL path (2000+ chars)
//-

#[tokio::test]
async fn long_url_path_forwarded() {
    let echo = start_echo_server().await;
    let origin = format!("http://{}", echo.addr);
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args(&origin, Mode::Pass, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();
    let long_segment = "a".repeat(2000);
    let url = format!("http://{}/{long_segment}", mocker.addr);
    let resp = get(&client, &url).await;
    assert_eq!(resp.status(), 200);
    let json = read_body_json(resp).await;
    let echoed_url = json["url"].as_str().unwrap();
    assert!(echoed_url.len() >= 2000);
}

//-
// URL with empty query (/path?)
//-

#[tokio::test]
async fn url_with_empty_query() {
    let echo = start_echo_server().await;
    let origin = format!("http://{}", echo.addr);
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args(&origin, Mode::Pass, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();
    let resp = get(&client, &format!("http://{}/path?", mocker.addr)).await;
    let json = read_body_json(resp).await;
    assert_eq!(json["url"], "/path?");
}

//-
// Double-encoded URL (%2520 stays as %2520)
//-

#[tokio::test]
async fn double_encoded_url_preserved() {
    let echo = start_echo_server().await;
    let origin = format!("http://{}", echo.addr);
    let tmp = tempfile::TempDir::new().unwrap();
    let args = make_test_args(&origin, Mode::Pass, tmp.path());
    let mocker = start_mocker(args).await;

    let client = build_client();
    let resp = get(&client, &format!("http://{}/path%2520encoded", mocker.addr)).await;
    let json = read_body_json(resp).await;
    let url = json["url"].as_str().unwrap();
    assert!(url.contains("%2520"));
}
