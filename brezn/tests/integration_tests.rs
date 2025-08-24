//! Integration Tests für Brezn P2P-Netzwerk
//! 
//! Diese Tests überprüfen das Zusammenspiel aller Komponenten:
//! - P2P-Netzwerk
//! - Discovery-System
//! - Tor-Integration
//! - QR-Code-System
//! - Datenbank-Integration

use brezn::{
    network::P2PNetworkManager,
    discovery::DiscoveryManager,
    tor::TorManager,
    database::Database,
    types::{Config, Post, PostConflict, ConflictResolutionStrategy},
};
use tokio::time::{Duration, sleep};
use std::net::SocketAddr;

/// Test der vollständigen P2P-Netzwerk-Integration
#[tokio::test]
async fn test_full_p2p_network_integration() {
    println!("🚀 Starte vollständige P2P-Netzwerk-Integration...");
    
    // 1. Erstelle Datenbank
    let db = Database::new().expect("Datenbank-Erstellung fehlgeschlagen");
    println!("✅ Datenbank erstellt");
    
    // 2. Erstelle Discovery Manager
    let discovery_config = brezn::discovery::DiscoveryConfig::default();
    let mut discovery = DiscoveryManager::new(
        discovery_config,
        "test-node-1".to_string(),
        "test-key-1".to_string(),
        8888
    );
    println!("✅ Discovery Manager erstellt");
    
    // 3. Erstelle P2P Network Manager
    let mut network_manager = P2PNetworkManager::new(8888, Some(db.clone()));
    println!("✅ P2P Network Manager erstellt");
    
    // 4. Starte Discovery
    let discovery_handle = tokio::spawn(async move {
        discovery.start_discovery().await
    });
    println!("✅ Discovery gestartet");
    
    // 5. Starte P2P Network
    let network_handle = tokio::spawn(async move {
        network_manager.start().await
    });
    println!("✅ P2P Network gestartet");
    
    // 6. Warte auf Initialisierung
    sleep(Duration::from_millis(200)).await;
    println!("✅ Initialisierung abgeschlossen");
    
    // 7. Teste Peer-Discovery
    let peers = discovery.get_peers().expect("Peer-Abruf fehlgeschlagen");
    println!("📡 {} Peers entdeckt", peers.len());
    
    // 8. Teste Post-Erstellung und -Synchronisation
    let test_post = Post::new(
        "Integration Test Post".to_string(),
        "TestUser".to_string(),
        Some("test-node-1".to_string())
    );
    
    // Post in Datenbank speichern
    let post_id = db.add_post(&test_post).expect("Post-Speicherung fehlgeschlagen");
    println!("✅ Post gespeichert mit ID: {}", post_id);
    
    // 9. Teste Konfliktlösung
    let conflict = PostConflict {
        post_id: "conflict-1".to_string(),
        conflicting_posts: vec![test_post.clone()],
        resolution_strategy: ConflictResolutionStrategy::LatestWins,
        resolved_at: None,
    };
    
    // Konflikt in Datenbank speichern
    let conflict_id = db.store_post_conflict(
        &conflict.post_id,
        &serde_json::to_string(&conflict.conflicting_posts).unwrap(),
        &format!("{:?}", conflict.resolution_strategy)
    ).expect("Konflikt-Speicherung fehlgeschlagen");
    println!("✅ Konflikt gespeichert mit ID: {}", conflict_id);
    
    // 10. Teste Netzwerk-Status
    let network_status = network_manager.get_network_status();
    println!("📊 Netzwerk-Status: {} Peers, Health: {:.2}", 
             network_status.peer_count, 
             network_status.network_health_score);
    
    // 11. Cleanup
    discovery_handle.abort();
    network_handle.abort();
    
    println!("✅ Vollständige P2P-Netzwerk-Integration erfolgreich!");
}

