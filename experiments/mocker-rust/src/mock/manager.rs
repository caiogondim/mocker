use std::collections::{HashMap, HashSet};
use std::path::PathBuf;

use crate::error::MockerError;
use crate::http::body::{parse_body, serialize_body};
use crate::http::compression::decompress;
use crate::http::headers::{sanitize_request_headers, sanitize_response_headers, unredact_headers};
use crate::mock::file::{MockFile, MockRequest, MockResponse};
use crate::mock::path::generate_mock_path;

/// Result returned by `MockManager::get`.
pub struct MockGetResult {
    pub mock_path: PathBuf,
    pub status_code: u16,
    pub headers: HashMap<String, serde_json::Value>,
    pub body: Vec<u8>,
}

/// Manages reading and writing mock files on disk.
pub struct MockManager {
    mocks_dir: PathBuf,
    mock_keys: HashSet<String>,
    redacted_headers: HashMap<String, serde_json::Value>,
}

impl MockManager {
    /// Create a new `MockManager`.
    #[must_use]
    pub const fn new(
        mocks_dir: PathBuf,
        mock_keys: HashSet<String>,
        redacted_headers: HashMap<String, serde_json::Value>,
    ) -> Self {
        Self {
            mocks_dir,
            mock_keys,
            redacted_headers,
        }
    }

    /// Read a mock file from disk and return the response data.
    pub async fn get(
        &self,
        method: &str,
        url: &str,
        headers: &HashMap<String, String>,
        body: &[u8],
    ) -> Result<MockGetResult, MockerError> {
        // Parse body for mock path generation
        let parsed_body: Option<serde_json::Value> = serde_json::from_slice(body).ok();

        let mock_path = generate_mock_path(
            &self.mocks_dir,
            &self.mock_keys,
            method,
            url,
            headers,
            body,
            parsed_body.as_ref(),
        );

        // Read file from disk
        let data = tokio::fs::read(&mock_path)
            .await
            .map_err(|e| MockerError::MockGetError {
                mock_path: mock_path.clone(),
                cause: Box::new(e),
            })?;

        // Parse JSON
        let mock_file = MockFile::from_json(&data).map_err(|e| MockerError::MockFileError {
            mock_path: mock_path.clone(),
            cause: Box::new(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                e.to_string(),
            )),
        })?;

        // Validate
        mock_file.validate()?;

        // Unredact response headers
        let response_headers =
            unredact_headers(&mock_file.response.headers, &self.redacted_headers)?;

        // Determine content type for body serialization
        let content_type = response_headers
            .get("content-type")
            .and_then(|v| v.as_str())
            .unwrap_or("application/octet-stream");

        // Serialize body back to bytes
        let response_body = serialize_body(&mock_file.response.body, content_type);

