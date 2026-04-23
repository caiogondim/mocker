use clap::Parser;
use std::collections::{HashMap, HashSet};
use std::fmt;
use std::path::PathBuf;
use std::str::FromStr;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Mode {
    Read,
    Write,
    ReadWrite,
    Pass,
    ReadPass,
    PassRead,
}

impl FromStr for Mode {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "read" => Ok(Self::Read),
            "write" => Ok(Self::Write),
            "read-write" => Ok(Self::ReadWrite),
            "pass" => Ok(Self::Pass),
            "read-pass" => Ok(Self::ReadPass),
            "pass-read" => Ok(Self::PassRead),
            other => Err(format!(
                "Invalid mode '{other}'. Valid values: read, write, read-write, pass, read-pass, pass-read"
            )),
        }
    }
}

impl fmt::Display for Mode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Read => write!(f, "read"),
            Self::Write => write!(f, "write"),
            Self::ReadWrite => write!(f, "read-write"),
            Self::Pass => write!(f, "pass"),
            Self::ReadPass => write!(f, "read-pass"),
            Self::PassRead => write!(f, "pass-read"),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Update {
    Off,
    Startup,
    Only,
}

impl FromStr for Update {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "off" => Ok(Self::Off),
            "startup" => Ok(Self::Startup),
            "only" => Ok(Self::Only),
            other => Err(format!(
                "Invalid update '{other}'. Valid values: off, startup, only"
            )),
        }
    }
}

impl fmt::Display for Update {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Off => write!(f, "off"),
            Self::Startup => write!(f, "startup"),
            Self::Only => write!(f, "only"),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LogLevel {
    Verbose,
    Silent,
}

impl FromStr for LogLevel {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "verbose" => Ok(Self::Verbose),
            "silent" => Ok(Self::Silent),
            other => Err(format!(
                "Invalid log level '{other}'. Valid values: verbose, silent"
            )),
        }
    }
}

impl fmt::Display for LogLevel {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Verbose => write!(f, "verbose"),
            Self::Silent => write!(f, "silent"),
        }
    }
}

#[derive(Parser, Debug, Clone)]
#[command(name = "mocker", version, about = "HTTP mock proxy")]
pub struct Args {
    #[arg(long)]
    pub origin: String,

    #[arg(long, default_value = "8273")]
    pub port: u16,

    #[arg(long, default_value = ".")]
    pub mocks_dir: String,

    #[arg(long, default_value = "pass")]
    pub mode: Mode,

    #[arg(long, default_value = "off")]
    pub update: Update,

    #[arg(long, default_value = "0")]
    pub delay: u64,

    #[arg(long, default_value = "0")]
    pub throttle: u64,

    #[arg(long, default_value = "0")]
    pub retries: u32,

    #[arg(long, default_value = "url,method")]
    pub mock_keys: String,

    #[arg(long, default_value = "verbose")]
    pub logging: LogLevel,

    #[arg(long, default_value = "false")]
    pub cors: bool,

    #[arg(long, default_value = "")]
    pub proxy: String,

    #[arg(long, default_value = "{}")]
    pub redacted_headers: String,

    #[arg(long, default_value = "{}")]
    pub overwrite_response_headers: String,

    #[arg(long)]
    pub overwrite_request_headers: Option<String>,
}

#[derive(Debug, Clone)]
pub struct ValidatedArgs {
    pub origin: String,
    pub port: u16,
    pub mocks_dir: PathBuf,
    pub mode: Mode,
    pub update: Update,
    pub delay: u64,
    pub throttle: u64,
    pub retries: u32,
    pub mock_keys: HashSet<String>,
    pub logging: LogLevel,
    pub cors: bool,
    pub proxy: String,
    pub redacted_headers: HashMap<String, serde_json::Value>,
    pub overwrite_response_headers: HashMap<String, serde_json::Value>,
    pub overwrite_request_headers: HashMap<String, serde_json::Value>,
}