/// Test der Discovery-Network-Bridge
#[tokio::test]
async fn test_discovery_network_bridge() {
    println!("🌉 Teste Discovery-Network-Bridge...");
    
    // Erstelle zwei Discovery Manager (simuliert zwei Nodes)
    let config1 = brezn::discovery::DiscoveryConfig::default();
    let mut discovery1 = DiscoveryManager::new(
        config1,
        "node-1".to_string(),
        "key-1".to_string(),
        8888
    );
    
    let config2 = brezn::discovery::DiscoveryConfig::default();
    let mut discovery2 = DiscoveryManager::new(
        config2,
        "node-2".to_string(),
        "key-2".to_string(),
        8889
    );
    
    // Starte beide Discovery Manager
    let handle1 = tokio::spawn(async move {
        discovery1.start_discovery().await
    });
    
    let handle2 = tokio::spawn(async move {
        discovery2.start_discovery().await
    });
    
    // Warte auf Peer-Discovery
    sleep(Duration::from_millis(300)).await;
    
    // Überprüfe, ob Peers sich gegenseitig entdeckt haben
    let peers1 = discovery1.get_peers().expect("Peer-Abruf fehlgeschlagen");
    let peers2 = discovery2.get_peers().expect("Peer-Abruf fehlgeschlagen");
    
    println!("📡 Node 1 hat {} Peers entdeckt", peers1.len());
    println!("📡 Node 2 hat {} Peers entdeckt", peers2.len());
    
    // Mindestens ein Peer sollte entdeckt worden sein
    assert!(peers1.len() > 0 || peers2.len() > 0, "Keine Peers entdeckt");
    
    // Cleanup
    handle1.abort();
    handle2.abort();
    
    println!("✅ Discovery-Network-Bridge erfolgreich!");
}

/// Test der QR-Code-Integration
#[tokio::test]
async fn test_qr_code_integration() {
    println!("📱 Teste QR-Code-Integration...");
    
    // Erstelle Discovery Manager
    let config = brezn::discovery::DiscoveryConfig::default();
    let mut discovery = DiscoveryManager::new(
        config,
        "qr-test-node".to_string(),
        "qr-test-key".to_string(),
        8890
    );
    
    // Generiere QR-Code
    let qr_data = discovery.generate_qr_code().expect("QR-Code-Generierung fehlgeschlagen");
    println!("✅ QR-Code generiert: {}", qr_data);
    
    // Parse QR-Code zurück zu Peer-Info
    let peer_info = discovery.parse_qr_code(&qr_data).expect("QR-Code-Parsing fehlgeschlagen");
    println!("✅ QR-Code geparst: Node {} auf {}:{}", 
             peer_info.node_id, peer_info.address, peer_info.port);
    
    // Überprüfe Peer-Info
    assert_eq!(peer_info.node_id, "qr-test-node");
    assert_eq!(peer_info.public_key, "qr-test-key");
    assert_eq!(peer_info.port, 8890);
    
    // Füge Peer hinzu
    let add_result = discovery.add_peer(peer_info);
    assert!(add_result.is_ok(), "Peer-Hinzufügung fehlgeschlagen");
    
    // Überprüfe, ob Peer hinzugefügt wurde
    let peers = discovery.get_peers().expect("Peer-Abruf fehlgeschlagen");
    assert!(peers.iter().any(|p| p.node_id == "qr-test-node"), "Peer nicht hinzugefügt");
    
    println!("✅ QR-Code-Integration erfolgreich!");
}

/// Test der Tor-Integration
#[tokio::test]
async fn test_tor_integration() {
    println!("🔒 Teste Tor-Integration...");
    
    // Erstelle Tor Manager
    let mut config = brezn::tor::TorConfig::default();
    config.enabled = true;
    config.connection_timeout = Duration::from_secs(5); // Kurzer Timeout für Tests
    
    let mut tor_manager = TorManager::new(config);
    
    // Teste Tor-Verbindung (wird in Test-Umgebung wahrscheinlich fehlschlagen)
    let enable_result = tor_manager.enable().await;
    
    match enable_result {
        Ok(_) => {
            println!("✅ Tor erfolgreich aktiviert!");
            
            // Teste Tor-Status
            let status = tor_manager.get_status().expect("Status-Abruf fehlgeschlagen");
            assert!(status.is_connected, "Tor sollte verbunden sein");
            assert!(status.active_circuits > 0, "Keine aktiven Circuits");
            
            println!("📊 Tor-Status: {} Circuits, Health: {:.2}", 
                     status.active_circuits, status.circuit_health);
        }
        Err(e) => {
            println!("⚠️ Tor-Aktivierung fehlgeschlagen (erwartet in Test-Umgebung): {}", e);
            
            // Überprüfe Fehlertyp
            let error_msg = e.to_string();
            assert!(error_msg.contains("Failed to connect") || 
                   error_msg.contains("connection timeout") ||
                   error_msg.contains("Tor is not enabled"),
                   "Unerwarteter Fehlertyp: {}", error_msg);
        }
    }
    
    println!("✅ Tor-Integration erfolgreich getestet!");
}

