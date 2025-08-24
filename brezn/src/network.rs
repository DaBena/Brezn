use crate::error::{Result, BreznError};
use crate::types::{NetworkMessage, Post, PeerInfo, NetworkStatus};
use crate::database::Database;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::net::{TcpListener, TcpStream};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::time::{interval, Duration, timeout};
use serde_json;
use uuid::Uuid;

pub struct NetworkManager {
    node_id: String,
    port: u16,
    peers: Arc<Mutex<HashMap<String, PeerInfo>>>,
    database: Arc<Database>,
    is_running: Arc<Mutex<bool>>,
    stats: Arc<Mutex<NetworkStatus>>,
}

impl NetworkManager {
    pub fn new(port: u16, database: Arc<Database>) -> Self {
        Self {
            node_id: Uuid::new_v4().to_string(),
            port,
            peers: Arc::new(Mutex::new(HashMap::new())),
            database,
            is_running: Arc::new(Mutex::new(false)),
            stats: Arc::new(Mutex::new(NetworkStatus {
                is_enabled: false,
                peer_count: 0,
                last_sync: None,
                bytes_sent: 0,
                bytes_received: 0,
            })),
        }
    }

    pub async fn start(&self) -> Result<()> {
        {
            let mut running = self.is_running.lock().unwrap();
            if *running {
                return Ok(());
            }
            *running = true;
        }

        {
            let mut stats = self.stats.lock().unwrap();
            stats.is_enabled = true;
        }

        println!("🌐 P2P Network starting on port {}", self.port);

        // Start TCP server
        let listener = TcpListener::bind(format!("0.0.0.0:{}", self.port)).await
            .map_err(|e| BreznError::Network(format!("Failed to bind to port {}: {}", self.port, e)))?;

        let peers = self.peers.clone();
        let database = self.database.clone();
        let node_id = self.node_id.clone();
        let stats = self.stats.clone();

        tokio::spawn(async move {
            while let Ok((stream, addr)) = listener.accept().await {
                println!("📡 New peer connection from {}", addr);
                let peers = peers.clone();
                let database = database.clone();
                let node_id = node_id.clone();
                let stats = stats.clone();
                
                tokio::spawn(async move {
                    if let Err(e) = Self::handle_peer_connection(stream, peers, database, node_id, stats).await {
                        eprintln!("Error handling peer connection: {}", e);
                    }
                });
            }
        });

        // Start heartbeat system
        self.start_heartbeat().await;

        // Start peer discovery
        self.start_discovery().await;

        println!("✅ P2P Network started successfully");
        Ok(())
    }

    async fn handle_peer_connection(
        mut stream: TcpStream,
        peers: Arc<Mutex<HashMap<String, PeerInfo>>>,
        database: Arc<Database>,
        node_id: String,
        stats: Arc<Mutex<NetworkStatus>>,
    ) -> Result<()> {
        let mut buffer = [0; 8192];
        
        loop {
            match timeout(Duration::from_secs(30), stream.read(&mut buffer)).await {
                Ok(Ok(0)) => break, // Connection closed
                Ok(Ok(n)) => {
                    let data = &buffer[..n];
                    
                    // Update stats
                    {
                        let mut stats = stats.lock().unwrap();
                        stats.bytes_received += n as u64;
                    }
                    
                    if let Ok(message) = serde_json::from_slice::<NetworkMessage>(data) {
                        if let Err(e) = Self::handle_message(
                            message,
                            &mut stream,
                            &peers,
                            &database,
                            &node_id,
                            &stats
                        ).await {
                            eprintln!("Error handling message: {}", e);
                        }
                    }
                }
                Ok(Err(e)) => {
                    eprintln!("Read error: {}", e);
                    break;
                }
                Err(_) => {
                    eprintln!("Connection timeout");
                    break;
                }
            }
        }
        
        Ok(())
    }

