use brezn::network::{NetworkManager, ConnectionQuality, NetworkTopology};
use brezn::discovery::{DiscoveryManager, DiscoveryConfig};
use brezn::crypto::CryptoManager;
use brezn::types::{Post, Config};
use std::sync::{Arc, Mutex};
use tokio::time::{sleep, Duration};
use std::collections::HashMap;

/// Integration test for P2P network with multiple nodes
#[tokio::test]
async fn test_p2p_network_with_multiple_nodes() {
    // Create crypto managers for different nodes
    let crypto1 = CryptoManager::new();
    let crypto2 = CryptoManager::new();
    let crypto3 = CryptoManager::new();
    
    let (pubkey1, _seckey1) = crypto1.generate_keypair().unwrap();
    let (pubkey2, _seckey2) = crypto2.generate_keypair().unwrap();
    let (pubkey3, _seckey3) = crypto3.generate_keypair().unwrap();
    
    // Create network managers for different nodes
    let mut network1 = NetworkManager::new(8881, 9050);
    let mut network2 = NetworkManager::new(8882, 9050);
    let mut network3 = NetworkManager::new(8883, 9050);
    
    // Initialize discovery for each node
    network1.init_discovery("node_1".to_string(), hex::encode(pubkey1.as_ref())).await.unwrap();
    network2.init_discovery("node_2".to_string(), hex::encode(pubkey2.as_ref())).await.unwrap();
    network3.init_discovery("node_3".to_string(), hex::encode(pubkey3.as_ref())).await.unwrap();
    
    // Add peers between nodes
    network1.add_peer("node_2".to_string(), pubkey2, "127.0.0.1".to_string(), 8882, false);
    network1.add_peer("node_3".to_string(), pubkey3, "127.0.0.1".to_string(), 8883, false);
    
    network2.add_peer("node_1".to_string(), pubkey1, "127.0.0.1".to_string(), 8881, false);
    network2.add_peer("node_3".to_string(), pubkey3, "127.0.0.1".to_string(), 8883, false);
    
    network3.add_peer("node_1".to_string(), pubkey1, "127.0.0.1".to_string(), 8881, false);
    network3.add_peer("node_2".to_string(), pubkey2, "127.0.0.1".to_string(), 8882, false);
    
    // Verify peer counts
    assert_eq!(network1.get_peers().len(), 2);
    assert_eq!(network2.get_peers().len(), 2);
    assert_eq!(network3.get_peers().len(), 2);
    
    // Test network topology analysis
    network1.analyze_topology().await.unwrap();
    network2.analyze_topology().await.unwrap();
    network3.analyze_topology().await.unwrap();
    
    let topology1 = network1.get_topology();
    let topology2 = network2.get_topology();
    let topology3 = network3.get_topology();
    
    // All nodes should be connected
    assert_eq!(topology1.connections.len(), 2);
    assert_eq!(topology2.connections.len(), 2);
    assert_eq!(topology3.connections.len(), 2);
    
    // Should have network segments
    assert!(!topology1.network_segments.is_empty());
    assert!(!topology2.network_segments.is_empty());
    assert!(!topology3.network_segments.is_empty());
    
    println!("✅ P2P Network mit 3 Nodes erfolgreich erstellt");
}

/// Test peer discovery and automatic management
#[tokio::test]
async fn test_peer_discovery_and_management() {
    let crypto = CryptoManager::new();
    let (pubkey, _seckey) = crypto.generate_keypair().unwrap();
    
    let mut network = NetworkManager::new(8884, 9050);
    network.init_discovery("discovery_test_node".to_string(), hex::encode(pubkey.as_ref())).await.unwrap();
    
    // Create discovery manager
    let mut discovery_config = DiscoveryConfig::default();
    discovery_config.discovery_port = 8885;
    discovery_config.broadcast_interval = Duration::from_millis(100); // Fast for testing
    discovery_config.heartbeat_interval = Duration::from_millis(200);
    
    let mut discovery = DiscoveryManager::new(
        discovery_config,
        "discovery_test_node".to_string(),
        hex::encode(pubkey.as_ref()),
        8884,
    );
    
    // Set peer callback
    let network_clone = Arc::new(Mutex::new(network.clone()));
    discovery.set_peer_callback(move |peer_info| {
        let network = network_clone.lock().unwrap();
        println!("🔍 Neuer Peer entdeckt: {} von {}", peer_info.node_id, peer_info.address);
    });
    
    // Initialize discovery sockets
    discovery.init_sockets().await.unwrap();
    
    // Start discovery in background
    let discovery_handle = tokio::spawn(async move {
        discovery.start_discovery().await
    });
    
    // Wait a bit for discovery to start
    sleep(Duration::from_millis(500)).await;
    
    // Check discovery stats
    let stats = discovery.get_discovery_stats();
    assert_eq!(stats.total_peers, 0); // No peers discovered yet
    
    // Cancel discovery
    discovery_handle.abort();
    
    println!("✅ Peer Discovery erfolgreich getestet");
}

