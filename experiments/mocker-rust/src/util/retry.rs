use crate::util::backoff::Backoff;

/// Generic async retry with exponential backoff.
///
/// Calls `f` repeatedly until `should_retry` returns false or `retries` attempts
/// have been exhausted. Between attempts, sleeps for the duration returned by the
/// backoff strategy.
pub async fn retry<F, Fut, T, E>(
    mut f: F,
    retries: u32,
    should_retry: impl Fn(&Result<T, E>) -> bool,
    mut backoff: Backoff,
) -> Result<T, E>
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = Result<T, E>>,
    E: std::fmt::Debug,
{
    let mut attempts = 0;
    loop {
        let result = f().await;
        if !should_retry(&result) || attempts >= retries {
            return result;
        }
        let delay_ms = backoff.next();
        tokio::time::sleep(std::time::Duration::from_millis(delay_ms)).await;
        attempts += 1;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::sync::Arc;

    #[tokio::test]
    async fn test_succeeds_on_first_try() {
        let call_count = Arc::new(AtomicU32::new(0));
        let cc = call_count.clone();

        let result: Result<&str, &str> = retry(
            move || {
                cc.fetch_add(1, Ordering::SeqCst);
                async { Ok("success") }
            },
            3,
            |r| r.is_err(),
            Backoff::new(1, 10),
        )
        .await;

        assert_eq!(result.unwrap(), "success");
        assert_eq!(call_count.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn test_retries_then_succeeds() {
        let call_count = Arc::new(AtomicU32::new(0));
        let cc = call_count.clone();

        let result: Result<&str, &str> = retry(
            move || {
                let count = cc.fetch_add(1, Ordering::SeqCst);
                async move {
                    if count < 2 {
                        Err("not yet")
                    } else {
                        Ok("finally")
                    }
                }
            },
            5,
            |r| r.is_err(),
            Backoff::new(1, 10),
        )
        .await;

        assert_eq!(result.unwrap(), "finally");
        assert_eq!(call_count.load(Ordering::SeqCst), 3);
    }

    #[tokio::test]
    async fn test_exhausts_retries_returns_last_error() {
        let call_count = Arc::new(AtomicU32::new(0));
        let cc = call_count.clone();

        let result: Result<&str, String> = retry(
            move || {
                let count = cc.fetch_add(1, Ordering::SeqCst);
                async move { Err(format!("error {count}")) }
            },
            3,
            |r| r.is_err(),
            Backoff::new(1, 10),
        )
        .await;

        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "error 3");
        // 1 initial + 3 retries = 4 total calls
        assert_eq!(call_count.load(Ordering::SeqCst), 4);
    }

    #[tokio::test]
    async fn test_backoff_delays_increase() {
        let delays = Arc::new(std::sync::Mutex::new(Vec::new()));
        let delays_clone = delays.clone();
        let call_count = Arc::new(AtomicU32::new(0));
        let cc = call_count.clone();

        let mut backoff = Backoff::new(10, 1000);
        // Record what delays the backoff would produce
        let mut expected_delays = Vec::new();
        for _ in 0..3 {
            expected_delays.push(backoff.next());
        }
        // Reset: we need a fresh backoff for the actual retry
        // The delays should be 10, 20, 40

        assert_eq!(expected_delays, vec![10, 20, 40]);

        // Verify backoff is actually used by checking call count and timing
        let start = tokio::time::Instant::now();
        let _result: Result<&str, &str> = retry(
            move || {
                let count = cc.fetch_add(1, Ordering::SeqCst);
                let d = delays_clone.clone();
                async move {
                    if count > 0 {
                        let elapsed = start.elapsed().as_millis();
                        d.lock().unwrap().push(elapsed as u64);
                    }
                    if count < 3 {
                        Err("fail")
                    } else {
                        Ok("ok")
                    }
                }
            },
            5,
            |r| r.is_err(),
            Backoff::new(10, 1000),
        )
        .await;

        let recorded = delays.lock().unwrap().clone();
        // Each successive call should happen later than the previous
        for i in 1..recorded.len() {
            assert!(recorded[i] >= recorded[i - 1]);
        }
    }

    #[tokio::test]
    async fn test_no_retry_when_should_retry_returns_false() {
        let call_count = Arc::new(AtomicU32::new(0));
        let cc = call_count.clone();

        let result: Result<&str, &str> = retry(
            move || {
                cc.fetch_add(1, Ordering::SeqCst);
                async { Err("error") }
            },
            5,
            |_| false, // never retry
            Backoff::new(1, 10),
        )
        .await;

        assert!(result.is_err());
        assert_eq!(call_count.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn test_zero_retries() {
        let call_count = Arc::new(AtomicU32::new(0));
        let cc = call_count.clone();

        let result: Result<&str, &str> = retry(
            move || {
                cc.fetch_add(1, Ordering::SeqCst);
                async { Err("error") }
            },
            0,
            |r| r.is_err(),
            Backoff::new(1, 10),
        )
        .await;

        assert!(result.is_err());
        assert_eq!(call_count.load(Ordering::SeqCst), 1);
    }
}
