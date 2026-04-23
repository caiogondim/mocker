use crate::error::MockerError;
use flate2::read::{DeflateDecoder, GzDecoder};
use std::io::Read;

/// Decompress data according to the content-encoding header.
///
/// The content-encoding header is a comma-separated list of encoding tokens.
/// Decoders are applied in reverse order (per HTTP spec: encodings are listed
/// in the order they were applied, so we undo them last-to-first).
///
/// Supported encodings: gzip, deflate, br (brotli), identity (noop).
/// Unknown encodings are skipped.
/// Empty data returns an empty vec.
pub fn decompress(data: &[u8], content_encoding: &str) -> Result<Vec<u8>, MockerError> {
    if data.is_empty() {
        return Ok(Vec::new());
    }

    let encodings: Vec<&str> = content_encoding
        .split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .collect();

    let mut buf = data.to_vec();

    for encoding in encodings.iter().rev() {
        match encoding.to_lowercase().as_str() {
            "gzip" => {
                let mut gz_reader = GzDecoder::new(buf.as_slice());
                let mut output = Vec::new();
                gz_reader
                    .read_to_end(&mut output)
                    .map_err(MockerError::IoError)?;
                buf = output;
            }
            "deflate" => {
                let mut deflate_reader = DeflateDecoder::new(buf.as_slice());
                let mut output = Vec::new();
                deflate_reader
                    .read_to_end(&mut output)
                    .map_err(MockerError::IoError)?;
                buf = output;
            }
            "br" => {
                let mut output = Vec::new();
                let mut br_reader = brotli::Decompressor::new(buf.as_slice(), 4096);
                br_reader
                    .read_to_end(&mut output)
                    .map_err(MockerError::IoError)?;
                buf = output;
            }
            _ => {
                // Unknown encoding: skip
            }
        }
    }

    Ok(buf)
}

#[cfg(test)]
mod tests {
    use super::*;
    use flate2::write::GzEncoder;
    use flate2::Compression;
    use std::io::Write;

    fn gzip_compress(data: &[u8]) -> Vec<u8> {
        let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
        encoder.write_all(data).unwrap();
        encoder.finish().unwrap()
    }

    fn deflate_compress(data: &[u8]) -> Vec<u8> {
        use flate2::write::DeflateEncoder;
        let mut encoder = DeflateEncoder::new(Vec::new(), Compression::default());
        encoder.write_all(data).unwrap();
        encoder.finish().unwrap()
    }

    fn brotli_compress(data: &[u8]) -> Vec<u8> {
        let mut output = Vec::new();
        {
            let mut compressor = brotli::CompressorWriter::new(&mut output, 4096, 6, 22);
            compressor.write_all(data).unwrap();
        }
        output
    }

    #[test]
    fn test_empty_data() {
        let result = decompress(&[], "gzip").unwrap();
        assert!(result.is_empty());
    }

    #[test]
    fn test_identity() {
        let data = b"hello world";
        let result = decompress(data, "identity").unwrap();
        assert_eq!(result, data);
    }

    #[test]
    fn test_empty_encoding() {
        let data = b"hello world";
        let result = decompress(data, "").unwrap();
        assert_eq!(result, data);
    }

    #[test]
    fn test_gzip_round_trip() {
        let original = b"hello, gzip world!";
        let compressed = gzip_compress(original);
        let decompressed = decompress(&compressed, "gzip").unwrap();
        assert_eq!(decompressed, original);
    }

    #[test]
    fn test_deflate_round_trip() {
        let original = b"hello, deflate world!";
        let compressed = deflate_compress(original);
        let decompressed = decompress(&compressed, "deflate").unwrap();
        assert_eq!(decompressed, original);
    }

    #[test]
    fn test_brotli_round_trip() {
        let original = b"hello, brotli world!";
        let compressed = brotli_compress(original);
        let decompressed = decompress(&compressed, "br").unwrap();
        assert_eq!(decompressed, original);
    }

    #[test]
    fn test_unknown_encoding_skipped() {
        let data = b"raw data";
        let result = decompress(data, "unknown-encoding").unwrap();
        assert_eq!(result, data);
    }

    #[test]
    fn test_multiple_unknown_encodings() {
        let data = b"raw data";
        let result = decompress(data, "foo, bar, baz").unwrap();
        assert_eq!(result, data);
    }

    #[test]
    fn test_identity_with_spaces() {
        let data = b"hello";
        let result = decompress(data, " identity ").unwrap();
        assert_eq!(result, data);
    }

    #[test]
    fn test_case_insensitive() {
        let original = b"hello";
        let compressed = gzip_compress(original);
        let result = decompress(&compressed, "GZIP").unwrap();
        assert_eq!(result, original);
    }

    #[test]
    fn test_gzip_then_identity() {
        let original = b"test data";
        let compressed = gzip_compress(original);
        // identity applied first, then gzip - reverse order means gzip decoded first, then identity
        let result = decompress(&compressed, "gzip, identity").unwrap();
        assert_eq!(result, original);
    }
}
