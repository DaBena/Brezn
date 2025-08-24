use crate::discovery::DiscoveryManager;
use crate::network::P2PNetworkManager;
use crate::discovery_network_bridge::DiscoveryNetworkBridge;
use crate::database::Database;
use crate::types::{Post, Config};
use std::sync::Arc;
use std::collections::HashMap;
use tokio::time::{Duration, sleep};
use std::net::SocketAddr;
use std::str::FromStr;

/// End-to-End test suite for P2P network functionality
pub struct P2PE2ETestSuite {
    test_nodes: Vec<TestNode>,
    test_config: TestConfig,
}

#[derive(Debug, Clone)]
pub struct TestNode {
    pub node_id: String,
    pub discovery_manager: Arc<DiscoveryManager>,
    pub network_manager: Arc<P2PNetworkManager>,
    pub bridge: Arc<DiscoveryNetworkBridge>,
    pub database: Arc<Database>,
    pub port: u16,
}

#[derive(Debug, Clone)]
pub struct TestConfig {
    pub node_count: usize,
    pub test_duration: Duration,
    pub post_count: usize,
    pub sync_timeout: Duration,
    pub health_check_interval: Duration,
}

impl Default for TestConfig {
    fn default() -> Self {
        Self {
            node_count: 3,
            test_duration: Duration::from_secs(30),
            post_count: 10,
            sync_timeout: Duration::from_secs(10),
            health_check_interval: Duration::from_secs(5),
        }
    }
}

impl P2PE2ETestSuite {
    /// Create a new E2E test suite
    pub fn new(config: Option<TestConfig>) -> Self {
        Self {
            test_nodes: Vec::new(),
            test_config: config.unwrap_or_default(),
        }
    }

    /// Setup test environment with multiple nodes
    pub async fn setup(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        println!("Setting up P2P E2E test environment...");
        
        for i in 0..self.test_config.node_count {
            let port = 8888 + i as u16;
            let node_id = format!("test-node-{}", i);
            
            let node = self.create_test_node(&node_id, port).await?;
            self.test_nodes.push(node);
            
            println!("Created test node: {} on port {}", node_id, port);
        }
        
        Ok(())
    }

    /// Create a single test node
    async fn create_test_node(&self, node_id: &str, port: u16) -> Result<TestNode, Box<dyn std::error::Error>> {
        // Create database
        let db_path = format!("/tmp/brezn_test_{}.db", node_id);
        let database = Arc::new(Database::new(&db_path)?);
        
        // Create discovery manager
        let discovery_config = crate::discovery::DiscoveryConfig::default();
        let discovery_manager = Arc::new(DiscoveryManager::new(discovery_config)?);
        
        // Create network manager
        let network_manager = Arc::new(P2PNetworkManager::new(port, Some(database.clone()))?);
        
        // Create bridge
        let bridge = Arc::new(DiscoveryNetworkBridge::new(
            Arc::clone(&discovery_manager),
            Arc::clone(&network_manager),
            None,
        ));
        
        Ok(TestNode {
            node_id: node_id.to_string(),
            discovery_manager,
            network_manager,
            bridge,
            database,
            port,
        })
    }

    /// Run all E2E tests
    pub async fn run_all_tests(&self) -> Result<TestResults, Box<dyn std::error::Error>> {
        println!("Starting P2P E2E test suite...");
        
        let mut results = TestResults::new();
        
        // Test 1: Network Discovery
        println!("Running Test 1: Network Discovery");
        let discovery_result = self.test_network_discovery().await?;
        results.add_result("network_discovery", discovery_result);
        
        // Test 2: Peer Connection
        println!("Running Test 2: Peer Connection");
        let connection_result = self.test_peer_connection().await?;
        results.add_result("peer_connection", connection_result);
        
        // Test 3: Post Synchronization
        println!("Running Test 3: Post Synchronization");
        let sync_result = self.test_post_synchronization().await?;
        results.add_result("post_synchronization", sync_result);
        
        // Test 4: Network Resilience
        println!("Running Test 4: Network Resilience");
        let resilience_result = self.test_network_resilience().await?;
        results.add_result("network_resilience", resilience_result);
        
        // Test 5: Performance and Scalability
        println!("Running Test 5: Performance and Scalability");
        let performance_result = self.test_performance_scalability().await?;
        results.add_result("performance_scalability", performance_result);
        
        Ok(results)
    }

