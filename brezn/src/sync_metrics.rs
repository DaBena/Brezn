use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use serde::{Serialize, Deserialize};
use crate::types::{Post, PostConflict, FeedState, SyncStatus};

/// Performance metrics for post synchronization
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncMetrics {
    pub total_sync_operations: u64,
    pub successful_syncs: u64,
    pub failed_syncs: u64,
    pub average_sync_time_ms: f64,
    pub total_posts_synced: u64,
    pub total_conflicts_resolved: u64,
    pub network_latency_ms: f64,
    pub peer_sync_times: HashMap<String, Duration>,
    pub last_sync_timestamp: Option<u64>,
}

impl Default for SyncMetrics {
    fn default() -> Self {
        Self {
            total_sync_operations: 0,
            successful_syncs: 0,
            failed_syncs: 0,
            average_sync_time_ms: 0.0,
            total_posts_synced: 0,
            total_conflicts_resolved: 0,
            network_latency_ms: 0.0,
            peer_sync_times: HashMap::new(),
            last_sync_timestamp: None,
        }
    }
}

impl SyncMetrics {
    /// Records a successful sync operation
    pub fn record_successful_sync(&mut self, duration: Duration, posts_synced: usize) {
        self.total_sync_operations += 1;
        self.successful_syncs += 1;
        self.total_posts_synced += posts_synced as u64;
        self.last_sync_timestamp = Some(chrono::Utc::now().timestamp() as u64);
        
        // Update average sync time
        let total_time = self.average_sync_time_ms * (self.successful_syncs - 1) as f64;
        let new_average = (total_time + duration.as_millis() as f64) / self.successful_syncs as f64;
        self.average_sync_time_ms = new_average;
    }
    
    /// Records a failed sync operation
    pub fn record_failed_sync(&mut self) {
        self.total_sync_operations += 1;
        self.failed_syncs += 1;
    }
    
    /// Records peer-specific sync time
    pub fn record_peer_sync_time(&mut self, peer_id: String, duration: Duration) {
        self.peer_sync_times.insert(peer_id, duration);
    }
    
    /// Records network latency
    pub fn record_network_latency(&mut self, latency_ms: f64) {
        // Simple moving average
        if self.network_latency_ms == 0.0 {
            self.network_latency_ms = latency_ms;
        } else {
            self.network_latency_ms = (self.network_latency_ms + latency_ms) / 2.0;
        }
    }
    
    /// Records conflict resolution
    pub fn record_conflict_resolution(&mut self, conflicts_resolved: usize) {
        self.total_conflicts_resolved += conflicts_resolved as u64;
    }
    
    /// Gets sync success rate
    pub fn get_success_rate(&self) -> f64 {
        if self.total_sync_operations == 0 {
            0.0
        } else {
            (self.successful_syncs as f64 / self.total_sync_operations as f64) * 100.0
        }
    }
    
    /// Gets average posts per sync
    pub fn get_average_posts_per_sync(&self) -> f64 {
        if self.successful_syncs == 0 {
            0.0
        } else {
            self.total_posts_synced as f64 / self.successful_syncs as f64
        }
    }
    
    /// Gets performance summary
    pub fn get_performance_summary(&self) -> String {
        format!(
            "Sync Performance Summary:\n\
             Total Operations: {}\n\
             Success Rate: {:.1}%\n\
             Average Sync Time: {:.1}ms\n\
             Total Posts Synced: {}\n\
             Average Posts per Sync: {:.1}\n\
             Total Conflicts Resolved: {}\n\
             Network Latency: {:.1}ms",
            self.total_sync_operations,
            self.get_success_rate(),
            self.average_sync_time_ms,
            self.total_posts_synced,
            self.get_average_posts_per_sync(),
            self.total_conflicts_resolved,
            self.network_latency_ms
        )
    }
}

/// Performance monitor for post synchronization
pub struct SyncPerformanceMonitor {
    metrics: Arc<Mutex<SyncMetrics>>,
    active_syncs: Arc<Mutex<HashMap<String, Instant>>>,
}

