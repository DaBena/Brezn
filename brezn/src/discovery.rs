use crate::error::{Result, BreznError};
use crate::types::PeerInfo;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::net::UdpSocket;
use tokio::time::{interval, Duration};
use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveryMessage {
    pub message_type: String,
    pub node_id: String,
    pub address: String,
    pub port: u16,
    pub timestamp: u64,
    pub capabilities: Vec<String>,
}

pub struct DiscoveryManager {
    node_id: String,
    discovery_port: u16,
    network_port: u16,
    peers: Arc<Mutex<HashMap<String, PeerInfo>>>,
    socket: Option<Arc<UdpSocket>>,
}

impl DiscoveryManager {
    pub fn new(node_id: String, discovery_port: u16, network_port: u16) -> Self {
        Self {
            node_id,
            discovery_port,
            network_port,
            peers: Arc::new(Mutex::new(HashMap::new())),
            socket: None,
        }
    }

    pub async fn start(&mut self) -> Result<()> {
        println!("🔍 Starting discovery on port {}", self.discovery_port);

        let socket = UdpSocket::bind(format!("0.0.0.0:{}", self.discovery_port)).await
            .map_err(|e| BreznError::Discovery(format!("Failed to bind discovery port: {}", e)))?;
        
        let socket = Arc::new(socket);
        self.socket = Some(socket.clone());

        self.start_listener(socket.clone()).await;
        self.start_announcements(socket.clone()).await;
        self.start_peer_cleanup().await;

        println!("✅ Discovery service started");
        Ok(())
    }

    async fn start_listener(&self, socket: Arc<UdpSocket>) {
        let peers = self.peers.clone();
        let node_id = self.node_id.clone();
        let network_port = self.network_port;

        tokio::spawn(async move {
            let mut buffer = [0; 1024];
            
            loop {
                match socket.recv_from(&mut buffer).await {
                    Ok((len, addr)) => {
                        if let Ok(message_str) = std::str::from_utf8(&buffer[..len]) {
                            if let Ok(message) = serde_json::from_str::<DiscoveryMessage>(message_str) {
                                if message.node_id == node_id {
                                    continue;
                                }

                                match message.message_type.as_str() {
                                    "announce" => {
                                        {
                                            let mut peers = peers.lock().unwrap();
                                            peers.insert(message.node_id.clone(), PeerInfo {
                                                node_id: message.node_id.clone(),
                                                address: message.address.clone(),
                                                port: message.port,
                                                last_seen: SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs(),
                                                is_connected: false,
                                            });
                                        } // Drop the lock here

                                        let response = DiscoveryMessage {
                                            message_type: "response".to_string(),
                                            node_id: node_id.clone(),
                                            address: Self::get_local_ip().unwrap_or_else(|_| "127.0.0.1".to_string()),
                                            port: network_port,
                                            timestamp: SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs(),
                                            capabilities: vec!["post_sync".to_string()],
                                        };

                                        if let Ok(response_data) = serde_json::to_string(&response) {
                                            let _ = socket.send_to(response_data.as_bytes(), addr).await;
                                        }
                                    }
                                    "response" => {
                                        let mut peers = peers.lock().unwrap();
                                        peers.insert(message.node_id.clone(), PeerInfo {
                                            node_id: message.node_id.clone(),
                                            address: message.address.clone(),
                                            port: message.port,
                                            last_seen: SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs(),
                                            is_connected: false,
                                        });
                                    }
                                    _ => {}
                                }
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("Discovery socket error: {}", e);
                        tokio::time::sleep(Duration::from_secs(1)).await;
                    }
                }
            }
        });
    }

    async fn start_announcements(&self, socket: Arc<UdpSocket>) {
        let node_id = self.node_id.clone();
        let network_port = self.network_port;

        tokio::spawn(async move {
            let mut interval = interval(Duration::from_secs(30));
            
            loop {
                interval.tick().await;

                let announce_message = DiscoveryMessage {
                    message_type: "announce".to_string(),
                    node_id: node_id.clone(),
                    address: Self::get_local_ip().unwrap_or_else(|_| "127.0.0.1".to_string()),
                    port: network_port,
                    timestamp: SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs(),
                    capabilities: vec!["post_sync".to_string()],
                };

                if let Ok(announce_data) = serde_json::to_string(&announce_message) {
                    for port in [8889, 8890, 8891] {
                        let target = format!("127.0.0.1:{}", port);
                        if let Ok(target_addr) = target.parse::<std::net::SocketAddr>() {
                            let _ = socket.send_to(announce_data.as_bytes(), target_addr).await;
                        }
                    }
                }
            }
        });
    }

    async fn start_peer_cleanup(&self) {
        let peers = self.peers.clone();

        tokio::spawn(async move {
            let mut interval = interval(Duration::from_secs(120));
            
            loop {
                interval.tick().await;
                let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
                let timeout = 300;

                let mut peers = peers.lock().unwrap();
                peers.retain(|_, peer| now - peer.last_seen < timeout);
            }
        });
    }

    pub fn get_peers(&self) -> Vec<PeerInfo> {
        let peers = self.peers.lock().unwrap();
        peers.values().cloned().collect()
    }

    pub fn get_peer_count(&self) -> usize {
        let peers = self.peers.lock().unwrap();
        peers.len()
    }

    fn get_local_ip() -> Result<String> {
        let interfaces = get_if_addrs::get_if_addrs()
            .map_err(|e| BreznError::Discovery(format!("Failed to get network interfaces: {}", e)))?;

        for interface in interfaces {
            if !interface.is_loopback() {
                if let std::net::IpAddr::V4(ipv4) = interface.ip() {
                    return Ok(ipv4.to_string());
                }
            }
        }
        Ok("127.0.0.1".to_string())
    }

    pub async fn stop(&mut self) -> Result<()> {
        self.socket = None;
        println!("🛑 Discovery service stopped");
        Ok(())
    }
}