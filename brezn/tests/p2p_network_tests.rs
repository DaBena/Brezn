use tokio::net::{TcpListener, TcpStream};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use std::time::Duration;
use brezn::network::{NetworkManager, P2PNetworkExample, PeerInfo, ConnectionQuality};
use brezn::types::{Post, PostId, NetworkMessage};
use std::sync::Arc;
use tokio::sync::Mutex;

#[tokio::test]
async fn test_network_manager_creation() {
    let network = NetworkManager::new(8888, 9050);
    
    assert_eq!(network.port, 8888);
    assert_eq!(network.tor_socks_port, 9050);
    assert!(!network.is_tor_enabled());
}

#[tokio::test]
async fn test_peer_connection() {
    let mut network = NetworkManager::new(8888, 9050);
    
    // Start a test server
    let listener = TcpListener::bind("127.0.0.1:8889").await.unwrap();
    
    // Connect to the test server
    let result = network.connect_to_peer("127.0.0.1", 8889).await;
    assert!(result.is_ok());
    
    // Check if peer was added
    let peers = network.get_peers();
    assert_eq!(peers.len(), 1);
    assert_eq!(peers[0].address, "127.0.0.1");
    assert_eq!(peers[0].port, 8889);
}

#[tokio::test]
async fn test_post_broadcast() {
    let network = NetworkManager::new(8888, 9050);
    
    let post = Post::new(
        "Test Post".to_string(),
        "TestUser".to_string(),
        Some("test_node".to_string())
    );
    
    let result = network.broadcast_post(&post).await;
    assert!(result.is_ok());
}

#[tokio::test]
async fn test_network_stats() {
    let network = NetworkManager::new(8888, 9050);
    
    let stats = network.get_network_stats();
    assert_eq!(stats.total_peers, 0);
    assert_eq!(stats.active_peers, 0);
    assert_eq!(stats.excellent_connections, 0);
    assert_eq!(stats.good_connections, 0);
    assert_eq!(stats.poor_connections, 0);
}

#[tokio::test]
async fn test_connection_quality() {
    let network = NetworkManager::new(8888, 9050);
    
    // Test connection quality calculation
    let excellent = ConnectionQuality::from_latency(25);
    assert!(matches!(excellent, ConnectionQuality::Excellent));
    
    let good = ConnectionQuality::from_latency(75);
    assert!(matches!(good, ConnectionQuality::Good));
    
    let fair = ConnectionQuality::from_latency(150);
    assert!(matches!(fair, ConnectionQuality::Fair));
    
    let poor = ConnectionQuality::from_latency(250);
    assert!(matches!(poor, ConnectionQuality::Poor));
}

#[tokio::test]
async fn test_p2p_network_example() {
    let p2p_network = P2PNetworkExample::new(8888, 8888);
    
    // Test basic functionality
    let status = p2p_network.get_status();
    assert_eq!(status.node_id, p2p_network.network_manager.local_node_id);
    
    let peers = p2p_network.get_peers();
    assert_eq!(peers.len(), 0);
}

#[tokio::test]
async fn test_network_topology() {
    let network = NetworkManager::new(8888, 9050);
    
    let topology = network.get_topology();
    assert_eq!(topology.node_id, "local");
    assert_eq!(topology.connections.len(), 0);
    assert_eq!(topology.network_segments.len(), 0);
    assert_eq!(topology.topology_version, 0);
}

#[tokio::test]
async fn test_peer_removal() {
    let network = NetworkManager::new(8888, 9050);
    
    // Add a test peer
    let mut peers = network.peers.lock().unwrap();
    let peer = PeerInfo {
        node_id: "test_peer".to_string(),
        public_key: sodiumoxide::crypto::box_::PublicKey([0u8; 32]),
        address: "127.0.0.1".to_string(),
        port: 8888,
        last_seen: 0,
        connection_quality: ConnectionQuality::Unknown,
        capabilities: vec!["test".to_string()],
        latency_ms: None,
        is_tor_peer: false,
        circuit_id: None,
        connection_health: 1.0,
    };
    peers.insert("test_peer".to_string(), peer);
    drop(peers);
    
    // Verify peer was added
    assert_eq!(network.get_peers().len(), 1);
    
    // Remove peer
    network.remove_peer("test_peer");
    
    // Verify peer was removed
    assert_eq!(network.get_peers().len(), 0);
}

