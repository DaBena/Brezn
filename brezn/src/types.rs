use serde::{Serialize, Deserialize};
// Removed unused import

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Post {
    pub id: Option<i64>,
    pub content: String,
    pub pseudonym: String,
    pub timestamp: u64,
    pub node_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub auto_save: bool,
    pub max_posts: usize,
    pub default_pseudonym: String,
    pub network_enabled: bool,
    pub network_port: u16,
    pub tor_enabled: bool,
    pub tor_socks_port: u16,
    pub discovery_enabled: bool,
    pub discovery_port: u16,
    pub sync_interval: u64,
    pub max_peers: usize,
    pub heartbeat_interval: u64,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            auto_save: true,
            max_posts: 1000,
            default_pseudonym: "AnonymBrezn".to_string(),
            network_enabled: true,
            network_port: 8888,
            tor_enabled: false,
            tor_socks_port: 9050,
            discovery_enabled: true,
            discovery_port: 8889,
            sync_interval: 30,
            max_peers: 50,
            heartbeat_interval: 60,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkStatus {
    pub is_enabled: bool,
    pub peer_count: usize,
    pub last_sync: Option<u64>,
    pub bytes_sent: u64,
    pub bytes_received: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PeerInfo {
    pub node_id: String,
    pub address: String,
    pub port: u16,
    pub last_seen: u64,
    pub is_connected: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QRCodeData {
    pub node_id: String,
    pub address: String,
    pub port: u16,
    pub public_key: String,
    pub network_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum NetworkMessage {
    Ping { node_id: String, timestamp: u64 },
    Pong { node_id: String, timestamp: u64 },
    PostBroadcast { post: Post },
    PeerRequest,
    PeerResponse { peers: Vec<PeerInfo> },
}