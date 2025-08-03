use tokio::net::{TcpListener, TcpStream};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use serde_json;
use anyhow::{Result, Context};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use crate::types::{NetworkMessage, MessageType, Post, Config};
use crate::crypto::CryptoManager;
use sodiumoxide::crypto::box_;

pub struct NetworkManager {
    port: u16,
    tor_enabled: bool,
    tor_socks_port: u16,
    crypto: CryptoManager,
    peers: Arc<Mutex<HashMap<String, PeerInfo>>>,
    message_handlers: Arc<Mutex<Vec<Box<dyn MessageHandler>>>>,
}

#[derive(Debug, Clone)]
pub struct PeerInfo {
    pub node_id: String,
    pub public_key: box_::PublicKey,
    pub address: String,
    pub last_seen: u64,
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
            crypto: CryptoManager::new(),
            peers: Arc::new(Mutex::new(HashMap::new())),
            message_handlers: Arc::new(Mutex::new(Vec::new())),
        }
    }
    
    pub fn enable_tor(&mut self) {
        self.tor_enabled = true;
        println!("🔒 Tor SOCKS5 Proxy aktiviert auf Port {}", self.tor_socks_port);
    }
    
    pub fn disable_tor(&mut self) {
        self.tor_enabled = false;
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
            
            // Try to parse complete messages
            while let Some(message) = Self::extract_message(&buffer)? {
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
    
    fn extract_message(buffer: &[u8]) -> Result<Option<NetworkMessage>> {
        // Simple message format: length + JSON
        if buffer.len() < 4 {
            return Ok(None);
        }
        
        let length = u32::from_be_bytes([buffer[0], buffer[1], buffer[2], buffer[3]]) as usize;
        
        if buffer.len() < 4 + length {
            return Ok(None);
        }
        
        let message_data = &buffer[4..4 + length];
        let message: NetworkMessage = serde_json::from_slice(message_data)
            .context("Failed to parse message")?;
        
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
        let mut stream = TcpStream::connect(&peer.address).await
            .context("Failed to connect to peer")?;
        
        let message_json = serde_json::to_string(message)?;
        let message_bytes = message_json.as_bytes();
        let length = message_bytes.len() as u32;
        
        // Send length + message
        stream.write_all(&length.to_be_bytes()).await?;
        stream.write_all(message_bytes).await?;
        
        Ok(())
    }
    
    pub fn add_peer(&self, node_id: String, public_key: box_::PublicKey, address: String) {
        let mut peers = self.peers.lock().unwrap();
        peers.insert(node_id.clone(), PeerInfo {
            node_id,
            public_key,
            address,
            last_seen: chrono::Utc::now().timestamp() as u64,
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
}

impl Clone for NetworkManager {
    fn clone(&self) -> Self {
        Self {
            port: self.port,
            tor_enabled: self.tor_enabled,
            tor_socks_port: self.tor_socks_port,
            crypto: CryptoManager::new(),
            peers: Arc::clone(&self.peers),
            message_handlers: Arc::clone(&self.message_handlers),
        }
    }
}

// Default message handler implementation
pub struct DefaultMessageHandler {
    pub node_id: String,
}

impl DefaultMessageHandler {
    pub fn new(node_id: String) -> Self {
        Self { node_id }
    }
}

impl MessageHandler for DefaultMessageHandler {
    fn handle_post(&self, post: &Post) -> Result<()> {
        println!("📨 Neuer Post von {}: {}", post.pseudonym, post.content);
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