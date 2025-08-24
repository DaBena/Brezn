# P2P-Netzwerk Testing Guide für Brezn

## 🧪 Übersicht

Dieser Guide beschreibt alle verfügbaren Tests für das neue P2P-Netzwerk-System und wie sie ausgeführt werden können.

## 🚀 Schnellstart

### Alle Tests ausführen
```bash
# Im brezn/ Verzeichnis
cargo test

# Mit detaillierter Ausgabe
cargo test -- --nocapture

# Mit Zeitmessung
cargo test -- --nocapture --test-threads=1
```

### Spezifische Test-Kategorien
```bash
# Nur Netzwerk-Tests
cargo test network

# Nur Unit-Tests
cargo test --lib

# Nur Integration-Tests
cargo test --test '*'

# Spezifische Tests
cargo test test_peer_creation
cargo test test_connection_quality
```

## 📋 Unit Tests

### Netzwerk-Modul Tests

#### Peer-Management Tests
```bash
# Peer-Erstellung testen
cargo test test_peer_creation

# Verbindungsqualität testen
cargo test test_connection_quality

# Peer-Aktivität testen
cargo test test_peer_activity

# Netzwerk-Manager-Erstellung testen
cargo test test_network_manager_creation
```

#### Verbindungsqualität Tests
```rust
#[tokio::test]
async fn test_connection_quality() {
    let quality = ConnectionQuality::from_latency(25);
    assert_eq!(quality, ConnectionQuality::Excellent);
    
    let quality = ConnectionQuality::from_latency(75);
    assert_eq!(quality, ConnectionQuality::Good);
    
    let quality = ConnectionQuality::from_latency(150);
    assert_eq!(quality, ConnectionQuality::Fair);
    
    let quality = ConnectionQuality::from_latency(250);
    assert_eq!(quality, ConnectionQuality::Poor);
}
```

#### Netzwerk-Manager Tests
```rust
#[tokio::test]
async fn test_network_manager_creation() {
    let manager = P2PNetworkManager::new(8888, None);
    
    assert_eq!(manager.port, 8888);
    assert_eq!(manager.max_peers, 50);
    assert_eq!(manager.heartbeat_interval, Duration::from_secs(60));
    assert_eq!(manager.peer_timeout, Duration::from_secs(300));
}
```

### Verfügbare Test-Funktionen

#### 1. Peer-Tests
- `test_peer_creation`: Testet Peer-Erstellung
- `test_peer_activity`: Testet Peer-Aktivitätsstatus
- `test_peer_latency_update`: Testet Latenz-Updates
- `test_peer_capabilities`: Testet Peer-Fähigkeiten

#### 2. Verbindungsqualität-Tests
- `test_connection_quality_from_latency`: Testet Latenz-basierte Qualitätsbestimmung
- `test_connection_quality_scoring`: Testet Qualitäts-Scoring
- `test_connection_quality_thresholds`: Testet Qualitäts-Schwellenwerte

#### 3. Netzwerk-Manager-Tests
- `test_network_manager_creation`: Testet Manager-Erstellung
- `test_network_manager_configuration`: Testet Konfiguration
- `test_network_manager_lifecycle`: Testet Start/Stop-Zyklus

## 🔄 Integration Tests

### Test-Setup
```bash
# Integration Tests ausführen
cargo test --test integration_tests

# Spezifische Integration Tests
cargo test --test integration_tests test_p2p_network_communication
```

### Verfügbare Integration Tests

#### 1. Netzwerk-Kommunikation
```rust
#[tokio::test]
async fn test_p2p_network_communication() {
    // Test-Setup
    let mut manager1 = P2PNetworkManager::new(8888, None);
    let mut manager2 = P2PNetworkManager::new(8889, None);
    
    // Netzwerke starten
    manager1.start().await.unwrap();
    manager2.start().await.unwrap();
    
    // Verbindung testen
    manager1.connect_to_peer("127.0.0.1", 8889).await.unwrap();
    
    // Kommunikation testen
    // ...
}
```

#### 2. Post-Synchronisation
```rust
#[tokio::test]
async fn test_post_synchronization() {
    // Test-Setup
    let mut manager1 = P2PNetworkManager::new(8888, Some(database1));
    let mut manager2 = P2PNetworkManager::new(8889, Some(database2));
    
    // Netzwerke starten und verbinden
    // ...
    
    // Post erstellen und broadcasten
    let post = Post::new("Test Post".to_string(), "TestUser".to_string(), None);
    
    // Synchronisation testen
    // ...
}
```

