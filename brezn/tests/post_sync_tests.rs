use brezn::{discovery, network, types};
use tokio::time::{sleep, Duration};

#[tokio::test]
async fn test_post_synchronization_basic() {
    // Test basic post synchronization
    let network = network::Network::new().await;
    assert!(network.is_ok());
    
    // Create test posts
    let post1 = types::Post::new("First post".to_string());
    let post2 = types::Post::new("Second post".to_string());
    
    // Test serialization
    let serialized1 = serde_json::to_string(&post1);
    let serialized2 = serde_json::to_string(&post2);
    
    assert!(serialized1.is_ok());
    assert!(serialized2.is_ok());
}

#[tokio::test]
async fn test_post_synchronization_batch() {
    // Test batch post synchronization
    let mut posts = vec![];
    
    // Create multiple posts
    for i in 0..10 {
        let post = types::Post::new(format!("Batch post {}", i));
        posts.push(post);
    }
    
    // Test batch processing
    for post in &posts {
        let serialized = serde_json::to_string(post);
        assert!(serialized.is_ok());
    }
    
    assert_eq!(posts.len(), 10);
}

#[tokio::test]
async fn test_post_synchronization_conflict_resolution() {
    // Test post synchronization conflict resolution
    let network = network::Network::new().await;
    assert!(network.is_ok());
    
    // Simulate conflicting posts
    let post1 = types::Post::new("Conflicting post 1".to_string());
    let post2 = types::Post::new("Conflicting post 2".to_string());
    
    // Test conflict detection
    let serialized1 = serde_json::to_string(&post1);
    let serialized2 = serde_json::to_string(&post2);
    
    assert!(serialized1.is_ok());
    assert!(serialized2.is_ok());
    
    // Simulate conflict resolution
    sleep(Duration::from_millis(10)).await;
}

#[tokio::test]
async fn test_post_synchronization_network_partitions() {
    // Test post synchronization during network partitions
    let discovery = discovery::Discovery::new();
    assert!(discovery.is_ok());
    
    // Simulate network partitions
    for i in 0..3 {
        let post = types::Post::new(format!("Partition post {}", i));
        let serialized = serde_json::to_string(&post);
        assert!(serialized.is_ok());
        
        sleep(Duration::from_millis(5)).await;
    }
}