pub mod crypto;
pub mod database;
pub mod discovery;
pub mod error;
pub mod network;
pub mod tor;
pub mod types;
pub mod ui_extensions;

use crate::error::{Result, BreznError};
use crate::network::{NetworkManager, DefaultMessageHandler};
use crate::discovery::{DiscoveryManager, DiscoveryConfig};
use crate::database::Database;
use crate::crypto::CryptoManager;
use crate::types::{Config, Post};
use std::sync::{Arc, Mutex};

pub struct BreznApp {
    pub network_manager: Arc<Mutex<NetworkManager>>,
    pub discovery_manager: Arc<Mutex<DiscoveryManager>>,
    pub database_manager: Arc<Mutex<Database>>,
    pub crypto_manager: Arc<Mutex<CryptoManager>>,
    pub config: Arc<Mutex<Config>>,
}

impl BreznApp {
    pub fn new(config: Config) -> Result<Self> {
        let crypto_manager = Arc::new(Mutex::new(CryptoManager::new()));
        let database_manager = Arc::new(Mutex::new(Database::new()?));
        let network_manager = Arc::new(Mutex::new(NetworkManager::new(
            config.network_port,
            config.tor_socks_port
        )));
        
        let discovery_config = DiscoveryConfig::default();
        let discovery_manager = Arc::new(Mutex::new(DiscoveryManager::new(
            discovery_config,
            uuid::Uuid::new_v4().to_string(),
            "public_key_placeholder".to_string(),
            config.network_port,
        )));
        
        let config = Arc::new(Mutex::new(config));
        
        Ok(Self {
            network_manager,
            discovery_manager,
            database_manager,
            crypto_manager,
            config,
        })
    }
    
    pub async fn start(&self) -> Result<()> {
        println!("🚀 Brezn App wird gestartet...");
        
        // Initialize database
        {
            let _db = self.database_manager.lock().unwrap();
            // Database is already initialized in new()
        }
        
        // Setup message handlers
        {
            let network_manager = self.network_manager.lock().unwrap();
            let database_manager = Arc::clone(&self.database_manager);
            let message_handler = DefaultMessageHandler::new("brezn_node".to_string(), database_manager);
            network_manager.add_message_handler(Box::new(message_handler));
        }
        
        // Start discovery in background
        let discovery_manager = Arc::clone(&self.discovery_manager);
        tokio::spawn(async move {
            let mut discovery = {
                let discovery = discovery_manager.lock().unwrap();
                discovery.clone()
            };
            if let Err(e) = discovery.start_discovery().await {
                eprintln!("Discovery error: {}", e);
            }
        });
        
        // Start network server in background
        let network_manager = Arc::clone(&self.network_manager);
        tokio::spawn(async move {
            let network = {
                let network = network_manager.lock().unwrap();
                network.clone()
            };
            if let Err(e) = network.start_server().await {
                eprintln!("Network error: {}", e);
            }
        });
        
        println!("✅ Brezn App gestartet");
        Ok(())
    }
    
    pub async fn enable_tor(&self) -> Result<()> {
        let mut network_manager = self.network_manager.lock().unwrap();
        network_manager.enable_tor().await.map_err(|e| BreznError::Network(std::io::Error::new(
            std::io::ErrorKind::Other, e.to_string()
        )))?;
        Ok(())
    }
    
    pub async fn create_post(&self, content: String, pseudonym: String) -> Result<()> {
        let post = Post {
            id: None,
            content,
            timestamp: chrono::Utc::now().timestamp() as u64,
            pseudonym,
            node_id: Some("local".to_string()),
        };
        
        // Save to database
        {
            let db = self.database_manager.lock().unwrap();
            db.add_post(&post)?;
        }
        
        // Broadcast to network
        {
            let network_manager = self.network_manager.lock().unwrap();
            network_manager.broadcast_post(&post).await.map_err(|e| BreznError::Network(std::io::Error::new(
                std::io::ErrorKind::Other, e.to_string()
            )))?;
        }
        
        println!("📝 Post erstellt und an Netzwerk gesendet");
        Ok(())
    }
    
    pub async fn get_posts(&self) -> Result<Vec<Post>> {
        let db = self.database_manager.lock().unwrap();
        db.get_posts(1000).map_err(|e| BreznError::Database(e))
    }
    
    pub fn generate_qr_code(&self) -> Result<String> {
        let discovery_manager = self.discovery_manager.lock().unwrap();
        discovery_manager.generate_qr_code()
    }
    
    pub fn parse_qr_code(&self, qr_data: &str) -> Result<()> {
        let discovery_manager = self.discovery_manager.lock().unwrap();
        let peer_info = discovery_manager.parse_qr_code(qr_data)?;
        
        // Add peer to network
        let network_manager = self.network_manager.lock().unwrap();
        network_manager.add_peer(
            peer_info.node_id.clone(),
            sodiumoxide::crypto::box_::PublicKey::from_slice(
                peer_info.public_key.as_bytes()
            ).unwrap_or_else(|| sodiumoxide::crypto::box_::PublicKey::from_slice(&[0u8; 32]).unwrap()),
            peer_info.address,
            peer_info.port,
            false, // Not a Tor peer for now
        );
        
        println!("➕ Peer aus QR-Code hinzugefügt: {}", peer_info.node_id);
        Ok(())
    }
    
    pub fn get_network_status(&self) -> Result<serde_json::Value> {
        let network_manager = self.network_manager.lock().unwrap();
        let discovery_manager = self.discovery_manager.lock().unwrap();
        
        let peers = network_manager.get_peers();
        let discovery_peers = discovery_manager.get_peers()?;
        
        let status = serde_json::json!({
            "network_enabled": true,
            "tor_enabled": network_manager.is_tor_enabled(),
            "peers_count": peers.len(),
            "discovery_peers_count": discovery_peers.len(),
            "port": 8888, // Default port
            "tor_socks_port": 9050, // Default Tor port
        });
        
        Ok(status)
    }
    
    pub async fn test_p2p_network(&self) -> Result<()> {
        println!("🧪 Testing P2P network functionality...");
        
        // Test 1: Create a post
        self.create_post("Test post from P2P test".to_string(), "tester".to_string()).await?;
        println!("✅ Post creation test passed");
        
        // Test 2: Get posts
        let posts = self.get_posts().await?;
        println!("✅ Posts retrieval test passed ({} posts)", posts.len());
        
        // Test 3: Generate QR code
        let qr_code = self.generate_qr_code()?;
        println!("✅ QR code generation test passed");
        
        // Test 4: Network status
        let status = self.get_network_status()?;
        println!("✅ Network status test passed: {:?}", status);
        
        println!("🎉 All P2P network tests passed!");
        Ok(())
    }
}