#### 3. Konfliktlösung
```rust
#[tokio::test]
async fn test_conflict_resolution() {
    // Test-Setup
    let mut manager = P2PNetworkManager::new(8888, Some(database));
    
    // Konflikt erstellen
    let conflict = PostConflict {
        post_id: PostId::new(&post),
        conflicting_posts: vec![post1, post2],
        resolution_strategy: ConflictResolutionStrategy::LatestWins,
        resolved_at: None,
    };
    
    // Konfliktlösung testen
    manager.resolve_post_conflict(conflict).await.unwrap();
    
    // Ergebnis validieren
    // ...
}
```

## 🧪 Manuelle Tests

### Lokaler Test mit mehreren Instanzen

#### 1. Test-Umgebung vorbereiten
```bash
# Ports prüfen
netstat -tulpn | grep 8888
netstat -tulpn | grep 8889

# Falls Ports belegt sind, Prozesse beenden
kill -9 <PID>
```

#### 2. Erste Instanz starten
```bash
# Terminal 1
cd brezn
cargo run --bin brezn-server -- --port 8080 --network-port 8888
```

#### 3. Zweite Instanz starten
```bash
# Terminal 2
cd brezn
cargo run --bin brezn-server -- --port 8081 --network-port 8889
```

#### 4. Verbindung testen
```bash
# In Terminal 2
curl -X POST http://localhost:8081/api/network/connect \
  -H "Content-Type: application/json" \
  -d '{"address": "127.0.0.1", "port": 8888}'
```

#### 5. Status prüfen
```bash
# Status beider Instanzen abfragen
curl http://localhost:8080/api/network/status
curl http://localhost:8081/api/network/status

# Peer-Listen abfragen
curl http://localhost:8080/api/network/peers
curl http://localhost:8081/api/network/peers
```

### Post-Broadcasting testen

#### 1. Post erstellen
```bash
# Post über erste Instanz erstellen
curl -X POST http://localhost:8080/api/posts \
  -H "Content-Type: application/json" \
  -d '{"content": "Test Post über P2P", "pseudonym": "TestUser"}'
```

#### 2. Synchronisation prüfen
```bash
# Warten (Synchronisation läuft alle 30 Sekunden)
sleep 35

# Posts in zweiter Instanz prüfen
curl http://localhost:8081/api/posts
```

#### 3. Netzwerk-Status prüfen
```bash
# Synchronisations-Status prüfen
curl http://localhost:8080/api/network/status | jq '.total_posts_synced'
curl http://localhost:8081/api/network/status | jq '.total_posts_synced'
```

## 🔍 Debug-Tests

### Logging aktivieren
```bash
# Debug-Logs aktivieren
RUST_LOG=debug cargo test

# Spezifische Module
RUST_LOG=network=debug cargo test

# Mit Datei-Output
RUST_LOG=debug cargo test 2>&1 | tee test_output.log
```

### Performance-Tests
```bash
# Benchmarks ausführen
cargo bench

# Spezifische Benchmarks
cargo bench network_throughput
cargo bench peer_connection
```

### Memory-Tests
```bash
# Memory-Leak-Tests
cargo test --features memory_tests

# Valgrind (falls verfügbar)
valgrind --leak-check=full cargo test
```

## 🚨 Fehlerbehebung

### Häufige Test-Probleme

#### 1. Port-Konflikte
```bash
# Problem: Port bereits in Verwendung
error: failed to bind TCP listener: Address already in use

# Lösung: Port prüfen und freigeben
netstat -tulpn | grep 8888
kill -9 <PID>
```

#### 2. Timeout-Fehler
```bash
# Problem: Tests laufen zu lange
error: test timed out

# Lösung: Timeout erhöhen
RUST_TEST_THREADS=1 cargo test -- --timeout 300
```

#### 3. Async-Test-Fehler
```bash
# Problem: Async-Tests schlagen fehl
error: async fn is not allowed in tests

# Lösung: tokio::test verwenden
#[tokio::test]
async fn test_function() {
    // Test-Code
}
```

### Test-Debugging

