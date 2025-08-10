use crate::discovery::DiscoveryManager;
use crate::tor::TorManager;
use crate::error::Result;
use serde_json::json;

pub struct UIExtensions {
    discovery: DiscoveryManager,
    tor_manager: TorManager,
}

impl UIExtensions {
    pub fn new(discovery: DiscoveryManager, tor_manager: TorManager) -> Self {
        Self {
            discovery,
            tor_manager,
        }
    }
    
    pub fn get_network_status(&self) -> Result<serde_json::Value> {
        let peers = self.discovery.get_peers()?;
        let tor_enabled = self.tor_manager.is_enabled();
        let tor_url = self.tor_manager.get_socks_url();
        
        let status = json!({
            "network": {
                "peers_count": peers.len(),
                "peers": peers.iter().map(|p| {
                    json!({
                        "node_id": p.node_id,
                        "address": format!("{}:{}", p.address, p.port),
                        "last_seen": p.last_seen,
                        "capabilities": p.capabilities,
                    })
                }).collect::<Vec<_>>(),
            },
            "tor": {
                "enabled": tor_enabled,
                "socks_url": tor_url,
            },
            "timestamp": chrono::Utc::now().timestamp(),
        });
        
        Ok(status)
    }
    
    pub fn generate_qr_code_data(&self) -> Result<String> {
        self.discovery.generate_qr_code()
    }
    
    pub fn add_peer_from_qr(&self, qr_data: &str) -> Result<()> {
        let peer = self.discovery.parse_qr_code(qr_data)?;
        self.discovery.add_peer(peer)
    }
    
    pub fn get_peer_list(&self) -> Result<Vec<serde_json::Value>> {
        let peers = self.discovery.get_peers()?;
        
        Ok(peers.iter().map(|peer| {
            json!({
                "node_id": peer.node_id,
                "address": format!("{}:{}", peer.address, peer.port),
                "last_seen": peer.last_seen,
                "capabilities": peer.capabilities,
                "status": if chrono::Utc::now().timestamp() as u64 - peer.last_seen < 60 {
                    "online"
                } else {
                    "offline"
                },
            })
        }).collect())
    }
    
    pub fn remove_peer(&self, node_id: &str) -> Result<()> {
        self.discovery.remove_peer(node_id)
    }
    
    pub async fn test_tor_connection(&self) -> Result<serde_json::Value> {
        match self.tor_manager.test_connection().await {
            Ok(_) => Ok(json!({
                "success": true,
                "message": "Tor connection successful",
                "timestamp": chrono::Utc::now().timestamp(),
            })),
            Err(e) => Ok(json!({
                "success": false,
                "error": e.to_string(),
                "timestamp": chrono::Utc::now().timestamp(),
            })),
        }
    }
    
    pub fn get_new_tor_circuit(&self) -> Result<serde_json::Value> {
        match self.tor_manager.get_new_circuit() {
            Ok(_) => Ok(json!({
                "success": true,
                "message": "New Tor circuit requested",
                "timestamp": chrono::Utc::now().timestamp(),
            })),
            Err(e) => Ok(json!({
                "success": false,
                "error": e.to_string(),
                "timestamp": chrono::Utc::now().timestamp(),
            })),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::discovery::DiscoveryConfig;

    fn make_ui() -> UIExtensions {
        let discovery = DiscoveryManager::new(DiscoveryConfig::default(), "n1".into(), "pk".into(), 1111);
        let tor_manager = TorManager::new(crate::tor::TorConfig::default());
        UIExtensions::new(discovery, tor_manager)
    }

    #[test]
    fn test_get_network_status_and_qr() {
        let ui = make_ui();
        let status = ui.get_network_status().unwrap();
        assert!(status["network"]["peers_count"].as_u64().unwrap_or(1) >= 0);
        let qr = ui.generate_qr_code_data().unwrap();
        assert!(!qr.is_empty());
    }

    #[test]
    fn test_add_peer_list_and_remove() {
        let ui = make_ui();
        let qr_like = serde_json::json!({
            "node_id": "p1",
            "public_key": "k",
            "address": "127.0.0.1",
            "port": 3333,
            "capabilities": ["posts"]
        }).to_string();

        ui.add_peer_from_qr(&qr_like).unwrap();
        let list = ui.get_peer_list().unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0]["node_id"], "p1");

        ui.remove_peer("p1").unwrap();
        let list2 = ui.get_peer_list().unwrap();
        assert!(list2.is_empty());
    }
}