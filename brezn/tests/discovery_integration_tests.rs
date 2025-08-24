use brezn::discovery::*;
use tokio::time::{Duration, sleep};
use std::collections::HashMap;

/// Integration-Tests für das erweiterte Discovery-System
#[tokio::test]
async fn test_enhanced_discovery_workflow() {
    let config = DiscoveryConfig {
        broadcast_interval: Duration::from_millis(100),
        peer_timeout: Duration::from_secs(1),
        max_peers: 10,
        enable_qr: true,
        discovery_port: 8889, // Verwende anderen Port für Tests
        broadcast_address: "255.255.255.255:8889".to_string(),
        multicast_address: "224.0.0.1:8889".to_string(),
        heartbeat_interval: Duration::from_millis(200),
        connection_retry_limit: 3,
        enable_multicast: true,
        enable_broadcast: true,
        discovery_timeout: Duration::from_millis(50),
        peer_health_check_interval: Duration::from_millis(150),
        max_connection_attempts: 3,
        enable_peer_verification: true,
        enable_automatic_peer_addition: true,
        peer_discovery_retry_interval: Duration::from_millis(100),
        network_segment_filtering: true,
        enable_peer_statistics: true,
        multicast_ttl: 32,
        broadcast_retry_count: 2,
    };

    let mut manager1 = DiscoveryManager::new(
        config.clone(),
        "node_1".to_string(),
        "pub_key_1".to_string(),
        8889,
    );

    let mut manager2 = DiscoveryManager::new(
        config.clone(),
        "node_2".to_string(),
        "pub_key_2".to_string(),
        8890,
    );

    // Initialisiere Sockets
    manager1.init_sockets().await.unwrap();
    manager2.init_sockets().await.unwrap();

    // Starte Discovery
    let manager1_clone = manager1.clone();
    let manager2_clone = manager2.clone();

    let task1 = tokio::spawn(async move {
        manager1_clone.start_discovery().await.unwrap();
    });

    let task2 = tokio::spawn(async move {
        manager2_clone.start_discovery().await.unwrap();
    });

    // Warte kurz, damit Discovery starten kann
    sleep(Duration::from_millis(500)).await;

    // Überprüfe, ob Peers sich gegenseitig gefunden haben
    let peers1 = manager1.get_peers().unwrap();
    let peers2 = manager2.get_peers().unwrap();

    println!("Manager 1 hat {} Peers gefunden", peers1.len());
    println!("Manager 2 hat {} Peers gefunden", peers2.len());

    // Cleanup
    task1.abort();
    task2.abort();

    // Überprüfe, dass mindestens ein Peer gefunden wurde
    assert!(peers1.len() > 0 || peers2.len() > 0, "Keine Peers gefunden");
}

#[tokio::test]
async fn test_peer_health_monitoring() {
    let config = DiscoveryConfig::default();
    let manager = DiscoveryManager::new(
        config,
        "health_test_node".to_string(),
        "health_test_key".to_string(),
        8891,
    );

    // Füge Test-Peers hinzu
    let peer1 = PeerInfo {
        node_id: "healthy_peer".to_string(),
        public_key: "pub_healthy".to_string(),
        address: "127.0.0.1".to_string(),
        port: 8892,
        last_seen: chrono::Utc::now().timestamp() as u64,
        capabilities: vec!["posts".to_string()],
        connection_attempts: 0,
        last_connection_attempt: 0,
        is_verified: false,
        network_segment: Some("test_segment".to_string()),
        health_score: 0.5,
        response_time_ms: None,
        last_health_check: 0,
        consecutive_failures: 0,
        discovery_source: DiscoverySource::Manual,
        metadata: HashMap::new(),
        is_active: true,
        last_successful_communication: 0,
        bandwidth_estimate: None,
        latency_history: Vec::new(),
    };

    let peer2 = PeerInfo {
        node_id: "unhealthy_peer".to_string(),
        public_key: "pub_unhealthy".to_string(),
        address: "127.0.0.1".to_string(),
        port: 8893,
        last_seen: chrono::Utc::now().timestamp() as u64,
        capabilities: vec!["posts".to_string()],
        connection_attempts: 0,
        last_connection_attempt: 0,
        is_verified: false,
        network_segment: Some("test_segment".to_string()),
        health_score: 0.3,
        response_time_ms: Some(2000), // Schlechte Response-Time
        last_health_check: 0,
        consecutive_failures: 3,
        discovery_source: DiscoverySource::Manual,
        metadata: HashMap::new(),
        is_active: true,
        last_successful_communication: 0,
        bandwidth_estimate: None,
        latency_history: Vec::new(),
    };

    manager.add_peer(peer1).unwrap();
    manager.add_peer(peer2).unwrap();

    // Starte Health-Monitoring
    let health_task = manager.start_health_monitoring().await.unwrap();

    // Warte kurz, damit Health-Checks durchgeführt werden können
    sleep(Duration::from_millis(200)).await;

    // Überprüfe Health-Statistiken
    let stats = manager.get_enhanced_discovery_stats();
    
    println!("Health-Statistiken: {:?}", stats);

    assert_eq!(stats["total_peers"], 2);
    
    // Cleanup
    health_task.abort();
}

