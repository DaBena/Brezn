use tokio::net::{TcpListener, TcpStream, UdpSocket};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use serde::{Serialize, Deserialize};
use serde_json;
use anyhow::{Result, Context};
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use crate::types::{
    NetworkMessage, Post, Config, PostConflict, ConflictResolutionStrategy,
    FeedState, SyncRequest, SyncMode,
    PostBroadcast, PostOrder
};

use crate::crypto::CryptoManager;
use crate::database::Database;
use crate::tor::{TorManager, TorStatus};
use sodiumoxide::crypto::box_;
use uuid::Uuid;

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

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiscoveryMessage {
    pub message_type: String,
    pub node_id: String,
    pub public_key: String,
    pub network_port: u16,
    pub timestamp: u64,
    pub capabilities: Vec<String>,
}

pub trait MessageHandler: Send + Sync {
    fn handle_post(&self, post: &Post) -> Result<()>;
    fn handle_config(&self, config: &Config) -> Result<()>;
    fn handle_ping(&self, node_id: &str) -> Result<()>;
    fn handle_pong(&self, node_id: &str) -> Result<()>;
    fn get_recent_posts(&self, _limit: usize) -> Result<Vec<Post>> { Ok(Vec::new()) }
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
    
    discovery_socket: Option<UdpSocket>,
    discovery_port: u16,
    heartbeat_interval: Duration,
    peer_timeout: Duration,
    max_peers: usize,
    local_node_id: String,
    local_public_key: String,
    
