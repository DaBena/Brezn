use tokio::net::{TcpListener, TcpStream};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use serde::{Serialize, Deserialize};
use serde_json;
use anyhow::{Result, Context};
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::time::{interval, sleep, timeout};
use uuid::Uuid;
use std::net::SocketAddr;
use tokio::sync::mpsc;
use std::collections::VecDeque;

use crate::types::{
    NetworkMessage, Post, Config, PostId, PostConflict, ConflictResolutionStrategy,
    FeedState, PeerFeedState, SyncStatus, SyncRequest, SyncResponse, SyncMode,
    PostBroadcast, PostOrder, DataIntegrityCheck, VerificationStatus
};

use crate::crypto::CryptoManager;
use crate::database::Database;

// ============================================================================
// P2P Network Message Types
// ============================================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum P2PMessage {
    // Connection management
    Connect {
        node_id: String,
        public_key: String,
        capabilities: Vec<String>,
    },
    ConnectAck {
        node_id: String,
        accepted: bool,
        reason: Option<String>,
    },
    Disconnect {
        node_id: String,
        reason: String,
    },
    
    // Heartbeat system
    Ping {
        node_id: String,
        timestamp: u64,
    },
    Pong {
        node_id: String,
        timestamp: u64,
        latency_ms: u64,
    },
    
    // Post synchronization
    PostSync {
        posts: Vec<Post>,
        last_sync_timestamp: u64,
        requesting_node: String,
    },
    PostSyncRequest {
        last_known_timestamp: u64,
        requesting_node: String,
        sync_mode: SyncMode,
    },
    PostSyncResponse {
        posts: Vec<Post>,
        conflicts: Vec<PostConflict>,
        last_sync_timestamp: u64,
        responding_node: String,
    },
    
    // Post broadcasting
    PostBroadcast {
        post: Post,
        broadcast_id: String,
        ttl: u32,
        origin_node: String,
    },
    
    // Network status
    NetworkStatus {
        node_id: String,
        peer_count: usize,
        uptime_seconds: u64,
        last_post_timestamp: u64,
    },
}

// ============================================================================
// Peer Management
// ============================================================================

#[derive(Debug, Clone)]
pub struct Peer {
    pub node_id: String,
    pub address: SocketAddr,
    pub public_key: String,
    pub capabilities: Vec<String>,
    pub connection_quality: ConnectionQuality,
    pub last_seen: Instant,
    pub last_ping: Option<Instant>,
    pub latency_ms: Option<u64>,
    pub is_connected: bool,
    pub connection_established: Instant,
    pub post_count: usize,
    pub last_post_timestamp: u64,
}

#[derive(Debug, Clone, PartialEq)]
pub enum ConnectionQuality {
    Excellent, // < 50ms latency
    Good,      // 50-100ms latency
    Fair,      // 100-200ms latency
    Poor,      // > 200ms latency
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

impl Peer {
    pub fn new(node_id: String, address: SocketAddr, public_key: String) -> Self {
        Self {
            node_id,
            address,
            public_key,
            capabilities: Vec::new(),
            connection_quality: ConnectionQuality::Unknown,
            last_seen: Instant::now(),
            last_ping: None,
            latency_ms: None,
            is_connected: true,
            connection_established: Instant::now(),
            post_count: 0,
            last_post_timestamp: 0,
        }
    }
    
    pub fn update_latency(&mut self, latency_ms: u64) {
        self.latency_ms = Some(latency_ms);
        self.connection_quality = ConnectionQuality::from_latency(latency_ms);
        self.last_seen = Instant::now();
    }
    
    pub fn mark_seen(&mut self) {
        self.last_seen = Instant::now();
    }
    
    pub fn is_active(&self, timeout_duration: Duration) -> bool {
        self.last_seen.elapsed() < timeout_duration
    }
}

// ============================================================================
// P2P Network Manager
// ============================================================================

pub struct P2PNetworkManager {
    // Configuration
    port: u16,
    max_peers: usize,
    heartbeat_interval: Duration,
    peer_timeout: Duration,
    sync_interval: Duration,
    
    // Network state
    node_id: String,
    public_key: String,
    capabilities: Vec<String>,
    
