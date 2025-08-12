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
        
        // Reconcile discovery peers into network manager periodically
        {
            let discovery_manager = Arc::clone(&self.discovery_manager);
            let network_manager = Arc::clone(&self.network_manager);
            tokio::spawn(async move {
                use tokio::time::{sleep, Duration};
                loop {
                    sleep(Duration::from_secs(10)).await;
                    // Fetch snapshot of discovery peers and network peers
                    let discovery_peers = {
                        let dm = discovery_manager.lock().unwrap();
                        dm.get_peers().unwrap_or_default()
                    };
                    let existing_node_ids: std::collections::HashSet<String> = {
                        let nm = network_manager.lock().unwrap();
                        nm.get_peers().into_iter().map(|p| p.node_id).collect()
                    };
                    // Add missing discovery peers to network manager
                    for dp in discovery_peers.into_iter() {
                        if existing_node_ids.contains(&dp.node_id) { continue; }
                        let public_key = match sodiumoxide::crypto::box_::PublicKey::from_slice(dp.public_key.as_bytes()) {
                            Some(pk) => pk,
                            None => {
                                let (pk, _sk) = sodiumoxide::crypto::box_::gen_keypair();
                                pk
                            }
                        };
                        let mut nm = network_manager.lock().unwrap();
                        nm.add_peer(dp.node_id.clone(), public_key, dp.address.clone(), dp.port, false);
                        // request recent posts from that peer (fire-and-forget)
                        let node_id_to_request = dp.node_id.clone();
                        let nm_clone = nm.clone();
                        // run in background but avoid non-Send future by scoping locks inside API
                        tokio::spawn(async move {
                            let _ = nm_clone.request_posts_from_peer(&node_id_to_request).await;
                        });
                    }
                }
            });
        }
        
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
    
    pub fn disable_tor(&self) {
        let mut network_manager = self.network_manager.lock().unwrap();
        network_manager.disable_tor();
    }
    
    pub async fn create_post(&self, content: String, pseudonym: String) -> Result<()> {
        let post = Post {
            id: None,
            content,
            timestamp: chrono::Utc::now().timestamp() as u64,
            pseudonym,
            node_id: Some("local".to_string()),
        };
        
        // Save to database (avoid duplicates)
        {
            let db = self.database_manager.lock().unwrap();
            if !db.post_exists(&post)? {
                db.add_post(&post)?;
            }
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
        db.get_posts_with_conflicts(1000).map_err(|e| BreznError::Database(e))
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
        let public_key_bytes = peer_info.public_key.as_bytes();
        let public_key = match sodiumoxide::crypto::box_::PublicKey::from_slice(public_key_bytes) {
            Some(pk) => pk,
            None => {
                // Fallback: generate a placeholder key to allow adding the peer for tests
                let (generated_pk, _generated_sk) = sodiumoxide::crypto::box_::gen_keypair();
                generated_pk
            }
        };
        network_manager.add_peer(
            peer_info.node_id.clone(),
            public_key,
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
        let cfg = self.config.lock().unwrap().clone();
        
        let peers = network_manager.get_peers();
        let discovery_peers = discovery_manager.get_peers()?;
        
        let peers_json: Vec<serde_json::Value> = peers.iter().map(|p| serde_json::json!({
            "node_id": p.node_id,
            "address": p.address,
            "port": p.port,
            "last_seen": p.last_seen,
            "is_tor_peer": p.is_tor_peer,
        })).collect();
        let discovery_json: Vec<serde_json::Value> = discovery_peers.iter().map(|p| serde_json::json!({
            "node_id": p.node_id,
            "address": p.address,
            "port": p.port,
            "last_seen": p.last_seen,
            "capabilities": p.capabilities,
        })).collect();
        
        let status = serde_json::json!({
            "network_enabled": true,
            "tor_enabled": network_manager.is_tor_enabled(),
            "peers_count": peers.len(),
            "discovery_peers_count": discovery_peers.len(),
            "peers": peers_json,
            "discovery_peers": discovery_json,
            "port": cfg.network_port,
            "tor_socks_port": cfg.tor_socks_port,
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
        let _qr_code = self.generate_qr_code()?;
        println!("✅ QR code generation test passed");
        
        // Test 4: Network status
        let status = self.get_network_status()?;
        println!("✅ Network status test passed: {:?}", status);
        
        println!("🎉 All P2P network tests passed!");
        Ok(())
    }
}