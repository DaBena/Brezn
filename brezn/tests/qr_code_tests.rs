use brezn::discovery::{DiscoveryManager, DiscoveryConfig, QRCodeData, PeerInfo};
use chrono::Utc;

#[test]
fn test_qr_code_data_creation() {
    let qr_data = QRCodeData::new(
        "test_node_123".to_string(),
        "test_public_key_456".to_string(),
        "192.168.1.100".to_string(),
        8080,
        vec!["posts".to_string(), "config".to_string(), "p2p".to_string()],
    );
    
    assert_eq!(qr_data.version, "1.0");
    assert_eq!(qr_data.node_id, "test_node_123");
    assert_eq!(qr_data.public_key, "test_public_key_456");
    assert_eq!(qr_data.address, "192.168.1.100");
    assert_eq!(qr_data.port, 8080);
    assert_eq!(qr_data.capabilities.len(), 3);
    assert_eq!(qr_data.capabilities, vec!["posts", "config", "p2p"]);
    assert!(!qr_data.checksum.is_empty());
    assert_eq!(qr_data.checksum.len(), 64); // SHA256 hash length
}

#[test]
fn test_qr_code_data_checksum_consistency() {
    let qr_data1 = QRCodeData::new(
        "test_node".to_string(),
        "test_key".to_string(),
        "127.0.0.1".to_string(),
        8080,
        vec!["posts".to_string()],
    );
    
    let qr_data2 = QRCodeData::new(
        "test_node".to_string(),
        "test_key".to_string(),
        "127.0.0.1".to_string(),
        8080,
        vec!["posts".to_string()],
    );
    
    // Same data should have same checksum
    assert_eq!(qr_data1.checksum, qr_data2.checksum);
    
    // Different data should have different checksums
    let qr_data3 = QRCodeData::new(
        "different_node".to_string(),
        "test_key".to_string(),
        "127.0.0.1".to_string(),
        8080,
        vec!["posts".to_string()],
    );
    
    assert_ne!(qr_data1.checksum, qr_data3.checksum);
}

#[test]
fn test_qr_code_data_validation_success() {
    let qr_data = QRCodeData::new(
        "test_node".to_string(),
        "test_key".to_string(),
        "127.0.0.1".to_string(),
        8080,
        vec!["posts".to_string()],
    );
    
    // Validation should pass for valid data
    assert!(qr_data.validate().is_ok());
}

#[test]
fn test_qr_code_data_validation_version_failure() {
    let mut qr_data = QRCodeData::new(
        "test_node".to_string(),
        "test_key".to_string(),
        "127.0.0.1".to_string(),
        8080,
        vec!["posts".to_string()],
    );
    
    qr_data.version = "2.0".to_string();
    
    // Validation should fail for unsupported version
    assert!(qr_data.validate().is_err());
}

#[test]
fn test_qr_code_data_validation_timestamp_failure() {
    let mut qr_data = QRCodeData::new(
        "test_node".to_string(),
        "test_key".to_string(),
        "127.0.0.1".to_string(),
        8080,
        vec!["posts".to_string()],
    );
    
    // Set timestamp to 2 hours ago (older than 1 hour limit)
    qr_data.timestamp = Utc::now().timestamp() as u64 - 7200;
    
    // Validation should fail for old timestamp
    assert!(qr_data.validate().is_err());
}

#[test]
fn test_qr_code_data_validation_port_failure() {
    // Test invalid port 0
    let mut qr_data1 = QRCodeData::new(
        "test_node".to_string(),
        "test_key".to_string(),
        "127.0.0.1".to_string(),
        0, // Invalid port
        vec!["posts".to_string()],
    );
    
    assert!(qr_data1.validate().is_err());
    
    // Test invalid port > 65535
    let mut qr_data2 = QRCodeData::new(
        "test_node".to_string(),
        "test_key".to_string(),
        "127.0.0.1".to_string(),
        70000, // Invalid port
        vec!["posts".to_string()],
    );
    
    assert!(qr_data2.validate().is_err());
}