#[tokio::test]
async fn test_message_handling() {
    let network = NetworkManager::new(8888, 9050);
    
    let message = NetworkMessage {
        message_type: "ping".to_string(),
        payload: serde_json::json!({}),
        timestamp: 0,
        node_id: "test_node".to_string(),
    };
    
    let result = network.handle_message(&message).await;
    assert!(result.is_ok());
}

#[tokio::test]
async fn test_heartbeat_system() {
    let network = NetworkManager::new(8888, 9050);
    
    // Test heartbeat monitoring start
    let result = network.start_heartbeat_monitoring().await;
    assert!(result.is_ok());
    
    // Wait a bit for the background task to start
    tokio::time::sleep(Duration::from_millis(100)).await;
}

#[tokio::test]
async fn test_error_recovery() {
    let network = NetworkManager::new(8888, 9050);
    
    // Test error recovery monitoring start
    let result = network.start_error_recovery_monitoring().await;
    assert!(result.is_ok());
    
    // Wait a bit for the background task to start
    tokio::time::sleep(Duration::from_millis(100)).await;
}

#[tokio::test]
async fn test_udp_discovery() {
    let mut network = NetworkManager::new(8888, 9050);
    
    // Test UDP discovery start
    let result = network.start_udp_discovery(8888).await;
    assert!(result.is_ok());
    
    // Verify discovery socket was created
    assert!(network.discovery_socket.is_some());
}

#[tokio::test]
async fn test_sync_functionality() {
    let network = NetworkManager::new(8888, 9050);
    
    // Test sync with all peers (should work even with no peers)
    let result = network.sync_all_peers().await;
    assert!(result.is_ok());
}

#[tokio::test]
async fn test_conflict_handling() {
    let network = NetworkManager::new(8888, 9050);
    
    // Test getting unresolved conflicts
    let conflicts = network.get_unresolved_conflicts().await.unwrap();
    assert_eq!(conflicts.len(), 0);
}

#[tokio::test]
async fn test_network_status() {
    let network = NetworkManager::new(8888, 9050);
    
    let status = network.get_network_status();
    assert_eq!(status.node_id, network.local_node_id);
    assert_eq!(status.network_port, 8888);
    assert_eq!(status.discovery_port, 0); // Not set yet
    assert!(!status.tor_enabled);
    assert_eq!(status.peer_count, 0);
    assert_eq!(status.unresolved_conflicts, 0);
}

#[tokio::test]
async fn test_peer_quality_filtering() {
    let network = NetworkManager::new(8888, 9050);
    
    // Add peers with different qualities
    let mut peers = network.peers.lock().unwrap();
    
    let excellent_peer = PeerInfo {
        node_id: "excellent".to_string(),
        public_key: sodiumoxide::crypto::box_::PublicKey([0u8; 32]),
        address: "127.0.0.1".to_string(),
        port: 8888,
        last_seen: 0,
        connection_quality: ConnectionQuality::Excellent,
        capabilities: vec!["test".to_string()],
        latency_ms: Some(25),
        is_tor_peer: false,
        circuit_id: None,
        connection_health: 1.0,
    };
    
    let good_peer = PeerInfo {
        node_id: "good".to_string(),
        public_key: sodiumoxide::crypto::box_::PublicKey([0u8; 32]),
        address: "127.0.0.2".to_string(),
        port: 8888,
        last_seen: 0,
        connection_quality: ConnectionQuality::Good,
        capabilities: vec!["test".to_string()],
        latency_ms: Some(75),
        is_tor_peer: false,
        circuit_id: None,
        connection_health: 1.0,
    };
    
    peers.insert("excellent".to_string(), excellent_peer);
    peers.insert("good".to_string(), good_peer);
    drop(peers);
    
    // Test filtering by quality
    let excellent_peers = network.get_peers_by_quality(ConnectionQuality::Excellent);
    let good_peers = network.get_peers_by_quality(ConnectionQuality::Good);
    
    assert_eq!(excellent_peers.len(), 1);
    assert_eq!(good_peers.len(), 1);
    assert_eq!(excellent_peers[0].node_id, "excellent");
    assert_eq!(good_peers[0].node_id, "good");
}

