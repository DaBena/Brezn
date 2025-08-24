use brezn::{discovery, network, types, crypto, database, error};

#[test]
fn test_error_handling_coverage() {
    // Test error handling coverage
    let error = error::BreznError::NetworkError("test error".to_string());
    let error_string = error.to_string();
    assert!(!error_string.is_empty());
}

#[test]
fn test_types_coverage() {
    // Test types module coverage
    let message = types::Message::new("coverage test");
    assert_eq!(message.content(), "coverage test");
    
    let post = types::Post::new("test post".to_string());
    assert_eq!(post.content(), "test post");
}

#[test]
fn test_crypto_coverage() {
    // Test crypto module coverage
    let data = b"coverage test data";
    let hash_result = crypto::hash_data(data);
    assert!(hash_result.is_ok());
}

#[test]
fn test_database_coverage() {
    // Test database module coverage
    let db_result = database::Database::new_in_memory();
    assert!(db_result.is_ok());
}

#[test]
fn test_discovery_coverage() {
    // Test discovery module coverage
    let discovery_result = discovery::Discovery::new();
    assert!(discovery_result.is_ok());
}

#[test]
fn test_network_coverage() {
    // Test network module coverage
    let network_result = network::Network::new_simple();
    assert!(network_result.is_ok());
}

#[test]
fn test_serialization_coverage() {
    // Test serialization coverage
    let message = types::Message::new("serialization test");
    let json_result = serde_json::to_string(&message);
    assert!(json_result.is_ok());
    
    let json_string = json_result.unwrap();
    let deserialized_result = serde_json::from_str::<types::Message>(&json_string);
    assert!(deserialized_result.is_ok());
    
    let deserialized = deserialized_result.unwrap();
    assert_eq!(deserialized.content(), "serialization test");
}