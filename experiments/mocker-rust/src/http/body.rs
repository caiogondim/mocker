use base64::Engine;
use serde_json::Value;

/// Returns true if the content type represents textual data.
pub fn is_textual_content_type(content_type: &str) -> bool {
    let ct = content_type.to_lowercase();
    ct.starts_with("text/")
        || ct.contains("application/xml")
        || ct.contains("application/javascript")
        || ct.contains("application/x-www-form-urlencoded")
        || ct.contains("application/graphql")
        || ct.contains("application/json")
}

/// Parse a raw body into a JSON value based on content type.
///
/// Rules:
/// - Textual content types (text/*, application/xml, etc.): store as JSON string
/// - application/json: try to parse as JSON, fallback to string
/// - Binary (not valid UTF-8): store as `{ "encoding": "base64", "data": "..." }`
/// - Otherwise: try as UTF-8 string, fallback to base64
pub fn parse_body(body: &[u8], content_type: &str) -> Value {
    let ct = content_type.to_lowercase();

    if ct.contains("application/json") {
        // Try parsing as JSON first
        if let Ok(s) = std::str::from_utf8(body) {
            if let Ok(parsed) = serde_json::from_str::<Value>(s) {
                return parsed;
            }
            return Value::String(s.to_string());
        }
        return encode_base64(body);
    }

    if is_textual_content_type(&ct) {
        return std::str::from_utf8(body)
            .map_or_else(|_| encode_base64(body), |s| Value::String(s.to_string()));
    }

    // Non-textual: try UTF-8, fallback to base64
    std::str::from_utf8(body).map_or_else(|_| encode_base64(body), |s| Value::String(s.to_string()))
}

/// Serialize a JSON value back into raw bytes based on content type.
///
/// Rules:
/// - If value is object with `encoding: "base64"` and `data`: decode from base64
/// - If content-type includes application/json: serialize the value as JSON
/// - Otherwise: return as string bytes
pub fn serialize_body(mock_body: &Value, content_type: &str) -> Vec<u8> {
    // Check for base64-encoded object
    if let Value::Object(map) = mock_body {
        if let (Some(Value::String(encoding)), Some(Value::String(data))) =
            (map.get("encoding"), map.get("data"))
        {
            if encoding == "base64" {
                if let Ok(decoded) = base64::engine::general_purpose::STANDARD.decode(data) {
                    return decoded;
                }
            }
        }
    }

    let ct = content_type.to_lowercase();
    if ct.contains("application/json") {
        return serde_json::to_vec(mock_body).unwrap_or_default();
    }

    // Return as string bytes
    match mock_body {
        Value::String(s) => s.as_bytes().to_vec(),
        other => other.to_string().as_bytes().to_vec(),
    }
}

fn encode_base64(data: &[u8]) -> Value {
    let encoded = base64::engine::general_purpose::STANDARD.encode(data);
    serde_json::json!({
        "encoding": "base64",
        "data": encoded
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_textual_content_type() {
        assert!(is_textual_content_type("text/plain"));
        assert!(is_textual_content_type("text/html; charset=utf-8"));
        assert!(is_textual_content_type("application/json"));
        assert!(is_textual_content_type("application/xml"));
        assert!(is_textual_content_type("application/javascript"));
        assert!(is_textual_content_type("application/x-www-form-urlencoded"));
        assert!(is_textual_content_type("application/graphql"));
        assert!(!is_textual_content_type("image/png"));
        assert!(!is_textual_content_type("application/octet-stream"));
    }

    #[test]
    fn test_parse_body_json() {
        let body = br#"{"key": "value"}"#;
        let result = parse_body(body, "application/json");
        assert_eq!(result["key"], "value");
    }

    #[test]
    fn test_parse_body_json_array() {
        let body = b"[1, 2, 3]";
        let result = parse_body(body, "application/json");
        assert!(result.is_array());
        assert_eq!(result[0], 1);
    }

    #[test]
    fn test_parse_body_json_invalid_falls_back_to_string() {
        let body = b"not valid json";
        let result = parse_body(body, "application/json");
        assert_eq!(result, Value::String("not valid json".to_string()));
    }

    #[test]
    fn test_parse_body_text_plain() {
        let body = b"hello world";
        let result = parse_body(body, "text/plain");
        assert_eq!(result, Value::String("hello world".to_string()));
    }

    #[test]
    fn test_parse_body_text_html() {
        let body = b"<html></html>";
        let result = parse_body(body, "text/html; charset=utf-8");
        assert_eq!(result, Value::String("<html></html>".to_string()));
    }

    #[test]
    fn test_parse_body_xml() {
        let body = b"<root/>";
        let result = parse_body(body, "application/xml");
        assert_eq!(result, Value::String("<root/>".to_string()));
    }

    #[test]
    fn test_parse_body_binary() {
        let body: &[u8] = &[0xFF, 0xFE, 0x00, 0x01];
        let result = parse_body(body, "application/octet-stream");
        assert_eq!(result["encoding"], "base64");
        assert!(result["data"].is_string());
    }

    #[test]
    fn test_parse_body_unknown_utf8() {
        let body = b"some text";
        let result = parse_body(body, "application/octet-stream");
        assert_eq!(result, Value::String("some text".to_string()));
    }

    #[test]
    fn test_serialize_body_base64() {
        let original: &[u8] = &[0xFF, 0xFE, 0x00, 0x01];
        let encoded = base64::engine::general_purpose::STANDARD.encode(original);
        let value = serde_json::json!({ "encoding": "base64", "data": encoded });
        let result = serialize_body(&value, "application/octet-stream");
        assert_eq!(result, original);
    }

    #[test]
    fn test_serialize_body_json() {
        let value = serde_json::json!({"key": "value"});
        let result = serialize_body(&value, "application/json");
        let parsed: Value = serde_json::from_slice(&result).unwrap();
        assert_eq!(parsed["key"], "value");
    }

    #[test]
    fn test_serialize_body_text() {
        let value = Value::String("hello".to_string());
        let result = serialize_body(&value, "text/plain");
        assert_eq!(result, b"hello");
    }

    #[test]
    fn test_roundtrip_json() {
        let original = br#"{"name":"test","count":42}"#;
        let parsed = parse_body(original, "application/json");
        let serialized = serialize_body(&parsed, "application/json");
        let reparsed: Value = serde_json::from_slice(&serialized).unwrap();
        assert_eq!(reparsed["name"], "test");
        assert_eq!(reparsed["count"], 42);
    }

    #[test]
    fn test_roundtrip_binary() {
        let original: &[u8] = &[0x00, 0xFF, 0x80, 0x7F];
        let parsed = parse_body(original, "image/png");
        let serialized = serialize_body(&parsed, "image/png");
        assert_eq!(serialized, original);
    }

    #[test]
    fn test_roundtrip_text() {
        let original = b"Hello, world!";
        let parsed = parse_body(original, "text/plain");
        let serialized = serialize_body(&parsed, "text/plain");
        assert_eq!(serialized, original);
    }

    #[test]
    fn test_serialize_body_json_string_value() {
        let value = Value::String("just a string".to_string());
        let result = serialize_body(&value, "application/json");
        // JSON serialization of a string includes quotes
        assert_eq!(result, b"\"just a string\"");
    }
}