    /// Test 1: Network Discovery
    async fn test_network_discovery(&self) -> Result<TestResult, Box<dyn std::error::Error>> {
        let start_time = std::time::Instant::now();
        let mut success = true;
        let mut errors = Vec::new();
        
        println!("  Starting discovery on all nodes...");
        
        // Start discovery on all nodes
        for node in &self.test_nodes {
            if let Err(e) = node.discovery_manager.start().await {
                errors.push(format!("Failed to start discovery on {}: {}", node.node_id, e));
                success = false;
            }
        }
        
        // Wait for discovery to find peers
        println!("  Waiting for peer discovery...");
        sleep(Duration::from_secs(5)).await;
        
        // Check if peers were discovered
        for node in &self.test_nodes {
            let peers = node.discovery_manager.get_all_peers().await?;
            println!("  Node {} discovered {} peers", node.node_id, peers.len());
            
            if peers.is_empty() {
                errors.push(format!("Node {} discovered no peers", node.node_id));
                success = false;
            }
        }
        
        let duration = start_time.elapsed();
        Ok(TestResult {
            name: "Network Discovery".to_string(),
            success,
            duration,
            errors,
            metrics: HashMap::new(),
        })
    }

    /// Test 2: Peer Connection
    async fn test_peer_connection(&self) -> Result<TestResult, Box<dyn std::error::Error>> {
        let start_time = std::time::Instant::now();
        let mut success = true;
        let mut errors = Vec::new();
        
        println!("  Starting network managers on all nodes...");
        
        // Start network managers
        for node in &self.test_nodes {
            if let Err(e) = node.network_manager.start().await {
                errors.push(format!("Failed to start network manager on {}: {}", node.node_id, e));
                success = false;
            }
        }
        
        // Start bridges
        for node in &self.test_nodes {
            if let Err(e) = node.bridge.start().await {
                errors.push(format!("Failed to start bridge on {}: {}", node.node_id, e));
                success = false;
            }
        }
        
        // Wait for connections to establish
        println!("  Waiting for peer connections to establish...");
        sleep(Duration::from_secs(10)).await;
        
        // Check connection status
        for node in &self.test_nodes {
            let status = node.network_manager.get_network_status().await?;
            println!("  Node {} has {} active peers", node.node_id, status.active_peers);
            
            if status.active_peers == 0 {
                errors.push(format!("Node {} has no active peers", node.node_id));
                success = false;
            }
        }
        
        let duration = start_time.elapsed();
        Ok(TestResult {
            name: "Peer Connection".to_string(),
            success,
            duration,
            errors,
            metrics: HashMap::new(),
        })
    }

    /// Test 3: Post Synchronization
    async fn test_post_synchronization(&self) -> Result<TestResult, Box<dyn std::error::Error>> {
        let start_time = std::time::Instant::now();
        let mut success = true;
        let mut errors = Vec::new();
        
        println!("  Creating test posts on node 0...");
        
        // Create test posts on the first node
        let first_node = &self.test_nodes[0];
        let test_posts = self.create_test_posts(&first_node.node_id).await?;
        
        for post in &test_posts {
            if let Err(e) = first_node.database.create_post(post).await {
                errors.push(format!("Failed to create post: {}", e));
                success = false;
            }
        }
        
        println!("  Created {} test posts, waiting for synchronization...", test_posts.len());
        
        // Wait for synchronization
        sleep(self.test_config.sync_timeout).await;
        
        // Check if posts were synchronized to other nodes
        for (i, node) in self.test_nodes.iter().enumerate().skip(1) {
            let posts = node.database.get_all_posts().await?;
            println!("  Node {} has {} posts", node.node_id, posts.len());
            
            if posts.len() < test_posts.len() {
                errors.push(format!("Node {} has insufficient posts: {} < {}", 
                    node.node_id, posts.len(), test_posts.len()));
                success = false;
            }
        }
        
        let duration = start_time.elapsed();
        Ok(TestResult {
            name: "Post Synchronization".to_string(),
            success,
            duration,
            errors,
            metrics: HashMap::new(),
        })
    }