#### 1. Einzelne Tests debuggen
```bash
# Spezifischen Test mit Debug-Output
RUST_LOG=debug cargo test test_peer_creation -- --nocapture

# Test mit GDB
gdb --args target/debug/deps/brezn-<hash> test_peer_creation
```

#### 2. Test-Logs analysieren
```bash
# Alle Test-Logs sammeln
cargo test 2>&1 | tee test_logs.txt

# Fehler in Logs suchen
grep -i "error\|fail\|panic" test_logs.txt
```

#### 3. Netzwerk-Verbindungen prüfen
```bash
# Aktive Verbindungen prüfen
netstat -tulpn | grep 888

# Firewall-Status prüfen
sudo ufw status
```

## 📊 Test-Coverage

### Coverage-Report generieren
```bash
# Tarpaulin installieren
cargo install tarpaulin

# Coverage-Report generieren
cargo tarpaulin --out Html

# Coverage-Report öffnen
open tarpaulin-report.html
```

### Coverage-Ziele
- **Netzwerk-Modul**: >90%
- **Peer-Management**: >95%
- **Message-Handling**: >90%
- **Konfliktlösung**: >85%

## 🔄 Continuous Integration

### GitHub Actions
```yaml
# .github/workflows/test.yml
name: P2P Network Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Install Rust
      uses: actions-rs/toolchain@v1
      with:
        toolchain: stable
    
    - name: Run tests
      run: |
        cd brezn
        cargo test --verbose
    
    - name: Run integration tests
      run: |
        cd brezn
        cargo test --test '*'
    
    - name: Generate coverage
      run: |
        cd brezn
        cargo tarpaulin --out Xml
```

### Lokale CI-Simulation
```bash
# Alle Tests in CI-Umgebung simulieren
cargo clean
cargo test --verbose
cargo test --test '*'
cargo check --all-targets
cargo clippy
cargo fmt -- --check
```

## 📝 Test-Dokumentation

### Test-Cases dokumentieren
```rust
/// Testet die Peer-Erstellung mit verschiedenen Parametern
/// 
/// # Test-Szenarien
/// 1. Peer mit gültiger Adresse
/// 2. Peer mit ungültiger Adresse
/// 3. Peer mit leerem Node-ID
/// 
/// # Erwartete Ergebnisse
/// - Gültige Peers werden erfolgreich erstellt
/// - Ungültige Parameter führen zu Fehlern
/// - Alle Peer-Felder werden korrekt gesetzt
#[tokio::test]
async fn test_peer_creation_comprehensive() {
    // Test-Implementierung
}
```

### Test-Plan erstellen
```markdown
# Test-Plan: P2P-Netzwerk

## Phase 1: Unit Tests
- [ ] Peer-Management Tests
- [ ] Verbindungsqualität Tests
- [ ] Netzwerk-Manager Tests

## Phase 2: Integration Tests
- [ ] Netzwerk-Kommunikation
- [ ] Post-Synchronisation
- [ ] Konfliktlösung

## Phase 3: Manuelle Tests
- [ ] Lokale Multi-Instanz-Tests
- [ ] Post-Broadcasting
- [ ] Netzwerk-Status

## Phase 4: Performance Tests
- [ ] Durchsatz-Tests
- [ ] Latenz-Tests
- [ ] Skalierbarkeits-Tests
```

## 🎯 Test-Erfolgsmetriken

### Qualitätsmetriken
- **Test-Coverage**: >90%
- **Test-Durchlaufzeit**: <5 Minuten
- **Fehlerrate**: <1%
- **Performance-Regression**: <5%

### Funktionsmetriken
- **Peer-Verbindungen**: 100% erfolgreich
- **Post-Synchronisation**: 100% erfolgreich
- **Konfliktlösung**: 100% erfolgreich
- **Heartbeat-System**: 100% funktional

## 📚 Weitere Ressourcen

### Dokumentation
- **API-Docs**: `cargo doc --open`
- **Test-Docs**: `cargo test --doc`
- **Benchmark-Docs**: `cargo bench --help`

### Tools
- **Tarpaulin**: Coverage-Tool
- **Criterion**: Benchmark-Tool
- **Mockall**: Mocking-Framework

### Community
- **GitHub Issues**: Bug-Reports
- **Discussions**: Fragen und Antworten
- **Wiki**: Erweiterte Dokumentation