impl Args {
    pub fn validate(&self) -> Result<ValidatedArgs, String> {
        // Validate origin
        if !self.origin.starts_with("http://") && !self.origin.starts_with("https://") {
            return Err(format!(
                "Origin must start with http:// or https://, got: {}",
                self.origin
            ));
        }

        // Resolve mocks_dir to absolute path
        let mocks_dir = if PathBuf::from(&self.mocks_dir).is_absolute() {
            PathBuf::from(&self.mocks_dir)
        } else {
            std::env::current_dir()
                .map_err(|e| format!("Failed to get current directory: {e}"))?
                .join(&self.mocks_dir)
        };

        // Parse mock_keys
        let mock_keys: HashSet<String> = self
            .mock_keys
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();

        // Parse redacted_headers
        let redacted_headers: HashMap<String, serde_json::Value> =
            serde_json::from_str(&self.redacted_headers)
                .map_err(|e| format!("Invalid redacted_headers JSON: {e}"))?;

        // Parse overwrite_response_headers
        let overwrite_response_headers: HashMap<String, serde_json::Value> =
            serde_json::from_str(&self.overwrite_response_headers)
                .map_err(|e| format!("Invalid overwrite_response_headers JSON: {e}"))?;

        // Parse overwrite_request_headers, defaulting to host from origin
        let overwrite_request_headers: HashMap<String, serde_json::Value> =
            if let Some(json_str) = &self.overwrite_request_headers {
                serde_json::from_str(json_str)
                    .map_err(|e| format!("Invalid overwrite_request_headers JSON: {e}"))?
            } else {
                // Extract host from origin URL
                let mut default_headers = HashMap::new();
                if let Some(host) = extract_host(&self.origin) {
                    default_headers.insert("host".to_string(), serde_json::Value::String(host));
                }
                default_headers
            };

        Ok(ValidatedArgs {
            origin: self.origin.clone(),
            port: self.port,
            mocks_dir,
            mode: self.mode,
            update: self.update,
            delay: self.delay,
            throttle: self.throttle,
            retries: self.retries,
            mock_keys,
            logging: self.logging,
            cors: self.cors,
            proxy: self.proxy.clone(),
            redacted_headers,
            overwrite_response_headers,
            overwrite_request_headers,
        })
    }
}