// Integration test for complete P2P workflow
#[tokio::test]
async fn test_complete_p2p_workflow() {
    // Create network manager
    let mut network = NetworkManager::new(8888, 9050);
    
    // Start P2P network
    let result = network.start_p2p_network(8888, "test_key".to_string()).await;
    assert!(result.is_ok());
    
    // Wait for background tasks to start
    tokio::time::sleep(Duration::from_millis(200)).await;
    
    // Verify network is running
    let status = network.get_network_status();
    assert_eq!(status.discovery_port, 8888);
    
    // Test network statistics
    let stats = network.get_network_stats();
    assert_eq!(stats.total_peers, 0); // No peers connected yet
    
    // Test topology analysis
    let topology = network.get_topology();
    assert_eq!(topology.topology_version, 0);
}

// Performance test for message handling
#[tokio::test]
async fn test_message_performance() {
    let network = NetworkManager::new(8888, 9050);
    
    let start = std::time::Instant::now();
    
    // Send multiple messages
    for i in 0..100 {
        let message = NetworkMessage {
            message_type: "ping".to_string(),
            payload: serde_json::json!({"sequence": i}),
            timestamp: i as u64,
            node_id: "test_node".to_string(),
        };
        
        let result = network.handle_message(&message).await;
        assert!(result.is_ok());
    }
    
    let duration = start.elapsed();
    println!("Processed 100 messages in {:?}", duration);
    
    // Should complete in reasonable time
    assert!(duration < Duration::from_secs(1));
}

// Test for concurrent peer operations
#[tokio::test]
async fn test_concurrent_peer_operations() {
    let network = Arc::new(Mutex::new(NetworkManager::new(8888, 9050)));
    
    let mut handles = vec![];
    
    // Spawn multiple tasks that add peers concurrently
    for i in 0..10 {
        let network_clone = Arc::clone(&network);
        let handle = tokio::spawn(async move {
            let mut network = network_clone.lock().await;
            
            // Simulate peer connection
            let peer = PeerInfo {
                node_id: format!("peer_{}", i),
                public_key: sodiumoxide::crypto::box_::PublicKey([0u8; 32]),
                address: format!("127.0.0.{}", i + 1),
                port: 8888 + i as u16,
                last_seen: 0,
                connection_quality: ConnectionQuality::Unknown,
                capabilities: vec!["test".to_string()],
                latency_ms: None,
                is_tor_peer: false,
                circuit_id: None,
                connection_health: 1.0,
            };
            
            let mut peers = network.peers.lock().unwrap();
            peers.insert(format!("peer_{}", i), peer);
        });
        handles.push(handle);
    }
    
    // Wait for all tasks to complete
    for handle in handles {
        handle.await.unwrap();
    }
    
    // Verify all peers were added
    let network = network.lock().await;
    let peers = network.get_peers();
    assert_eq!(peers.len(), 10);
}

// Test for network resilience
#[tokio::test]
async fn test_network_resilience() {
    let network = NetworkManager::new(8888, 9050);
    
    // Test that network can handle invalid messages gracefully
    let invalid_message = NetworkMessage {
        message_type: "invalid_type".to_string(),
        payload: serde_json::json!({"invalid": "data"}),
        timestamp: 0,
        node_id: "test_node".to_string(),
    };
    
    let result = network.handle_message(&invalid_message).await;
    assert!(result.is_ok()); // Should handle gracefully
    
    // Test network status remains stable
    let status = network.get_network_status();
    assert_eq!(status.node_id, network.local_node_id);
}

