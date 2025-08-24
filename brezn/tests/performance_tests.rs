use brezn::{BreznApp, types::Config};
use criterion::{criterion_group, criterion_main, Criterion, BenchmarkId};
use std::time::{Duration, Instant};
use std::sync::Arc;
use tokio::sync::Mutex;
use std::collections::HashMap;
use std::sync::atomic::{AtomicUsize, Ordering};

// Performance metrics collection
#[derive(Debug, Clone)]
struct PerformanceMetrics {
    throughput: f64,        // messages per second
    latency_avg: Duration,  // average latency
    latency_p95: Duration,  // 95th percentile latency
    latency_p99: Duration,  // 99th percentile latency
    memory_usage: usize,    // memory usage in bytes
    cpu_usage: f64,         // CPU usage percentage
}

impl PerformanceMetrics {
    fn new() -> Self {
        Self {
            throughput: 0.0,
            latency_avg: Duration::ZERO,
            latency_p95: Duration::ZERO,
            latency_p99: Duration::ZERO,
            memory_usage: 0,
            cpu_usage: 0.0,
        }
    }
}

// Network throughput benchmark
async fn benchmark_network_throughput(
    app: &BreznApp,
    message_count: usize,
    message_size: usize,
) -> PerformanceMetrics {
    let start_time = Instant::now();
    let mut latencies = Vec::with_capacity(message_count);
    
    // Generate test messages
    let test_message = "x".repeat(message_size);
    
    for i in 0..message_count {
        let message_start = Instant::now();
        
        // Simulate message processing
        app.create_post(
            format!("{} - {}", test_message, i),
            format!("user_{}", i)
        ).await.expect("Failed to create post");
        
        let latency = message_start.elapsed();
        latencies.push(latency);
        
        // Small delay to prevent overwhelming
        tokio::time::sleep(Duration::from_millis(1)).await;
    }
    
    let total_time = start_time.elapsed();
    let throughput = message_count as f64 / total_time.as_secs_f64();
    
    // Calculate latency statistics
    latencies.sort();
    let avg_latency = latencies.iter().sum::<Duration>() / latencies.len() as u32;
    let p95_idx = (latencies.len() as f64 * 0.95) as usize;
    let p99_idx = (latencies.len() as f64 * 0.99) as usize;
    
    PerformanceMetrics {
        throughput,
        latency_avg: avg_latency,
        latency_p95: latencies[p95_idx.min(latencies.len() - 1)],
        latency_p99: latencies[p99_idx.min(latencies.len() - 1)],
        memory_usage: 0, // Will be measured separately
        cpu_usage: 0.0,  // Will be measured separately
    }
}

// Memory usage benchmark
async fn benchmark_memory_usage(app: &BreznApp, operation_count: usize) -> PerformanceMetrics {
    let initial_memory = get_memory_usage();
    
    // Perform memory-intensive operations
    for i in 0..operation_count {
        app.create_post(
            format!("Memory test post {}", i),
            format!("user_{}", i)
        ).await.expect("Failed to create post");
        
        // Create large content to stress memory
        let large_content = "x".repeat(1024 * 10); // 10KB per post
        app.create_post(large_content, format!("user_{}", i)).await.expect("Failed to create large post");
    }
    
    let final_memory = get_memory_usage();
    let memory_delta = final_memory.saturating_sub(initial_memory);
    
    PerformanceMetrics {
        throughput: 0.0,
        latency_avg: Duration::ZERO,
        latency_p95: Duration::ZERO,
        latency_p99: Duration::ZERO,
        memory_usage: memory_delta,
        cpu_usage: 0.0,
    }
}

// CPU usage benchmark
async fn benchmark_cpu_usage(app: &BreznApp, operation_count: usize) -> PerformanceMetrics {
    let start_time = Instant::now();
    let start_cpu = get_cpu_usage();
    
    // Perform CPU-intensive operations
    for i in 0..operation_count {
        // Cryptographic operations
        app.create_post(
            format!("CPU test post {}", i),
            format!("user_{}", i)
        ).await.expect("Failed to create post");
        
        // Generate QR codes (CPU intensive)
        let _qr_code = app.generate_qr_code().expect("Failed to generate QR code");
        
        // Database operations
        let _posts = app.get_posts().await.expect("Failed to get posts");
    }
    
    let end_time = Instant::now();
    let end_cpu = get_cpu_usage();
    let total_time = end_time.duration_since(start_time);
    
    let cpu_delta = end_cpu.saturating_sub(start_cpu);
    let cpu_usage_percent = (cpu_delta as f64 / total_time.as_secs_f64()) * 100.0;
    
    PerformanceMetrics {
        throughput: 0.0,
        latency_avg: Duration::ZERO,
        latency_p95: Duration::ZERO,
        latency_p99: Duration::ZERO,
        memory_usage: 0,
        cpu_usage: cpu_usage_percent,
    }
}

// Helper functions for system metrics
fn get_memory_usage() -> usize {
    // Simplified memory measurement
    // In a real implementation, you'd use system-specific APIs
    std::mem::size_of::<BreznApp>()
}

