use serde::{Serialize, Deserialize};
use chrono::{DateTime, Utc};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq, Hash)]
pub struct PostId {
    pub hash: String,
    pub timestamp: u64,
    pub node_id: String,
}

impl PostId {
    pub fn new(post: &Post) -> Self {
        use sha2::{Sha256, Digest};
        let mut hasher = Sha256::new();
        hasher.update(format!("{}{}{}", post.content, post.timestamp, post.pseudonym).as_bytes());
        let hash = format!("{:x}", hasher.finalize());
        
        Self {
            hash,
            timestamp: post.timestamp,
            node_id: post.node_id.clone().unwrap_or_else(|| "unknown".to_string()),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Post {
    pub id: Option<i64>,
    pub content: String,
    pub timestamp: u64,
    pub pseudonym: String,
    pub node_id: Option<String>,
    pub post_id: Option<PostId>,
    pub parent_id: Option<String>, // For threaded conversations
    pub signature: Option<String>, // Cryptographic signature for integrity
    pub version: u32, // Post version for conflict resolution
}

impl Post {
    pub fn new(content: String, pseudonym: String, node_id: Option<String>) -> Self {
        let mut post = Self {
            id: None,
            content,
            timestamp: Utc::now().timestamp() as u64,
            pseudonym,
            node_id,
            post_id: None,
            parent_id: None,
            signature: None,
            version: 1,
        };
        
        // Generate post ID
        post.post_id = Some(PostId::new(&post));
        
        post
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
    
    pub fn get_post_id(&self) -> PostId {
        self.post_id.clone().unwrap_or_else(|| PostId::new(self))
    }
    
    pub fn is_valid(&self) -> bool {
        !self.content.is_empty() 
            && self.content.len() <= 1000
            && !self.pseudonym.is_empty() 
            && self.pseudonym.len() <= 50
            && self.timestamp > 0
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
    pub discovery_enabled: bool,
    pub discovery_port: u16,
    pub sync_interval: u64,
    pub max_peers: usize,
    pub heartbeat_interval: u64,
    pub post_validation: PostValidationConfig,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PostValidationConfig {
    pub max_content_length: usize,
    pub max_pseudonym_length: usize,
    pub min_content_length: usize,
    pub allow_empty_content: bool,
    pub rate_limit_posts_per_minute: u32,
}

impl Default for PostValidationConfig {
    fn default() -> Self {
        Self {
            max_content_length: 1000,
            max_pseudonym_length: 50,
            min_content_length: 1,
            allow_empty_content: false,
            rate_limit_posts_per_minute: 10,
        }
    }
}

impl Default for Config {
    fn default() -> Self {
        Self {
            auto_save: true,
            max_posts: 1000,
            default_pseudonym: "AnonymBrezn42".to_string(),
            network_enabled: false,
            network_port: 8888,
            tor_enabled: false,
            tor_socks_port: 9050,
            discovery_enabled: true,
            discovery_port: 8888,
            sync_interval: 30,
            max_peers: 50,
            heartbeat_interval: 60,
            post_validation: PostValidationConfig::default(),
        }
    }
}

impl Config {
    /// Validates the configuration and returns any errors
    pub fn validate(&self) -> Result<(), Vec<String>> {
        let mut errors = Vec::new();
        
        if self.network_port == 0 || self.network_port > 65535 {
            errors.push("Network port must be between 1 and 65535".to_string());
        }
        
        if self.tor_socks_port == 0 || self.tor_socks_port > 65535 {
            errors.push("Tor SOCKS port must be between 1 and 65535".to_string());
        }
        
        if self.discovery_port == 0 || self.discovery_port > 65535 {
            errors.push("Discovery port must be between 1 and 65535".to_string());
        }
        
        if self.max_posts == 0 {
            errors.push("Max posts must be greater than 0".to_string());
        }
        
        if self.max_peers == 0 {
            errors.push("Max peers must be greater than 0".to_string());
        }
        
        if self.sync_interval == 0 {
            errors.push("Sync interval must be greater than 0".to_string());
        }
        
        if self.heartbeat_interval == 0 {
            errors.push("Heartbeat interval must be greater than 0".to_string());
        }
        
        if self.default_pseudonym.is_empty() {
            errors.push("Default pseudonym cannot be empty".to_string());
        }
        
        if self.default_pseudonym.len() > 50 {
            errors.push("Default pseudonym too long (max 50 characters)".to_string());
        }
        
        if errors.is_empty() {
            Ok(())
        } else {
            Err(errors)
        }
    }
    
    /// Updates the configuration with new values, validating them first
    pub fn update(&mut self, updates: &serde_json::Value) -> Result<(), Vec<String>> {
        if let Some(auto_save) = updates.get("auto_save").and_then(|v| v.as_bool()) {
            self.auto_save = auto_save;
        }
        
        if let Some(max_posts) = updates.get("max_posts").and_then(|v| v.as_u64()) {
            self.max_posts = max_posts as usize;
        }
        
        if let Some(pseudonym) = updates.get("default_pseudonym").and_then(|v| v.as_str()) {
            self.default_pseudonym = pseudonym.to_string();
        }
        
        if let Some(network_enabled) = updates.get("network_enabled").and_then(|v| v.as_bool()) {
            self.network_enabled = network_enabled;
        }
        
        if let Some(network_port) = updates.get("network_port").and_then(|v| v.as_u64()) {
            self.network_port = network_port as u16;
        }
        
        if let Some(tor_enabled) = updates.get("tor_enabled").and_then(|v| v.as_bool()) {
            self.tor_enabled = tor_enabled;
        }
        
        if let Some(tor_socks_port) = updates.get("tor_socks_port").and_then(|v| v.as_u64()) {
            self.tor_socks_port = tor_socks_port as u16;
        }
        
        if let Some(discovery_enabled) = updates.get("discovery_enabled").and_then(|v| v.as_bool()) {
            self.discovery_enabled = discovery_enabled;
        }
        
        if let Some(discovery_port) = updates.get("discovery_port").and_then(|v| v.as_u64()) {
            self.discovery_port = discovery_port as u16;
        }
        
        if let Some(sync_interval) = updates.get("sync_interval").and_then(|v| v.as_u64()) {
            self.sync_interval = sync_interval;
        }
        
        if let Some(max_peers) = updates.get("max_peers").and_then(|v| v.as_u64()) {
            self.max_peers = max_peers as usize;
        }
        
        if let Some(heartbeat_interval) = updates.get("heartbeat_interval").and_then(|v| v.as_u64()) {
            self.heartbeat_interval = heartbeat_interval;
        }
        
        // Validate the updated configuration
        self.validate()
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

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PostConflict {
    pub post_id: PostId,
    pub conflicting_posts: Vec<Post>,
    pub resolution_strategy: ConflictResolutionStrategy,
    pub resolved_at: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub enum ConflictResolutionStrategy {
    LatestWins,      // Use the most recent post
    FirstWins,       // Use the first post received
    ContentHash,     // Use the post with the most unique content
    Manual,          // Require manual resolution
    Merged,          // Merge content if possible
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FeedState {
    pub node_id: String,
    pub last_sync_timestamp: u64,
    pub post_count: usize,
    pub last_post_id: Option<PostId>,
    pub peer_states: HashMap<String, PeerFeedState>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PeerFeedState {
    pub node_id: String,
    pub last_seen_timestamp: u64,
    pub last_post_timestamp: u64,
    pub post_count: usize,
    pub sync_status: SyncStatus,
    pub last_sync_attempt: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub enum SyncStatus {
    Synchronized,
    Pending,
    Failed,
    OutOfSync,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncRequest {
    pub requesting_node: String,
    pub last_known_timestamp: u64,
    pub requested_post_count: usize,
    pub sync_mode: SyncMode,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub enum SyncMode {
    Full,           // Complete feed synchronization
    Incremental,    // Only new posts since last sync
    Conflict,       // Only posts with conflicts
    Selective,      // Specific post range
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncResponse {
    pub responding_node: String,
    pub posts: Vec<Post>,
    pub conflicts: Vec<PostConflict>,
    pub feed_state: FeedState,
    pub sync_timestamp: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PostBroadcast {
    pub post: Post,
    pub broadcast_id: String,
    pub ttl: u32, // Time to live in network hops
    pub origin_node: String,
    pub broadcast_timestamp: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PostOrder {
    pub post_id: PostId,
    pub sequence_number: u64,
    pub timestamp: u64,
    pub node_id: String,
    pub parent_sequence: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DataIntegrityCheck {
    pub post_id: PostId,
    pub content_hash: String,
    pub signature: String,
    pub public_key: String,
    pub verification_status: VerificationStatus,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub enum VerificationStatus {
    Verified,
    Failed,
    Pending,
    Unsupported,
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
        assert_eq!(config.max_posts, 1000);
        assert!(config.auto_save);
        assert!(!config.network_enabled);
        assert!(!config.tor_enabled);
        assert_eq!(config.network_port, 8888);
        assert_eq!(config.tor_socks_port, 9050);
        assert!(config.discovery_enabled);
        assert_eq!(config.discovery_port, 8888);
        assert_eq!(config.sync_interval, 30);
        assert_eq!(config.max_peers, 50);
        assert_eq!(config.heartbeat_interval, 60);
        assert_eq!(config.post_validation.max_content_length, 1000);
        assert_eq!(config.post_validation.max_pseudonym_length, 50);
        assert_eq!(config.post_validation.min_content_length, 1);
        assert!(!config.post_validation.allow_empty_content);
        assert_eq!(config.post_validation.rate_limit_posts_per_minute, 10);
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