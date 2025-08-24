use tokio::net::{TcpListener, TcpStream, UdpSocket};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use serde::{Serialize, Deserialize};
use serde_json;
use anyhow::{Result, Context};
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::time::{interval, sleep};
use crate::types::{
    NetworkMessage, Post, Config, PostId, PostConflict, ConflictResolutionStrategy,
    FeedState, PeerFeedState, SyncStatus, SyncRequest, SyncResponse, SyncMode,
    PostBroadcast, PostOrder, DataIntegrityCheck, VerificationStatus
};

use crate::crypto::CryptoManager;
use crate::database::Database;
use crate::tor::{TorManager, TorStatus, CircuitInfo};

#[derive(Debug, Clone)]
pub struct TorHealthMonitor {
    pub last_check: std::time::Instant,
    pub health_score: f64,
    pub circuit_count: usize,
    pub connection_count: usize,
    pub last_circuit_rotation: std::time::Instant,
}

impl Default for TorHealthMonitor {
    fn default() -> Self {
        Self {
            last_check: std::time::Instant::now(),
            health_score: 1.0,
            circuit_count: 0,
            connection_count: 0,
            last_circuit_rotation: std::time::Instant::now(),
        }
    }
}
use sodiumoxide::crypto::box_;
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct NetworkTopology {
    pub node_id: String,
    pub connections: HashSet<String>, // Connected peer IDs
    pub routing_table: HashMap<String, String>, // destination -> next_hop
    pub network_segments: Vec<NetworkSegment>,
    pub topology_version: u64,
}

#[derive(Debug, Clone)]
pub struct NetworkSegment {
    pub segment_id: String,
    pub nodes: HashSet<String>,
    pub segment_type: SegmentType,
    pub connectivity_score: f64,
}

#[derive(Debug, Clone)]
pub enum SegmentType {
    Core,      // Highly connected nodes
    Edge,      // Leaf nodes
    Bridge,    // Nodes connecting segments
    Isolated,  // Poorly connected nodes
}

