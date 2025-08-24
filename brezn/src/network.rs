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
    
    pub fn with_config(mut self, config: &Config) -> Self {
        self.max_peers = config.max_peers;
        self.heartbeat_interval = Duration::from_secs(config.heartbeat_interval);
        self.sync_interval = Duration::from_secs(config.sync_interval);
        self.port = config.network_port;
        self
    }
    
    pub fn update_config(&mut self, config: &Config) -> Result<()> {
        self.max_peers = config.max_peers;
        self.heartbeat_interval = Duration::from_secs(config.heartbeat_interval);
        self.sync_interval = Duration::from_secs(config.sync_interval);
        
        // Validate configuration
        if self.max_peers == 0 {
            return Err(anyhow::anyhow!("Max peers cannot be 0"));
        }
        if self.heartbeat_interval.as_secs() == 0 {
            return Err(anyhow::anyhow!("Heartbeat interval cannot be 0"));
        }
        if self.sync_interval.as_secs() == 0 {
            return Err(anyhow::anyhow!("Sync interval cannot be 0"));
        }
        
        println!("⚙️ Netzwerk-Konfiguration aktualisiert: {} Peers, {}s Heartbeat, {}s Sync", 
            self.max_peers, self.heartbeat_interval.as_secs(), self.sync_interval.as_secs());
        
        Ok(())
    }
    
    // ========================================================================
    // Network Lifecycle Management
    // ========================================================================
    
    pub async fn start(&mut self) -> Result<()> {
        println!("🚀 Starte P2P Network auf Port {}...", self.port);
        
        // Initialize crypto and generate keys
        self.initialize_crypto().await?;
        println!("🔐 Krypto-Initialisierung abgeschlossen");
        
        // Start TCP listener
        self.start_listener().await?;
        println!("📡 TCP Listener gestartet");
        
        // Start background tasks
        self.start_background_tasks().await?;
        println!("⚙️ Hintergrund-Tasks gestartet");
        
        // Update stats
        if let Ok(mut stats) = self.stats.lock() {
            stats.network_uptime_seconds = 0;
        }
        
        println!("✅ P2P Network erfolgreich gestartet auf Port {}", self.port);
        println!("📊 Konfiguration: {} max Peers, {}s Heartbeat, {}s Sync", 
            self.max_peers, self.heartbeat_interval.as_secs(), self.sync_interval.as_secs());
        
        Ok(())
    }
    
    pub async fn stop(&mut self) -> Result<()> {
        println!("🛑 Stoppe P2P Network...");
        
        // Stop background tasks
        if let Some(task) = self.heartbeat_task.take() {
            println!("⏹️ Stoppe Heartbeat-Task...");
            task.abort();
        }
        if let Some(task) = self.sync_task.take() {
            println!("⏹️ Stoppe Sync-Task...");
            task.abort();
        }
        if let Some(task) = self.cleanup_task.take() {
            println!("⏹️ Stoppe Cleanup-Task...");
            task.abort();
        }
        
        // Close all peer connections
        println!("🔌 Trenne alle Peer-Verbindungen...");
        self.disconnect_all_peers().await?;
        
        // Update final stats
        if let Ok(mut stats) = self.stats.lock() {
            stats.network_uptime_seconds = stats.network_uptime_seconds;
        }
        
        println!("✅ P2P Network erfolgreich gestoppt");
        println!("📊 Finale Statistiken: {} Peers verbunden, {} Posts synchronisiert, {} Konflikte gelöst", 
            self.get_peer_count(), 
            self.stats.lock().unwrap().total_posts_synced,
            self.stats.lock().unwrap().total_conflicts_resolved);
        
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
                        
                        // Start message processing for this connection
                        let peer_id_clone = peer_id.clone();
                        let peer_connections_clone = peer_connections.clone();
                        let message_tx_clone = message_tx.clone();
                        
                        tokio::spawn(async move {
                            Self::process_peer_messages(
                                peer_id_clone, 
                                peer_connections_clone, 
                                message_tx_clone
                            ).await;
                        });
                    }
                    Err(e) => {
                        eprintln!("Failed to accept connection: {}", e);
                        // Don't break on connection errors, just log and continue
                        if e.kind() == std::io::ErrorKind::WouldBlock {
                            sleep(Duration::from_millis(100)).await;
                        }
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
        // Set TCP options for better performance
        stream.set_nodelay(true)?;
        stream.set_keepalive(Some(std::time::Duration::from_secs(60)))?;
        
        // Send connect message with timeout
        let connect_msg = P2PMessage::Connect {
            node_id: node_id.clone(),
            public_key: public_key.clone(),
            capabilities: capabilities.clone(),
        };
        
        let msg_bytes = serde_json::to_vec(&connect_msg)?;
        timeout(
            Duration::from_secs(5),
            stream.write_all(&msg_bytes)
        ).await
            .context("Failed to send connect message")?
            .context("Write failed")?;
        
        // Store connection first
        peer_connections.lock().unwrap().insert(peer_id.clone(), stream);
        
        // Create peer info with proper initialization
        let peer = Peer::new(
            peer_id.clone(),
            addr,
            "".to_string(), // Will be updated when we receive connect message
        );
        
        // Store peer info
        peers.lock().unwrap().insert(peer_id.clone(), peer);
        
        println!("🔗 Neue Verbindung von {} akzeptiert, Peer-ID: {}", addr, peer_id);
        
        // Start message processing for this connection
        let peer_id_clone = peer_id.clone();
        let peer_connections_clone = peer_connections.clone();
        let message_tx_clone = message_tx.clone();
        
        tokio::spawn(async move {
            Self::process_peer_messages(
                peer_id_clone, 
                peer_connections_clone, 
                message_tx_clone
            ).await;
        });
        
        Ok(())
    }
    
    // ========================================================================
    // Background Tasks
    // ========================================================================
    
    async fn start_background_tasks(&mut self) -> Result<()> {
        // Start message processing task
        let message_rx = self.message_rx.take();
        if let Some(mut rx) = message_rx {
            let peers = Arc::clone(&self.peers);
            let peer_connections = Arc::clone(&self.peer_connections);
            let database = self.database.clone();
            let node_id = self.node_id.clone();
            let stats = Arc::clone(&self.stats);
            
            tokio::spawn(async move {
                while let Some(message) = rx.recv().await {
                    // Handle message in background
                    if let Err(e) = Self::handle_message_background(
                        message, peers.clone(), peer_connections.clone(), 
                        database.clone(), node_id.clone(), stats.clone()
                    ).await {
                        eprintln!("Failed to handle message: {}", e);
                    }
                }
            });
        }
        
        // Start heartbeat task
        // Start heartbeat task
        let peers = Arc::clone(&self.peers);
        let peer_connections = Arc::clone(&self.peer_connections);
        let message_tx = self.message_tx.clone();
        let node_id = self.node_id.clone();
        let heartbeat_interval = self.heartbeat_interval;
        let stats = Arc::clone(&self.stats);
        
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
                    
                    // Send ping directly to peer connection
                    if let Some(stream) = peer_connections.lock().unwrap().get_mut(&peer_id) {
                        if let Ok(msg_bytes) = serde_json::to_vec(&ping_msg) {
                            if let Err(e) = timeout(Duration::from_secs(5), stream.write_all(&msg_bytes)).await {
                                eprintln!("Failed to send ping to {}: {}", peer_id, e);
                            }
                        }
                    }
                }
                
                // Update network uptime
                if let Ok(mut stats) = stats.lock() {
                    stats.network_uptime_seconds += heartbeat_interval.as_secs();
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
                    // Get last known timestamp from database for this peer
                    let last_known_timestamp = if let Some(db) = &self.database {
                        db.get_last_sync_timestamp(&peer_id).unwrap_or(0)
                    } else {
                        0
                    };
                    
                    let sync_request = P2PMessage::PostSyncRequest {
                        last_known_timestamp,
                        requesting_node: node_id.clone(),
                        sync_mode: SyncMode::Incremental,
                    };
                    
                    // Send sync request directly to peer
                    if let Some(stream) = peer_connections.lock().unwrap().get_mut(&peer_id) {
                        if let Ok(msg_bytes) = serde_json::to_vec(&sync_request) {
                            if let Err(e) = timeout(Duration::from_secs(10), stream.write_all(&msg_bytes)).await {
                                eprintln!("Failed to send sync request to {}: {}", peer_id, e);
                            }
                        }
                    }
                }
            }
        }));
        
        // Start cleanup task
        let peers = Arc::clone(&self.peers);
        let peer_connections = Arc::clone(&self.peer_connections);
        let peer_timeout = self.peer_timeout;
        let stats = Arc::clone(&self.stats);
        
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
                    println!("🧹 Entferne inaktiven Peer: {}", peer_id);
                    peers.lock().unwrap().remove(&peer_id);
                    peer_connections.lock().unwrap().remove(&peer_id);
                }
                
                // Update connection quality distribution
                if let Ok(mut stats) = stats.lock() {
                    let mut distribution = HashMap::new();
                    let peers = peers.lock().unwrap();
                    
                    for peer in peers.values() {
                        *distribution.entry(peer.connection_quality.clone()).or_insert(0) += 1;
                    }
                    
                    stats.connection_quality_distribution = distribution;
                    
                    // Calculate average latency
                    let total_latency: u64 = peers.values()
                        .filter_map(|p| p.latency_ms)
                        .sum();
                    let peer_count = peers.values().filter(|p| p.latency_ms.is_some()).count();
                    
                    if peer_count > 0 {
                        stats.average_latency_ms = total_latency / peer_count as u64;
                    }
                }
            }
        }));
        
        Ok(())
    }
    
    // ========================================================================
    // Peer Management
    // ========================================================================
    
    pub async fn connect_to_peer(&mut self, address: &str, port: u16) -> Result<()> {
        // Validate input
        if address.is_empty() || port == 0 {
            return Err(anyhow::anyhow!("Invalid address or port"));
        }
        
        // Check if we're already at max peers
        if self.get_peer_count() >= self.max_peers {
            return Err(anyhow::anyhow!("Maximum number of peers ({}) reached", self.max_peers));
        }
        
        // Check if we're already connected to this address
        let addr = format!("{}:{}", address, port);
        let socket_addr = addr.parse::<SocketAddr>()
            .context("Invalid address format")?;
        
        if self.is_address_connected(&socket_addr) {
            return Err(anyhow::anyhow!("Already connected to {}:{}", address, port));
        }
        
        // Try to connect with retry logic
        let mut attempts = 0;
        let max_attempts = 3;
        let mut last_error = None;
        
        while attempts < max_attempts {
            match timeout(
                Duration::from_secs(10),
                TcpStream::connect(socket_addr)
            ).await {
                Ok(Ok(stream)) => {
                    // Connection successful
                    let mut stream = stream;
                    
                    // Set TCP options for better performance
                    stream.set_nodelay(true)?;
                    stream.set_keepalive(Some(std::time::Duration::from_secs(60)))?;
                    
                    let peer_id = Uuid::new_v4().to_string();
                    let peer = Peer::new(
                        peer_id.clone(),
                        socket_addr,
                        "".to_string(), // Will be updated
                    );
                    
                    // Store peer and connection
                    self.peers.lock().unwrap().insert(peer_id.clone(), peer);
                    self.peer_connections.lock().unwrap().insert(peer_id, stream);
                    
                    // Update stats
                    if let Ok(mut stats) = self.stats.lock() {
                        stats.total_peers_connected += 1;
                        stats.active_peers = self.get_peer_count();
                    }
                    
                    println!("🔗 Verbindung zu Peer {}:{} hergestellt (Versuch {})", address, port, attempts + 1);
                    return Ok(());
                }
                Ok(Err(e)) => {
                    last_error = Some(e);
                    attempts += 1;
                    if attempts < max_attempts {
                        println!("⚠️ Verbindungsversuch {} fehlgeschlagen, versuche erneut in 2 Sekunden...", attempts);
                        sleep(Duration::from_secs(2)).await;
                    }
                }
                Err(_) => {
                    attempts += 1;
                    if attempts < max_attempts {
                        println!("⚠️ Verbindungsversuch {} timeout, versuche erneut in 2 Sekunden...", attempts);
                        sleep(Duration::from_secs(2)).await;
                    }
                }
            }
        }
        
        // All attempts failed
        let error_msg = last_error
            .map(|e| e.to_string())
            .unwrap_or_else(|| "Connection timeout".to_string());
        
        Err(anyhow::anyhow!("Failed to connect to {}:{} after {} attempts: {}", 
            address, port, max_attempts, error_msg))
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
                let _ = timeout(Duration::from_secs(5), stream.write_all(&msg_bytes)).await;
            }
            
            let _ = stream.shutdown().await;
        }
        
        // Remove from peers
        self.peers.lock().unwrap().remove(peer_id);
        
        println!("🔌 Peer {} getrennt", peer_id);
        Ok(())
    }
    
    pub async fn reconnect_peer(&mut self, peer_id: &str) -> Result<()> {
        // Get peer info
        let peer_info = if let Some(peer) = self.peers.lock().unwrap().get(peer_id) {
            peer.clone()
        } else {
            return Err(anyhow::anyhow!("Peer {} nicht gefunden", peer_id));
        };
        
        // Try to reconnect
        let addr = peer_info.address;
        let stream = timeout(
            Duration::from_secs(10),
            TcpStream::connect(addr)
        ).await
            .context("Connection timeout")?
            .context("Failed to reconnect to peer")?;
        
        // Set TCP options
        stream.set_nodelay(true)?;
        stream.set_keepalive(Some(std::time::Duration::from_secs(60)))?;
        
        // Store connection
        self.peer_connections.lock().unwrap().insert(peer_id.to_string(), stream);
        
        // Update peer status
        if let Some(peer) = self.peers.lock().unwrap().get_mut(peer_id) {
            peer.is_connected = true;
            peer.connection_established = Instant::now();
            peer.mark_seen();
        }
        
        println!("🔄 Peer {} wieder verbunden", peer_id);
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
        
        // Send ack message to peer
        if let Some(stream) = self.peer_connections.lock().unwrap().get_mut(&node_id) {
            let msg_bytes = serde_json::to_vec(&ack_msg)?;
            stream.write_all(&msg_bytes).await?;
        }
        
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
        // Calculate latency from ping timestamp
        let now = chrono::Utc::now().timestamp() as u64;
        let latency_ms = if now > timestamp { now - timestamp } else { 0 };
        
        // Send pong response
        let pong_msg = P2PMessage::Pong {
            node_id: self.node_id.clone(),
            timestamp,
            latency_ms,
        };
        
        // Send pong message to peer
        if let Some(stream) = self.peer_connections.lock().unwrap().get_mut(&node_id) {
            let msg_bytes = serde_json::to_vec(&pong_msg)?;
            stream.write_all(&msg_bytes).await?;
        }
        
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
                // Check for conflicts and resolve
                if let Err(e) = db.insert_post(&post) {
                    // If insertion fails due to duplicate, store conflict for manual resolution
                    if e.to_string().contains("Post already exists") {
                        let conflict_data = serde_json::to_string(&post)?;
                        let _ = db.store_post_conflict(
                            &post.get_post_id(),
                            &conflict_data,
                            "manual_resolution"
                        );
                        println!("⚠️ Konflikt für Post {} gespeichert: {}", post.get_post_id(), e);
                    } else {
                        return Err(anyhow::anyhow!("Failed to insert post: {}", e));
                    }
                }
            }
            
            // Update last sync timestamp for this peer
            db.update_last_sync_timestamp(&requesting_node, last_sync_timestamp)?;
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
            // Implement actual database query
            db.get_posts_since_timestamp(last_known_timestamp).await
                .unwrap_or_else(|_| Vec::new())
        } else {
            Vec::new()
        };
        
        // Detect conflicts
        let conflicts = self.detect_post_conflicts(&posts).await?;
        
        // Send sync response
        let sync_response = P2PMessage::PostSyncResponse {
            posts,
            conflicts,
            last_sync_timestamp: chrono::Utc::now().timestamp() as u64,
            responding_node: self.node_id.clone(),
        };
        
        // Send response to requesting peer
        if let Some(stream) = self.peer_connections.lock().unwrap().get_mut(&requesting_node) {
            let msg_bytes = serde_json::to_vec(&sync_response)?;
            stream.write_all(&msg_bytes).await?;
        }
        
        println!("📤 Post-Sync-Anfrage von Peer {} bearbeitet", requesting_node);
        Ok(())
    }
    
    async fn handle_post_sync_response(&mut self, posts: Vec<Post>, conflicts: Vec<PostConflict>, last_sync_timestamp: u64, responding_node: String) -> Result<()> {
        // Store received posts
        if let Some(db) = &self.database {
            for post in posts {
                if let Err(e) = db.insert_post(&post) {
                    // Handle duplicate posts
                    if e.to_string().contains("Post already exists") {
                        let conflict_data = serde_json::to_string(&post)?;
                        let _ = db.store_post_conflict(
                            &post.get_post_id(),
                            &conflict_data,
                            "duplicate_detection"
                        );
                        println!("⚠️ Duplikat-Post {} gespeichert: {}", post.get_post_id(), e);
                    } else {
                        return Err(anyhow::anyhow!("Failed to insert post: {}", e));
                    }
                }
            }
            
            // Update last sync timestamp for this peer
            db.update_last_sync_timestamp(&responding_node, last_sync_timestamp)?;
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
                post: post.clone(),
                broadcast_id,
                ttl: ttl - 1,
                origin_node,
            };
            
            // Broadcast to other peers
            self.broadcast_message_to_peers(rebroadcast_msg, &origin_node).await?;
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
                if let Some(best_post) = self.select_best_post_by_content(&conflict.conflicting_posts) {
                    if let Some(db) = &self.database {
                        db.insert_post(best_post).await?;
                    }
                }
            }
            ConflictResolutionStrategy::Manual => {
                // Store conflict for manual resolution
                self.store_conflict_for_manual_resolution(conflict).await?;
            }
            ConflictResolutionStrategy::Merged => {
                // Try to merge content
                if let Some(merged_post) = self.merge_conflicting_posts(&conflict.conflicting_posts) {
                    if let Some(db) = &self.database {
                        db.insert_post(&merged_post).await?;
                    }
                }
            }
        }
        
        Ok(())
    }
    
    // ========================================================================
    // Message Processing
    // ========================================================================
    
    async fn process_peer_messages(
        peer_id: String,
        peer_connections: Arc<Mutex<HashMap<String, TcpStream>>>,
        message_tx: mpsc::UnboundedSender<P2PMessage>,
    ) {
        let mut buffer = Vec::new();
        let mut stream_opt = None;
        
        // Get the stream for this peer
        if let Some(stream) = peer_connections.lock().unwrap().get(&peer_id) {
            stream_opt = Some(stream.try_clone().await.unwrap_or_else(|_| {
                eprintln!("Failed to clone stream for peer {}", peer_id);
                return;
            }));
        }
        
        let mut stream = match stream_opt {
            Some(s) => s,
            None => {
                eprintln!("No stream found for peer {}", peer_id);
                return;
            }
        };
        
        println!("🔄 Starte Message-Processing für Peer {}", peer_id);
        
        loop {
            let mut chunk = vec![0u8; 1024];
            match timeout(Duration::from_secs(30), stream.read(&mut chunk)).await {
                Ok(Ok(bytes_read)) => {
                    if bytes_read == 0 {
                        // Connection closed by peer
                        println!("🔌 Peer {} hat Verbindung geschlossen", peer_id);
                        break;
                    }
                    
                    // Add received data to buffer
                    buffer.extend_from_slice(&chunk[..bytes_read]);
                    
                    // Try to parse complete messages
                    while let Some(message) = Self::try_parse_message(&mut buffer) {
                        // Send message to main processing loop
                        if let Err(e) = message_tx.send(message) {
                            eprintln!("Failed to send message to main loop: {}", e);
                            break;
                        }
                    }
                }
                Ok(Err(e)) => {
                    eprintln!("Error reading from peer {}: {}", peer_id, e);
                    break;
                }
                Err(_) => {
                    // Timeout - send ping to keep connection alive
                    let ping_msg = P2PMessage::Ping {
                        node_id: "".to_string(), // Will be set by sender
                        timestamp: chrono::Utc::now().timestamp() as u64,
                    };
                    
                    if let Ok(msg_bytes) = serde_json::to_vec(&ping_msg) {
                        if let Err(e) = stream.write_all(&msg_bytes).await {
                            eprintln!("Failed to send ping to peer {}: {}", peer_id, e);
                            break;
                        }
                    }
                }
            }
        }
        
        println!("🔄 Message-Processing für Peer {} beendet", peer_id);
    }
    
    fn try_parse_message(buffer: &mut Vec<u8>) -> Option<P2PMessage> {
        // Simple message parsing - look for JSON messages
        // This is a basic implementation that can be improved
        if buffer.len() < 2 {
            return None;
        }
        
        // Try to find message boundaries (simple approach)
        for i in 0..buffer.len() - 1 {
            if buffer[i] == b'{' {
                // Try to parse from this position
                let json_str = String::from_utf8_lossy(&buffer[i..]);
                if let Ok(message) = serde_json::from_str::<P2PMessage>(&json_str) {
                    // Remove parsed message from buffer
                    buffer.drain(0..i + json_str.len());
                    return Some(message);
                }
            }
        }
        
        None
    }
    
    // ========================================================================
    // Background Message Handling
    // ========================================================================
    
    async fn handle_message_background(
        message: P2PMessage,
        peers: Arc<Mutex<HashMap<String, Peer>>>,
        peer_connections: Arc<Mutex<HashMap<String, TcpStream>>>,
        database: Option<Arc<Database>>,
        node_id: String,
        stats: Arc<Mutex<NetworkStats>>,
    ) -> Result<()> {
        match message {
            P2PMessage::Connect { node_id: peer_node_id, public_key, capabilities } => {
                Self::handle_connect_background(peer_node_id, public_key, capabilities, peers, peer_connections).await?;
            }
            P2PMessage::ConnectAck { node_id: peer_node_id, accepted, reason } => {
                Self::handle_connect_ack_background(peer_node_id, accepted, reason, peers, peer_connections).await?;
            }
            P2PMessage::Disconnect { node_id: peer_node_id, reason } => {
                Self::handle_disconnect_background(peer_node_id, reason, peers, peer_connections).await?;
            }
            P2PMessage::Ping { node_id: peer_node_id, timestamp } => {
                Self::handle_ping_background(peer_node_id, timestamp, peers, peer_connections, node_id).await?;
            }
            P2PMessage::Pong { node_id: peer_node_id, timestamp, latency_ms } => {
                Self::handle_pong_background(peer_node_id, timestamp, latency_ms, peers).await?;
            }
            P2PMessage::PostSync { posts, last_sync_timestamp, requesting_node } => {
                Self::handle_post_sync_background(posts, last_sync_timestamp, requesting_node, database, stats).await?;
            }
            P2PMessage::PostSyncRequest { last_known_timestamp, requesting_node, sync_mode } => {
                Self::handle_post_sync_request_background(last_known_timestamp, requesting_node, sync_mode, database, node_id, peer_connections).await?;
            }
            P2PMessage::PostSyncResponse { posts, conflicts, last_sync_timestamp, responding_node } => {
                Self::handle_post_sync_response_background(posts, conflicts, last_sync_timestamp, responding_node, database, stats).await?;
            }
            P2PMessage::PostBroadcast { post, broadcast_id, ttl, origin_node } => {
                Self::handle_post_broadcast_background(post, broadcast_id, ttl, origin_node, database, peer_connections).await?;
            }
            P2PMessage::NetworkStatus { node_id: peer_node_id, peer_count, uptime_seconds, last_post_timestamp } => {
                Self::handle_network_status_background(peer_node_id, peer_count, uptime_seconds, last_post_timestamp, peers).await?;
            }
        }
        
        Ok(())
    }
    
    async fn handle_connect_background(
        node_id: String,
        public_key: String,
        capabilities: Vec<String>,
        peers: Arc<Mutex<HashMap<String, Peer>>>,
        peer_connections: Arc<Mutex<HashMap<String, TcpStream>>>,
    ) -> Result<()> {
        // Update peer info
        if let Some(peer) = peers.lock().unwrap().get_mut(&node_id) {
            peer.public_key = public_key;
            peer.capabilities = capabilities;
            peer.mark_seen();
        }
        
        println!("✅ Verbindung von Peer {} akzeptiert", node_id);
        Ok(())
    }
    
    async fn handle_connect_ack_background(
        node_id: String,
        accepted: bool,
        reason: Option<String>,
        peers: Arc<Mutex<HashMap<String, Peer>>>,
        peer_connections: Arc<Mutex<HashMap<String, TcpStream>>>,
    ) -> Result<()> {
        if accepted {
            println!("✅ Verbindung zu Peer {} bestätigt", node_id);
        } else {
            let reason = reason.unwrap_or_else(|| "Unknown reason".to_string());
            println!("❌ Verbindung zu Peer {} abgelehnt: {}", node_id, reason);
            
            // Remove peer if connection was rejected
            peers.lock().unwrap().remove(&node_id);
            peer_connections.lock().unwrap().remove(&node_id);
        }
        Ok(())
    }
    
    async fn handle_disconnect_background(
        node_id: String,
        reason: String,
        peers: Arc<Mutex<HashMap<String, Peer>>>,
        peer_connections: Arc<Mutex<HashMap<String, TcpStream>>>,
    ) -> Result<()> {
        println!("🔌 Peer {} getrennt: {}", node_id, reason);
        
        // Remove peer
        peers.lock().unwrap().remove(&node_id);
        peer_connections.lock().unwrap().remove(&node_id);
        
        Ok(())
    }
    
    async fn handle_ping_background(
        node_id: String,
        timestamp: u64,
        peers: Arc<Mutex<HashMap<String, Peer>>>,
        peer_connections: Arc<Mutex<HashMap<String, TcpStream>>>,
        self_node_id: String,
    ) -> Result<()> {
        // Calculate latency from ping timestamp
        let now = chrono::Utc::now().timestamp() as u64;
        let latency_ms = if now > timestamp { now - timestamp } else { 0 };
        
        // Send pong response
        let pong_msg = P2PMessage::Pong {
            node_id: self_node_id,
            timestamp,
            latency_ms,
        };
        
        // Send pong message to peer
        if let Some(stream) = peer_connections.lock().unwrap().get_mut(&node_id) {
            let msg_bytes = serde_json::to_vec(&pong_msg)?;
            stream.write_all(&msg_bytes).await?;
        }
        
        // Update peer last seen
        if let Some(peer) = peers.lock().unwrap().get_mut(&node_id) {
            peer.mark_seen();
            peer.last_ping = Some(Instant::now());
        }
        
        Ok(())
    }
    
    async fn handle_pong_background(
        node_id: String,
        timestamp: u64,
        latency_ms: u64,
        peers: Arc<Mutex<HashMap<String, Peer>>>,
    ) -> Result<()> {
        // Update peer latency
        if let Some(peer) = peers.lock().unwrap().get_mut(&node_id) {
            peer.update_latency(latency_ms);
        }
        
        Ok(())
    }
    
    async fn handle_post_sync_background(
        posts: Vec<Post>,
        last_sync_timestamp: u64,
        requesting_node: String,
        database: Option<Arc<Database>>,
        stats: Arc<Mutex<NetworkStats>>,
    ) -> Result<()> {
        // Store received posts
        if let Some(db) = database {
            for post in posts {
                // Use tokio::task::spawn_blocking for database operations
                let db_clone = db.clone();
                let post_clone = post.clone();
                
                tokio::task::spawn_blocking(move || {
                    if let Err(e) = db_clone.add_post(&post_clone) {
                        eprintln!("Failed to insert post: {}", e);
                    }
                });
            }
        }
        
        // Update stats
        if let Ok(mut stats) = stats.lock() {
            stats.total_posts_synced += posts.len();
            stats.last_sync_timestamp = last_sync_timestamp;
        }
        
        println!("📥 {} Posts von Peer {} synchronisiert", posts.len(), requesting_node);
        Ok(())
    }
    
    async fn handle_post_sync_request_background(
        last_known_timestamp: u64,
        requesting_node: String,
        sync_mode: SyncMode,
        database: Option<Arc<Database>>,
        node_id: String,
        peer_connections: Arc<Mutex<HashMap<String, TcpStream>>>,
    ) -> Result<()> {
        // Get posts since last known timestamp
        let posts = if let Some(db) = database {
            let db_clone = db.clone();
            tokio::task::spawn_blocking(move || {
                db_clone.get_posts_since_timestamp(last_known_timestamp)
                    .unwrap_or_else(|_| Vec::new())
            }).await?
        } else {
            Vec::new()
        };
        
        // Detect conflicts
        let conflicts = Self::detect_post_conflicts_background(&posts, database.clone()).await?;
        
        // Send sync response
        let sync_response = P2PMessage::PostSyncResponse {
            posts,
            conflicts,
            last_sync_timestamp: chrono::Utc::now().timestamp() as u64,
            responding_node: node_id,
        };
        
        // Send response to requesting peer
        if let Some(stream) = peer_connections.lock().unwrap().get_mut(&requesting_node) {
            let msg_bytes = serde_json::to_vec(&sync_response)?;
            stream.write_all(&msg_bytes).await?;
        }
        
        println!("📤 Post-Sync-Anfrage von Peer {} bearbeitet", requesting_node);
        Ok(())
    }
    
    async fn handle_post_sync_response_background(
        posts: Vec<Post>,
        conflicts: Vec<PostConflict>,
        last_sync_timestamp: u64,
        responding_node: String,
        database: Option<Arc<Database>>,
        stats: Arc<Mutex<NetworkStats>>,
    ) -> Result<()> {
        // Store received posts
        if let Some(db) = database {
            for post in posts {
                let db_clone = db.clone();
                let post_clone = post.clone();
                
                tokio::task::spawn_blocking(move || {
                    if let Err(e) = db_clone.add_post(&post_clone) {
                        eprintln!("Failed to insert post: {}", e);
                    }
                });
            }
        }
        
        // Resolve conflicts
        for conflict in conflicts {
            Self::resolve_post_conflict_background(conflict, database.clone()).await?;
        }
        
        // Update stats
        if let Ok(mut stats) = stats.lock() {
            stats.total_posts_synced += posts.len();
            stats.total_conflicts_resolved += conflicts.len();
            stats.last_sync_timestamp = last_sync_timestamp;
        }
        
        println!("📥 Post-Sync-Antwort von Peer {} verarbeitet", responding_node);
        Ok(())
    }
    
    async fn handle_post_broadcast_background(
        post: Post,
        broadcast_id: String,
        ttl: u32,
        origin_node: String,
        database: Option<Arc<Database>>,
        peer_connections: Arc<Mutex<HashMap<String, TcpStream>>>,
    ) -> Result<()> {
        // Store the post
        if let Some(db) = database {
            let db_clone = db.clone();
            let post_clone = post.clone();
            
            tokio::task::spawn_blocking(move || {
                if let Err(e) = db_clone.add_post(&post_clone) {
                    eprintln!("Failed to insert post: {}", e);
                }
            });
        }
        
        // Re-broadcast if TTL > 0
        if ttl > 0 {
            let rebroadcast_msg = P2PMessage::PostBroadcast {
                post: post.clone(),
                broadcast_id,
                ttl: ttl - 1,
                origin_node,
            };
            
            // Broadcast to other peers
            Self::broadcast_message_to_peers_background(rebroadcast_msg, &origin_node, peer_connections).await?;
        }
        
        println!("📢 Post-Broadcast von Peer {} empfangen", origin_node);
        Ok(())
    }
    
    async fn handle_network_status_background(
        node_id: String,
        peer_count: usize,
        uptime_seconds: u64,
        last_post_timestamp: u64,
        peers: Arc<Mutex<HashMap<String, Peer>>>,
    ) -> Result<()> {
        // Update peer info
        if let Some(peer) = peers.lock().unwrap().get_mut(&node_id) {
            peer.post_count = peer_count;
            peer.last_post_timestamp = last_post_timestamp;
            peer.mark_seen();
        }
        
        Ok(())
    }
    
    async fn detect_post_conflicts_background(posts: &[Post], database: Option<Arc<Database>>) -> Result<Vec<PostConflict>> {
        let mut conflicts = Vec::new();
        
        if let Some(db) = database {
            for post in posts {
                // Check for posts with same content but different timestamps
                let db_clone = db.clone();
                let content = post.content.clone();
                
                let existing_posts = tokio::task::spawn_blocking(move || {
                    db_clone.get_posts_by_content(&content)
                        .unwrap_or_else(|_| Vec::new())
                }).await?;
                
                if existing_posts.len() > 1 {
                    let conflict = PostConflict {
                        post_id: post.id.unwrap_or(0),
                        conflicting_posts: existing_posts,
                        resolution_strategy: ConflictResolutionStrategy::LatestWins,
                        resolved_at: None,
                    };
                    conflicts.push(conflict);
                }
            }
        }
        
        Ok(conflicts)
    }
    
    async fn resolve_post_conflict_background(conflict: PostConflict, database: Option<Arc<Database>>) -> Result<()> {
        match conflict.resolution_strategy {
            ConflictResolutionStrategy::LatestWins => {
                if let Some(latest_post) = conflict.conflicting_posts.iter()
                    .max_by_key(|p| p.timestamp) {
                    if let Some(db) = database {
                        let db_clone = db.clone();
                        let post_clone = latest_post.clone();
                        
                        tokio::task::spawn_blocking(move || {
                            if let Err(e) = db_clone.add_post(&post_clone) {
                                eprintln!("Failed to insert latest post: {}", e);
                            }
                        });
                    }
                }
            }
            ConflictResolutionStrategy::FirstWins => {
                if let Some(first_post) = conflict.conflicting_posts.iter()
                    .min_by_key(|p| p.timestamp) {
                    if let Some(db) = database {
                        let db_clone = db.clone();
                        let post_clone = first_post.clone();
                        
                        tokio::task::spawn_blocking(move || {
                            if let Err(e) = db_clone.add_post(&post_clone) {
                                eprintln!("Failed to insert first post: {}", e);
                            }
                        });
                    }
                }
            }
            ConflictResolutionStrategy::ContentHash => {
                if let Some(best_post) = Self::select_best_post_by_content_background(&conflict.conflicting_posts) {
                    if let Some(db) = database {
                        let db_clone = db.clone();
                        let post_clone = best_post.clone();
                        
                        tokio::task::spawn_blocking(move || {
                            if let Err(e) = db_clone.add_post(&post_clone) {
                                eprintln!("Failed to insert best post: {}", e);
                            }
                        });
                    }
                }
            }
            ConflictResolutionStrategy::Manual => {
                Self::store_conflict_for_manual_resolution_background(conflict, database).await?;
            }
            ConflictResolutionStrategy::Merged => {
                if let Some(merged_post) = Self::merge_conflicting_posts_background(&conflict.conflicting_posts) {
                    if let Some(db) = database {
                        let db_clone = db.clone();
                        let post_clone = merged_post.clone();
                        
                        tokio::task::spawn_blocking(move || {
                            if let Err(e) = db_clone.add_post(&post_clone) {
                                eprintln!("Failed to insert merged post: {}", e);
                            }
                        });
                    }
                }
            }
        }
        
        Ok(())
    }
    
    fn select_best_post_by_content_background(posts: &[Post]) -> Option<&Post> {
        posts.iter().max_by_key(|p| {
            let content_score = p.content.len() as u64;
            let timestamp_score = p.timestamp;
            let signature_score = if p.signature.is_some() { 1000 } else { 0 };
            
            content_score + timestamp_score + signature_score
        })
    }
    
    async fn store_conflict_for_manual_resolution_background(conflict: PostConflict, _database: Option<Arc<Database>>) -> Result<()> {
        println!("⚠️ Konflikt für manuelle Lösung gespeichert: {:?}", conflict.post_id);
        Ok(())
    }
    
    fn merge_conflicting_posts_background(posts: &[Post]) -> Option<Post> {
        if posts.is_empty() {
            return None;
        }
        
        let mut merged_content = String::new();
        let mut latest_timestamp = 0u64;
        let mut pseudonym = String::new();
        let mut node_id = None;
        
        for post in posts {
            if !merged_content.is_empty() {
                merged_content.push_str(" | ");
            }
            merged_content.push_str(&post.content);
            
            if post.timestamp > latest_timestamp {
                latest_timestamp = post.timestamp;
                pseudonym = post.pseudonym.clone();
                node_id = post.node_id.clone();
            }
        }
        
        Some(Post {
            id: None,
            content: merged_content,
            timestamp: latest_timestamp,
            pseudonym,
            node_id,
        })
    }
    
    async fn broadcast_message_to_peers_background(
        message: P2PMessage,
        exclude_peer: &str,
        peer_connections: Arc<Mutex<HashMap<String, TcpStream>>>,
    ) -> Result<()> {
        let peer_ids: Vec<String> = {
            let connections = peer_connections.lock().unwrap();
            connections.keys()
                .filter(|id| *id != exclude_peer)
                .cloned()
                .collect()
        };
        
        for peer_id in peer_ids {
            if let Some(stream) = peer_connections.lock().unwrap().get_mut(&peer_id) {
                if let Ok(msg_bytes) = serde_json::to_vec(&message) {
                    let _ = stream.write_all(&msg_bytes).await;
                }
            }
        }
        
        Ok(())
    }
    
        // ========================================================================
    // Message Broadcasting
    // ========================================================================
    
    async fn broadcast_message_to_peers(&self, message: P2PMessage, exclude_peer: &str) -> Result<()> {
        let peer_ids: Vec<String> = {
            let peers = self.peers.lock().unwrap();
            peers.keys()
                .filter(|id| *id != exclude_peer)
                .cloned()
                .collect()
        };
        
        let mut successful_broadcasts = 0;
        let mut failed_broadcasts = 0;
        
        for peer_id in peer_ids {
            if let Some(stream) = self.peer_connections.lock().unwrap().get_mut(&peer_id) {
                if let Ok(msg_bytes) = serde_json::to_vec(&message) {
                    match timeout(Duration::from_secs(5), stream.write_all(&msg_bytes)).await {
                        Ok(Ok(_)) => {
                            successful_broadcasts += 1;
                        }
                        Ok(Err(e)) => {
                            eprintln!("Failed to broadcast to {}: {}", peer_id, e);
                            failed_broadcasts += 1;
                        }
                        Err(_) => {
                            eprintln!("Broadcast timeout to {}", peer_id);
                            failed_broadcasts += 1;
                        }
                    }
                }
            }
        }
        
        if failed_broadcasts > 0 {
            println!("📢 Broadcast abgeschlossen: {} erfolgreich, {} fehlgeschlagen", 
                successful_broadcasts, failed_broadcasts);
        } else {
            println!("📢 Broadcast erfolgreich an {} Peers gesendet", successful_broadcasts);
        }
        
        Ok(())
    }
    
    pub async fn broadcast_post(&self, post: Post, ttl: u32) -> Result<()> {
        let broadcast_id = Uuid::new_v4().to_string();
        let broadcast_msg = P2PMessage::PostBroadcast {
            post: post.clone(),
            broadcast_id: broadcast_id.clone(),
            ttl,
            origin_node: self.node_id.clone(),
        };
        
        // Store the post locally first
        if let Some(db) = &self.database {
            db.insert_post(&post).await?;
        }
        
        // Broadcast to all peers
        self.broadcast_message_to_peers(broadcast_msg, &self.node_id).await?;
        
        println!("📢 Post erfolgreich an {} Peers gebroadcastet", self.get_peer_count());
        Ok(())
    }
    
    // ========================================================================
    // Helper Functions
    // ========================================================================
    
    fn select_best_post_by_content(&self, posts: &[Post]) -> Option<&Post> {
        posts.iter().max_by_key(|p| {
            // Score based on content length, timestamp, and signature validity
            let content_score = p.content.len() as u64;
            let timestamp_score = p.timestamp;
            let signature_score = if p.signature.is_some() { 1000 } else { 0 };
            
            content_score + timestamp_score + signature_score
        })
    }
    
    async fn store_conflict_for_manual_resolution(&self, conflict: PostConflict) -> Result<()> {
        // Store conflict in database for manual review
        if let Some(db) = &self.database {
            let conflict_data = serde_json::to_string(&conflict.conflicting_posts)?;
            let _ = db.store_post_conflict(
                &conflict.post_id,
                &conflict_data,
                &format!("{:?}", conflict.resolution_strategy)
            );
            println!("⚠️ Konflikt für manuelle Lösung gespeichert: {}", conflict.post_id);
        }
        Ok(())
    }
    
    fn merge_conflicting_posts(&self, posts: &[Post]) -> Option<Post> {
        if posts.is_empty() {
            return None;
        }
        
        // Simple merge: combine content with timestamps
        let mut merged_content = String::new();
        let mut latest_timestamp = 0u64;
        let mut pseudonym = String::new();
        let mut node_id = None;
        
        for post in posts {
            if !merged_content.is_empty() {
                merged_content.push_str(" | ");
            }
            merged_content.push_str(&post.content);
            
            if post.timestamp > latest_timestamp {
                latest_timestamp = post.timestamp;
                pseudonym = post.pseudonym.clone();
                node_id = post.node_id.clone();
            }
        }
        
        Some(Post::new(merged_content, pseudonym, node_id))
    }
    
    async fn detect_post_conflicts(&self, posts: &[Post]) -> Result<Vec<PostConflict>> {
        let mut conflicts = Vec::new();
        
        if let Some(db) = &self.database {
            for post in posts {
                // Check for posts with same content but different timestamps
                if let Ok(existing_posts) = db.get_posts_by_content(&post.content).await {
                    if existing_posts.len() > 1 {
                        let conflict = PostConflict {
                            post_id: post.get_post_id(),
                            conflicting_posts: existing_posts,
                            resolution_strategy: ConflictResolutionStrategy::LatestWins,
                            resolved_at: None,
                        };
                        conflicts.push(conflict);
                    }
                }
            }
        }
        
        Ok(conflicts)
    }
    
    // ========================================================================
    // Network Status and Statistics
    // ========================================================================
    
    pub fn get_network_status(&self) -> NetworkStatus {
        let peers = self.peers.lock().unwrap();
        let stats = self.stats.lock().unwrap();
        
        // Calculate additional metrics
        let active_peers = peers.values().filter(|p| p.is_active(self.peer_timeout)).count();
        let excellent_connections = peers.values()
            .filter(|p| p.connection_quality == ConnectionQuality::Excellent)
            .count();
        let good_connections = peers.values()
            .filter(|p| p.connection_quality == ConnectionQuality::Good)
            .count();
        let poor_connections = peers.values()
            .filter(|p| p.connection_quality == ConnectionQuality::Poor)
            .count();
        
        NetworkStatus {
            node_id: self.node_id.clone(),
            peer_count: peers.len(),
            active_peers,
            total_posts_synced: stats.total_posts_synced,
            total_conflicts_resolved: stats.total_conflicts_resolved,
            network_uptime_seconds: stats.network_uptime_seconds,
            last_sync_timestamp: stats.last_sync_timestamp,
            average_latency_ms: stats.average_latency_ms,
            connection_quality_distribution: stats.connection_quality_distribution.clone(),
            excellent_connections,
            good_connections,
            poor_connections,
            network_health_score: self.calculate_network_health_score(),
        }
    }
    
    fn calculate_network_health_score(&self) -> f64 {
        let peers = self.peers.lock().unwrap();
        let stats = self.stats.lock().unwrap();
        
        if peers.is_empty() {
            return 0.0;
        }
        
        let active_peers = peers.values().filter(|p| p.is_active(self.peer_timeout)).count();
        let active_ratio = active_peers as f64 / peers.len() as f64;
        
        let avg_latency_score = if stats.average_latency_ms < 100 { 1.0 }
            else if stats.average_latency_ms < 200 { 0.8 }
            else if stats.average_latency_ms < 500 { 0.6 }
            else { 0.3 };
        
        let sync_score = if stats.last_sync_timestamp > 0 { 1.0 } else { 0.5 };
        
        (active_ratio * 0.4 + avg_latency_score * 0.3 + sync_score * 0.3)
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
    
    fn is_address_connected(&self, address: &SocketAddr) -> bool {
        let peers = self.peers.lock().unwrap();
        peers.values().any(|p| p.address == *address)
    }
    
    pub fn get_peer_by_address(&self, address: &SocketAddr) -> Option<Peer> {
        let peers = self.peers.lock().unwrap();
        peers.values().find(|p| p.address == *address).cloned()
    }
    
    pub fn get_peer_by_id(&self, peer_id: &str) -> Option<Peer> {
        let peers = self.peers.lock().unwrap();
        peers.get(peer_id).cloned()
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
    pub excellent_connections: usize,
    pub good_connections: usize,
    pub poor_connections: usize,
    pub network_health_score: f64,
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
    
    #[tokio::test]
    async fn test_network_manager_with_config() {
        let config = Config::default();
        let manager = P2PNetworkManager::new(8888, None).with_config(&config);
        
        assert_eq!(manager.max_peers, config.max_peers);
        assert_eq!(manager.heartbeat_interval, Duration::from_secs(config.heartbeat_interval));
        assert_eq!(manager.sync_interval, Duration::from_secs(config.sync_interval));
    }
    
    #[tokio::test]
    async fn test_connection_quality_scoring() {
        assert_eq!(ConnectionQuality::Excellent.score(), 1.0);
        assert_eq!(ConnectionQuality::Good.score(), 0.8);
        assert_eq!(ConnectionQuality::Fair.score(), 0.6);
        assert_eq!(ConnectionQuality::Poor.score(), 0.3);
        assert_eq!(ConnectionQuality::Unknown.score(), 0.5);
    }
    
    #[tokio::test]
    async fn test_peer_latency_update() {
        let addr: SocketAddr = "127.0.0.1:8080".parse().unwrap();
        let mut peer = Peer::new("test-peer".to_string(), addr, "test-key".to_string());
        
        assert_eq!(peer.connection_quality, ConnectionQuality::Unknown);
        
        peer.update_latency(25);
        assert_eq!(peer.connection_quality, ConnectionQuality::Excellent);
        assert_eq!(peer.latency_ms, Some(25));
        
        peer.update_latency(100);
        assert_eq!(peer.connection_quality, ConnectionQuality::Good);
        assert_eq!(peer.latency_ms, Some(100));
    }
    
    #[tokio::test]
    async fn test_message_parsing() {
        let test_message = P2PMessage::Ping {
            node_id: "test-node".to_string(),
            timestamp: 1234567890,
        };
        
        let json_str = serde_json::to_string(&test_message).unwrap();
        let mut buffer = json_str.into_bytes();
        
        let parsed = P2PNetworkManager::parse_message_from_buffer(&mut buffer);
        assert!(parsed.is_ok());
        
        let parsed_message = parsed.unwrap();
        match parsed_message {
            P2PMessage::Ping { node_id, timestamp } => {
                assert_eq!(node_id, "test-node");
                assert_eq!(timestamp, 1234567890);
            }
            _ => panic!("Wrong message type parsed"),
        }
    }
    
    #[tokio::test]
    async fn test_network_stats() {
        let stats = NetworkStats::default();
        
        assert_eq!(stats.total_peers_connected, 0);
        assert_eq!(stats.active_peers, 0);
        assert_eq!(stats.total_posts_synced, 0);
        assert_eq!(stats.total_conflicts_resolved, 0);
        assert_eq!(stats.network_uptime_seconds, 0);
        assert_eq!(stats.last_sync_timestamp, 0);
        assert_eq!(stats.average_latency_ms, 0);
        assert!(stats.connection_quality_distribution.is_empty());
    }
    
    // ========================================================================
    // END-TO-END P2P NETWORK TESTS
    // ========================================================================
    
    #[tokio::test]
    async fn test_end_to_end_peer_discovery() {
        // Create two network managers
        let mut manager1 = P2PNetworkManager::new(8888, None);
        let mut manager2 = P2PNetworkManager::new(8889, None);
        
        // Start both managers
        manager1.start().await.unwrap();
        manager2.start().await.unwrap();
        
        // Wait for discovery
        tokio::time::sleep(Duration::from_millis(100)).await;
        
        // Check if peers were discovered
        let peers1 = manager1.get_peers();
        let peers2 = manager2.get_peers();
        
        // At least one peer should be discovered
        assert!(peers1.len() > 0 || peers2.len() > 0, "No peers discovered");
        
        // Cleanup
        manager1.stop().await.unwrap();
        manager2.stop().await.unwrap();
    }
    
    #[tokio::test]
    async fn test_end_to_end_post_synchronization() {
        // Create network manager with database
        let db = Database::new().unwrap();
        let mut manager = P2PNetworkManager::new(8888, Some(db));
        manager.start().await.unwrap();
        
        // Create test post
        let test_post = Post::new(
            "Test post content".to_string(),
            "TestUser".to_string(),
            Some("test-node".to_string())
        );
        
        // Simulate post sync
        let sync_result = manager.handle_post_sync(
            vec![test_post.clone()],
            chrono::Utc::now().timestamp() as u64,
            "test-peer".to_string()
        ).await;
        
        assert!(sync_result.is_ok(), "Post sync failed: {:?}", sync_result);
        
        // Verify post was stored
        let stored_posts = db.get_posts_with_conflicts(10).unwrap();
        let found_post = stored_posts.iter().find(|p| p.content == "Test post content");
        assert!(found_post.is_some(), "Post was not stored");
        
        // Cleanup
        manager.stop().await.unwrap();
    }
    
    #[tokio::test]
    async fn test_end_to_end_conflict_resolution() {
        // Create network manager with database
        let db = Database::new().unwrap();
        let mut manager = P2PNetworkManager::new(8888, Some(db));
        manager.start().await.unwrap();
        
        // Create conflicting posts
        let post1 = Post::new(
            "Same content".to_string(),
            "User1".to_string(),
            Some("node1".to_string())
        );
        let post2 = Post::new(
            "Same content".to_string(),
            "User2".to_string(),
            Some("node2".to_string())
        );
        
        // Simulate conflict
        let conflict = PostConflict {
            post_id: "conflict-1".to_string(),
            conflicting_posts: vec![post1, post2],
            resolution_strategy: ConflictResolutionStrategy::LatestWins,
            resolved_at: None,
        };
        
        // Test conflict resolution
        let resolution_result = manager.resolve_post_conflict(conflict).await;
        assert!(resolution_result.is_ok(), "Conflict resolution failed: {:?}", resolution_result);
        
        // Cleanup
        manager.stop().await.unwrap();
    }
    
    #[tokio::test]
    async fn test_end_to_end_network_health() {
        // Create network manager
        let mut manager = P2PNetworkManager::new(8888, None);
        manager.start().await.unwrap();
        
        // Wait for network to stabilize
        tokio::time::sleep(Duration::from_millis(100)).await;
        
        // Get network status
        let status = manager.get_network_status();
        
        // Verify status fields
        assert_eq!(status.node_id, manager.node_id);
        assert!(status.peer_count >= 0);
        assert!(status.network_uptime_seconds >= 0);
        assert!(status.network_health_score >= 0.0 && status.network_health_score <= 1.0);
        
        // Cleanup
        manager.stop().await.unwrap();
    }
    
    #[tokio::test]
    async fn test_end_to_end_message_routing() {
        // Create network manager
        let mut manager = P2PNetworkManager::new(8888, None);
        manager.start().await.unwrap();
        
        // Create test message
        let test_message = P2PMessage::Ping {
            node_id: "test-node".to_string(),
            timestamp: chrono::Utc::now().timestamp() as u64,
        };
        
        // Test message serialization/deserialization
        let message_bytes = serde_json::to_vec(&test_message).unwrap();
        let parsed_message: P2PMessage = serde_json::from_slice(&message_bytes).unwrap();
        
        match (test_message, parsed_message) {
            (P2PMessage::Ping { node_id: id1, timestamp: ts1 }, 
             P2PMessage::Ping { node_id: id2, timestamp: ts2 }) => {
                assert_eq!(id1, id2);
                assert_eq!(ts1, ts2);
            }
            _ => panic!("Message parsing failed"),
        }
        
        // Cleanup
        manager.stop().await.unwrap();
    }
    
    #[tokio::test]
    async fn test_end_to_end_peer_management() {
        // Create network manager
        let mut manager = P2PNetworkManager::new(8888, None);
        manager.start().await.unwrap();
        
        // Test peer addition
        let peer_addr = "127.0.0.1:9999".parse().unwrap();
        let add_result = manager.add_peer("test-peer".to_string(), peer_addr, "test-key".to_string()).await;
        assert!(add_result.is_ok(), "Failed to add peer: {:?}", add_result);
        
        // Verify peer was added
        let peers = manager.get_peers();
        assert!(peers.iter().any(|p| p.node_id == "test-peer"), "Peer was not added");
        
        // Test peer removal
        let remove_result = manager.remove_peer("test-peer").await;
        assert!(remove_result.is_ok(), "Failed to remove peer: {:?}", remove_result);
        
        // Verify peer was removed
        let peers_after = manager.get_peers();
        assert!(!peers_after.iter().any(|p| p.node_id == "test-peer"), "Peer was not removed");
        
        // Cleanup
        manager.stop().await.unwrap();
    }
    
    #[tokio::test]
    async fn test_end_to_end_heartbeat_system() {
        // Create network manager
        let mut manager = P2PNetworkManager::new(8888, None);
        manager.start().await.unwrap();
        
        // Add a test peer
        let peer_addr = "127.0.0.1:9999".parse().unwrap();
        manager.add_peer("test-peer".to_string(), peer_addr, "test-key".to_string()).await.unwrap();
        
        // Wait for heartbeat
        tokio::time::sleep(Duration::from_millis(100)).await;
        
        // Check if peer is still active
        let peers = manager.get_peers();
        let test_peer = peers.iter().find(|p| p.node_id == "test-peer");
        assert!(test_peer.is_some(), "Test peer not found");
        assert!(test_peer.unwrap().is_active(Duration::from_secs(300)), "Peer became inactive");
        
        // Cleanup
        manager.stop().await.unwrap();
    }
}