use tokio::net::{TcpListener, TcpStream};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use serde_json;
use anyhow::{Result, Context};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use crate::types::{NetworkMessage, Post, Config};
use crate::crypto::CryptoManager;
use crate::database::Database;
use crate::tor::TorManager;
use sodiumoxide::crypto::box_;

pub struct NetworkManager {
    port: u16,
    tor_enabled: bool,
    tor_socks_port: u16,
    _crypto: CryptoManager,
    peers: Arc<Mutex<HashMap<String, PeerInfo>>>,
    message_handlers: Arc<Mutex<Vec<Box<dyn MessageHandler>>>>,
    tor_manager: Option<TorManager>,
}

#[derive(Debug, Clone)]
pub struct PeerInfo {
    pub node_id: String,
    pub public_key: box_::PublicKey,
    pub address: String,
    pub port: u16,
    pub last_seen: u64,
    pub is_tor_peer: bool,
}

pub trait MessageHandler: Send + Sync {
    fn handle_post(&self, post: &Post) -> Result<()>;
    fn handle_config(&self, config: &Config) -> Result<()>;
    fn handle_ping(&self, node_id: &str) -> Result<()>;
    fn handle_pong(&self, node_id: &str) -> Result<()>;
}

impl NetworkManager {
    pub fn new(port: u16, tor_socks_port: u16) -> Self {
        Self {
            port,
            tor_enabled: false,
            tor_socks_port,
            _crypto: CryptoManager::new(),
            peers: Arc::new(Mutex::new(HashMap::new())),
            message_handlers: Arc::new(Mutex::new(Vec::new())),
            tor_manager: None,
        }
    }
    
    pub async fn enable_tor(&mut self) -> Result<()> {
        let mut tor_config = crate::tor::TorConfig::default();
        tor_config.socks_port = self.tor_socks_port;
        tor_config.enabled = true;
        
        let mut tor_manager = TorManager::new(tor_config);
        tor_manager.enable().await?;
        
        self.tor_manager = Some(tor_manager);
        self.tor_enabled = true;
        
        println!("🔒 Tor SOCKS5 Proxy aktiviert auf Port {}", self.tor_socks_port);
        Ok(())
    }
    
    pub fn disable_tor(&mut self) {
        self.tor_enabled = false;
        self.tor_manager = None;
        println!("🔓 Tor SOCKS5 Proxy deaktiviert");
    }
    
    pub fn is_tor_enabled(&self) -> bool {
        self.tor_enabled
    }
    
    pub fn add_message_handler(&self, handler: Box<dyn MessageHandler>) {
        let mut handlers = self.message_handlers.lock().unwrap();
        handlers.push(handler);
    }
    
    pub async fn start_server(&self) -> Result<()> {
        let listener = TcpListener::bind(format!("0.0.0.0:{}", self.port))
            .await
            .context("Failed to bind to port")?;
        
        println!("🌐 Brezn P2P Server gestartet auf Port {}", self.port);
        
        loop {
            match listener.accept().await {
                Ok((socket, addr)) => {
                    println!("📡 Neue Verbindung von: {}", addr);
                    let network_manager = Arc::new(Mutex::new(self.clone()));
                    tokio::spawn(async move {
                        if let Err(e) = Self::handle_connection(socket, network_manager).await {
                            eprintln!("Connection error: {}", e);
                        }
                    });
                }
                Err(e) => {
                    eprintln!("Accept error: {}", e);
                }
            }
        }
    }
    
    async fn handle_connection(
        mut socket: TcpStream,
        network_manager: Arc<Mutex<NetworkManager>>,
    ) -> Result<()> {
        let mut buffer = Vec::new();
        let mut temp_buffer = [0u8; 1024];
        
        loop {
            let n = socket.read(&mut temp_buffer).await
                .context("Failed to read from socket")?;
            
            if n == 0 {
                break; // Connection closed
            }
            
            buffer.extend_from_slice(&temp_buffer[..n]);
            
            // Try to parse complete messages and consume them from the buffer
            while let Some(message) = Self::extract_message(&mut buffer)? {
                let message_clone = message.clone();
                let network_manager_clone = {
                    let network_manager = network_manager.lock().unwrap();
                    network_manager.clone()
                }; // Lock is released here
                network_manager_clone.handle_message(&message_clone).await?;
            }
        }
        
        Ok(())
    }
    
