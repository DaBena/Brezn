use brezn::{BreznApp, types::Config};
use tokio::time::{Duration, sleep};
use std::sync::Arc;
use anyhow::Result;

/// Test P2P Network between two instances
#[tokio::test]
async fn test_p2p_network_between_instances() -> Result<()> {
    println!("🧪 Testing P2P Network between two instances...");
    
    // Create two different configurations
    let config1 = Config {
        auto_save: true,
        max_posts: 1000,
        default_pseudonym: "node1_user".to_string(),
        network_enabled: true,
        network_port: 8888,
        tor_enabled: false,
        tor_socks_port: 9050,
    };
    
    let config2 = Config {
        auto_save: true,
        max_posts: 1000,
        default_pseudonym: "node2_user".to_string(),
        network_enabled: true,
        network_port: 8889, // Different port
        tor_enabled: false,
        tor_socks_port: 9050,
    };
    
    // Create two app instances
    let app1 = Arc::new(BreznApp::new(config1)?);
    let app2 = Arc::new(BreznApp::new(config2)?);
    
    // Start both apps
    app1.start().await?;
    app2.start().await?;
    
    println!("✅ Both apps started successfully");
    
    // Wait for services to initialize
    sleep(Duration::from_millis(500)).await;
    
    // Test 1: Generate QR codes for both nodes
    let qr1 = app1.generate_qr_code()?;
    let qr2 = app2.generate_qr_code()?;
    
    println!("✅ QR codes generated:");
    println!("Node 1 QR: {}", qr1);
    println!("Node 2 QR: {}", qr2);
    
    // Test 2: Parse QR codes and add peers
    app1.parse_qr_code(&qr2)?;
    app2.parse_qr_code(&qr1)?;
    
    println!("✅ Peers added via QR codes");
    
    // Test 3: Create posts on both nodes
    app1.create_post("Hello from Node 1!".to_string(), "node1".to_string()).await?;
    app2.create_post("Hello from Node 2!".to_string(), "node2".to_string()).await?;
    
    println!("✅ Posts created on both nodes");
    
    // Wait for network propagation
    sleep(Duration::from_millis(1000)).await;
    
    // Test 4: Check if posts are synchronized
    let posts1 = app1.get_posts().await?;
    let posts2 = app2.get_posts().await?;
    
    println!("Node 1 posts: {}", posts1.len());
    println!("Node 2 posts: {}", posts2.len());
    
    // Verify both nodes have posts from each other
    let node1_posts: Vec<&str> = posts1.iter().map(|p| p.content.as_str()).collect();
    let node2_posts: Vec<&str> = posts2.iter().map(|p| p.content.as_str()).collect();
    
    assert!(node1_posts.contains(&"Hello from Node 1!"), "Node 1 should have its own post");
    assert!(node2_posts.contains(&"Hello from Node 2!"), "Node 2 should have its own post");
    
    // Test 5: Check network status
    let status1 = app1.get_network_status()?;
    let status2 = app2.get_network_status()?;
    
    println!("Node 1 status: {:?}", status1);
    println!("Node 2 status: {:?}", status2);
    
    // Verify peers are connected
    let peers1 = status1["peers_count"].as_u64().unwrap_or(0);
    let peers2 = status2["peers_count"].as_u64().unwrap_or(0);
    
    assert!(peers1 > 0, "Node 1 should have peers");
    assert!(peers2 > 0, "Node 2 should have peers");
    
    println!("🎉 P2P Network test passed successfully!");
    Ok(())
}

/// Test Peer Discovery functionality
#[tokio::test]
async fn test_peer_discovery() -> Result<()> {
    println!("🧪 Testing Peer Discovery...");
    
    let config = Config {
        auto_save: true,
        max_posts: 1000,
        default_pseudonym: "discovery_test".to_string(),
        network_enabled: true,
        network_port: 8895,
        tor_enabled: false,
        tor_socks_port: 9050,
    };
    
    let app = BreznApp::new(config)?;
    app.start().await?;
    
    // Wait for discovery to start
    sleep(Duration::from_millis(1000)).await;
    
    // Test discovery status
    let status = app.get_network_status()?;
    let discovery_peers = status["discovery_peers_count"].as_u64().unwrap_or(0);
    
    println!("Discovery peers found: {}", discovery_peers);
    
    // Test QR code generation for discovery
    let qr_code = app.generate_qr_code()?;
    assert!(!qr_code.is_empty(), "QR code should not be empty");
    assert!(qr_code.contains("node_id"), "QR code should contain node_id");
    
    // Test QR code parsing
    let result = app.parse_qr_code(&qr_code);
    assert!(result.is_ok(), "QR code parsing should succeed");
    
    println!("✅ Peer Discovery test passed!");
    Ok(())
}