    // Peer management
    peers: Arc<Mutex<HashMap<String, Peer>>>,
    peer_connections: Arc<Mutex<HashMap<String, TcpStream>>>,
    
    // Network services
    listener: Option<TcpListener>,
    crypto_manager: CryptoManager,
    database: Option<Arc<Database>>,
    
    // Background tasks
    heartbeat_task: Option<tokio::task::JoinHandle<()>>,
    sync_task: Option<tokio::task::JoinHandle<()>>,
    cleanup_task: Option<tokio::task::JoinHandle<()>>,
    
    // Message channels
    message_tx: mpsc::UnboundedSender<P2PMessage>,
    message_rx: Option<mpsc::UnboundedReceiver<P2PMessage>>,
    
    // Statistics
    stats: Arc<Mutex<NetworkStats>>,
}

#[derive(Debug, Clone)]
pub struct NetworkStats {
    pub total_peers_connected: usize,
    pub active_peers: usize,
    pub total_posts_synced: usize,
    pub total_conflicts_resolved: usize,
    pub network_uptime_seconds: u64,
    pub last_sync_timestamp: u64,
    pub average_latency_ms: u64,
    pub connection_quality_distribution: HashMap<ConnectionQuality, usize>,
}

impl Default for NetworkStats {
    fn default() -> Self {
        Self {
            total_peers_connected: 0,
            active_peers: 0,
            total_posts_synced: 0,
            total_conflicts_resolved: 0,
            network_uptime_seconds: 0,
            last_sync_timestamp: 0,
            average_latency_ms: 0,
            connection_quality_distribution: HashMap::new(),
        }
    }
}

impl P2PNetworkManager {
    pub fn new(port: u16, database: Option<Arc<Database>>) -> Self {
        let node_id = Uuid::new_v4().to_string();
        let (message_tx, message_rx) = mpsc::unbounded_channel();
        
        Self {
            port,
            max_peers: 50,
            heartbeat_interval: Duration::from_secs(60),
            peer_timeout: Duration::from_secs(300), // 5 minutes
            sync_interval: Duration::from_secs(30),
            
            node_id,
            public_key: "".to_string(), // Will be set by crypto manager
            capabilities: vec!["post_sync".to_string(), "post_broadcast".to_string()],
            
            peers: Arc::new(Mutex::new(HashMap::new())),
            peer_connections: Arc::new(Mutex::new(HashMap::new())),
            
            listener: None,
            crypto_manager: CryptoManager::new(),
            database,
            
            heartbeat_task: None,
            sync_task: None,
            cleanup_task: None,
            
            message_tx,
            message_rx: Some(message_rx),
            
            stats: Arc::new(Mutex::new(NetworkStats::default())),
        }
    }
    
    // ========================================================================
    // Network Lifecycle Management
    // ========================================================================
    
    pub async fn start(&mut self) -> Result<()> {
        // Initialize crypto and generate keys
        self.initialize_crypto().await?;
        
        // Start TCP listener
        self.start_listener().await?;
        
        // Start background tasks
        self.start_background_tasks().await?;
        
        println!("🚀 P2P Network gestartet auf Port {}", self.port);
        Ok(())
    }
    
    pub async fn stop(&mut self) -> Result<()> {
        // Stop background tasks
        if let Some(task) = self.heartbeat_task.take() {
            task.abort();
        }
        if let Some(task) = self.sync_task.take() {
            task.abort();
        }
        if let Some(task) = self.cleanup_task.take() {
            task.abort();
        }
        
        // Close all peer connections
        self.disconnect_all_peers().await?;
        
        println!("🛑 P2P Network gestoppt");
        Ok(())
    }
    
    async fn initialize_crypto(&mut self) -> Result<()> {
        // Generate or load existing keys
        let keypair = self.crypto_manager.generate_keypair().await?;
        self.public_key = base64::encode(keypair.public_key);
        Ok(())
    }
    
