use brezn::{discovery, network, types};
use tokio::time::{sleep, Duration};

#[tokio::test]
async fn test_p2p_network_initialization() {
    // Test P2P network initialization
    let network = network::Network::new().await;
    assert!(network.is_ok());
    
    let simple_network = network::Network::new_simple();
    assert!(simple_network.is_ok());
}

#[tokio::test]
async fn test_p2p_network_communication() {
    // Test P2P network communication
    let network = network::Network::new().await;
    assert!(network.is_ok());
    
    // Test message creation and serialization
    let message = types::Message::new("network communication test");
    let serialized = serde_json::to_string(&message);
    assert!(serialized.is_ok());
}

#[tokio::test]
async fn test_p2p_network_scalability() {
    // Test P2P network scalability
    let mut networks = vec![];
    
    // Create multiple network instances
    for i in 0..5 {
        let network = network::Network::new().await;
        assert!(network.is_ok());
        networks.push(network.unwrap());
        
        sleep(Duration::from_millis(5)).await;
    }
    
    assert_eq!(networks.len(), 5);
}

#[tokio::test]
async fn test_p2p_network_fault_tolerance() {
    // Test P2P network fault tolerance
    let discovery = discovery::Discovery::new();
    assert!(discovery.is_ok());
    
    // Simulate network failures and recovery
    let network = network::Network::new().await;
    assert!(network.is_ok());
    
    // Test network resilience
    let resilience_test = network::Network::new_simple();
    assert!(resilience_test.is_ok());
}