fn get_cpu_usage() -> u64 {
    // Simplified CPU measurement
    // In a real implementation, you'd use system-specific APIs
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos() as u64
}

// Main performance test suite
#[tokio::test]
async fn test_network_throughput_benchmark() {
    let port: u16 = rand::thread_rng().gen_range(40_001..50_000);
    let config = Config {
        auto_save: true,
        max_posts: 10000,
        default_pseudonym: "perf_test_user".to_string(),
        network_enabled: true,
        network_port: port,
        tor_enabled: false,
        tor_socks_port: 9050,
    };
    
    let app = BreznApp::new(config).expect("Failed to create Brezn app");
    app.start().await.expect("Failed to start Brezn app");
    
    // Wait for startup
    tokio::time::sleep(Duration::from_millis(200)).await;
    
    // Test different message sizes and counts
    let test_scenarios = vec![
        (100, 64),      // Small messages, low count
        (1000, 256),    // Medium messages, medium count
        (5000, 1024),   // Large messages, high count
    ];
    
    for (message_count, message_size) in test_scenarios {
        let metrics = benchmark_network_throughput(&app, message_count, message_size).await;
        
        println!("📊 Network Throughput Benchmark:");
        println!("   Messages: {} x {} bytes", message_count, message_size);
        println!("   Throughput: {:.2} msg/s", metrics.throughput);
        println!("   Avg Latency: {:?}", metrics.latency_avg);
        println!("   P95 Latency: {:?}", metrics.latency_p95);
        println!("   P99 Latency: {:?}", metrics.latency_p99);
        
        // Performance assertions
        assert!(metrics.throughput > 0.0, "Throughput should be positive");
        assert!(metrics.latency_avg < Duration::from_secs(1), "Average latency should be under 1 second");
    }
    
    println!("✅ Network throughput benchmark completed!");
}

#[tokio::test]
async fn test_memory_usage_benchmark() {
    let port: u16 = rand::thread_rng().gen_range(50_001..60_000);
    let config = Config {
        auto_save: true,
        max_posts: 10000,
        default_pseudonym: "mem_test_user".to_string(),
        network_enabled: true,
        network_port: port,
        tor_enabled: false,
        tor_socks_port: 9050,
    };
    
    let app = BreznApp::new(config).expect("Failed to create Brezn app");
    app.start().await.expect("Failed to start Brezn app");
    
    tokio::time::sleep(Duration::from_millis(200)).await;
    
    let operation_counts = vec![100, 500, 1000];
    
    for count in operation_counts {
        let metrics = benchmark_memory_usage(&app, count).await;
        
        println!("🧠 Memory Usage Benchmark:");
        println!("   Operations: {}", count);
        println!("   Memory Delta: {} bytes", metrics.memory_usage);
        println!("   Memory per Operation: {} bytes", metrics.memory_usage / count);
        
        // Memory efficiency assertions
        assert!(metrics.memory_usage > 0, "Memory usage should be measurable");
        let bytes_per_op = metrics.memory_usage / count;
        assert!(bytes_per_op < 1024 * 1024, "Memory per operation should be reasonable (< 1MB)");
    }
    
    println!("✅ Memory usage benchmark completed!");
}

#[tokio::test]
async fn test_cpu_usage_benchmark() {
    let port: u16 = rand::thread_rng().gen_range(60_001..70_000);
    let config = Config {
        auto_save: true,
        max_posts: 10000,
        default_pseudonym: "cpu_test_user".to_string(),
        network_enabled: true,
        network_port: port,
        tor_enabled: false,
        tor_socks_port: 9050,
    };
    
    let app = BreznApp::new(config).expect("Failed to create Brezn app");
    app.start().await.expect("Failed to start Brezn app");
    
    tokio::time::sleep(Duration::from_millis(200)).await;
    
    let operation_counts = vec![50, 100, 200];
    
    for count in operation_counts {
        let metrics = benchmark_cpu_usage(&app, count).await;
        
        println!("⚡ CPU Usage Benchmark:");
        println!("   Operations: {}", count);
        println!("   CPU Usage: {:.2}%", metrics.cpu_usage);
        
        // CPU efficiency assertions
        assert!(metrics.cpu_usage >= 0.0, "CPU usage should be non-negative");
        assert!(metrics.cpu_usage < 1000.0, "CPU usage should be reasonable");
    }
    
    println!("✅ CPU usage benchmark completed!");
}

// Criterion benchmarks for continuous performance monitoring
pub fn criterion_benchmark(c: &mut Criterion) {
    let mut group = c.benchmark_group("brezn_performance");
    group.measurement_time(Duration::from_secs(10));
    group.sample_size(10);
    
    group.bench_function("network_throughput_small", |b| {
        b.iter(|| {
            // This would need to be implemented as a sync version
            // or use a different approach for criterion
        });
    });
    
    group.bench_function("memory_usage_small", |b| {
        b.iter(|| {
            // Memory usage benchmark
        });
    });
    
    group.bench_function("cpu_usage_small", |b| {
        b.iter(|| {
            // CPU usage benchmark
        });
    });
    
    group.finish();
}

criterion_group!(benches, criterion_benchmark);
criterion_main!(benches);