    async fn start_listener(&mut self) -> Result<()> {
        let listener = TcpListener::bind(format!("0.0.0.0:{}", self.port)).await
            .context("Failed to bind TCP listener")?;
        
        self.listener = Some(listener);
        
        // Start accepting connections
        let peers = Arc::clone(&self.peers);
        let peer_connections = Arc::clone(&self.peer_connections);
        let message_tx = self.message_tx.clone();
        let node_id = self.node_id.clone();
        let public_key = self.public_key.clone();
        let capabilities = self.capabilities.clone();
        
        tokio::spawn(async move {
            loop {
                match listener.accept().await {
                    Ok((stream, addr)) => {
                        let peer_id = Uuid::new_v4().to_string();
                        
                        // Handle new connection
                        if let Err(e) = Self::handle_new_connection(
                            stream, addr, peer_id, peers.clone(), 
                            peer_connections.clone(), message_tx.clone(),
                            node_id.clone(), public_key.clone(), capabilities.clone()
                        ).await {
                            eprintln!("Failed to handle new connection: {}", e);
                        }
                    }
                    Err(e) => {
                        eprintln!("Failed to accept connection: {}", e);
                        break;
                    }
                }
            }
        });
        
        Ok(())
    }
    
    async fn handle_new_connection(
        mut stream: TcpStream,
        addr: SocketAddr,
        peer_id: String,
        peers: Arc<Mutex<HashMap<String, Peer>>>,
        peer_connections: Arc<Mutex<HashMap<String, TcpStream>>>,
        message_tx: mpsc::UnboundedSender<P2PMessage>,
        node_id: String,
        public_key: String,
        capabilities: Vec<String>,
    ) -> Result<()> {
        // Send connect message
        let connect_msg = P2PMessage::Connect {
            node_id,
            public_key,
            capabilities,
        };
        
        let msg_bytes = serde_json::to_vec(&connect_msg)?;
        stream.write_all(&msg_bytes).await?;
        
        // Store connection
        peer_connections.lock().unwrap().insert(peer_id.clone(), stream);
        
        // Create peer info
        let peer = Peer::new(
            peer_id.clone(),
            addr,
            "".to_string(), // Will be updated when we receive connect message
        );
        
        peers.lock().unwrap().insert(peer_id, peer);
        
        Ok(())
    }
    
    // ========================================================================
    // Background Tasks
    // ========================================================================
    
