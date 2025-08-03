use serde::{Serialize, Deserialize};
use chrono::{DateTime, Utc};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Post {
    pub id: Option<i64>,
    pub content: String,
    pub timestamp: u64,
    pub pseudonym: String,
    pub node_id: Option<String>,
}

impl Post {
    pub fn new(content: String, pseudonym: String, node_id: Option<String>) -> Self {
        Self {
            id: None,
            content,
            timestamp: Utc::now().timestamp() as u64,
            pseudonym,
            node_id,
        }
    }
    
    pub fn get_formatted_time(&self) -> String {
        let dt = DateTime::from_timestamp(self.timestamp as i64, 0)
            .unwrap_or_else(|| Utc::now());
        
        let now = Utc::now();
        let duration = now.signed_duration_since(dt);
        
        if duration.num_seconds() < 60 {
            "Gerade eben".to_string()
        } else if duration.num_minutes() < 60 {
            format!("vor {} Minuten", duration.num_minutes())
        } else if duration.num_hours() < 24 {
            format!("vor {} Stunden", duration.num_hours())
        } else {
            format!("vor {} Tagen", duration.num_days())
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Config {
    pub auto_save: bool,
    pub max_posts: usize,
    pub default_pseudonym: String,
    pub network_enabled: bool,
    pub network_port: u16,
    pub tor_enabled: bool,
    pub tor_socks_port: u16,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            auto_save: true,
            max_posts: 100,
            default_pseudonym: "AnonymBrezn42".to_string(),
            network_enabled: false,
            network_port: 8080,
            tor_enabled: false,
            tor_socks_port: 9050,
        }
    }
}

#[derive(Debug)]
pub struct TorProxy {
    pub socks_port: u16,
    pub enabled: bool,
}

impl TorProxy {
    pub fn new(port: u16) -> Self {
        Self {
            socks_port: port,
            enabled: false,
        }
    }
    
    pub fn enable(&mut self) {
        self.enabled = true;
    }
    
    pub fn disable(&mut self) {
        self.enabled = false;
    }
    
    pub fn is_enabled(&self) -> bool {
        self.enabled
    }
    
    pub fn get_socks_url(&self) -> String {
        format!("socks5://127.0.0.1:{}", self.socks_port)
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NetworkMessage {
    pub message_type: String,
    pub payload: serde_json::Value,
    pub timestamp: u64,
    pub node_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub enum MessageType {
    Post(Post),
    Config(Config),
    Ping,
    Pong,
}