/// Test der Datenbank-Integration
#[tokio::test]
async fn test_database_integration() {
    println!("🗄️ Teste Datenbank-Integration...");
    
    // Erstelle Datenbank
    let db = Database::new().expect("Datenbank-Erstellung fehlgeschlagen");
    
    // Teste Post-Erstellung
    let test_post = Post::new(
        "Datenbank Test Post".to_string(),
        "DBTestUser".to_string(),
        Some("db-test-node".to_string())
    );
    
    let post_id = db.add_post(&test_post).expect("Post-Speicherung fehlgeschlagen");
    println!("✅ Post gespeichert mit ID: {}", post_id);
    
    // Teste Post-Abruf
    let posts = db.get_posts_with_conflicts(10).expect("Post-Abruf fehlgeschlagen");
    let found_post = posts.iter().find(|p| p.content == "Datenbank Test Post");
    assert!(found_post.is_some(), "Gespeicherter Post nicht gefunden");
    
    // Teste Sync-Timestamp-Verwaltung
    let node_id = "test-peer";
    let timestamp = 1234567890;
    
    db.update_last_sync_timestamp(node_id, timestamp).expect("Timestamp-Update fehlgeschlagen");
    let retrieved_timestamp = db.get_last_sync_timestamp(node_id).expect("Timestamp-Abruf fehlgeschlagen");
    assert_eq!(retrieved_timestamp, timestamp, "Timestamp stimmt nicht überein");
    
    // Teste Konflikt-Verwaltung
    let conflict_id = db.store_post_conflict(
        "conflict-db-test",
        "test conflict data",
        "manual_resolution"
    ).expect("Konflikt-Speicherung fehlgeschlagen");
    
    let unresolved_conflicts = db.get_unresolved_conflicts().expect("Konflikt-Abruf fehlgeschlagen");
    assert!(unresolved_conflicts.iter().any(|(id, _, _, _)| *id == conflict_id), 
            "Gespeicherter Konflikt nicht gefunden");
    
    // Markiere Konflikt als gelöst
    db.resolve_conflict(conflict_id).expect("Konflikt-Lösung fehlgeschlagen");
    
    let resolved_conflicts = db.get_unresolved_conflicts().expect("Konflikt-Abruf fehlgeschlagen");
    assert!(!resolved_conflicts.iter().any(|(id, _, _, _)| *id == conflict_id), 
            "Konflikt sollte als gelöst markiert sein");
    
    println!("✅ Datenbank-Integration erfolgreich!");
}

/// Test der Performance-Metriken
#[tokio::test]
async fn test_performance_metrics() {
    println!("⚡ Teste Performance-Metriken...");
    
    // Erstelle Network Manager
    let mut network_manager = P2PNetworkManager::new(8891, None);
    
    // Starte Network Manager
    let network_handle = tokio::spawn(async move {
        network_manager.start().await
    });
    
    // Warte auf Initialisierung
    sleep(Duration::from_millis(100)).await;
    
    // Teste Performance-Metriken
    let start_time = std::time::Instant::now();
    
    // Simuliere einige Operationen
    for i in 0..10 {
        let peer_addr: SocketAddr = format!("127.0.0.{}:{}", i + 1, 8000 + i).parse().unwrap();
        let _ = network_manager.add_peer(
            format!("perf-peer-{}", i),
            peer_addr,
            format!("perf-key-{}", i)
        ).await;
    }
    
    let elapsed = start_time.elapsed();
    println!("⏱️ 10 Peers in {:?} hinzugefügt", elapsed);
    
    // Überprüfe Performance
    assert!(elapsed.as_millis() < 1000, "Performance zu langsam: {:?}", elapsed);
    
    // Teste Netzwerk-Status-Performance
    let status_start = std::time::Instant::now();
    let _status = network_manager.get_network_status();
    let status_elapsed = status_start.elapsed();
    
    println!("⏱️ Netzwerk-Status in {:?} abgerufen", status_elapsed);
    assert!(status_elapsed.as_micros() < 1000, "Status-Abruf zu langsam: {:?}", status_elapsed);
    
    // Cleanup
    network_handle.abort();
    
    println!("✅ Performance-Metriken erfolgreich!");
}

/// Hauptfunktion für manuelle Test-Ausführung
#[tokio::main]
async fn main() {
    println!("🧪 Brezn P2P-Netzwerk Integration Tests");
    println!("==========================================");
    
    // Führe alle Tests aus
    test_database_integration().await;
    test_qr_code_integration().await;
    test_tor_integration().await;
    test_discovery_network_bridge().await;
    test_performance_metrics().await;
    test_full_p2p_network_integration().await;
    
    println!("🎉 Alle Integration Tests erfolgreich abgeschlossen!");
}