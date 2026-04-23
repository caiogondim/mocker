/// Exponential backoff calculator.
pub struct Backoff {
    initial: u64,
    max: u64,
    current: u64,
}

impl Backoff {
    /// Create a new `Backoff` with the given initial and maximum delay in milliseconds.
    #[must_use]
    pub const fn new(initial: u64, max: u64) -> Self {
        Self {
            initial,
            max,
            current: initial,
        }
    }

    /// Return the current delay, then double it (capped at max).
    #[allow(clippy::should_implement_trait)]
    pub fn next(&mut self) -> u64 {
        let delay = self.current;
        self.current = (self.current.saturating_mul(2)).min(self.max);
        delay
    }

    /// Reset the delay back to the initial value.
    pub const fn reset(&mut self) {
        self.current = self.initial;
    }
}

impl Default for Backoff {
    fn default() -> Self {
        Self::new(1000, 30000)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new() {
        let b = Backoff::new(100, 5000);
        assert_eq!(b.initial, 100);
        assert_eq!(b.max, 5000);
        assert_eq!(b.current, 100);
    }

    #[test]
    fn test_default() {
        let b = Backoff::default();
        assert_eq!(b.initial, 1000);
        assert_eq!(b.max, 30000);
        assert_eq!(b.current, 1000);
    }

    #[test]
    fn test_doubling() {
        let mut b = Backoff::new(100, 10000);
        assert_eq!(b.next(), 100);
        assert_eq!(b.next(), 200);
        assert_eq!(b.next(), 400);
        assert_eq!(b.next(), 800);
        assert_eq!(b.next(), 1600);
        assert_eq!(b.next(), 3200);
        assert_eq!(b.next(), 6400);
    }

    #[test]
    fn test_capping_at_max() {
        let mut b = Backoff::new(100, 300);
        assert_eq!(b.next(), 100);
        assert_eq!(b.next(), 200);
        assert_eq!(b.next(), 300); // capped
        assert_eq!(b.next(), 300); // stays at max
        assert_eq!(b.next(), 300);
    }

    #[test]
    fn test_reset() {
        let mut b = Backoff::new(100, 10000);
        b.next();
        b.next();
        b.next();
        assert_eq!(b.current, 800);

        b.reset();
        assert_eq!(b.current, 100);
        assert_eq!(b.next(), 100);
        assert_eq!(b.next(), 200);
    }

    #[test]
    fn test_initial_equals_max() {
        let mut b = Backoff::new(500, 500);
        assert_eq!(b.next(), 500);
        assert_eq!(b.next(), 500);
        assert_eq!(b.next(), 500);
    }

    #[test]
    fn test_zero_initial() {
        let mut b = Backoff::new(0, 1000);
        assert_eq!(b.next(), 0);
        assert_eq!(b.next(), 0); // 0 * 2 = 0
    }

    #[test]
    fn test_large_values_no_overflow() {
        let mut b = Backoff::new(u64::MAX / 2, u64::MAX);
        let first = b.next();
        assert_eq!(first, u64::MAX / 2);
        // saturating_mul should prevent overflow
        let second = b.next();
        assert!(second <= u64::MAX);
    }

    #[test]
    fn test_reset_after_cap() {
        let mut b = Backoff::new(100, 200);
        b.next(); // 100
        b.next(); // 200
        b.next(); // 200 (capped)
        b.reset();
        assert_eq!(b.next(), 100);
    }
}