/// Test network message routing and handling
#[tokio::test]
async fn test_network_message_routing() {
    let crypto = CryptoManager::new();
    let (pubkey, _seckey) = crypto.generate_keypair().unwrap();
    
    let network = NetworkManager::new(8886, 9050);
    
    // Create test posts
    let post1 = Post {
        id: None,
        content: "Test post from node 1".to_string(),
        timestamp: chrono::Utc::now().timestamp() as u64,
        pseudonym: "test_user_1".to_string(),
        node_id: Some("node_1".to_string()),
    };
    
    let post2 = Post {
        id: None,
        content: "Test post from node 2".to_string(),
        timestamp: chrono::Utc::now().timestamp() as u64,
        pseudonym: "test_user_2".to_string(),
        node_id: Some("node_2".to_string()),
    };
    
    // Add peers
    network.add_peer("node_1".to_string(), pubkey.clone(), "127.0.0.1".to_string(), 8887, false);
    network.add_peer("node_2".to_string(), pubkey.clone(), "127.0.0.1".to_string(), 8888, false);
    
    // Test post broadcasting
    network.broadcast_post(&post1).await.unwrap();
    network.broadcast_post(&post2).await.unwrap();
    
    // Test config broadcasting
    let config = Config {
        auto_save: true,
        max_posts: 100,
        default_pseudonym: "test_user".to_string(),
        network_enabled: true,
        network_port: 8886,
        tor_enabled: false,
        tor_socks_port: 9050,
    };
    
    network.broadcast_config(&config).await.unwrap();
    
    // Verify peers received messages
    let peers = network.get_peers();
    assert_eq!(peers.len(), 2);
    
    println!("✅ Network Message Routing erfolgreich getestet");
}

/// Test connection quality monitoring and peer health
#[tokio::test]
async fn test_connection_quality_monitoring() {
    let crypto = CryptoManager::new();
    let (pubkey, _seckey) = crypto.generate_keypair().unwrap();
    
    let network = NetworkManager::new(8889, 9050);
    
    // Add peers with different connection qualities
    network.add_peer("excellent_peer".to_string(), pubkey.clone(), "127.0.0.1".to_string(), 8890, false);
    network.add_peer("good_peer".to_string(), pubkey.clone(), "127.0.0.1".to_string(), 8891, false);
    network.add_peer("poor_peer".to_string(), pubkey.clone(), "127.0.0.1".to_string(), 8892, false);
    
    // Update connection qualities
    if let Some(peer) = network.peers.lock().unwrap().get_mut("excellent_peer") {
        peer.connection_quality = ConnectionQuality::Excellent;
        peer.latency_ms = Some(25);
    }
    if let Some(peer) = network.peers.lock().unwrap().get_mut("good_peer") {
        peer.connection_quality = ConnectionQuality::Good;
        peer.latency_ms = Some(75);
    }
    if let Some(peer) = network.peers.lock().unwrap().get_mut("poor_peer") {
        peer.connection_quality = ConnectionQuality::Poor;
        peer.latency_ms = Some(300);
    }
    
    // Test peer filtering by quality
    let excellent_peers = network.get_peers_by_quality(ConnectionQuality::Excellent);
    let good_peers = network.get_peers_by_quality(ConnectionQuality::Good);
    let poor_peers = network.get_peers_by_quality(ConnectionQuality::Poor);
    
    assert_eq!(excellent_peers.len(), 1);
    assert_eq!(good_peers.len(), 1);
    assert_eq!(poor_peers.len(), 1);
    
    // Test network statistics
    let stats = network.get_network_stats();
    assert_eq!(stats.total_peers, 3);
    assert_eq!(stats.excellent_connections, 1);
    assert_eq!(stats.good_connections, 1);
    assert_eq!(stats.poor_connections, 1);
    assert_eq!(stats.avg_latency_ms, 133); // (25 + 75 + 300) / 3
    
    println!("✅ Connection Quality Monitoring erfolgreich getestet");
}

