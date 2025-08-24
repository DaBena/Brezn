use tokio::net::{TcpListener, TcpStream};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use serde_json;
use anyhow::{Result, Context};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::time::{interval, sleep};
use crate::types::{NetworkMessage, Post, Config};
use crate::crypto::CryptoManager;
use crate::database::Database;
use crate::tor::{TorManager, TorStatus, CircuitInfo};
use sodiumoxide::crypto::box_;

pub struct NetworkManager {
    port: u16,
    tor_enabled: bool,
    tor_socks_port: u16,
    _crypto: CryptoManager,
    peers: Arc<Mutex<HashMap<String, PeerInfo>>>,
    message_handlers: Arc<Mutex<Vec<Box<dyn MessageHandler>>>>,
    tor_manager: Option<TorManager>,
    request_cooldowns: Arc<Mutex<HashMap<String, u64>>>,
    tor_health_monitor: Arc<Mutex<TorHealthMonitor>>,
    circuit_rotation_task: Option<tokio::task::JoinHandle<()>>,
}

#[derive(Debug, Clone)]
pub struct PeerInfo {
    pub node_id: String,
    pub public_key: box_::PublicKey,
    pub address: String,
    pub port: u16,
    pub last_seen: u64,
    pub is_tor_peer: bool,
    pub circuit_id: Option<String>,
    pub connection_health: f64,
}

#[derive(Debug, Clone)]
pub struct TorHealthMonitor {
    pub last_check: std::time::Instant,
    pub overall_health: f64,
    pub circuit_count: usize,
    pub active_connections: usize,
    pub last_circuit_rotation: std::time::Instant,
    pub failure_count: u32,
}

impl Default for TorHealthMonitor {
    fn default() -> Self {
        Self {
            last_check: std::time::Instant::now(),
            overall_health: 1.0,
            circuit_count: 0,
            active_connections: 0,
            last_circuit_rotation: std::time::Instant::now(),
            failure_count: 0,
        }
    }
}

