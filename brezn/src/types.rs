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

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_post_creation() {
        let post = Post::new(
            "Test content".to_string(),
            "TestUser".to_string(),
            Some("test-node".to_string())
        );
        
        assert_eq!(post.content, "Test content");
        assert_eq!(post.pseudonym, "TestUser");
        assert_eq!(post.node_id, Some("test-node".to_string()));
        assert!(post.id.is_none());
    }
    
    #[test]
    fn test_post_time_formatting() {
        let mut post = Post::new(
            "Test".to_string(),
            "User".to_string(),
            None
        );
        
        // Set timestamp to 1 hour ago
        post.timestamp = (chrono::Utc::now().timestamp() - 3600) as u64;
        
        let formatted = post.get_formatted_time();
        assert!(formatted.contains("vor 1 Stunde") || formatted.contains("vor 1 Stunden"));
    }
    
    #[test]
    fn test_config_defaults() {
        let config = Config::default();
        
        assert_eq!(config.default_pseudonym, "AnonymBrezn42");
        assert_eq!(config.max_posts, 100);
        assert!(config.auto_save);
        assert!(!config.network_enabled);
        assert!(!config.tor_enabled);
        assert_eq!(config.network_port, 8080);
        assert_eq!(config.tor_socks_port, 9050);
    }
    
    #[test]
    fn test_tor_proxy() {
        let mut proxy = TorProxy::new(9050);
        
        assert!(!proxy.is_enabled());
        assert_eq!(proxy.get_socks_url(), "socks5://127.0.0.1:9050");
        
        proxy.enable();
        assert!(proxy.is_enabled());
        
        proxy.disable();
        assert!(!proxy.is_enabled());
    }
}