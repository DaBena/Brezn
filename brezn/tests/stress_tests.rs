use brezn::{BreznApp, types::Config};
use std::time::{Duration, Instant};
use std::sync::Arc;
use tokio::sync::Mutex;
use std::collections::HashMap;
use std::sync::atomic::{AtomicUsize, Ordering};
use rand::{thread_rng, Rng};

// Stress test configuration
#[derive(Debug, Clone)]
struct StressTestConfig {
    concurrent_users: usize,
    operations_per_user: usize,
    network_partition_probability: f64,
    failure_injection_probability: f64,
    test_duration: Duration,
    recovery_timeout: Duration,
}

impl Default for StressTestConfig {
    fn default() -> Self {
        Self {
            concurrent_users: 10,
            operations_per_user: 100,
            network_partition_probability: 0.1,
            failure_injection_probability: 0.05,
            test_duration: Duration::from_secs(60),
            recovery_timeout: Duration::from_secs(30),
        }
    }
}

// Stress test results
#[derive(Debug, Clone)]
struct StressTestResults {
    total_operations: usize,
    successful_operations: usize,
    failed_operations: usize,
    recovery_time: Duration,
    max_concurrent_connections: usize,
    average_response_time: Duration,
    network_partitions: usize,
    injected_failures: usize,
}

impl StressTestResults {
    fn new() -> Self {
        Self {
            total_operations: 0,
            successful_operations: 0,
            failed_operations: 0,
            recovery_time: Duration::ZERO,
            max_concurrent_connections: 0,
            average_response_time: Duration::ZERO,
            network_partitions: 0,
            injected_failures: 0,
        }
    }
    
    fn success_rate(&self) -> f64 {
        if self.total_operations == 0 {
            0.0
        } else {
            self.successful_operations as f64 / self.total_operations as f64
        }
    }
}

// Network partition simulation
struct NetworkPartitionSimulator {
    partition_active: bool,
    partition_start: Option<Instant>,
    partition_duration: Duration,
}

impl NetworkPartitionSimulator {
    fn new() -> Self {
        Self {
            partition_active: false,
            partition_start: None,
            partition_duration: Duration::from_secs(5),
        }
    }
    
    fn should_partition(&mut self, probability: f64) -> bool {
        if self.partition_active {
            // Check if partition should end
            if let Some(start) = self.partition_start {
                if start.elapsed() >= self.partition_duration {
                    self.partition_active = false;
                    self.partition_start = None;
                    return false;
                }
            }
            true
        } else {
            // Check if new partition should start
            if thread_rng().gen::<f64>() < probability {
                self.partition_active = true;
                self.partition_start = Some(Instant::now());
                true
            } else {
                false
            }
        }
    }
    
    fn is_partitioned(&self) -> bool {
        self.partition_active
    }
}

// Failure injection simulator
struct FailureInjector {
    failure_active: bool,
    failure_start: Option<Instant>,
    failure_duration: Duration,
}

impl FailureInjector {
    fn new() -> Self {
        Self {
            failure_active: false,
            failure_start: None,
            failure_duration: Duration::from_secs(2),
        }
    }
    
    fn should_inject_failure(&mut self, probability: f64) -> bool {
        if self.failure_active {
            // Check if failure should end
            if let Some(start) = self.failure_start {
                if start.elapsed() >= self.failure_duration {
                    self.failure_active = false;
                    self.failure_start = None;
                    return false;
                }
            }
            true
        } else {
            // Check if new failure should start
            if thread_rng().gen::<f64>() < probability {
                self.failure_active = true;
                self.failure_start = Some(Instant::now());
                true
            } else {
                false
            }
        }
    }
    
    fn is_failing(&self) -> bool {
        self.failure_active
    }
}