    fn extract_message(buffer: &mut Vec<u8>) -> Result<Option<NetworkMessage>> {
        // Simple message format: length + JSON
        if buffer.len() < 4 {
            return Ok(None);
        }
        
        let length = u32::from_be_bytes([buffer[0], buffer[1], buffer[2], buffer[3]]) as usize;
        
        if buffer.len() < 4 + length {
            return Ok(None);
        }
        
        let message_data = buffer[4..4 + length].to_vec();
        let message: NetworkMessage = serde_json::from_slice(&message_data)
            .context("Failed to parse message")?;
        // Consume the bytes we just parsed (length header + payload)
        buffer.drain(0..4 + length);
        
        Ok(Some(message))
    }
    
    async fn handle_message(&self, message: &NetworkMessage) -> Result<()> {
        let handlers = self.message_handlers.lock().unwrap();
        
        for handler in handlers.iter() {
            match message.message_type.as_str() {
                "post" => {
                    if let Ok(post) = serde_json::from_value::<Post>(message.payload.clone()) {
                        handler.handle_post(&post)?;
                    }
                }
                "config" => {
                    if let Ok(config) = serde_json::from_value::<Config>(message.payload.clone()) {
                        handler.handle_config(&config)?;
                    }
                }
                "ping" => {
                    handler.handle_ping(&message.node_id)?;
                }
                "pong" => {
                    handler.handle_pong(&message.node_id)?;
                }
                _ => {
                    eprintln!("Unknown message type: {}", message.message_type);
                }
            }
        }
        
        Ok(())
    }
    
    pub async fn broadcast_post(&self, post: &Post) -> Result<()> {
        let message = NetworkMessage {
            message_type: "post".to_string(),
            payload: serde_json::to_value(post)?,
            timestamp: chrono::Utc::now().timestamp() as u64,
            node_id: "local".to_string(),
        };
        
        self.broadcast_message(&message).await
    }
    
    pub async fn broadcast_config(&self, config: &Config) -> Result<()> {
        let message = NetworkMessage {
            message_type: "config".to_string(),
            payload: serde_json::to_value(config)?,
            timestamp: chrono::Utc::now().timestamp() as u64,
            node_id: "local".to_string(),
        };
        
        self.broadcast_message(&message).await
    }
    
    async fn broadcast_message(&self, message: &NetworkMessage) -> Result<()> {
        let peers = self.peers.lock().unwrap();
        
        for (_, peer) in peers.iter() {
            if let Err(e) = self.send_message_to_peer(message, peer).await {
                eprintln!("Failed to send message to peer {}: {}", peer.node_id, e);
            }
        }
        
        Ok(())
    }
    
    async fn send_message_to_peer(&self, message: &NetworkMessage, peer: &PeerInfo) -> Result<()> {
        let stream = if peer.is_tor_peer && self.tor_enabled {
            // Use Tor connection
            if let Some(ref tor_manager) = self.tor_manager {
                tor_manager.connect_through_tor(&peer.address, peer.port).await?
            } else {
                return Err(anyhow::anyhow!("Tor not available"));
            }
        } else {
            // Direct connection
            TcpStream::connect(format!("{}:{}", peer.address, peer.port)).await
                .context("Failed to connect to peer")?
        };
        
        let message_json = serde_json::to_string(message)?;
        let message_bytes = message_json.as_bytes();
        let length = message_bytes.len() as u32;
        
        // Send length + message
        let mut stream = stream;
        stream.write_all(&length.to_be_bytes()).await?;
        stream.write_all(message_bytes).await?;
        
        Ok(())
    }
    