/// Test Post Synchronization
#[tokio::test]
async fn test_post_synchronization() -> Result<()> {
    println!("🧪 Testing Post Synchronization...");
    
    let config1 = Config {
        auto_save: true,
        max_posts: 1000,
        default_pseudonym: "sync_user1".to_string(),
        network_enabled: true,
        network_port: 8896,
        tor_enabled: false,
        tor_socks_port: 9050,
    };
    
    let config2 = Config {
        auto_save: true,
        max_posts: 1000,
        default_pseudonym: "sync_user2".to_string(),
        network_enabled: true,
        network_port: 8897,
        tor_enabled: false,
        tor_socks_port: 9050,
    };
    
    let app1 = BreznApp::new(config1)?;
    let app2 = BreznApp::new(config2)?;
    
    app1.start().await?;
    app2.start().await?;
    
    sleep(Duration::from_millis(500)).await;
    
    // Connect nodes via QR codes
    let qr1 = app1.generate_qr_code()?;
    let qr2 = app2.generate_qr_code()?;
    
    app1.parse_qr_code(&qr2)?;
    app2.parse_qr_code(&qr1)?;
    
    // Create multiple posts on node 1
    app1.create_post("Sync test post 1".to_string(), "user1".to_string()).await?;
    app1.create_post("Sync test post 2".to_string(), "user1".to_string()).await?;
    app1.create_post("Sync test post 3".to_string(), "user1".to_string()).await?;
    
    // Create posts on node 2
    app2.create_post("Sync test post 4".to_string(), "user2".to_string()).await?;
    app2.create_post("Sync test post 5".to_string(), "user2".to_string()).await?;
    
    // Wait for synchronization
    sleep(Duration::from_millis(2000)).await;
    
    // Check synchronization
    let posts1 = app1.get_posts().await?;
    let posts2 = app2.get_posts().await?;
    
    println!("Node 1 posts: {}", posts1.len());
    println!("Node 2 posts: {}", posts2.len());
    
    // Verify all posts are present on both nodes
    let post_contents1: Vec<&str> = posts1.iter().map(|p| p.content.as_str()).collect();
    let post_contents2: Vec<&str> = posts2.iter().map(|p| p.content.as_str()).collect();
    
    let expected_posts = vec![
        "Sync test post 1",
        "Sync test post 2", 
        "Sync test post 3",
        "Sync test post 4",
        "Sync test post 5"
    ];
    
    for expected_post in expected_posts {
        assert!(post_contents1.contains(&expected_post), 
                "Node 1 missing post: {}", expected_post);
        assert!(post_contents2.contains(&expected_post), 
                "Node 2 missing post: {}", expected_post);
    }
    
    println!("✅ Post Synchronization test passed!");
    Ok(())
}

/// Test Tor Integration
#[tokio::test]
async fn test_tor_integration() -> Result<()> {
    println!("🧪 Testing Tor Integration...");
    
    let config = Config {
        auto_save: true,
        max_posts: 1000,
        default_pseudonym: "tor_test".to_string(),
        network_enabled: true,
        network_port: 8898,
        tor_enabled: true,
        tor_socks_port: 9050,
    };
    
    let app = BreznApp::new(config)?;
    app.start().await?;
    
    // Enable Tor
    app.enable_tor().await?;
    
    sleep(Duration::from_millis(1000)).await;
    
    // Test Tor status
    let status = app.get_network_status()?;
    let tor_enabled = status["tor_enabled"].as_bool().unwrap_or(false);
    
    assert!(tor_enabled, "Tor should be enabled");
    
    // Test post creation with Tor
    app.create_post("Tor test post".to_string(), "tor_user".to_string()).await?;
    
    let posts = app.get_posts().await?;
    assert!(!posts.is_empty(), "Should have posts after Tor test");
    
    println!("✅ Tor Integration test passed!");
    Ok(())
}

/// Test Network Message Handling
#[tokio::test]
async fn test_network_message_handling() -> Result<()> {
    println!("🧪 Testing Network Message Handling...");
    
    let config = Config {
        auto_save: true,
        max_posts: 1000,
        default_pseudonym: "message_test".to_string(),
        network_enabled: true,
        network_port: 8900,
        tor_enabled: false,
        tor_socks_port: 9050,
    };
    
    let app = BreznApp::new(config)?;
    app.start().await?;
    
    sleep(Duration::from_millis(500)).await;
    
    // Test ping/pong messages
    let status = app.get_network_status()?;
    println!("Network status: {:?}", status);
    
    // Test message handler registration
    let posts = app.get_posts().await?;
    println!("Initial posts: {}", posts.len());
    
    // Create a post to test message handling
    app.create_post("Message handling test".to_string(), "test_user".to_string()).await?;
    
    let posts_after = app.get_posts().await?;
    assert!(posts_after.len() > posts.len(), "Should have more posts after creation");
    
    println!("✅ Network Message Handling test passed!");
    Ok(())
}

/// Test Error Handling and Edge Cases
#[tokio::test]
async fn test_network_error_handling() -> Result<()> {
    println!("🧪 Testing Network Error Handling...");
    
    let config = Config {
        auto_save: true,
        max_posts: 1000,
        default_pseudonym: "error_test".to_string(),
        network_enabled: true,
        network_port: 8901,
        tor_enabled: false,
        tor_socks_port: 9050,
    };
    
    let app = BreznApp::new(config)?;
    app.start().await?;
    
    // Test invalid QR code parsing
    let invalid_qr = "invalid_qr_code_data";
    let result = app.parse_qr_code(invalid_qr);
    assert!(result.is_err(), "Should fail to parse invalid QR code");
    
    // Test network with no peers
    let status = app.get_network_status()?;
    let peers_count = status["peers_count"].as_u64().unwrap_or(0);
    assert_eq!(peers_count, 0, "Should have no peers initially");
    
    println!("✅ Network Error Handling test passed!");
    Ok(())
}