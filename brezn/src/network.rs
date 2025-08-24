use tokio::net::{TcpListener, TcpStream, UdpSocket};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use serde::{Serialize, Deserialize};
use serde_json;
use anyhow::{Result, Context};
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::time::{interval, sleep, timeout};
use crate::types::{
    Post, Config
};

use crate::crypto::CryptoManager;
use crate::tor::{TorManager, TorStatus};
use uuid::Uuid;
use std::net::SocketAddr;
use tokio::sync::mpsc;

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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PeerInfo {
    pub id: String,
    pub address: SocketAddr,
    pub public_key: String,
    pub last_seen: Instant,
    pub latency_ms: u64,
    pub connection_quality: ConnectionQuality,
    pub capabilities: Vec<String>,
    pub is_connected: bool,
    pub last_heartbeat: Instant,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum ConnectionQuality {
    Excellent, // < 50ms latency
    Good,      // 50-200ms latency
    Poor,      // > 200ms latency
    Unknown,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum NetworkMessage {
    // Heartbeat messages
    Ping { timestamp: u64, node_id: String },
    Pong { timestamp: u64, node_id: String, latency_ms: u64 },
    
    // Post synchronization
    PostSync { posts: Vec<Post>, request_id: String },
    PostSyncRequest { request_id: String, last_sync: u64 },
    PostSyncResponse { posts: Vec<Post>, request_id: String },
    
    // Peer management
    PeerJoin { node_id: String, public_key: String, capabilities: Vec<String> },
    PeerLeave { node_id: String, reason: String },
    PeerList { peers: Vec<PeerInfo> },
    
    // Discovery
    DiscoveryRequest { node_id: String, capabilities: Vec<String> },
    DiscoveryResponse { peers: Vec<PeerInfo> },
    
    // Error handling
    Error { code: u32, message: String, request_id: Option<String> },
}

pub struct NetworkManager {
    port: u16,
    tor_enabled: bool,
    tor_socks_port: u16,
    crypto: CryptoManager,
    peers: Arc<Mutex<HashMap<String, PeerInfo>>>,
    listener: Option<TcpListener>,
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
    
    // Message handling
    message_tx: mpsc::UnboundedSender<NetworkMessage>,
    message_rx: Option<mpsc::UnboundedReceiver<NetworkMessage>>,
    
    // Shutdown control
    shutdown_tx: tokio::sync::broadcast::Sender<()>,
    shutdown_rx: Option<tokio::sync::broadcast::Receiver<()>>,
}

impl NetworkManager {
    pub async fn new(
        config: &Config,
        crypto: CryptoManager,
        tor_manager: Option<TorManager>,
        discovery_manager: Option<Arc<Mutex<crate::discovery::DiscoveryManager>>>,
    ) -> Result<Self> {
        let (message_tx, message_rx) = mpsc::unbounded_channel();
        let (shutdown_tx, shutdown_rx) = tokio::sync::broadcast::channel(1);
        
        let node_id = Uuid::new_v4().to_string();
        let topology = NetworkTopology {
            node_id: node_id.clone(),
            connections: HashSet::new(),
            routing_table: HashMap::new(),
            network_segments: vec![],
            topology_version: 1,
        };

        Ok(Self {
            port: config.network_port,
            tor_enabled: config.tor_enabled,
            tor_socks_port: config.tor_socks_port,
            crypto,
            peers: Arc::new(Mutex::new(HashMap::new())),
            listener: None,
            tor_manager,
            request_cooldowns: Arc::new(Mutex::new(HashMap::new())),
            topology: Arc::new(Mutex::new(topology)),
            discovery_manager,
            discovery_socket: None,
            discovery_port: config.discovery_port,
            heartbeat_interval: Duration::from_secs(config.heartbeat_interval),
            peer_timeout: Duration::from_secs(30),
            max_peers: config.max_peers,
            message_tx,
            message_rx: Some(message_rx),
            shutdown_tx,
            shutdown_rx: Some(shutdown_rx),
        })
    }

    pub async fn start(&mut self) -> Result<()> {
        log::info!("Starting P2P network on port {}", self.port);
        
        // Start TCP listener
        let listener = TcpListener::bind(format!("0.0.0.0:{}", self.port)).await
            .context("Failed to bind TCP listener")?;
        self.listener = Some(listener);
        
        // Start message handling loop
        let message_rx = self.message_rx.take().unwrap();
        let shutdown_rx = self.shutdown_rx.take().unwrap();
        let peers = self.peers.clone();
        let topology = self.topology.clone();
        
        tokio::spawn(async move {
            Self::message_handling_loop(message_rx, shutdown_rx, peers, topology).await;
        });
        
        // Start connection acceptance loop
        let listener = self.listener.as_ref().unwrap().clone();
        let peers = self.peers.clone();
        let message_tx = self.message_tx.clone();
        let shutdown_rx = self.shutdown_rx.as_ref().unwrap().resubscribe();
        
        tokio::spawn(async move {
            Self::accept_connections_loop(listener, peers, message_tx, shutdown_rx).await;
        });
        
        // Start heartbeat loop
        let peers = self.peers.clone();
        let message_tx = self.message_tx.clone();
        let heartbeat_interval = self.heartbeat_interval;
        let shutdown_rx = self.shutdown_rx.as_ref().unwrap().resubscribe();
        
        tokio::spawn(async move {
            Self::heartbeat_loop(peers, message_tx, heartbeat_interval, shutdown_rx).await;
        });
        
        // Start peer cleanup loop
        let peers = self.peers.clone();
        let peer_timeout = self.peer_timeout;
        let shutdown_rx = self.shutdown_rx.as_ref().unwrap().resubscribe();
        
        tokio::spawn(async move {
            Self::peer_cleanup_loop(peers, peer_timeout, shutdown_rx).await;
        });
        
        log::info!("P2P network started successfully");
        Ok(())
    }

    pub async fn stop(&mut self) -> Result<()> {
        log::info!("Stopping P2P network");
        
        // Send shutdown signal
        let _ = self.shutdown_tx.send(());
        
        // Close listener
        if let Some(listener) = self.listener.take() {
            drop(listener);
        }
        
        // Close all peer connections
        let mut peers = self.peers.lock().unwrap();
        for peer in peers.values_mut() {
            peer.is_connected = false;
        }
        peers.clear();
        
        log::info!("P2P network stopped");
        Ok(())
    }

    pub async fn connect_to_peer(&self, address: &str) -> Result<()> {
        let addr: SocketAddr = address.parse()
            .context("Invalid peer address")?;
        
        log::info!("Connecting to peer at {}", addr);
        
        let stream = timeout(Duration::from_secs(10), TcpStream::connect(addr)).await
            .context("Connection timeout")?
            .context("Failed to connect to peer")?;
        
        // Perform handshake
        let peer_info = self.perform_handshake(stream, addr).await?;
        
        // Add peer to our list
        let mut peers = self.peers.lock().unwrap();
        if peers.len() < self.max_peers {
            peers.insert(peer_info.id.clone(), peer_info);
            log::info!("Successfully connected to peer {}", addr);
        } else {
            log::warn!("Maximum peer limit reached, rejecting connection");
        }
        
        Ok(())
    }

    pub async fn broadcast_post(&self, post: &Post) -> Result<()> {
        let message = NetworkMessage::PostSync {
            posts: vec![post.clone()],
            request_id: Uuid::new_v4().to_string(),
        };
        
        let peers = self.peers.lock().unwrap();
        let active_peers: Vec<_> = peers.values()
            .filter(|p| p.is_connected)
            .collect();
        
        log::info!("Broadcasting post to {} active peers", active_peers.len());
        
        // In a real implementation, we would send the message to all peers
        // For now, we'll just log the broadcast
        for peer in active_peers {
            log::debug!("Broadcasting to peer {} at {}", peer.id, peer.address);
        }
        
        Ok(())
    }

    pub async fn get_network_status(&self) -> NetworkStatus {
        let peers = self.peers.lock().unwrap();
        let topology = self.topology.lock().unwrap();
        
        let stats = NetworkStats {
            total_peers: peers.len(),
            active_peers: peers.values().filter(|p| p.is_connected).count(),
            excellent_connections: peers.values().filter(|p| p.connection_quality == ConnectionQuality::Excellent).count(),
            good_connections: peers.values().filter(|p| p.connection_quality == ConnectionQuality::Good).count(),
            poor_connections: peers.values().filter(|p| p.connection_quality == ConnectionQuality::Poor).count(),
            avg_latency_ms: peers.values().map(|p| p.latency_ms).sum::<u64>() / peers.len().max(1) as u64,
            segments_count: topology.network_segments.len(),
            topology_version: topology.topology_version,
        };
        
        NetworkStatus {
            node_id: topology.node_id.clone(),
            discovery_active: self.discovery_socket.is_some(),
            discovery_port: self.discovery_port,
            network_port: self.port,
            tor_enabled: self.tor_enabled,
            tor_status: None, // Will be populated from TorManager
            stats,
            topology: topology.clone(),
            peer_count: peers.len(),
            unresolved_conflicts: 0, // Will be implemented in conflict resolution
        }
    }

    async fn perform_handshake(&self, mut stream: TcpStream, addr: SocketAddr) -> Result<PeerInfo> {
        // Send our node ID and public key
        let handshake = serde_json::json!({
            "node_id": Uuid::new_v4().to_string(),
            "public_key": "placeholder_key", // Will use real crypto
            "capabilities": vec!["post_sync", "discovery", "heartbeat"],
            "timestamp": chrono::Utc::now().timestamp()
        });
        
        let handshake_data = serde_json::to_string(&handshake)?;
        stream.write_all(handshake_data.as_bytes()).await?;
        
        // Read response
        let mut buffer = [0; 1024];
        let n = stream.read(&mut buffer).await?;
        let response: serde_json::Value = serde_json::from_slice(&buffer[..n])?;
        
        let peer_info = PeerInfo {
            id: response["node_id"].as_str().unwrap_or("unknown").to_string(),
            address: addr,
            public_key: response["public_key"].as_str().unwrap_or("").to_string(),
            last_seen: Instant::now(),
            latency_ms: 0, // Will be measured during heartbeat
            connection_quality: ConnectionQuality::Unknown,
            capabilities: response["capabilities"].as_array()
                .unwrap_or(&vec![])
                .iter()
                .filter_map(|v| v.as_str())
                .map(|s| s.to_string())
                .collect(),
            is_connected: true,
            last_heartbeat: Instant::now(),
        };
        
        Ok(peer_info)
    }

    async fn message_handling_loop(
        mut message_rx: mpsc::UnboundedReceiver<NetworkMessage>,
        mut shutdown_rx: tokio::sync::broadcast::Receiver<()>,
        peers: Arc<Mutex<HashMap<String, PeerInfo>>>,
        topology: Arc<Mutex<NetworkTopology>>,
    ) {
        loop {
            tokio::select! {
                message = message_rx.recv() => {
                    match message {
                        Some(msg) => {
                            if let Err(e) = Self::handle_message(msg, &peers, &topology).await {
                                log::error!("Error handling message: {}", e);
                            }
                        }
                        None => break,
                    }
                }
                _ = shutdown_rx.recv() => {
                    log::info!("Message handling loop shutting down");
                    break;
                }
            }
        }
    }

    async fn accept_connections_loop(
        mut listener: TcpListener,
        peers: Arc<Mutex<HashMap<String, PeerInfo>>>,
        message_tx: mpsc::UnboundedSender<NetworkMessage>,
        mut shutdown_rx: tokio::sync::broadcast::Receiver<()>,
    ) {
        loop {
            tokio::select! {
                accept_result = listener.accept().await => {
                    match accept_result {
                        Ok((stream, addr)) => {
                            log::info!("New peer connection from {}", addr);
                            
                            let peers = peers.clone();
                            let message_tx = message_tx.clone();
                            
                            tokio::spawn(async move {
                                if let Err(e) = Self::handle_peer_connection(stream, addr, peers, message_tx).await {
                                    log::error!("Error handling peer connection: {}", e);
                                }
                            });
                        }
                        Err(e) => {
                            log::error!("Error accepting connection: {}", e);
                        }
                    }
                }
                _ = shutdown_rx.recv() => {
                    log::info!("Connection acceptance loop shutting down");
                    break;
                }
            }
        }
    }

    async fn heartbeat_loop(
        peers: Arc<Mutex<HashMap<String, PeerInfo>>>,
        message_tx: mpsc::UnboundedSender<NetworkMessage>,
        heartbeat_interval: Duration,
        mut shutdown_rx: tokio::sync::broadcast::Receiver<()>,
    ) {
        let mut interval = tokio::time::interval(heartbeat_interval);
        
        loop {
            tokio::select! {
                _ = interval.tick() => {
                    let peers = peers.lock().unwrap();
                    let active_peers: Vec<_> = peers.values()
                        .filter(|p| p.is_connected)
                        .collect();
                    
                    for peer in active_peers {
                        let ping = NetworkMessage::Ping {
                            timestamp: chrono::Utc::now().timestamp() as u64,
                            node_id: peer.id.clone(),
                        };
                        
                        if let Err(e) = message_tx.send(ping) {
                            log::error!("Failed to send heartbeat to peer {}: {}", peer.id, e);
                        }
                    }
                }
                _ = shutdown_rx.recv() => {
                    log::info!("Heartbeat loop shutting down");
                    break;
                }
            }
        }
    }

    async fn peer_cleanup_loop(
        peers: Arc<Mutex<HashMap<String, PeerInfo>>>,
        peer_timeout: Duration,
        mut shutdown_rx: tokio::sync::broadcast::Receiver<()>,
    ) {
        let mut interval = tokio::time::interval(Duration::from_secs(60));
        
        loop {
            tokio::select! {
                _ = interval.tick() => {
                    let mut peers = peers.lock().unwrap();
                    let now = Instant::now();
                    let mut to_remove = Vec::new();
                    
                    for (id, peer) in peers.iter() {
                        if now.duration_since(peer.last_seen) > peer_timeout {
                            to_remove.push(id.clone());
                        }
                    }
                    
                    for id in to_remove {
                        log::info!("Removing inactive peer {}", id);
                        peers.remove(&id);
                    }
                }
                _ = shutdown_rx.recv() => {
                    log::info!("Peer cleanup loop shutting down");
                    break;
                }
            }
        }
    }

    async fn handle_peer_connection(
        mut stream: TcpStream,
        addr: SocketAddr,
        peers: Arc<Mutex<HashMap<String, PeerInfo>>>,
        message_tx: mpsc::UnboundedSender<NetworkMessage>,
    ) -> Result<()> {
        // Handle incoming peer connection
        // This would include handshake, message processing, etc.
        log::debug!("Handling peer connection from {}", addr);
        
        // For now, we'll just keep the connection open
        // In a real implementation, this would handle message exchange
        
        Ok(())
    }

    async fn handle_message(
        message: NetworkMessage,
        peers: &Arc<Mutex<HashMap<String, PeerInfo>>>,
        topology: &Arc<Mutex<NetworkTopology>>,
    ) -> Result<()> {
        match message {
            NetworkMessage::Ping { timestamp, node_id } => {
                log::debug!("Received ping from peer {}", node_id);
                // Send pong response
            }
            NetworkMessage::Pong { timestamp, node_id, latency_ms } => {
                log::debug!("Received pong from peer {} with latency {}ms", node_id, latency_ms);
                // Update peer latency
            }
            NetworkMessage::PostSync { posts, request_id } => {
                log::info!("Received post sync with {} posts from request {}", posts.len(), request_id);
                // Process incoming posts
            }
            NetworkMessage::PeerJoin { node_id, public_key, capabilities } => {
                log::info!("Peer {} joining network", node_id);
                // Handle new peer
            }
            NetworkMessage::PeerLeave { node_id, reason } => {
                log::info!("Peer {} leaving network: {}", node_id, reason);
                // Handle peer departure
            }
            _ => {
                log::debug!("Received message: {:?}", message);
            }
        }
        
        Ok(())
    }
}

// ... existing code ...