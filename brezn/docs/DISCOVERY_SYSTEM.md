# 🌐 Brezn Discovery-System Dokumentation

## Übersicht

Das Brezn Discovery-System ist ein fortschrittliches Peer-to-Peer-Netzwerk-Entdeckungssystem, das automatische Peer-Entdeckung, Health-Monitoring und Network-Topology-Analyse ermöglicht.

## 🚀 Hauptfunktionen

### 1. Network-Discovery
- **UDP-Multicast-Discovery**: Automatische Peer-Entdeckung über Multicast-Netzwerke
- **Broadcast-Discovery**: Fallback auf Broadcast für lokale Netzwerke
- **QR-Code-Integration**: Manuelle Peer-Hinzufügung über QR-Codes
- **Network-Scanning**: Aktive Suche nach neuen Peers im lokalen Subnetz

### 2. Peer-Management
- **Automatic Peer-Addition**: Automatische Hinzufügung neuer Peers
- **Stale-Peer-Cleanup**: Entfernung inaktiver Peers
- **Peer-Health-Monitoring**: Kontinuierliche Überwachung der Peer-Gesundheit
- **Connection-Retry-Logic**: Intelligente Wiederholungsversuche bei Verbindungsfehlern

### 3. Health-Monitoring
- **Response-Time-Tracking**: Überwachung der Antwortzeiten
- **Health-Score-Berechnung**: Dynamische Bewertung der Peer-Qualität
- **Bandwidth-Estimation**: Schätzung der verfügbaren Bandbreite
- **Latency-History**: Rolling-Window für Latenz-Metriken

### 4. Network-Topology
- **Segment-Analyse**: Gruppierung von Peers nach Network-Segmenten
- **Capability-Mapping**: Übersicht über verfügbare Peer-Funktionen
- **Health-Distribution**: Verteilung der Peer-Gesundheit im Netzwerk
- **Discovery-Source-Tracking**: Nachverfolgung der Peer-Entdeckungsquellen

## 🏗️ Architektur

### Core-Komponenten

```rust
pub struct DiscoveryManager {
    config: DiscoveryConfig,
    peers: Arc<Mutex<HashMap<String, PeerInfo>>>,
    node_id: String,
    public_key: String,
    port: u16,
    multicast_socket: Option<Arc<UdpSocket>>,
    broadcast_socket: Option<Arc<UdpSocket>>,
    peer_callback: Option<Arc<dyn Fn(PeerInfo) + Send + Sync>>,
}
```

### Peer-Informationen

```rust
pub struct PeerInfo {
    pub node_id: String,
    pub public_key: String,
    pub address: String,
    pub port: u16,
    pub last_seen: u64,
    pub capabilities: Vec<String>,
    pub connection_attempts: u32,
    pub last_connection_attempt: u64,
    pub is_verified: bool,
    pub network_segment: Option<String>,
    // Neue erweiterte Felder
    pub health_score: f64,
    pub response_time_ms: Option<u64>,
    pub last_health_check: u64,
    pub consecutive_failures: u32,
    pub discovery_source: DiscoverySource,
    pub metadata: HashMap<String, String>,
    pub is_active: bool,
    pub last_successful_communication: u64,
    pub bandwidth_estimate: Option<u64>,
    pub latency_history: Vec<u64>,
}
```

### Discovery-Quellen

```rust
pub enum DiscoverySource {
    Multicast,           // UDP-Multicast
    Broadcast,           // UDP-Broadcast
    QRCode,             // QR-Code-Scan
    Manual,             // Manuelle Eingabe
    PeerRecommendation, // Peer-Empfehlung
    NetworkScan,        // Aktiver Network-Scan
}
```

## ⚙️ Konfiguration

### DiscoveryConfig

```rust
pub struct DiscoveryConfig {
    // Basis-Konfiguration
    pub broadcast_interval: Duration,
    pub peer_timeout: Duration,
    pub max_peers: usize,
    pub enable_qr: bool,
    pub discovery_port: u16,
    pub broadcast_address: String,
    pub multicast_address: String,
    pub heartbeat_interval: Duration,
    pub connection_retry_limit: u32,
    pub enable_multicast: bool,
    pub enable_broadcast: bool,
    
    // Erweiterte Konfiguration
    pub discovery_timeout: Duration,
    pub peer_health_check_interval: Duration,
    pub max_connection_attempts: u32,
    pub enable_peer_verification: bool,
    pub enable_automatic_peer_addition: bool,
    pub peer_discovery_retry_interval: Duration,
    pub network_segment_filtering: bool,
    pub enable_peer_statistics: bool,
    pub multicast_ttl: u32,
    pub broadcast_retry_count: u32,
}
```

### Standard-Konfiguration