    pub fn add_peer(&self, node_id: String, public_key: box_::PublicKey, address: String, port: u16, is_tor_peer: bool) {
        let mut peers = self.peers.lock().unwrap();
        peers.insert(node_id.clone(), PeerInfo {
            node_id,
            public_key,
            address,
            port,
            last_seen: chrono::Utc::now().timestamp() as u64,
            is_tor_peer,
        });
    }
    
    pub fn remove_peer(&self, node_id: &str) {
        let mut peers = self.peers.lock().unwrap();
        peers.remove(node_id);
    }
    
    pub fn get_peers(&self) -> Vec<PeerInfo> {
        let peers = self.peers.lock().unwrap();
        peers.values().cloned().collect()
    }
    
    pub async fn test_tor_connection(&self) -> Result<()> {
        if let Some(ref tor_manager) = self.tor_manager {
            tor_manager.test_connection().await.map_err(|e| anyhow::anyhow!("Tor test failed: {}", e))
        } else {
            Err(anyhow::anyhow!("Tor not enabled"))
        }
    }
    
    pub async fn get_external_ip(&self) -> Result<String> {
        if let Some(ref tor_manager) = self.tor_manager {
            tor_manager.get_external_ip().await.map_err(|e| anyhow::anyhow!("Tor IP failed: {}", e))
        } else {
            Err(anyhow::anyhow!("Tor not enabled"))
        }
    }
}

impl Clone for NetworkManager {
    fn clone(&self) -> Self {
        Self {
            port: self.port,
            tor_enabled: self.tor_enabled,
            tor_socks_port: self.tor_socks_port,
            _crypto: CryptoManager::new(),
            peers: Arc::clone(&self.peers),
            message_handlers: Arc::clone(&self.message_handlers),
            tor_manager: self.tor_manager.clone(),
        }
    }
}

// Default message handler implementation
pub struct DefaultMessageHandler {
    pub node_id: String,
    pub database: Arc<Mutex<Database>>,
}

impl DefaultMessageHandler {
    pub fn new(node_id: String, database: Arc<Mutex<Database>>) -> Self {
        Self { node_id, database }
    }
}

impl MessageHandler for DefaultMessageHandler {
    fn handle_post(&self, post: &Post) -> Result<()> {
        println!("📨 Neuer Post von {}: {}", post.pseudonym, post.content);
        
        // Save post to database
        let db = self.database.lock().unwrap();
        db.add_post(&post.clone())?;
        
        println!("💾 Post in Datenbank gespeichert");
        Ok(())
    }
    
    fn handle_config(&self, _config: &Config) -> Result<()> {
        println!("⚙️  Konfiguration aktualisiert");
        Ok(())
    }
    
    fn handle_ping(&self, node_id: &str) -> Result<()> {
        println!("🏓 Ping von Node: {}", node_id);
        Ok(())
    }
    