#[test]
fn test_qr_code_data_validation_empty_fields_failure() {
    let mut qr_data = QRCodeData::new(
        "test_node".to_string(),
        "test_key".to_string(),
        "127.0.0.1".to_string(),
        8080,
        vec!["posts".to_string()],
    );
    
    // Test empty node_id
    qr_data.node_id = "".to_string();
    assert!(qr_data.validate().is_err());
    
    // Test empty public_key
    qr_data.node_id = "test_node".to_string();
    qr_data.public_key = "".to_string();
    assert!(qr_data.validate().is_err());
    
    // Test empty address
    qr_data.public_key = "test_key".to_string();
    qr_data.address = "".to_string();
    assert!(qr_data.validate().is_err());
}

#[test]
fn test_qr_code_data_validation_checksum_failure() {
    let mut qr_data = QRCodeData::new(
        "test_node".to_string(),
        "test_key".to_string(),
        "127.0.0.1".to_string(),
        8080,
        vec!["posts".to_string()],
    );
    
    // Corrupt the checksum
    qr_data.checksum = "invalid_checksum_1234567890".to_string();
    
    // Validation should fail for corrupted checksum
    assert!(qr_data.validate().is_err());
}

#[test]
fn test_discovery_manager_qr_generation() {
    let config = DiscoveryConfig::default();
    let manager = DiscoveryManager::new(
        config,
        "test_node".to_string(),
        "test_public_key".to_string(),
        8080,
    );
    
    // Test PNG generation
    let qr_png = manager.generate_qr_code().unwrap();
    assert!(qr_png.starts_with("data:image/png;base64,"));
    
    // Test SVG generation
    let qr_svg = manager.generate_qr_code_svg(100).unwrap();
    assert!(qr_svg.contains("<svg"));
    assert!(qr_svg.contains("width=\"100\""));
    assert!(qr_svg.contains("height=\"100\""));
    
    // Test image generation
    let qr_image = manager.generate_qr_code_image(50).unwrap();
    assert!(!qr_image.is_empty());
    
    // Test JSON data generation
    let qr_json = manager.generate_qr_data_json().unwrap();
    assert!(qr_json.contains("test_node"));
    assert!(qr_json.contains("test_public_key"));
    assert!(qr_json.contains("8080"));
}

#[test]
fn test_discovery_manager_qr_formats() {
    let config = DiscoveryConfig::default();
    let manager = DiscoveryManager::new(
        config,
        "test_node".to_string(),
        "test_public_key".to_string(),
        8080,
    );
    
    let formats = manager.generate_qr_code_formats(200).unwrap();
    
    // Check that all expected formats are present
    assert!(formats["formats"]["png_base64"].as_str().unwrap().starts_with("data:image/png;base64,"));
    assert!(formats["formats"]["svg"].as_str().unwrap().contains("<svg"));
    assert!(formats["formats"]["json"].as_str().unwrap().contains("test_node"));
    assert!(formats["formats"]["raw_data"].as_str().unwrap().len() > 0);
    
    // Check QR data structure
    let qr_data = &formats["qr_data"];
    assert_eq!(qr_data["node_id"], "test_node");
    assert_eq!(qr_data["port"], 8080);
}

#[test]
fn test_discovery_manager_qr_parsing() {
    let config = DiscoveryConfig::default();
    let manager = DiscoveryManager::new(
        config,
        "test_node".to_string(),
        "test_public_key".to_string(),
        8080,
    );
    
    // Create valid QR code data
    let qr_data = QRCodeData::new(
        "peer_node".to_string(),
        "peer_public_key".to_string(),
        "192.168.1.200".to_string(),
        9090,
        vec!["posts".to_string(), "config".to_string()],
    );
    
    let qr_json = serde_json::to_string(&qr_data).unwrap();
    
    // Test parsing
    let peer_info = manager.parse_qr_code(&qr_json).unwrap();
    
    assert_eq!(peer_info.node_id, "peer_node");
    assert_eq!(peer_info.public_key, "peer_public_key");
    assert_eq!(peer_info.address, "192.168.1.200");
    assert_eq!(peer_info.port, 9090);
    assert_eq!(peer_info.capabilities, vec!["posts", "config"]);
}

#[test]
fn test_discovery_manager_qr_parsing_invalid_data() {
    let config = DiscoveryConfig::default();
    let manager = DiscoveryManager::new(
        config,
        "test_node".to_string(),
        "test_public_key".to_string(),
        8080,
    );
    
    // Test invalid JSON
    let result = manager.parse_qr_code("invalid json data");
    assert!(result.is_err());
    
    // Test empty string
    let result = manager.parse_qr_code("");
    assert!(result.is_err());
    
    // Test malformed data
    let result = manager.parse_qr_code("{\"node_id\": \"test\"}");
    assert!(result.is_err());
}

