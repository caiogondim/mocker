use crate::error::MockerError;
use serde_json::Value;
use std::collections::HashMap;

pub type Headers = HashMap<String, Value>;

/// Replace values of secret keys with `[REDACTED]`.
pub fn redact_headers(headers: &Headers, secrets: &Headers) -> Headers {
    let mut result = headers.clone();
    for key in secrets.keys() {
        if result.contains_key(key) {
            result.insert(key.clone(), Value::String("[REDACTED]".to_string()));
        }
    }
    result
}

/// Restore redacted values from the secrets map.
/// Returns `SecretNotFoundError` if a redacted key is missing from secrets.
pub fn unredact_headers(headers: &Headers, secrets: &Headers) -> Result<Headers, MockerError> {
    let mut result = headers.clone();
    for (key, value) in &mut result {
        if *value == Value::String("[REDACTED]".to_string()) {
            if let Some(secret_value) = secrets.get(key) {
                *value = secret_value.clone();
            } else {
                return Err(MockerError::SecretNotFoundError { key: key.clone() });
            }
        }
    }
    Ok(result)
}

/// Sanitize request headers: redact secrets and remove content-length.
pub fn sanitize_request_headers(headers: &Headers, secrets: &Headers) -> Headers {
    let mut result = redact_headers(headers, secrets);
    result.remove("content-length");
    result
}

/// Sanitize response headers: redact secrets, remove content-encoding and content-length.
pub fn sanitize_response_headers(headers: &Headers, secrets: &Headers) -> Headers {
    let mut result = redact_headers(headers, secrets);
    result.remove("content-encoding");
    result.remove("content-length");
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_headers(pairs: &[(&str, &str)]) -> Headers {
        pairs
            .iter()
            .map(|(k, v)| (k.to_string(), Value::String(v.to_string())))
            .collect()
    }

    #[test]
    fn test_redact_headers() {
        let headers = make_headers(&[
            ("authorization", "Bearer token123"),
            ("accept", "text/html"),
        ]);
        let secrets = make_headers(&[("authorization", "Bearer token123")]);
        let result = redact_headers(&headers, &secrets);
        assert_eq!(
            result["authorization"],
            Value::String("[REDACTED]".to_string())
        );
        assert_eq!(result["accept"], Value::String("text/html".to_string()));
    }

    #[test]
    fn test_redact_headers_no_match() {
        let headers = make_headers(&[("accept", "text/html")]);
        let secrets = make_headers(&[("authorization", "Bearer token123")]);
        let result = redact_headers(&headers, &secrets);
        assert_eq!(result.len(), 1);
        assert_eq!(result["accept"], Value::String("text/html".to_string()));
    }

    #[test]
    fn test_redact_headers_empty_secrets() {
        let headers = make_headers(&[("accept", "text/html")]);
        let secrets = Headers::new();
        let result = redact_headers(&headers, &secrets);
        assert_eq!(result, headers);
    }

    #[test]
    fn test_unredact_headers() {
        let headers = make_headers(&[("authorization", "[REDACTED]"), ("accept", "text/html")]);
        let secrets = make_headers(&[("authorization", "Bearer token123")]);
        let result = unredact_headers(&headers, &secrets).unwrap();
        assert_eq!(
            result["authorization"],
            Value::String("Bearer token123".to_string())
        );
        assert_eq!(result["accept"], Value::String("text/html".to_string()));
    }

    #[test]
    fn test_unredact_headers_missing_secret() {
        let headers = make_headers(&[("authorization", "[REDACTED]")]);
        let secrets = Headers::new();
        let result = unredact_headers(&headers, &secrets);
        assert!(result.is_err());
        assert!(matches!(
            result.unwrap_err(),
            MockerError::SecretNotFoundError { .. }
        ));
    }

    #[test]
    fn test_sanitize_request_headers() {
        let headers = make_headers(&[
            ("authorization", "Bearer token"),
            ("content-length", "42"),
            ("accept", "text/html"),
        ]);
        let secrets = make_headers(&[("authorization", "Bearer token")]);
        let result = sanitize_request_headers(&headers, &secrets);
        assert_eq!(
            result["authorization"],
            Value::String("[REDACTED]".to_string())
        );
        assert!(!result.contains_key("content-length"));
        assert_eq!(result["accept"], Value::String("text/html".to_string()));
    }

    #[test]
    fn test_sanitize_response_headers() {
        let headers = make_headers(&[
            ("authorization", "Bearer token"),
            ("content-length", "42"),
            ("content-encoding", "gzip"),
            ("x-custom", "value"),
        ]);
        let secrets = make_headers(&[("authorization", "Bearer token")]);
        let result = sanitize_response_headers(&headers, &secrets);
        assert_eq!(
            result["authorization"],
            Value::String("[REDACTED]".to_string())
        );
        assert!(!result.contains_key("content-length"));
        assert!(!result.contains_key("content-encoding"));
        assert_eq!(result["x-custom"], Value::String("value".to_string()));
    }

    #[test]
    fn test_roundtrip_redact_unredact() {
        let headers = make_headers(&[
            ("authorization", "Bearer secret"),
            ("x-api-key", "key123"),
            ("accept", "application/json"),
        ]);
        let secrets = make_headers(&[("authorization", "Bearer secret"), ("x-api-key", "key123")]);
        let redacted = redact_headers(&headers, &secrets);
        assert_eq!(
            redacted["authorization"],
            Value::String("[REDACTED]".to_string())
        );
        assert_eq!(
            redacted["x-api-key"],
            Value::String("[REDACTED]".to_string())
        );
        let unredacted = unredact_headers(&redacted, &secrets).unwrap();
        assert_eq!(unredacted, headers);
    }
}