impl SyncPerformanceMonitor {
    pub fn new() -> Self {
        Self {
            metrics: Arc::new(Mutex::new(SyncMetrics::default())),
            active_syncs: Arc::new(Mutex::new(HashMap::new())),
        }
    }
    
    /// Starts monitoring a sync operation
    pub fn start_sync_monitoring(&self, sync_id: String) {
        let mut active_syncs = self.active_syncs.lock().unwrap();
        active_syncs.insert(sync_id, Instant::now());
    }
    
    /// Stops monitoring a sync operation and records metrics
    pub fn stop_sync_monitoring(&self, sync_id: String, success: bool, posts_synced: usize, conflicts_resolved: usize) {
        let start_time = {
            let mut active_syncs = self.active_syncs.lock().unwrap();
            active_syncs.remove(&sync_id)
        };
        
        if let Some(start_time) = start_time {
            let duration = start_time.elapsed();
            let mut metrics = self.metrics.lock().unwrap();
            
            if success {
                metrics.record_successful_sync(duration, posts_synced);
            } else {
                metrics.record_failed_sync();
            }
            
            if conflicts_resolved > 0 {
                metrics.record_conflict_resolution(conflicts_resolved);
            }
        }
    }
    
    /// Records peer-specific sync time
    pub fn record_peer_sync_time(&self, peer_id: String, duration: Duration) {
        let mut metrics = self.metrics.lock().unwrap();
        metrics.record_peer_sync_time(peer_id, duration);
    }
    
    /// Records network latency
    pub fn record_network_latency(&self, latency_ms: f64) {
        let mut metrics = self.metrics.lock().unwrap();
        metrics.record_network_latency(latency_ms);
    }
    
    /// Gets current metrics
    pub fn get_metrics(&self) -> SyncMetrics {
        let metrics = self.metrics.lock().unwrap();
        metrics.clone()
    }
    
    /// Resets all metrics
    pub fn reset_metrics(&self) {
        let mut metrics = self.metrics.lock().unwrap();
        *metrics = SyncMetrics::default();
    }
    
    /// Exports metrics to JSON
    pub fn export_metrics(&self) -> Result<String, serde_json::Error> {
        let metrics = self.metrics.lock().unwrap();
        serde_json::to_string_pretty(&*metrics)
    }
}

/// Feed consistency checker
pub struct FeedConsistencyChecker {
    metrics: Arc<Mutex<SyncMetrics>>,
}

impl FeedConsistencyChecker {
    pub fn new(metrics: Arc<Mutex<SyncMetrics>>) -> Self {
        Self { metrics }
    }
    
    /// Checks consistency between local and peer feeds
    pub fn check_feed_consistency(&self, local_posts: &[Post], peer_posts: &[Post]) -> FeedConsistencyReport {
        let mut report = FeedConsistencyReport::new();
        
        // Check for missing posts
        let local_post_ids: std::collections::HashSet<_> = local_posts.iter()
            .map(|p| p.get_post_id().hash.clone())
            .collect();
        
        let peer_post_ids: std::collections::HashSet<_> = peer_posts.iter()
            .map(|p| p.get_post_id().hash.clone())
            .collect();
        
        // Posts missing from local feed
        let missing_local: Vec<_> = peer_posts.iter()
            .filter(|p| !local_post_ids.contains(&p.get_post_id().hash))
            .cloned()
            .collect();
        
        // Posts missing from peer feed
        let missing_peer: Vec<_> = local_posts.iter()
            .filter(|p| !peer_post_ids.contains(&p.get_post_id().hash))
            .cloned()
            .collect();
        
        report.missing_local_posts = missing_local;
        report.missing_peer_posts = missing_peer;
        report.consistency_score = self.calculate_consistency_score(local_posts.len(), peer_posts.len(), missing_local.len(), missing_peer.len());
        
        report
    }
    
    /// Calculates consistency score (0.0 = completely inconsistent, 1.0 = perfectly consistent)
    fn calculate_consistency_score(&self, local_count: usize, peer_count: usize, missing_local: usize, missing_peer: usize) -> f64 {
        let total_posts = local_count.max(peer_count);
        if total_posts == 0 {
            return 1.0;
        }
        
        let total_missing = missing_local + missing_peer;
        let consistency_score = 1.0 - (total_missing as f64 / total_posts as f64);
        
        consistency_score.max(0.0)
    }
}

