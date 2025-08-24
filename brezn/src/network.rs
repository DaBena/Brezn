use tokio::net::{TcpListener, TcpStream};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
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
    pub poor_connections: usize,
    pub avg_latency_ms: u64,
    pub segments_count: usize,
    pub topology_version: u64,
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
    tor_health_monitor: Arc<Mutex<TorHealthMonitor>>,
    circuit_rotation_task: Option<tokio::task::JoinHandle<()>>,
    broadcast_cache: Arc<Mutex<HashMap<String, u64>>>,
    post_conflicts: Arc<Mutex<HashMap<String, PostConflict>>>,
    feed_state: Arc<Mutex<HashMap<String, FeedState>>>,
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
            tor_health_monitor: Arc::new(Mutex::new(TorHealthMonitor::default())),
            circuit_rotation_task: None,
            broadcast_cache: Arc::new(Mutex::new(HashMap::new())),
            post_conflicts: Arc::new(Mutex::new(HashMap::new())),
            feed_state: Arc::new(Mutex::new(HashMap::new())),
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
            topology: Arc::clone(&self.topology),
            discovery_manager: self.discovery_manager.clone(),
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
}