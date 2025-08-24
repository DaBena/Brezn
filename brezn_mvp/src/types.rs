use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Post {
    pub id: Option<i64>,
    pub content: String,
    pub timestamp: DateTime<Utc>,
    pub pseudonym: String,
    pub node_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreatePostRequest {
    pub content: String,
    pub pseudonym: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub network_enabled: bool,
    pub network_port: u16,
    pub discovery_enabled: bool,
    pub discovery_port: u16,
    pub tor_enabled: bool,
    pub tor_socks_port: u16,
    pub max_posts: usize,
    pub default_pseudonym: String,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            network_enabled: true,
            network_port: 8888,
            discovery_enabled: true,
            discovery_port: 8889,
            tor_enabled: false,
            tor_socks_port: 9050,
            max_posts: 1000,
            default_pseudonym: "AnonymBrezn".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkStatus {
    pub active: bool,
    pub peer_count: usize,
    pub bytes_sent: u64,
    pub bytes_received: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PeerInfo {
    pub node_id: String,
    pub address: String,
    pub last_seen: DateTime<Utc>,
}