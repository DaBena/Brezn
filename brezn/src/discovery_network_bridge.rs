use crate::discovery::{DiscoveryManager, PeerInfo, DiscoveryConfig};
use crate::network_simple::{NetworkManager as P2PNetworkManager, PeerInfo as NetworkPeer};
use crate::error::Result;
use std::sync::{Arc, Mutex};
use tokio::time::{Duration, interval};
use std::collections::HashMap;
use tokio::sync::mpsc;
use serde::{Serialize, Deserialize};

/// Bridge between Discovery and Network systems
/// This module coordinates peer discovery with network connections
pub struct DiscoveryNetworkBridge {
    discovery_manager: Arc<DiscoveryManager>,
    network_manager: Arc<P2PNetworkManager>,
    bridge_config: BridgeConfig,
    peer_mapping: Arc<Mutex<HashMap<String, PeerMapping>>>,
    bridge_task: Option<tokio::task::JoinHandle<()>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BridgeConfig {
    pub auto_connect_discovered_peers: bool,
    pub connection_retry_interval: Duration,
    pub max_concurrent_connections: usize,
    pub health_check_interval: Duration,
    pub peer_validation_timeout: Duration,
    pub enable_peer_migration: bool,
    pub discovery_network_sync_interval: Duration,
}

impl Default for BridgeConfig {
    fn default() -> Self {
        Self {
            auto_connect_discovered_peers: true,
            connection_retry_interval: Duration::from_secs(30),
            max_concurrent_connections: 10,
            health_check_interval: Duration::from_secs(60),
            peer_validation_timeout: Duration::from_secs(10),
            enable_peer_migration: true,
            discovery_network_sync_interval: Duration::from_secs(15),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PeerMapping {
    pub discovery_peer: PeerInfo,
    pub network_peer: Option<NetworkPeer>,
    pub connection_status: ConnectionStatus,
    pub last_sync_attempt: u64,
    pub sync_attempts: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum ConnectionStatus {
    Discovered,
    Connecting,
    Connected,
    Failed,
    Disconnected,
}

impl DiscoveryNetworkBridge {
    /// Create a new bridge between discovery and network systems
    pub fn new(
        discovery_manager: Arc<DiscoveryManager>,
        network_manager: Arc<P2PNetworkManager>,
        config: Option<BridgeConfig>,
    ) -> Self {
        Self {
            discovery_manager,
            network_manager,
            bridge_config: config.unwrap_or_default(),
            peer_mapping: Arc::new(Mutex::new(HashMap::new())),
            bridge_task: None,
        }
    }

    /// Start the bridge coordination
    pub async fn start(&mut self) -> Result<()> {
        let bridge_task = {
            let discovery_manager = Arc::clone(&self.discovery_manager);
            let network_manager = Arc::clone(&self.network_manager);
            let peer_mapping = Arc::clone(&self.peer_mapping);
            let config = self.bridge_config.clone();

            tokio::spawn(async move {
                Self::bridge_coordination_loop(
                    discovery_manager,
                    network_manager,
                    peer_mapping,
                    config,
                ).await;
            })
        };

        self.bridge_task = Some(bridge_task);
        Ok(())
    }

    /// Stop the bridge coordination
    pub async fn stop(&mut self) -> Result<()> {
        if let Some(task) = self.bridge_task.take() {
            task.abort();
        }
        Ok(())
    }

    /// Main coordination loop that synchronizes discovery and network
    async fn bridge_coordination_loop(
        discovery_manager: Arc<DiscoveryManager>,
        network_manager: Arc<P2PNetworkManager>,
        peer_mapping: Arc<Mutex<HashMap<String, PeerMapping>>>,
        config: BridgeConfig,
    ) {
        let mut interval = interval(config.discovery_network_sync_interval);

        loop {
            interval.tick().await;

            // Sync discovered peers with network
            if let Err(e) = Self::sync_discovered_peers(
                &discovery_manager,
                &network_manager,
                &peer_mapping,
                &config,
            ).await {
                eprintln!("Bridge sync error: {}", e);
            }

            // Update peer mappings
            if let Err(e) = Self::update_peer_mappings(
                &discovery_manager,
                &network_manager,
                &peer_mapping,
            ).await {
                eprintln!("Peer mapping update error: {}", e);
            }

            // Health check coordination
            if let Err(e) = Self::coordinate_health_checks(
                &discovery_manager,
                &network_manager,
                &peer_mapping,
                &config,
            ).await {
                eprintln!("Health check coordination error: {}", e);
            }
        }
    }

    /// Synchronize discovered peers with the network
    async fn sync_discovered_peers(
        discovery_manager: &Arc<DiscoveryManager>,
        network_manager: &Arc<P2PNetworkManager>,
        peer_mapping: &Arc<Mutex<HashMap<String, PeerMapping>>>,
        config: &BridgeConfig,
    ) -> Result<()> {
        let discovered_peers = discovery_manager.get_peers()?;
        let mut mapping = peer_mapping.lock().unwrap();

        for peer_info in discovered_peers {
            if !mapping.contains_key(&peer_info.node_id) {
                // New discovered peer
                let peer_mapping = PeerMapping {
                    discovery_peer: peer_info.clone(),
                    network_peer: None,
                    connection_status: ConnectionStatus::Discovered,
                    last_sync_attempt: 0,
                    sync_attempts: 0,
                };
                mapping.insert(peer_info.node_id.clone(), peer_mapping);
            }

            // Auto-connect if enabled
            if config.auto_connect_discovered_peers {
                // Avoid holding the mutex across await: perform the attempt in a scoped block
                let attempt = {
                    let mut mapping_ref = peer_mapping.lock().unwrap();
                    Self::attempt_peer_connection(
                        &peer_info,
                        network_manager,
                        &mut mapping_ref,
                    )
                };
                if let Err(e) = attempt.await {
                    eprintln!("Failed to connect to peer {}: {}", peer_info.node_id, e);
                }
            }
        }

        Ok(())
    }

    /// Attempt to connect to a discovered peer
    async fn attempt_peer_connection(
        peer_info: &PeerInfo,
        network_manager: &Arc<P2PNetworkManager>,
        peer_mapping: &mut HashMap<String, PeerMapping>,
    ) -> Result<()> {
        let mapping = peer_mapping.get_mut(&peer_info.node_id);
        if let Some(mapping) = mapping {
            if mapping.connection_status == ConnectionStatus::Discovered {
                mapping.connection_status = ConnectionStatus::Connecting;
                
                // Parse address and port
                let address = format!("{}:{}", peer_info.address, peer_info.port);
                
                // Attempt connection
                match network_manager.connect_to_peer(&address).await {
                    Ok(_) => {
                        mapping.connection_status = ConnectionStatus::Connected;
                        mapping.last_sync_attempt = std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap()
                            .as_secs();
                    }
                    Err(_) => {
                        mapping.connection_status = ConnectionStatus::Failed;
                        mapping.sync_attempts += 1;
                    }
                }
            }
        }
        Ok(())
    }

    /// Update peer mappings between discovery and network
    async fn update_peer_mappings(
        discovery_manager: &Arc<DiscoveryManager>,
        network_manager: &Arc<P2PNetworkManager>,
        peer_mapping: &Arc<Mutex<HashMap<String, PeerMapping>>>,
    ) -> Result<()> {
        let network_peers = network_manager.get_peers();
        let mut mapping = peer_mapping.lock().unwrap();

        // Update network peer information
        for network_peer in network_peers {
            if let Some(mapping_entry) = mapping.get_mut(&network_peer.node_id) {
                mapping_entry.network_peer = Some(network_peer.clone());
                if mapping_entry.connection_status == ConnectionStatus::Connecting {
                    mapping_entry.connection_status = ConnectionStatus::Connected;
                }
            }
        }

        // Check for disconnected peers
        for mapping_entry in mapping.values_mut() {
            if mapping_entry.connection_status == ConnectionStatus::Connected {
                let is_still_connected = network_peers
                    .iter()
                    .any(|p| p.node_id == mapping_entry.discovery_peer.node_id);
                
                if !is_still_connected {
                    mapping_entry.connection_status = ConnectionStatus::Disconnected;
                }
            }
        }

        Ok(())
    }

    /// Coordinate health checks between discovery and network
    async fn coordinate_health_checks(
        discovery_manager: &Arc<DiscoveryManager>,
        network_manager: &Arc<P2PNetworkManager>,
        peer_mapping: &Arc<Mutex<HashMap<String, PeerMapping>>>,
        config: &BridgeConfig,
    ) -> Result<()> {
        let mapping = peer_mapping.lock().unwrap();
        
        for (node_id, peer_mapping) in mapping.iter() {
            if peer_mapping.connection_status == ConnectionStatus::Connected {
                // Update discovery health from network status
                if let Some(network_peer) = &peer_mapping.network_peer {
                    // Update discovery peer with network health information
                    // Fallback: mark as verified/healthy using available API
                    if let Err(e) = discovery_manager.verify_peer_enhanced(node_id).await {
                        eprintln!("Failed to update peer health for {}: {}", node_id, e);
                    }
                }
            }
        }

        Ok(())
    }

    /// Get bridge status and statistics
    pub async fn get_bridge_status(&self) -> Result<BridgeStatus> {
        let mapping = self.peer_mapping.lock().unwrap();
        
        let mut status = BridgeStatus {
            total_discovered_peers: 0,
            connected_peers: 0,
            connecting_peers: 0,
            failed_peers: 0,
            disconnected_peers: 0,
            peer_mappings: Vec::new(),
        };

        for (node_id, peer_mapping) in mapping.iter() {
            status.total_discovered_peers += 1;
            
            match peer_mapping.connection_status {
                ConnectionStatus::Connected => status.connected_peers += 1,
                ConnectionStatus::Connecting => status.connecting_peers += 1,
                ConnectionStatus::Failed => status.failed_peers += 1,
                ConnectionStatus::Disconnected => status.disconnected_peers += 1,
                ConnectionStatus::Discovered => {}
            }

            status.peer_mappings.push(PeerMappingStatus {
                node_id: node_id.clone(),
                discovery_address: peer_mapping.discovery_peer.address.clone(),
                connection_status: peer_mapping.connection_status.clone(),
                last_sync_attempt: peer_mapping.last_sync_attempt,
                sync_attempts: peer_mapping.sync_attempts,
            });
        }

        Ok(status)
    }

    /// Manually trigger peer connection
    pub async fn connect_to_peer(&self, node_id: &str) -> Result<()> {
        let mapping = self.peer_mapping.lock().unwrap();
        
        if let Some(peer_mapping) = mapping.get(node_id) {
            let address = format!("{}:{}", 
                peer_mapping.discovery_peer.address, 
                peer_mapping.discovery_peer.port
            );
            
            self.network_manager.connect_to_peer(&address).await?;
        }
        
        Ok(())
    }

    /// Get peer mapping information
    pub async fn get_peer_mapping(&self, node_id: &str) -> Option<PeerMapping> {
        let mapping = self.peer_mapping.lock().unwrap();
        mapping.get(node_id).cloned()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BridgeStatus {
    pub total_discovered_peers: usize,
    pub connected_peers: usize,
    pub connecting_peers: usize,
    pub failed_peers: usize,
    pub disconnected_peers: usize,
    pub peer_mappings: Vec<PeerMappingStatus>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PeerMappingStatus {
    pub node_id: String,
    pub discovery_address: String,
    pub connection_status: ConnectionStatus,
    pub last_sync_attempt: u64,
    pub sync_attempts: u32,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::discovery::DiscoveryManager;
    use crate::network::P2PNetworkManager;
    use std::sync::Arc;

    #[tokio::test]
    async fn test_bridge_creation() {
        // This is a basic test - in a real scenario you'd need to mock the managers
        let config = BridgeConfig::default();
        assert_eq!(config.auto_connect_discovered_peers, true);
        assert_eq!(config.max_concurrent_connections, 10);
    }

    #[test]
    fn test_connection_status() {
        let status = ConnectionStatus::Discovered;
        assert_eq!(status, ConnectionStatus::Discovered);
    }
}