    async fn handle_message(
        message: NetworkMessage,
        stream: &mut TcpStream,
        peers: &Arc<Mutex<HashMap<String, PeerInfo>>>,
        database: &Arc<Database>,
        node_id: &str,
        stats: &Arc<Mutex<NetworkStatus>>,
    ) -> Result<()> {
        match message {
            NetworkMessage::Ping { node_id: _peer_id, timestamp } => {
                // Respond with Pong
                let pong = NetworkMessage::Pong {
                    node_id: node_id.to_string(),
                    timestamp,
                };
                let response = serde_json::to_vec(&pong)?;
                stream.write_all(&response).await
                    .map_err(|e| BreznError::Network(format!("Failed to send pong: {}", e)))?;
                
                // Update stats
                {
                    let mut stats = stats.lock().unwrap();
                    stats.bytes_sent += response.len() as u64;
                }
            }
            
            NetworkMessage::Pong { node_id: peer_id, .. } => {
                println!("📡 Received pong from {}", peer_id);
                // Update peer last seen
                let mut peers = peers.lock().unwrap();
                if let Some(peer) = peers.get_mut(&peer_id) {
                    peer.last_seen = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
                    peer.is_connected = true;
                }
            }
            
            NetworkMessage::PostBroadcast { post } => {
                println!("📝 Received post broadcast: {}", post.content);
                // Store the post
                if let Err(e) = database.create_post(&post) {
                    eprintln!("Failed to store broadcasted post: {}", e);
                }
                
                // Forward to other peers (simple flooding)
                Self::broadcast_to_peers(&post, peers, node_id, stats).await;
            }
            
            NetworkMessage::PeerRequest => {
                // Send our peer list
                let peers_list: Vec<PeerInfo> = {
                    let peers = peers.lock().unwrap();
                    peers.values().cloned().collect()
                };
                
                let response = NetworkMessage::PeerResponse { peers: peers_list };
                let response_data = serde_json::to_vec(&response)?;
                stream.write_all(&response_data).await
                    .map_err(|e| BreznError::Network(format!("Failed to send peer response: {}", e)))?;
                
                // Update stats
                {
                    let mut stats = stats.lock().unwrap();
                    stats.bytes_sent += response_data.len() as u64;
                }
            }
            
            NetworkMessage::PeerResponse { peers: peer_list } => {
                println!("📡 Received {} peers", peer_list.len());
                // Add new peers to our list
                {
                    let mut peers = peers.lock().unwrap();
                    for peer in peer_list {
                        peers.insert(peer.node_id.clone(), peer);
                    }
                    
                    // Update stats
                    let mut stats = stats.lock().unwrap();
                    stats.peer_count = peers.len();
                }
            }
        }
        Ok(())
    }

    async fn broadcast_to_peers(
        post: &Post,
        peers: &Arc<Mutex<HashMap<String, PeerInfo>>>,
        node_id: &str,
        stats: &Arc<Mutex<NetworkStatus>>,
    ) {
        let peers_list: Vec<PeerInfo> = {
            let peers = peers.lock().unwrap();
            peers.values().filter(|p| p.is_connected && p.node_id != node_id).cloned().collect()
        };

        let message = NetworkMessage::PostBroadcast { post: post.clone() };
        let message_data = match serde_json::to_vec(&message) {
            Ok(data) => data,
            Err(e) => {
                eprintln!("Failed to serialize broadcast message: {}", e);
                return;
            }
        };

        for peer in peers_list {
            let address = format!("{}:{}", peer.address, peer.port);
            let message_data = message_data.clone();
            let stats = stats.clone();
            
            tokio::spawn(async move {
                if let Ok(mut stream) = TcpStream::connect(&address).await {
                    if let Err(e) = stream.write_all(&message_data).await {
                        eprintln!("Failed to broadcast to {}: {}", address, e);
                    } else {
                        // Update stats
                        let mut stats = stats.lock().unwrap();
                        stats.bytes_sent += message_data.len() as u64;
                    }
                }
            });
        }
    }

    async fn start_heartbeat(&self) {
        let peers = self.peers.clone();
        let node_id = self.node_id.clone();
        let stats = self.stats.clone();
        
        tokio::spawn(async move {
            let mut interval = interval(Duration::from_secs(30));
            
            loop {
                interval.tick().await;
                
                let peers_list: Vec<PeerInfo> = {
                    let peers = peers.lock().unwrap();
                    peers.values().cloned().collect()
                };

                for peer in peers_list {
                    let ping = NetworkMessage::Ping {
                        node_id: node_id.clone(),
                        timestamp: SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs(),
                    };
                    
                    let address = format!("{}:{}", peer.address, peer.port);
                    let ping_data = match serde_json::to_vec(&ping) {
                        Ok(data) => data,
                        Err(_) => continue,
                    };
                    
                    let stats = stats.clone();
                    tokio::spawn(async move {
                        if let Ok(mut stream) = TcpStream::connect(&address).await {
                            if let Err(_) = stream.write_all(&ping_data).await {
                                // Peer is unreachable
                            } else {
                                // Update stats
                                let mut stats = stats.lock().unwrap();
                                stats.bytes_sent += ping_data.len() as u64;
                            }
                        }
                    });
                }
            }
        });
    }