#[tokio::test]
async fn test_network_topology_discovery() {
    let config = DiscoveryConfig::default();
    let manager = DiscoveryManager::new(
        config,
        "topology_test_node".to_string(),
        "topology_test_key".to_string(),
        8894,
    );

    // Füge Peers mit verschiedenen Network-Segmenten hinzu
    let segments = vec!["segment_a", "segment_b", "segment_c"];
    let capabilities = vec!["posts", "config", "p2p", "storage"];

    for (i, segment) in segments.iter().enumerate() {
        for (j, capability) in capabilities.iter().enumerate() {
            let peer = PeerInfo {
                node_id: format!("peer_{}_{}", segment, capability),
                public_key: format!("pub_{}_{}", segment, capability),
                address: "127.0.0.1".to_string(),
                port: 8900 + (i * 100) + j,
                last_seen: chrono::Utc::now().timestamp() as u64,
                capabilities: vec![capability.to_string()],
                connection_attempts: 0,
                last_connection_attempt: 0,
                is_verified: (i + j) % 2 == 0, // Abwechselnd verifiziert
                network_segment: Some(segment.to_string()),
                health_score: 0.5 + (i as f64 * 0.1) + (j as f64 * 0.05),
                response_time_ms: Some(50 + (i * 10) + (j * 5)),
                last_health_check: chrono::Utc::now().timestamp() as u64,
                consecutive_failures: 0,
                discovery_source: DiscoverySource::Manual,
                metadata: HashMap::new(),
                is_active: true,
                last_successful_communication: chrono::Utc::now().timestamp() as u64,
                bandwidth_estimate: Some(10240 + (i * 1024) + (j * 512)),
                latency_history: vec![50, 45, 55, 40, 50],
            };

            manager.add_peer(peer).unwrap();
        }
    }

    // Starte Topology-Monitoring
    let topology_task = manager.start_topology_monitoring().await.unwrap();

    // Warte kurz, damit Topology-Analyse durchgeführt werden kann
    sleep(Duration::from_millis(200)).await;

    // Überprüfe erweiterte Statistiken
    let stats = manager.get_enhanced_discovery_stats();
    
    println!("Topology-Statistiken: {:?}", stats);

    assert_eq!(stats["total_peers"], 12); // 3 Segmente * 4 Capabilities
    assert_eq!(stats["active_peers"], 12);
    assert_eq!(stats["verified_peers"], 6); // Hälfte verifiziert

    // Überprüfe Network-Segment-Verteilung
    let discovery_sources = stats["discovery_sources"].as_object().unwrap();
    assert_eq!(discovery_sources["Manual"], 12);

    // Cleanup
    topology_task.abort();
}

