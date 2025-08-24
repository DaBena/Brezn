use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

pub mod error;
pub mod types;
pub mod database;
pub mod network;
pub mod discovery;
pub mod qr;

use crate::error::Result;
use crate::types::{Config, Post, NetworkStatus};
use crate::database::Database;
use crate::network::NetworkManager;
use crate::discovery::DiscoveryManager;
use crate::qr::QRCodeManager;

pub struct BreznApp {
    config: Config,
    database: Arc<Database>,
    network_manager: Arc<Mutex<Option<Arc<NetworkManager>>>>,
    discovery_manager: Arc<Mutex<Option<DiscoveryManager>>>,
    qr_manager: Arc<Mutex<Option<QRCodeManager>>>,
}

impl BreznApp {
    pub fn new(config: Config) -> Result<Self> {
        let database = Arc::new(Database::new()?);
        
        Ok(Self {
            config,
            database,
            network_manager: Arc::new(Mutex::new(None)),
            discovery_manager: Arc::new(Mutex::new(None)),
            qr_manager: Arc::new(Mutex::new(None)),
        })
    }

    pub async fn start(&self) -> Result<()> {
        println!("🚀 Starting Brezn application...");

        // Initialize network manager
        let network_manager = Arc::new(NetworkManager::new(self.config.network_port, self.database.clone()));
        if self.config.network_enabled {
            network_manager.start().await?;
        }
        *self.network_manager.lock().unwrap() = Some(network_manager);

        // Initialize discovery manager
        let mut discovery_manager = DiscoveryManager::new(
            "node-".to_string() + &uuid::Uuid::new_v4().to_string()[..8],
            self.config.discovery_port,
            self.config.network_port,
        );
        if self.config.discovery_enabled {
            discovery_manager.start().await?;
        }
        *self.discovery_manager.lock().unwrap() = Some(discovery_manager);

        // Initialize QR manager
        let qr_manager = QRCodeManager::new(
            "node-".to_string() + &uuid::Uuid::new_v4().to_string()[..8],
            "public-key-placeholder".to_string(),
            self.config.network_port,
        );
        *self.qr_manager.lock().unwrap() = Some(qr_manager);

        println!("✅ Brezn application started successfully");
        Ok(())
    }

    // Post management
    pub fn create_post(&self, content: String, pseudonym: Option<String>) -> Result<i64> {
        let post = Post {
            id: None,
            content,
            pseudonym: pseudonym.unwrap_or(self.config.default_pseudonym.clone()),
            timestamp: SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs(),
            node_id: None,
        };

        let post_id = self.database.create_post(&post)?;
        
        // Broadcast to network if enabled
        if self.config.network_enabled {
            if let Some(network_manager) = self.network_manager.lock().unwrap().clone() {
                let mut post_with_id = post;
                post_with_id.id = Some(post_id);
                tokio::spawn(async move {
                    if let Err(e) = network_manager.broadcast_post(&post_with_id).await {
                        eprintln!("Failed to broadcast post: {}", e);
                    }
                });
            }
        }

        Ok(post_id)
    }

    pub fn get_posts(&self) -> Result<Vec<Post>> {
        self.database.get_all_posts()
    }

    pub fn delete_post(&self, id: i64) -> Result<()> {
        self.database.delete_post(id)
    }

    // Network management
    pub fn get_network_status(&self) -> NetworkStatus {
        if let Some(network_manager) = self.network_manager.lock().unwrap().as_ref() {
            network_manager.get_network_status()
        } else {
            NetworkStatus {
                is_enabled: false,
                peer_count: 0,
                last_sync: None,
                bytes_sent: 0,
                bytes_received: 0,
            }
        }
    }

    pub async fn connect_to_peer(&self, address: String, port: u16) -> Result<()> {
        if let Some(network_manager) = self.network_manager.lock().unwrap().as_ref() {
            network_manager.connect_to_peer(&address, port).await
        } else {
            Err(crate::error::BreznError::Network("Network not enabled".to_string()))
        }
    }

    pub fn get_peers(&self) -> Vec<crate::types::PeerInfo> {
        if let Some(network_manager) = self.network_manager.lock().unwrap().as_ref() {
            network_manager.get_peers()
        } else {
            Vec::new()
        }
    }

    // QR Code functionality
    pub fn generate_qr_code(&self) -> Result<String> {
        if let Some(qr_manager) = self.qr_manager.lock().unwrap().as_ref() {
            qr_manager.generate_peer_qr()
        } else {
            Err(crate::error::BreznError::QrCode("QR manager not initialized".to_string()))
        }
    }

    pub fn parse_qr_code(&self, qr_data: String) -> Result<(String, u16)> {
        if let Some(qr_manager) = self.qr_manager.lock().unwrap().as_ref() {
            // Try simple join format first
            if let Ok((address, port)) = qr_manager.parse_simple_join_qr(&qr_data) {
                return Ok((address, port));
            }
            // Try full peer format
            if let Ok(peer_data) = qr_manager.parse_peer_qr(&qr_data) {
                return Ok((peer_data.address, peer_data.port));
            }
            Err(crate::error::BreznError::QrCode("Invalid QR code format".to_string()))
        } else {
            Err(crate::error::BreznError::QrCode("QR manager not initialized".to_string()))
        }
    }

    // Configuration
    pub fn get_config(&self) -> &Config {
        &self.config
    }

    pub fn update_config(&mut self, new_config: Config) {
        self.config = new_config;
    }

    // Discovery functionality
    pub fn get_discovered_peers(&self) -> Vec<crate::types::PeerInfo> {
        if let Some(discovery_manager) = self.discovery_manager.lock().unwrap().as_ref() {
            discovery_manager.get_peers()
        } else {
            Vec::new()
        }
    }

    pub fn get_discovery_peer_count(&self) -> usize {
        if let Some(discovery_manager) = self.discovery_manager.lock().unwrap().as_ref() {
            discovery_manager.get_peer_count()
        } else {
            0
        }
    }
}