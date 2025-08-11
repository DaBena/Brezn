use brezn::{BreznApp, types::Config};
use rand::{thread_rng, Rng};

#[tokio::test]
async fn test_p2p_network_integration() {
    // Create test configuration
    let port: u16 = thread_rng().gen_range(10_000..20_000);
    let config = Config {
        auto_save: true,
        max_posts: 1000,
        default_pseudonym: "test_user".to_string(),
        network_enabled: true,
        network_port: port, // Randomized port for testing
        tor_enabled: false, // Disable Tor for testing
        tor_socks_port: 9050,
    };
    
    // Create Brezn app instance
    let app = BreznApp::new(config).expect("Failed to create Brezn app");
    
    // Start the app
    app.start().await.expect("Failed to start Brezn app");
    
    // Wait a bit for services to start
    tokio::time::sleep(tokio::time::Duration::from_millis(150)).await;
    
    // Run P2P network tests
    app.test_p2p_network().await.expect("P2P network test failed");
    
    println!("✅ Integration test completed successfully!");
}

#[tokio::test]
async fn test_post_creation_and_retrieval() {
    let port: u16 = thread_rng().gen_range(20_001..30_000);
    let config = Config {
        auto_save: true,
        max_posts: 1000,
        default_pseudonym: "test_user".to_string(),
        network_enabled: true,
        network_port: port, // Randomized port
        tor_enabled: false,
        tor_socks_port: 9050,
    };
    
    let app = BreznApp::new(config).expect("Failed to create Brezn app");
    app.start().await.expect("Failed to start Brezn app");
    
    // Wait for startup
    tokio::time::sleep(tokio::time::Duration::from_millis(150)).await;
    
    // Create multiple posts
    app.create_post("First test post".to_string(), "user1".to_string()).await.expect("Failed to create post 1");
    app.create_post("Second test post".to_string(), "user2".to_string()).await.expect("Failed to create post 2");
    app.create_post("Third test post".to_string(), "user3".to_string()).await.expect("Failed to create post 3");
    
    // Retrieve posts
    let posts = app.get_posts().await.expect("Failed to get posts");
    
    // Verify we have at least 3 posts
    assert!(posts.len() >= 3, "Expected at least 3 posts, got {}", posts.len());
    
    // Verify post content
    let post_contents: Vec<&str> = posts.iter().map(|p| p.content.as_str()).collect();
    assert!(post_contents.contains(&"First test post"), "First post not found");
    assert!(post_contents.contains(&"Second test post"), "Second post not found");
    assert!(post_contents.contains(&"Third test post"), "Third post not found");
    
    println!("✅ Post creation and retrieval test passed!");
}

#[tokio::test]
async fn test_qr_code_generation() {
    let port: u16 = thread_rng().gen_range(30_001..40_000);
    let config = Config {
        auto_save: true,
        max_posts: 1000,
        default_pseudonym: "test_user".to_string(),
        network_enabled: true,
        network_port: port, // Randomized port
        tor_enabled: false,
        tor_socks_port: 9050,
    };
    
    let app = BreznApp::new(config).expect("Failed to create Brezn app");
    app.start().await.expect("Failed to start Brezn app");
    
    // Wait for startup
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
    
    // Generate QR code
    let qr_code = app.generate_qr_code().expect("Failed to generate QR code");
    
    // Verify QR code is not empty
    assert!(!qr_code.is_empty(), "QR code should not be empty");
    assert!(qr_code.contains("node_id"), "QR code should contain node_id");
    
    println!("✅ QR code generation test passed!");
    println!("Generated QR code: {}", qr_code);
}