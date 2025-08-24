//! Performance-Optimierungen für Brezn P2P-Netzwerk
//! 
//! Diese Module implementieren:
//! - Connection-Pooling für bessere Netzwerk-Performance
//! - Caching für häufig abgerufene Daten
//! - Performance-Monitoring und -Metriken
//! - Optimierte Datenstrukturen

use std::collections::HashMap;
use std::sync::{Arc, Mutex, RwLock};
use std::time::{Duration, Instant};
use tokio::sync::Semaphore;
use serde::{Serialize, Deserialize};

// ============================================================================
// Connection Pool für bessere Netzwerk-Performance
// ============================================================================

#[derive(Debug, Clone)]
pub struct ConnectionPool {
    max_connections: usize,
    active_connections: Arc<Mutex<HashMap<String, PooledConnection>>>,
    connection_semaphore: Arc<Semaphore>,
    stats: Arc<Mutex<ConnectionPoolStats>>,
}

#[derive(Debug, Clone)]
pub struct PooledConnection {
    pub id: String,
    pub peer_id: String,
    pub created_at: Instant,
    pub last_used: Instant,
    pub use_count: u64,
    pub health_score: f64,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionPoolStats {
    pub total_connections_created: u64,
    pub total_connections_dropped: u64,
    pub current_active_connections: usize,
    pub connection_creation_time_avg_ms: f64,
    pub connection_reuse_rate: f64,
}

impl ConnectionPool {
    pub fn new(max_connections: usize) -> Self {
        Self {
            max_connections,
            active_connections: Arc::new(Mutex::new(HashMap::new())),
            connection_semaphore: Arc::new(Semaphore::new(max_connections)),
            stats: Arc::new(Mutex::new(ConnectionPoolStats::default())),
        }
    }
    
    pub async fn acquire_connection(&self, peer_id: &str) -> Option<String> {
        // Versuche bestehende Verbindung zu finden
        {
            let connections = self.active_connections.lock().unwrap();
            if let Some(conn) = connections.get(peer_id) {
                if conn.is_active && conn.health_score > 0.5 {
                    // Verbindung wiederverwenden
                    return Some(conn.id.clone());
                }
            }
        }
        
        // Neue Verbindung erstellen
        let _permit = self.connection_semaphore.acquire().await.ok()?;
        
        let connection_id = format!("conn_{}", uuid::Uuid::new_v4());
        let pooled_conn = PooledConnection {
            id: connection_id.clone(),
            peer_id: peer_id.to_string(),
            created_at: Instant::now(),
            last_used: Instant::now(),
            use_count: 1,
            health_score: 1.0,
            is_active: true,
        };
        
        // Verbindung zum Pool hinzufügen
        {
            let mut connections = self.active_connections.lock().unwrap();
            connections.insert(peer_id.to_string(), pooled_conn);
        }
        
        // Statistiken aktualisieren
        {
            let mut stats = self.stats.lock().unwrap();
            stats.total_connections_created += 1;
            stats.current_active_connections = self.active_connections.lock().unwrap().len();
        }
        
        Some(connection_id)
    }
    
    pub fn release_connection(&self, connection_id: &str) {
        let mut connections = self.active_connections.lock().unwrap();
        
        // Finde und aktualisiere Verbindung
        for conn in connections.values_mut() {
            if conn.id == connection_id {
                conn.last_used = Instant::now();
                conn.use_count += 1;
                break;
            }
        }
    }
    
    pub fn drop_connection(&self, peer_id: &str) {
        let mut connections = self.active_connections.lock().unwrap();
        if connections.remove(peer_id).is_some() {
            let mut stats = self.stats.lock().unwrap();
            stats.total_connections_dropped += 1;
            stats.current_active_connections = connections.len();
        }
    }
    
    pub fn cleanup_idle_connections(&self, max_idle_time: Duration) {
        let now = Instant::now();
        let mut connections = self.active_connections.lock().unwrap();
        let mut to_remove = Vec::new();
        
        for (peer_id, conn) in connections.iter() {
            if now.duration_since(conn.last_used) > max_idle_time {
                to_remove.push(peer_id.clone());
            }
        }
        
        for peer_id in to_remove {
            connections.remove(&peer_id);
        }
        
        // Statistiken aktualisieren
        if let Ok(mut stats) = self.stats.lock() {
            stats.current_active_connections = connections.len();
        }
    }
    