pub trait MessageHandler: Send + Sync {
    fn handle_post(&self, post: &Post) -> Result<()>;
    fn handle_config(&self, config: &Config) -> Result<()>;
    fn handle_ping(&self, node_id: &str) -> Result<()>;
    fn handle_pong(&self, node_id: &str) -> Result<()>;
    fn get_recent_posts(&self, _limit: usize) -> Result<Vec<Post>> { Ok(Vec::new()) }
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
            request_cooldowns: Arc::new(Mutex::new(HashMap::new())),
            tor_health_monitor: Arc::new(Mutex::new(TorHealthMonitor::default())),
            circuit_rotation_task: None,
        }
    }
    
    pub async fn enable_tor(&mut self) -> Result<()> {
        // Start circuit rotation task first
        self.start_circuit_rotation_task().await?;
        
        let mut tor_config = crate::tor::TorConfig::default();
        tor_config.socks_port = self.tor_socks_port;
        tor_config.enabled = true;
        tor_config.max_connections = 20; // Increase for network manager
        tor_config.health_check_interval = Duration::from_secs(30); // More frequent checks
        tor_config.circuit_rotation_interval = Duration::from_secs(180); // More frequent rotation
        
        let mut tor_manager = TorManager::new(tor_config);
        tor_manager.enable().await?;
        
        self.tor_manager = Some(tor_manager);
        self.tor_enabled = true;
        
        // Start Tor health monitoring
        self.start_tor_health_monitoring().await?;
        
        // Start circuit rotation task
        self.start_circuit_rotation_task().await?;
        
        println!("🔒 Tor SOCKS5 Proxy aktiviert auf Port {}", self.tor_socks_port);
        Ok(())
    }
    
    async fn start_tor_health_monitoring(&self) -> Result<()> {
        let tor_manager = self.tor_manager.clone();
        let health_monitor = Arc::clone(&self.tor_health_monitor);
        
        tokio::spawn(async move {
            let mut interval = interval(Duration::from_secs(30));
            
            loop {
                interval.tick().await;
                
                if let Some(ref tor_mgr) = tor_manager {
                    // Perform health check
                    if let Err(e) = tor_mgr.perform_health_check().await {
                        eprintln!("Tor health check failed: {}", e);
                        
                        // Update failure count
                        {
                            if let Ok(mut monitor) = health_monitor.lock() {
                                monitor.failure_count += 1;
                                monitor.overall_health = (monitor.overall_health * 0.9).max(0.1);
                            }
                        }
                    } else {
                        // Update health monitor with current status
                        let status = tor_mgr.get_status();
                        {
                            if let Ok(mut monitor) = health_monitor.lock() {
                                monitor.last_check = std::time::Instant::now();
                                monitor.overall_health = status.circuit_health;
                                monitor.circuit_count = status.active_circuits;
                                monitor.active_connections = status.total_connections;
                                monitor.failure_count = 0; // Reset on success
                            }
                        }
                    }
                }
            }
        });
        
        Ok(())
    }
    
    async fn start_circuit_rotation_task(&mut self) -> Result<()> {
        let tor_manager = self.tor_manager.clone();
        let health_monitor = Arc::clone(&self.tor_health_monitor);
        
        let handle = tokio::spawn(async move {
            let mut interval = interval(Duration::from_secs(180)); // Every 3 minutes
            
            loop {
                interval.tick().await;
                
                if let Some(ref tor_mgr) = tor_manager {
                    // Check if rotation is needed
                    let should_rotate = {
                        if let Ok(monitor) = health_monitor.lock() {
                            let time_since_rotation = monitor.last_check.duration_since(monitor.last_circuit_rotation);
                            monitor.overall_health < 0.5 || time_since_rotation > Duration::from_secs(600)
                        } else {
                            false
                        }
                    };
                    
                    if should_rotate {
                        if let Err(e) = tor_mgr.rotate_circuits().await {
                            eprintln!("Circuit rotation failed: {}", e);
                        } else {
                            // Update rotation timestamp
                            {
                                if let Ok(mut monitor) = health_monitor.lock() {
                                    monitor.last_circuit_rotation = std::time::Instant::now();
                                }
                            }
                            println!("🔄 Tor circuits rotated automatically");
                        }
                    }
                }
            }
        });
        
        self.circuit_rotation_task = Some(handle);
        Ok(())
    }
    
    pub fn disable_tor(&mut self) {
        self.tor_enabled = false;
        
        // Stop circuit rotation task
        if let Some(task) = self.circuit_rotation_task.take() {
            task.abort();
        }
        
        self.tor_manager = None;
        
        // Update health monitor
        if let Ok(mut monitor) = self.tor_health_monitor.lock() {
            monitor.overall_health = 0.0;
            monitor.circuit_count = 0;
            monitor.active_connections = 0;
        }
        
        println!("🔓 Tor SOCKS5 Proxy deaktiviert");
    }
    
    pub fn is_tor_enabled(&self) -> bool {
        self.tor_enabled
    }
    
    pub fn get_tor_status(&self) -> Option<TorStatus> {
        self.tor_manager.as_ref().map(|tm| tm.get_status())
    }
    
    pub fn get_tor_health(&self) -> TorHealthMonitor {
        if let Ok(monitor) = self.tor_health_monitor.lock() {
            monitor.clone()
        } else {
            TorHealthMonitor::default()
        }
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
        
        // Start heartbeat monitoring in background
        let network_manager = Arc::new(Mutex::new(self.clone()));
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(60));
            loop {
                interval.tick().await;
                
                // Clone the Arc to avoid holding the lock across await
                let network_manager_clone = network_manager.clone();
                let result = {
                    let nm = network_manager_clone.lock().unwrap();
                    nm.check_peer_health()
                };
                if let Err(e) = result.await {
                    eprintln!("Heartbeat error: {}", e);
                }
            }
        });
        
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
    
    /// Checks peer health and removes inactive peers
    async fn check_peer_health(&self) -> Result<()> {
        let now = chrono::Utc::now().timestamp() as u64;
        let mut peers_to_remove = Vec::new();
        
        {
            let peers = self.peers.lock().unwrap();
            for (node_id, peer) in peers.iter() {
                // Remove peers that haven't been seen in the last 10 minutes
                if now.saturating_sub(peer.last_seen) > 600 {
                    peers_to_remove.push(node_id.clone());
                }
            }
        }
        
        // Remove inactive peers
        for node_id in peers_to_remove {
            println!("🗑️  Inaktiven Peer entfernt: {}", node_id);
            self.remove_peer(&node_id);
        }
        
        // Send ping to active peers to check connectivity
        let active_peers = {
            let peers = self.peers.lock().unwrap();
            peers.values().cloned().collect::<Vec<_>>()
        };
        
        for peer in active_peers {
            let ping_message = NetworkMessage {
                message_type: "ping".to_string(),
                payload: serde_json::json!({}),
                timestamp: now,
                node_id: "local".to_string(),
            };
            
            if let Err(e) = self.send_message_to_peer(&ping_message, &peer).await {
                eprintln!("Failed to ping peer {}: {}", peer.node_id, e);
                // Mark peer for removal if ping fails
                self.remove_peer(&peer.node_id);
            }
        }
        
        Ok(())
    }
    
    async fn handle_connection(
        mut socket: TcpStream,
        network_manager: Arc<Mutex<NetworkManager>>,
    ) -> Result<()> {
        let mut buffer = Vec::new();
        let mut temp_buffer = [0u8; 1024];
        
        // Get peer address for logging
        let peer_addr = socket.peer_addr().unwrap_or_else(|_| "unknown".parse().unwrap());
        println!("📡 Neue Verbindung von: {}", peer_addr);
        
        loop {
            let n = match socket.read(&mut temp_buffer).await {
                Ok(n) => n,
                Err(e) => {
                    eprintln!("Connection error from {}: {}", peer_addr, e);
                    break;
                }
            };
            
            if n == 0 {
                println!("📡 Verbindung von {} geschlossen", peer_addr);
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
                
                if let Err(e) = network_manager_clone.handle_message(&message_clone).await {
                    eprintln!("Failed to handle message from {}: {}", peer_addr, e);
                }
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
        // Phase 1: notify handlers synchronously (no await while holding lock)
        {
            let handlers = self.message_handlers.lock().unwrap();
            for handler in handlers.iter() {
                match message.message_type.as_str() {
                    "post" => {
                        if let Ok(post) = serde_json::from_value::<Post>(message.payload.clone()) {
                            // Validate post before handling
                            if self.validate_post(&post) {
                                handler.handle_post(&post)?;
                            } else {
                                eprintln!("Invalid post received from {}: {}", message.node_id, post.content);
                            }
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
                        // request_posts handled in Phase 2 below
                        if message.message_type.as_str() != "request_posts" {
                            eprintln!("Unknown message type: {}", message.message_type);
                        }
                    }
                }
            }
        }
        
        // Phase 2: perform network side-effects without holding any locks
        match message.message_type.as_str() {
            "ping" => {
                let pong = NetworkMessage { message_type: "pong".into(), payload: serde_json::json!({}), timestamp: chrono::Utc::now().timestamp() as u64, node_id: "local".into() };
                let maybe_peer = {
                    let peers_guard = self.peers.lock().unwrap();
                    peers_guard.get(&message.node_id).cloned()
                };
                if let Some(peer) = maybe_peer {
                    let _ = self.send_message_to_peer(&pong, &peer).await;
                }
            }
            "pong" => {
                if let Some(peer) = self.peers.lock().unwrap().get_mut(&message.node_id) {
                    peer.last_seen = chrono::Utc::now().timestamp() as u64;
                }
            }
            "request_posts" => {
                // gather recent posts from first handler that returns non-empty
                let posts_to_send: Vec<Post> = {
                    let handlers = self.message_handlers.lock().unwrap();
                    let mut aggregated: Vec<Post> = Vec::new();
                    for handler in handlers.iter() {
                        if let Ok(mut posts) = handler.get_recent_posts(100) {
                            if !posts.is_empty() {
                                aggregated.append(&mut posts);
                                break;
                            }
                        }
                    }
                    aggregated
                };
                if !posts_to_send.is_empty() {
                    // resolve peer outside of await to avoid holding locks across await
                    let maybe_peer = {
                        let peers_guard = self.peers.lock().unwrap();
                        peers_guard.get(&message.node_id).cloned()
                    };
                    if let Some(peer) = maybe_peer {
                        for post in posts_to_send.iter() {
                            let msg = NetworkMessage { message_type: "post".into(), payload: serde_json::to_value(post)?, timestamp: chrono::Utc::now().timestamp() as u64, node_id: "local".into() };
                            let _ = self.send_message_to_peer(&msg, &peer).await;
                        }
                    }
                }
            }
            _ => {}
        }
        
        Ok(())
    }

    /// Validates incoming posts to prevent spam and ensure data integrity
    fn validate_post(&self, post: &Post) -> bool {
        // Check content length
        if post.content.is_empty() || post.content.len() > 1000 {
            return false;
        }
        
        // Check timestamp (not too old, not in future)
        let now = chrono::Utc::now().timestamp() as u64;
        if post.timestamp > now + 60 || post.timestamp < now - 86400 {
            return false;
        }
        
        // Check pseudonym
        if post.pseudonym.is_empty() || post.pseudonym.len() > 50 {
            return false;
        }
        
        true
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
            // Use Tor connection with retry logic
            self.connect_through_tor_with_retry(&peer.address, peer.port).await?
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
    
    async fn connect_through_tor_with_retry(&self, target_host: &str, target_port: u16) -> Result<TcpStream> {
        if let Some(ref tor_manager) = self.tor_manager {
            let mut attempts = 0;
            let max_attempts = 3;
            
            while attempts < max_attempts {
                match tor_manager.connect_through_tor(target_host, target_port).await {
                    Ok(stream) => {
                        // Update peer circuit information
                        if let Some(circuit_id) = tor_manager.get_circuit_info() {
                            if let Ok(mut peers) = self.peers.lock() {
                                if let Some(peer) = peers.get_mut(&format!("{}:{}", target_host, target_port)) {
                                    peer.circuit_id = Some(circuit_id);
                                    peer.connection_health = 1.0;
                                }
                            }
                        }
                        return Ok(stream);
                    }
                    Err(e) => {
                        attempts += 1;
                        eprintln!("Tor connection attempt {} failed: {}", attempts, e);
                        
                        if attempts < max_attempts {
                            // Wait before retry
                            sleep(Duration::from_millis(100 * attempts as u64)).await;
                            
                            // Try to rotate circuits if health is poor
                            let should_rotate = {
                                if let Ok(health) = self.tor_health_monitor.lock() {
                                    health.overall_health < 0.5
                                } else {
                                    false
                                }
                            };
                            
                            if should_rotate {
                                if let Err(rotate_err) = tor_manager.rotate_circuits().await {
                                    eprintln!("Circuit rotation failed during retry: {}", rotate_err);
                                }
                            }
                        }
                    }
                }
            }
            
            Err(anyhow::anyhow!("Failed to connect through Tor after {} attempts", max_attempts))
        } else {
            Err(anyhow::anyhow!("Tor not available"))
        }
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
            circuit_id: None,
            connection_health: 1.0,
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
    
    pub async fn perform_tor_health_check(&self) -> Result<()> {
        if let Some(ref tor_manager) = self.tor_manager {
            tor_manager.perform_health_check().await.map_err(|e| anyhow::anyhow!("Tor health check failed: {}", e))
        } else {
            Err(anyhow::anyhow!("Tor not enabled"))
        }
    }
    
    pub async fn rotate_tor_circuits(&self) -> Result<()> {
        if let Some(ref tor_manager) = self.tor_manager {
            tor_manager.rotate_circuits().await.map_err(|e| anyhow::anyhow!("Tor circuit rotation failed: {}", e))
        } else {
            Err(anyhow::anyhow!("Tor not enabled"))
        }
    }

    pub async fn request_posts_from_peer(&self, node_id: &str) -> Result<()> {
        // rate limit to one request per peer per 30 seconds
        {
            let now = chrono::Utc::now().timestamp() as u64;
            let mut cd = self.request_cooldowns.lock().unwrap();
            if let Some(last) = cd.get(node_id).copied() {
                if now.saturating_sub(last) < 30 {
                    return Ok(());
                }
            }
            cd.insert(node_id.to_string(), now);
        }
        let maybe_peer = {
            let peers = self.peers.lock().unwrap();
            peers.get(node_id).cloned()
        };
        if let Some(peer) = maybe_peer {
            let message = NetworkMessage {
                message_type: "request_posts".to_string(),
                payload: serde_json::json!({}),
                timestamp: chrono::Utc::now().timestamp() as u64,
                node_id: "local".to_string(),
            };
            self.send_message_to_peer(&message, &peer).await?;
        }
        Ok(())
    }

    /// Synchronizes posts with a specific peer to ensure feed consistency
    pub async fn sync_posts_with_peer(&self, node_id: &str) -> Result<()> {
        let maybe_peer = {
            let peers = self.peers.lock().unwrap();
            peers.get(node_id).cloned()
        };
        
        if let Some(peer) = maybe_peer {
            // Request recent posts from peer
            let message = NetworkMessage {
                message_type: "request_posts".to_string(),
                payload: serde_json::json!({}),
                timestamp: chrono::Utc::now().timestamp() as u64,
                node_id: "local".to_string(),
            };
            
            if let Err(e) = self.send_message_to_peer(&message, &peer).await {
                eprintln!("Failed to sync posts with peer {}: {}", node_id, e);
                return Err(e);
            }
            
            println!("🔄 Post-Synchronisation mit Peer {} gestartet", node_id);
        }
        
        Ok(())
    }

    /// Periodically sync posts with all peers to maintain consistency
    pub async fn sync_all_peers(&self) -> Result<()> {
        let peers = {
            let peers_guard = self.peers.lock().unwrap();
            peers_guard.values().cloned().collect::<Vec<_>>()
        };
        
        let mut sync_tasks = Vec::new();
        
                for peer in peers {
            let node_id = peer.node_id.clone();
            let network_manager = Arc::new(Mutex::new(self.clone()));
            
            let task = tokio::spawn(async move {
                // Clone the Arc to avoid holding the lock across await
                let network_manager_clone = network_manager.clone();
                let result = {
                    let nm = network_manager_clone.lock().unwrap();
                    nm.sync_posts_with_peer(&node_id)
                };
                if let Err(e) = result.await {
                    eprintln!("Failed to sync with peer {}: {}", node_id, e);
                }
            });
            
            sync_tasks.push(task);
        }
        
        // Wait for all sync tasks to complete
        for task in sync_tasks {
            let _ = task.await;
        }
        
        println!("🔄 Post-Synchronisation mit allen Peers abgeschlossen");
        Ok(())
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
            request_cooldowns: Arc::clone(&self.request_cooldowns),
            tor_health_monitor: Arc::clone(&self.tor_health_monitor),
            circuit_rotation_task: None, // Don't clone the task handle
        }
    }
}

// Default message handler implementation
pub struct DefaultMessageHandler {
    pub node_id: String,
    pub database_manager: Arc<Mutex<Database>>,
}

impl DefaultMessageHandler {
    pub fn new(node_id: String, database_manager: Arc<Mutex<Database>>) -> Self {
        Self { node_id, database_manager }
    }
}

impl MessageHandler for DefaultMessageHandler {
    fn handle_post(&self, post: &Post) -> Result<()> {
        println!("📨 Neuer Post von {}: {}", post.pseudonym, post.content);
        
        // Enhanced duplicate detection using content hash and timestamp
        let db = self.database_manager.lock().unwrap();
        
        // Check if post already exists using multiple criteria
        if !self.is_duplicate_post(post, &db)? {
            db.add_post(&post.clone())?;
            println!("💾 Post in Datenbank gespeichert");
            
            // Broadcast to other peers to ensure network consistency
            // This will be handled by the network manager
        } else {
            println!("⚠️  Duplikat-Post erkannt und ignoriert");
        }
        
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

    fn get_recent_posts(&self, limit: usize) -> Result<Vec<Post>> {
        let db = self.database_manager.lock().unwrap();
        db.get_posts_with_conflicts(limit).map_err(|e| anyhow::anyhow!("Database error: {}", e))
    }
}

impl DefaultMessageHandler {
    /// Enhanced duplicate detection using content hash and timestamp
    fn is_duplicate_post(&self, post: &Post, db: &Database) -> Result<bool> {
        // Get recent posts to check for duplicates
        let recent_posts = db.get_posts(100)?;
        
        for existing_post in recent_posts {
            // Check if this is the same post (same content + pseudonym + similar timestamp)
            if existing_post.content == post.content 
                && existing_post.pseudonym == post.pseudonym
                && (existing_post.timestamp as i64).abs_diff(post.timestamp as i64) < 300 {
                return Ok(true);
            }
            
            // Check if this is a duplicate from the same node within a short time
            if existing_post.node_id == post.node_id 
                && (existing_post.timestamp as i64).abs_diff(post.timestamp as i64) < 60 {
                return Ok(true);
            }
        }
        
        Ok(false)
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
        fn get_recent_posts(&self, _limit: usize) -> anyhow::Result<Vec<Post>> {
            Ok(vec![Post { id: None, content: "x".into(), timestamp: 1, pseudonym: "p".into(), node_id: Some("n".into()) }])
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