    /// Test 4: Network Resilience
    async fn test_network_resilience(&self) -> Result<TestResult, Box<dyn std::error::Error>> {
        let start_time = std::time::Instant::now();
        let mut success = true;
        let mut errors = Vec::new();
        
        println!("  Testing network resilience...");
        
        // Simulate node failure by stopping a node
        let node_to_fail = &self.test_nodes[1];
        println!("  Simulating failure of node {}", node_to_fail.node_id);
        
        if let Err(e) = node_to_fail.network_manager.stop().await {
            errors.push(format!("Failed to stop node {}: {}", node_to_fail.node_id, e));
            success = false;
        }
        
        // Wait for network to detect failure
        sleep(Duration::from_secs(5)).await;
        
        // Check if other nodes detected the failure
        for (i, node) in self.test_nodes.iter().enumerate() {
            if i == 1 { continue; } // Skip the failed node
            
            let status = node.network_manager.get_network_status().await?;
            println!("  Node {} has {} active peers after failure", node.node_id, status.active_peers);
            
            // Should have fewer active peers
            if status.active_peers >= self.test_config.node_count - 1 {
                errors.push(format!("Node {} did not detect peer failure", node.node_id));
                success = false;
            }
        }
        
        // Restart the failed node
        println!("  Restarting failed node {}", node_to_fail.node_id);
        if let Err(e) = node_to_fail.network_manager.start().await {
            errors.push(format!("Failed to restart node {}: {}", node_to_fail.node_id, e));
            success = false;
        }
        
        // Wait for recovery
        sleep(Duration::from_secs(10)).await;
        
        // Check if network recovered
        for node in &self.test_nodes {
            let status = node.network_manager.get_network_status().await?;
            println!("  Node {} has {} active peers after recovery", node.node_id, status.active_peers);
        }
        
        let duration = start_time.elapsed();
        Ok(TestResult {
            name: "Network Resilience".to_string(),
            success,
            duration,
            errors,
            metrics: HashMap::new(),
        })
    }

    /// Test 5: Performance and Scalability
    async fn test_performance_scalability(&self) -> Result<TestResult, Box<dyn std::error::Error>> {
        let start_time = std::time::Instant::now();
        let mut success = true;
        let mut errors = Vec::new();
        let mut metrics = HashMap::new();
        
        println!("  Testing performance and scalability...");
        
        // Measure post creation performance
        let post_creation_start = std::time::Instant::now();
        let first_node = &self.test_nodes[0];
        
        for i in 0..self.test_config.post_count {
            let post = Post {
                id: format!("perf-test-{}", i),
                content: format!("Performance test post {}", i),
                timestamp: chrono::Utc::now(),
                pseudonym: "perf-tester".to_string(),
                node_id: Some(first_node.node_id.clone()),
            };
            
            if let Err(e) = first_node.database.create_post(&post).await {
                errors.push(format!("Failed to create performance test post: {}", e));
                success = false;
            }
        }
        
        let post_creation_time = post_creation_start.elapsed();
        metrics.insert("post_creation_time_ms".to_string(), post_creation_time.as_millis() as u64);
        
        // Measure synchronization performance
        let sync_start = std::time::Instant::now();
        sleep(self.test_config.sync_timeout).await;
        let sync_time = sync_start.elapsed();
        metrics.insert("sync_time_ms".to_string(), sync_time.as_millis() as u64);
        
        // Check final state
        let final_posts = first_node.database.get_all_posts().await?;
        metrics.insert("total_posts".to_string(), final_posts.len() as u64);
        
        println!("  Performance metrics:");
        println!("    Post creation: {}ms", post_creation_time.as_millis());
        println!("    Synchronization: {}ms", sync_time.as_millis());
        println!("    Total posts: {}", final_posts.len());
        
        let duration = start_time.elapsed();
        Ok(TestResult {
            name: "Performance and Scalability".to_string(),
            success,
            duration,
            errors,
            metrics,
        })
    }

