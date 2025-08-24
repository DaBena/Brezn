use brezn::{discovery, network, types};

#[tokio::test]
async fn test_basic_network_operations() {
    // Basic network functionality test
    let result = network::Network::new().await;
    assert!(result.is_ok());
}

#[tokio::test]
async fn test_discovery_mechanism() {
    // Discovery mechanism test
    let discovery = discovery::Discovery::new();
    assert!(discovery.is_ok());
}

#[tokio::test]
async fn test_types_serialization() {
    // Test type serialization
    let message = types::Message::new("test".to_string());
    let serialized = serde_json::to_string(&message);
    assert!(serialized.is_ok());
}

#[tokio::test]
async fn test_p2p_integration() {
    // P2P integration test
    let network = network::Network::new().await;
    assert!(network.is_ok());
}

#[tokio::test]
async fn test_post_sync() {
    // Post synchronization test
    let sync = network::SyncManager::new();
    assert!(sync.is_ok());
}

#[tokio::test]
async fn test_qr_code_generation() {
    // QR code generation test
    let qr_data = "test data for qr code";
    let qr_result = qrcode::QrCode::new(qr_data);
    assert!(qr_result.is_ok());
}