/// Apply an async delay if `delay_ms` > 0. A value of 0 means no delay.
pub async fn apply_delay(delay_ms: u64) {
    if delay_ms > 0 {
        tokio::time::sleep(std::time::Duration::from_millis(delay_ms)).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_zero_delay_is_instant() {
        let start = std::time::Instant::now();
        apply_delay(0).await;
        let elapsed = start.elapsed();
        // 0ms delay should complete in well under 10ms
        assert!(elapsed.as_millis() < 10);
    }

    #[tokio::test]
    async fn test_nonzero_delay() {
        let start = std::time::Instant::now();
        apply_delay(50).await;
        let elapsed = start.elapsed();
        // Should take at least ~50ms
        assert!(elapsed.as_millis() >= 45);
    }
}