    async fn start_background_tasks(&mut self) -> Result<()> {
        // Start heartbeat task
        let peers = Arc::clone(&self.peers);
        let peer_connections = Arc::clone(&self.peer_connections);
        let message_tx = self.message_tx.clone();
        let node_id = self.node_id.clone();
        let heartbeat_interval = self.heartbeat_interval;
        
        self.heartbeat_task = Some(tokio::spawn(async move {
            let mut interval = tokio::time::interval(heartbeat_interval);
            
            loop {
                interval.tick().await;
                
                // Send ping to all connected peers
                let peer_ids: Vec<String> = {
                    let peers = peers.lock().unwrap();
                    peers.keys().cloned().collect()
                };
                
                for peer_id in peer_ids {
                    let ping_msg = P2PMessage::Ping {
                        node_id: node_id.clone(),
                        timestamp: chrono::Utc::now().timestamp() as u64,
                    };
                    
                    if let Err(e) = message_tx.send(ping_msg) {
                        eprintln!("Failed to send ping: {}", e);
                    }
                }
            }
        }));
        
        // Start sync task
        let peers = Arc::clone(&self.peers);
        let database = self.database.clone();
        let message_tx = self.message_tx.clone();
        let node_id = self.node_id.clone();
        let sync_interval = self.sync_interval;
        
        self.sync_task = Some(tokio::spawn(async move {
            let mut interval = tokio::time::interval(sync_interval);
            
            loop {
                interval.tick().await;
                
                // Sync posts with all peers
                let peer_ids: Vec<String> = {
                    let peers = peers.lock().unwrap();
                    peers.keys().cloned().collect()
                };
                
                for peer_id in peer_ids {
                    let sync_request = P2PMessage::PostSyncRequest {
                        last_known_timestamp: 0, // TODO: Get from database
                        requesting_node: node_id.clone(),
                        sync_mode: SyncMode::Incremental,
                    };
                    
                    if let Err(e) = message_tx.send(sync_request) {
                        eprintln!("Failed to send sync request: {}", e);
                    }
                }
            }
        }));
        
        // Start cleanup task
        let peers = Arc::clone(&self.peers);
        let peer_connections = Arc::clone(&self.peer_connections);
        let peer_timeout = self.peer_timeout;
        
        self.cleanup_task = Some(tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(60));
            
            loop {
                interval.tick().await;
                
                // Remove inactive peers
                let inactive_peers: Vec<String> = {
                    let peers = peers.lock().unwrap();
                    peers.iter()
                        .filter(|(_, peer)| !peer.is_active(peer_timeout))
                        .map(|(id, _)| id.clone())
                        .collect()
                };
                
                for peer_id in inactive_peers {
                    peers.lock().unwrap().remove(&peer_id);
                    peer_connections.lock().unwrap().remove(&peer_id);
                }
            }
        }));
        
        Ok(())
    }
    
    // ========================================================================
    // Peer Management
    // ========================================================================
    
    pub async fn connect_to_peer(&mut self, address: &str, port: u16) -> Result<()> {
        let addr = format!("{}:{}", address, port);
        let socket_addr = addr.parse::<SocketAddr>()
            .context("Invalid address format")?;
        
        let stream = TcpStream::connect(socket_addr).await
            .context("Failed to connect to peer")?;
        
        let peer_id = Uuid::new_v4().to_string();
        let peer = Peer::new(
            peer_id.clone(),
            socket_addr,
            "".to_string(), // Will be updated
        );
        
        // Store peer and connection
        self.peers.lock().unwrap().insert(peer_id.clone(), peer);
        self.peer_connections.lock().unwrap().insert(peer_id, stream);
        
        println!("🔗 Verbindung zu Peer {}:{} hergestellt", address, port);
        Ok(())
    }
    
    pub async fn disconnect_peer(&mut self, peer_id: &str) -> Result<()> {
        // Remove from connections
        if let Some(mut stream) = self.peer_connections.lock().unwrap().remove(peer_id) {
            // Send disconnect message
            let disconnect_msg = P2PMessage::Disconnect {
                node_id: self.node_id.clone(),
                reason: "Manual disconnect".to_string(),
            };
            
            if let Ok(msg_bytes) = serde_json::to_vec(&disconnect_msg) {
                let _ = stream.write_all(&msg_bytes).await;
            }
            
            stream.shutdown().await?;
        }
        
        // Remove from peers
        self.peers.lock().unwrap().remove(peer_id);
        
        println!("🔌 Peer {} getrennt", peer_id);
        Ok(())
    }
    
    async fn disconnect_all_peers(&mut self) -> Result<()> {
        let peer_ids: Vec<String> = {
            let peers = self.peers.lock().unwrap();
            peers.keys().cloned().collect()
        };
        
        for peer_id in peer_ids {
            self.disconnect_peer(&peer_id).await?;
        }
        
        Ok(())
    }
    
    // ========================================================================
    // Message Handling
    // ========================================================================
    
    pub async fn handle_message(&mut self, message: P2PMessage) -> Result<()> {
        match message {
            P2PMessage::Connect { node_id, public_key, capabilities } => {
                self.handle_connect(node_id, public_key, capabilities).await?;
            }
            P2PMessage::ConnectAck { node_id, accepted, reason } => {
                self.handle_connect_ack(node_id, accepted, reason).await?;
            }
            P2PMessage::Disconnect { node_id, reason } => {
                self.handle_disconnect(node_id, reason).await?;
            }
            P2PMessage::Ping { node_id, timestamp } => {
                self.handle_ping(node_id, timestamp).await?;
            }
            P2PMessage::Pong { node_id, timestamp, latency_ms } => {
                self.handle_pong(node_id, timestamp, latency_ms).await?;
            }
            P2PMessage::PostSync { posts, last_sync_timestamp, requesting_node } => {
                self.handle_post_sync(posts, last_sync_timestamp, requesting_node).await?;
            }
            P2PMessage::PostSyncRequest { last_known_timestamp, requesting_node, sync_mode } => {
                self.handle_post_sync_request(last_known_timestamp, requesting_node, sync_mode).await?;
            }
            P2PMessage::PostSyncResponse { posts, conflicts, last_sync_timestamp, responding_node } => {
                self.handle_post_sync_response(posts, conflicts, last_sync_timestamp, responding_node).await?;
            }
            P2PMessage::PostBroadcast { post, broadcast_id, ttl, origin_node } => {
                self.handle_post_broadcast(post, broadcast_id, ttl, origin_node).await?;
            }
            P2PMessage::NetworkStatus { node_id, peer_count, uptime_seconds, last_post_timestamp } => {
                self.handle_network_status(node_id, peer_count, uptime_seconds, last_post_timestamp).await?;
            }
        }
        
        Ok(())
    }
    
    async fn handle_connect(&mut self, node_id: String, public_key: String, capabilities: Vec<String>) -> Result<()> {
        // Accept connection and send ack
        let ack_msg = P2PMessage::ConnectAck {
            node_id: self.node_id.clone(),
            accepted: true,
            reason: None,
        };
        
        // TODO: Send ack message to peer
        
        // Update peer info if we have it
        if let Some(peer) = self.peers.lock().unwrap().get_mut(&node_id) {
            peer.public_key = public_key;
            peer.capabilities = capabilities;
            peer.mark_seen();
        }
        
        println!("✅ Verbindung von Peer {} akzeptiert", node_id);
        Ok(())
    }
    
    async fn handle_connect_ack(&mut self, node_id: String, accepted: bool, reason: Option<String>) -> Result<()> {
        if accepted {
            println!("✅ Verbindung zu Peer {} bestätigt", node_id);
        } else {
            let reason = reason.unwrap_or_else(|| "Unknown reason".to_string());
            println!("❌ Verbindung zu Peer {} abgelehnt: {}", node_id, reason);
            
            // Remove peer if connection was rejected
            self.peers.lock().unwrap().remove(&node_id);
            self.peer_connections.lock().unwrap().remove(&node_id);
        }
        Ok(())
    }
    
    async fn handle_disconnect(&mut self, node_id: String, reason: String) -> Result<()> {
        println!("🔌 Peer {} getrennt: {}", node_id, reason);
        
        // Remove peer
        self.peers.lock().unwrap().remove(&node_id);
        self.peer_connections.lock().unwrap().remove(&node_id);
        
        Ok(())
    }
    
    async fn handle_ping(&mut self, node_id: String, timestamp: u64) -> Result<()> {
        // Send pong response
        let pong_msg = P2PMessage::Pong {
            node_id: self.node_id.clone(),
            timestamp,
            latency_ms: 0, // TODO: Calculate actual latency
        };
        
        // TODO: Send pong message to peer
        
        // Update peer last seen
        if let Some(peer) = self.peers.lock().unwrap().get_mut(&node_id) {
            peer.mark_seen();
            peer.last_ping = Some(Instant::now());
        }
        
        Ok(())
    }
    
    async fn handle_pong(&mut self, node_id: String, timestamp: u64, latency_ms: u64) -> Result<()> {
        // Update peer latency
        if let Some(peer) = self.peers.lock().unwrap().get_mut(&node_id) {
            peer.update_latency(latency_ms);
        }
        
        Ok(())
    }
    
    async fn handle_post_sync(&mut self, posts: Vec<Post>, last_sync_timestamp: u64, requesting_node: String) -> Result<()> {
        // Store received posts
        if let Some(db) = &self.database {
            for post in posts {
                // TODO: Check for conflicts and resolve
                db.insert_post(&post).await?;
            }
        }
        
        // Update stats
        if let Ok(mut stats) = self.stats.lock() {
            stats.total_posts_synced += posts.len();
            stats.last_sync_timestamp = last_sync_timestamp;
        }
        
        println!("📥 {} Posts von Peer {} synchronisiert", posts.len(), requesting_node);
        Ok(())
    }
    
    async fn handle_post_sync_request(&mut self, last_known_timestamp: u64, requesting_node: String, sync_mode: SyncMode) -> Result<()> {
        // Get posts since last known timestamp
        let posts = if let Some(db) = &self.database {
            // TODO: Implement actual database query
            Vec::new()
        } else {
            Vec::new()
        };
        
        // Send sync response
        let sync_response = P2PMessage::PostSyncResponse {
            posts,
            conflicts: Vec::new(), // TODO: Implement conflict detection
            last_sync_timestamp: chrono::Utc::now().timestamp() as u64,
            responding_node: self.node_id.clone(),
        };
        
        // TODO: Send response to requesting peer
        
        println!("📤 Post-Sync-Anfrage von Peer {} bearbeitet", requesting_node);
        Ok(())
    }
    
    async fn handle_post_sync_response(&mut self, posts: Vec<Post>, conflicts: Vec<PostConflict>, last_sync_timestamp: u64, responding_node: String) -> Result<()> {
        // Store received posts
        if let Some(db) = &self.database {
            for post in posts {
                db.insert_post(&post).await?;
            }
        }
        
        // Resolve conflicts
        for conflict in conflicts {
            self.resolve_post_conflict(conflict).await?;
        }
        
        // Update stats
        if let Ok(mut stats) = self.stats.lock() {
            stats.total_posts_synced += posts.len();
            stats.total_conflicts_resolved += conflicts.len();
            stats.last_sync_timestamp = last_sync_timestamp;
        }
        
        println!("📥 Post-Sync-Antwort von Peer {} verarbeitet", responding_node);
        Ok(())
    }
    
    async fn handle_post_broadcast(&mut self, post: Post, broadcast_id: String, ttl: u32, origin_node: String) -> Result<()> {
        // Store the post
        if let Some(db) = &self.database {
            db.insert_post(&post).await?;
        }
        
        // Re-broadcast if TTL > 0
        if ttl > 0 {
            let rebroadcast_msg = P2PMessage::PostBroadcast {
                post,
                broadcast_id,
                ttl: ttl - 1,
                origin_node,
            };
            
            // TODO: Broadcast to other peers
        }
        
        println!("📢 Post-Broadcast von Peer {} empfangen", origin_node);
        Ok(())
    }
    
    async fn handle_network_status(&mut self, node_id: String, peer_count: usize, uptime_seconds: u64, last_post_timestamp: u64) -> Result<()> {
        // Update peer info
        if let Some(peer) = self.peers.lock().unwrap().get_mut(&node_id) {
            peer.post_count = peer_count;
            peer.last_post_timestamp = last_post_timestamp;
            peer.mark_seen();
        }
        
        Ok(())
    }
    
    // ========================================================================
    // Post Conflict Resolution
    // ========================================================================
    
    async fn resolve_post_conflict(&mut self, conflict: PostConflict) -> Result<()> {
        match conflict.resolution_strategy {
            ConflictResolutionStrategy::LatestWins => {
                // Use the most recent post
                if let Some(latest_post) = conflict.conflicting_posts.iter()
                    .max_by_key(|p| p.timestamp) {
                    if let Some(db) = &self.database {
                        db.insert_post(latest_post).await?;
                    }
                }
            }
            ConflictResolutionStrategy::FirstWins => {
                // Use the first post received
                if let Some(first_post) = conflict.conflicting_posts.iter()
                    .min_by_key(|p| p.timestamp) {
                    if let Some(db) = &self.database {
                        db.insert_post(first_post).await?;
                    }
                }
            }
            ConflictResolutionStrategy::ContentHash => {
                // Use the post with the most unique content
                // TODO: Implement content hash comparison
            }
            ConflictResolutionStrategy::Manual => {
                // Store conflict for manual resolution
                // TODO: Implement conflict storage
            }
            ConflictResolutionStrategy::Merged => {
                // Try to merge content
                // TODO: Implement content merging
            }
        }
        
        Ok(())
    }
    
    // ========================================================================
    // Network Status and Statistics
    // ========================================================================
    
    pub fn get_network_status(&self) -> NetworkStatus {
        let peers = self.peers.lock().unwrap();
        let stats = self.stats.lock().unwrap();
        
        NetworkStatus {
            node_id: self.node_id.clone(),
            peer_count: peers.len(),
            active_peers: peers.values().filter(|p| p.is_active(self.peer_timeout)).count(),
            total_posts_synced: stats.total_posts_synced,
            total_conflicts_resolved: stats.total_conflicts_resolved,
            network_uptime_seconds: stats.network_uptime_seconds,
            last_sync_timestamp: stats.last_sync_timestamp,
            average_latency_ms: stats.average_latency_ms,
            connection_quality_distribution: stats.connection_quality_distribution.clone(),
        }
    }
    
    pub fn get_peer_list(&self) -> Vec<Peer> {
        let peers = self.peers.lock().unwrap();
        peers.values().cloned().collect()
    }
    
    pub fn get_peer_count(&self) -> usize {
        self.peers.lock().unwrap().len()
    }
    
    pub fn is_peer_connected(&self, peer_id: &str) -> bool {
        self.peers.lock().unwrap().contains_key(peer_id)
    }
}

