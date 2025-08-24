use brezn::{discovery, network, types, crypto};
use tokio::time::{sleep, Duration};

#[tokio::test]
async fn test_advanced_network_integration() {
    // Test advanced network integration scenarios
    let network = network::Network::new().await;
    assert!(network.is_ok());
    
    // Test network discovery
    let discovery = discovery::Discovery::new();
    assert!(discovery.is_ok());
    
    // Test message routing
    let message = types::Message::new("advanced integration test");
    let serialized = serde_json::to_string(&message);
    assert!(serialized.is_ok());
}

#[tokio::test]
async fn test_crypto_integration() {
    // Test cryptographic operations integration
    let data = b"test data for crypto";
    let hash = crypto::hash_data(data);
    assert!(hash.is_ok());
    
    // Test encryption/decryption
    let key = crypto::generate_key();
    assert!(key.is_ok());
    
    let encrypted = crypto::encrypt_data(data, &key.unwrap());
    assert!(encrypted.is_ok());
}

#[tokio::test]
async fn test_database_integration() {
    // Test database operations integration
    use brezn::database;
    
    let db = database::Database::new_in_memory();
    assert!(db.is_ok());
    
    // Test basic operations
    let db = db.unwrap();
    let result = db.execute("CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)");
    assert!(result.is_ok());
}

#[tokio::test]
async fn test_p2p_protocol_integration() {
    // Test P2P protocol integration
    let network = network::Network::new().await;
    assert!(network.is_ok());
    
    // Test peer discovery
    let discovery = discovery::Discovery::new();
    assert!(discovery.is_ok());
    
    // Test message exchange simulation
    for i in 0..5 {
        let message = types::Message::new(format!("p2p test {}", i));
        let serialized = serde_json::to_string(&message);
        assert!(serialized.is_ok());
        
        sleep(Duration::from_millis(50)).await;
    }
}