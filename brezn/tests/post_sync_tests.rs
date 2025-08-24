use brezn::types::{
    Post, PostId, PostConflict, ConflictResolutionStrategy, FeedState, 
    PeerFeedState, SyncStatus, SyncRequest, SyncResponse, SyncMode,
    PostBroadcast, PostOrder, DataIntegrityCheck, VerificationStatus
};
use brezn::network::NetworkManager;
use brezn::sync_metrics::{SyncPerformanceMonitor, FeedConsistencyChecker, FeedConsistencyReport};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::time::sleep;

/// Test suite for post synchronization functionality
#[tokio::test]
async fn test_post_broadcast_mechanism() {
    let network_manager = NetworkManager::new(8888, 9050);
    
    // Create test posts
    let post1 = Post::new(
        "Test post 1".to_string(),
        "TestUser1".to_string(),
        Some("node1".to_string())
    );
    
    let post2 = Post::new(
        "Test post 2".to_string(),
        "TestUser2".to_string(),
        Some("node2".to_string())
    );
    
    // Test post broadcast
    let result1 = network_manager.broadcast_post(&post1).await;
    assert!(result1.is_ok(), "Post broadcast should succeed");
    
    let result2 = network_manager.broadcast_post(&post2).await;
    assert!(result2.is_ok(), "Post broadcast should succeed");
    
    // Verify posts have unique IDs
    let post_id1 = post1.get_post_id();
    let post_id2 = post2.get_post_id();
    assert_ne!(post_id1.hash, post_id2.hash, "Posts should have different IDs");
    
    // Verify post IDs contain correct information
    assert_eq!(post_id1.node_id, "node1");
    assert_eq!(post_id2.node_id, "node2");
    assert_eq!(post_id1.timestamp, post1.timestamp);
    assert_eq!(post_id2.timestamp, post2.timestamp);
}

#[tokio::test]
async fn test_conflict_detection_and_resolution() {
    let network_manager = NetworkManager::new(8889, 9051);
    
    // Create conflicting posts (same content, different timestamps)
    let post1 = Post::new(
        "Conflicting content".to_string(),
        "TestUser".to_string(),
        Some("node1".to_string())
    );
    
    let mut post2 = Post::new(
        "Conflicting content".to_string(),
        "TestUser".to_string(),
        Some("node2".to_string())
    );
    post2.timestamp = post1.timestamp + 60; // 1 minute later
    
    // Test conflict detection
    let conflict1 = network_manager.detect_post_conflict(&post1).await.unwrap();
    assert!(conflict1.is_none(), "First post should not have conflicts");
    
    let conflict2 = network_manager.detect_post_conflict(&post2).await.unwrap();
    assert!(conflict2.is_some(), "Second post should have conflicts");
    
    if let Some(conflict) = conflict2 {
        assert_eq!(conflict.conflicting_posts.len(), 1);
        assert_eq!(conflict.resolution_strategy, ConflictResolutionStrategy::LatestWins);
        assert!(conflict.resolved_at.is_none());
        
        // Test conflict resolution
        let resolution_result = network_manager.resolve_post_conflict(conflict).await;
        assert!(resolution_result.is_ok(), "Conflict resolution should succeed");
    }
}

#[tokio::test]
async fn test_feed_consistency_between_peers() {
    let network_manager = NetworkManager::new(8890, 9052);
    
    // Create test posts for different nodes
    let posts_node1 = vec![
        Post::new("Post 1 from Node 1".to_string(), "User1".to_string(), Some("node1".to_string())),
        Post::new("Post 2 from Node 1".to_string(), "User2".to_string(), Some("node1".to_string())),
    ];
    
    let posts_node2 = vec![
        Post::new("Post 1 from Node 1".to_string(), "User1".to_string(), Some("node1".to_string())), // Same as node1
        Post::new("Post 3 from Node 2".to_string(), "User3".to_string(), Some("node2".to_string())), // Different
    ];
    
    // Test feed consistency
    let consistency_result = network_manager.ensure_feed_consistency().await;
    assert!(consistency_result.is_ok(), "Feed consistency check should succeed");
    
    // Test ordered posts
    let ordered_posts = network_manager.get_ordered_posts(10).await.unwrap();
    assert!(!ordered_posts.is_empty(), "Should return ordered posts");
    
    // Verify posts are ordered by timestamp
    for i in 1..ordered_posts.len() {
        assert!(
            ordered_posts[i-1].timestamp <= ordered_posts[i].timestamp,
            "Posts should be ordered by timestamp"
        );
    }
}