// ============================================================================
// Network Status Response
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkStatus {
    pub node_id: String,
    pub peer_count: usize,
    pub active_peers: usize,
    pub total_posts_synced: usize,
    pub total_conflicts_resolved: usize,
    pub network_uptime_seconds: u64,
    pub last_sync_timestamp: u64,
    pub average_latency_ms: u64,
    pub connection_quality_distribution: HashMap<ConnectionQuality, usize>,
}

// ============================================================================
// Message Handler Trait
// ============================================================================

pub trait MessageHandler: Send + Sync {
    fn handle_post(&self, post: &Post) -> Result<()>;
    fn handle_config(&self, config: &Config) -> Result<()>;
    fn handle_ping(&self, node_id: &str) -> Result<()>;
    fn handle_pong(&self, node_id: &str) -> Result<()>;
    fn get_recent_posts(&self, _limit: usize) -> Result<Vec<Post>> { Ok(Vec::new()) }
}

// ============================================================================
// Legacy Compatibility
// ============================================================================

// Keep these for backward compatibility with existing code
pub type NetworkManager = P2PNetworkManager;

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

#[derive(Debug, Clone)]
pub struct NetworkTopology {
    pub node_id: String,
    pub connections: HashSet<String>,
    pub routing_table: HashMap<String, String>,
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
    Core,
    Edge,
    Bridge,
    Isolated,
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
    pub tor_status: Option<crate::tor::TorStatus>,
    pub stats: NetworkStats,
    pub topology: NetworkTopology,
    pub peer_count: usize,
    pub unresolved_conflicts: usize,
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::net::TcpStream;
    use std::net::SocketAddr;
    
