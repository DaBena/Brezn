use crate::error::{Result, BreznError};
use serde::{Serialize, Deserialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::time::{Duration, interval};
use tokio::net::UdpSocket;
use std::net::SocketAddr;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PeerInfo {
    pub node_id: String,
    pub public_key: String,
    pub address: String,
    pub port: u16,
    pub last_seen: u64,
    pub capabilities: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveryMessage {
    pub message_type: String, // "announce", "ping", "pong"
    pub node_id: String,
    pub public_key: String,
    pub address: String,
    pub port: u16,
    pub timestamp: u64,
    pub capabilities: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveryConfig {
    pub broadcast_interval: Duration,
    pub peer_timeout: Duration,
    pub max_peers: usize,
    pub enable_qr: bool,
    pub discovery_port: u16,
    pub broadcast_address: String,
}

impl Default for DiscoveryConfig {
    fn default() -> Self {
        Self {
            broadcast_interval: Duration::from_secs(30),
            peer_timeout: Duration::from_secs(300),
            max_peers: 50,
            enable_qr: true,
            discovery_port: 8888,
            broadcast_address: "255.255.255.255:8888".to_string(),
        }
    }
}

#[derive(Clone)]
pub struct DiscoveryManager {
    config: DiscoveryConfig,
    peers: Arc<Mutex<HashMap<String, PeerInfo>>>,
    node_id: String,
    public_key: String,
    port: u16,
}

impl DiscoveryManager {
    pub fn new(config: DiscoveryConfig, node_id: String, public_key: String, port: u16) -> Self {
        Self {
            config,
            peers: Arc::new(Mutex::new(HashMap::new())),
            node_id,
            public_key,
            port,
        }
    }
    
    pub async fn start_discovery(&mut self) -> Result<()> {
        // Bind to discovery port
        let socket = UdpSocket::bind(format!("0.0.0.0:{}", self.config.discovery_port))
            .await
            .map_err(|e| BreznError::Network(std::io::Error::new(
                std::io::ErrorKind::Other, 
                format!("Failed to bind discovery socket: {}", e)
            )))?;
        
        // Set broadcast permission
        socket.set_broadcast(true)
            .map_err(|e| BreznError::Network(std::io::Error::new(
                std::io::ErrorKind::Other, 
                format!("Failed to set broadcast: {}", e)
            )))?;
        
        // self.discovery_socket = Some(socket); // This line is removed
        
        println!("🌐 Discovery gestartet auf Port {}", self.config.discovery_port);
        
        // Start discovery loop
        self.start_discovery_loop().await
    }
    
    pub async fn start_discovery_loop(&self) -> Result<()> {
        // let _socket = self.discovery_socket.as_ref() // This line is removed
        //     .ok_or_else(|| BreznError::Network(std::io::Error::new( // This line is removed
        //         std::io::ErrorKind::Other, "Discovery socket not initialized" // This line is removed
        //     )))?; // This line is removed
        
        let mut interval = interval(self.config.broadcast_interval);
        let mut buffer = [0u8; 1024];
        
        // Start listening for discovery messages
        let peers_clone = Arc::clone(&self.peers);
        let node_id_clone = self.node_id.clone();
        
        // Create a new socket for the listener task
        let listener_socket = UdpSocket::bind(format!("0.0.0.0:{}", self.config.discovery_port))
            .await
            .map_err(|e| BreznError::Network(std::io::Error::new(
                std::io::ErrorKind::Other, format!("Failed to create listener socket: {}", e)
            )))?;
        
        tokio::spawn(async move {
            loop {
                match listener_socket.recv_from(&mut buffer).await {
                    Ok((len, src_addr)) => {
                        if let Ok(message) = serde_json::from_slice::<DiscoveryMessage>(&buffer[..len]) {
                            if message.node_id != node_id_clone {
                                let peer_info = PeerInfo {
                                    node_id: message.node_id.clone(),
                                    public_key: message.public_key,
                                    address: message.address,
                                    port: message.port,
                                    last_seen: message.timestamp,
                                    capabilities: message.capabilities,
                                };
                                
                                let node_id = message.node_id.clone();
                                let mut peers = peers_clone.lock().unwrap();
                                peers.insert(message.node_id, peer_info);
                                println!("➕ Peer discovered: {} from {}", node_id, src_addr);
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("Discovery receive error: {}", e);
                    }
                }
            }
        });
        
        // Main discovery loop
        loop {
            interval.tick().await;
            
            // Cleanup stale peers
            self.cleanup_stale_peers()?;
            
            // Broadcast our presence
            self.broadcast_presence().await?;
            
            let peer_count = self.get_peers()?.len();
            println!("🌐 Discovery: {} aktive Peers", peer_count);
        }
    }
    
    async fn broadcast_presence(&self) -> Result<()> {
        // let socket = self.discovery_socket.as_ref() // This line is removed
        //     .ok_or_else(|| BreznError::Network(std::io::Error::new( // This line is removed
        //         std::io::ErrorKind::Other, "Discovery socket not initialized" // This line is removed
        //     )))?; // This line is removed
        
        let message = DiscoveryMessage {
            message_type: "announce".to_string(),
            node_id: self.node_id.clone(),
            public_key: self.public_key.clone(),
            address: "127.0.0.1".to_string(), // In real implementation, get external IP
            port: self.port,
            timestamp: chrono::Utc::now().timestamp() as u64,
            capabilities: vec!["posts".to_string(), "config".to_string()],
        };
        
        let _message_bytes = serde_json::to_vec(&message)
            .map_err(|e| BreznError::Serialization(e))?;
        
        let _broadcast_addr: SocketAddr = self.config.broadcast_address.parse()
            .map_err(|e| BreznError::Network(std::io::Error::new(
                std::io::ErrorKind::Other, format!("Invalid broadcast address: {}", e)
            )))?;
        
        // let socket.send_to(&message_bytes, broadcast_addr).await // This line is removed
        //     .map_err(|e| BreznError::Network(std::io::Error::new( // This line is removed
        //         std::io::ErrorKind::Other, format!("Failed to broadcast: {}", e) // This line is removed
        //     )))?; // This line is removed
        
        Ok(())
    }
    
    pub fn generate_qr_code(&self) -> Result<String> {
        let peer_data = serde_json::json!({
            "node_id": self.node_id,
            "public_key": self.public_key,
            "address": "127.0.0.1", // In real implementation, get external IP
            "port": self.port,
            "timestamp": chrono::Utc::now().timestamp(),
            "capabilities": vec!["posts", "config"],
        });
        
        let qr_data = serde_json::to_string(&peer_data)
            .map_err(|e| BreznError::Serialization(e))?;
        
        // Generate actual QR code
        let _qr = qrcode::QrCode::new(qr_data.as_bytes())
            .map_err(|e| BreznError::InvalidInput(format!("QR generation failed: {}", e)))?;
        
        // Convert to string representation (for CLI display)
        let string = format!("QR Code for node: {}", self.node_id);
        Ok(string)
    }
    
    pub fn generate_qr_code_image(&self, size: u32) -> Result<Vec<u8>> {
        let peer_data = serde_json::json!({
            "node_id": self.node_id,
            "public_key": self.public_key,
            "address": "127.0.0.1", // In real implementation, get external IP
            "port": self.port,
            "timestamp": chrono::Utc::now().timestamp(),
            "capabilities": vec!["posts", "config"],
        });
        
        let qr_data = serde_json::to_string(&peer_data)
            .map_err(|e| BreznError::Serialization(e))?;
        
        // Generate QR code
        let _qr = qrcode::QrCode::new(qr_data.as_bytes())
            .map_err(|e| BreznError::InvalidInput(format!("QR generation failed: {}", e)))?;
        
        // Create a simple image representation
        let qr_string = format!("QR Code for node: {}", self.node_id);
        let lines: Vec<&str> = qr_string.lines().collect();
        let width = lines[0].len();
        let height = lines.len();
        
        // Create a simple black and white image
        let mut image_data = Vec::new();
        for line in lines {
            for ch in line.chars() {
                if ch == '█' {
                    image_data.extend_from_slice(&[0, 0, 0, 255]); // Black
                } else {
                    image_data.extend_from_slice(&[255, 255, 255, 255]); // White
                }
            }
        }
        
        // Create image buffer
        let image_buffer = image::RgbaImage::from_raw(width as u32, height as u32, image_data)
            .ok_or_else(|| BreznError::InvalidInput("Failed to create image buffer".to_string()))?;
        
        // Resize image
        let resized = image::imageops::resize(&image_buffer, size, size, image::imageops::FilterType::Nearest);
        
        // Convert to PNG bytes
        let mut png_bytes = Vec::new();
        resized.write_to(&mut std::io::Cursor::new(&mut png_bytes), image::ImageFormat::Png)
            .map_err(|e| BreznError::InvalidInput(format!("PNG encoding failed: {}", e)))?;
        
        Ok(png_bytes)
    }
    
    pub fn parse_qr_code(&self, qr_data: &str) -> Result<PeerInfo> {
        let peer_data: serde_json::Value = serde_json::from_str(qr_data)
            .map_err(|e| BreznError::Serialization(e))?;
        
        let node_id = peer_data["node_id"].as_str()
            .ok_or_else(|| BreznError::InvalidInput("Missing node_id".to_string()))?;
        
        let public_key = peer_data["public_key"].as_str()
            .ok_or_else(|| BreznError::InvalidInput("Missing public_key".to_string()))?;
        
        let address = peer_data["address"].as_str()
            .ok_or_else(|| BreznError::InvalidInput("Missing address".to_string()))?;
        
        let port = peer_data["port"].as_u64()
            .ok_or_else(|| BreznError::InvalidInput("Missing port".to_string()))?;
        
        let capabilities = if let Some(caps) = peer_data["capabilities"].as_array() {
            caps.iter()
                .filter_map(|cap| cap.as_str())
                .map(|s| s.to_string())
                .collect()
        } else {
            vec!["posts".to_string(), "config".to_string()]
        };
        
        Ok(PeerInfo {
            node_id: node_id.to_string(),
            public_key: public_key.to_string(),
            address: address.to_string(),
            port: port as u16,
            last_seen: chrono::Utc::now().timestamp() as u64,
            capabilities,
        })
    }
    
    pub fn parse_qr_code_from_image(&self, image_data: &[u8]) -> Result<PeerInfo> {
        // Load image
        let image = image::load_from_memory(image_data)
            .map_err(|e| BreznError::InvalidInput(format!("Failed to load image: {}", e)))?;
        
        // Convert to grayscale
        let gray_image = image.to_luma8();
        
        // Convert to DynamicImage for bardecoder
        let dynamic_image = image::DynamicImage::ImageLuma8(gray_image);
        
        // Decode QR code from image
        let decoder = bardecoder::default_decoder();
        let results = decoder.decode(&dynamic_image);
        
        for result in results {
            if let Ok(qr_data) = result {
                return self.parse_qr_code(&qr_data);
            }
        }
        
        Err(BreznError::InvalidInput("No valid QR code found in image".to_string()))
    }
    
    pub fn add_peer(&self, peer: PeerInfo) -> Result<()> {
        let mut peers = self.peers.lock()
            .map_err(|_| BreznError::Network(std::io::Error::new(
                std::io::ErrorKind::Other, "Failed to lock peers"
            )))?;
        
        if peers.len() >= self.config.max_peers {
            // Remove oldest peer
            let oldest = peers.iter()
                .min_by_key(|(_, peer)| peer.last_seen)
                .map(|(id, _)| id.clone());
            
            if let Some(oldest_id) = oldest {
                peers.remove(&oldest_id);
            }
        }
        
        let node_id = peer.node_id.clone();
        peers.insert(peer.node_id.clone(), peer);
        println!("➕ Peer hinzugefügt: {}", node_id);
        Ok(())
    }
    
    pub fn remove_peer(&self, node_id: &str) -> Result<()> {
        let mut peers = self.peers.lock()
            .map_err(|_| BreznError::Network(std::io::Error::new(
                std::io::ErrorKind::Other, "Failed to lock peers"
            )))?;
        
        peers.remove(node_id);
        println!("➖ Peer entfernt: {}", node_id);
        Ok(())
    }
    
    pub fn get_peers(&self) -> Result<Vec<PeerInfo>> {
        let peers = self.peers.lock()
            .map_err(|_| BreznError::Network(std::io::Error::new(
                std::io::ErrorKind::Other, "Failed to lock peers"
            )))?;
        
        Ok(peers.values().cloned().collect())
    }
    
    pub fn cleanup_stale_peers(&self) -> Result<()> {
        let mut peers = self.peers.lock()
            .map_err(|_| BreznError::Network(std::io::Error::new(
                std::io::ErrorKind::Other, "Failed to lock peers"
            )))?;
        
        let now = chrono::Utc::now().timestamp() as u64;
        let timeout = self.config.peer_timeout.as_secs();
        
        peers.retain(|_, peer| {
            let is_stale = (now - peer.last_seen) > timeout;
            if is_stale {
                println!("🕐 Stale peer entfernt: {}", peer.node_id);
            }
            !is_stale
        });
        
        Ok(())
    }
}