    feed_state: Arc<Mutex<FeedState>>,
    post_conflicts: Arc<Mutex<HashMap<String, PostConflict>>>,
    post_order: Arc<Mutex<HashMap<String, PostOrder>>>,
    broadcast_cache: Arc<Mutex<HashMap<String, PostBroadcast>>>,
    tor_health_monitor: Arc<Mutex<TorHealthMonitor>>,
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
                node_id: "local".to_string(),
                connections: HashSet::new(),
                routing_table: HashMap::new(),
                network_segments: Vec::new(),
                topology_version: 0,
            })),
            discovery_manager: None,
            
            discovery_socket: None,
            discovery_port: 0,
            heartbeat_interval: Duration::from_secs(60),
            peer_timeout: Duration::from_secs(10),
            max_peers: 100,
            local_node_id: node_id.clone(),
            local_public_key: "".to_string(),
            
            feed_state: Arc::new(Mutex::new(feed_state)),
            post_conflicts: Arc::new(Mutex::new(HashMap::new())),
            post_order: Arc::new(Mutex::new(HashMap::new())),
            broadcast_cache: Arc::new(Mutex::new(HashMap::new())),
            tor_health_monitor: Arc::new(Mutex::new(TorHealthMonitor::default())),
        }
    }

    pub async fn start_p2p_network(&mut self, discovery_port: u16, public_key: String) -> Result<()> {
        println!("🚀 Starte vollständiges P2P-Netzwerk...");
        
        self.local_public_key = public_key;
        
        // Start UDP discovery
        self.start_udp_discovery(discovery_port).await?;
        
        // Start TCP server for incoming connections
        let port = self.port;
        tokio::spawn(async move {
            if let Err(e) = Self::start_tcp_server(port).await {
                eprintln!("Failed to start TCP server: {}", e);
            }
        });
        
        println!("✅ P2P-Netzwerk erfolgreich gestartet!");
        println!("   📡 Discovery Port: {}", discovery_port);
        println!("   🌐 Network Port: {}", self.port);
        
        Ok(())
    }

    async fn start_tcp_server(port: u16) -> Result<()> {
        let listener = TcpListener::bind(format!("0.0.0.0:{}", port)).await
            .context("Failed to bind to port")?;
        
        println!("🌐 Brezn P2P Server gestartet auf Port {}", port);
        
        loop {
            match listener.accept().await {
                Ok((socket, addr)) => {
                    println!("📡 Neue Verbindung von: {}", addr);
                    tokio::spawn(async move {
                        if let Err(e) = Self::handle_connection(socket).await {
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

    async fn handle_connection(mut socket: TcpStream) -> Result<()> {
        let mut buffer = Vec::new();
        let mut temp_buffer = [0u8; 1024];
        
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
                break;
            }
            
            buffer.extend_from_slice(&temp_buffer[..n]);
            
            // Try to parse complete messages
            while let Some(message) = Self::extract_message(&mut buffer)? {
                println!("📨 Nachricht erhalten: {}", message.message_type);
            }
        }
        
        Ok(())
    }

    fn extract_message(buffer: &mut Vec<u8>) -> Result<Option<NetworkMessage>> {
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
        
        buffer.drain(0..4 + length);
        
        Ok(Some(message))
    }

    async fn start_udp_discovery(&mut self, discovery_port: u16) -> Result<()> {
        self.discovery_port = discovery_port;
        
        let socket = UdpSocket::bind(format!("0.0.0.0:{}", discovery_port)).await
            .context("Failed to bind discovery socket")?;
        
        self.discovery_socket = Some(socket);
        
        // Start discovery listener
        let discovery_socket = self.discovery_socket.as_ref().unwrap().try_clone()?;
        
        tokio::spawn(async move {
            let mut buffer = [0u8; 1024];
            
            loop {
                match discovery_socket.recv_from(&mut buffer).await {
                    Ok((n, addr)) => {
                        if let Ok(message) = serde_json::from_slice::<DiscoveryMessage>(&buffer[..n]) {
                            println!("🔍 Discovery Nachricht von {}: {}", addr, message.message_type);
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

    pub async fn connect_to_peer(&mut self, address: &str, port: u16) -> Result<()> {
        let stream = TcpStream::connect(format!("{}:{}", address, port)).await
            .context("Failed to connect to peer")?;
        
        let peer_info = PeerInfo {
            node_id: format!("peer_{}:{}", address, port),
            public_key: box_::PublicKey([0u8; 32]),
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
        
        {
            let mut peers = self.peers.lock().unwrap();
            peers.insert(peer_info.node_id.clone(), peer_info);
        }
        
        tokio::spawn(async move {
            if let Err(e) = Self::handle_connection(stream).await {
                eprintln!("Peer connection handler error: {}", e);
            }
        });
        
        println!("🔗 Verbindung zu Peer {}:{} hergestellt", address, port);
        Ok(())
    }

    pub async fn broadcast_post(&self, post: &Post) -> Result<()> {
        let broadcast = PostBroadcast {
            post: post.clone(),
            broadcast_id: Uuid::new_v4().to_string(),
            ttl: 5,
            origin_node: self.local_node_id.clone(),
            broadcast_timestamp: chrono::Utc::now().timestamp() as u64,
        };
        
        {
            let mut cache = self.broadcast_cache.lock().unwrap();
            cache.insert(broadcast.broadcast_id.clone(), broadcast.clone());
        }
        
        let message = NetworkMessage {
            message_type: "post_broadcast".to_string(),
            payload: serde_json::to_value(&broadcast)?,
            timestamp: chrono::Utc::now().timestamp() as u64,
            node_id: self.local_node_id.clone(),
        };
        
        self.broadcast_message(&message).await
    }

    async fn broadcast_message(&self, message: &NetworkMessage) -> Result<()> {
        let peers = {
            let peers = self.peers.lock().unwrap();
            peers.values().cloned().collect::<Vec<_>>()
        };
        
        for peer in peers {
            if let Err(e) = self.send_message_to_peer(message, &peer).await {
                eprintln!("Failed to send message to {}: {}", peer.node_id, e);
            }
        }
        
        Ok(())
    }

    async fn send_message_to_peer(&self, message: &NetworkMessage, peer: &PeerInfo) -> Result<()> {
        let mut stream = TcpStream::connect(format!("{}:{}", peer.address, peer.port)).await
            .context("Failed to connect to peer")?;
        
        let message_data = serde_json::to_vec(message)?;
        let length = message_data.len() as u32;
        let length_bytes = length.to_be_bytes();
        
        stream.write_all(&length_bytes).await?;
        stream.write_all(&message_data).await?;
        
        Ok(())
    }

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
            unresolved_conflicts: self.post_conflicts.lock().unwrap().len(),
        }
    }

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

    pub fn get_topology(&self) -> NetworkTopology {
        self.topology.lock().unwrap().clone()
    }

    pub fn get_peers(&self) -> Vec<PeerInfo> {
        let peers = self.peers.lock().unwrap();
        peers.values().cloned().collect()
    }

    pub fn get_peers_by_quality(&self, quality: ConnectionQuality) -> Vec<PeerInfo> {
        let peers = self.peers.lock().unwrap();
        peers.values()
            .filter(|p| p.connection_quality == quality)
            .cloned()
            .collect()
    }

    pub fn remove_peer(&self, node_id: &str) {
        let mut peers = self.peers.lock().unwrap();
        peers.remove(node_id);
        println!("🗑️  Peer entfernt: {}", node_id);
    }

    pub fn get_node_id(&self) -> String {
        self.local_node_id.clone()
    }

    pub fn get_tor_status(&self) -> Option<TorStatus> {
        self.tor_manager.as_ref().map(|tm| tm.get_status())
    }

    pub fn is_tor_enabled(&self) -> bool {
        self.tor_enabled
    }

    pub async fn enable_tor(&mut self) -> Result<bool> {
        let mut tor_config = crate::tor::TorConfig::default();
        tor_config.socks_port = self.tor_socks_port;
        tor_config.enabled = true;
        
        let mut tor_manager = TorManager::new(tor_config);
        tor_manager.enable().await?;
        
        self.tor_manager = Some(tor_manager);
        self.tor_enabled = true;
        
        println!("🔒 Tor SOCKS5 Proxy aktiviert auf Port {}", self.tor_socks_port);
        Ok(true)
    }

    pub async fn sync_all_peers(&self) -> Result<()> {
        let peers = {
            let peers = self.peers.lock().unwrap();
            peers.values().cloned().collect::<Vec<_>>()
        };
        
        let peer_count = peers.len();
        for peer in peers {
            let sync_request = SyncRequest {
                requesting_node: self.local_node_id.clone(),
                last_known_timestamp: 0,
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
        
        println!("🔄 Synchronisation mit {} Peers abgeschlossen", peer_count);
        Ok(())
    }

    pub async fn get_unresolved_conflicts(&self) -> Result<Vec<PostConflict>> {
        let conflicts = self.post_conflicts.lock().unwrap();
        Ok(conflicts.values().cloned().collect())
    }

    pub async fn manually_resolve_conflict(&self, post_id: &str, strategy: ConflictResolutionStrategy) -> Result<()> {
        let mut conflicts = self.post_conflicts.lock().unwrap();
        
        if let Some(conflict) = conflicts.get_mut(post_id) {
            conflict.resolution_strategy = strategy;
            conflict.resolved_at = Some(chrono::Utc::now().timestamp() as u64);
            conflicts.remove(post_id);
        }
        
        Ok(())
    }
}

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
        if let Ok(mut db) = self.database_manager.lock() {
            if let Err(e) = db.add_post(post) {
                eprintln!("Failed to store post: {}", e);
            }
        }
        
        println!("📝 Post von {} verarbeitet: {}", post.pseudonym, post.content);
        Ok(())
    }
    
    fn handle_config(&self, _config: &Config) -> Result<()> {
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
            db.get_posts_with_conflicts(limit).map_err(|e| anyhow::anyhow!("Database error: {}", e))
        } else {
            Ok(Vec::new())
        }
    }
}

pub struct P2PNetworkExample {
    network_manager: NetworkManager,
}

impl P2PNetworkExample {
    pub fn new(network_port: u16, _discovery_port: u16) -> Self {
        let network_manager = NetworkManager::new(network_port, 9050);
        Self { network_manager }
    }
    
    pub async fn start(&mut self, public_key: String) -> Result<()> {
        println!("🚀 Starte Brezn P2P-Netzwerk...");
        
        self.network_manager.start_p2p_network(8888, public_key).await?;
        
        let database = Database::new()?;
        let handler = DefaultMessageHandler::new(
            self.network_manager.get_node_id(),
            Arc::new(Mutex::new(database))
        );
        
        println!("✅ Brezn P2P-Netzwerk erfolgreich gestartet!");
        Ok(())
    }
    
    pub async fn broadcast_post(&self, content: String, pseudonym: String) -> Result<()> {
        let post = Post::new(content, pseudonym, Some(self.network_manager.get_node_id()));
        
        println!("📤 Sende Post: {}", post.content);
        self.network_manager.broadcast_post(&post).await?;
        
        Ok(())
    }
    
    pub fn get_status(&self) -> NetworkStatus {
        self.network_manager.get_network_status()
    }
    
    pub async fn sync_all_peers(&self) -> Result<()> {
        println!("🔄 Starte Synchronisation mit allen Peers...");
        self.network_manager.sync_all_peers().await?;
        Ok(())
    }
    
    pub async fn get_conflicts(&self) -> Result<Vec<PostConflict>> {
        self.network_manager.get_unresolved_conflicts().await
    }
    
    pub async fn resolve_conflict(&self, post_id: &str, strategy: ConflictResolutionStrategy) -> Result<()> {
        self.network_manager.manually_resolve_conflict(post_id, strategy).await?;
        Ok(())
    }
    
    pub async fn enable_tor(&mut self) -> Result<()> {
        self.network_manager.enable_tor().await?;
        Ok(())
    }
    
    pub fn get_peers(&self) -> Vec<PeerInfo> {
        self.network_manager.get_peers()
    }
    
    pub async fn measure_latency(&self, node_id: &str) -> Result<u64> {
        // Simplified latency measurement
        Ok(50) // Return 50ms as default
    }
}