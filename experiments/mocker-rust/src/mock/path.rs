use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fmt::Write as _;
use std::path::{Path, PathBuf};

/// Compute SHA256 of input, return first 12 hex chars.
pub fn short_hash(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    let result = hasher.finalize();
    hex_encode(&result[..6])
}

fn hex_encode(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        let _ = write!(s, "{b:02x}");
    }
    s
}

/// Convert a value to a safe filename slug: lowercase, replace non-alphanumeric
/// with hyphens, collapse multiple hyphens, trim leading/trailing hyphens.
pub fn to_safe_slug(value: &str) -> String {
    let lowered = value.to_lowercase();
    let mut slug = String::with_capacity(lowered.len());

    for c in lowered.chars() {
        if c.is_ascii_alphanumeric() {
            slug.push(c);
        } else {
            slug.push('-');
        }
    }

    // Collapse multiple hyphens
    let mut collapsed = String::with_capacity(slug.len());
    let mut prev_hyphen = false;
    for c in slug.chars() {
        if c == '-' {
            if !prev_hyphen {
                collapsed.push('-');
            }
            prev_hyphen = true;
        } else {
            collapsed.push(c);
            prev_hyphen = false;
        }
    }

    // Trim leading/trailing hyphens
    collapsed.trim_matches('-').to_string()
}

/// Detect GraphQL operation from parsed body. Returns e.g. `gql-query-get-user`.
pub fn get_graphql_filename(body: Option<&serde_json::Value>) -> Option<String> {
    let body = body?;
    let obj = body.as_object()?;

    // Need either operationName or query to detect GraphQL
    let query_str = obj.get("query")?.as_str()?;

    // Detect operation type from query string
    let op_type = detect_graphql_operation_type(query_str);

    // Get operation name: prefer explicit operationName field, then parse from query
    let op_name = obj
        .get("operationName")
        .and_then(|v| v.as_str())
        .map(std::string::ToString::to_string)
        .or_else(|| extract_operation_name_from_query(query_str));

    let op_name = op_name?;
    let slug = to_safe_slug(&op_name);
    if slug.is_empty() {
        return None;
    }

    Some(format!("gql-{op_type}-{slug}"))
}

fn detect_graphql_operation_type(query: &str) -> &'static str {
    let trimmed = query.trim();
    if trimmed.starts_with("mutation") {
        "mutation"
    } else if trimmed.starts_with("subscription") {
        "subscription"
    } else {
        "query"
    }
}

fn extract_operation_name_from_query(query: &str) -> Option<String> {
    // Look for patterns like "query OperationName" or "mutation OperationName"
    let trimmed = query.trim();
    for prefix in &["query", "mutation", "subscription"] {
        if let Some(rest) = trimmed.strip_prefix(prefix) {
            let rest = rest.trim_start();
            // The operation name is the next word (before '(' or '{')
            let name: String = rest
                .chars()
                .take_while(|c| c.is_ascii_alphanumeric() || *c == '_')
                .collect();
            if !name.is_empty() {
                return Some(name);
            }
        }
    }
    None
}

/// Build an HTTP filename from URL, method, and mock keys.
pub fn get_http_filename(url: &str, method: &str, _mock_keys: &HashSet<String>) -> String {
    // Extract path from URL
    let path = extract_path(url);
    let slug = to_safe_slug(&path);
    let method_lower = method.to_lowercase();

    if slug.is_empty() {
        format!("http-{method_lower}")
    } else {
        format!("http-{method_lower}-{slug}")
    }
}

fn extract_path(url: &str) -> String {
    // Try to find the path portion of the URL
    if let Some(idx) = url.find("://") {
        let after_scheme = &url[idx + 3..];
        if let Some(slash_idx) = after_scheme.find('/') {
            let path = &after_scheme[slash_idx..];
            // Remove query string
            if let Some(q_idx) = path.find('?') {
                return path[..q_idx].to_string();
            }
            return path.to_string();
        }
        return String::new();
    }
    // If no scheme, treat whole thing as path
    url.find('?')
        .map_or_else(|| url.to_string(), |q_idx| url[..q_idx].to_string())
}

/// Extract a nested JSON value given a dot-separated path like `body.path.to.prop`.
fn extract_json_value<'a>(
    value: &'a serde_json::Value,
    path: &str,
) -> Option<&'a serde_json::Value> {
    let mut current = value;
    for key in path.split('.') {
        current = current.get(key)?;
    }
    Some(current)
}

