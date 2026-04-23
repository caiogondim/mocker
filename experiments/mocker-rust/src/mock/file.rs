use crate::error::MockerError;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MockFile {
    pub request: MockRequest,
    pub response: MockResponse,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MockRequest {
    pub method: String,
    pub url: String,
    pub headers: HashMap<String, serde_json::Value>,
    pub body: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MockResponse {
    #[serde(rename = "statusCode")]
    pub status_code: u16,
    pub headers: HashMap<String, serde_json::Value>,
    pub body: serde_json::Value,
}

impl MockFile {
    /// Parse a `MockFile` from JSON bytes.
    pub fn from_json(data: &[u8]) -> Result<Self, MockerError> {
        let mock_file: Self = serde_json::from_slice(data)?;
        Ok(mock_file)
    }

    /// Serialize to pretty-printed JSON string.
    pub fn to_json_pretty(&self) -> Result<String, MockerError> {
        let json = serde_json::to_string_pretty(self)?;
        Ok(json)
    }

    /// Validate that required fields exist and have correct types.
    pub fn validate(&self) -> Result<(), MockerError> {
        if self.request.method.is_empty() {
            return Err(MockerError::ValidationError(
                "request.method must not be empty".to_string(),
            ));
        }

        if self.request.url.is_empty() {
            return Err(MockerError::ValidationError(
                "request.url must not be empty".to_string(),
            ));
        }

        if self.response.status_code < 100 || self.response.status_code > 599 {
            return Err(MockerError::ValidationError(format!(
                "response.statusCode must be between 100 and 599, got {}",
                self.response.status_code
            )));
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_json() -> &'static str {
        r#"{
            "request": {
                "method": "GET",
                "url": "https://api.example.com/users",
                "headers": {"accept": "application/json"},
                "body": null
            },
            "response": {
                "statusCode": 200,
                "headers": {"content-type": "application/json"},
                "body": {"id": 1, "name": "Alice"}
            }
        }"#
    }

    #[test]
    fn test_from_json_valid() {
        let mock = MockFile::from_json(valid_json().as_bytes()).unwrap();
        assert_eq!(mock.request.method, "GET");
        assert_eq!(mock.request.url, "https://api.example.com/users");
        assert_eq!(mock.response.status_code, 200);
    }

    #[test]
    fn test_from_json_invalid() {
        let result = MockFile::from_json(b"not valid json");
        assert!(result.is_err());
    }

    #[test]
    fn test_from_json_missing_field() {
        let json = r#"{"request": {"method": "GET"}}"#;
        let result = MockFile::from_json(json.as_bytes());
        assert!(result.is_err());
    }

    #[test]
    fn test_roundtrip_serialize_deserialize() {
        let original = MockFile::from_json(valid_json().as_bytes()).unwrap();
        let json_str = original.to_json_pretty().unwrap();
        let roundtripped = MockFile::from_json(json_str.as_bytes()).unwrap();
        assert_eq!(roundtripped.request.method, original.request.method);
        assert_eq!(roundtripped.request.url, original.request.url);
        assert_eq!(
            roundtripped.response.status_code,
            original.response.status_code
        );
        assert_eq!(roundtripped.response.body, original.response.body);
    }

    #[test]
    fn test_to_json_pretty_is_pretty() {
        let mock = MockFile::from_json(valid_json().as_bytes()).unwrap();
        let json_str = mock.to_json_pretty().unwrap();
        assert!(json_str.contains('\n'));
        assert!(json_str.contains("  "));
    }

    #[test]
    fn test_validate_valid() {
        let mock = MockFile::from_json(valid_json().as_bytes()).unwrap();
        assert!(mock.validate().is_ok());
    }

    #[test]
    fn test_validate_empty_method() {
        let mut mock = MockFile::from_json(valid_json().as_bytes()).unwrap();
        mock.request.method = String::new();
        let result = mock.validate();
        assert!(result.is_err());
        assert!(
            matches!(result.unwrap_err(), MockerError::ValidationError(msg) if msg.contains("method"))
        );
    }

    #[test]
    fn test_validate_empty_url() {
        let mut mock = MockFile::from_json(valid_json().as_bytes()).unwrap();
        mock.request.url = String::new();
        let result = mock.validate();
        assert!(result.is_err());
        assert!(
            matches!(result.unwrap_err(), MockerError::ValidationError(msg) if msg.contains("url"))
        );
    }

    #[test]
    fn test_validate_bad_status_code_low() {
        let mut mock = MockFile::from_json(valid_json().as_bytes()).unwrap();
        mock.response.status_code = 99;
        let result = mock.validate();
        assert!(result.is_err());
        assert!(
            matches!(result.unwrap_err(), MockerError::ValidationError(msg) if msg.contains("statusCode"))
        );
    }

    #[test]
    fn test_validate_bad_status_code_high() {
        let mut mock = MockFile::from_json(valid_json().as_bytes()).unwrap();
        mock.response.status_code = 600;
        let result = mock.validate();
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_status_code_boundaries() {
        let mut mock = MockFile::from_json(valid_json().as_bytes()).unwrap();
        mock.response.status_code = 100;
        assert!(mock.validate().is_ok());
        mock.response.status_code = 599;
        assert!(mock.validate().is_ok());
    }

    #[test]
    fn test_from_json_with_string_body() {
        let json = r#"{
            "request": {
                "method": "POST",
                "url": "https://example.com",
                "headers": {},
                "body": "raw string body"
            },
            "response": {
                "statusCode": 201,
                "headers": {},
                "body": "created"
            }
        }"#;
        let mock = MockFile::from_json(json.as_bytes()).unwrap();
        assert_eq!(
            mock.request.body,
            serde_json::Value::String("raw string body".to_string())
        );
        assert_eq!(
            mock.response.body,
            serde_json::Value::String("created".to_string())
        );
    }
}
