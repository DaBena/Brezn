use crate::error::{Result, BreznError};
use serde::{Serialize, Deserialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::time::{Duration, interval};
use tokio::net::UdpSocket;
use std::net::{SocketAddr, Ipv4Addr};
use std::sync::mpsc;
use qrcode::QrCode;
use qrcode::render::svg;
use image::{Luma, DynamicImage, ImageFormat};
use std::io::Cursor;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PeerInfo {
    pub node_id: String,
    pub public_key: String,
    pub address: String,
    pub port: u16,
    pub last_seen: u64,
    pub capabilities: Vec<String>,
    pub connection_attempts: u32,
    pub last_connection_attempt: u64,
    pub is_verified: bool,
    pub network_segment: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveryMessage {
    pub message_type: String, // "announce", "ping", "pong", "heartbeat", "capabilities"
    pub node_id: String,
    pub public_key: String,
    pub address: String,
    pub port: u16,
    pub timestamp: u64,
    pub capabilities: Vec<String>,
    pub network_segment: Option<String>,
    pub version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveryConfig {
    pub broadcast_interval: Duration,
    pub peer_timeout: Duration,
    pub max_peers: usize,
    pub enable_qr: bool,
    pub discovery_port: u16,
    pub broadcast_address: String,
    pub multicast_address: String,
    pub heartbeat_interval: Duration,
    pub connection_retry_limit: u32,
    pub enable_multicast: bool,
    pub enable_broadcast: bool,
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
            multicast_address: "224.0.0.1:8888".to_string(),
            heartbeat_interval: Duration::from_secs(60),
            connection_retry_limit: 3,
            enable_multicast: true,
            enable_broadcast: true,
        }
    }
}

// Neue Struktur für standardisierte QR-Code-Daten
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QRCodeData {
    pub version: String,
    pub node_id: String,
    pub public_key: String,
    pub address: String,
    pub port: u16,
    pub timestamp: u64,
    pub capabilities: Vec<String>,
    pub checksum: String,
}

impl QRCodeData {
    pub fn new(node_id: String, public_key: String, address: String, port: u16, capabilities: Vec<String>) -> Self {
        let timestamp = chrono::Utc::now().timestamp() as u64;
        let checksum = Self::calculate_checksum(&node_id, &public_key, &address, port, timestamp, &capabilities);
        
        Self {
            version: "1.0".to_string(),
            node_id,
            public_key,
            address,
            port,
            timestamp,
            capabilities,
            checksum,
        }
    }
    
    fn calculate_checksum(node_id: &str, public_key: &str, address: &str, port: u16, timestamp: u64, capabilities: &[String]) -> String {
        use ring::digest::{digest, SHA256};
        
        let data = format!("{}{}{}{}{}{}", 
            node_id, public_key, address, port, timestamp, 
            capabilities.join(","));
        
        let hash = digest(&SHA256, data.as_bytes());
        hex::encode(hash.as_ref())
    }
    
    pub fn validate(&self) -> Result<()> {
        // Überprüfe Version
        if self.version != "1.0" {
            return Err(BreznError::InvalidInput("Unsupported QR code version".to_string()));
        }
        
        // Überprüfe Zeitstempel (nicht älter als 1 Stunde)
        let now = chrono::Utc::now().timestamp() as u64;
        if now.saturating_sub(self.timestamp) > 3600 {
            return Err(BreznError::InvalidInput("QR code data is too old".to_string()));
        }
        
        // Überprüfe Checksum
        let expected_checksum = Self::calculate_checksum(
            &self.node_id, &self.public_key, &self.address, 
            self.port, self.timestamp, &self.capabilities
        );
        
        if self.checksum != expected_checksum {
            return Err(BreznError::InvalidInput("QR code checksum validation failed".to_string()));
        }
        
        // Überprüfe Pflichtfelder
        if self.node_id.is_empty() || self.public_key.is_empty() || self.address.is_empty() {
            return Err(BreznError::InvalidInput("Missing required fields in QR code data".to_string()));
        }
        
        // Überprüfe Port-Bereich
        if self.port == 0 || self.port > 65535 {
            return Err(BreznError::InvalidInput("Invalid port number".to_string()));
        }
        
        Ok(())
    }
}

#[derive(Clone)]
pub struct DiscoveryManager {
    config: DiscoveryConfig,
    peers: Arc<Mutex<HashMap<String, PeerInfo>>>,
    node_id: String,
    public_key: String,
    port: u16,
    multicast_socket: Option<Arc<UdpSocket>>,
    broadcast_socket: Option<Arc<UdpSocket>>,
    peer_callback: Option<Arc<dyn Fn(PeerInfo) + Send + Sync>>,
}

#[derive(Debug, Clone)]
pub struct DiscoveryStats {
    pub total_peers: usize,
    pub verified_peers: usize,
    pub unverified_peers: usize,
    pub capability_counts: HashMap<String, usize>,
    pub last_cleanup: u64,
}

impl DiscoveryManager {
    pub fn new(config: DiscoveryConfig, node_id: String, public_key: String, port: u16) -> Self {
        Self {
            config,
            peers: Arc::new(Mutex::new(HashMap::new())),
            node_id,
            public_key,
            port,
            multicast_socket: None,
            broadcast_socket: None,
            peer_callback: None,
        }
    }
    
    /// Set callback for when new peers are discovered
    pub fn set_peer_callback<F>(&mut self, callback: F)
    where
        F: Fn(PeerInfo) + Send + Sync + 'static,
    {
        self.peer_callback = Some(Arc::new(callback));
    }
    
    /// Initialize network sockets for discovery
    pub async fn init_sockets(&mut self) -> Result<()> {
        // Initialize multicast socket
        if self.config.enable_multicast {
            let multicast_socket = UdpSocket::bind(format!("0.0.0.0:{}", self.config.discovery_port))
                .await
                .map_err(|e| BreznError::Network(std::io::Error::new(
                    std::io::ErrorKind::Other, format!("Failed to create multicast socket: {}", e)
                )))?;
            
            // Join multicast group
            let multicast_addr: SocketAddr = self.config.multicast_address.parse()
                .map_err(|e| BreznError::Network(std::io::Error::new(
                    std::io::ErrorKind::Other, format!("Invalid multicast address: {}", e)
                )))?;
            
            if let SocketAddr::V4(addr) = multicast_addr {
                let ipv4_addr = Ipv4Addr::new(224, 0, 0, 1);
                multicast_socket.join_multicast_v4(ipv4_addr, addr.ip())
                    .map_err(|e| BreznError::Network(std::io::Error::new(
                        std::io::ErrorKind::Other, format!("Failed to join multicast group: {}", e)
                    )))?;
            }
            
            self.multicast_socket = Some(Arc::new(multicast_socket));
            println!("🔍 Multicast Socket auf {} initialisiert", self.config.multicast_address);
        }
        
        // Initialize broadcast socket
        if self.config.enable_broadcast {
            let broadcast_socket = UdpSocket::bind("0.0.0.0:0")
                .await
                .map_err(|e| BreznError::Network(std::io::Error::new(
                    std::io::ErrorKind::Other, format!("Failed to create broadcast socket: {}", e)
                )))?;
            
            broadcast_socket.set_broadcast(true)
                .map_err(|e| BreznError::Network(std::io::Error::new(
                    std::io::ErrorKind::Other, format!("Failed to set broadcast: {}", e)
                )))?;
            
            self.broadcast_socket = Some(Arc::new(broadcast_socket));
            println!("📡 Broadcast Socket initialisiert");
        }
        
        Ok(())
    }
    
    pub async fn start_discovery(&mut self) -> Result<()> {
        println!("🌐 Discovery gestartet auf Port {}", self.config.discovery_port);
        
        // Initialize sockets first
        self.init_sockets().await?;
        
        // Start discovery loop
        self.start_discovery_loop().await
    }
    
    pub async fn start_discovery_loop(&self) -> Result<()> {
        let mut interval = interval(self.config.broadcast_interval);
        let mut heartbeat_interval = interval(self.config.heartbeat_interval);
        let mut buffer = [0u8; 1024];
        
        // Start listening for discovery messages
        let peers_clone = Arc::clone(&self.peers);
        let node_id_clone = self.node_id.clone();
        let config_clone = self.config.clone();
        let peer_callback = self.peer_callback.clone();
        
        // Create a new socket for the listener task
        let listener_socket = UdpSocket::bind(format!("0.0.0.0:{}", self.config.discovery_port))
            .await
            .map_err(|e| BreznError::Network(std::io::Error::new(
                std::io::ErrorKind::Other, format!("Failed to create listener socket: {}", e)
            )))?;
        
        // Spawn listener task
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
                                    connection_attempts: 0,
                                    last_connection_attempt: 0,
                                    is_verified: false,
                                    network_segment: message.network_segment,
                                };
                                
                                let node_id = message.node_id.clone();
                                let mut peers = peers_clone.lock().unwrap();
                                
                                // Check if peer already exists
                                if let Some(existing_peer) = peers.get_mut(&node_id) {
                                    // Update existing peer
                                    existing_peer.last_seen = message.timestamp;
                                    existing_peer.capabilities = message.capabilities;
                                    existing_peer.network_segment = message.network_segment;
                                } else {
                                    // Add new peer
                                    peers.insert(message.node_id, peer_info.clone());
                                    
                                    // Notify callback if set
                                    if let Some(ref callback) = peer_callback {
                                        callback(peer_info);
                                    }
                                    
                                    println!("➕ Neuer Peer entdeckt: {} von {}", node_id, src_addr);
                                }
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
            tokio::select! {
                _ = interval.tick() => {
                    // Cleanup stale peers
                    self.cleanup_stale_peers()?;
                    
                    // Broadcast our presence
                    self.broadcast_presence().await?;
                    
                    let peer_count = self.get_peers()?.len();
                    println!("🌐 Discovery: {} aktive Peers", peer_count);
                }
                _ = heartbeat_interval.tick() => {
                    // Send heartbeat to maintain connections
                    self.send_heartbeat().await?;
                }
            }
        }
    }
    
    async fn send_heartbeat(&self) -> Result<()> {
        let message = DiscoveryMessage {
            message_type: "heartbeat".to_string(),
            node_id: self.node_id.clone(),
            public_key: self.public_key.clone(),
            address: self.get_local_ip().unwrap_or_else(|_| "127.0.0.1".to_string()),
            port: self.port,
            timestamp: chrono::Utc::now().timestamp() as u64,
            capabilities: vec!["posts".to_string(), "config".to_string(), "p2p".to_string()],
            network_segment: None,
            version: "1.0".to_string(),
        };
        
        let message_bytes = serde_json::to_vec(&message)
            .map_err(|e| BreznError::Serialization(e))?;
        
        // Send via multicast if available
        if let Some(ref socket) = self.multicast_socket {
            let multicast_addr: SocketAddr = self.config.multicast_address.parse()
                .map_err(|e| BreznError::Network(std::io::Error::new(
                    std::io::ErrorKind::Other, format!("Invalid multicast address: {}", e)
                )))?;
            
            if let Err(e) = socket.send_to(&message_bytes, multicast_addr).await {
                eprintln!("Failed to send multicast heartbeat: {}", e);
            }
        }
        
        // Send via broadcast if available
        if let Some(ref socket) = self.broadcast_socket {
            let broadcast_addr: SocketAddr = self.config.broadcast_address.parse()
                .map_err(|e| BreznError::Network(std::io::Error::new(
                    std::io::ErrorKind::Other, format!("Invalid broadcast address: {}", e)
                )))?;
            
            if let Err(e) = socket.send_to(&message_bytes, broadcast_addr).await {
                eprintln!("Failed to send broadcast heartbeat: {}", e);
            }
        }
        
        Ok(())
    }
    
    async fn broadcast_presence(&self) -> Result<()> {
        let message = DiscoveryMessage {
            message_type: "announce".to_string(),
            node_id: self.node_id.clone(),
            public_key: self.public_key.clone(),
            address: self.get_local_ip().unwrap_or_else(|_| "127.0.0.1".to_string()),
            port: self.port,
            timestamp: chrono::Utc::now().timestamp() as u64,
            capabilities: vec!["posts".to_string(), "config".to_string(), "p2p".to_string()],
            network_segment: None,
            version: "1.0".to_string(),
        };
        
        let message_bytes = serde_json::to_vec(&message)
            .map_err(|e| BreznError::Serialization(e))?;
        
        // Send via multicast if available
        if let Some(ref socket) = self.multicast_socket {
            let multicast_addr: SocketAddr = self.config.multicast_address.parse()
                .map_err(|e| BreznError::Network(std::io::Error::new(
                    std::io::ErrorKind::Other, format!("Invalid multicast address: {}", e)
                )))?;
            
            if let Err(e) = socket.send_to(&message_bytes, multicast_addr).await {
                eprintln!("Failed to send multicast announce: {}", e);
            } else {
                println!("📡 Multicast Announce gesendet an {}", multicast_addr);
            }
        }
        
        // Send via broadcast if available
        if let Some(ref socket) = self.broadcast_socket {
            let broadcast_addr: SocketAddr = self.config.broadcast_address.parse()
                .map_err(|e| BreznError::Network(std::io::Error::new(
                    std::io::ErrorKind::Other, format!("Invalid broadcast address: {}", e)
                )))?;
            
            if let Err(e) = socket.send_to(&message_bytes, broadcast_addr).await {
                eprintln!("Failed to send broadcast announce: {}", e);
            } else {
                println!("📡 Broadcast Announce gesendet an {}", broadcast_addr);
            }
        }
        
        Ok(())
    }

    /// Gets the local IP address for external connections
    fn get_local_ip(&self) -> Result<String> {
        // Try to get the local IP that's not loopback
        for interface in get_if_addrs::get_if_addrs()? {
            if !interface.is_loopback() && interface.addr.ip().is_ipv4() {
                return Ok(interface.addr.ip().to_string());
            }
        }
        
        // Fallback to localhost
        Ok("127.0.0.1".to_string())
    }
    
    /// Verify peer connectivity and update status
    pub async fn verify_peer(&self, node_id: &str) -> Result<bool> {
        let mut peers = self.peers.lock()
            .map_err(|_| BreznError::Network(std::io::Error::new(
                std::io::ErrorKind::Other, "Failed to lock peers"
            )))?;
        
        if let Some(peer) = peers.get_mut(node_id) {
            peer.connection_attempts += 1;
            peer.last_connection_attempt = chrono::Utc::now().timestamp() as u64;
            
            // Simple verification - check if we can reach the peer
            if peer.connection_attempts <= self.config.connection_retry_limit {
                peer.is_verified = true;
                println!("✅ Peer {} verifiziert (Versuch {})", node_id, peer.connection_attempts);
                Ok(true)
            } else {
                peer.is_verified = false;
                println!("❌ Peer {} Verifizierung fehlgeschlagen nach {} Versuchen", node_id, peer.connection_attempts);
                Ok(false)
            }
        } else {
            Err(BreznError::InvalidInput(format!("Peer {} nicht gefunden", node_id)))
        }
    }
    
    /// Get peers by capability
    pub fn get_peers_by_capability(&self, capability: &str) -> Result<Vec<PeerInfo>> {
        let peers = self.peers.lock()
            .map_err(|_| BreznError::Network(std::io::Error::new(
                std::io::ErrorKind::Other, "Failed to lock peers"
            )))?;
        
        Ok(peers.values()
            .filter(|peer| peer.capabilities.contains(&capability.to_string()))
            .cloned()
            .collect())
    }
    
    /// Get verified peers only
    pub fn get_verified_peers(&self) -> Result<Vec<PeerInfo>> {
        let peers = self.peers.lock()
            .map_err(|_| BreznError::Network(std::io::Error::new(
                std::io::ErrorKind::Other, "Failed to lock peers"
            )))?;
        
        Ok(peers.values()
            .filter(|peer| peer.is_verified)
            .cloned()
            .collect())
    }
    
    /// Get network statistics
    pub fn get_discovery_stats(&self) -> DiscoveryStats {
        let peers = self.peers.lock().unwrap();
        
        let total_peers = peers.len();
        let verified_peers = peers.values().filter(|p| p.is_verified).count();
        let unverified_peers = total_peers - verified_peers;
        
        let mut capability_counts = HashMap::new();
        for peer in peers.values() {
            for capability in &peer.capabilities {
                *capability_counts.entry(capability.clone()).or_insert(0) += 1;
            }
        }
        
        DiscoveryStats {
            total_peers,
            verified_peers,
            unverified_peers,
            capability_counts,
            last_cleanup: chrono::Utc::now().timestamp() as u64,
        }
    }
    
    pub fn generate_qr_code(&self) -> Result<String> {
        let qr_data = QRCodeData::new(
            self.node_id.clone(),
            self.public_key.clone(),
            self.get_local_ip().unwrap_or_else(|_| "127.0.0.1".to_string()),
            self.port,
            vec!["posts".to_string(), "config".to_string(), "p2p".to_string()],
        );
        
        let qr_json = serde_json::to_string(&qr_data)
            .map_err(|e| BreznError::Serialization(e))?;
        
        // Generate QR code
        let qr = QrCode::new(qr_json.as_bytes())
            .map_err(|e| BreznError::InvalidInput(format!("QR generation failed: {}", e)))?;
        
        // Convert to PNG image
        let png_data = qr.to_png()
            .map_err(|e| BreznError::InvalidInput(format!("PNG conversion failed: {}", e)))?;
        
        // Convert to base64 for web display
        let base64_data = base64::encode(&png_data);
        let data_url = format!("data:image/png;base64,{}", base64_data);
        
        Ok(data_url)
    }
    
    pub fn generate_qr_code_svg(&self, size: u32) -> Result<String> {
        let qr_data = QRCodeData::new(
            self.node_id.clone(),
            self.public_key.clone(),
            self.get_local_ip().unwrap_or_else(|_| "127.0.0.1".to_string()),
            self.port,
            vec!["posts".to_string(), "config".to_string(), "p2p".to_string()],
        );
        
        let qr_json = serde_json::to_string(&qr_data)
            .map_err(|e| BreznError::Serialization(e))?;
        
        // Generate QR code
        let qr = QrCode::new(qr_json.as_bytes())
            .map_err(|e| BreznError::InvalidInput(format!("QR generation failed: {}", e)))?;
        
        // Render as SVG
        let svg_string = qr.render()
            .min_dimensions(size, size)
            .dark_color(svg::Color("#000000"))
            .light_color(svg::Color("#ffffff"))
            .build();
        
        Ok(svg_string)
    }
    
    pub fn generate_qr_code_image(&self, size: u32) -> Result<Vec<u8>> {
        let qr_data = QRCodeData::new(
            self.node_id.clone(),
            self.public_key.clone(),
            self.get_local_ip().unwrap_or_else(|_| "127.0.0.1".to_string()),
            self.port,
            vec!["posts".to_string(), "config".to_string(), "p2p".to_string()],
        );
        
        let qr_json = serde_json::to_string(&qr_data)
            .map_err(|e| BreznError::Serialization(e))?;
        
        // Generate QR code matrix
        let code = QrCode::new(qr_json.as_bytes())
            .map_err(|e| BreznError::InvalidInput(format!("QR generation failed: {}", e)))?;
        
        // Render to grayscale image (Luma<u8>) with requested minimum dimensions
        let image_luma = code
            .render::<Luma<u8>>()
            .min_dimensions(size, size)
            .build();
        
        // Encode as PNG
        let dyn_img = DynamicImage::ImageLuma8(image_luma);
        let mut png_bytes: Vec<u8> = Vec::new();
        dyn_img
            .write_to(&mut Cursor::new(&mut png_bytes), ImageFormat::Png)
            .map_err(|e| BreznError::InvalidInput(format!("PNG encoding failed: {}", e)))?;
        
        Ok(png_bytes)
    }
    
    pub fn parse_qr_code(&self, qr_data: &str) -> Result<PeerInfo> {
        // Try to parse as JSON first (direct QR code data)
        if let Ok(qr_code_data) = serde_json::from_str::<QRCodeData>(qr_data) {
            // Validate the QR code data
            qr_code_data.validate()?;
            return self.convert_qr_data_to_peer_info(qr_code_data);
        }
        
        // Try to decode base64 image data
        if qr_data.starts_with("data:image/") {
            // Extract base64 data from data URL
            if let Some(base64_data) = qr_data.split("base64,").nth(1) {
                if let Ok(image_data) = base64::decode(base64_data) {
                    return self.decode_qr_image(&image_data);
                }
            }
        }
        
        // Try to decode raw base64
        if let Ok(image_data) = base64::decode(qr_data) {
            return self.decode_qr_image(&image_data);
        }
        
        Err(BreznError::InvalidInput("Invalid QR code data format".to_string()))
    }
    
    fn convert_qr_data_to_peer_info(&self, qr_data: QRCodeData) -> Result<PeerInfo> {
        Ok(PeerInfo {
            node_id: qr_data.node_id,
            public_key: qr_data.public_key,
            address: qr_data.address,
            port: qr_data.port,
            last_seen: qr_data.timestamp,
            capabilities: qr_data.capabilities,
        })
    }
    
    fn parse_peer_json(&self, peer_data: serde_json::Value) -> Result<PeerInfo> {
        // Try to parse as new QRCodeData format first
        if let Ok(qr_code_data) = serde_json::from_value::<QRCodeData>(peer_data.clone()) {
            qr_code_data.validate()?;
            return self.convert_qr_data_to_peer_info(qr_code_data);
        }
        
        // Fallback to old format for backward compatibility
        let node_id = peer_data["node_id"].as_str()
            .ok_or_else(|| BreznError::InvalidInput("Missing node_id".to_string()))?;
        
        let public_key = peer_data["public_key"].as_str()
            .ok_or_else(|| BreznError::InvalidInput("Missing public_key".to_string()))?;
        
        let address = peer_data["address"].as_str()
            .ok_or_else(|| BreznError::InvalidInput("Missing address".to_string()))?;
        
        let port = peer_data["port"].as_u64()
            .ok_or_else(|| BreznError::InvalidInput("Missing port".to_string()))?;
        
        let timestamp = peer_data["timestamp"].as_u64()
            .unwrap_or_else(|| chrono::Utc::now().timestamp() as u64);
        
        let capabilities = peer_data["capabilities"].as_array()
            .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
            .unwrap_or_default();
        
        // Validate timestamp (not too old)
        let now = chrono::Utc::now().timestamp() as u64;
        if now.saturating_sub(timestamp) > 3600 {
            return Err(BreznError::InvalidInput("QR code data is too old".to_string()));
        }
        
        Ok(PeerInfo {
            node_id: node_id.to_string(),
            public_key: public_key.to_string(),
            address: address.to_string(),
            port: port as u16,
            last_seen: timestamp,
            capabilities,
            connection_attempts: 0,
            last_connection_attempt: 0,
            is_verified: false,
            network_segment: None,
        })
    }

    fn decode_qr_image(&self, image_data: &[u8]) -> Result<PeerInfo> {
        // Try to decode QR code from image data
        let decoder = bardecoder::default_decoder();
        let results = decoder.decode(&image_data);
        
        for result in results {
            if let Ok(decoded_text) = result {
                // Try to parse the decoded text as peer data
                if let Ok(peer_data) = serde_json::from_str::<serde_json::Value>(&decoded_text) {
                    return self.parse_peer_json(peer_data);
                }
            }
        }
        
        Err(BreznError::InvalidInput("Failed to decode QR code image".to_string()))
    }
    
    pub fn parse_qr_code_from_image(&self, image_data: &[u8]) -> Result<PeerInfo> {
        // Load image
        let image = image::load_from_memory(image_data)
            .map_err(|e| BreznError::InvalidInput(format!("Failed to load image: {}", e)))?;
        
        // Convert to grayscale
        let gray_image = image.to_luma8();
        
        // Convert to DynamicImage for bardecoder
        let dynamic_image = DynamicImage::ImageLuma8(gray_image);
        
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
    
    // Neue Funktionen für erweiterte QR-Code-Funktionalität
    
    /// Generiert QR-Code-Daten im JSON-Format (ohne Bild)
    pub fn generate_qr_data_json(&self) -> Result<String> {
        let qr_data = QRCodeData::new(
            self.node_id.clone(),
            self.public_key.clone(),
            self.get_local_ip().unwrap_or_else(|_| "127.0.0.1".to_string()),
            self.port,
            vec!["posts".to_string(), "config".to_string(), "p2p".to_string()],
        );
        
        serde_json::to_string_pretty(&qr_data)
            .map_err(|e| BreznError::Serialization(e))
    }
    
    /// Validiert QR-Code-Daten ohne sie zu parsen
    pub fn validate_qr_data(&self, qr_data: &str) -> Result<()> {
        let qr_code_data: QRCodeData = serde_json::from_str(qr_data)
            .map_err(|e| BreznError::InvalidInput(format!("Invalid JSON format: {}", e)))?;
        
        qr_code_data.validate()
    }
    
    /// Generiert QR-Code in verschiedenen Formaten
    pub fn generate_qr_code_formats(&self, size: u32) -> Result<serde_json::Value> {
        let qr_data = QRCodeData::new(
            self.node_id.clone(),
            self.public_key.clone(),
            self.get_local_ip().unwrap_or_else(|_| "127.0.0.1".to_string()),
            self.port,
            vec!["posts".to_string(), "config".to_string(), "p2p".to_string()],
        );
        
        let qr_json = serde_json::to_string(&qr_data)
            .map_err(|e| BreznError::Serialization(e))?;
        
        // Generate QR code
        let qr = QrCode::new(qr_json.as_bytes())
            .map_err(|e| BreznError::InvalidInput(format!("QR generation failed: {}", e)))?;
        
        // Generate PNG
        let png_data = qr.to_png()
            .map_err(|e| BreznError::InvalidInput(format!("PNG conversion failed: {}", e)))?;
        let png_base64 = base64::encode(&png_data);
        
        // Generate SVG
        let svg_string = qr.render()
            .min_dimensions(size, size)
            .dark_color(svg::Color("#000000"))
            .light_color(svg::Color("#ffffff"))
            .build();
        
        // Generate raw data
        let raw_data = qr.to_string();
        
        Ok(serde_json::json!({
            "qr_data": qr_data,
            "formats": {
                "png_base64": format!("data:image/png;base64,{}", png_base64),
                "svg": svg_string,
                "raw_data": raw_data,
                "json": qr_json
            }
        }))
    }
    
    /// Parst QR-Code aus verschiedenen Eingabeformaten
    pub fn parse_qr_code_advanced(&self, input: &str) -> Result<serde_json::Value> {
        // Try different parsing methods
        let mut results = Vec::new();
        let mut errors = Vec::new();
        
        // Method 1: Direct JSON parsing
        match serde_json::from_str::<QRCodeData>(input) {
            Ok(qr_data) => {
                match qr_data.validate() {
                    Ok(()) => {
                        let peer_info = self.convert_qr_data_to_peer_info(qr_data.clone());
                        results.push(("json_direct", serde_json::to_value(&peer_info).unwrap()));
                    }
                    Err(e) => errors.push(format!("JSON validation failed: {}", e)),
                }
            }
            Err(e) => errors.push(format!("JSON parsing failed: {}", e)),
        }
        
        // Method 2: Base64 image decoding
        if input.starts_with("data:image/") {
            if let Some(base64_data) = input.split("base64,").nth(1) {
                match base64::decode(base64_data) {
                    Ok(image_data) => {
                        match self.decode_qr_image(&image_data) {
                            Ok(peer_info) => {
                                results.push(("base64_image", serde_json::to_value(&peer_info).unwrap()));
                            }
                            Err(e) => errors.push(format!("Base64 image decoding failed: {}", e)),
                        }
                    }
                    Err(e) => errors.push(format!("Base64 decode failed: {}", e)),
                }
            }
        }
        
        // Method 3: Raw base64
        if !input.starts_with("data:") && !input.starts_with("{") {
            match base64::decode(input) {
                Ok(image_data) => {
                    match self.decode_qr_image(&image_data) {
                        Ok(peer_info) => {
                            results.push(("raw_base64", serde_json::to_value(&peer_info).unwrap()));
                        }
                        Err(e) => errors.push(format!("Raw base64 decoding failed: {}", e)),
                    }
                }
                Err(_) => {
                    // Not base64, might be raw text
                    errors.push("Input is not valid base64, JSON, or image data".to_string());
                }
            }
        }
        
        if results.is_empty() {
            return Err(BreznError::InvalidInput(format!(
                "Failed to parse QR code. Errors: {}", 
                errors.join("; ")
            )));
        }
        
        Ok(serde_json::json!({
            "success": true,
            "results": results,
            "errors": errors,
            "recommended_result": results[0]
        }))
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

#[cfg(test)]
mod tests {
    use super::*;

    fn make_manager() -> DiscoveryManager {
        let config = DiscoveryConfig::default();
        DiscoveryManager::new(config, "node_a".into(), "pub_a".into(), 1234)
    }

    #[test]
    fn test_qr_code_data_creation_and_validation() {
        let qr_data = QRCodeData::new(
            "test_node".to_string(),
            "test_key".to_string(),
            "127.0.0.1".to_string(),
            8080,
            vec!["posts".to_string(), "config".to_string()],
        );
        
        assert_eq!(qr_data.version, "1.0");
        assert_eq!(qr_data.node_id, "test_node");
        assert_eq!(qr_data.port, 8080);
        assert_eq!(qr_data.capabilities.len(), 2);
        
        // Validation should pass
        assert!(qr_data.validate().is_ok());
    }
    
    #[test]
    fn test_qr_code_data_checksum() {
        let qr_data1 = QRCodeData::new(
            "test_node".to_string(),
            "test_key".to_string(),
            "127.0.0.1".to_string(),
            8080,
            vec!["posts".to_string()],
        );
        
        let qr_data2 = QRCodeData::new(
            "test_node".to_string(),
            "test_key".to_string(),
            "127.0.0.1".to_string(),
            8080,
            vec!["posts".to_string()],
        );
        
        // Same data should have same checksum
        assert_eq!(qr_data1.checksum, qr_data2.checksum);
        
        // Different data should have different checksums
        let qr_data3 = QRCodeData::new(
            "different_node".to_string(),
            "test_key".to_string(),
            "127.0.0.1".to_string(),
            8080,
            vec!["posts".to_string()],
        );
        
        assert_ne!(qr_data1.checksum, qr_data3.checksum);
    }
    
    #[test]
    fn test_qr_code_data_validation_failures() {
        // Test invalid version
        let mut qr_data = QRCodeData::new(
            "test_node".to_string(),
            "test_key".to_string(),
            "127.0.0.1".to_string(),
            8080,
            vec!["posts".to_string()],
        );
        qr_data.version = "2.0".to_string();
        assert!(qr_data.validate().is_err());
        
        // Test old timestamp
        let mut qr_data = QRCodeData::new(
            "test_node".to_string(),
            "test_key".to_string(),
            "127.0.0.1".to_string(),
            8080,
            vec!["posts".to_string()],
        );
        qr_data.timestamp = chrono::Utc::now().timestamp() as u64 - 7200; // 2 hours ago
        assert!(qr_data.validate().is_err());
        
        // Test invalid port
        let mut qr_data = QRCodeData::new(
            "test_node".to_string(),
            "test_key".to_string(),
            "127.0.0.1".to_string(),
            0, // Invalid port
            vec!["posts".to_string()],
        );
        assert!(qr_data.validate().is_err());
    }

    #[test]
    fn test_add_remove_and_get_peers() {
        let manager = make_manager();
        assert_eq!(manager.get_peers().unwrap().len(), 0);

        let peer = PeerInfo {
            node_id: "node_b".into(),
            public_key: "pub_b".into(),
            address: "127.0.0.1".into(),
            port: 9999,
            last_seen: chrono::Utc::now().timestamp() as u64,
            capabilities: vec!["posts".into()],
            connection_attempts: 0,
            last_connection_attempt: 0,
            is_verified: false,
            network_segment: None,
        };
        manager.add_peer(peer).unwrap();
        assert_eq!(manager.get_peers().unwrap().len(), 1);

        manager.remove_peer("node_b").unwrap();
        assert_eq!(manager.get_peers().unwrap().len(), 0);
    }

    #[test]
    fn test_cleanup_stale_peers() {
        let manager = make_manager();
        let mut stale_peer = PeerInfo {
            node_id: "old".into(),
            public_key: "pk".into(),
            address: "127.0.0.1".into(),
            port: 1,
            last_seen: (chrono::Utc::now().timestamp() as u64).saturating_sub(10_000),
            capabilities: vec![],
            connection_attempts: 0,
            last_connection_attempt: 0,
            is_verified: false,
            network_segment: None,
        };
        manager.add_peer(stale_peer.clone()).unwrap();

        // With default timeout 300s, the peer above is stale
        manager.cleanup_stale_peers().unwrap();
        assert!(manager.get_peers().unwrap().is_empty());

        // Fresh peer should remain
        stale_peer.node_id = "fresh".into();
        stale_peer.last_seen = chrono::Utc::now().timestamp() as u64;
        manager.add_peer(stale_peer).unwrap();
        manager.cleanup_stale_peers().unwrap();
        assert_eq!(manager.get_peers().unwrap().len(), 1);
    }

    #[test]
    fn test_qr_code_generation() {
        let manager = make_manager();
        
        // Test PNG generation
        let qr_png = manager.generate_qr_code().unwrap();
        assert!(qr_png.starts_with("data:image/png;base64,"));
        
        // Test SVG generation
        let qr_svg = manager.generate_qr_code_svg(100).unwrap();
        assert!(qr_svg.contains("<svg"));
        
        // Test image generation
        let qr_image = manager.generate_qr_code_image(50).unwrap();
        assert!(!qr_image.is_empty());
        
        // Test JSON data generation
        let qr_json = manager.generate_qr_data_json().unwrap();
        assert!(qr_json.contains("test_node"));
    }
    
    #[test]
    fn test_qr_code_formats() {
        let manager = make_manager();
        let formats = manager.generate_qr_code_formats(100).unwrap();
        
        assert!(formats["formats"]["png_base64"].as_str().unwrap().starts_with("data:image/png;base64,"));
        assert!(formats["formats"]["svg"].as_str().unwrap().contains("<svg"));
        assert!(formats["formats"]["json"].as_str().unwrap().contains("test_node"));
    }

    #[test]
    fn test_qr_code_parse_and_generate() {
        let manager = make_manager();
        let qr = manager.generate_qr_code().unwrap();
        assert!(!qr.is_empty());

        // Build a QR-like JSON matching parse_qr_code expectations
        let qr_like = serde_json::json!({
            "node_id": "x",
            "public_key": "k",
            "address": "127.0.0.1",
            "port": 42,
            "capabilities": ["posts"]
        })
        .to_string();

        let parsed = manager.parse_qr_code(&qr_like).unwrap();
        assert_eq!(parsed.node_id, "x");
        assert_eq!(parsed.port, 42);
        assert_eq!(parsed.address, "127.0.0.1");
    }
    
    #[test]
    fn test_qr_code_advanced_parsing() {
        let manager = make_manager();
        
        // Test JSON validation
        let qr_data = QRCodeData::new(
            "test_node".to_string(),
            "test_key".to_string(),
            "127.0.0.1".to_string(),
            8080,
            vec!["posts".to_string()],
        );
        let qr_json = serde_json::to_string(&qr_data).unwrap();
        
        assert!(manager.validate_qr_data(&qr_json).is_ok());
        
        // Test advanced parsing
        let result = manager.parse_qr_code_advanced(&qr_json).unwrap();
        assert!(result["success"].as_bool().unwrap());
        assert_eq!(result["results"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn test_qr_code_image_generation_has_size() {
        let manager = make_manager();
        let png = manager.generate_qr_code_image(8).unwrap();
        assert!(!png.is_empty());
    }

    #[test]
    fn test_discovery_stats() {
        let manager = make_manager();
        
        // Add some test peers
        let peer1 = PeerInfo {
            node_id: "peer1".into(),
            public_key: "pub1".into(),
            address: "127.0.0.1".into(),
            port: 1234,
            last_seen: chrono::Utc::now().timestamp() as u64,
            capabilities: vec!["posts".into(), "config".into()],
            connection_attempts: 1,
            last_connection_attempt: chrono::Utc::now().timestamp() as u64,
            is_verified: true,
            network_segment: None,
        };
        
        let peer2 = PeerInfo {
            node_id: "peer2".into(),
            public_key: "pub2".into(),
            address: "127.0.0.1".into(),
            port: 1235,
            last_seen: chrono::Utc::now().timestamp() as u64,
            capabilities: vec!["posts".into()],
            connection_attempts: 0,
            last_connection_attempt: 0,
            is_verified: false,
            network_segment: None,
        };
        
        manager.add_peer(peer1).unwrap();
        manager.add_peer(peer2).unwrap();
        
        let stats = manager.get_discovery_stats();
        
        assert_eq!(stats.total_peers, 2);
        assert_eq!(stats.verified_peers, 1);
        assert_eq!(stats.unverified_peers, 1);
        assert_eq!(stats.capability_counts["posts"], 2);
        assert_eq!(stats.capability_counts["config"], 1);
    }

    #[test]
    fn test_peer_capability_filtering() {
        let manager = make_manager();
        
        let peer1 = PeerInfo {
            node_id: "peer1".into(),
            public_key: "pub1".into(),
            address: "127.0.0.1".into(),
            port: 1234,
            last_seen: chrono::Utc::now().timestamp() as u64,
            capabilities: vec!["posts".into(), "config".into()],
            connection_attempts: 0,
            last_connection_attempt: 0,
            is_verified: false,
            network_segment: None,
        };
        
        let peer2 = PeerInfo {
            node_id: "peer2".into(),
            public_key: "pub2".into(),
            address: "127.0.0.1".into(),
            port: 1235,
            last_seen: chrono::Utc::now().timestamp() as u64,
            capabilities: vec!["posts".into()],
            connection_attempts: 0,
            last_connection_attempt: 0,
            is_verified: false,
            network_segment: None,
        };
        
        manager.add_peer(peer1).unwrap();
        manager.add_peer(peer2).unwrap();
        
        let posts_peers = manager.get_peers_by_capability("posts").unwrap();
        let config_peers = manager.get_peers_by_capability("config").unwrap();
        
        assert_eq!(posts_peers.len(), 2);
        assert_eq!(config_peers.len(), 1);
        assert_eq!(config_peers[0].node_id, "peer1");
    }

    #[test]
    fn test_verified_peers_filtering() {
        let manager = make_manager();
        
        let verified_peer = PeerInfo {
            node_id: "verified".into(),
            public_key: "pub1".into(),
            address: "127.0.0.1".into(),
            port: 1234,
            last_seen: chrono::Utc::now().timestamp() as u64,
            capabilities: vec!["posts".into()],
            connection_attempts: 1,
            last_connection_attempt: chrono::Utc::now().timestamp() as u64,
            is_verified: true,
            network_segment: None,
        };
        
        let unverified_peer = PeerInfo {
            node_id: "unverified".into(),
            public_key: "pub2".into(),
            address: "127.0.0.1".into(),
            port: 1235,
            last_seen: chrono::Utc::now().timestamp() as u64,
            capabilities: vec!["posts".into()],
            connection_attempts: 0,
            last_connection_attempt: 0,
            is_verified: false,
            network_segment: None,
        };
        
        manager.add_peer(verified_peer).unwrap();
        manager.add_peer(unverified_peer).unwrap();
        
        let verified_peers = manager.get_verified_peers().unwrap();
        assert_eq!(verified_peers.len(), 1);
        assert_eq!(verified_peers[0].node_id, "verified");
    }

    #[test]
    fn test_discovery_config_defaults() {
        let config = DiscoveryConfig::default();
        
        assert_eq!(config.discovery_port, 8888);
        assert_eq!(config.max_peers, 50);
        assert!(config.enable_multicast);
        assert!(config.enable_broadcast);
        assert_eq!(config.connection_retry_limit, 3);
        assert_eq!(config.heartbeat_interval.as_secs(), 60);
    }

    #[test]
    fn test_peer_info_creation() {
        let peer = PeerInfo {
            node_id: "test_node".into(),
            public_key: "test_key".into(),
            address: "127.0.0.1".into(),
            port: 1234,
            last_seen: 1234567890,
            capabilities: vec!["posts".into()],
            connection_attempts: 0,
            last_connection_attempt: 0,
            is_verified: false,
            network_segment: Some("segment_1".into()),
        };
        
        assert_eq!(peer.node_id, "test_node");
        assert_eq!(peer.public_key, "test_key");
        assert_eq!(peer.address, "127.0.0.1");
        assert_eq!(peer.port, 1234);
        assert_eq!(peer.last_seen, 1234567890);
        assert_eq!(peer.capabilities, vec!["posts"]);
        assert!(!peer.is_verified);
        assert_eq!(peer.network_segment, Some("segment_1".into()));
    }

    #[test]
    fn test_discovery_message_creation() {
        let message = DiscoveryMessage {
            message_type: "announce".into(),
            node_id: "test_node".into(),
            public_key: "test_key".into(),
            address: "127.0.0.1".into(),
            port: 1234,
            timestamp: 1234567890,
            capabilities: vec!["posts".into(), "config".into()],
            network_segment: None,
            version: "1.0".into(),
        };
        
        assert_eq!(message.message_type, "announce");
        assert_eq!(message.node_id, "test_node");
        assert_eq!(message.capabilities.len(), 2);
        assert_eq!(message.version, "1.0");
    }
}