/// Report for feed consistency check
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeedConsistencyReport {
    pub missing_local_posts: Vec<Post>,
    pub missing_peer_posts: Vec<Post>,
    pub consistency_score: f64,
    pub timestamp: u64,
}

impl FeedConsistencyReport {
    pub fn new() -> Self {
        Self {
            missing_local_posts: Vec::new(),
            missing_peer_posts: Vec::new(),
            consistency_score: 0.0,
            timestamp: chrono::Utc::now().timestamp() as u64,
        }
    }
    
    /// Gets summary of consistency issues
    pub fn get_summary(&self) -> String {
        format!(
            "Feed Consistency Report:\n\
             Consistency Score: {:.1}%\n\
             Missing Local Posts: {}\n\
             Missing Peer Posts: {}\n\
             Timestamp: {}",
            self.consistency_score * 100.0,
            self.missing_local_posts.len(),
            self.missing_peer_posts.len(),
            chrono::DateTime::from_timestamp(self.timestamp as i64, 0)
                .unwrap_or_else(|| chrono::Utc::now())
                .format("%Y-%m-%d %H:%M:%S")
        )
    }
    
    /// Checks if feeds are consistent (score > 0.9)
    pub fn is_consistent(&self) -> bool {
        self.consistency_score > 0.9
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::Post;
    
    #[test]
    fn test_sync_metrics() {
        let mut metrics = SyncMetrics::default();
        
        // Test successful sync recording
        metrics.record_successful_sync(Duration::from_millis(100), 5);
        assert_eq!(metrics.total_sync_operations, 1);
        assert_eq!(metrics.successful_syncs, 1);
        assert_eq!(metrics.total_posts_synced, 5);
        assert_eq!(metrics.average_sync_time_ms, 100.0);
        
        // Test failed sync recording
        metrics.record_failed_sync();
        assert_eq!(metrics.total_sync_operations, 2);
        assert_eq!(metrics.failed_syncs, 1);
        
        // Test success rate calculation
        assert_eq!(metrics.get_success_rate(), 50.0);
        
        // Test average posts per sync
        assert_eq!(metrics.get_average_posts_per_sync(), 5.0);
    }
    
    #[test]
    fn test_performance_monitor() {
        let monitor = SyncPerformanceMonitor::new();
        
        // Test sync monitoring
        monitor.start_sync_monitoring("test_sync".to_string());
        std::thread::sleep(Duration::from_millis(10));
        monitor.stop_sync_monitoring("test_sync".to_string(), true, 3, 1);
        
        let metrics = monitor.get_metrics();
        assert_eq!(metrics.total_sync_operations, 1);
        assert_eq!(metrics.successful_syncs, 1);
        assert_eq!(metrics.total_posts_synced, 3);
        assert_eq!(metrics.total_conflicts_resolved, 1);
    }
    
    #[test]
    fn test_feed_consistency_checker() {
        let metrics = Arc::new(Mutex::new(SyncMetrics::default()));
        let checker = FeedConsistencyChecker::new(metrics);
        
        // Create test posts
        let local_posts = vec![
            Post::new("Post 1".to_string(), "User1".to_string(), Some("node1".to_string())),
            Post::new("Post 2".to_string(), "User2".to_string(), Some("node1".to_string())),
        ];
        
        let peer_posts = vec![
            Post::new("Post 1".to_string(), "User1".to_string(), Some("node1".to_string())),
            Post::new("Post 3".to_string(), "User3".to_string(), Some("node2".to_string())),
        ];
        
        let report = checker.check_feed_consistency(&local_posts, &peer_posts);
        
        assert_eq!(report.missing_local_posts.len(), 1); // Post 3
        assert_eq!(report.missing_peer_posts.len(), 1); // Post 2
        assert!(report.consistency_score > 0.0);
        assert!(report.consistency_score < 1.0);
    }
}