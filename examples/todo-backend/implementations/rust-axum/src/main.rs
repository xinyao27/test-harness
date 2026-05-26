use std::{env, net::SocketAddr};
use todo_backend_rust_axum::create_app;
use tokio::net::TcpListener;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let host = env::var("HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
    let port = env::var("PORT").unwrap_or_else(|_| "3102".to_string());
    let address: SocketAddr = format!("{host}:{port}").parse()?;
    let listener = TcpListener::bind(address).await?;

    println!("Todo-Backend Rust Axum listening on http://{address}/todos");
    axum::serve(listener, create_app()).await?;
    Ok(())
}