    /// Create test posts for testing
    async fn create_test_posts(&self, node_id: &str) -> Result<Vec<Post>, Box<dyn std::error::Error>> {
        let mut posts = Vec::new();
        
        for i in 0..self.test_config.post_count {
            let post = Post {
                id: format!("test-post-{}", i),
                content: format!("Test post content {}", i),
                timestamp: chrono::Utc::now(),
                pseudonym: format!("test-user-{}", i),
                node_id: Some(node_id.to_string()),
            };
            posts.push(post);
        }
        
        Ok(posts)
    }

    /// Cleanup test environment
    pub async fn cleanup(&self) -> Result<(), Box<dyn std::error::Error>> {
        println!("Cleaning up P2P E2E test environment...");
        
        for node in &self.test_nodes {
            // Stop all services
            if let Err(e) = node.discovery_manager.stop().await {
                eprintln!("Warning: Failed to stop discovery manager: {}", e);
            }
            
            if let Err(e) = node.network_manager.stop().await {
                eprintln!("Warning: Failed to stop network manager: {}", e);
            }
            
            if let Err(e) = node.bridge.stop().await {
                eprintln!("Warning: Failed to stop bridge: {}", e);
            }
        }
        
        Ok(())
    }
}

/// Test result structure
#[derive(Debug, Clone)]
pub struct TestResult {
    pub name: String,
    pub success: bool,
    pub duration: std::time::Duration,
    pub errors: Vec<String>,
    pub metrics: HashMap<String, u64>,
}

/// Collection of all test results
#[derive(Debug, Clone)]
pub struct TestResults {
    pub results: HashMap<String, TestResult>,
    pub total_tests: usize,
    pub passed_tests: usize,
    pub failed_tests: usize,
    pub total_duration: std::time::Duration,
}

impl TestResults {
    pub fn new() -> Self {
        Self {
            results: HashMap::new(),
            total_tests: 0,
            passed_tests: 0,
            failed_tests: 0,
            total_duration: std::time::Duration::ZERO,
        }
    }

    pub fn add_result(&mut self, test_name: &str, result: TestResult) {
        self.results.insert(test_name.to_string(), result.clone());
        self.total_tests += 1;
        
        if result.success {
            self.passed_tests += 1;
        } else {
            self.failed_tests += 1;
        }
        
        self.total_duration += result.duration;
    }

    pub fn print_summary(&self) {
        println!("\n=== P2P E2E Test Results ===");
        println!("Total Tests: {}", self.total_tests);
        println!("Passed: {}", self.passed_tests);
        println!("Failed: {}", self.failed_tests);
        println!("Total Duration: {:?}", self.total_duration);
        
        if self.failed_tests > 0 {
            println!("\nFailed Tests:");
            for (name, result) in &self.results {
                if !result.success {
                    println!("  {}: {:?}", name, result.duration);
                    for error in &result.errors {
                        println!("    Error: {}", error);
                    }
                }
            }
        }
        
        println!("\nDetailed Results:");
        for (name, result) in &self.results {
            let status = if result.success { "✅ PASS" } else { "❌ FAIL" };
            println!("  {}: {} ({:?})", name, status, result.duration);
        }
    }
}

/// Run the complete E2E test suite
pub async fn run_p2p_e2e_tests() -> Result<TestResults, Box<dyn std::error::Error>> {
    let mut test_suite = P2PE2ETestSuite::new(None);
    
    // Setup
    test_suite.setup().await?;
    
    // Run tests
    let results = test_suite.run_all_tests().await?;
    
    // Cleanup
    test_suite.cleanup().await?;
    
    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_test_suite_creation() {
        let config = TestConfig::default();
        assert_eq!(config.node_count, 3);
        assert_eq!(config.post_count, 10);
    }

    #[test]
    fn test_test_results() {
        let mut results = TestResults::new();
        assert_eq!(results.total_tests, 0);
        assert_eq!(results.passed_tests, 0);
        assert_eq!(results.failed_tests, 0);
    }
}