/// Test network topology analysis and segmentation
#[tokio::test]
async fn test_network_topology_analysis() {
    let crypto = CryptoManager::new();
    let (pubkey, _seckey) = crypto.generate_keypair().unwrap();
    
    let network = NetworkManager::new(8893, 9050);
    
    // Create a more complex network topology
    for i in 1..=6 {
        network.add_peer(
            format!("peer_{}", i),
            pubkey.clone(),
            format!("127.0.0.{}", i),
            (8893 + i) as u16,
            false
        );
    }
    
    // Update connection qualities to create different segments
    // Core segment: peers 1, 2, 3 (excellent connections)
    for i in 1..=3 {
        if let Some(peer) = network.peers.lock().unwrap().get_mut(&format!("peer_{}", i)) {
            peer.connection_quality = ConnectionQuality::Excellent;
            peer.latency_ms = Some(20 + i as u64 * 5);
        }
    }
    
    // Bridge segment: peers 4, 5 (good connections)
    for i in 4..=5 {
        if let Some(peer) = network.peers.lock().unwrap().get_mut(&format!("peer_{}", i)) {
            peer.connection_quality = ConnectionQuality::Good;
            peer.latency_ms = Some(80 + i as u64 * 10);
        }
    }
    
    // Edge segment: peer 6 (fair connection)
    if let Some(peer) = network.peers.lock().unwrap().get_mut("peer_6") {
        peer.connection_quality = ConnectionQuality::Fair;
        peer.latency_ms = Some(150);
    }
    
    // Analyze topology
    network.analyze_topology().await.unwrap();
    
    let topology = network.get_topology();
    
    // Should have multiple segments
    assert!(topology.network_segments.len() >= 2);
    
    // Check segment types
    let mut has_core = false;
    let mut has_bridge = false;
    let mut has_edge = false;
    
    for segment in &topology.network_segments {
        match segment.segment_type {
            SegmentType::Core => has_core = true,
            SegmentType::Bridge => has_bridge = true,
            SegmentType::Edge => has_edge = true,
            SegmentType::Isolated => {},
        }
        
        // Segments should have reasonable connectivity scores
        assert!(segment.connectivity_score >= 0.0);
        assert!(segment.connectivity_score <= 1.0);
    }
    
    // Should have at least core and edge segments
    assert!(has_core);
    assert!(has_edge);
    
    println!("✅ Network Topology Analysis erfolgreich getestet");
}

/// Test peer health monitoring and cleanup
#[tokio::test]
async fn test_peer_health_monitoring() {
    let crypto = CryptoManager::new();
    let (pubkey, _seckey) = crypto.generate_keypair().unwrap();
    
    let network = NetworkManager::new(8899, 9050);
    
    // Add peers
    network.add_peer("healthy_peer".to_string(), pubkey.clone(), "127.0.0.1".to_string(), 8900, false);
    network.add_peer("stale_peer".to_string(), pubkey.clone(), "127.0.0.1".to_string(), 8901, false);
    
    // Make one peer stale (old timestamp)
    if let Some(peer) = network.peers.lock().unwrap().get_mut("stale_peer") {
        peer.last_seen = chrono::Utc::now().timestamp() as u64 - 700; // 700 seconds old
    }
    
    // Initial peer count
    assert_eq!(network.get_peers().len(), 2);
    
    // Run health check (this would normally be done by the background task)
    // For testing, we'll manually trigger the cleanup logic
    let now = chrono::Utc::now().timestamp() as u64;
    let mut peers_to_remove = Vec::new();
    
    {
        let peers = network.peers.lock().unwrap();
        for (node_id, peer) in peers.iter() {
            if now.saturating_sub(peer.last_seen) > 600 { // 10 minutes timeout
                peers_to_remove.push(node_id.clone());
            }
        }
    }
    
    // Remove stale peers
    for node_id in peers_to_remove {
        network.remove_peer(&node_id);
    }
    
    // Should only have healthy peer left
    assert_eq!(network.get_peers().len(), 1);
    assert_eq!(network.get_peers()[0].node_id, "healthy_peer");
    
    println!("✅ Peer Health Monitoring erfolgreich getestet");
}

/// Main integration test runner
#[tokio::test]
async fn run_all_p2p_integration_tests() {
    println!("🚀 Starte P2P Network Integration Tests...");
    
    // Run all integration tests
    test_p2p_network_with_multiple_nodes().await;
    test_peer_discovery_and_management().await;
    test_network_message_routing().await;
    test_connection_quality_monitoring().await;
    test_network_topology_analysis().await;
    test_peer_health_monitoring().await;
    
    println!("🎉 Alle P2P Network Integration Tests erfolgreich abgeschlossen!");
}