fn extract_host(origin: &str) -> Option<String> {
    // Strip scheme
    let without_scheme = origin
        .strip_prefix("https://")
        .or_else(|| origin.strip_prefix("http://"))?;
    // Take everything before the first '/'
    let host = without_scheme.split('/').next()?;
    if host.is_empty() {
        None
    } else {
        Some(host.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_args(origin: &str) -> Args {
        Args {
            origin: origin.to_string(),
            port: 8273,
            mocks_dir: ".".to_string(),
            mode: Mode::Pass,
            update: Update::Off,
            delay: 0,
            throttle: 0,
            retries: 0,
            mock_keys: "url,method".to_string(),
            logging: LogLevel::Verbose,
            cors: false,
            proxy: String::new(),
            redacted_headers: "{}".to_string(),
            overwrite_response_headers: "{}".to_string(),
            overwrite_request_headers: None,
        }
    }

    #[test]
    fn test_default_values() {
        let args = make_args("http://example.com");
        assert_eq!(args.port, 8273);
        assert_eq!(args.mode, Mode::Pass);
        assert_eq!(args.update, Update::Off);
        assert_eq!(args.delay, 0);
        assert_eq!(args.throttle, 0);
        assert_eq!(args.retries, 0);
        assert_eq!(args.logging, LogLevel::Verbose);
        assert!(!args.cors);
    }

    #[test]
    fn test_mode_parsing_read() {
        assert_eq!("read".parse::<Mode>().unwrap(), Mode::Read);
    }

    #[test]
    fn test_mode_parsing_write() {
        assert_eq!("write".parse::<Mode>().unwrap(), Mode::Write);
    }

    #[test]
    fn test_mode_parsing_read_write() {
        assert_eq!("read-write".parse::<Mode>().unwrap(), Mode::ReadWrite);
    }

    #[test]
    fn test_mode_parsing_pass() {
        assert_eq!("pass".parse::<Mode>().unwrap(), Mode::Pass);
    }

    #[test]
    fn test_mode_parsing_read_pass() {
        assert_eq!("read-pass".parse::<Mode>().unwrap(), Mode::ReadPass);
    }

    #[test]
    fn test_mode_parsing_pass_read() {
        assert_eq!("pass-read".parse::<Mode>().unwrap(), Mode::PassRead);
    }

    #[test]
    fn test_mode_parsing_invalid() {
        assert!("invalid".parse::<Mode>().is_err());
    }

    #[test]
    fn test_update_parsing_off() {
        assert_eq!("off".parse::<Update>().unwrap(), Update::Off);
    }

    #[test]
    fn test_update_parsing_startup() {
        assert_eq!("startup".parse::<Update>().unwrap(), Update::Startup);
    }

    #[test]
    fn test_update_parsing_only() {
        assert_eq!("only".parse::<Update>().unwrap(), Update::Only);
    }

    #[test]
    fn test_update_parsing_invalid() {
        assert!("invalid".parse::<Update>().is_err());
    }

    #[test]
    fn test_invalid_origin_no_scheme() {
        let args = make_args("example.com");
        assert!(args.validate().is_err());
    }

    #[test]
    fn test_invalid_origin_ftp() {
        let args = make_args("ftp://example.com");
        assert!(args.validate().is_err());
    }

    #[test]
    fn test_valid_origin_http() {
        let args = make_args("http://example.com");
        assert!(args.validate().is_ok());
    }

    #[test]
    fn test_valid_origin_https() {
        let args = make_args("https://example.com");
        assert!(args.validate().is_ok());
    }

    #[test]
    fn test_mock_keys_parsing() {
        let args = make_args("http://example.com");
        let validated = args.validate().unwrap();
        assert!(validated.mock_keys.contains("url"));
        assert!(validated.mock_keys.contains("method"));
        assert_eq!(validated.mock_keys.len(), 2);
    }

    #[test]
    fn test_mock_keys_parsing_custom() {
        let mut args = make_args("http://example.com");
        args.mock_keys = "url,method,body".to_string();
        let validated = args.validate().unwrap();
        assert_eq!(validated.mock_keys.len(), 3);
        assert!(validated.mock_keys.contains("body"));
    }

    #[test]
    fn test_default_overwrite_request_headers_host() {
        let args = make_args("http://api.example.com");
        let validated = args.validate().unwrap();
        assert_eq!(
            validated.overwrite_request_headers.get("host"),
            Some(&serde_json::Value::String("api.example.com".to_string()))
        );
    }

    #[test]
    fn test_default_overwrite_request_headers_host_with_port() {
        let args = make_args("http://api.example.com:3000");
        let validated = args.validate().unwrap();
        assert_eq!(
            validated.overwrite_request_headers.get("host"),
            Some(&serde_json::Value::String(
                "api.example.com:3000".to_string()
            ))
        );
    }

    #[test]
    fn test_mocks_dir_resolved_to_absolute() {
        let args = make_args("http://example.com");
        let validated = args.validate().unwrap();
        assert!(validated.mocks_dir.is_absolute());
    }

    #[test]
    fn test_extract_host() {
        assert_eq!(
            extract_host("http://example.com"),
            Some("example.com".to_string())
        );
        assert_eq!(
            extract_host("https://example.com/path"),
            Some("example.com".to_string())
        );
        assert_eq!(
            extract_host("http://localhost:3000"),
            Some("localhost:3000".to_string())
        );
    }

    #[test]
    fn test_log_level_parsing() {
        assert_eq!("verbose".parse::<LogLevel>().unwrap(), LogLevel::Verbose);
        assert_eq!("silent".parse::<LogLevel>().unwrap(), LogLevel::Silent);
        assert!("invalid".parse::<LogLevel>().is_err());
    }

    #[test]
    fn test_mode_display() {
        assert_eq!(Mode::Read.to_string(), "read");
        assert_eq!(Mode::ReadWrite.to_string(), "read-write");
        assert_eq!(Mode::PassRead.to_string(), "pass-read");
    }

    #[test]
    fn test_update_display() {
        assert_eq!(Update::Off.to_string(), "off");
        assert_eq!(Update::Startup.to_string(), "startup");
        assert_eq!(Update::Only.to_string(), "only");
    }
}
