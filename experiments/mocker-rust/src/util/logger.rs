use std::sync::atomic::{AtomicU8, Ordering};

static LOG_LEVEL: AtomicU8 = AtomicU8::new(LogLevel::Info as u8);

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
#[repr(u8)]
pub enum LogLevel {
    Silent = 0,
    Error = 1,
    Warn = 2,
    Info = 3,
    Verbose = 4,
}

impl LogLevel {
    const fn from_u8(val: u8) -> Self {
        match val {
            0 => Self::Silent,
            1 => Self::Error,
            2 => Self::Warn,
            4 => Self::Verbose,
            // 3 and any unknown value default to Info
            _ => Self::Info,
        }
    }
}

/// Set the global log level.
pub fn set_level(level: LogLevel) {
    LOG_LEVEL.store(level as u8, Ordering::Relaxed);
}

/// Get the current global log level.
pub fn get_level() -> LogLevel {
    LogLevel::from_u8(LOG_LEVEL.load(Ordering::Relaxed))
}

/// Log a message at the given level with a colored label.
pub fn log(level: LogLevel, label: &str, message: &str) {
    let current = get_level();
    if current == LogLevel::Silent || level > current {
        return;
    }

    let colored_label = match level {
        LogLevel::Error => format!("\x1b[31m{label}\x1b[0m"), // red
        LogLevel::Warn => format!("\x1b[33m{label}\x1b[0m"),  // yellow
        LogLevel::Info => format!("\x1b[34m{label}\x1b[0m"),  // blue
        LogLevel::Verbose => format!("\x1b[36m{label}\x1b[0m"), // cyan
        LogLevel::Silent => return,
    };

    eprintln!("{colored_label} {message}");
}

/// Log an info-level message.
pub fn info(message: &str) {
    log(LogLevel::Info, "info", message);
}

/// Log a warning-level message.
pub fn warn(message: &str) {
    log(LogLevel::Warn, "warn", message);
}

/// Log an error-level message.
pub fn error(message: &str) {
    log(LogLevel::Error, "error", message);
}

/// Log a success message (info level, green label).
pub fn success(message: &str) {
    let current = get_level();
    if current == LogLevel::Silent || LogLevel::Info > current {
        return;
    }
    let label = "\x1b[32msuccess\x1b[0m";
    eprintln!("{label} {message}");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_log_level_ordering() {
        assert!(LogLevel::Silent < LogLevel::Error);
        assert!(LogLevel::Error < LogLevel::Warn);
        assert!(LogLevel::Warn < LogLevel::Info);
        assert!(LogLevel::Info < LogLevel::Verbose);
    }

    #[test]
    fn test_log_level_equality() {
        assert_eq!(LogLevel::Info, LogLevel::Info);
        assert_ne!(LogLevel::Info, LogLevel::Error);
    }

    #[test]
    fn test_set_and_get_level() {
        set_level(LogLevel::Verbose);
        assert_eq!(get_level(), LogLevel::Verbose);

        set_level(LogLevel::Error);
        assert_eq!(get_level(), LogLevel::Error);

        set_level(LogLevel::Silent);
        assert_eq!(get_level(), LogLevel::Silent);

        // Reset to default for other tests
        set_level(LogLevel::Info);
    }

    #[test]
    fn test_log_level_from_u8() {
        assert_eq!(LogLevel::from_u8(0), LogLevel::Silent);
        assert_eq!(LogLevel::from_u8(1), LogLevel::Error);
        assert_eq!(LogLevel::from_u8(2), LogLevel::Warn);
        assert_eq!(LogLevel::from_u8(3), LogLevel::Info);
        assert_eq!(LogLevel::from_u8(4), LogLevel::Verbose);
        assert_eq!(LogLevel::from_u8(255), LogLevel::Info); // fallback
    }

    #[test]
    fn test_log_level_repr() {
        assert_eq!(LogLevel::Silent as u8, 0);
        assert_eq!(LogLevel::Error as u8, 1);
        assert_eq!(LogLevel::Warn as u8, 2);
        assert_eq!(LogLevel::Info as u8, 3);
        assert_eq!(LogLevel::Verbose as u8, 4);
    }

    #[test]
    fn test_silent_suppresses_all() {
        // This test just verifies the function doesn't panic when silent
        set_level(LogLevel::Silent);
        info("should not print");
        warn("should not print");
        error("should not print");
        success("should not print");
        set_level(LogLevel::Info);
    }

    #[test]
    fn test_log_does_not_panic_at_any_level() {
        for &level in &[
            LogLevel::Silent,
            LogLevel::Error,
            LogLevel::Warn,
            LogLevel::Info,
            LogLevel::Verbose,
        ] {
            set_level(level);
            info("test");
            warn("test");
            error("test");
            success("test");
            log(LogLevel::Verbose, "verbose", "test");
        }
        set_level(LogLevel::Info);
    }

    #[test]
    fn test_log_level_clone_copy() {
        let level = LogLevel::Info;
        let cloned = level;
        let copied = level;
        assert_eq!(level, cloned);
        assert_eq!(level, copied);
    }

    #[test]
    fn test_log_level_debug() {
        let debug = format!("{:?}", LogLevel::Info);
        assert_eq!(debug, "Info");
    }
}