    async fn start_discovery(&self) {
        let _peers = self.peers.clone();
        
        tokio::spawn(async move {
            let mut interval = interval(Duration::from_secs(60));
            
            loop {
                interval.tick().await;
                
                // Simple discovery: try to connect to localhost on common ports
                for port in [8888, 8889, 8890] {
                    let address = format!("127.0.0.1:{}", port);
                    
                    if let Ok(mut stream) = TcpStream::connect(&address).await {
                        let request = NetworkMessage::PeerRequest;
                        if let Ok(request_data) = serde_json::to_vec(&request) {
                            let _ = stream.write_all(&request_data).await;
                        }
                    }
                }
            }
        });
    }

    pub async fn broadcast_post(&self, post: &Post) -> Result<()> {
        println!("📢 Broadcasting post: {}", post.content);
        
        let peers_list: Vec<PeerInfo> = {
            let peers = self.peers.lock().unwrap();
            peers.values().filter(|p| p.is_connected).cloned().collect()
        };

        if peers_list.is_empty() {
            println!("⚠️  No connected peers to broadcast to");
            return Ok(());
        }

        let message = NetworkMessage::PostBroadcast { post: post.clone() };
        let message_data = serde_json::to_vec(&message)?;

        for peer in peers_list {
            let address = format!("{}:{}", peer.address, peer.port);
            let message_data = message_data.clone();
            let stats = self.stats.clone();
            
            tokio::spawn(async move {
                if let Ok(mut stream) = TcpStream::connect(&address).await {
                    if let Err(e) = stream.write_all(&message_data).await {
                        eprintln!("Failed to broadcast to {}: {}", address, e);
                    } else {
                        println!("✅ Broadcasted to {}", address);
                        // Update stats
                        let mut stats = stats.lock().unwrap();
                        stats.bytes_sent += message_data.len() as u64;
                    }
                }
            });
        }

        Ok(())
    }

    pub async fn connect_to_peer(&self, address: &str, port: u16) -> Result<()> {
        let full_address = format!("{}:{}", address, port);
        println!("🔗 Connecting to peer at {}", full_address);

        let mut stream = TcpStream::connect(&full_address).await
            .map_err(|e| BreznError::Network(format!("Failed to connect to {}: {}", full_address, e)))?;

        // Send peer request to get their peer list
        let request = NetworkMessage::PeerRequest;
        let request_data = serde_json::to_vec(&request)?;
        stream.write_all(&request_data).await
            .map_err(|e| BreznError::Network(format!("Failed to send peer request: {}", e)))?;

        // Add this peer to our list
        {
            let mut peers = self.peers.lock().unwrap();
            let peer_id = format!("{}:{}", address, port);
            peers.insert(peer_id.clone(), PeerInfo {
                node_id: peer_id,
                address: address.to_string(),
                port,
                last_seen: SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs(),
                is_connected: true,
            });
            
            // Update stats
            let mut stats = self.stats.lock().unwrap();
            stats.peer_count = peers.len();
        }

        println!("✅ Connected to peer {}", full_address);
        Ok(())
    }

    pub fn get_network_status(&self) -> NetworkStatus {
        let mut stats = self.stats.lock().unwrap();
        let peers = self.peers.lock().unwrap();
        stats.peer_count = peers.len();
        stats.last_sync = Some(SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs());
        stats.clone()
    }

    pub fn get_peers(&self) -> Vec<PeerInfo> {
        let peers = self.peers.lock().unwrap();
        peers.values().cloned().collect()
    }

    pub async fn stop(&self) -> Result<()> {
        let mut running = self.is_running.lock().unwrap();
        *running = false;
        
        let mut stats = self.stats.lock().unwrap();
        stats.is_enabled = false;
        
        println!("🛑 P2P Network stopped");
        Ok(())
    }

    pub fn get_node_id(&self) -> &str {
        &self.node_id
    }
}