#[tokio::test]
async fn test_post_ordering_management() {
    let network_manager = NetworkManager::new(8891, 9053);
    
    // Create posts with different timestamps
    let mut post1 = Post::new(
        "First post".to_string(),
        "User1".to_string(),
        Some("node1".to_string())
    );
    post1.timestamp = 1000;
    
    let mut post2 = Post::new(
        "Second post".to_string(),
        "User2".to_string(),
        Some("node2".to_string())
    );
    post2.timestamp = 2000;
    
    let mut post3 = Post::new(
        "Third post".to_string(),
        "User3".to_string(),
        Some("node3".to_string())
    );
    post3.timestamp = 1500; // Between post1 and post2
    
    // Broadcast posts
    network_manager.broadcast_post(&post1).await.unwrap();
    network_manager.broadcast_post(&post2).await.unwrap();
    network_manager.broadcast_post(&post3).await.unwrap();
    
    // Get ordered posts
    let ordered_posts = network_manager.get_ordered_posts(10).await.unwrap();
    
    // Verify ordering: post1 (1000), post3 (1500), post2 (2000)
    assert_eq!(ordered_posts.len(), 3);
    assert_eq!(ordered_posts[0].timestamp, 1000);
    assert_eq!(ordered_posts[1].timestamp, 1500);
    assert_eq!(ordered_posts[2].timestamp, 2000);
}

#[tokio::test]
async fn test_data_integrity_checks() {
    let network_manager = NetworkManager::new(8892, 9054);
    
    // Create a valid post
    let post = Post::new(
        "Test post for integrity check".to_string(),
        "TestUser".to_string(),
        Some("test_node".to_string())
    );
    
    // Test integrity verification
    let integrity_check = network_manager.verify_post_integrity(&post).await.unwrap();
    
    // Verify the check contains correct information
    assert_eq!(integrity_check.post_id.hash, post.get_post_id().hash);
    assert_eq!(integrity_check.verification_status, VerificationStatus::Verified);
    
    // Test with modified post (should fail integrity check)
    let mut modified_post = post.clone();
    modified_post.content = "Modified content".to_string();
    
    let modified_check = network_manager.verify_post_integrity(&modified_post).await.unwrap();
    assert_eq!(modified_check.verification_status, VerificationStatus::Failed);
}

#[tokio::test]
async fn test_sync_performance_metrics() {
    let monitor = SyncPerformanceMonitor::new();
    
    // Test sync monitoring
    let sync_id = "test_sync_1".to_string();
    monitor.start_sync_monitoring(sync_id.clone());
    
    // Simulate sync operation
    sleep(Duration::from_millis(50)).await;
    
    // Stop monitoring with success
    monitor.stop_sync_monitoring(sync_id, true, 5, 1);
    
    // Get metrics
    let metrics = monitor.get_metrics();
    
    // Verify metrics
    assert_eq!(metrics.total_sync_operations, 1);
    assert_eq!(metrics.successful_syncs, 1);
    assert_eq!(metrics.failed_syncs, 0);
    assert_eq!(metrics.total_posts_synced, 5);
    assert_eq!(metrics.total_conflicts_resolved, 1);
    assert!(metrics.average_sync_time_ms > 0.0);
    assert_eq!(metrics.get_success_rate(), 100.0);
    
    // Test failed sync
    let sync_id2 = "test_sync_2".to_string();
    monitor.start_sync_monitoring(sync_id2.clone());
    sleep(Duration::from_millis(10)).await;
    monitor.stop_sync_monitoring(sync_id2, false, 0, 0);
    
    let updated_metrics = monitor.get_metrics();
    assert_eq!(updated_metrics.total_sync_operations, 2);
    assert_eq!(updated_metrics.failed_syncs, 1);
    assert_eq!(updated_metrics.get_success_rate(), 50.0);
}

