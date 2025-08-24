mod database;
mod network;
mod api;
mod types;
mod crypto;
mod discovery;
mod qr;

use actix_web::{web, App, HttpServer, middleware::Logger};
use std::sync::Arc;
use tokio::sync::Mutex;
use anyhow::Result;

use crate::database::Database;
use crate::network::NetworkManager;
use crate::discovery::DiscoveryManager;
use crate::types::Config;

#[derive(Clone)]
pub struct AppState {
    pub db: Arc<Database>,
    pub network: Arc<Mutex<NetworkManager>>,
    pub discovery: Arc<Mutex<DiscoveryManager>>,
    pub config: Arc<Config>,
}

#[actix_web::main]
async fn main() -> Result<()> {
    env_logger::init_from_env(env_logger::Env::new().default_filter_or("info"));
    
    log::info!("🚀 Starting Brezn MVP Server...");
    
    // Initialize configuration
    let config = Arc::new(Config::default());
    
    // Initialize database
    let db = Arc::new(Database::new("brezn.db")?);
    
    // Initialize network manager
    let network = Arc::new(Mutex::new(NetworkManager::new(
        config.network_port,
        db.clone(),
    )));
    
    // Initialize discovery manager
    let discovery = Arc::new(Mutex::new(DiscoveryManager::new(
        config.discovery_port,
    )));
    
    // Create app state
    let app_state = AppState {
        db,
        network: network.clone(),
        discovery: discovery.clone(),
        config: config.clone(),
    };
    
    // Start network if enabled
    if config.network_enabled {
        let mut net = network.lock().await;
        net.start().await?;
        log::info!("✅ P2P network started on port {}", config.network_port);
    }
    
    // Start discovery if enabled
    if config.discovery_enabled {
        let mut disc = discovery.lock().await;
        disc.start().await?;
        log::info!("✅ Discovery service started on port {}", config.discovery_port);
    }
    
    log::info!("🌐 Starting HTTP server on http://localhost:8080");
    
    // Start HTTP server
    HttpServer::new(move || {
        App::new()
            .wrap(Logger::default())
            .app_data(web::Data::new(app_state.clone()))
            .configure(api::configure)
    })
    .bind("127.0.0.1:8080")?
    .run()
    .await?;
    
    Ok(())
}