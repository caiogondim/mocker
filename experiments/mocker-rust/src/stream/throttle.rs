use tokio::time::Instant;

/// A token bucket for rate limiting bytes per second.
pub struct TokenBucket {
    capacity: u64,
    tokens: u64,
    last_refill: Instant,
}

impl TokenBucket {
    /// Create a new token bucket with the given bytes-per-second rate.
    /// The bucket starts full (capacity = `bytes_per_second`).
    #[must_use]
    pub fn new(bytes_per_second: u64) -> Self {
        Self {
            capacity: bytes_per_second,
            tokens: bytes_per_second,
            last_refill: Instant::now(),
        }
    }

    /// Refill tokens based on elapsed time since last refill.
    #[allow(
        clippy::cast_possible_truncation,
        clippy::cast_sign_loss,
        clippy::cast_precision_loss
    )]
    fn refill(&mut self) {
        let now = Instant::now();
        let elapsed = now.duration_since(self.last_refill);
        let new_tokens = (elapsed.as_secs_f64() * self.capacity as f64) as u64;
        if new_tokens > 0 {
            self.tokens = (self.tokens + new_tokens).min(self.capacity);
            self.last_refill = now;
        }
    }

    /// Wait until `amount` tokens are available, then consume them.
    #[allow(clippy::cast_precision_loss)]
    pub async fn take(&mut self, amount: u64) {
        loop {
            self.refill();
            if self.tokens >= amount {
                self.tokens -= amount;
                return;
            }
            // Calculate how long to wait for enough tokens
            let deficit = amount - self.tokens;
            let wait_secs = deficit as f64 / self.capacity as f64;
            tokio::time::sleep(std::time::Duration::from_secs_f64(wait_secs)).await;
        }
    }
}

/// Throttle byte delivery to the given bytes-per-second rate.
/// If `throttle_bps` is 0, returns data immediately (no throttle).
#[allow(clippy::cast_possible_truncation)]
pub async fn throttle_bytes(data: &[u8], throttle_bps: u64) -> Vec<u8> {
    if throttle_bps == 0 || data.is_empty() {
        return data.to_vec();
    }

    let mut bucket = TokenBucket::new(throttle_bps);
    let chunk_size = ((throttle_bps / 10) as usize).max(1);
    let mut result = Vec::with_capacity(data.len());

    for chunk in data.chunks(chunk_size) {
        bucket.take(chunk.len() as u64).await;
        result.extend_from_slice(chunk);
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_zero_bps_no_throttle() {
        let data = vec![0u8; 1024];
        let start = std::time::Instant::now();
        let result = throttle_bytes(&data, 0).await;
        let elapsed = start.elapsed();
        assert_eq!(result.len(), 1024);
        assert!(elapsed.as_millis() < 10);
    }

    #[tokio::test]
    async fn test_throttle_bytes_returns_same_data() {
        let data: Vec<u8> = (0..100).collect();
        let result = throttle_bytes(&data, 10000).await;
        assert_eq!(result, data);
    }

    #[tokio::test]
    async fn test_throttle_bytes_empty() {
        let data: &[u8] = &[];
        let result = throttle_bytes(data, 100).await;
        assert!(result.is_empty());
    }

    #[test]
    fn test_token_bucket_new() {
        let bucket = TokenBucket::new(1000);
        assert_eq!(bucket.capacity, 1000);
        assert_eq!(bucket.tokens, 1000);
    }

    #[tokio::test]
    async fn test_token_bucket_take_immediate() {
        let mut bucket = TokenBucket::new(1000);
        let start = std::time::Instant::now();
        bucket.take(500).await;
        let elapsed = start.elapsed();
        // Should be near-instant since we have 1000 tokens
        assert!(elapsed.as_millis() < 10);
    }

    #[tokio::test]
    async fn test_token_bucket_take_waits_when_insufficient() {
        let mut bucket = TokenBucket::new(1000);
        // Drain the bucket
        bucket.take(1000).await;
        // Now taking more should require waiting
        let start = std::time::Instant::now();
        bucket.take(100).await;
        let elapsed = start.elapsed();
        // Should wait ~100ms for 100 tokens at 1000/sec
        assert!(elapsed.as_millis() >= 50);
    }

    #[tokio::test]
    async fn test_token_bucket_refills_over_time() {
        let mut bucket = TokenBucket::new(1000);
        bucket.take(1000).await;
        // Wait for refill
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        bucket.refill();
        // Should have ~200 tokens after 200ms at 1000/sec
        assert!(bucket.tokens >= 150);
        assert!(bucket.tokens <= 250);
    }
}