#[test]
fn test_discovery_manager_qr_validation() {
    let config = DiscoveryConfig::default();
    let manager = DiscoveryManager::new(
        config,
        "test_node".to_string(),
        "test_public_key".to_string(),
        8080,
    );
    
    // Create valid QR code data
    let qr_data = QRCodeData::new(
        "peer_node".to_string(),
        "peer_public_key".to_string(),
        "192.168.1.200".to_string(),
        9090,
        vec!["posts".to_string()],
    );
    
    let qr_json = serde_json::to_string(&qr_data).unwrap();
    
    // Test validation
    assert!(manager.validate_qr_data(&qr_json).is_ok());
}

#[test]
fn test_discovery_manager_qr_validation_invalid() {
    let config = DiscoveryConfig::default();
    let manager = DiscoveryManager::new(
        config,
        "test_node".to_string(),
        "test_public_key".to_string(),
        8080,
    );
    
    // Test invalid JSON
    let result = manager.validate_qr_data("invalid json");
    assert!(result.is_err());
    
    // Test missing fields
    let incomplete_json = r#"{"node_id": "test"}"#;
    let result = manager.validate_qr_data(incomplete_json);
    assert!(result.is_err());
}

#[test]
fn test_discovery_manager_qr_advanced_parsing() {
    let config = DiscoveryConfig::default();
    let manager = DiscoveryManager::new(
        config,
        "test_node".to_string(),
        "test_public_key".to_string(),
        8080,
    );
    
    // Create valid QR code data
    let qr_data = QRCodeData::new(
        "peer_node".to_string(),
        "peer_public_key".to_string(),
        "192.168.1.200".to_string(),
        9090,
        vec!["posts".to_string()],
    );
    
    let qr_json = serde_json::to_string(&qr_data).unwrap();
    
    // Test advanced parsing
    let result = manager.parse_qr_code_advanced(&qr_json).unwrap();
    
    assert!(result["success"].as_bool().unwrap());
    assert_eq!(result["results"].as_array().unwrap().len(), 1);
    
    let recommended_result = &result["recommended_result"];
    assert_eq!(recommended_result[0], "json_direct");
    
    let peer = &recommended_result[1];
    assert_eq!(peer["node_id"], "peer_node");
    assert_eq!(peer["port"], 9090);
}

#[test]
fn test_discovery_manager_qr_advanced_parsing_multiple_methods() {
    let config = DiscoveryConfig::default();
    let manager = DiscoveryManager::new(
        config,
        "test_node".to_string(),
        "test_public_key".to_string(),
        8080,
    );
    
    // Test with base64 image data (simulated)
    let base64_data = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
    
    let result = manager.parse_qr_code_advanced(base64_data);
    
    // This should fail since the base64 data is not a valid QR code
    // but the function should handle it gracefully
    if result.is_ok() {
        // If it succeeds, check the structure
        let result = result.unwrap();
        assert!(result["errors"].as_array().unwrap().len() > 0);
    }
}

#[test]
fn test_qr_code_data_serialization_deserialization() {
    let original_qr_data = QRCodeData::new(
        "test_node".to_string(),
        "test_key".to_string(),
        "127.0.0.1".to_string(),
        8080,
        vec!["posts".to_string(), "config".to_string()],
    );
    
    // Serialize to JSON
    let json_string = serde_json::to_string(&original_qr_data).unwrap();
    
    // Deserialize from JSON
    let deserialized_qr_data: QRCodeData = serde_json::from_str(&json_string).unwrap();
    
    // Check that all fields match
    assert_eq!(original_qr_data.version, deserialized_qr_data.version);
    assert_eq!(original_qr_data.node_id, deserialized_qr_data.node_id);
    assert_eq!(original_qr_data.public_key, deserialized_qr_data.public_key);
    assert_eq!(original_qr_data.address, deserialized_qr_data.address);
    assert_eq!(original_qr_data.port, deserialized_qr_data.port);
    assert_eq!(original_qr_data.timestamp, deserialized_qr_data.timestamp);
    assert_eq!(original_qr_data.capabilities, deserialized_qr_data.capabilities);
    assert_eq!(original_qr_data.checksum, deserialized_qr_data.checksum);
    
    // Validate the deserialized data
    assert!(deserialized_qr_data.validate().is_ok());
}