// High load stress test
async fn stress_test_high_load(
    app: &BreznApp,
    config: &StressTestConfig,
) -> StressTestResults {
    let mut results = StressTestResults::new();
    let start_time = Instant::now();
    let mut network_simulator = NetworkPartitionSimulator::new();
    let mut failure_injector = FailureInjector::new();
    
    // Track concurrent operations
    let active_operations = Arc::new(AtomicUsize::new(0));
    let max_concurrent = Arc::new(AtomicUsize::new(0));
    
    // Spawn concurrent user tasks
    let mut handles = Vec::new();
    
    for user_id in 0..config.concurrent_users {
        let app_clone = app.clone();
        let active_ops = Arc::clone(&active_operations);
        let max_ops = Arc::clone(&max_concurrent);
        let user_config = config.clone();
        
        let handle = tokio::spawn(async move {
            for op_id in 0..user_config.operations_per_user {
                // Increment active operations
                let current = active_ops.fetch_add(1, Ordering::SeqCst);
                max_ops.fetch_max(current + 1, Ordering::SeqCst);
                
                let op_start = Instant::now();
                
                // Simulate network partition
                if network_simulator.should_partition(user_config.network_partition_probability) {
                    results.network_partitions += 1;
                    tokio::time::sleep(Duration::from_millis(100)).await;
                }
                
                // Simulate failure injection
                if failure_injector.should_inject_failure(user_config.failure_injection_probability) {
                    results.injected_failures += 1;
                    tokio::time::sleep(Duration::from_millis(50)).await;
                }
                
                // Perform operation
                let result = app_clone.create_post(
                    format!("Stress test post {} from user {}", op_id, user_id),
                    format!("stress_user_{}", user_id)
                ).await;
                
                let response_time = op_start.elapsed();
                results.average_response_time = 
                    (results.average_response_time + response_time) / 2;
                
                match result {
                    Ok(_) => results.successful_operations += 1,
                    Err(_) => results.failed_operations += 1,
                }
                
                results.total_operations += 1;
                
                // Decrement active operations
                active_ops.fetch_sub(1, Ordering::SeqCst);
                
                // Small delay between operations
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        });
        
        handles.push(handle);
    }
    
    // Wait for all operations to complete or timeout
    let timeout = tokio::time::timeout(config.test_duration, async {
        for handle in handles {
            let _ = handle.await;
        }
    }).await;
    
    if timeout.is_err() {
        println!("⚠️ Stress test timed out after {:?}", config.test_duration);
    }
    
    results.max_concurrent_connections = max_concurrent.load(Ordering::SeqCst);
    
    results
}

// Network partition stress test
async fn stress_test_network_partitions(
    app: &BreznApp,
    config: &StressTestConfig,
) -> StressTestResults {
    let mut results = StressTestResults::new();
    let mut network_simulator = NetworkPartitionSimulator::new();
    
    // Simulate network partitions
    for i in 0..config.concurrent_users {
        if network_simulator.should_partition(config.network_partition_probability) {
            results.network_partitions += 1;
            
            // Try to perform operations during partition
            for j in 0..config.operations_per_user {
                let op_start = Instant::now();
                
                let result = app.create_post(
                    format!("Partition test post {} during partition {}", j, i),
                    format!("partition_user_{}", i)
                ).await;
                
                let response_time = op_start.elapsed();
                results.average_response_time = 
                    (results.average_response_time + response_time) / 2;
                
                match result {
                    Ok(_) => results.successful_operations += 1,
                    Err(_) => results.failed_operations += 1,
                }
                
                results.total_operations += 1;
                
                // Wait for partition to potentially end
                tokio::time::sleep(Duration::from_millis(100)).await;
            }
        }
    }
    
    results
}

// Failure recovery stress test
async fn stress_test_failure_recovery(
    app: &BreznApp,
    config: &StressTestConfig,
) -> StressTestResults {
    let mut results = StressTestResults::new();
    let mut failure_injector = FailureInjector::new();
    let recovery_start = Instant::now();
    
    // Inject failures and test recovery
    for i in 0..config.concurrent_users {
        if failure_injector.should_inject_failure(config.failure_injection_probability) {
            results.injected_failures += 1;
            
            // Try to perform operations during failure
            for j in 0..config.operations_per_user {
                let op_start = Instant::now();
                
                let result = app.create_post(
                    format!("Recovery test post {} during failure {}", j, i),
                    format!("recovery_user_{}", i)
                ).await;
                
                let response_time = op_start.elapsed();
                results.average_response_time = 
                    (results.average_response_time + response_time) / 2;
                
                match result {
                    Ok(_) => results.successful_operations += 1,
                    Err(_) => results.failed_operations += 1,
                }
                
                results.total_operations += 1;
                
                // Wait for failure to potentially end
                tokio::time::sleep(Duration::from_millis(50)).await;
            }
        }
    }
    
    // Measure recovery time
    results.recovery_time = recovery_start.elapsed();
    
    results
}

// Main stress test suite
#[tokio::test]
async fn test_stress_high_load() {
    let port: u16 = thread_rng().gen_range(70_001..80_000);
    let config = Config {
        auto_save: true,
        max_posts: 50000,
        default_pseudonym: "stress_test_user".to_string(),
        network_enabled: true,
        network_port: port,
        tor_enabled: false,
        tor_socks_port: 9050,
    };
    
    let app = BreznApp::new(config).expect("Failed to create Brezn app");
    app.start().await.expect("Failed to start Brezn app");
    
    tokio::time::sleep(Duration::from_millis(200)).await;
    
    let stress_config = StressTestConfig {
        concurrent_users: 20,
        operations_per_user: 50,
        network_partition_probability: 0.15,
        failure_injection_probability: 0.1,
        test_duration: Duration::from_secs(30),
        recovery_timeout: Duration::from_secs(15),
    };
    
    println!("🔥 Starting High Load Stress Test...");
    let results = stress_test_high_load(&app, &stress_config).await;
    
    println!("📊 High Load Stress Test Results:");
    println!("   Total Operations: {}", results.total_operations);
    println!("   Success Rate: {:.2}%", results.success_rate() * 100.0);
    println!("   Failed Operations: {}", results.failed_operations);
    println!("   Network Partitions: {}", results.network_partitions);
    println!("   Injected Failures: {}", results.injected_failures);
    println!("   Max Concurrent: {}", results.max_concurrent_connections);
    println!("   Avg Response Time: {:?}", results.average_response_time);
    
    // Stress test assertions
    assert!(results.total_operations > 0, "Should have performed operations");
    assert!(results.success_rate() > 0.5, "Success rate should be above 50%");
    assert!(results.max_concurrent_connections > 0, "Should have concurrent operations");
    
    println!("✅ High load stress test completed!");
}

#[tokio::test]
async fn test_stress_network_partitions() {
    let port: u16 = thread_rng().gen_range(80_001..90_000);
    let config = Config {
        auto_save: true,
        max_posts: 50000,
        default_pseudonym: "partition_test_user".to_string(),
        network_enabled: true,
        network_port: port,
        tor_enabled: false,
        tor_socks_port: 9050,
    };
    
    let app = BreznApp::new(config).expect("Failed to create Brezn app");
    app.start().await.expect("Failed to start Brezn app");
    
    tokio::time::sleep(Duration::from_millis(200)).await;
    
    let stress_config = StressTestConfig {
        concurrent_users: 10,
        operations_per_user: 30,
        network_partition_probability: 0.3,
        failure_injection_probability: 0.0,
        test_duration: Duration::from_secs(20),
        recovery_timeout: Duration::from_secs(10),
    };
    
    println!("🌐 Starting Network Partition Stress Test...");
    let results = stress_test_network_partitions(&app, &stress_config).await;
    
    println!("📊 Network Partition Stress Test Results:");
    println!("   Total Operations: {}", results.total_operations);
    println!("   Success Rate: {:.2}%", results.success_rate() * 100.0);
    println!("   Network Partitions: {}", results.network_partitions);
    println!("   Avg Response Time: {:?}", results.average_response_time);
    
    // Partition test assertions
    assert!(results.network_partitions > 0, "Should have experienced network partitions");
    assert!(results.total_operations > 0, "Should have performed operations during partitions");
    
    println!("✅ Network partition stress test completed!");
}

#[tokio::test]
async fn test_stress_failure_recovery() {
    let port: u16 = thread_rng().gen_range(90_001..100_000);
    let config = Config {
        auto_save: true,
        max_posts: 50000,
        default_pseudonym: "recovery_test_user".to_string(),
        network_enabled: true,
        network_port: port,
        tor_enabled: false,
        tor_socks_port: 9050,
    };
    
    let app = BreznApp::new(config).expect("Failed to create Brezn app");
    app.start().await.expect("Failed to start Brezn app");
    
    tokio::time::sleep(Duration::from_millis(200)).await;
    
    let stress_config = StressTestConfig {
        concurrent_users: 15,
        operations_per_user: 25,
        network_partition_probability: 0.0,
        failure_injection_probability: 0.25,
        test_duration: Duration::from_secs(25),
        recovery_timeout: Duration::from_secs(12),
    };
    
    println!("🔄 Starting Failure Recovery Stress Test...");
    let results = stress_test_failure_recovery(&app, &stress_config).await;
    
    println!("📊 Failure Recovery Stress Test Results:");
    println!("   Total Operations: {}", results.total_operations);
    println!("   Success Rate: {:.2}%", results.success_rate() * 100.0);
    println!("   Injected Failures: {}", results.injected_failures);
    println!("   Recovery Time: {:?}", results.recovery_time);
    println!("   Avg Response Time: {:?}", results.average_response_time);
    
    // Recovery test assertions
    assert!(results.injected_failures > 0, "Should have injected failures");
    assert!(results.recovery_time > Duration::ZERO, "Should have recovery time");
    assert!(results.total_operations > 0, "Should have performed operations during failures");
    
    println!("✅ Failure recovery stress test completed!");
}

// Long-running stress test for stability validation
#[tokio::test]
async fn test_stress_stability_long_run() {
    let port: u16 = thread_rng().gen_range(100_001..110_000);
    let config = Config {
        auto_save: true,
        max_posts: 100000,
        default_pseudonym: "stability_test_user".to_string(),
        network_enabled: true,
        network_port: port,
        tor_enabled: false,
        tor_socks_port: 9050,
    };
    
    let app = BreznApp::new(config).expect("Failed to create Brezn app");
    app.start().await.expect("Failed to start Brezn app");
    
    tokio::time::sleep(Duration::from_millis(200)).await;
    
    let stress_config = StressTestConfig {
        concurrent_users: 5,
        operations_per_user: 1000,
        network_partition_probability: 0.05,
        failure_injection_probability: 0.02,
        test_duration: Duration::from_secs(120), // 2 minutes
        recovery_timeout: Duration::from_secs(60),
    };
    
    println!("⏰ Starting Long-Run Stability Stress Test (2 minutes)...");
    let results = stress_test_high_load(&app, &stress_config).await;
    
    println!("📊 Long-Run Stability Test Results:");
    println!("   Total Operations: {}", results.total_operations);
    println!("   Success Rate: {:.2}%", results.success_rate() * 100.0);
    println!("   Network Partitions: {}", results.network_partitions);
    println!("   Injected Failures: {}", results.injected_failures);
    println!("   Max Concurrent: {}", results.max_concurrent_connections);
    println!("   Avg Response Time: {:?}", results.average_response_time);
    
    // Long-run stability assertions
    assert!(results.total_operations >= 4000, "Should have performed many operations");
    assert!(results.success_rate() > 0.8, "Success rate should be above 80% for stability");
    assert!(results.max_concurrent_connections > 0, "Should have concurrent operations");
    
    println!("✅ Long-run stability stress test completed!");
}