use bytes::Bytes;
use http_body_util::{BodyExt, Full};
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper::{body::Incoming, Request, Response};
use hyper_util::rt::TokioIo;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::TcpListener;

struct Config {
    origin: String,
    client: reqwest::Client,
}

async fn proxy(
    req: Request<Incoming>,
    config: Arc<Config>,
) -> Result<Response<Full<Bytes>>, Box<dyn std::error::Error + Send + Sync>> {
    let method = req.method().clone();
    let uri = req.uri().clone();
    let path_and_query = uri.path_and_query().map(|pq| pq.as_str()).unwrap_or("/");
    let target_url = format!("{}{}", config.origin, path_and_query);

    // Capture headers before consuming the body
    let headers = req.headers().clone();

    // Collect incoming body
    let body_bytes = req.collect().await?.to_bytes();

    let mut builder = config.client.request(method.clone(), &target_url);

    // Forward all headers, skip hop-by-hop only
    for (name, value) in headers.iter() {
        let name_lower = name.as_str().to_lowercase();
        match name_lower.as_str() {
            "connection" | "transfer-encoding" => continue,
            _ => {
                builder = builder.header(name.clone(), value.clone());
            }
        }
    }

    if !body_bytes.is_empty() {
        builder = builder.body(body_bytes.to_vec());
    }

    let upstream_resp = builder.send().await?;

    // Build response back
    let status = upstream_resp.status();
    let mut response_builder = Response::builder().status(status.as_u16());

    for (name, value) in upstream_resp.headers().iter() {
        let name_lower = name.as_str().to_lowercase();
        match name_lower.as_str() {
            "transfer-encoding" | "connection" => continue,
            _ => {
                response_builder = response_builder.header(name.clone(), value.clone());
            }
        }
    }

    let resp_body = upstream_resp.bytes().await?;
    let response = response_builder.body(Full::new(resp_body))?;

    let log_status = response.status().as_u16();
    eprintln!("{} {} -> {}", method, path_and_query, log_status);

    Ok(response)
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().collect();

    if args.len() != 3 {
        eprintln!("usage: rust-proxy <origin> <port>");
        eprintln!("  origin: upstream HTTPS URL (e.g. https://api.example.com)");
        eprintln!("  port:   local port to listen on");
        std::process::exit(1);
    }

    let origin = args[1].clone();
    let port: u16 = args[2].parse()?;

    let client = reqwest::Client::builder()
        .use_rustls_tls()
        .build()?;

    let config = Arc::new(Config { origin: origin.clone(), client });

    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let listener = TcpListener::bind(addr).await?;
    eprintln!("rust-proxy listening on http://{}", addr);
    eprintln!("forwarding to {} via rustls", origin);

    loop {
        let (stream, _) = listener.accept().await?;
        let io = TokioIo::new(stream);
        let config = config.clone();

        tokio::task::spawn(async move {
            let service = service_fn(move |req| {
                let config = config.clone();
                proxy(req, config)
            });
            if let Err(err) = http1::Builder::new()
                .serve_connection(io, service)
                .await
            {
                eprintln!("connection error: {:?}", err);
            }
        });
    }
}