    pub fn get_stats(&self) -> ConnectionPoolStats {
        self.stats.lock().unwrap().clone()
    }
}

impl Default for ConnectionPoolStats {
    fn default() -> Self {
        Self {
            total_connections_created: 0,
            total_connections_dropped: 0,
            current_active_connections: 0,
            connection_creation_time_avg_ms: 0.0,
            connection_reuse_rate: 0.0,
        }
    }
}

// ============================================================================
// Cache-System für häufig abgerufene Daten
// ============================================================================

#[derive(Debug, Clone)]
pub struct CacheManager {
    post_cache: Arc<RwLock<HashMap<String, CachedPost>>>,
    peer_cache: Arc<RwLock<HashMap<String, CachedPeer>>>,
    config: CacheConfig,
}

#[derive(Debug, Clone)]
pub struct CachedPost {
    pub post_id: String,
    pub content: String,
    pub timestamp: u64,
    pub cached_at: Instant,
    pub access_count: u64,
    pub last_accessed: Instant,
}

#[derive(Debug, Clone)]
pub struct CachedPeer {
    pub peer_id: String,
    pub address: String,
    pub capabilities: Vec<String>,
    pub cached_at: Instant,
    pub access_count: u64,
    pub last_accessed: Instant,
}

#[derive(Debug, Clone)]
pub struct CacheConfig {
    pub max_posts: usize,
    pub max_peers: usize,
    pub post_ttl: Duration,
    pub peer_ttl: Duration,
    pub cleanup_interval: Duration,
}

impl Default for CacheConfig {
    fn default() -> Self {
        Self {
            max_posts: 1000,
            max_peers: 100,
            post_ttl: Duration::from_secs(300), // 5 Minuten
            peer_ttl: Duration::from_secs(600),  // 10 Minuten
            cleanup_interval: Duration::from_secs(60), // 1 Minute
        }
    }
}

impl CacheManager {
    pub fn new(config: CacheConfig) -> Self {
        Self {
            post_cache: Arc::new(RwLock::new(HashMap::new())),
            peer_cache: Arc::new(RwLock::new(HashMap::new())),
            config,
        }
    }
    
    pub fn cache_post(&self, post_id: &str, content: &str, timestamp: u64) {
        let cached_post = CachedPost {
            post_id: post_id.to_string(),
            content: content.to_string(),
            timestamp,
            cached_at: Instant::now(),
            access_count: 0,
            last_accessed: Instant::now(),
        };
        
        let mut cache = self.post_cache.write().unwrap();
        
        // Cache-Größe überprüfen
        if cache.len() >= self.config.max_posts {
            // Entferne ältesten Eintrag
            let oldest_key = cache.iter()
                .min_by_key(|(_, post)| post.cached_at)
                .map(|(k, _)| k.clone());
            
            if let Some(key) = oldest_key {
                cache.remove(&key);
            }
        }
        
        cache.insert(post_id.to_string(), cached_post);
    }
    
    pub fn get_cached_post(&self, post_id: &str) -> Option<CachedPost> {
        let mut cache = self.post_cache.write().unwrap();
        
        if let Some(post) = cache.get_mut(post_id) {
            // Überprüfe TTL
            if Instant::now().duration_since(post.cached_at) > self.config.post_ttl {
                cache.remove(post_id);
                return None;
            }
            
            // Aktualisiere Zugriffsstatistiken
            post.access_count += 1;
            post.last_accessed = Instant::now();
            
            Some(post.clone())
        } else {
            None
        }
    }
    
    pub fn cache_peer(&self, peer_id: &str, address: &str, capabilities: &[String]) {
        let cached_peer = CachedPeer {
            peer_id: peer_id.to_string(),
            address: address.to_string(),
            capabilities: capabilities.to_vec(),
            cached_at: Instant::now(),
            access_count: 0,
            last_accessed: Instant::now(),
        };
        
        let mut cache = self.peer_cache.write().unwrap();
        
        // Cache-Größe überprüfen
        if cache.len() >= self.config.max_peers {
            // Entferne ältesten Eintrag
            let oldest_key = cache.iter()
                .min_by_key(|(_, peer)| peer.cached_at)
                .map(|(k, _)| k.clone());
            
            if let Some(key) = oldest_key {
                cache.remove(&key);
            }
        }
        
        cache.insert(peer_id.to_string(), cached_peer);
    }
    