#[tokio::test]
async fn test_automatic_peer_verification() {
    let config = DiscoveryConfig {
        enable_automatic_peer_addition: true,
        enable_peer_verification: true,
        max_connection_attempts: 2,
        ..DiscoveryConfig::default()
    };

    let manager = DiscoveryManager::new(
        config,
        "verification_test_node".to_string(),
        "verification_test_key".to_string(),
        8895,
    );

    // Füge Peer hinzu
    let peer = PeerInfo {
        node_id: "verification_peer".to_string(),
        public_key: "pub_verification".to_string(),
        address: "127.0.0.1".to_string(),
        port: 8896,
        last_seen: chrono::Utc::now().timestamp() as u64,
        capabilities: vec!["posts".to_string()],
        connection_attempts: 0,
        last_connection_attempt: 0,
        is_verified: false,
        network_segment: None,
        health_score: 0.6,
        response_time_ms: Some(75),
        last_health_check: 0,
        consecutive_failures: 0,
        discovery_source: DiscoverySource::Manual,
        metadata: HashMap::new(),
        is_active: true,
        last_successful_communication: 0,
        bandwidth_estimate: None,
        latency_history: Vec::new(),
    };

    // Füge Peer mit automatischer Verifizierung hinzu
    manager.add_peer_auto_verified(peer).await.unwrap();

    // Warte kurz, damit Verifizierung abgeschlossen werden kann
    sleep(Duration::from_millis(100)).await;

    // Überprüfe, ob Peer verifiziert wurde
    let peers = manager.get_peers().unwrap();
    let verification_peer = peers.iter().find(|p| p.node_id == "verification_peer").unwrap();

    println!("Peer Verifizierungsstatus: {}", verification_peer.is_verified);
    println!("Peer Health-Score: {:.2}", verification_peer.health_score);

    // Der Peer sollte verifiziert sein, da der Health-Score >= 0.5 ist
    assert!(verification_peer.is_verified);
    assert!(verification_peer.is_active);
}

#[tokio::test]
async fn test_discovery_message_protocol() {
    let config = DiscoveryConfig::default();
    let manager = DiscoveryManager::new(
        config,
        "protocol_test_node".to_string(),
        "protocol_test_key".to_string(),
        8897,
    );

    // Teste verschiedene Message-Typen
    let message_types = vec!["announce", "ping", "pong", "heartbeat", "capabilities"];
    
    for msg_type in message_types {
        let message = DiscoveryMessage {
            message_type: msg_type.to_string(),
            node_id: "protocol_test_peer".to_string(),
            public_key: "pub_protocol".to_string(),
            address: "127.0.0.1".to_string(),
            port: 8898,
            timestamp: chrono::Utc::now().timestamp() as u64,
            capabilities: vec!["posts".to_string(), "config".to_string()],
            network_segment: Some("protocol_segment".to_string()),
            version: "1.0".to_string(),
        };

        // Teste Serialisierung/Deserialisierung
        let serialized = serde_json::to_string(&message).unwrap();
        let deserialized: DiscoveryMessage = serde_json::from_str(&serialized).unwrap();

        assert_eq!(deserialized.message_type, msg_type);
        assert_eq!(deserialized.node_id, "protocol_test_peer");
        assert_eq!(deserialized.capabilities.len(), 2);
        assert_eq!(deserialized.network_segment, Some("protocol_segment".to_string()));
        assert_eq!(deserialized.version, "1.0");

        println!("✅ Message-Typ '{}' erfolgreich getestet", msg_type);
    }
}

