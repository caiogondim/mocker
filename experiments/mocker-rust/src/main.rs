mod args;
mod error;
mod http;
mod mock;
mod proxy;
mod server;
mod stream;
mod util;

use std::sync::Arc;

use clap::Parser;
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper_util::rt::TokioIo;
use tokio::net::TcpListener;

use args::Args;
use mock::manager::MockManager;
use server::{handle_request, AppState};

#[tokio::main]
async fn main() {
    let cli_args = Args::parse();
    let validated_args = match cli_args.validate() {
        Ok(args) => args,
        Err(e) => {
            eprintln!("Error: {e}");
            std::process::exit(1);
        }
    };

    // Set log level
    match validated_args.logging {
        args::LogLevel::Verbose => util::logger::set_level(util::logger::LogLevel::Verbose),
        args::LogLevel::Silent => util::logger::set_level(util::logger::LogLevel::Silent),
    }

    // Log startup configuration
    util::logger::info(&format!(
        "mode={}, origin={}, mocks_dir={}, delay={}ms, throttle={} bps, retries={}, cors={}",
        validated_args.mode,
        validated_args.origin,
        validated_args.mocks_dir.display(),
        validated_args.delay,
        validated_args.throttle,
        validated_args.retries,
        validated_args.cors,
    ));

    // Handle update modes
    match validated_args.update {
        args::Update::Only => {
            util::logger::info("update mode is 'only', exiting after update");
            return;
        }
        args::Update::Startup => {
            util::logger::info("update mode is 'startup', updating mocks before starting");
        }
        args::Update::Off => {}
    }

    // Create mock manager
    let mock_manager = MockManager::new(
        validated_args.mocks_dir.clone(),
        validated_args.mock_keys.clone(),
        validated_args.redacted_headers.clone(),
    );

    // Create shared HTTP client
    let http_client =
        hyper_util::client::legacy::Client::builder(hyper_util::rt::TokioExecutor::new())
            .build_http();

    // Create shared state
    let state = Arc::new(AppState {
        args: validated_args.clone(),
        mock_manager,
        http_client,
    });

    let addr = std::net::SocketAddr::from(([0, 0, 0, 0], validated_args.port));
    let listener = match TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(e) => {
            util::logger::error(&format!("failed to bind to {addr}: {e}"));
            std::process::exit(1);
        }
    };

    util::logger::info(&format!(
        "started on port {}, with pid {}, and proxying {}",
        validated_args.port,
        std::process::id(),
        validated_args.origin,
    ));

    // Set up signal handling
    let accept_loop = async {
        loop {
            match listener.accept().await {
                Ok((stream, _)) => {
                    let io = TokioIo::new(stream);
                    let state = state.clone();
                    tokio::spawn(async move {
                        let _ = http1::Builder::new()
                            .serve_connection(
                                io,
                                service_fn(move |req| {
                                    let state = state.clone();
                                    async move { handle_request(req, state).await }
                                }),
                            )
                            .await;
                    });
                }
                Err(e) => {
                    util::logger::error(&format!("failed to accept connection: {e}"));
                }
            }
        }
    };

    tokio::select! {
        _ = accept_loop => {},
        _ = tokio::signal::ctrl_c() => {
            util::logger::info("closing mocker \u{1f44b}");
        }
    }
}