    pub fn get_cached_peer(&self, peer_id: &str) -> Option<CachedPeer> {
        let mut cache = self.peer_cache.write().unwrap();
        
        if let Some(peer) = cache.get_mut(peer_id) {
            // Überprüfe TTL
            if Instant::now().duration_since(peer.cached_at) > self.config.peer_ttl {
                cache.remove(peer_id);
                return None;
            }
            
            // Aktualisiere Zugriffsstatistiken
            peer.access_count += 1;
            peer.last_accessed = Instant::now();
            
            Some(peer.clone())
        } else {
            None
        }
    }
    
    pub fn cleanup_expired_entries(&self) {
        let now = Instant::now();
        
        // Bereinige Post-Cache
        {
            let mut cache = self.post_cache.write().unwrap();
            cache.retain(|_, post| {
                now.duration_since(post.cached_at) <= self.config.post_ttl
            });
        }
        
        // Bereinige Peer-Cache
        {
            let mut cache = self.peer_cache.write().unwrap();
            cache.retain(|_, peer| {
                now.duration_since(peer.cached_at) <= self.config.peer_ttl
            });
        }
    }
    
    pub fn get_cache_stats(&self) -> CacheStats {
        let post_cache = self.post_cache.read().unwrap();
        let peer_cache = self.peer_cache.read().unwrap();
        
        CacheStats {
            cached_posts: post_cache.len(),
            cached_peers: peer_cache.len(),
            total_post_accesses: post_cache.values().map(|p| p.access_count).sum(),
            total_peer_accesses: peer_cache.values().map(|p| p.access_count).sum(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheStats {
    pub cached_posts: usize,
    pub cached_peers: usize,
    pub total_post_accesses: u64,
    pub total_peer_accesses: u64,
}

// ============================================================================
// Performance-Monitoring
// ============================================================================

#[derive(Debug, Clone)]
pub struct PerformanceMonitor {
    metrics: Arc<Mutex<PerformanceMetrics>>,
    start_time: Instant,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceMetrics {
    pub total_operations: u64,
    pub successful_operations: u64,
    pub failed_operations: u64,
    pub average_response_time_ms: f64,
    pub peak_memory_usage_mb: f64,
    pub current_memory_usage_mb: f64,
    pub network_throughput_mbps: f64,
    pub cache_hit_rate: f64,
    pub connection_pool_utilization: f64,
}

impl PerformanceMonitor {
    pub fn new() -> Self {
        Self {
            metrics: Arc::new(Mutex::new(PerformanceMetrics::default())),
            start_time: Instant::now(),
        }
    }
    
    pub fn record_operation(&self, success: bool, response_time_ms: f64) {
        let mut metrics = self.metrics.lock().unwrap();
        
        metrics.total_operations += 1;
        if success {
            metrics.successful_operations += 1;
        } else {
            metrics.failed_operations += 1;
        }
        
        // Aktualisiere durchschnittliche Antwortzeit
        let total_time = metrics.average_response_time_ms * (metrics.total_operations - 1) as f64;
        metrics.average_response_time_ms = (total_time + response_time_ms) / metrics.total_operations as f64;
    }
    
    pub fn update_memory_usage(&self, current_mb: f64) {
        let mut metrics = self.metrics.lock().unwrap();
        metrics.current_memory_usage_mb = current_mb;
        if current_mb > metrics.peak_memory_usage_mb {
            metrics.peak_memory_usage_mb = current_mb;
        }
    }
    
    pub fn update_network_throughput(&self, throughput_mbps: f64) {
        let mut metrics = self.metrics.lock().unwrap();
        metrics.network_throughput_mbps = throughput_mbps;
    }
    
    pub fn update_cache_hit_rate(&self, hit_rate: f64) {
        let mut metrics = self.metrics.lock().unwrap();
        metrics.cache_hit_rate = hit_rate;
    }
    
    pub fn update_connection_pool_utilization(&self, utilization: f64) {
        let mut metrics = self.metrics.lock().unwrap();
        metrics.connection_pool_utilization = utilization;
    }
    
    pub fn get_metrics(&self) -> PerformanceMetrics {
        self.metrics.lock().unwrap().clone()
    }
    
    pub fn get_uptime(&self) -> Duration {
        self.start_time.elapsed()
    }
    
    pub fn get_success_rate(&self) -> f64 {
        let metrics = self.metrics.lock().unwrap();
        if metrics.total_operations > 0 {
            metrics.successful_operations as f64 / metrics.total_operations as f64
        } else {
            0.0
        }
    }
}

impl Default for PerformanceMetrics {
    fn default() -> Self {
        Self {
            total_operations: 0,
            successful_operations: 0,
            failed_operations: 0,
            average_response_time_ms: 0.0,
            peak_memory_usage_mb: 0.0,
            current_memory_usage_mb: 0.0,
            network_throughput_mbps: 0.0,
            cache_hit_rate: 0.0,
            connection_pool_utilization: 0.0,
        }
    }
}

// ============================================================================
// Optimierte Datenstrukturen
// ============================================================================

/// Optimierte HashMap mit LRU-Eviction
#[derive(Debug)]
pub struct LRUCache<K, V> {
    capacity: usize,
    cache: HashMap<K, (V, Instant)>,
    access_order: Vec<K>,
}

impl<K: Clone + Eq + std::hash::Hash, V> LRUCache<K, V> {
    pub fn new(capacity: usize) -> Self {
        Self {
            capacity,
            cache: HashMap::new(),
            access_order: Vec::new(),
        }
    }
    
    pub fn insert(&mut self, key: K, value: V) {
        if self.cache.contains_key(&key) {
            // Aktualisiere bestehenden Eintrag
            self.cache.insert(key.clone(), (value, Instant::now()));
            self.update_access_order(&key);
        } else {
            // Prüfe Kapazität
            if self.cache.len() >= self.capacity {
                self.evict_lru();
            }
            
            // Füge neuen Eintrag hinzu
            self.cache.insert(key.clone(), (value, Instant::now()));
            self.access_order.push(key);
        }
    }
    
    pub fn get(&mut self, key: &K) -> Option<&V> {
        let exists = self.cache.contains_key(key);
        if exists {
            // Update access order first
            self.update_access_order(key);
            // Now borrow the value immutably
            self.cache.get(key).map(|(v, _)| v)
        } else {
            None
        }
    }
    
    fn update_access_order(&mut self, key: &K) {
        // Entferne aus alter Position
        if let Some(pos) = self.access_order.iter().position(|k| k == key) {
            self.access_order.remove(pos);
        }
        // Füge am Ende hinzu (neueste)
        self.access_order.push(key.clone());
    }
    
    fn evict_lru(&mut self) {
        if let Some(lru_key) = self.access_order.first().cloned() {
            self.cache.remove(&lru_key);
            self.access_order.remove(0);
        }
    }
    
    pub fn len(&self) -> usize {
        self.cache.len()
    }
    
    pub fn is_empty(&self) -> bool {
        self.cache.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_connection_pool() {
        let pool = ConnectionPool::new(5);
        assert_eq!(pool.max_connections, 5);
        
        let stats = pool.get_stats();
        assert_eq!(stats.current_active_connections, 0);
        assert_eq!(stats.total_connections_created, 0);
    }
    
    #[test]
    fn test_cache_manager() {
        let config = CacheConfig::default();
        let cache = CacheManager::new(config);
        
        // Teste Post-Caching
        cache.cache_post("post1", "Test content", 1234567890);
        let cached = cache.get_cached_post("post1");
        assert!(cached.is_some());
        assert_eq!(cached.unwrap().content, "Test content");
        
        // Teste Peer-Caching
        cache.cache_peer("peer1", "127.0.0.1:8888", &["posts".to_string()]);
        let cached_peer = cache.get_cached_peer("peer1");
        assert!(cached_peer.is_some());
        assert_eq!(cached_peer.unwrap().address, "127.0.0.1:8888");
    }
    
    #[test]
    fn test_performance_monitor() {
        let monitor = PerformanceMonitor::new();
        
        monitor.record_operation(true, 50.0);
        monitor.record_operation(false, 100.0);
        
        let metrics = monitor.get_metrics();
        assert_eq!(metrics.total_operations, 2);
        assert_eq!(metrics.successful_operations, 1);
        assert_eq!(metrics.failed_operations, 1);
        assert_eq!(metrics.average_response_time_ms, 75.0);
        
        let success_rate = monitor.get_success_rate();
        assert_eq!(success_rate, 0.5);
    }
    
    #[test]
    fn test_lru_cache() {
        let mut cache = LRUCache::new(3);
        
        cache.insert("key1", "value1");
        cache.insert("key2", "value2");
        cache.insert("key3", "value3");
        
        assert_eq!(cache.len(), 3);
        
        // Überschreite Kapazität
        cache.insert("key4", "value4");
        assert_eq!(cache.len(), 3);
        
        // Ältester Eintrag sollte entfernt worden sein
        assert!(cache.get(&"key1").is_none());
        assert!(cache.get(&"key4").is_some());
    }
}