    #[tokio::test]
    async fn test_peer_creation() {
        let addr: SocketAddr = "127.0.0.1:8080".parse().unwrap();
        let peer = Peer::new("test-peer".to_string(), addr, "test-key".to_string());
        
        assert_eq!(peer.node_id, "test-peer");
        assert_eq!(peer.address, addr);
        assert_eq!(peer.public_key, "test-key");
        assert!(peer.is_connected);
    }
    
    #[tokio::test]
    async fn test_connection_quality() {
        let quality = ConnectionQuality::from_latency(25);
        assert_eq!(quality, ConnectionQuality::Excellent);
        
        let quality = ConnectionQuality::from_latency(75);
        assert_eq!(quality, ConnectionQuality::Good);
        
        let quality = ConnectionQuality::from_latency(150);
        assert_eq!(quality, ConnectionQuality::Fair);
        
        let quality = ConnectionQuality::from_latency(250);
        assert_eq!(quality, ConnectionQuality::Poor);
    }
    
    #[tokio::test]
    async fn test_network_manager_creation() {
        let manager = P2PNetworkManager::new(8888, None);
        
        assert_eq!(manager.port, 8888);
        assert_eq!(manager.max_peers, 50);
        assert_eq!(manager.heartbeat_interval, Duration::from_secs(60));
        assert_eq!(manager.peer_timeout, Duration::from_secs(300));
    }
    
    #[tokio::test]
    async fn test_peer_activity() {
        let addr: SocketAddr = "127.0.0.1:8080".parse().unwrap();
        let mut peer = Peer::new("test-peer".to_string(), addr, "test-key".to_string());
        
        // Peer should be active initially
        assert!(peer.is_active(Duration::from_secs(300)));
        
        // Simulate old timestamp
        peer.last_seen = Instant::now() - Duration::from_secs(400);
        assert!(!peer.is_active(Duration::from_secs(300)));
    }
}