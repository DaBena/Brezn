use brezn::{discovery, network, types};
use criterion::{black_box, criterion_group, criterion_main, Criterion};

pub fn test_network_throughput_benchmark(c: &mut Criterion) {
    c.benchmark_group("network_throughput")
        .bench_function("message_processing", |b| {
            b.iter(|| {
                let message = types::Message::new("benchmark test".to_string());
                let serialized = serde_json::to_string(&message);
                black_box(serialized)
            });
        });
}

pub fn test_memory_usage_benchmark(c: &mut Criterion) {
    c.benchmark_group("memory_usage")
        .bench_function("discovery_creation", |b| {
            b.iter(|| {
                let discovery = discovery::Discovery::new();
                black_box(discovery)
            });
        });
}

pub fn test_cpu_usage_benchmark(c: &mut Criterion) {
    c.benchmark_group("cpu_usage")
        .bench_function("crypto_operations", |b| {
            b.iter(|| {
                use ring::digest;
                let data = b"benchmark data";
                let hash = digest::digest(&digest::SHA256, data);
                black_box(hash)
            });
        });
}

criterion_group!(
    benches,
    test_network_throughput_benchmark,
    test_memory_usage_benchmark,
    test_cpu_usage_benchmark
);
criterion_main!(benches);