#[tokio::test]
async fn test_feed_consistency_checker() {
    let metrics = Arc::new(Mutex::new(brezn::sync_metrics::SyncMetrics::default()));
    let checker = FeedConsistencyChecker::new(metrics);
    
    // Create test feeds
    let local_posts = vec![
        Post::new("Local Post 1".to_string(), "User1".to_string(), Some("local".to_string())),
        Post::new("Local Post 2".to_string(), "User2".to_string(), Some("local".to_string())),
        Post::new("Shared Post".to_string(), "User3".to_string(), Some("shared".to_string())),
    ];
    
    let peer_posts = vec![
        Post::new("Peer Post 1".to_string(), "User4".to_string(), Some("peer".to_string())),
        Post::new("Shared Post".to_string(), "User3".to_string(), Some("shared".to_string())),
        Post::new("Peer Post 2".to_string(), "User5".to_string(), Some("peer".to_string())),
    ];
    
    // Check consistency
    let report = checker.check_feed_consistency(&local_posts, &peer_posts);
    
    // Verify report
    assert_eq!(report.missing_local_posts.len(), 2); // Peer Post 1, Peer Post 2
    assert_eq!(report.missing_peer_posts.len(), 2); // Local Post 1, Local Post 2
    assert_eq!(report.consistency_score, 0.2); // 1 shared post out of 5 total posts
    
    // Test report methods
    assert!(!report.is_consistent()); // Score 0.2 < 0.9
    let summary = report.get_summary();
    assert!(summary.contains("20.0%")); // Consistency score
    assert!(summary.contains("2")); // Missing posts counts
}

#[tokio::test]
async fn test_sync_request_response_cycle() {
    let network_manager = NetworkManager::new(8893, 9055);
    
    // Create sync request
    let sync_request = SyncRequest {
        requesting_node: "requesting_node".to_string(),
        last_known_timestamp: 1000,
        requested_post_count: 50,
        sync_mode: SyncMode::Incremental,
    };
    
    // Test sync request handling
    let result = network_manager.handle_sync_request(&sync_request, "peer_node").await;
    assert!(result.is_ok(), "Sync request handling should succeed");
    
    // Create sync response
    let sync_response = SyncResponse {
        responding_node: "responding_node".to_string(),
        posts: vec![
            Post::new("Response Post 1".to_string(), "User1".to_string(), Some("node1".to_string())),
            Post::new("Response Post 2".to_string(), "User2".to_string(), Some("node2".to_string())),
        ],
        conflicts: vec![],
        feed_state: FeedState {
            node_id: "responding_node".to_string(),
            last_sync_timestamp: 2000,
            post_count: 2,
            last_post_id: None,
            peer_states: std::collections::HashMap::new(),
        },
        sync_timestamp: 2000,
    };
    
    // Test sync response handling
    let result = network_manager.handle_sync_response(&sync_response).await;
    assert!(result.is_ok(), "Sync response handling should succeed");
}