/// Serialize a value to its JSON string representation (like `JSON.stringify`).
fn json_stringify(value: &serde_json::Value) -> String {
    serde_json::to_string(value).unwrap_or_default()
}

/// Generate the mock file path.
pub fn generate_mock_path(
    mocks_dir: &Path,
    mock_keys: &HashSet<String>,
    method: &str,
    url: &str,
    headers: &HashMap<String, String>,
    body: &[u8],
    parsed_body: Option<&serde_json::Value>,
) -> PathBuf {
    // Build hash input from mock_keys in sorted order
    let mut hash_input = String::new();
    let mut sorted_keys: Vec<&String> = mock_keys.iter().collect();
    sorted_keys.sort();

    for key in &sorted_keys {
        let key_str: &str = key.as_str();
        match key_str {
            "method" => {
                hash_input.push_str(&json_stringify(&serde_json::Value::String(
                    method.to_string(),
                )));
            }
            "url" => {
                hash_input.push_str(&json_stringify(&serde_json::Value::String(url.to_string())));
            }
            "body" => {
                // Use raw body bytes as string
                hash_input.push_str(&String::from_utf8_lossy(body));
            }
            _ if key_str.starts_with("header.") => {
                let header_name = &key_str["header.".len()..];
                if let Some(val) = headers.get(header_name) {
                    hash_input.push_str(&json_stringify(&serde_json::Value::String(val.clone())));
                }
            }
            _ if key_str.starts_with("body.") => {
                let json_path = &key_str["body.".len()..];
                if let Some(parsed) = parsed_body {
                    if let Some(val) = extract_json_value(parsed, json_path) {
                        hash_input.push_str(&json_stringify(val));
                    }
                }
            }
            _ => {}
        }
    }

    let hash = short_hash(&hash_input);

    // Build label: prefer GraphQL name, fall back to HTTP name
    let label = get_graphql_filename(parsed_body)
        .unwrap_or_else(|| get_http_filename(url, method, mock_keys));

    // Construct filename, truncate to 80 chars: {hash}-{label}.json
    // hash is 12 chars, dash is 1, ".json" is 5 => label can be at most 80 - 12 - 1 - 5 = 62
    let max_label_len = 80 - hash.len() - 1 - 5; // 62
    let truncated_label = if label.len() > max_label_len {
        &label[..max_label_len]
    } else {
        &label
    };

    let filename = format!("{hash}-{truncated_label}.json");
    mocks_dir.join(filename)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_short_hash_deterministic() {
        let h1 = short_hash("hello");
        let h2 = short_hash("hello");
        assert_eq!(h1, h2);
    }

    #[test]
    fn test_short_hash_length() {
        let h = short_hash("test input");
        assert_eq!(h.len(), 12);
    }

    #[test]
    fn test_short_hash_different_inputs() {
        let h1 = short_hash("hello");
        let h2 = short_hash("world");
        assert_ne!(h1, h2);
    }

    #[test]
    fn test_short_hash_hex_chars() {
        let h = short_hash("test");
        assert!(h.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn test_to_safe_slug_basic() {
        assert_eq!(to_safe_slug("Hello World"), "hello-world");
    }

    #[test]
    fn test_to_safe_slug_special_chars() {
        assert_eq!(to_safe_slug("/api/v1/users"), "api-v1-users");
    }

    #[test]
    fn test_to_safe_slug_multiple_special() {
        assert_eq!(to_safe_slug("foo---bar///baz"), "foo-bar-baz");
    }

    #[test]
    fn test_to_safe_slug_leading_trailing() {
        assert_eq!(to_safe_slug("--hello--"), "hello");
    }

    #[test]
    fn test_to_safe_slug_empty() {
        assert_eq!(to_safe_slug(""), "");
    }

    #[test]
    fn test_to_safe_slug_all_special() {
        assert_eq!(to_safe_slug("///"), "");
    }

    #[test]
    fn test_to_safe_slug_mixed_case() {
        assert_eq!(to_safe_slug("GetUserProfile"), "getuserprofile");
    }

    #[test]
    fn test_graphql_query_detection() {
        let body = serde_json::json!({
            "operationName": "GetUser",
            "query": "query GetUser { user { id name } }"
        });
        let result = get_graphql_filename(Some(&body));
        assert_eq!(result, Some("gql-query-getuser".to_string()));
    }

    #[test]
    fn test_graphql_mutation_detection() {
        let body = serde_json::json!({
            "operationName": "CreateUser",
            "query": "mutation CreateUser($input: UserInput!) { createUser(input: $input) { id } }"
        });
        let result = get_graphql_filename(Some(&body));
        assert_eq!(result, Some("gql-mutation-createuser".to_string()));
    }

    #[test]
    fn test_graphql_subscription_detection() {
        let body = serde_json::json!({
            "operationName": "OnMessage",
            "query": "subscription OnMessage { messageAdded { id text } }"
        });
        let result = get_graphql_filename(Some(&body));
        assert_eq!(result, Some("gql-subscription-onmessage".to_string()));
    }

    #[test]
    fn test_graphql_no_operation_name_field() {
        let body = serde_json::json!({
            "query": "query FetchItems { items { id } }"
        });
        let result = get_graphql_filename(Some(&body));
        assert_eq!(result, Some("gql-query-fetchitems".to_string()));
    }

    #[test]
    fn test_graphql_none_body() {
        let result = get_graphql_filename(None);
        assert_eq!(result, None);
    }

    #[test]
    fn test_graphql_non_graphql_body() {
        let body = serde_json::json!({
            "name": "test",
            "value": 42
        });
        let result = get_graphql_filename(Some(&body));
        assert_eq!(result, None);
    }

    #[test]
    fn test_http_filename_get() {
        let keys = HashSet::new();
        let result = get_http_filename("https://api.example.com/users/123", "GET", &keys);
        assert_eq!(result, "http-get-users-123");
    }

    #[test]
    fn test_http_filename_post() {
        let keys = HashSet::new();
        let result = get_http_filename("https://api.example.com/data", "POST", &keys);
        assert_eq!(result, "http-post-data");
    }

    #[test]
    fn test_http_filename_no_path() {
        let keys = HashSet::new();
        let result = get_http_filename("https://api.example.com", "GET", &keys);
        assert_eq!(result, "http-get");
    }

    #[test]
    fn test_http_filename_with_query_string() {
        let keys = HashSet::new();
        let result =
            get_http_filename("https://api.example.com/search?q=test&page=1", "GET", &keys);
        assert_eq!(result, "http-get-search");
    }

    #[test]
    fn test_generate_mock_path_basic() {
        let mocks_dir = Path::new("/tmp/mocks");
        let mut mock_keys = HashSet::new();
        mock_keys.insert("method".to_string());
        mock_keys.insert("url".to_string());

        let headers = HashMap::new();
        let body = b"";
        let path = generate_mock_path(
            mocks_dir,
            &mock_keys,
            "GET",
            "https://api.example.com/users",
            &headers,
            body,
            None,
        );

        let filename = path.file_name().unwrap().to_str().unwrap();
        assert!(filename.ends_with(".json"));
        assert!(filename.len() <= 80);
        assert!(path.starts_with("/tmp/mocks"));
    }

    #[test]
    fn test_generate_mock_path_hash_consistency() {
        let mocks_dir = Path::new("/tmp/mocks");
        let mut mock_keys = HashSet::new();
        mock_keys.insert("method".to_string());
        mock_keys.insert("url".to_string());

        let headers = HashMap::new();
        let body = b"";

        let path1 = generate_mock_path(
            mocks_dir,
            &mock_keys,
            "GET",
            "https://api.example.com/users",
            &headers,
            body,
            None,
        );
        let path2 = generate_mock_path(
            mocks_dir,
            &mock_keys,
            "GET",
            "https://api.example.com/users",
            &headers,
            body,
            None,
        );
        assert_eq!(path1, path2);
    }

    #[test]
    fn test_generate_mock_path_different_methods() {
        let mocks_dir = Path::new("/tmp/mocks");
        let mut mock_keys = HashSet::new();
        mock_keys.insert("method".to_string());

        let headers = HashMap::new();
        let body = b"";

        let path1 = generate_mock_path(
            mocks_dir,
            &mock_keys,
            "GET",
            "https://api.example.com/users",
            &headers,
            body,
            None,
        );
        let path2 = generate_mock_path(
            mocks_dir,
            &mock_keys,
            "POST",
            "https://api.example.com/users",
            &headers,
            body,
            None,
        );
        assert_ne!(path1, path2);
    }

    #[test]
    fn test_filename_truncation() {
        let mocks_dir = Path::new("/tmp/mocks");
        let mut mock_keys = HashSet::new();
        mock_keys.insert("url".to_string());

        let headers = HashMap::new();
        let body = b"";
        let long_url = format!("https://api.example.com/{}", "a".repeat(200));

        let path = generate_mock_path(
            mocks_dir, &mock_keys, "GET", &long_url, &headers, body, None,
        );

        let filename = path.file_name().unwrap().to_str().unwrap();
        assert!(
            filename.len() <= 80,
            "Filename was {} chars: {}",
            filename.len(),
            filename
        );
    }

    #[test]
    fn test_body_nested_path_extraction() {
        let mocks_dir = Path::new("/tmp/mocks");
        let mut mock_keys = HashSet::new();
        mock_keys.insert("body.user.name".to_string());

        let headers = HashMap::new();
        let body_json = serde_json::json!({
            "user": {
                "name": "Alice",
                "age": 30
            }
        });
        let body_bytes = serde_json::to_vec(&body_json).unwrap();

        let path = generate_mock_path(
            mocks_dir,
            &mock_keys,
            "POST",
            "https://api.example.com/users",
            &headers,
            &body_bytes,
            Some(&body_json),
        );

        let filename = path.file_name().unwrap().to_str().unwrap();
        assert!(filename.ends_with(".json"));
    }

    #[test]
    fn test_body_nested_path_different_values_different_hashes() {
        let mocks_dir = Path::new("/tmp/mocks");
        let mut mock_keys = HashSet::new();
        mock_keys.insert("body.user.name".to_string());

        let headers = HashMap::new();

        let body1 = serde_json::json!({"user": {"name": "Alice"}});
        let body2 = serde_json::json!({"user": {"name": "Bob"}});
        let bytes1 = serde_json::to_vec(&body1).unwrap();
        let bytes2 = serde_json::to_vec(&body2).unwrap();

        let path1 = generate_mock_path(
            mocks_dir,
            &mock_keys,
            "POST",
            "https://api.example.com",
            &headers,
            &bytes1,
            Some(&body1),
        );
        let path2 = generate_mock_path(
            mocks_dir,
            &mock_keys,
            "POST",
            "https://api.example.com",
            &headers,
            &bytes2,
            Some(&body2),
        );

        assert_ne!(path1, path2);
    }

    #[test]
    fn test_extract_json_value_nested() {
        let val = serde_json::json!({
            "a": { "b": { "c": 42 } }
        });
        let result = extract_json_value(&val, "a.b.c");
        assert_eq!(result, Some(&serde_json::json!(42)));
    }

    #[test]
    fn test_extract_json_value_missing() {
        let val = serde_json::json!({"a": 1});
        let result = extract_json_value(&val, "b.c");
        assert_eq!(result, None);
    }

    #[test]
    fn test_extract_path_with_scheme() {
        assert_eq!(extract_path("https://example.com/foo/bar"), "/foo/bar");
    }

    #[test]
    fn test_extract_path_no_scheme() {
        assert_eq!(extract_path("/foo/bar"), "/foo/bar");
    }

    #[test]
    fn test_extract_path_with_query() {
        assert_eq!(extract_path("https://example.com/search?q=test"), "/search");
    }

    #[test]
    fn test_generate_mock_path_with_graphql() {
        let mocks_dir = Path::new("/tmp/mocks");
        let mut mock_keys = HashSet::new();
        mock_keys.insert("body".to_string());

        let body_json = serde_json::json!({
            "operationName": "GetUser",
            "query": "query GetUser { user { id } }"
        });
        let body_bytes = serde_json::to_vec(&body_json).unwrap();

        let path = generate_mock_path(
            mocks_dir,
            &mock_keys,
            "POST",
            "https://api.example.com/graphql",
            &HashMap::new(),
            &body_bytes,
            Some(&body_json),
        );

        let filename = path.file_name().unwrap().to_str().unwrap();
        assert!(
            filename.contains("gql-query-getuser"),
            "filename was: {filename}",
        );
    }

    #[test]
    fn test_generate_mock_path_with_header_key() {
        let mocks_dir = Path::new("/tmp/mocks");
        let mut mock_keys = HashSet::new();
        mock_keys.insert("header.authorization".to_string());

        let mut headers = HashMap::new();
        headers.insert("authorization".to_string(), "Bearer token1".to_string());

        let path1 = generate_mock_path(
            mocks_dir,
            &mock_keys,
            "GET",
            "https://api.example.com",
            &headers,
            b"",
            None,
        );

        headers.insert("authorization".to_string(), "Bearer token2".to_string());
        let path2 = generate_mock_path(
            mocks_dir,
            &mock_keys,
            "GET",
            "https://api.example.com",
            &headers,
            b"",
            None,
        );

        assert_ne!(path1, path2);
    }
}