```rust
impl Default for DiscoveryConfig {
    fn default() -> Self {
        Self {
            broadcast_interval: Duration::from_secs(30),
            peer_timeout: Duration::from_secs(300),
            max_peers: 50,
            enable_qr: true,
            discovery_port: 8888,
            broadcast_address: "255.255.255.255:8888".to_string(),
            multicast_address: "224.0.0.1:8888".to_string(),
            heartbeat_interval: Duration::from_secs(60),
            connection_retry_limit: 3,
            enable_multicast: true,
            enable_broadcast: true,
            discovery_timeout: Duration::from_secs(10),
            peer_health_check_interval: Duration::from_secs(120),
            max_connection_attempts: 5,
            enable_peer_verification: true,
            enable_automatic_peer_addition: true,
            peer_discovery_retry_interval: Duration::from_secs(15),
            network_segment_filtering: false,
            enable_peer_statistics: true,
            multicast_ttl: 32,
            broadcast_retry_count: 3,
        }
    }
}
```

## 🔧 Verwendung

### Grundlegende Initialisierung

```rust
use brezn::discovery::{DiscoveryManager, DiscoveryConfig};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Konfiguration erstellen
    let config = DiscoveryConfig::default();
    
    // Discovery-Manager initialisieren
    let mut manager = DiscoveryManager::new(
        config,
        "my_node_id".to_string(),
        "my_public_key".to_string(),
        8888,
    );
    
    // Sockets initialisieren
    manager.init_sockets().await?;
    
    // Discovery starten
    manager.start_discovery().await?;
    
    Ok(())
}
```

### Erweiterte Discovery mit Health-Monitoring

```rust
// Erweiterten Discovery-Loop starten
manager.start_enhanced_discovery_loop().await?;

// Health-Monitoring separat starten
manager.start_health_monitoring().await?;

// Network-Topology-Monitoring starten
manager.start_topology_monitoring().await?;
```

### Peer-Verwaltung

```rust
// Peer hinzufügen
let peer = PeerInfo { /* ... */ };
manager.add_peer(peer)?;

// Peer mit automatischer Verifizierung hinzufügen
manager.add_peer_auto_verified(peer).await?;

// Peer verifizieren
manager.verify_peer_enhanced("peer_id").await?;

// Peers nach Capability filtern
let posts_peers = manager.get_peers_by_capability("posts")?;

// Nur verifizierte Peers abrufen
let verified_peers = manager.get_verified_peers()?;
```

### Statistiken und Monitoring

```rust
// Basis-Statistiken
let stats = manager.get_discovery_stats();

// Erweiterte Statistiken
let enhanced_stats = manager.get_enhanced_discovery_stats();

// QR-Code generieren
let qr_code = manager.generate_qr_code()?;
let qr_svg = manager.generate_qr_code_svg(100)?;
let qr_image = manager.generate_qr_code_image(200)?;
```

## 📊 Health-Score-System

### Health-Score-Berechnung

Der Health-Score wird basierend auf verschiedenen Faktoren berechnet:

- **Response-Time**: Antwortzeit des Peers
- **Consecutive Failures**: Aufeinanderfolgende Fehler
- **Last Successful Communication**: Letzte erfolgreiche Kommunikation
- **Connection Attempts**: Anzahl der Verbindungsversuche

### Health-Score-Kategorien

```rust
let health_range = match peer.health_score {
    s if s >= 0.8 => "excellent",   // Ausgezeichnet
    s if s >= 0.6 => "good",        // Gut
    s if s >= 0.4 => "fair",        // Befriedigend
    s if s >= 0.2 => "poor",        // Schlecht
    _ => "critical",                 // Kritisch
};
```

### Automatische Peer-Deaktivierung

Peers werden automatisch deaktiviert, wenn:
- `consecutive_failures >= 5`
- `health_score < 0.2`
- `response_time > 5000ms`

## 🌐 Network-Topology-Analyse

### Segment-basierte Gruppierung

```rust
// Peers nach Network-Segment filtern
let segment_a_peers: Vec<PeerInfo> = manager.get_peers()?
    .into_iter()
    .filter(|p| p.network_segment.as_ref() == Some(&"segment_a".to_string()))
    .collect();
```

### Capability-Mapping

```rust
// Peers nach Capability gruppieren
let posts_peers = manager.get_peers_by_capability("posts")?;
let config_peers = manager.get_peers_by_capability("config")?;
let p2p_peers = manager.get_peers_by_capability("p2p")?;
```

### Topology-Statistiken

```rust
let topology_stats = manager.get_enhanced_discovery_stats();

// Beispiel-Ausgabe:
{
    "total_peers": 25,
    "active_peers": 23,
    "verified_peers": 18,
    "health_distribution": {
        "excellent": 8,
        "good": 10,
        "fair": 4,
        "poor": 1,
        "critical": 0
    },
    "discovery_sources": {
        "Multicast": 15,
        "QRCode": 5,
        "NetworkScan": 3,
        "Manual": 2
    }
}
```