#[tokio::test]
async fn test_peer_lifecycle_management() {
    let config = DiscoveryConfig {
        peer_timeout: Duration::from_millis(100),
        max_peers: 3,
        ..DiscoveryConfig::default()
    };

    let manager = DiscoveryManager::new(
        config,
        "lifecycle_test_node".to_string(),
        "lifecycle_test_key".to_string(),
        8899,
    );

    // Füge mehrere Peers hinzu
    for i in 0..5 {
        let peer = PeerInfo {
            node_id: format!("lifecycle_peer_{}", i),
            public_key: format!("pub_lifecycle_{}", i),
            address: "127.0.0.1".to_string(),
            port: 9000 + i,
            last_seen: chrono::Utc::now().timestamp() as u64,
            capabilities: vec!["posts".to_string()],
            connection_attempts: 0,
            last_connection_attempt: 0,
            is_verified: false,
            network_segment: None,
            health_score: 0.5,
            response_time_ms: Some(50),
            last_health_check: 0,
            consecutive_failures: 0,
            discovery_source: DiscoverySource::Manual,
            metadata: HashMap::new(),
            is_active: true,
            last_successful_communication: 0,
            bandwidth_estimate: None,
            latency_history: Vec::new(),
        };

        manager.add_peer(peer).unwrap();
    }

    // Überprüfe, dass nur max_peers Peers behalten wurden
    let peers = manager.get_peers().unwrap();
    assert_eq!(peers.len(), 3); // max_peers = 3

    // Mache einen Peer stale
    let mut peers_guard = manager.peers.lock().unwrap();
    if let Some(peer) = peers_guard.get_mut("lifecycle_peer_0") {
        peer.last_seen = chrono::Utc::now().timestamp() as u64 - 1000; // 1 Sekunde in der Vergangenheit
    }
    drop(peers_guard);

    // Führe Cleanup durch
    manager.cleanup_stale_peers().unwrap();

    // Überprüfe, dass stale Peer entfernt wurde
    let peers_after_cleanup = manager.get_peers().unwrap();
    assert!(peers_after_cleanup.len() < 3);
    assert!(!peers_after_cleanup.iter().any(|p| p.node_id == "lifecycle_peer_0"));

    println!("✅ Peer Lifecycle-Management erfolgreich getestet");
    println!("   Peers vor Cleanup: {}", peers.len());
    println!("   Peers nach Cleanup: {}", peers_after_cleanup.len());
}

/// Performance-Test für das Discovery-System
#[tokio::test]
async fn test_discovery_performance() {
    let config = DiscoveryConfig {
        max_peers: 1000,
        peer_timeout: Duration::from_secs(60),
        ..DiscoveryConfig::default()
    };

    let manager = DiscoveryManager::new(
        config,
        "performance_test_node".to_string(),
        "performance_test_key".to_string(),
        8900,
    );

    let start_time = std::time::Instant::now();

    // Füge viele Peers hinzu
    for i in 0..100 {
        let peer = PeerInfo {
            node_id: format!("perf_peer_{}", i),
            public_key: format!("pub_perf_{}", i),
            address: "127.0.0.1".to_string(),
            port: 9000 + i,
            last_seen: chrono::Utc::now().timestamp() as u64,
            capabilities: vec!["posts".to_string(), "config".to_string()],
            connection_attempts: 0,
            last_connection_attempt: 0,
            is_verified: i % 2 == 0,
            network_segment: Some(format!("segment_{}", i % 5)),
            health_score: 0.5 + (i as f64 * 0.005),
            response_time_ms: Some(50 + (i % 20)),
            last_health_check: 0,
            consecutive_failures: 0,
            discovery_source: DiscoverySource::Manual,
            metadata: HashMap::new(),
            is_active: true,
            last_successful_communication: 0,
            bandwidth_estimate: Some(10240 + (i * 100)),
            latency_history: vec![50, 45, 55, 40, 50],
        };

        manager.add_peer(peer).unwrap();
    }

    let add_time = start_time.elapsed();

    // Teste Statistiken-Generierung
    let stats_start = std::time::Instant::now();
    let stats = manager.get_enhanced_discovery_stats();
    let stats_time = stats_start.elapsed();

    // Teste Peer-Filterung
    let filter_start = std::time::Instant::now();
    let verified_peers = manager.get_verified_peers().unwrap();
    let filter_time = filter_start.elapsed();

    println!("🚀 Performance-Test Ergebnisse:");
    println!("   ⏱️  Zeit für 100 Peers hinzufügen: {:?}", add_time);
    println!("   📊 Zeit für Statistiken: {:?}", stats_time);
    println!("   🔍 Zeit für Peer-Filterung: {:?}", filter_time);
    println!("   📈 Gesamt-Peers: {}", stats["total_peers"]);
    println!("   ✅ Verifizierte Peers: {}", verified_peers.len());

    // Performance-Anforderungen
    assert!(add_time < Duration::from_millis(100), "Peer-Hinzufügung zu langsam");
    assert!(stats_time < Duration::from_millis(10), "Statistiken-Generierung zu langsam");
    assert!(filter_time < Duration::from_millis(5), "Peer-Filterung zu langsam");
}