        Ok(MockGetResult {
            mock_path,
            status_code: mock_file.response.status_code,
            headers: response_headers,
            body: response_body,
        })
    }

    /// Save a mock file to disk (atomic write via tmp + rename).
    pub async fn set(
        &self,
        method: &str,
        url: &str,
        req_headers: &HashMap<String, serde_json::Value>,
        req_body: &[u8],
        resp_status: u16,
        resp_headers: &HashMap<String, serde_json::Value>,
        resp_body: &[u8],
        content_encoding: &str,
    ) -> Result<PathBuf, MockerError> {
        // Parse request body for mock path generation
        let parsed_req_body: Option<serde_json::Value> = serde_json::from_slice(req_body).ok();

        // Build string headers for mock_path generation
        let string_headers: HashMap<String, String> = req_headers
            .iter()
            .map(|(k, v)| {
                let val = match v {
                    serde_json::Value::String(s) => s.clone(),
                    other => other.to_string(),
                };
                (k.clone(), val)
            })
            .collect();

        let mock_path = generate_mock_path(
            &self.mocks_dir,
            &self.mock_keys,
            method,
            url,
            &string_headers,
            req_body,
            parsed_req_body.as_ref(),
        );

        // Decompress response body
        let decompressed_body = decompress(resp_body, content_encoding)?;

        // Determine content types for body parsing
        let req_content_type = req_headers
            .get("content-type")
            .and_then(|v| v.as_str())
            .unwrap_or("application/octet-stream");

        let resp_content_type = resp_headers
            .get("content-type")
            .and_then(|v| v.as_str())
            .unwrap_or("application/octet-stream");

        // Parse bodies
        let parsed_request_body = parse_body(req_body, req_content_type);
        let parsed_response_body = parse_body(&decompressed_body, resp_content_type);

        // Sanitize headers
        let sanitized_req_headers = sanitize_request_headers(req_headers, &self.redacted_headers);
        let sanitized_resp_headers =
            sanitize_response_headers(resp_headers, &self.redacted_headers);

        // Build MockFile
        let mock_file = MockFile {
            request: MockRequest {
                method: method.to_string(),
                url: url.to_string(),
                headers: sanitized_req_headers,
                body: parsed_request_body,
            },
            response: MockResponse {
                status_code: resp_status,
                headers: sanitized_resp_headers,
                body: parsed_response_body,
            },
        };

        // Serialize to JSON
        let json = mock_file.to_json_pretty()?;

        // Ensure directory exists
        if let Some(parent) = mock_path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }

        // Atomic write: write to .tmp then rename
        let tmp_path = mock_path.with_extension("json.tmp");
        tokio::fs::write(&tmp_path, json.as_bytes()).await?;
        tokio::fs::rename(&tmp_path, &mock_path).await?;

        Ok(mock_path)
    }

    /// Delete all .json files in the mocks directory.
    pub async fn clear(&self) -> Result<(), MockerError> {
        let mut entries = tokio::fs::read_dir(&self.mocks_dir).await?;
        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("json") {
                tokio::fs::remove_file(&path).await?;
            }
        }
        Ok(())
    }

    /// Count the number of .json files in the mocks directory.
    pub async fn size(&self) -> Result<usize, MockerError> {
        let mut count = 0;
        let mut entries = tokio::fs::read_dir(&self.mocks_dir).await?;
        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("json") {
                count += 1;
            }
        }
        Ok(count)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;
    use tempfile::TempDir;

    fn make_manager(dir: &Path) -> MockManager {
        let mut mock_keys = HashSet::new();
        mock_keys.insert("method".to_string());
        mock_keys.insert("url".to_string());
        MockManager::new(dir.to_path_buf(), mock_keys, HashMap::new())
    }

    fn json_headers(pairs: &[(&str, &str)]) -> HashMap<String, serde_json::Value> {
        pairs
            .iter()
            .map(|(k, v)| (k.to_string(), serde_json::Value::String(v.to_string())))
            .collect()
    }

    #[tokio::test]
    async fn test_set_then_get_roundtrip() {
        let tmp = TempDir::new().unwrap();
        let manager = make_manager(tmp.path());

        let req_headers = json_headers(&[("content-type", "application/json")]);
        let resp_headers = json_headers(&[("content-type", "application/json")]);
        let req_body = br#"{"query": "test"}"#;
        let resp_body = br#"{"result": "ok"}"#;

        let mock_path = manager
            .set(
                "GET",
                "https://api.example.com/data",
                &req_headers,
                req_body,
                200,
                &resp_headers,
                resp_body,
                "",
            )
            .await
            .unwrap();

        assert!(mock_path.exists());

        // Now get it back
        let string_headers: HashMap<String, String> = req_headers
            .iter()
            .map(|(k, v)| (k.to_string(), v.as_str().unwrap_or_default().to_string()))
            .collect();

        let result = manager
            .get(
                "GET",
                "https://api.example.com/data",
                &string_headers,
                req_body,
            )
            .await
            .unwrap();

        assert_eq!(result.status_code, 200);
        // The body should contain the response JSON
        let body_value: serde_json::Value = serde_json::from_slice(&result.body).unwrap();
        assert_eq!(body_value["result"], "ok");
    }

    #[tokio::test]
    async fn test_get_returns_error_for_missing_mock() {
        let tmp = TempDir::new().unwrap();
        let manager = make_manager(tmp.path());

        let result = manager
            .get(
                "GET",
                "https://api.example.com/nonexistent",
                &HashMap::new(),
                b"",
            )
            .await;

        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_set_creates_valid_json_file() {
        let tmp = TempDir::new().unwrap();
        let manager = make_manager(tmp.path());

        let req_headers = json_headers(&[("content-type", "text/plain")]);
        let resp_headers = json_headers(&[("content-type", "text/plain")]);

        let mock_path = manager
            .set(
                "POST",
                "https://api.example.com/submit",
                &req_headers,
                b"hello",
                201,
                &resp_headers,
                b"created",
                "",
            )
            .await
            .unwrap();

        // Read and parse the file to verify it's valid JSON
        let data = tokio::fs::read(&mock_path).await.unwrap();
        let mock_file = MockFile::from_json(&data).unwrap();
        assert_eq!(mock_file.request.method, "POST");
        assert_eq!(mock_file.response.status_code, 201);
    }

    #[tokio::test]
    async fn test_clear_removes_all_mocks() {
        let tmp = TempDir::new().unwrap();
        let manager = make_manager(tmp.path());

        let req_headers = json_headers(&[("content-type", "text/plain")]);
        let resp_headers = json_headers(&[("content-type", "text/plain")]);

        // Create a couple of mocks
        manager
            .set(
                "GET",
                "https://a.com/1",
                &req_headers,
                b"",
                200,
                &resp_headers,
                b"ok",
                "",
            )
            .await
            .unwrap();
        manager
            .set(
                "GET",
                "https://a.com/2",
                &req_headers,
                b"",
                200,
                &resp_headers,
                b"ok",
                "",
            )
            .await
            .unwrap();

        let count = manager.size().await.unwrap();
        assert_eq!(count, 2);

        manager.clear().await.unwrap();

        let count = manager.size().await.unwrap();
        assert_eq!(count, 0);
    }

    #[tokio::test]
    async fn test_size_counts_correctly() {
        let tmp = TempDir::new().unwrap();
        let manager = make_manager(tmp.path());

        assert_eq!(manager.size().await.unwrap(), 0);

        let req_headers = json_headers(&[("content-type", "text/plain")]);
        let resp_headers = json_headers(&[("content-type", "text/plain")]);

        manager
            .set(
                "GET",
                "https://a.com/one",
                &req_headers,
                b"",
                200,
                &resp_headers,
                b"ok",
                "",
            )
            .await
            .unwrap();
        assert_eq!(manager.size().await.unwrap(), 1);

        manager
            .set(
                "POST",
                "https://a.com/two",
                &req_headers,
                b"",
                200,
                &resp_headers,
                b"ok",
                "",
            )
            .await
            .unwrap();
        assert_eq!(manager.size().await.unwrap(), 2);
    }

    #[tokio::test]
    async fn test_atomic_write_produces_valid_file() {
        let tmp = TempDir::new().unwrap();
        let manager = make_manager(tmp.path());

        let req_headers = json_headers(&[("content-type", "application/json")]);
        let resp_headers = json_headers(&[("content-type", "application/json")]);

        let mock_path = manager
            .set(
                "PUT",
                "https://api.example.com/update",
                &req_headers,
                br#"{"id": 1}"#,
                200,
                &resp_headers,
                br#"{"updated": true}"#,
                "",
            )
            .await
            .unwrap();

        // The .tmp file should not exist after atomic write
        let tmp_path = mock_path.with_extension("json.tmp");
        assert!(!tmp_path.exists());

        // The final file should be valid JSON
        let data = tokio::fs::read(&mock_path).await.unwrap();
        let mock_file = MockFile::from_json(&data).unwrap();
        assert!(mock_file.validate().is_ok());
    }

    #[tokio::test]
    async fn test_size_ignores_non_json_files() {
        let tmp = TempDir::new().unwrap();
        let manager = make_manager(tmp.path());

        // Create a non-json file
        tokio::fs::write(tmp.path().join("readme.txt"), b"hello")
            .await
            .unwrap();

        assert_eq!(manager.size().await.unwrap(), 0);
    }

    #[tokio::test]
    async fn test_clear_ignores_non_json_files() {
        let tmp = TempDir::new().unwrap();
        let manager = make_manager(tmp.path());

        let txt_path = tmp.path().join("readme.txt");
        tokio::fs::write(&txt_path, b"hello").await.unwrap();

        let req_headers = json_headers(&[("content-type", "text/plain")]);
        let resp_headers = json_headers(&[("content-type", "text/plain")]);
        manager
            .set(
                "GET",
                "https://a.com/x",
                &req_headers,
                b"",
                200,
                &resp_headers,
                b"ok",
                "",
            )
            .await
            .unwrap();

        manager.clear().await.unwrap();

        // Non-json file should still exist
        assert!(txt_path.exists());
        assert_eq!(manager.size().await.unwrap(), 0);
    }
}