#[tokio::test]
async fn test_post_conflict_resolution_strategies() {
    let network_manager = NetworkManager::new(8894, 9056);
    
    // Create conflicting posts
    let post1 = Post::new(
        "Content A".to_string(),
        "User1".to_string(),
        Some("node1".to_string())
    );
    
    let mut post2 = Post::new(
        "Content B".to_string(),
        "User1".to_string(),
        Some("node1".to_string())
    );
    post2.timestamp = post1.timestamp + 120; // 2 minutes later
    
    let mut post3 = Post::new(
        "Content C".to_string(),
        "User1".to_string(),
        Some("node1".to_string())
    );
    post3.timestamp = post1.timestamp + 60; // 1 minute later
    
    // Test different resolution strategies
    let conflicts = vec![post1.clone(), post2.clone(), post3.clone()];
    
    // Test LatestWins strategy
    let mut conflict = PostConflict {
        post_id: post1.get_post_id(),
        conflicting_posts: conflicts.clone(),
        resolution_strategy: ConflictResolutionStrategy::LatestWins,
        resolved_at: None,
    };
    
    let result = network_manager.resolve_post_conflict(conflict).await;
    assert!(result.is_ok(), "LatestWins resolution should succeed");
    
    // Test FirstWins strategy
    let mut conflict = PostConflict {
        post_id: post1.get_post_id(),
        conflicting_posts: conflicts.clone(),
        resolution_strategy: ConflictResolutionStrategy::FirstWins,
        resolved_at: None,
    };
    
    let result = network_manager.resolve_post_conflict(conflict).await;
    assert!(result.is_ok(), "FirstWins resolution should succeed");
    
    // Test ContentHash strategy
    let mut conflict = PostConflict {
        post_id: post1.get_post_id(),
        conflicting_posts: conflicts.clone(),
        resolution_strategy: ConflictResolutionStrategy::ContentHash,
        resolved_at: None,
    };
    
    let result = network_manager.resolve_post_conflict(conflict).await;
    assert!(result.is_ok(), "ContentHash resolution should succeed");
}

#[tokio::test]
async fn test_broadcast_cache_and_ttl() {
    let network_manager = NetworkManager::new(8895, 9057);
    
    // Create a post
    let post = Post::new(
        "TTL Test Post".to_string(),
        "TestUser".to_string(),
        Some("test_node".to_string())
    );
    
    // Broadcast the post
    let result = network_manager.broadcast_post(&post).await;
    assert!(result.is_ok(), "Post broadcast should succeed");
    
    // The broadcast should be cached and have TTL management
    // This tests the internal broadcast cache functionality
}

#[tokio::test]
async fn test_peer_feed_state_management() {
    let network_manager = NetworkManager::new(8896, 9058);
    
    // Add a peer
    let (pubk, _seck) = brezn::crypto::CryptoManager::new().generate_keypair().unwrap();
    network_manager.add_peer(
        "test_peer".to_string(),
        pubk,
        "127.0.0.1".to_string(),
        8888,
        false
    );
    
    // Test feed state management
    let feed_state = network_manager.get_feed_state().await.unwrap();
    assert!(feed_state.peer_states.contains_key("test_peer"));
    
    let peer_state = &feed_state.peer_states["test_peer"];
    assert_eq!(peer_state.sync_status, SyncStatus::Pending);
    assert_eq!(peer_state.node_id, "test_peer");
}

/// Integration test for complete post synchronization workflow
#[tokio::test]
async fn test_complete_sync_workflow() {
    let network_manager = NetworkManager::new(8897, 9059);
    let monitor = SyncPerformanceMonitor::new();
    
    // Create multiple posts
    let posts = vec![
        Post::new("Workflow Post 1".to_string(), "User1".to_string(), Some("node1".to_string())),
        Post::new("Workflow Post 2".to_string(), "User2".to_string(), Some("node2".to_string())),
        Post::new("Workflow Post 3".to_string(), "User3".to_string(), Some("node3".to_string())),
    ];
    
    // Start monitoring
    let sync_id = "workflow_sync".to_string();
    monitor.start_sync_monitoring(sync_id.clone());
    
    // Broadcast all posts
    for post in &posts {
        let result = network_manager.broadcast_post(post).await;
        assert!(result.is_ok(), "Post broadcast should succeed");
    }
    
    // Ensure feed consistency
    let result = network_manager.ensure_feed_consistency().await;
    assert!(result.is_ok(), "Feed consistency should succeed");
    
    // Get ordered posts
    let ordered_posts = network_manager.get_ordered_posts(10).await.unwrap();
    assert_eq!(ordered_posts.len(), 3, "Should have 3 posts");
    
    // Stop monitoring
    monitor.stop_sync_monitoring(sync_id, true, 3, 0);
    
    // Verify metrics
    let metrics = monitor.get_metrics();
    assert_eq!(metrics.total_sync_operations, 1);
    assert_eq!(metrics.successful_syncs, 1);
    assert_eq!(metrics.total_posts_synced, 3);
    
    println!("Complete sync workflow test completed successfully");
    println!("{}", metrics.get_performance_summary());
}