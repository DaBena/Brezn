use tokio::net::UdpSocket;
use std::net::SocketAddr;
use std::collections::HashMap;
use tokio::sync::RwLock;
use std::sync::Arc;
use anyhow::Result;
use serde::{Serialize, Deserialize};
use chrono::{DateTime, Utc};

use crate::types::PeerInfo;

#[derive(Debug, Serialize, Deserialize)]
pub struct DiscoveryMessage {
    pub node_id: String,
    pub network_port: u16,
    pub timestamp: DateTime<Utc>,
}

pub struct DiscoveryManager {
    port: u16,
    peers: Arc<RwLock<HashMap<String, PeerInfo>>>,
}

impl DiscoveryManager {
    pub fn new(port: u16) -> Self {
        Self {
            port,
            peers: Arc::new(RwLock::new(HashMap::new())),
        }
    }
    
    pub async fn start(&mut self) -> Result<()> {
        let socket = UdpSocket::bind(format!("0.0.0.0:{}", self.port)).await?;
        let peers = self.peers.clone();
        
        // Start discovery listener
        tokio::spawn(async move {
            let mut buf = vec![0u8; 1024];
            
            loop {
                if let Ok((len, addr)) = socket.recv_from(&mut buf).await {
                    if let Ok(msg) = serde_json::from_slice::<DiscoveryMessage>(&buf[..len]) {
                        log::info!("Discovered peer {} at {}", msg.node_id, addr);
                        
                        let peer_info = PeerInfo {
                            node_id: msg.node_id.clone(),
                            address: format!("{}:{}", addr.ip(), msg.network_port),
                            last_seen: Utc::now(),
                        };
                        
                        peers.write().await.insert(msg.node_id, peer_info);
                    }
                }
            }
        });
        
        Ok(())
    }
    
    pub async fn broadcast_presence(&self, node_id: &str, network_port: u16) -> Result<()> {
        let socket = UdpSocket::bind("0.0.0.0:0").await?;
        socket.set_broadcast(true)?;
        
        let msg = DiscoveryMessage {
            node_id: node_id.to_string(),
            network_port,
            timestamp: Utc::now(),
        };
        
        let data = serde_json::to_vec(&msg)?;
        let broadcast_addr: SocketAddr = format!("255.255.255.255:{}", self.port).parse()?;
        
        socket.send_to(&data, broadcast_addr).await?;
        
        Ok(())
    }
    
    pub async fn get_peers(&self) -> Vec<PeerInfo> {
        self.peers.read().await.values().cloned().collect()
    }
}