    fn handle_pong(&self, node_id: &str) -> Result<()> {
        println!("🏓 Pong von Node: {}", node_id);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{NetworkMessage, Post, Config};
    use std::sync::{Arc, Mutex};

    struct TestHandler {
        handled_posts: Arc<Mutex<Vec<Post>>>,
        handled_configs: Arc<Mutex<Vec<Config>>>,
        handled_pings: Arc<Mutex<Vec<String>>>,
        handled_pongs: Arc<Mutex<Vec<String>>>,
    }

    impl TestHandler {
        fn new() -> Self {
            Self {
                handled_posts: Arc::new(Mutex::new(Vec::new())),
                handled_configs: Arc::new(Mutex::new(Vec::new())),
                handled_pings: Arc::new(Mutex::new(Vec::new())),
                handled_pongs: Arc::new(Mutex::new(Vec::new())),
            }
        }
    }

    impl MessageHandler for TestHandler {
        fn handle_post(&self, post: &Post) -> anyhow::Result<()> {
            self.handled_posts.lock().unwrap().push(post.clone());
            Ok(())
        }
        fn handle_config(&self, config: &Config) -> anyhow::Result<()> {
            self.handled_configs.lock().unwrap().push(config.clone());
            Ok(())
        }
        fn handle_ping(&self, node_id: &str) -> anyhow::Result<()> {
            self.handled_pings.lock().unwrap().push(node_id.to_string());
            Ok(())
        }
        fn handle_pong(&self, node_id: &str) -> anyhow::Result<()> {
            self.handled_pongs.lock().unwrap().push(node_id.to_string());
            Ok(())
        }
    }

    #[test]
    fn test_extract_message_none_for_short_buffer() {
        let mut buffer: Vec<u8> = vec![0, 1, 2];
        let result = NetworkManager::extract_message(&mut buffer).unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_extract_message_valid_message() {
        let msg = NetworkMessage {
            message_type: "post".to_string(),
            payload: serde_json::json!({"content": "hello", "timestamp": 1u64, "pseudonym": "u", "node_id": "n"}),
            timestamp: 123,
            node_id: "local".to_string(),
        };
        let json = serde_json::to_vec(&msg).unwrap();
        let mut buffer = Vec::new();
        let len = (json.len() as u32).to_be_bytes();
        buffer.extend_from_slice(&len);
        buffer.extend_from_slice(&json);

        let result = NetworkManager::extract_message(&mut buffer).unwrap();
        assert!(result.is_some());
        let parsed = result.unwrap();
        assert_eq!(parsed.message_type, "post");
        assert_eq!(parsed.node_id, "local");
    }

    #[tokio::test]
    async fn test_handle_message_routes_to_handlers() {
        let manager = NetworkManager::new(0, 9050);
        let handler = TestHandler::new();
        let posts_ref = handler.handled_posts.clone();
        let configs_ref = handler.handled_configs.clone();
        let pings_ref = handler.handled_pings.clone();
        let pongs_ref = handler.handled_pongs.clone();
        manager.add_message_handler(Box::new(handler));

        // post
        let post = Post { id: None, content: "c".into(), timestamp: 1, pseudonym: "p".into(), node_id: Some("n".into()) };
        let post_msg = NetworkMessage { message_type: "post".into(), payload: serde_json::to_value(&post).unwrap(), timestamp: 1, node_id: "nid".into() };
        manager.handle_message(&post_msg).await.unwrap();

        // config
        let cfg = Config { auto_save: true, max_posts: 1, default_pseudonym: "x".into(), network_enabled: false, network_port: 1, tor_enabled: false, tor_socks_port: 9050 };
        let cfg_msg = NetworkMessage { message_type: "config".into(), payload: serde_json::to_value(&cfg).unwrap(), timestamp: 1, node_id: "nid".into() };
        manager.handle_message(&cfg_msg).await.unwrap();

        // ping
        let ping_msg = NetworkMessage { message_type: "ping".into(), payload: serde_json::json!({}), timestamp: 1, node_id: "ping_node".into() };
        manager.handle_message(&ping_msg).await.unwrap();

        // pong
        let pong_msg = NetworkMessage { message_type: "pong".into(), payload: serde_json::json!({}), timestamp: 1, node_id: "pong_node".into() };
        manager.handle_message(&pong_msg).await.unwrap();

        assert_eq!(posts_ref.lock().unwrap().len(), 1);
        assert_eq!(configs_ref.lock().unwrap().len(), 1);
        assert_eq!(pings_ref.lock().unwrap().as_slice(), &["ping_node".to_string()]);
        assert_eq!(pongs_ref.lock().unwrap().as_slice(), &["pong_node".to_string()]);
    }

    #[test]
    fn test_peer_add_remove() {
        let manager = NetworkManager::new(0, 9050);
        let (pubk, _seck) = CryptoManager::new().generate_keypair().unwrap();
        manager.add_peer("id1".into(), pubk, "127.0.0.1".into(), 1234, false);
        assert_eq!(manager.get_peers().len(), 1);
        manager.remove_peer("id1");
        assert_eq!(manager.get_peers().len(), 0);
    }
}