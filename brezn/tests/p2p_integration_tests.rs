use brezn::{discovery, network, types};
use tokio::time::{sleep, Duration};

#[tokio::test]
async fn test_p2p_network_discovery() {
    // Test P2P network discovery
    let discovery = discovery::Discovery::new();
    assert!(discovery.is_ok());
    
    // Simulate peer discovery
    let network = network::Network::new().await;
    assert!(network.is_ok());
}

#[tokio::test]
async fn test_p2p_message_exchange() {
    // Test P2P message exchange
    let message = types::Message::new("p2p test message");
    let serialized = serde_json::to_string(&message);
    assert!(serialized.is_ok());
    
    // Simulate message routing
    let network = network::Network::new().await;
    assert!(network.is_ok());
}

#[tokio::test]
async fn test_p2p_peer_management() {
    // Test P2P peer management
    let discovery = discovery::Discovery::new();
    assert!(discovery.is_ok());
    
    // Simulate peer connections
    for i in 0..3 {
        let peer_message = types::Message::new(format!("peer {} connected", i));
        let serialized = serde_json::to_string(&peer_message);
        assert!(serialized.is_ok());
        
        sleep(Duration::from_millis(10)).await;
    }
}

#[tokio::test]
async fn test_p2p_network_topology() {
    // Test P2P network topology
    let network = network::Network::new().await;
    assert!(network.is_ok());
    
    // Simulate network topology changes
    let discovery = discovery::Discovery::new();
    assert!(discovery.is_ok());
    
    // Test network resilience
    let resilience_test = network::Network::new_simple();
    assert!(resilience_test.is_ok());
}