## 🔍 Discovery-Protokoll

### Message-Typen

1. **announce**: Peer-Existenz bekanntgeben
2. **ping**: Peer-Verfügbarkeit testen
3. **pong**: Antwort auf Ping
4. **heartbeat**: Regelmäßige Status-Updates
5. **capabilities**: Peer-Funktionen mitteilen

### Message-Struktur

```rust
pub struct DiscoveryMessage {
    pub message_type: String,
    pub node_id: String,
    pub public_key: String,
    pub address: String,
    pub port: u16,
    pub timestamp: u64,
    pub capabilities: Vec<String>,
    pub network_segment: Option<String>,
    pub version: String,
}
```

### Discovery-Workflow

1. **Initialisierung**: Sockets erstellen und Multicast-Gruppen beitreten
2. **Broadcast**: Regelmäßige Ankündigung der eigenen Existenz
3. **Listening**: Auf Discovery-Nachrichten von anderen Peers warten
4. **Health-Check**: Kontinuierliche Überwachung der Peer-Gesundheit
5. **Cleanup**: Entfernung inaktiver Peers
6. **Topology-Analyse**: Regelmäßige Analyse der Netzwerk-Struktur

## 🧪 Testing

### Unit-Tests

```bash
# Alle Discovery-Tests ausführen
cargo test discovery

# Spezifische Tests
cargo test test_peer_health_scoring
cargo test test_network_topology_analysis
cargo test test_enhanced_discovery_stats
```

### Integration-Tests

```bash
# Integration-Tests ausführen
cargo test --test discovery_integration_tests

# Performance-Tests
cargo test test_discovery_performance
```

### Test-Konfiguration

```rust
let test_config = DiscoveryConfig {
    broadcast_interval: Duration::from_millis(100),
    peer_timeout: Duration::from_secs(1),
    max_peers: 10,
    discovery_port: 8889, // Anderer Port für Tests
    // ... weitere Test-spezifische Konfiguration
};
```

## 🚀 Performance-Optimierungen

### Asynchrone Verarbeitung

- Alle Network-Operationen sind asynchron
- Health-Checks laufen in separaten Tasks
- Topology-Analyse läuft im Hintergrund

### Memory-Management

- Rolling-Window für Latency-History (max. 10 Werte)
- Automatische Peer-Limits
- Effiziente HashMap-basierte Peer-Speicherung

### Network-Optimierungen

- Multicast TTL konfigurierbar
- Broadcast-Retry-Logic
- Timeout-basierte Connection-Handling

## 🔒 Sicherheit

### Peer-Verifizierung

- Public-Key-basierte Authentifizierung
- Checksum-Validierung für QR-Codes
- Timestamp-Validierung (max. 1 Stunde alt)

### Network-Segmentierung

- Optionale Network-Segment-Filterung
- Isolierte Peer-Gruppen
- Segment-spezifische Capabilities

### Rate-Limiting

- Connection-Retry-Limits
- Health-Check-Intervalle
- Broadcast-Frequenz-Limits

## 📈 Monitoring und Debugging

### Logging

```rust
println!("🔍 Neuer Peer entdeckt: {} von {}", node_id, src_addr);
println!("✅ Peer {} verifiziert (Health: {:.2})", node_id, health_score);
println!("🌐 Network-Topology-Analyse: {} aktive Peers", total_peers);
```

### Metriken

- Peer-Anzahl und -Status
- Health-Score-Verteilung
- Response-Time-Statistiken
- Discovery-Source-Verteilung
- Network-Segment-Übersicht

### Debug-Modi

```rust
// Erweiterte Debug-Informationen aktivieren
let debug_config = DiscoveryConfig {
    enable_peer_statistics: true,
    network_segment_filtering: true,
    // ... weitere Debug-Optionen
};
```

## 🔮 Zukünftige Erweiterungen

### Geplante Features

1. **Distributed Hash Table (DHT)**: Skalierbare Peer-Lookup
2. **Peer-Reputation-System**: Bewertung der Peer-Zuverlässigkeit
3. **Automatic Network-Segmentation**: Intelligente Netzwerk-Aufteilung
4. **Cross-Network Discovery**: Peer-Entdeckung über verschiedene Netzwerke
5. **Machine Learning Integration**: Vorhersage von Peer-Performance

### API-Erweiterungen

- REST-API für Discovery-Management
- WebSocket-Integration für Echtzeit-Updates
- GraphQL-Support für komplexe Abfragen
- Plugin-System für benutzerdefinierte Discovery-Strategien

## 📚 Weitere Ressourcen

- [Brezn Hauptdokumentation](../README.md)
- [API-Referenz](../docs/API.md)
- [Beispiele](../examples/)
- [Contributing Guidelines](../CONTRIBUTING.md)

---

**Entwickelt von Agent 3 (Discovery-System-Entwickler) für das Brezn-Projekt**