#[test]
fn test_qr_code_data_edge_cases() {
    // Test with very long strings
    let long_node_id = "a".repeat(1000);
    let long_public_key = "b".repeat(1000);
    let long_address = "c".repeat(1000);
    
    let qr_data = QRCodeData::new(
        long_node_id.clone(),
        long_public_key.clone(),
        long_address.clone(),
        8080,
        vec!["posts".to_string(), "config".to_string()],
    );
    
    // Should still be valid
    assert!(qr_data.validate().is_ok());
    
    // Test with empty capabilities
    let qr_data_empty_caps = QRCodeData::new(
        "test_node".to_string(),
        "test_key".to_string(),
        "127.0.0.1".to_string(),
        8080,
        vec![], // Empty capabilities
    );
    
    // Should still be valid
    assert!(qr_data_empty_caps.validate().is_ok());
    
    // Test with very large port number (but still valid)
    let qr_data_large_port = QRCodeData::new(
        "test_node".to_string(),
        "test_key".to_string(),
        "127.0.0.1".to_string(),
        65535, // Maximum valid port
        vec!["posts".to_string()],
    );
    
    // Should be valid
    assert!(qr_data_large_port.validate().is_ok());
}

#[test]
fn test_qr_code_data_timestamp_edge_cases() {
    // Test with current timestamp (should be valid)
    let now = Utc::now().timestamp() as u64;
    let qr_data_current = QRCodeData::new(
        "test_node".to_string(),
        "test_key".to_string(),
        "127.0.0.1".to_string(),
        8080,
        vec!["posts".to_string()],
    );
    
    // The timestamp should be very close to now
    assert!(qr_data_current.timestamp >= now - 10); // Allow 10 second difference
    assert!(qr_data_current.timestamp <= now + 10);
    
    // Test with timestamp just under 1 hour old (should be valid)
    let qr_data_recent = QRCodeData::new(
        "test_node".to_string(),
        "test_key".to_string(),
        "127.0.0.1".to_string(),
        8080,
        vec!["posts".to_string()],
    );
    
    // Manually set timestamp to 30 minutes ago
    let mut qr_data_30min_old = qr_data_recent.clone();
    qr_data_30min_old.timestamp = now - 1800; // 30 minutes ago
    
    assert!(qr_data_30min_old.validate().is_ok());
    
    // Test with timestamp exactly 1 hour old (should be invalid)
    let mut qr_data_1hour_old = qr_data_recent.clone();
    qr_data_1hour_old.timestamp = now - 3600; // Exactly 1 hour ago
    
    assert!(qr_data_1hour_old.validate().is_err());
}

#[test]
fn test_qr_code_data_checksum_algorithm() {
    let qr_data1 = QRCodeData::new(
        "node_a".to_string(),
        "key_a".to_string(),
        "192.168.1.100".to_string(),
        8080,
        vec!["posts".to_string()],
    );
    
    let qr_data2 = QRCodeData::new(
        "node_a".to_string(),
        "key_a".to_string(),
        "192.168.1.100".to_string(),
        8080,
        vec!["posts".to_string()],
    );
    
    let qr_data3 = QRCodeData::new(
        "node_b".to_string(), // Different node
        "key_a".to_string(),
        "192.168.1.100".to_string(),
        8080,
        vec!["posts".to_string()],
    );
    
    // Same data should have same checksum
    assert_eq!(qr_data1.checksum, qr_data2.checksum);
    
    // Different data should have different checksums
    assert_ne!(qr_data1.checksum, qr_data3.checksum);
    
    // Checksums should be SHA256 hashes (64 hex characters)
    assert_eq!(qr_data1.checksum.len(), 64);
    assert!(qr_data1.checksum.chars().all(|c| c.is_ascii_hexdigit()));
    assert_eq!(qr_data2.checksum.len(), 64);
    assert!(qr_data2.checksum.chars().all(|c| c.is_ascii_hexdigit()));
    assert_eq!(qr_data3.checksum.len(), 64);
    assert!(qr_data3.checksum.chars().all(|c| c.is_ascii_hexdigit()));
}