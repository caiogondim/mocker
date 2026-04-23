use std::path::PathBuf;

#[derive(Debug, thiserror::Error)]
#[allow(clippy::enum_variant_names)]
pub enum MockerError {
    #[error("mock get failed for {mock_path:?}: {cause}")]
    MockGetError {
        mock_path: PathBuf,
        cause: Box<dyn std::error::Error + Send + Sync>,
    },
    #[error("mock file error for {mock_path:?}: {cause}")]
    MockFileError {
        mock_path: PathBuf,
        cause: Box<dyn std::error::Error + Send + Sync>,
    },
    #[error("missing key '{key}' in redacted_headers")]
    SecretNotFoundError { key: String },
    #[error("origin responded with status {status_code}")]
    OriginResponseError { status_code: u16 },
    #[error(transparent)]
    IoError(#[from] std::io::Error),
    #[error(transparent)]
    JsonError(#[from] serde_json::Error),
    #[error("HTTP error: {0}")]
    HttpError(String),
    #[error("validation error: {0}")]
    ValidationError(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_display_mock_get_error() {
        let err = MockerError::MockGetError {
            mock_path: PathBuf::from("/tmp/mock.json"),
            cause: Box::new(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "not found",
            )),
        };
        let msg = format!("{err}");
        assert!(msg.contains("/tmp/mock.json"));
        assert!(msg.contains("not found"));
    }

    #[test]
    fn test_display_mock_file_error() {
        let err = MockerError::MockFileError {
            mock_path: PathBuf::from("/tmp/mock.json"),
            cause: Box::new(std::io::Error::new(
                std::io::ErrorKind::PermissionDenied,
                "permission denied",
            )),
        };
        let msg = format!("{err}");
        assert!(msg.contains("/tmp/mock.json"));
        assert!(msg.contains("permission denied"));
    }

    #[test]
    fn test_display_secret_not_found() {
        let err = MockerError::SecretNotFoundError {
            key: "API_KEY".to_string(),
        };
        assert!(format!("{err}").contains("API_KEY"));
    }

    #[test]
    fn test_display_origin_response_error() {
        let err = MockerError::OriginResponseError { status_code: 503 };
        assert!(format!("{err}").contains("503"));
    }

    #[test]
    fn test_display_http_error() {
        let err = MockerError::HttpError("connection refused".to_string());
        assert!(format!("{err}").contains("connection refused"));
    }

    #[test]
    fn test_display_validation_error() {
        let err = MockerError::ValidationError("missing field".to_string());
        assert!(format!("{err}").contains("missing field"));
    }

    #[test]
    fn test_from_io_error() {
        let io_err = std::io::Error::new(std::io::ErrorKind::NotFound, "file not found");
        let err: MockerError = io_err.into();
        assert!(matches!(err, MockerError::IoError(_)));
        assert!(format!("{err}").contains("file not found"));
    }

    #[test]
    fn test_from_json_error() {
        let json_err = serde_json::from_str::<serde_json::Value>("invalid json").unwrap_err();
        let err: MockerError = json_err.into();
        assert!(matches!(err, MockerError::JsonError(_)));
    }

    #[test]
    fn test_error_source_io_transparent() {
        // With #[error(transparent)], source() delegates to the inner io::Error's source().
        // A simple string-based io::Error has no source, so this returns None.
        let io_err = std::io::Error::new(std::io::ErrorKind::NotFound, "not found");
        let err = MockerError::IoError(io_err);
        assert!(std::error::Error::source(&err).is_none());
    }

    #[test]
    fn test_error_source_none() {
        let err = MockerError::HttpError("test".to_string());
        assert!(std::error::Error::source(&err).is_none());
    }

    #[test]
    fn test_error_debug() {
        let err = MockerError::HttpError("test".to_string());
        let debug = format!("{err:?}");
        assert!(debug.contains("HttpError"));
    }
}