#[derive(Debug, Clone)]
pub struct NetworkStats {
    pub total_peers: usize,
    pub active_peers: usize,
    pub excellent_connections: usize,
    pub good_connections: usize,
    pub poor_connections: usize,
    pub avg_latency_ms: u64,
    pub segments_count: usize,
    pub topology_version: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiscoveryMessage {
    pub message_type: String,
    pub node_id: String,
    pub public_key: String,
    pub network_port: u16,
    pub timestamp: u64,
    pub capabilities: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct NetworkStatus {
    pub node_id: String,
    pub discovery_active: bool,
    pub discovery_port: u16,
    pub network_port: u16,
    pub tor_enabled: bool,
    pub tor_status: Option<TorStatus>,
    pub stats: NetworkStats,
    pub topology: NetworkTopology,
    pub peer_count: usize,
    pub unresolved_conflicts: usize,
}

#[derive(Debug, Clone)]
pub struct TorHealthMonitor {
    pub overall_health: f64,
    pub circuit_count: usize,
    pub active_connections: usize,
    pub failure_count: u32,
    pub last_check: std::time::Instant,
    pub last_circuit_rotation: std::time::Instant,
}

impl Default for TorHealthMonitor {
    fn default() -> Self {
        Self {
            overall_health: 1.0,
            circuit_count: 0,
            active_connections: 0,
            failure_count: 0,
            last_check: std::time::Instant::now(),
            last_circuit_rotation: std::time::Instant::now(),
        }
    }
}

pub struct NetworkManager {
    port: u16,
    tor_enabled: bool,
    tor_socks_port: u16,
    _crypto: CryptoManager,
    peers: Arc<Mutex<HashMap<String, PeerInfo>>>,
    message_handlers: Arc<Mutex<Vec<Box<dyn MessageHandler>>>>,
    tor_manager: Option<TorManager>,
    request_cooldowns: Arc<Mutex<HashMap<String, u64>>>,
    topology: Arc<Mutex<NetworkTopology>>,
    discovery_manager: Option<Arc<Mutex<crate::discovery::DiscoveryManager>>>,
    
    // New fields for peer discovery and management
    discovery_socket: Option<UdpSocket>,
    discovery_port: u16,
    heartbeat_interval: Duration,
    peer_timeout: Duration,
    max_peers: usize,
    local_node_id: String,
    local_public_key: String,
    
    // Tor and network management fields
    tor_health_monitor: Arc<Mutex<TorHealthMonitor>>,
    circuit_rotation_task: Option<tokio::task::JoinHandle<()>>,
    broadcast_cache: Arc<Mutex<HashMap<String, PostBroadcast>>>,
    post_conflicts: Arc<Mutex<HashMap<String, PostConflict>>>,
    feed_state: Arc<Mutex<FeedState>>,
    post_order: Arc<Mutex<HashMap<String, PostOrder>>>,
}

#[derive(Debug, Clone)]
pub struct PeerInfo {
    pub node_id: String,
    pub public_key: box_::PublicKey,
    pub address: String,
    pub port: u16,
    pub last_seen: u64,
    pub connection_quality: ConnectionQuality,
    pub capabilities: Vec<String>,
    pub latency_ms: Option<u64>,
    pub is_tor_peer: bool,
    pub circuit_id: Option<String>,
    pub connection_health: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub enum ConnectionQuality {
    Excellent, // < 50ms latency, stable
    Good,      // 50-100ms latency, stable
    Fair,      // 100-200ms latency, occasional drops
    Poor,      // > 200ms latency, frequent drops
    Unknown,   // Not yet measured
}

impl ConnectionQuality {
    pub fn from_latency(latency_ms: u64) -> Self {
        match latency_ms {
            0..=50 => ConnectionQuality::Excellent,
            51..=100 => ConnectionQuality::Good,
            101..=200 => ConnectionQuality::Fair,
            _ => ConnectionQuality::Poor,
        }
    }
    
    pub fn score(&self) -> f64 {
        match self {
            ConnectionQuality::Excellent => 1.0,
            ConnectionQuality::Good => 0.8,
            ConnectionQuality::Fair => 0.6,
            ConnectionQuality::Poor => 0.3,
            ConnectionQuality::Unknown => 0.5,
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
        let node_id = Uuid::new_v4().to_string();
        let feed_state = FeedState {
            node_id: node_id.clone(),
            last_sync_timestamp: chrono::Utc::now().timestamp() as u64,
            post_count: 0,
            last_post_id: None,
            peer_states: HashMap::new(),
        };
        
        Self {
            port,
            tor_enabled: false,
            tor_socks_port,
            _crypto: CryptoManager::new(),
            peers: Arc::new(Mutex::new(HashMap::new())),
            message_handlers: Arc::new(Mutex::new(Vec::new())),
            tor_manager: None,
            request_cooldowns: Arc::new(Mutex::new(HashMap::new())),
            topology: Arc::new(Mutex::new(NetworkTopology {
                node_id: "local".to_string(), // Placeholder, will be set by discovery
                connections: HashSet::new(),
                routing_table: HashMap::new(),
                network_segments: Vec::new(),
                topology_version: 0,
            })),
            discovery_manager: None,
            
            // New fields for peer discovery and management
            discovery_socket: None,
            discovery_port: 0, // Will be set by discovery manager
            heartbeat_interval: Duration::from_secs(60),
            peer_timeout: Duration::from_secs(10),
            max_peers: 100,
            local_node_id: node_id.clone(),
            local_public_key: "".to_string(), // Will be set by discovery manager
            
            // Tor and network management fields
            tor_health_monitor: Arc::new(Mutex::new(TorHealthMonitor::default())),
            circuit_rotation_task: None,
            broadcast_cache: Arc::new(Mutex::new(HashMap::new())),
            post_conflicts: Arc::new(Mutex::new(HashMap::new())),
            feed_state: Arc::new(Mutex::new(feed_state)),
            post_order: Arc::new(Mutex::new(HashMap::new())),
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
                                monitor.health_score = (monitor.health_score * 0.9).max(0.1);
                            }
                        }
                    } else {
                        // Update health monitor with current status
                        let status = tor_mgr.get_status();
                        {
                            if let Ok(mut monitor) = health_monitor.lock() {
                                monitor.last_check = std::time::Instant::now();
                                monitor.health_score = status.circuit_health;
                                monitor.circuit_count = status.active_circuits;
                                monitor.connection_count = status.total_connections;
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
                            monitor.health_score < 0.5 || time_since_rotation > Duration::from_secs(600)
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
            monitor.health_score = 0.0;
            monitor.circuit_count = 0;
            monitor.connection_count = 0;
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
        // Handle new message types
        match message.message_type.as_str() {
            "post_broadcast" => {
                if let Ok(broadcast) = serde_json::from_value::<PostBroadcast>(message.payload.clone()) {
                    self.handle_post_broadcast(&broadcast).await?;
                }
            }
            "sync_request" => {
                if let Ok(sync_request) = serde_json::from_value::<SyncRequest>(message.payload.clone()) {
                    self.handle_sync_request(&sync_request, &message.node_id).await?;
                }
            }
            "sync_response" => {
                if let Ok(sync_response) = serde_json::from_value::<SyncResponse>(message.payload.clone()) {
                    self.handle_sync_response(&sync_response).await?;
                }
            }
            _ => {
                // Fall back to existing message handling
                self.handle_legacy_message(message).await?;
            }
        }
        
        Ok(())
    }
    
    /// Enhanced post broadcast with TTL and conflict detection
    pub async fn broadcast_post(&self, post: &Post) -> Result<()> {
        let broadcast = PostBroadcast {
            post: post.clone(),
            broadcast_id: Uuid::new_v4().to_string(),
            ttl: 5, // 5 network hops
            origin_node: self.get_node_id().await?,
            broadcast_timestamp: chrono::Utc::now().timestamp() as u64,
        };
        
        // Cache the broadcast
        {
            let mut cache = self.broadcast_cache.lock().unwrap();
            cache.insert(broadcast.broadcast_id.clone(), broadcast.clone());
        }
        
        // Check for conflicts before broadcasting
        if let Some(conflict) = self.detect_post_conflict(post).await? {
            self.resolve_post_conflict(conflict).await?;
        }
        
        let message = NetworkMessage {
            message_type: "post_broadcast".to_string(),
            payload: serde_json::to_value(&broadcast)?,
            timestamp: chrono::Utc::now().timestamp() as u64,
            node_id: "local".to_string(),
        };
        
        self.broadcast_message(&message).await
    }
    
    /// Detects conflicts between posts
    async fn detect_post_conflict(&self, post: &Post) -> Result<Option<PostConflict>> {
        let post_id = post.get_post_id();
        let mut conflicts = Vec::new();
        
        // Check if we already have a post with similar content/timestamp
        {
            let handlers = self.message_handlers.lock().unwrap();
            for handler in handlers.iter() {
                if let Ok(recent_posts) = handler.get_recent_posts(100) {
                    for existing_post in recent_posts {
                        if self.is_conflicting_post(post, &existing_post) {
                            conflicts.push(existing_post);
                        }
                    }
                }
            }
        }
        
        if conflicts.is_empty() {
            Ok(None)
        } else {
            let conflict = PostConflict {
                post_id: post_id.clone(),
                conflicting_posts: conflicts,
                resolution_strategy: ConflictResolutionStrategy::LatestWins,
                resolved_at: None,
            };
            
            // Store conflict for resolution
            {
                let mut conflict_store = self.post_conflicts.lock().unwrap();
                conflict_store.insert(post_id.hash.clone(), conflict.clone());
            }
            
            Ok(Some(conflict))
        }
    }
    
    /// Determines if two posts are conflicting
    fn is_conflicting_post(&self, post1: &Post, post2: &Post) -> bool {
        // Same content, different timestamps (within 5 minutes)
        if post1.content == post2.content 
            && post1.pseudonym == post2.pseudonym
            && (post1.timestamp as i64).abs_diff(post2.timestamp as i64) < 300 {
            return true;
        }
        
        // Same node, similar timestamp, different content (potential duplicate)
        if post1.node_id == post2.node_id 
            && (post1.timestamp as i64).abs_diff(post2.timestamp as i64) < 60 {
            return true;
        }
        
        false
    }
    
    /// Resolves post conflicts using the specified strategy
    async fn resolve_post_conflict(&self, mut conflict: PostConflict) -> Result<()> {
        match conflict.resolution_strategy {
            ConflictResolutionStrategy::LatestWins => {
                let latest_post = conflict.conflicting_posts.iter()
                    .max_by_key(|p| p.timestamp)
                    .cloned();
                
                if let Some(post) = latest_post {
                    self.update_feed_state(&post).await?;
                    conflict.resolved_at = Some(chrono::Utc::now().timestamp() as u64);
                }
            }
            ConflictResolutionStrategy::FirstWins => {
                let first_post = conflict.conflicting_posts.iter()
                    .min_by_key(|p| p.timestamp)
                    .cloned();
                
                if let Some(post) = first_post {
                    self.update_feed_state(&post).await?;
                    conflict.resolved_at = Some(chrono::Utc::now().timestamp() as u64);
                }
            }
            ConflictResolutionStrategy::ContentHash => {
                // Use the post with the most unique content
                let best_post = conflict.conflicting_posts.iter()
                    .max_by_key(|p| p.content.len())
                    .cloned();
                
                if let Some(post) = best_post {
                    self.update_feed_state(&post).await?;
                    conflict.resolved_at = Some(chrono::Utc::now().timestamp() as u64);
                }
            }
            ConflictResolutionStrategy::Manual => {
                // Store conflict for manual resolution
                println!("⚠️  Manuelle Konfliktauflösung erforderlich für Post: {}", conflict.post_id.hash);
            }
            ConflictResolutionStrategy::Merged => {
                // Attempt to merge content if possible
                if let Some(merged_post) = self.merge_conflicting_posts(&conflict.conflicting_posts) {
                    self.update_feed_state(&merged_post).await?;
                    conflict.resolved_at = Some(chrono::Utc::now().timestamp() as u64);
                }
            }
        }
        
        // Update conflict store
        {
            let mut conflict_store = self.post_conflicts.lock().unwrap();
            conflict_store.insert(conflict.post_id.hash.clone(), conflict);
        }
        
        Ok(())
    }
    
    /// Attempts to merge conflicting posts
    fn merge_conflicting_posts(&self, posts: &[Post]) -> Option<Post> {
        if posts.len() < 2 {
            return posts.first().cloned();
        }
        
        // Find the base post (earliest timestamp)
        let base_post = posts.iter().min_by_key(|p| p.timestamp)?;
        
        // Merge content if they're similar
        let mut merged_content = base_post.content.clone();
        for post in posts.iter().skip(1) {
            if !merged_content.contains(&post.content) {
                merged_content.push_str(" | ");
                merged_content.push_str(&post.content);
            }
        }
        
        let mut merged_post = base_post.clone();
        merged_post.content = merged_content;
        merged_post.version += 1;
        
        Some(merged_post)
    }
    
    /// Updates the local feed state
    async fn update_feed_state(&self, post: &Post) -> Result<()> {
        let mut feed_state = self.feed_state.lock().unwrap();
        feed_state.post_count += 1;
        feed_state.last_sync_timestamp = chrono::Utc::now().timestamp() as u64;
        feed_state.last_post_id = Some(post.get_post_id());
        
        // Update post order
        {
            let mut post_order_store = self.post_order.lock().unwrap();
            let order = PostOrder {
                post_id: post.get_post_id(),
                sequence_number: feed_state.post_count as u64,
                timestamp: post.timestamp,
                node_id: post.node_id.clone().unwrap_or_else(|| "unknown".to_string()),
                parent_sequence: None,
            };
            post_order_store.insert(post.get_post_id().hash.clone(), order);
        }
        
        Ok(())
    }
    
    /// Ensures feed consistency between peers
    pub async fn ensure_feed_consistency(&self) -> Result<()> {
        let peers = self.get_peers();
        let mut sync_tasks = Vec::new();
        
        for peer in peers {
            let node_id = peer.node_id.clone();
            let network_manager = Arc::new(Mutex::new(self.clone()));
            
            let task = tokio::spawn(async move {
                if let Err(e) = network_manager.lock().unwrap().sync_feed_with_peer(&node_id).await {
                    eprintln!("Feed consistency sync failed for peer {}: {}", node_id, e);
                }
            });
            
            sync_tasks.push(task);
        }
        
        // Wait for all sync tasks to complete
        for task in sync_tasks {
            let _ = task.await;
        }
        
        println!("🔄 Feed-Konsistenz zwischen allen Peers sichergestellt");
        Ok(())
    }
    
    /// Synchronizes feed with a specific peer
    async fn sync_feed_with_peer(&self, node_id: &str) -> Result<()> {
        let sync_request = SyncRequest {
            requesting_node: self.get_node_id().await?,
            last_known_timestamp: {
                let feed_state = self.feed_state.lock().unwrap();
                feed_state.last_sync_timestamp
            },
            requested_post_count: 100,
            sync_mode: SyncMode::Incremental,
        };
        
        let message = NetworkMessage {
            message_type: "sync_request".to_string(),
            payload: serde_json::to_value(&sync_request)?,
            timestamp: chrono::Utc::now().timestamp() as u64,
            node_id: "local".to_string(),
        };
        
        if let Some(peer) = self.peers.lock().unwrap().get(node_id) {
            self.send_message_to_peer(&message, peer).await?;
            
            // Update peer feed state
            {
                let mut feed_state = self.feed_state.lock().unwrap();
                let peer_state = PeerFeedState {
                    node_id: node_id.to_string(),
                    last_seen_timestamp: chrono::Utc::now().timestamp() as u64,
                    last_post_timestamp: 0, // Will be updated when we receive posts
                    post_count: 0,
                    sync_status: SyncStatus::Pending,
                    last_sync_attempt: chrono::Utc::now().timestamp() as u64,
                };
                feed_state.peer_states.insert(node_id.to_string(), peer_state);
            }
        }
        
        Ok(())
    }
    
    /// Manages post ordering for consistent feed display
    pub async fn get_ordered_posts(&self, limit: usize) -> Result<Vec<Post>> {
        let mut ordered_posts = Vec::new();
        
        // Get posts from handlers
        {
            let handlers = self.message_handlers.lock().unwrap();
            for handler in handlers.iter() {
                if let Ok(posts) = handler.get_recent_posts(limit * 2) {
                    ordered_posts.extend(posts);
                }
            }
        }
        
        // Sort by timestamp and sequence number
        ordered_posts.sort_by(|a, b| {
            let time_cmp = a.timestamp.cmp(&b.timestamp);
            if time_cmp == std::cmp::Ordering::Equal {
                // Use sequence number for posts with same timestamp
                let seq_a = self.get_post_sequence_number(&a.get_post_id()).unwrap_or(0);
                let seq_b = self.get_post_sequence_number(&b.get_post_id()).unwrap_or(0);
                seq_a.cmp(&seq_b)
            } else {
                time_cmp
            }
        });
        
        // Apply limit and return
        ordered_posts.truncate(limit);
        Ok(ordered_posts)
    }
    
    /// Gets the sequence number for a post
    fn get_post_sequence_number(&self, post_id: &PostId) -> Option<u64> {
        let post_order_store = self.post_order.lock().unwrap();
        post_order_store.get(&post_id.hash).map(|order| order.sequence_number)
    }
    
    /// Performs data integrity checks on posts
    pub async fn verify_post_integrity(&self, post: &Post) -> Result<DataIntegrityCheck> {
        let post_id = post.get_post_id();
        
        // Verify content hash
        let expected_hash = post_id.hash.clone();
        let actual_hash = {
            use sha2::{Sha256, Digest};
            let mut hasher = Sha256::new();
            hasher.update(format!("{}{}{}", post.content, post.timestamp, post.pseudonym).as_bytes());
            format!("{:x}", hasher.finalize())
        };
        
        let hash_valid = expected_hash == actual_hash;
        
        // Verify signature if present
        let signature_valid = if let Some(signature) = &post.signature {
            self.verify_post_signature(post, signature).await?
        } else {
            true // No signature to verify
        };
        
        let verification_status = if hash_valid && signature_valid {
            VerificationStatus::Verified
        } else if !hash_valid {
            VerificationStatus::Failed
        } else {
            VerificationStatus::Pending
        };
        
        let integrity_check = DataIntegrityCheck {
            post_id: post_id.clone(),
            content_hash: actual_hash,
            signature: post.signature.clone().unwrap_or_else(|| "none".to_string()),
            public_key: "verification_key".to_string(), // Placeholder
            verification_status,
        };
        
        Ok(integrity_check)
    }
    
    /// Verifies post signature
    async fn verify_post_signature(&self, _post: &Post, _signature: &str) -> Result<bool> {
        // TODO: Implement actual signature verification
        // For now, return true as placeholder
        Ok(true)
    }
    
    /// Gets the current node ID
    async fn get_node_id(&self) -> Result<String> {
        let feed_state = self.feed_state.lock().unwrap();
        Ok(feed_state.node_id.clone())
    }
    
    /// Handles post broadcast messages
    async fn handle_post_broadcast(&self, broadcast: &PostBroadcast) -> Result<()> {
        // Check TTL
        if broadcast.ttl == 0 {
            return Ok(());
        }
        
        // Check if we've already seen this broadcast
        {
            let cache = self.broadcast_cache.lock().unwrap();
            if cache.contains_key(&broadcast.broadcast_id) {
                return Ok(());
            }
        }
        
        // Process the post
        let post = &broadcast.post;
        if post.is_valid() {
            // Check for conflicts
            if let Some(conflict) = self.detect_post_conflict(post).await? {
                self.resolve_post_conflict(conflict).await?;
            }
            
            // Update feed state
            self.update_feed_state(post).await?;
            
            // Re-broadcast with decremented TTL
            let mut new_broadcast = broadcast.clone();
            new_broadcast.ttl -= 1;
            
            if new_broadcast.ttl > 0 {
                let message = NetworkMessage {
                    message_type: "post_broadcast".to_string(),
                    payload: serde_json::to_value(&new_broadcast)?,
                    timestamp: chrono::Utc::now().timestamp() as u64,
                    node_id: "local".to_string(),
                };
                
                self.broadcast_message(&message).await?;
            }
        }
        
        Ok(())
    }
    
    /// Handles sync requests from peers
    async fn handle_sync_request(&self, sync_request: &SyncRequest, requesting_node: &str) -> Result<()> {
        let posts = self.get_ordered_posts(sync_request.requested_post_count).await?;
        let conflicts = self.get_post_conflicts().await?;
        
        let sync_response = SyncResponse {
            responding_node: self.get_node_id().await?,
            posts,
            conflicts,
            feed_state: self.get_feed_state().await?,
            sync_timestamp: chrono::Utc::now().timestamp() as u64,
        };
        
        let message = NetworkMessage {
            message_type: "sync_response".to_string(),
            payload: serde_json::to_value(&sync_response)?,
            timestamp: chrono::Utc::now().timestamp() as u64,
            node_id: "local".to_string(),
        };
        
        // Send response to requesting peer
        if let Some(peer) = self.peers.lock().unwrap().get(requesting_node) {
            self.send_message_to_peer(&message, peer).await?;
        }
        
        Ok(())
    }
    
    /// Handles sync responses from peers
    async fn handle_sync_response(&self, sync_response: &SyncResponse) -> Result<()> {
        // Process received posts
        for post in &sync_response.posts {
            if post.is_valid() {
                if let Some(conflict) = self.detect_post_conflict(post).await? {
                    self.resolve_post_conflict(conflict).await?;
                } else {
                    self.update_feed_state(post).await?;
                }
            }
        }
        
        // Process conflicts
        for conflict in &sync_response.conflicts {
            let mut conflict_store = self.post_conflicts.lock().unwrap();
            conflict_store.insert(conflict.post_id.hash.clone(), conflict.clone());
        }
        
        // Update peer feed state
        {
            let mut feed_state = self.feed_state.lock().unwrap();
            if let Some(peer_state) = feed_state.peer_states.get_mut(&sync_response.responding_node) {
                peer_state.sync_status = SyncStatus::Synchronized;
                peer_state.last_post_timestamp = sync_response.feed_state.last_sync_timestamp;
                peer_state.post_count = sync_response.feed_state.post_count;
            }
        }
        
        Ok(())
    }
    
    /// Gets post conflicts
    async fn get_post_conflicts(&self) -> Result<Vec<PostConflict>> {
        let conflict_store = self.post_conflicts.lock().unwrap();
        Ok(conflict_store.values().cloned().collect())
    }
    
    /// Gets current feed state
    async fn get_feed_state(&self) -> Result<FeedState> {
        let feed_state = self.feed_state.lock().unwrap();
        Ok(feed_state.clone())
    }
    
    /// Legacy message handling (existing functionality)
    async fn handle_legacy_message(&self, message: &NetworkMessage) -> Result<()> {
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
                                    health.health_score < 0.5
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
            connection_quality: ConnectionQuality::Unknown,
            capabilities: Vec::new(),
            latency_ms: None,
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

    /// Initialize discovery manager for automatic peer discovery
    pub async fn init_discovery(&mut self, node_id: String, public_key: String) -> Result<()> {
        let discovery_config = crate::discovery::DiscoveryConfig::default();
        let discovery_manager = crate::discovery::DiscoveryManager::new(
            discovery_config,
            node_id.clone(),
            public_key,
            self.port,
        );
        
        // Update topology with our node ID
        {
            let mut topology = self.topology.lock().unwrap();
            topology.node_id = node_id.clone();
        }
        
        self.discovery_manager = Some(Arc::new(Mutex::new(discovery_manager)));
        println!("🔍 Discovery Manager für Node {} initialisiert", node_id);
        Ok(())
    }
    
    /// Start automatic peer discovery
    pub async fn start_discovery(&self) -> Result<()> {
        if let Some(ref discovery_manager) = self.discovery_manager {
            let discovery_manager = discovery_manager.lock().unwrap();
            discovery_manager.start_discovery().await?;
            println!("🚀 Peer Discovery gestartet");
        } else {
            return Err(anyhow::anyhow!("Discovery manager not initialized"));
        }
        Ok(())
    }
    
    /// Start UDP broadcast for peer discovery
    pub async fn start_udp_discovery(&mut self, discovery_port: u16) -> Result<()> {
        self.discovery_port = discovery_port;
        
        // Bind UDP socket for discovery
        let socket = UdpSocket::bind(format!("0.0.0.0:{}", discovery_port)).await
            .context("Failed to bind UDP discovery socket")?;
        
        self.discovery_socket = Some(socket);
        
        // Start discovery listener task
        let discovery_socket = self.discovery_socket.as_ref().unwrap().try_clone().await?;
        let network_manager = Arc::new(Mutex::new(self.clone()));
        
        tokio::spawn(async move {
            Self::udp_discovery_listener(discovery_socket, network_manager).await;
        });
        
        // Start periodic broadcast task
        let discovery_socket = self.discovery_socket.as_ref().unwrap().try_clone().await?;
        let local_node_id = self.local_node_id.clone();
        let local_public_key = self.local_public_key.clone();
        let network_port = self.port;
        
        tokio::spawn(async move {
            Self::periodic_discovery_broadcast(
                discovery_socket,
                local_node_id,
                local_public_key,
                network_port,
            ).await;
        });
        
        println!("📡 UDP Discovery gestartet auf Port {}", discovery_port);
        Ok(())
    }
    
    /// UDP discovery listener that handles incoming discovery messages
    async fn udp_discovery_listener(
        mut socket: UdpSocket,
        network_manager: Arc<Mutex<NetworkManager>>,
    ) {
        let mut buffer = [0u8; 1024];
        
        loop {
            match socket.recv_from(&mut buffer).await {
                Ok((len, src_addr)) => {
                    let message_data = &buffer[..len];
                    
                    if let Ok(discovery_msg) = serde_json::from_slice::<DiscoveryMessage>(message_data) {
                        let network_manager_clone = network_manager.clone();
                        tokio::spawn(async move {
                            if let Ok(mut nm) = network_manager_clone.lock() {
                                if let Err(e) = nm.handle_discovery_message(&discovery_msg, &src_addr).await {
                                    eprintln!("Discovery message handling error: {}", e);
                                }
                            }
                        });
                    }
                }
                Err(e) => {
                    eprintln!("UDP discovery receive error: {}", e);
                    break;
                }
            }
        }
    }
    
    /// Periodic discovery broadcast to announce our presence
    async fn periodic_discovery_broadcast(
        socket: UdpSocket,
        node_id: String,
        public_key: String,
        network_port: u16,
    ) {
        let mut interval = interval(Duration::from_secs(30)); // Broadcast every 30 seconds
        
        loop {
            interval.tick().await;
            
            let discovery_msg = DiscoveryMessage {
                message_type: "announce".to_string(),
                node_id,
                public_key: public_key.clone(),
                network_port,
                timestamp: chrono::Utc::now().timestamp() as u64,
                capabilities: vec!["post_sync".to_string(), "tor_support".to_string()],
            };
            
            if let Ok(message_data) = serde_json::to_vec(&discovery_msg) {
                // Broadcast to local network
                let broadcast_addrs = vec![
                    "255.255.255.255:8888".parse().unwrap(),
                ];
                
                for addr in broadcast_addrs {
                    if let Err(e) = socket.send_to(&message_data, addr).await {
                        eprintln!("Failed to send discovery broadcast to {}: {}", addr, e);
                    }
                }
            }
        }
    }
    
    /// Handle incoming discovery messages
    async fn handle_discovery_message(&mut self, message: &DiscoveryMessage, src_addr: &std::net::SocketAddr) -> Result<()> {
        match message.message_type.as_str() {
            "announce" => {
                // New peer announcement
                if message.node_id != self.local_node_id {
                    self.handle_peer_announcement(message, src_addr).await?;
                }
            }
            "ping" => {
                // Discovery ping - respond with pong
                self.send_discovery_pong(message, src_addr).await?;
            }
            "pong" => {
                // Discovery pong response
                self.handle_discovery_pong(message, src_addr).await?;
            }
            _ => {
                eprintln!("Unknown discovery message type: {}", message.message_type);
            }
        }
        
        Ok(())
    }
    
    /// Handle peer announcement from discovery
    async fn handle_peer_announcement(&mut self, message: &DiscoveryMessage, src_addr: &std::net::SocketAddr) -> Result<()> {
        // Check if we already know this peer
        if self.peers.lock().unwrap().contains_key(&message.node_id) {
            return Ok(());
        }
        
        // Check if we have room for more peers
        if self.peers.lock().unwrap().len() >= self.max_peers {
            // Remove worst peer to make room
            self.remove_worst_peer().await?;
        }
        
        // Convert public key string to box_::PublicKey
        let public_key = self.parse_public_key(&message.public_key)?;
        
        // Add new peer
        let peer_info = PeerInfo {
            node_id: message.node_id.clone(),
            public_key,
            address: src_addr.ip().to_string(),
            port: message.network_port,
            last_seen: chrono::Utc::now().timestamp() as u64,
            connection_quality: ConnectionQuality::Unknown,
            capabilities: message.capabilities.clone(),
            latency_ms: None,
            is_tor_peer: false, // Will be determined during connection
            circuit_id: None,
            connection_health: 1.0,
        };
        
        self.add_peer_info(peer_info);
        
        println!("🔍 Neuer Peer entdeckt: {} ({}:{})", 
                message.node_id, src_addr.ip(), message.network_port);
        
        // Send our own announcement to establish bidirectional connection
        self.send_discovery_announcement(src_addr).await?;
        
        Ok(())
    }
    
    /// Send discovery announcement to specific address
    async fn send_discovery_announcement(&self, target_addr: &std::net::SocketAddr) -> Result<()> {
        if let Some(ref socket) = self.discovery_socket {
            let discovery_msg = DiscoveryMessage {
                message_type: "announce".to_string(),
                node_id: self.local_node_id.clone(),
                public_key: self.local_public_key.clone(),
                network_port: self.port,
                timestamp: chrono::Utc::now().timestamp() as u64,
                capabilities: vec!["post_sync".to_string(), "tor_support".to_string()],
            };
            
            let message_data = serde_json::to_vec(&discovery_msg)?;
            socket.send_to(&message_data, target_addr).await?;
        }
        
        Ok(())
    }
    
    /// Send discovery ping to check peer availability
    async fn send_discovery_ping(&self, target_addr: &std::net::SocketAddr) -> Result<()> {
        if let Some(ref socket) = self.discovery_socket {
            let discovery_msg = DiscoveryMessage {
                message_type: "ping".to_string(),
                node_id: self.local_node_id.clone(),
                public_key: self.local_public_key.clone(),
                network_port: self.port,
                timestamp: chrono::Utc::now().timestamp() as u64,
                capabilities: vec![],
            };
            
            let message_data = serde_json::to_vec(&discovery_msg)?;
            socket.send_to(&message_data, target_addr).await?;
        }
        
        Ok(())
    }
    
    /// Send discovery pong response
    async fn send_discovery_pong(&self, ping_message: &DiscoveryMessage, target_addr: &std::net::SocketAddr) -> Result<()> {
        if let Some(ref socket) = self.discovery_socket {
            let discovery_msg = DiscoveryMessage {
                message_type: "pong".to_string(),
                node_id: self.local_node_id.clone(),
                public_key: self.local_public_key.clone(),
                network_port: self.port,
                timestamp: chrono::Utc::now().timestamp() as u64,
                capabilities: vec![],
            };
            
            let message_data = serde_json::to_vec(&discovery_msg)?;
            socket.send_to(&message_data, target_addr).await?;
        }
        
        Ok(())
    }
    
    /// Handle discovery pong response
    async fn handle_discovery_pong(&self, message: &DiscoveryMessage, _src_addr: &std::net::SocketAddr) -> Result<()> {
        // Update peer last seen timestamp
        if let Some(peer) = self.peers.lock().unwrap().get_mut(&message.node_id) {
            peer.last_seen = chrono::Utc::now().timestamp() as u64;
        }
        
        Ok(())
    }
    
    /// Parse public key string to box_::PublicKey
    fn parse_public_key(&self, key_str: &str) -> Result<box_::PublicKey> {
        // Convert hex string to bytes
        let key_bytes = hex::decode(key_str)
            .context("Invalid public key format")?;
        
        // Convert to box_::PublicKey
        if key_bytes.len() != box_::PUBLICKEYBYTES {
            return Err(anyhow::anyhow!("Invalid public key length"));
        }
        
        let mut key_array = [0u8; box_::PUBLICKEYBYTES];
        key_array.copy_from_slice(&key_bytes);
        
        Ok(box_::PublicKey(key_array))
    }
    
    /// Remove worst peer to make room for new ones
    async fn remove_worst_peer(&self) -> Result<()> {
        let mut peers = self.peers.lock().unwrap();
        
        // Find peer with lowest connection quality
        let worst_peer = peers.iter()
            .min_by_key(|(_, peer)| peer.connection_quality.score() as u32);
        
        if let Some((node_id, _)) = worst_peer {
            let node_id = node_id.clone();
            drop(peers); // Release lock before calling remove_peer
            self.remove_peer(&node_id);
            println!("🗑️  Schlechtesten Peer entfernt: {}", node_id);
        }
        
        Ok(())
    }
    
    /// Add peer info to the peer registry
    fn add_peer_info(&self, peer_info: PeerInfo) {
        let mut peers = self.peers.lock().unwrap();
        peers.insert(peer_info.node_id.clone(), peer_info);
    }
    
    /// Start heartbeat monitoring for all peers
    pub async fn start_heartbeat_monitoring(&self) -> Result<()> {
        let network_manager = Arc::new(Mutex::new(self.clone()));
        
        tokio::spawn(async move {
            let mut interval = interval(Duration::from_secs(60)); // Heartbeat every minute
            
            loop {
                interval.tick().await;
                
                if let Ok(nm) = network_manager.lock() {
                    if let Err(e) = nm.perform_heartbeat_round().await {
                        eprintln!("Heartbeat round error: {}", e);
                    }
                }
            }
        });
        
        println!("💓 Heartbeat-Monitoring gestartet");
        Ok(())
    }
    
    /// Perform one round of heartbeat checks
    async fn perform_heartbeat_round(&self) -> Result<()> {
        let peers = self.get_peers();
        let mut tasks = Vec::new();
        
        for peer in peers {
            let node_id = peer.node_id.clone();
            let network_manager = Arc::new(Mutex::new(self.clone()));
            
            let task = tokio::spawn(async move {
                if let Ok(nm) = network_manager.lock() {
                    if let Err(e) = nm.heartbeat_peer(&node_id).await {
                        eprintln!("Heartbeat failed for peer {}: {}", node_id, e);
                    }
                }
            });
            
            tasks.push(task);
        }
        
        // Wait for all heartbeat tasks to complete
        for task in tasks {
            let _ = task.await;
        }
        
        // Remove inactive peers
        self.cleanup_inactive_peers().await?;
        
        Ok(())
    }
    
    /// Send heartbeat to specific peer
    async fn heartbeat_peer(&self, node_id: &str) -> Result<()> {
        let peer = {
            let peers = self.peers.lock().unwrap();
            peers.get(node_id).cloned()
        };
        
        if let Some(peer) = peer {
            // Send ping message
            let ping_message = NetworkMessage {
                message_type: "ping".to_string(),
                payload: serde_json::json!({}),
                timestamp: chrono::Utc::now().timestamp() as u64,
                node_id: self.local_node_id.clone(),
            };
            
            if let Err(e) = self.send_message_to_peer(&ping_message, &peer).await {
                // Mark peer as potentially inactive
                if let Some(peer) = self.peers.lock().unwrap().get_mut(node_id) {
                    peer.connection_health *= 0.8; // Reduce health score
                }
                return Err(e);
            }
            
            // Update peer health on successful ping
            if let Some(peer) = self.peers.lock().unwrap().get_mut(node_id) {
                peer.connection_health = (peer.connection_health + 0.2).min(1.0);
            }
        }
        
        Ok(())
    }
    
    /// Clean up inactive peers
    async fn cleanup_inactive_peers(&self) -> Result<()> {
        let now = chrono::Utc::now().timestamp() as u64;
        let mut peers_to_remove = Vec::new();
        
        {
            let peers = self.peers.lock().unwrap();
            for (node_id, peer) in peers.iter() {
                // Remove peers that haven't been seen in the last 10 minutes
                if now.saturating_sub(peer.last_seen) > 600 {
                    peers_to_remove.push(node_id.clone());
                }
                
                // Remove peers with very low health scores
                if peer.connection_health < 0.1 {
                    peers_to_remove.push(node_id.clone());
                }
            }
        }
        
        // Remove inactive peers
        for node_id in peers_to_remove {
            println!("🗑️  Inaktiven Peer entfernt: {}", node_id);
            self.remove_peer(&node_id);
        }
        
        Ok(())
    }

    /// Measure latency to a peer
    pub async fn measure_peer_latency(&self, node_id: &str) -> Result<u64> {
        let start_time = std::time::Instant::now();
        
        let ping_message = NetworkMessage {
            message_type: "ping".to_string(),
            payload: serde_json::json!({}),
            timestamp: chrono::Utc::now().timestamp() as u64,
            node_id: "local".to_string(),
        };
        
        if let Some(peer) = self.peers.lock().unwrap().get(node_id) {
            if let Err(_) = self.send_message_to_peer(&ping_message, peer).await {
                return Err(anyhow::anyhow!("Failed to send ping to peer"));
            }
            
            // Wait for pong response (simplified - in real implementation use async timeout)
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
            
            let latency = start_time.elapsed().as_millis() as u64;
            
            // Update peer latency
            if let Some(peer) = self.peers.lock().unwrap().get_mut(node_id) {
                peer.latency_ms = Some(latency);
                peer.connection_quality = ConnectionQuality::from_latency(latency);
            }
            
            Ok(latency)
        } else {
            Err(anyhow::anyhow!("Peer not found"))
        }
    }
    
    /// Analyze network topology and identify segments
    pub async fn analyze_topology(&self) -> Result<()> {
        let peers = self.peers.lock().unwrap();
        let mut topology = self.topology.lock().unwrap();
        
        // Clear old data
        topology.connections.clear();
        topology.routing_table.clear();
        topology.network_segments.clear();
        
        // Build connection graph
        for (node_id, peer) in peers.iter() {
            if peer.connection_quality.score() > 0.5 {
                topology.connections.insert(node_id.clone());
            }
        }
        
        // Identify network segments based on connectivity
        let mut visited = HashSet::new();
        let mut segments = Vec::new();
        
        for node_id in topology.connections.iter() {
            if !visited.contains(node_id) {
                let mut segment_nodes = HashSet::new();
                self.dfs_traverse(node_id, &mut segment_nodes, &mut visited, &peers);
                
                let segment_type = self.classify_segment(&segment_nodes, &peers);
                let connectivity_score = self.calculate_segment_score(&segment_nodes, &peers);
                
                let segment = NetworkSegment {
                    segment_id: format!("segment_{}", segments.len()),
                    nodes: segment_nodes,
                    segment_type,
                    connectivity_score,
                };
                
                segments.push(segment);
            }
        }
        
        topology.network_segments = segments;
        topology.topology_version += 1;
        
        println!("🔍 Netzwerk-Topologie analysiert: {} Segmente, {} aktive Verbindungen", 
                topology.network_segments.len(), topology.connections.len());
        
        Ok(())
    }
    
    /// Depth-first search to find connected components
    fn dfs_traverse(
        &self,
        node_id: &str,
        segment_nodes: &mut HashSet<String>,
        visited: &mut HashSet<String>,
        peers: &HashMap<String, PeerInfo>,
    ) {
        if visited.contains(node_id) {
            return;
        }
        
        visited.insert(node_id.to_string());
        segment_nodes.insert(node_id.to_string());
        
        // Find peers with good connection quality
        for (peer_id, peer) in peers.iter() {
            if peer.connection_quality.score() > 0.5 && !visited.contains(peer_id) {
                self.dfs_traverse(peer_id, segment_nodes, visited, peers);
            }
        }
    }
    
    /// Classify network segment based on node characteristics
    fn classify_segment(
        &self,
        segment_nodes: &HashSet<String>,
        peers: &HashMap<String, PeerInfo>,
    ) -> SegmentType {
        if segment_nodes.len() == 1 {
            return SegmentType::Isolated;
        }
        
        let mut total_score = 0.0;
        let mut node_count = 0;
        
        for node_id in segment_nodes {
            if let Some(peer) = peers.get(node_id) {
                total_score += peer.connection_quality.score();
                node_count += 1;
            }
        }
        
        let avg_score = if node_count > 0 { total_score / node_count as f64 } else { 0.0 };
        
        match (segment_nodes.len(), avg_score) {
            (1, _) => SegmentType::Isolated,
            (2..=5, score) if score > 0.7 => SegmentType::Core,
            (2..=5, _) => SegmentType::Edge,
            (6.., score) if score > 0.8 => SegmentType::Core,
            (6.., score) if score > 0.6 => SegmentType::Bridge,
            _ => SegmentType::Edge,
        }
    }
    
    /// Calculate connectivity score for a segment
    fn calculate_segment_score(
        &self,
        segment_nodes: &HashSet<String>,
        peers: &HashMap<String, PeerInfo>,
    ) -> f64 {
        let mut total_score = 0.0;
        let mut node_count = 0;
        
        for node_id in segment_nodes {
            if let Some(peer) = peers.get(node_id) {
                total_score += peer.connection_quality.score();
                node_count += 1;
            }
        }
        
        if node_count > 0 {
            total_score / node_count as f64
        } else {
            0.0
        }
    }
    
    /// Get network topology information
    pub fn get_topology(&self) -> NetworkTopology {
        self.topology.lock().unwrap().clone()
    }
    
    /// Get peers with specific connection quality
    pub fn get_peers_by_quality(&self, quality: ConnectionQuality) -> Vec<PeerInfo> {
        let peers = self.peers.lock().unwrap();
        peers.values()
            .filter(|peer| peer.connection_quality == quality)
            .cloned()
            .collect()
    }
    
    /// Get network statistics
    pub fn get_network_stats(&self) -> NetworkStats {
        let peers = self.peers.lock().unwrap();
        let topology = self.topology.lock().unwrap();
        
        let total_peers = peers.len();
        let active_peers = topology.connections.len();
        let excellent_connections = peers.values()
            .filter(|p| p.connection_quality == ConnectionQuality::Excellent)
            .count();
        let good_connections = peers.values()
            .filter(|p| p.connection_quality == ConnectionQuality::Good)
            .count();
        let poor_connections = peers.values()
            .filter(|p| p.connection_quality == ConnectionQuality::Poor)
            .count();
        
        let avg_latency = peers.values()
            .filter_map(|p| p.latency_ms)
            .sum::<u64>() as f64 / total_peers.max(1) as f64;
        
        NetworkStats {
            total_peers,
            active_peers,
            excellent_connections,
            good_connections,
            poor_connections,
            avg_latency_ms: avg_latency as u64,
            segments_count: topology.network_segments.len(),
            topology_version: topology.topology_version,
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

    /// Enhanced post synchronization with conflict detection and resolution
    pub async fn sync_posts_with_conflict_resolution(&self, node_id: &str) -> Result<()> {
        let peer = {
            let peers = self.peers.lock().unwrap();
            peers.get(node_id).cloned()
        };
        
        if let Some(peer) = peer {
            // Create comprehensive sync request
            let sync_request = SyncRequest {
                requesting_node: self.local_node_id.clone(),
                last_known_timestamp: {
                    let feed_state = self.feed_state.lock().unwrap();
                    feed_state.last_sync_timestamp
                },
                requested_post_count: 200, // Request more posts for better conflict detection
                sync_mode: SyncMode::Conflict, // Focus on posts with conflicts
            };
            
            let message = NetworkMessage {
                message_type: "sync_request".to_string(),
                payload: serde_json::to_value(&sync_request)?,
                timestamp: chrono::Utc::now().timestamp() as u64,
                node_id: self.local_node_id.clone(),
            };
            
            if let Err(e) = self.send_message_to_peer(&message, &peer).await {
                eprintln!("Failed to sync posts with peer {}: {}", node_id, e);
                return Err(e);
            }
            
            println!("🔄 Erweiterte Post-Synchronisation mit Peer {} gestartet", node_id);
        }
        
        Ok(())
    }
    
    /// Perform bidirectional post synchronization
    pub async fn bidirectional_sync_with_peer(&self, node_id: &str) -> Result<()> {
        // First, send our posts to the peer
        let posts_to_send = self.get_ordered_posts(100).await?;
        
        if !posts_to_send.is_empty() {
            for post in posts_to_send {
                let broadcast = PostBroadcast {
                    post: post.clone(),
                    broadcast_id: Uuid::new_v4().to_string(),
                    ttl: 3, // Limited TTL for direct sync
                    origin_node: self.local_node_id.clone(),
                    broadcast_timestamp: chrono::Utc::now().timestamp() as u64,
                };
                
                let message = NetworkMessage {
                    message_type: "post_broadcast".to_string(),
                    payload: serde_json::to_value(&broadcast)?,
                    timestamp: chrono::Utc::now().timestamp() as u64,
                    node_id: self.local_node_id.clone(),
                };
                
                if let Some(peer) = self.peers.lock().unwrap().get(node_id) {
                    if let Err(e) = self.send_message_to_peer(&message, peer).await {
                        eprintln!("Failed to send post to peer {}: {}", node_id, e);
                    }
                }
            }
        }
        
        // Then, request posts from the peer
        self.sync_posts_with_conflict_resolution(node_id).await?;
        
        println!("🔄 Bidirektionale Synchronisation mit Peer {} abgeschlossen", node_id);
        Ok(())
    }
    
    /// Enhanced conflict resolution with multiple strategies
    async fn resolve_post_conflict_enhanced(&self, mut conflict: PostConflict) -> Result<()> {
        // Try automatic resolution first
        match conflict.resolution_strategy {
            ConflictResolutionStrategy::LatestWins => {
                self.resolve_latest_wins(&mut conflict).await?;
            }
            ConflictResolutionStrategy::FirstWins => {
                self.resolve_first_wins(&mut conflict).await?;
            }
            ConflictResolutionStrategy::ContentHash => {
                self.resolve_content_hash(&mut conflict).await?;
            }
            ConflictResolutionStrategy::Merged => {
                self.resolve_merged(&mut conflict).await?;
            }
            ConflictResolutionStrategy::Manual => {
                // Store for manual resolution
                self.store_manual_conflict(conflict.clone()).await?;
                println!("⚠️  Manuelle Konfliktauflösung erforderlich für Post: {}", conflict.post_id.hash);
                return Ok(());
            }
        }
        
        // Update conflict store
        {
            let mut conflict_store = self.post_conflicts.lock().unwrap();
            conflict_store.insert(conflict.post_id.hash.clone(), conflict);
        }
        
        Ok(())
    }
    
    /// Resolve conflict using latest wins strategy
    async fn resolve_latest_wins(&self, conflict: &mut PostConflict) -> Result<()> {
        let latest_post = conflict.conflicting_posts.iter()
            .max_by_key(|p| p.timestamp)
            .cloned();
        
        if let Some(post) = latest_post {
            self.update_feed_state(&post).await?;
            conflict.resolved_at = Some(chrono::Utc::now().timestamp() as u64);
            println!("✅ Konflikt gelöst: Neuester Post gewinnt ({}: {})", 
                    post.pseudonym, post.content);
        }
        
        Ok(())
    }
    
    /// Resolve conflict using first wins strategy
    async fn resolve_first_wins(&self, conflict: &mut PostConflict) -> Result<()> {
        let first_post = conflict.conflicting_posts.iter()
            .min_by_key(|p| p.timestamp)
            .cloned();
        
        if let Some(post) = first_post {
            self.update_feed_state(&post).await?;
            conflict.resolved_at = Some(chrono::Utc::now().timestamp() as u64);
            println!("✅ Konflikt gelöst: Erster Post gewinnt ({}: {})", 
                    post.pseudonym, post.content);
        }
        
        Ok(())
    }
    
    /// Resolve conflict using content hash strategy
    async fn resolve_content_hash(&self, conflict: &mut PostConflict) -> Result<()> {
        let best_post = conflict.conflicting_posts.iter()
            .max_by_key(|p| {
                // Score based on content uniqueness and length
                let content_score = p.content.len() as u64;
                let uniqueness_score = p.content.chars().collect::<HashSet<_>>().len() as u64;
                content_score + uniqueness_score
            })
            .cloned();
        
        if let Some(post) = best_post {
            self.update_feed_state(&post).await?;
            conflict.resolved_at = Some(chrono::Utc::now().timestamp() as u64);
            println!("✅ Konflikt gelöst: Beste Inhaltsqualität gewinnt ({}: {})", 
                    post.pseudonym, post.content);
        }
        
        Ok(())
    }
    
    /// Resolve conflict by merging content
    async fn resolve_merged(&self, conflict: &mut PostConflict) -> Result<()> {
        if let Some(merged_post) = self.merge_conflicting_posts(&conflict.conflicting_posts) {
            self.update_feed_state(&merged_post).await?;
            conflict.resolved_at = Some(chrono::Utc::now().timestamp() as u64);
            println!("✅ Konflikt gelöst: Inhalte zusammengeführt ({}: {})", 
                    merged_post.pseudonym, merged_post.content);
        } else {
            // Fallback to latest wins if merging fails
            self.resolve_latest_wins(conflict).await?;
        }
        
        Ok(())
    }
    
    /// Store conflict for manual resolution
    async fn store_manual_conflict(&self, conflict: PostConflict) -> Result<()> {
        let mut conflict_store = self.post_conflicts.lock().unwrap();
        conflict_store.insert(conflict.post_id.hash.clone(), conflict);
        Ok(())
    }
    
    /// Get all unresolved conflicts
    pub async fn get_unresolved_conflicts(&self) -> Result<Vec<PostConflict>> {
        let conflict_store = self.post_conflicts.lock().unwrap();
        Ok(conflict_store.values()
            .filter(|c| c.resolved_at.is_none())
            .cloned()
            .collect())
    }
    
    /// Manually resolve a specific conflict
    pub async fn manually_resolve_conflict(&self, post_id: &str, resolution_strategy: ConflictResolutionStrategy) -> Result<()> {
        let mut conflict_store = self.post_conflicts.lock().unwrap();
        
        if let Some(mut conflict) = conflict_store.get_mut(post_id) {
            conflict.resolution_strategy = resolution_strategy;
            drop(conflict_store); // Release lock before calling resolution
            
            self.resolve_post_conflict_enhanced(conflict.clone()).await?;
            println!("✅ Konflikt {} manuell gelöst", post_id);
        } else {
            return Err(anyhow::anyhow!("Conflict not found"));
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
                    nm.bidirectional_sync_with_peer(&node_id)
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
    
    /// Enhanced message handling with retry logic and error handling
    async fn handle_message_enhanced(&self, message: &NetworkMessage) -> Result<()> {
        let max_retries = 3;
        let mut retry_count = 0;
        
        while retry_count < max_retries {
            match self.handle_message(message).await {
                Ok(_) => {
                    // Message handled successfully
                    return Ok(());
                }
                Err(e) => {
                    retry_count += 1;
                    eprintln!("Message handling attempt {} failed: {}", retry_count, e);
                    
                    if retry_count < max_retries {
                        // Wait before retry with exponential backoff
                        let delay = Duration::from_millis(100 * 2_u64.pow(retry_count as u32));
                        sleep(delay).await;
                        
                        // Try to reconnect to peer if connection issues
                        if let Err(conn_err) = self.reconnect_to_peer(&message.node_id).await {
                            eprintln!("Failed to reconnect to peer {}: {}", message.node_id, conn_err);
                        }
                    } else {
                        // Max retries reached, log error and continue
                        eprintln!("Max retries reached for message from {}: {}", message.node_id, e);
                        return Err(e);
                    }
                }
            }
        }
        
        Ok(())
    }
    
    /// Attempt to reconnect to a peer
    async fn reconnect_to_peer(&self, node_id: &str) -> Result<()> {
        let peer = {
            let peers = self.peers.lock().unwrap();
            peers.get(node_id).cloned()
        };
        
        if let Some(peer) = peer {
            // Test connection
            let test_message = NetworkMessage {
                message_type: "ping".to_string(),
                payload: serde_json::json!({}),
                timestamp: chrono::Utc::now().timestamp() as u64,
                node_id: self.local_node_id.clone(),
            };
            
            if let Err(_) = self.send_message_to_peer(&test_message, &peer).await {
                // Connection failed, try to refresh peer info
                println!("🔄 Versuche Verbindung zu Peer {} zu erneuern", node_id);
                
                // Update peer connection quality
                if let Some(peer) = self.peers.lock().unwrap().get_mut(node_id) {
                    peer.connection_quality = ConnectionQuality::Poor;
                    peer.connection_health *= 0.5;
                }
                
                // Try discovery ping to refresh peer
                if let Some(peer) = self.peers.lock().unwrap().get(node_id) {
                    let addr = format!("{}:{}", peer.address, peer.port).parse::<std::net::SocketAddr>()?;
                    if let Err(e) = self.send_discovery_ping(&addr).await {
                        eprintln!("Discovery ping failed: {}", e);
                    }
                }
            } else {
                // Connection successful, update peer health
                if let Some(peer) = self.peers.lock().unwrap().get_mut(node_id) {
                    peer.connection_health = (peer.connection_health + 0.3).min(1.0);
                }
                println!("✅ Verbindung zu Peer {} wiederhergestellt", node_id);
            }
        }
        
        Ok(())
    }
    
    /// Handle network errors with appropriate recovery strategies
    async fn handle_network_error(&self, error: &anyhow::Error, peer_id: &str) -> Result<()> {
        let error_str = error.to_string().to_lowercase();
        
        if error_str.contains("connection refused") || error_str.contains("timeout") {
            // Connection issues - try to reconnect
            self.reconnect_to_peer(peer_id).await?;
        } else if error_str.contains("invalid message") || error_str.contains("parse error") {
            // Message format issues - log and continue
            eprintln!("Message format error from peer {}: {}", peer_id, error);
        } else if error_str.contains("permission denied") || error_str.contains("access denied") {
            // Permission issues - remove peer
            eprintln!("Permission denied for peer {}, removing: {}", peer_id, error);
            self.remove_peer(peer_id);
        } else {
            // Unknown error - log and try to continue
            eprintln!("Unknown network error from peer {}: {}", peer_id, error);
        }
        
        Ok(())
    }
    
    /// Start automatic error recovery and monitoring
    pub async fn start_error_recovery_monitoring(&self) -> Result<()> {
        let network_manager = Arc::new(Mutex::new(self.clone()));
        
        tokio::spawn(async move {
            let mut interval = interval(Duration::from_secs(300)); // Check every 5 minutes
            
            loop {
                interval.tick().await;
                
                if let Ok(nm) = network_manager.lock() {
                    if let Err(e) = nm.perform_error_recovery_round().await {
                        eprintln!("Error recovery round failed: {}", e);
                    }
                }
            }
        });
        
        println!("🔧 Fehlerbehebung-Monitoring gestartet");
        Ok(())
    }
    
    /// Perform one round of error recovery
    async fn perform_error_recovery_round(&self) -> Result<()> {
        let peers = self.get_peers();
        let mut recovery_tasks = Vec::new();
        
        for peer in peers {
            let node_id = peer.node_id.clone();
            let network_manager = Arc::new(Mutex::new(self.clone()));
            
            let task = tokio::spawn(async move {
                if let Ok(nm) = network_manager.lock() {
                    if let Err(e) = nm.recover_peer_connection(&node_id).await {
                        eprintln!("Peer recovery failed for {}: {}", node_id, e);
                    }
                }
            });
            
            recovery_tasks.push(task);
        }
        
        // Wait for all recovery tasks to complete
        for task in recovery_tasks {
            let _ = task.await;
        }
        
        Ok(())
    }
    
    /// Attempt to recover connection to a specific peer
    async fn recover_peer_connection(&self, node_id: &str) -> Result<()> {
        let peer = {
            let peers = self.peers.lock().unwrap();
            peers.get(node_id).cloned()
        };
        
        if let Some(peer) = peer {
            // Check if peer needs recovery
            if peer.connection_health < 0.5 {
                println!("🔄 Versuche Verbindung zu Peer {} zu erneuern (Health: {:.2})", 
                        node_id, peer.connection_health);
                
                // Try to reconnect
                self.reconnect_to_peer(node_id).await?;
                
                // Measure latency to assess recovery
                if let Ok(latency) = self.measure_peer_latency(node_id).await {
                    println!("📊 Peer {} Latenz nach Wiederherstellung: {}ms", node_id, latency);
                }
            }
        }
        
        Ok(())
    }
    
    /// Start the complete P2P network with all components
    pub async fn start_p2p_network(&mut self, discovery_port: u16, public_key: String) -> Result<()> {
        println!("🚀 Starte vollständiges P2P-Netzwerk...");
        
        // Initialize local node information
        self.local_public_key = public_key;
        
        // Start UDP discovery
        self.start_udp_discovery(discovery_port).await?;
        
        // Start heartbeat monitoring
        self.start_heartbeat_monitoring().await?;
        
        // Start error recovery monitoring
        self.start_error_recovery_monitoring().await?;
        
        // Start TCP server for incoming connections
        let network_manager = Arc::new(Mutex::new(self.clone()));
        tokio::spawn(async move {
            if let Ok(nm) = network_manager.lock() {
                if let Err(e) = nm.start_server().await {
                    eprintln!("Failed to start TCP server: {}", e);
                }
            }
        });
        
        // Start periodic topology analysis
        let network_manager = Arc::new(Mutex::new(self.clone()));
        tokio::spawn(async move {
            let mut interval = interval(Duration::from_secs(300)); // Every 5 minutes
            
            loop {
                interval.tick().await;
                
                if let Ok(nm) = network_manager.lock() {
                    if let Err(e) = nm.analyze_topology().await {
                        eprintln!("Topology analysis failed: {}", e);
                    }
                }
            }
        });
        
        // Start periodic post synchronization
        let network_manager = Arc::new(Mutex::new(self.clone()));
        tokio::spawn(async move {
            let mut interval = interval(Duration::from_secs(180)); // Every 3 minutes
            
            loop {
                interval.tick().await;
                
                if let Ok(nm) = network_manager.lock() {
                    if let Err(e) = nm.sync_all_peers().await {
                        eprintln!("Periodic sync failed: {}", e);
                    }
                }
            }
        });
        
        println!("✅ P2P-Netzwerk erfolgreich gestartet!");
        println!("   📡 Discovery Port: {}", discovery_port);
        println!("   🌐 Network Port: {}", self.port);
        println!("   💓 Heartbeat: Aktiv");
        println!("   🔧 Error Recovery: Aktiv");
        println!("   🔍 Topology Analysis: Aktiv");
        println!("   🔄 Post Sync: Aktiv");
        
        Ok(())
    }
    
    /// Get comprehensive network status
    pub fn get_network_status(&self) -> NetworkStatus {
        let stats = self.get_network_stats();
        let topology = self.get_topology();
        let tor_status = self.get_tor_status();
        
        NetworkStatus {
            node_id: self.local_node_id.clone(),
            discovery_active: self.discovery_socket.is_some(),
            discovery_port: self.discovery_port,
            network_port: self.port,
            tor_enabled: self.tor_enabled,
            tor_status,
            stats,
            topology,
            peer_count: self.peers.lock().unwrap().len(),
            unresolved_conflicts: {
                let conflicts = self.post_conflicts.lock().unwrap();
                conflicts.values().filter(|c| c.resolved_at.is_none()).count()
            },
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
            request_cooldowns: Arc::clone(&self.request_cooldowns),
            topology: Arc::clone(&self.topology),
            discovery_manager: self.discovery_manager.clone(),
            
            // New fields for peer discovery and management
            discovery_socket: None, // Cannot clone UdpSocket
            discovery_port: self.discovery_port,
            heartbeat_interval: self.heartbeat_interval,
            peer_timeout: self.peer_timeout,
            max_peers: self.max_peers,
            local_node_id: self.local_node_id.clone(),
            local_public_key: self.local_public_key.clone(),
            
            // Missing fields that were referenced but not defined
            feed_state: Arc::clone(&self.feed_state),
            post_conflicts: Arc::clone(&self.post_conflicts),
            post_order: Arc::clone(&self.post_order),
            broadcast_cache: Arc::clone(&self.broadcast_cache),
            tor_health_monitor: Arc::clone(&self.tor_health_monitor),
            circuit_rotation_task: self.circuit_rotation_task.clone(),
        }
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

    #[test]
    fn test_connection_quality_scoring() {
        assert_eq!(ConnectionQuality::Excellent.score(), 1.0);
        assert_eq!(ConnectionQuality::Good.score(), 0.8);
        assert_eq!(ConnectionQuality::Fair.score(), 0.6);
        assert_eq!(ConnectionQuality::Poor.score(), 0.3);
        assert_eq!(ConnectionQuality::Unknown.score(), 0.5);
    }

    #[test]
    fn test_connection_quality_from_latency() {
        assert!(matches!(ConnectionQuality::from_latency(25), ConnectionQuality::Excellent));
        assert!(matches!(ConnectionQuality::from_latency(75), ConnectionQuality::Good));
        assert!(matches!(ConnectionQuality::from_latency(150), ConnectionQuality::Fair));
        assert!(matches!(ConnectionQuality::from_latency(300), ConnectionQuality::Poor));
    }

    #[test]
    fn test_network_topology_creation() {
        let topology = NetworkTopology {
            node_id: "test_node".to_string(),
            connections: HashSet::new(),
            routing_table: HashMap::new(),
            network_segments: Vec::new(),
            topology_version: 0,
        };
        
        assert_eq!(topology.node_id, "test_node");
        assert_eq!(topology.topology_version, 0);
        assert!(topology.connections.is_empty());
    }

    #[test]
    fn test_network_segment_classification() {
        let manager = NetworkManager::new(0, 9050);
        let mut peers = HashMap::new();
        
        // Create test peers with different connection qualities
        let (pubk1, _) = CryptoManager::new().generate_keypair().unwrap();
        let (pubk2, _) = CryptoManager::new().generate_keypair().unwrap();
        
        manager.add_peer("peer1".to_string(), pubk1, "127.0.0.1".to_string(), 1234, false);
        manager.add_peer("peer2".to_string(), pubk2, "127.0.0.1".to_string(), 1235, false);
        
        // Update peer connection quality
        if let Some(peer) = manager.peers.lock().unwrap().get_mut("peer1") {
            peer.connection_quality = ConnectionQuality::Excellent;
            peer.latency_ms = Some(25);
        }
        if let Some(peer) = manager.peers.lock().unwrap().get_mut("peer2") {
            peer.connection_quality = ConnectionQuality::Good;
            peer.latency_ms = Some(75);
        }
        
        let peers = manager.peers.lock().unwrap();
        let segment_nodes = HashSet::from_iter(vec!["peer1".to_string(), "peer2".to_string()]);
        
        let segment_type = manager.classify_segment(&segment_nodes, &peers);
        let score = manager.calculate_segment_score(&segment_nodes, &peers);
        
        // Should be classified as Core due to high average score
        assert!(matches!(segment_type, SegmentType::Core));
        assert!(score > 0.8); // Average of Excellent (1.0) and Good (0.8)
    }

    #[test]
    fn test_network_stats() {
        let manager = NetworkManager::new(0, 9050);
        let (pubk1, _) = CryptoManager::new().generate_keypair().unwrap();
        let (pubk2, _) = CryptoManager::new().generate_keypair().unwrap();
        
        manager.add_peer("peer1".to_string(), pubk1, "127.0.0.1".to_string(), 1234, false);
        manager.add_peer("peer2".to_string(), pubk2, "127.0.0.1".to_string(), 1235, false);
        
        // Update peer connection quality and latency
        if let Some(peer) = manager.peers.lock().unwrap().get_mut("peer1") {
            peer.connection_quality = ConnectionQuality::Excellent;
            peer.latency_ms = Some(25);
        }
        if let Some(peer) = manager.peers.lock().unwrap().get_mut("peer2") {
            peer.connection_quality = ConnectionQuality::Good;
            peer.latency_ms = Some(75);
        }
        
        let stats = manager.get_network_stats();
        
        assert_eq!(stats.total_peers, 2);
        assert_eq!(stats.excellent_connections, 1);
        assert_eq!(stats.good_connections, 1);
        assert_eq!(stats.poor_connections, 0);
        assert_eq!(stats.avg_latency_ms, 50); // (25 + 75) / 2
    }

    #[tokio::test]
    async fn test_discovery_initialization() {
        let mut manager = NetworkManager::new(0, 9050);
        let result = manager.init_discovery("test_node".to_string(), "test_key".to_string()).await;
        assert!(result.is_ok());
        
        let topology = manager.get_topology();
        assert_eq!(topology.node_id, "test_node");
    }

    #[test]
    fn test_peer_quality_filtering() {
        let manager = NetworkManager::new(0, 9050);
        let (pubk1, _) = CryptoManager::new().generate_keypair().unwrap();
        let (pubk2, _) = CryptoManager::new().generate_keypair().unwrap();
        let (pubk3, _) = CryptoManager::new().generate_keypair().unwrap();
        
        manager.add_peer("excellent_peer".to_string(), pubk1, "127.0.0.1".to_string(), 1234, false);
        manager.add_peer("good_peer".to_string(), pubk2, "127.0.0.1".to_string(), 1235, false);
        manager.add_peer("poor_peer".to_string(), pubk3, "127.0.0.1".to_string(), 1236, false);
        
        // Update peer connection quality
        if let Some(peer) = manager.peers.lock().unwrap().get_mut("excellent_peer") {
            peer.connection_quality = ConnectionQuality::Excellent;
        }
        if let Some(peer) = manager.peers.lock().unwrap().get_mut("good_peer") {
            peer.connection_quality = ConnectionQuality::Good;
        }
        if let Some(peer) = manager.peers.lock().unwrap().get_mut("poor_peer") {
            peer.connection_quality = ConnectionQuality::Poor;
        }
        
        let excellent_peers = manager.get_peers_by_quality(ConnectionQuality::Excellent);
        let good_peers = manager.get_peers_by_quality(ConnectionQuality::Good);
        let poor_peers = manager.get_peers_by_quality(ConnectionQuality::Poor);
        
        assert_eq!(excellent_peers.len(), 1);
        assert_eq!(good_peers.len(), 1);
        assert_eq!(poor_peers.len(), 1);
        
        assert_eq!(excellent_peers[0].node_id, "excellent_peer");
        assert_eq!(good_peers[0].node_id, "good_peer");
        assert_eq!(poor_peers[0].node_id, "poor_peer");
    }
    /// Connect to a peer at the specified address
    pub async fn connect_to_peer(&mut self, address: &str, port: u16) -> Result<()> {
        let stream = TcpStream::connect(format!("{}:{}", address, port)).await
            .context("Failed to connect to peer")?;
        
        // Create a new peer info
        let peer_info = PeerInfo {
            node_id: format!("peer_{}:{}", address, port),
            public_key: box_::PublicKey([0u8; 32]), // Will be updated during handshake
            address: address.to_string(),
            port,
            last_seen: chrono::Utc::now().timestamp() as u64,
            connection_quality: ConnectionQuality::Unknown,
            capabilities: vec!["basic".to_string()],
            latency_ms: None,
            is_tor_peer: false,
            circuit_id: None,
            connection_health: 1.0,
        };
        
        // Add to peers list
        {
            let mut peers = self.peers.lock().unwrap();
            peers.insert(peer_info.node_id.clone(), peer_info);
        }
        
        // Start connection handler
        let network_manager = Arc::new(Mutex::new(self.clone()));
        tokio::spawn(async move {
            if let Err(e) = Self::handle_connection(stream, network_manager).await {
                eprintln!("Peer connection handler error: {}", e);
            }
        });
        
        println!("🔗 Verbindung zu Peer {}:{} hergestellt", address, port);
        Ok(())
    }
    
    /// Start UDP discovery for peer finding
    async fn start_udp_discovery(&mut self, discovery_port: u16) -> Result<()> {
        self.discovery_port = discovery_port;
        
        let socket = UdpSocket::bind(format!("0.0.0.0:{}", discovery_port)).await
            .context("Failed to bind discovery socket")?;
        
        self.discovery_socket = Some(socket);
        
        // Start discovery listener
        let discovery_socket = self.discovery_socket.as_ref().unwrap().try_clone().await?;
        let network_manager = Arc::new(Mutex::new(self.clone()));
        
        tokio::spawn(async move {
            let mut buffer = [0u8; 1024];
            
            loop {
                match discovery_socket.recv_from(&mut buffer).await {
                    Ok((n, addr)) => {
                        if let Ok(message) = serde_json::from_slice::<DiscoveryMessage>(&buffer[..n]) {
                            let network_manager_clone = network_manager.clone();
                            tokio::spawn(async move {
                                if let Ok(nm) = network_manager_clone.lock() {
                                    if let Err(e) = nm.handle_discovery_message(&message, &addr).await {
                                        eprintln!("Discovery message handling error: {}", e);
                                    }
                                }
                            });
                        }
                    }
                    Err(e) => {
                        eprintln!("Discovery socket error: {}", e);
                        break;
                    }
                }
            }
        });
        
        println!("🔍 UDP Discovery gestartet auf Port {}", discovery_port);
        Ok(())
    }
    
    /// Handle incoming discovery messages
    async fn handle_discovery_message(&self, message: &DiscoveryMessage, addr: &std::net::SocketAddr) -> Result<()> {
        match message.message_type.as_str() {
            "ping" => {
                // Respond with pong
                let pong = DiscoveryMessage {
                    message_type: "pong".to_string(),
                    node_id: self.local_node_id.clone(),
                    public_key: self.local_public_key.clone(),
                    network_port: self.port,
                    timestamp: chrono::Utc::now().timestamp() as u64,
                    capabilities: vec!["basic".to_string(), "posts".to_string(), "sync".to_string()],
                };
                
                if let Some(socket) = &self.discovery_socket {
                    let response = serde_json::to_vec(&pong)?;
                    socket.send_to(&response, addr).await?;
                }
            }
            "pong" => {
                // New peer discovered, try to connect
                if message.node_id != self.local_node_id {
                    println!("🔍 Neuer Peer entdeckt: {} auf {}:{}", 
                            message.node_id, addr.ip(), message.network_port);
                    
                    // Connect to the discovered peer
                    if let Err(e) = self.connect_to_peer(&addr.ip().to_string(), message.network_port).await {
                        eprintln!("Failed to connect to discovered peer: {}", e);
                    }
                }
            }
            _ => {
                // Unknown message type, ignore
            }
        }
        
        Ok(())
    }
    
    /// Start heartbeat monitoring for all peers
    async fn start_heartbeat_monitoring(&self) -> Result<()> {
        let network_manager = Arc::new(Mutex::new(self.clone()));
        
        tokio::spawn(async move {
            let mut interval = interval(Duration::from_secs(30)); // Every 30 seconds
            
            loop {
                interval.tick().await;
                
                if let Ok(nm) = network_manager.lock() {
                    if let Err(e) = nm.send_heartbeat_to_all_peers().await {
                        eprintln!("Heartbeat error: {}", e);
                    }
                }
            }
        });
        
        println!("💓 Heartbeat-Monitoring gestartet");
        Ok(())
    }
    
    /// Send heartbeat to all connected peers
    async fn send_heartbeat_to_all_peers(&self) -> Result<()> {
        let peers = {
            let peers = self.peers.lock().unwrap();
            peers.values().cloned().collect::<Vec<_>>()
        };
        
        for peer in peers {
            let heartbeat = NetworkMessage {
                message_type: "heartbeat".to_string(),
                payload: serde_json::json!({
                    "timestamp": chrono::Utc::now().timestamp(),
                    "node_id": self.local_node_id
                }),
                timestamp: chrono::Utc::now().timestamp() as u64,
                node_id: self.local_node_id.clone(),
            };
            
            if let Err(e) = self.send_message_to_peer(&heartbeat, &peer).await {
                eprintln!("Failed to send heartbeat to {}: {}", peer.node_id, e);
                // Mark peer for removal if heartbeat fails
                self.remove_peer(&peer.node_id);
            }
        }
        
        Ok(())
    }
    
    /// Start error recovery monitoring
    async fn start_error_recovery_monitoring(&self) -> Result<()> {
        let network_manager = Arc::new(Mutex::new(self.clone()));
        
        tokio::spawn(async move {
            let mut interval = interval(Duration::from_secs(60)); // Every minute
            
            loop {
                interval.tick().await;
                
                if let Ok(nm) = network_manager.lock() {
                    if let Err(e) = nm.perform_error_recovery().await {
                        eprintln!("Error recovery failed: {}", e);
                    }
                }
            }
        });
        
        println!("🔧 Error Recovery Monitoring gestartet");
        Ok(())
    }
    
    /// Perform error recovery for unhealthy peers
    async fn perform_error_recovery(&self) -> Result<()> {
        let mut peers_to_recover = Vec::new();
        
        {
            let peers = self.peers.lock().unwrap();
            for (node_id, peer) in peers.iter() {
                if peer.connection_health < 0.5 {
                    peers_to_recover.push(node_id.clone());
                }
            }
        }
        
        for node_id in peers_to_recover {
            println!("🔄 Versuche Wiederherstellung für Peer: {}", node_id);
            
            // Try to reconnect
            if let Err(e) = self.reconnect_to_peer(&node_id).await {
                eprintln!("Failed to reconnect to peer {}: {}", node_id, e);
                // Remove peer if reconnection fails
                self.remove_peer(&node_id);
            }
        }
        
        Ok(())
    }
    
    /// Reconnect to a specific peer
    async fn reconnect_to_peer(&self, node_id: &str) -> Result<()> {
        let peer_info = {
            let peers = self.peers.lock().unwrap();
            peers.get(node_id).cloned()
        };
        
        if let Some(peer) = peer_info {
            // Try to establish new connection
            let stream = TcpStream::connect(format!("{}:{}", peer.address, peer.port)).await
                .context("Failed to reconnect to peer")?;
            
            // Update connection health
            {
                let mut peers = self.peers.lock().unwrap();
                if let Some(peer) = peers.get_mut(node_id) {
                    peer.connection_health = 1.0;
                    peer.last_seen = chrono::Utc::now().timestamp() as u64;
                }
            }
            
            // Start new connection handler
            let network_manager = Arc::new(Mutex::new(self.clone()));
            tokio::spawn(async move {
                if let Err(e) = Self::handle_connection(stream, network_manager).await {
                    eprintln!("Reconnection handler error: {}", e);
                }
            });
            
            println!("🔗 Wiederherstellung zu Peer {} erfolgreich", node_id);
        }
        
        Ok(())
    }
    
    /// Analyze network topology
    async fn analyze_topology(&self) -> Result<()> {
        let peers = {
            let peers = self.peers.lock().unwrap();
            peers.values().cloned().collect::<Vec<_>>()
        };
        
        let mut topology = self.topology.lock().unwrap();
        
        // Update connections
        topology.connections.clear();
        for peer in &peers {
            topology.connections.insert(peer.node_id.clone());
        }
        
        // Analyze network segments
        let mut segments = Vec::new();
        
        // Core segment: highly connected nodes
        let core_nodes: Vec<_> = peers.iter()
            .filter(|p| p.connection_quality == ConnectionQuality::Excellent)
            .map(|p| p.node_id.clone())
            .collect();
        
        if !core_nodes.is_empty() {
            segments.push(NetworkSegment {
                segment_id: "core".to_string(),
                nodes: core_nodes.into_iter().collect(),
                segment_type: SegmentType::Core,
                connectivity_score: 1.0,
            });
        }
        
        // Edge segment: leaf nodes
        let edge_nodes: Vec<_> = peers.iter()
            .filter(|p| p.connection_quality == ConnectionQuality::Poor)
            .map(|p| p.node_id.clone())
            .collect();
        
        if !edge_nodes.is_empty() {
            segments.push(NetworkSegment {
                segment_id: "edge".to_string(),
                nodes: edge_nodes.into_iter().collect(),
                segment_type: SegmentType::Edge,
                connectivity_score: 0.3,
            });
        }
        
        topology.network_segments = segments;
        topology.topology_version += 1;
        
        println!("🔍 Topologie-Analyse abgeschlossen. Version: {}", topology.topology_version);
        Ok(())
    }
    
    /// Get network statistics
    pub fn get_network_stats(&self) -> NetworkStats {
        let peers = self.peers.lock().unwrap();
        let total_peers = peers.len();
        
        let mut excellent_connections = 0;
        let mut good_connections = 0;
        let mut poor_connections = 0;
        let mut total_latency = 0u64;
        let mut latency_count = 0;
        
        for peer in peers.values() {
            match peer.connection_quality {
                ConnectionQuality::Excellent => excellent_connections += 1,
                ConnectionQuality::Good => good_connections += 1,
                ConnectionQuality::Poor => poor_connections += 1,
                _ => {}
            }
            
            if let Some(latency) = peer.latency_ms {
                total_latency += latency;
                latency_count += 1;
            }
        }
        
        let avg_latency = if latency_count > 0 {
            total_latency / latency_count
        } else {
            0
        };
        
        let topology = self.topology.lock().unwrap();
        
        NetworkStats {
            total_peers,
            active_peers: total_peers,
            excellent_connections,
            good_connections,
            poor_connections,
            avg_latency_ms: avg_latency,
            segments_count: topology.network_segments.len(),
            topology_version: topology.topology_version,
        }
    }
    
    /// Get current topology
    pub fn get_topology(&self) -> NetworkTopology {
        self.topology.lock().unwrap().clone()
    }
    
    /// Get all peers
    pub fn get_peers(&self) -> Vec<PeerInfo> {
        let peers = self.peers.lock().unwrap();
        peers.values().cloned().collect()
    }
    
    /// Get peers by connection quality
    pub fn get_peers_by_quality(&self, quality: ConnectionQuality) -> Vec<PeerInfo> {
        let peers = self.peers.lock().unwrap();
        peers.values()
            .filter(|p| p.connection_quality == quality)
            .cloned()
            .collect()
    }
    
    /// Remove a peer
    pub fn remove_peer(&self, node_id: &str) {
        let mut peers = self.peers.lock().unwrap();
        peers.remove(node_id);
        println!("🗑️  Peer entfernt: {}", node_id);
    }
    
    /// Get node ID
    pub async fn get_node_id(&self) -> Result<String> {
        Ok(self.local_node_id.clone())
    }
    
    /// Send message to a specific peer
    async fn send_message_to_peer(&self, message: &NetworkMessage, peer: &PeerInfo) -> Result<()> {
        // This would typically involve maintaining persistent connections
        // For now, we'll create a new connection for each message
        let stream = TcpStream::connect(format!("{}:{}", peer.address, peer.port)).await
            .context("Failed to connect to peer")?;
        
        let message_data = serde_json::to_vec(message)?;
        let length = message_data.len() as u32;
        let length_bytes = length.to_be_bytes();
        
        // Send length + message
        stream.write_all(&length_bytes).await?;
        stream.write_all(&message_data).await?;
        
        Ok(())
    }
    
    /// Measure latency to a specific peer
    pub async fn measure_peer_latency(&self, node_id: &str) -> Result<u64> {
        let peer_info = {
            let peers = self.peers.lock().unwrap();
            peers.get(node_id).cloned()
        };
        
        if let Some(peer) = peer_info {
            let start = std::time::Instant::now();
            
            // Send ping
            let ping = NetworkMessage {
                message_type: "ping".to_string(),
                payload: serde_json::json!({}),
                timestamp: chrono::Utc::now().timestamp() as u64,
                node_id: self.local_node_id.clone(),
            };
            
            if let Err(e) = self.send_message_to_peer(&ping, &peer).await {
                return Err(anyhow::anyhow!("Failed to send ping: {}", e));
            }
            
            // Wait for pong (simplified - in real implementation you'd wait for response)
            sleep(Duration::from_millis(100)).await;
            
            let latency = start.elapsed().as_millis() as u64;
            
            // Update peer latency
            {
                let mut peers = self.peers.lock().unwrap();
                if let Some(peer) = peers.get_mut(node_id) {
                    peer.latency_ms = Some(latency);
                    peer.connection_quality = ConnectionQuality::from_latency(latency);
                }
            }
            
            Ok(latency)
        } else {
            Err(anyhow::anyhow!("Peer not found: {}", node_id))
        }
    }
    
    /// Handle legacy message types
    async fn handle_legacy_message(&self, message: &NetworkMessage) -> Result<()> {
        match message.message_type.as_str() {
            "post" => {
                if let Ok(post) = serde_json::from_value::<Post>(message.payload.clone()) {
                    // Notify all message handlers
                    let handlers = self.message_handlers.lock().unwrap();
                    for handler in handlers.iter() {
                        if let Err(e) = handler.handle_post(&post) {
                            eprintln!("Handler error: {}", e);
                        }
                    }
                }
            }
            "config" => {
                if let Ok(config) = serde_json::from_value::<Config>(message.payload.clone()) {
                    // Notify all message handlers
                    let handlers = self.message_handlers.lock().unwrap();
                    for handler in handlers.iter() {
                        if let Err(e) = handler.handle_config(&config) {
                            eprintln!("Handler error: {}", e);
                        }
                    }
                }
            }
            "ping" => {
                // Respond with pong
                let handlers = self.message_handlers.lock().unwrap();
                for handler in handlers.iter() {
                    if let Err(e) = handler.handle_ping(&message.node_id) {
                        eprintln!("Handler error: {}", e);
                        break;
                    }
                }
            }
            "pong" => {
                // Handle pong response
                let handlers = self.message_handlers.lock().unwrap();
                for handler in handlers.iter() {
                    if let Err(e) = handler.handle_pong(&message.node_id) {
                        eprintln!("Handler error: {}", e);
                        break;
                    }
                }
            }
            "heartbeat" => {
                // Update peer last seen timestamp
                if let Ok(payload) = message.payload.as_object() {
                    if let Some(node_id) = payload.get("node_id").and_then(|v| v.as_str()) {
                        let mut peers = self.peers.lock().unwrap();
                        if let Some(peer) = peers.get_mut(node_id) {
                            peer.last_seen = chrono::Utc::now().timestamp() as u64;
                        }
                    }
                }
            }
            _ => {
                println!("⚠️  Unbekannter Nachrichtentyp: {}", message.message_type);
            }
        }
        
        Ok(())
    }
    
    /// Handle post broadcast
    async fn handle_post_broadcast(&self, broadcast: &PostBroadcast) -> Result<()> {
        // Check TTL
        if broadcast.ttl == 0 {
            return Ok(());
        }
        
        // Process the post
        let post = &broadcast.post;
        
        // Notify all message handlers
        let handlers = self.message_handlers.lock().unwrap();
        for handler in handlers.iter() {
            if let Err(e) = handler.handle_post(post) {
                eprintln!("Handler error: {}", e);
            }
        }
        
        // Re-broadcast with decremented TTL if TTL > 1
        if broadcast.ttl > 1 {
            let mut new_broadcast = broadcast.clone();
            new_broadcast.ttl -= 1;
            
            let message = NetworkMessage {
                message_type: "post_broadcast".to_string(),
                payload: serde_json::to_value(&new_broadcast)?,
                timestamp: chrono::Utc::now().timestamp() as u64,
                node_id: self.local_node_id.clone(),
            };
            
            self.broadcast_message(&message).await?;
        }
        
        Ok(())
    }
    
    /// Handle sync request
    async fn handle_sync_request(&self, sync_request: &SyncRequest, requesting_node: &str) -> Result<()> {
        // Get recent posts from handlers
        let mut all_posts = Vec::new();
        let handlers = self.message_handlers.lock().unwrap();
        
        for handler in handlers.iter() {
            if let Ok(posts) = handler.get_recent_posts(sync_request.requested_post_count) {
                all_posts.extend(posts);
            }
        }
        
        // Create sync response
        let response = SyncResponse {
            responding_node: self.local_node_id.clone(),
            posts: all_posts,
            conflicts: Vec::new(), // Will be populated by conflict detection
            feed_state: self.get_feed_state().await?,
            sync_timestamp: chrono::Utc::now().timestamp() as u64,
        };
        
        // Send response back to requesting node
        let message = NetworkMessage {
            message_type: "sync_response".to_string(),
            payload: serde_json::to_value(&response)?,
            timestamp: chrono::Utc::now().timestamp() as u64,
            node_id: self.local_node_id.clone(),
        };
        
        // Find the requesting peer and send response
        let peers = self.peers.lock().unwrap();
        if let Some(peer) = peers.get(requesting_node) {
            drop(peers); // Release lock before async call
            self.send_message_to_peer(&message, peer).await?;
        }
        
        Ok(())
    }
    
    /// Handle sync response
    async fn handle_sync_response(&self, sync_response: &SyncResponse) -> Result<()> {
        // Process received posts
        for post in &sync_response.posts {
            let handlers = self.message_handlers.lock().unwrap();
            for handler in handlers.iter() {
                if let Err(e) = handler.handle_post(post) {
                    eprintln!("Handler error: {}", e);
                }
            }
        }
        
        // Process conflicts
        for conflict in &sync_response.conflicts {
            let mut conflicts = self.post_conflicts.lock().unwrap();
            conflicts.insert(conflict.post_id.hash.clone(), conflict.clone());
        }
        
        // Update feed state
        let mut feed_state = self.feed_state.lock().unwrap();
        feed_state.last_sync_timestamp = sync_response.sync_timestamp;
        
        Ok(())
    }
    
    /// Get current feed state
    async fn get_feed_state(&self) -> Result<FeedState> {
        let feed_state = self.feed_state.lock().unwrap();
        Ok(feed_state.clone())
    }
    
    /// Get unresolved conflicts
    pub async fn get_unresolved_conflicts(&self) -> Result<Vec<PostConflict>> {
        let conflicts = self.post_conflicts.lock().unwrap();
        Ok(conflicts.values().cloned().collect())
    }
    
    /// Manually resolve a conflict
    pub async fn manually_resolve_conflict(&self, post_id: &str, strategy: ConflictResolutionStrategy) -> Result<()> {
        let mut conflicts = self.post_conflicts.lock().unwrap();
        
        if let Some(conflict) = conflicts.get_mut(post_id) {
            conflict.resolution_strategy = strategy;
            conflict.resolved_at = Some(chrono::Utc::now().timestamp() as u64);
            
            // Apply resolution strategy
            match strategy {
                ConflictResolutionStrategy::LatestWins => {
                    // Keep the most recent post
                    if let Some(latest_post) = conflict.conflicting_posts.iter().max_by_key(|p| p.timestamp) {
                        let handlers = self.message_handlers.lock().unwrap();
                        for handler in handlers.iter() {
                            if let Err(e) = handler.handle_post(latest_post) {
                                eprintln!("Handler error: {}", e);
                            }
                        }
                    }
                }
                ConflictResolutionStrategy::FirstWins => {
                    // Keep the first post
                    if let Some(first_post) = conflict.conflicting_posts.iter().min_by_key(|p| p.timestamp) {
                        let handlers = self.message_handlers.lock().unwrap();
                        for handler in handlers.iter() {
                            if let Err(e) = handler.handle_post(first_post) {
                                eprintln!("Handler error: {}", e);
                            }
                        }
                    }
                }
                _ => {
                    // Other strategies would be implemented here
                }
            }
            
            // Remove resolved conflict
            conflicts.remove(post_id);
        }
        
        Ok(())
    }
    
    /// Sync with all peers
    pub async fn sync_all_peers(&self) -> Result<()> {
        let peers = {
            let peers = self.peers.lock().unwrap();
            peers.values().cloned().collect::<Vec<_>>()
        };
        
        for peer in peers {
            let sync_request = SyncRequest {
                requesting_node: self.local_node_id.clone(),
                last_known_timestamp: 0, // Will be updated with actual last timestamp
                requested_post_count: 100,
                sync_mode: SyncMode::Incremental,
            };
            
            let message = NetworkMessage {
                message_type: "sync_request".to_string(),
                payload: serde_json::to_value(&sync_request)?,
                timestamp: chrono::Utc::now().timestamp() as u64,
                node_id: self.local_node_id.clone(),
            };
            
            if let Err(e) = self.send_message_to_peer(&message, &peer).await {
                eprintln!("Failed to sync with peer {}: {}", peer.node_id, e);
            }
        }
        
        println!("🔄 Synchronisation mit {} Peers abgeschlossen", peers.len());
        Ok(())
    }
    
    /// Clone implementation for NetworkManager
    pub fn clone(&self) -> Self {
        Self {
            port: self.port,
            tor_enabled: self.tor_enabled,
            tor_socks_port: self.tor_socks_port,
            _crypto: self._crypto.clone(),
            peers: Arc::clone(&self.peers),
            message_handlers: Arc::clone(&self.message_handlers),
            tor_manager: self.tor_manager.clone(),
            request_cooldowns: Arc::clone(&self.request_cooldowns),
            topology: Arc::clone(&self.topology),
            discovery_manager: self.discovery_manager.clone(),
            discovery_socket: None, // Cannot clone UdpSocket
            discovery_port: self.discovery_port,
            heartbeat_interval: self.heartbeat_interval,
            peer_timeout: self.peer_timeout,
            max_peers: self.max_peers,
            local_node_id: self.local_node_id.clone(),
            local_public_key: self.local_public_key.clone(),
            feed_state: Arc::clone(&self.feed_state),
            post_conflicts: Arc::clone(&self.post_conflicts),
            post_order: Arc::clone(&self.post_conflicts),
            broadcast_cache: Arc::clone(&self.broadcast_cache),
            tor_health_monitor: Arc::clone(&self.tor_health_monitor),
            circuit_rotation_task: None, // Cannot clone JoinHandle
        }
    }
}

/// Default message handler implementation
pub struct DefaultMessageHandler {
    node_id: String,
    database_manager: Arc<Mutex<Database>>,
}

impl DefaultMessageHandler {
    pub fn new(node_id: String, database: Arc<Mutex<Database>>) -> Self {
        Self { node_id, database_manager: database }
    }
}

impl MessageHandler for DefaultMessageHandler {
    fn handle_post(&self, post: &Post) -> Result<()> {
        // Store post in database
        if let Ok(mut db) = self.database_manager.lock() {
            if let Err(e) = db.insert_post(post) {
                eprintln!("Failed to store post: {}", e);
            }
        }
        
        println!("📝 Post von {} verarbeitet: {}", post.pseudonym, post.content);
        Ok(())
    }
    
    fn handle_config(&self, _config: &Config) -> Result<()> {
        // Handle configuration updates
        println!("⚙️  Konfiguration aktualisiert");
        Ok(())
    }
    
    fn handle_ping(&self, node_id: &str) -> Result<()> {
        println!("🏓 Ping von {} erhalten", node_id);
        Ok(())
    }
    
    fn handle_pong(&self, node_id: &str) -> Result<()> {
        println!("🏓 Pong von {} erhalten", node_id);
        Ok(())
    }
    
    fn get_recent_posts(&self, limit: usize) -> Result<Vec<Post>> {
        if let Ok(db) = self.database_manager.lock() {
            db.get_recent_posts(limit)
        } else {
            Ok(Vec::new())
        }
    }
}

/// Example implementation showing how to use the P2P network
pub struct P2PNetworkExample {
    network_manager: NetworkManager,
}

impl P2PNetworkExample {
    pub fn new(network_port: u16, discovery_port: u16) -> Self {
        let network_manager = NetworkManager::new(network_port, 9050);
        
        Self { network_manager }
    }
    
    /// Start the complete P2P network
    pub async fn start(&mut self, public_key: String) -> Result<()> {
        println!("🚀 Starte Brezn P2P-Netzwerk...");
        
        // Start the complete P2P network
        self.network_manager.start_p2p_network(8888, public_key).await?;
        
        // Add a default message handler
        let database = Database::new("brezn.db")?;
        let handler = DefaultMessageHandler::new(
            self.network_manager.local_node_id.clone(),
            Arc::new(Mutex::new(database))
        );
        self.network_manager.add_message_handler(Box::new(handler));
        
        println!("✅ Brezn P2P-Netzwerk erfolgreich gestartet!");
        Ok(())
    }
    
    /// Broadcast a post to all peers
    pub async fn broadcast_post(&self, content: String, pseudonym: String) -> Result<()> {
        let post = Post::new(content, pseudonym, Some(self.network_manager.local_node_id.clone()));
        
        println!("📤 Sende Post: {}", post.content);
        self.network_manager.broadcast_post(&post).await?;
        
        Ok(())
    }
    
    /// Get network status
    pub fn get_status(&self) -> NetworkStatus {
        self.network_manager.get_network_status()
    }
    
    /// Sync with all peers
    pub async fn sync_all_peers(&self) -> Result<()> {
        println!("🔄 Starte Synchronisation mit allen Peers...");
        self.network_manager.sync_all_peers().await?;
        Ok(())
    }
    
    /// Get unresolved conflicts
    pub async fn get_conflicts(&self) -> Result<Vec<PostConflict>> {
        self.network_manager.get_unresolved_conflicts().await
    }
    
    /// Resolve a conflict manually
    pub async fn resolve_conflict(&self, post_id: &str, strategy: ConflictResolutionStrategy) -> Result<()> {
        self.network_manager.manually_resolve_conflict(post_id, strategy).await?;
        Ok(())
    }
    
    /// Enable Tor support
    pub async fn enable_tor(&mut self) -> Result<()> {
        self.network_manager.enable_tor().await?;
        Ok(())
    }
    
    /// Get peer information
    pub fn get_peers(&self) -> Vec<PeerInfo> {
        self.network_manager.get_peers()
    }
    
    /// Measure latency to a peer
    pub async fn measure_latency(&self, node_id: &str) -> Result<u64> {
        self.network_manager.measure_peer_latency(node_id).await
    }
}