// Test for configuration validation
#[tokio::test]
async fn test_network_configuration() {
    let network = NetworkManager::new(8888, 9050);
    
    // Test default configuration
    assert_eq!(network.port, 8888);
    assert_eq!(network.tor_socks_port, 9050);
    assert_eq!(network.max_peers, 100);
    assert_eq!(network.heartbeat_interval, Duration::from_secs(60));
    assert_eq!(network.peer_timeout, Duration::from_secs(10));
}

// Test for error conditions
#[tokio::test]
async fn test_error_conditions() {
    let network = NetworkManager::new(8888, 9050);
    
    // Test measuring latency to non-existent peer
    let result = network.measure_peer_latency("non_existent").await;
    assert!(result.is_err());
    
    // Test removing non-existent peer
    network.remove_peer("non_existent"); // Should not panic
    
    // Test getting peers by quality when none exist
    let excellent_peers = network.get_peers_by_quality(ConnectionQuality::Excellent);
    assert_eq!(excellent_peers.len(), 0);
}

// Test for network scaling
#[tokio::test]
async fn test_network_scaling() {
    let network = NetworkManager::new(8888, 9050);
    
    // Test that network can handle many peers
    let mut peers = network.peers.lock().unwrap();
    
    for i in 0..1000 {
        let peer = PeerInfo {
            node_id: format!("peer_{}", i),
            public_key: sodiumoxide::crypto::box_::PublicKey([0u8; 32]),
            address: format!("192.168.1.{}", (i % 254) + 1),
            port: 8888 + (i % 100) as u16,
            last_seen: 0,
            connection_quality: ConnectionQuality::Unknown,
            capabilities: vec!["test".to_string()],
            latency_ms: None,
            is_tor_peer: false,
            circuit_id: None,
            connection_health: 1.0,
        };
        
        peers.insert(format!("peer_{}", i), peer);
    }
    
    drop(peers);
    
    // Verify all peers were added
    let all_peers = network.get_peers();
    assert_eq!(all_peers.len(), 1000);
    
    // Test network statistics with many peers
    let stats = network.get_network_stats();
    assert_eq!(stats.total_peers, 1000);
    assert_eq!(stats.active_peers, 1000);
}

// Test for message serialization
#[tokio::test]
async fn test_message_serialization() {
    let network = NetworkManager::new(8888, 9050);
    
    // Test that messages can be serialized and deserialized
    let original_message = NetworkMessage {
        message_type: "test".to_string(),
        payload: serde_json::json!({"key": "value", "number": 42}),
        timestamp: 1234567890,
        node_id: "test_node".to_string(),
    };
    
    let serialized = serde_json::to_string(&original_message).unwrap();
    let deserialized: NetworkMessage = serde_json::from_str(&serialized).unwrap();
    
    assert_eq!(original_message.message_type, deserialized.message_type);
    assert_eq!(original_message.timestamp, deserialized.timestamp);
    assert_eq!(original_message.node_id, deserialized.node_id);
    assert_eq!(original_message.payload, deserialized.payload);
}

// Test for network cleanup
#[tokio::test]
async fn test_network_cleanup() {
    let mut network = NetworkManager::new(8888, 9050);
    
    // Add some peers
    let mut peers = network.peers.lock().unwrap();
    for i in 0..5 {
        let peer = PeerInfo {
            node_id: format!("peer_{}", i),
            public_key: sodiumoxide::crypto::box_::PublicKey([0u8; 32]),
            address: format!("127.0.0.{}", i + 1),
            port: 8888,
            last_seen: 0,
            connection_quality: ConnectionQuality::Unknown,
            capabilities: vec!["test".to_string()],
            latency_ms: None,
            is_tor_peer: false,
            circuit_id: None,
            connection_health: 1.0,
        };
        peers.insert(format!("peer_{}", i), peer);
    }
    drop(peers);
    
    // Verify peers were added
    assert_eq!(network.get_peers().len(), 5);
    
    // Remove all peers
    for i in 0..5 {
        network.remove_peer(&format!("peer_{}", i));
    }
    
    // Verify all peers were removed
    assert_eq!(network.get_peers().len(), 0);
}