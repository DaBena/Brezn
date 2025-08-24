use crate::network::P2PNetworkManager;
use crate::discovery::DiscoveryManager;
use crate::discovery_network_bridge::DiscoveryNetworkBridge;
use crate::error::Result;
use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use tokio::time::{Duration, interval, Instant};
use serde::{Serialize, Deserialize};
use std::sync::atomic::{AtomicU64, Ordering};

/// Performance optimizer for P2P network operations
pub struct PerformanceOptimizer {
    network_manager: Arc<P2PNetworkManager>,
    discovery_manager: Arc<DiscoveryManager>,
    bridge: Arc<DiscoveryNetworkBridge>,
    
    // Performance metrics
    connection_pool_size: Arc<AtomicU64>,
    message_queue_size: Arc<AtomicU64>,
    sync_latency_ms: Arc<AtomicU64>,
    peer_response_times: Arc<Mutex<HashMap<String, Vec<u64>>>>,
    
    // Optimization settings
    config: OptimizationConfig,
    
    // Background optimization task
    optimization_task: Option<tokio::task::JoinHandle<()>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptimizationConfig {
    pub enable_connection_pooling: bool,
    pub max_connection_pool_size: usize,
    pub enable_message_batching: bool,
    pub batch_size: usize,
    pub batch_timeout_ms: u64,
    pub enable_adaptive_sync: bool,
    pub min_sync_interval_ms: u64,
    pub max_sync_interval_ms: u64,
    pub enable_peer_prioritization: bool,
    pub enable_compression: bool,
    pub compression_threshold_bytes: usize,
    pub enable_connection_reuse: bool,
    pub connection_idle_timeout_ms: u64,
}

impl Default for OptimizationConfig {
    fn default() -> Self {
        Self {
            enable_connection_pooling: true,
            max_connection_pool_size: 20,
            enable_message_batching: true,
            batch_size: 50,
            batch_timeout_ms: 100,
            enable_adaptive_sync: true,
            min_sync_interval_ms: 1000,
            max_sync_interval_ms: 30000,
            enable_peer_prioritization: true,
            enable_compression: true,
            compression_threshold_bytes: 1024,
            enable_connection_reuse: true,
            connection_idle_timeout_ms: 300000, // 5 minutes
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceMetrics {
    pub connection_pool_size: u64,
    pub message_queue_size: u64,
    pub average_sync_latency_ms: u64,
    pub peer_response_times: HashMap<String, PeerResponseStats>,
    pub optimization_suggestions: Vec<String>,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PeerResponseStats {
    pub average_response_time_ms: u64,
    pub min_response_time_ms: u64,
    pub max_response_time_ms: u64,
    pub response_count: u64,
    pub last_response_time: u64,
}

impl PerformanceOptimizer {
    /// Create a new performance optimizer
    pub fn new(
        network_manager: Arc<P2PNetworkManager>,
        discovery_manager: Arc<DiscoveryManager>,
        bridge: Arc<DiscoveryNetworkBridge>,
        config: Option<OptimizationConfig>,
    ) -> Self {
        Self {
            network_manager,
            discovery_manager,
            bridge,
            connection_pool_size: Arc::new(AtomicU64::new(0)),
            message_queue_size: Arc::new(AtomicU64::new(0)),
            sync_latency_ms: Arc::new(AtomicU64::new(0)),
            peer_response_times: Arc::new(Mutex::new(HashMap::new())),
            config: config.unwrap_or_default(),
            optimization_task: None,
        }
    }

    /// Start the performance optimization
    pub async fn start(&mut self) -> Result<()> {
        let optimization_task = {
            let network_manager = Arc::clone(&self.network_manager);
            let discovery_manager = Arc::clone(&self.discovery_manager);
            let bridge = Arc::clone(&self.bridge);
            let config = self.config.clone();
            let connection_pool_size = Arc::clone(&self.connection_pool_size);
            let message_queue_size = Arc::clone(&self.message_queue_size);
            let sync_latency_ms = Arc::clone(&self.sync_latency_ms);
            let peer_response_times = Arc::clone(&self.peer_response_times);

            tokio::spawn(async move {
                Self::optimization_loop(
                    network_manager,
                    discovery_manager,
                    bridge,
                    config,
                    connection_pool_size,
                    message_queue_size,
                    sync_latency_ms,
                    peer_response_times,
                ).await;
            })
        };

        self.optimization_task = Some(optimization_task);
        Ok(())
    }

    /// Stop the performance optimization
    pub async fn stop(&mut self) -> Result<()> {
        if let Some(task) = self.optimization_task.take() {
            task.abort();
        }
        Ok(())
    }

    /// Main optimization loop
    async fn optimization_loop(
        network_manager: Arc<P2PNetworkManager>,
        discovery_manager: Arc<DiscoveryManager>,
        bridge: Arc<DiscoveryNetworkBridge>,
        config: OptimizationConfig,
        connection_pool_size: Arc<AtomicU64>,
        message_queue_size: Arc<AtomicU64>,
        sync_latency_ms: Arc<AtomicU64>,
        peer_response_times: Arc<Mutex<HashMap<String, Vec<u64>>>>,
    ) {
        let mut interval = interval(Duration::from_secs(5));

        loop {
            interval.tick().await;

            // Update performance metrics
            if let Err(e) = Self::update_performance_metrics(
                &network_manager,
                &discovery_manager,
                &connection_pool_size,
                &message_queue_size,
                &sync_latency_ms,
                &peer_response_times,
            ).await {
                eprintln!("Failed to update performance metrics: {}", e);
            }

            // Apply optimizations
            if let Err(e) = Self::apply_optimizations(
                &network_manager,
                &discovery_manager,
                &bridge,
                &config,
                &connection_pool_size,
                &message_queue_size,
                &sync_latency_ms,
                &peer_response_times,
            ).await {
                eprintln!("Failed to apply optimizations: {}", e);
            }
        }
    }

    /// Update performance metrics
    async fn update_performance_metrics(
        network_manager: &Arc<P2PNetworkManager>,
        discovery_manager: &Arc<DiscoveryManager>,
        connection_pool_size: &Arc<AtomicU64>,
        message_queue_size: &Arc<AtomicU64>,
        sync_latency_ms: &Arc<AtomicU64>,
        peer_response_times: &Arc<Mutex<HashMap<String, Vec<u64>>>>,
    ) -> Result<()> {
        // Update connection pool size
        let network_status = network_manager.get_network_status().await?;
        connection_pool_size.store(network_status.active_peers as u64, Ordering::Relaxed);

        // Update message queue size (simulated for now)
        let queue_size = network_status.total_posts_synced as u64;
        message_queue_size.store(queue_size, Ordering::Relaxed);

        // Update sync latency
        let avg_latency = network_status.average_latency_ms as u64;
        sync_latency_ms.store(avg_latency, Ordering::Relaxed);

        // Update peer response times
        let mut response_times = peer_response_times.lock().unwrap();
        for peer in network_manager.get_all_peers().await? {
            let response_time = peer.latency_ms.unwrap_or(0);
            response_times
                .entry(peer.node_id.clone())
                .or_insert_with(Vec::new)
                .push(response_time);

            // Keep only last 10 response times
            if let Some(times) = response_times.get_mut(&peer.node_id) {
                if times.len() > 10 {
                    times.remove(0);
                }
            }
        }

        Ok(())
    }

    /// Apply performance optimizations
    async fn apply_optimizations(
        network_manager: &Arc<P2PNetworkManager>,
        discovery_manager: &Arc<DiscoveryManager>,
        bridge: &Arc<DiscoveryNetworkBridge>,
        config: &OptimizationConfig,
        connection_pool_size: &Arc<AtomicU64>,
        message_queue_size: &Arc<AtomicU64>,
        sync_latency_ms: &Arc<AtomicU64>,
        peer_response_times: &Arc<Mutex<HashMap<String, Vec<u64>>>>,
    ) -> Result<()> {
        // Connection pooling optimization
        if config.enable_connection_pooling {
            Self::optimize_connection_pooling(
                network_manager,
                config,
                connection_pool_size,
            ).await?;
        }

        // Message batching optimization
        if config.enable_message_batching {
            Self::optimize_message_batching(
                network_manager,
                config,
                message_queue_size,
            ).await?;
        }

        // Adaptive sync optimization
        if config.enable_adaptive_sync {
            Self::optimize_sync_intervals(
                network_manager,
                config,
                sync_latency_ms,
            ).await?;
        }

        // Peer prioritization optimization
        if config.enable_peer_prioritization {
            Self::optimize_peer_prioritization(
                network_manager,
                discovery_manager,
                peer_response_times,
            ).await?;
        }

        Ok(())
    }

    /// Optimize connection pooling
    async fn optimize_connection_pooling(
        network_manager: &Arc<P2PNetworkManager>,
        config: &OptimizationConfig,
        connection_pool_size: &Arc<AtomicU64>,
    ) -> Result<()> {
        let current_pool_size = connection_pool_size.load(Ordering::Relaxed);
        
        if current_pool_size > config.max_connection_pool_size as u64 {
            // Reduce connection pool size
            let excess_connections = current_pool_size - config.max_connection_pool_size as u64;
            println!("Optimizing: Reducing connection pool by {}", excess_connections);
            
            // This would typically involve closing idle connections
            // For now, we just log the optimization
        } else if current_pool_size < config.max_connection_pool_size as u64 / 2 {
            // Increase connection pool size if needed
            println!("Optimizing: Connection pool size is low, consider increasing");
        }

        Ok(())
    }

    /// Optimize message batching
    async fn optimize_message_batching(
        network_manager: &Arc<P2PNetworkManager>,
        config: &OptimizationConfig,
        message_queue_size: &Arc<AtomicU64>,
    ) -> Result<()> {
        let queue_size = message_queue_size.load(Ordering::Relaxed);
        
        if queue_size > config.batch_size as u64 {
            // Queue is getting large, increase batch size
            println!("Optimizing: Message queue size is {}, increasing batch processing", queue_size);
        }

        Ok(())
    }

    /// Optimize sync intervals based on latency
    async fn optimize_sync_intervals(
        network_manager: &Arc<P2PNetworkManager>,
        config: &OptimizationConfig,
        sync_latency_ms: &Arc<AtomicU64>,
    ) -> Result<()> {
        let current_latency = sync_latency_ms.load(Ordering::Relaxed);
        
        // Adjust sync interval based on latency
        if current_latency > 1000 { // High latency
            println!("Optimizing: High sync latency ({}ms), increasing sync interval", current_latency);
        } else if current_latency < 100 { // Low latency
            println!("Optimizing: Low sync latency ({}ms), decreasing sync interval", current_latency);
        }

        Ok(())
    }

    /// Optimize peer prioritization based on response times
    async fn optimize_peer_prioritization(
        network_manager: &Arc<P2PNetworkManager>,
        discovery_manager: &Arc<DiscoveryManager>,
        peer_response_times: &Arc<Mutex<HashMap<String, Vec<u64>>>,
    ) -> Result<()> {
        let response_times = peer_response_times.lock().unwrap();
        
        // Find fastest and slowest peers
        let mut peer_stats = Vec::new();
        for (node_id, times) in response_times.iter() {
            if !times.is_empty() {
                let avg_time = times.iter().sum::<u64>() / times.len() as u64;
                peer_stats.push((node_id.clone(), avg_time));
            }
        }
        
        peer_stats.sort_by_key(|(_, time)| *time);
        
        if let Some((fastest_peer, fastest_time)) = peer_stats.first() {
            if let Some((slowest_peer, slowest_time)) = peer_stats.last() {
                if slowest_time > fastest_time * 3 {
                    println!("Optimizing: Peer {} is {}x slower than {}", 
                        slowest_peer, slowest_time / fastest_time, fastest_peer);
                }
            }
        }

        Ok(())
    }

    /// Get current performance metrics
    pub async fn get_performance_metrics(&self) -> Result<PerformanceMetrics> {
        let connection_pool_size = self.connection_pool_size.load(Ordering::Relaxed);
        let message_queue_size = self.message_queue_size.load(Ordering::Relaxed);
        let sync_latency_ms = self.sync_latency_ms.load(Ordering::Relaxed);
        
        let peer_response_times = {
            let response_times = self.peer_response_times.lock().unwrap();
            let mut stats = HashMap::new();
            
            for (node_id, times) in response_times.iter() {
                if !times.is_empty() {
                    let avg_time = times.iter().sum::<u64>() / times.len() as u64;
                    let min_time = *times.iter().min().unwrap();
                    let max_time = *times.iter().max().unwrap();
                    
                    stats.insert(node_id.clone(), PeerResponseStats {
                        average_response_time_ms: avg_time,
                        min_response_time_ms: min_time,
                        max_response_time_ms: max_time,
                        response_count: times.len() as u64,
                        last_response_time: *times.last().unwrap(),
                    });
                }
            }
            
            stats
        };

        // Generate optimization suggestions
        let optimization_suggestions = self.generate_optimization_suggestions(
            connection_pool_size,
            message_queue_size,
            sync_latency_ms,
            &peer_response_times,
        );

        Ok(PerformanceMetrics {
            connection_pool_size,
            message_queue_size,
            average_sync_latency_ms: sync_latency_ms,
            peer_response_times,
            optimization_suggestions,
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs(),
        })
    }

    /// Generate optimization suggestions based on current metrics
    fn generate_optimization_suggestions(
        &self,
        connection_pool_size: u64,
        message_queue_size: u64,
        sync_latency_ms: u64,
        peer_response_times: &HashMap<String, PeerResponseStats>,
    ) -> Vec<String> {
        let mut suggestions = Vec::new();

        // Connection pool suggestions
        if connection_pool_size > self.config.max_connection_pool_size as u64 {
            suggestions.push("Reduce connection pool size to improve memory usage".to_string());
        } else if connection_pool_size < 5 {
            suggestions.push("Increase connection pool size for better performance".to_string());
        }

        // Message queue suggestions
        if message_queue_size > self.config.batch_size as u64 * 2 {
            suggestions.push("Increase batch size to process messages more efficiently".to_string());
        }

        // Latency suggestions
        if sync_latency_ms > 1000 {
            suggestions.push("High sync latency detected, consider increasing sync intervals".to_string());
        }

        // Peer response time suggestions
        let mut response_times: Vec<u64> = peer_response_times
            .values()
            .map(|stats| stats.average_response_time_ms)
            .collect();
        
        if !response_times.is_empty() {
            response_times.sort();
            let median_response_time = response_times[response_times.len() / 2];
            
            if median_response_time > 500 {
                suggestions.push("Consider peer prioritization based on response times".to_string());
            }
        }

        suggestions
    }

    /// Apply specific optimization
    pub async fn apply_specific_optimization(&self, optimization_type: &str) -> Result<()> {
        match optimization_type {
            "connection_pooling" => {
                println!("Applying connection pooling optimization");
                // Implementation would go here
            }
            "message_batching" => {
                println!("Applying message batching optimization");
                // Implementation would go here
            }
            "adaptive_sync" => {
                println!("Applying adaptive sync optimization");
                // Implementation would go here
            }
            "peer_prioritization" => {
                println!("Applying peer prioritization optimization");
                // Implementation would go here
            }
            _ => {
                return Err(crate::error::BreznError::Generic(
                    format!("Unknown optimization type: {}", optimization_type)
                ).into());
            }
        }
        
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    #[test]
    fn test_optimization_config_default() {
        let config = OptimizationConfig::default();
        assert_eq!(config.enable_connection_pooling, true);
        assert_eq!(config.max_connection_pool_size, 20);
        assert_eq!(config.enable_message_batching, true);
    }

    #[test]
    fn test_peer_response_stats() {
        let stats = PeerResponseStats {
            average_response_time_ms: 100,
            min_response_time_ms: 50,
            max_response_time_ms: 200,
            response_count: 5,
            last_response_time: 100,
        };
        
        assert_eq!(stats.average_response_time_ms, 100);
        assert_eq!(stats.response_count, 5);
    }
}