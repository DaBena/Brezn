# 🔍 Brezn Discovery-System

## Übersicht

Das Brezn Discovery-System ist ein fortschrittliches Peer-to-Peer-Netzwerk-Entdeckungssystem, das automatische Peer-Findung, Netzwerk-Topologie-Management und QR-Code-basierte Peer-Beiträge ermöglicht.

## 🚀 Features

### 1. Automatische Peer-Entdeckung
- **Multicast-Broadcasting** auf Port 8888
- **UDP-Broadcast** für lokale Netzwerke
- **Heartbeat-System** für Peer-Gesundheitsüberwachung
- **Automatische Peer-Timeout-Behandlung**

### 2. Netzwerk-Topologie-Management
- **Segment-basierte Netzwerkstruktur** (Core, Edge, Bridge, Isolated)
- **Routing-Tabellen** für optimale Peer-Kommunikation
- **Connectivity-Scoring** für Verbindungsqualität
- **Topologie-Versionierung** für inkrementelle Updates

### 3. QR-Code-Integration
- **Standardisierte QR-Code-Daten** mit Checksum-Validierung
- **Automatische Peer-Beiträge** über QR-Code-Scanning
- **Verifizierung** von Peer-Identitäten
- **Expiring QR-Codes** für Sicherheit

### 4. Peer-Management
- **Capability-basierte Peer-Filterung**
- **Connection-Quality-Monitoring**
- **Automatische Retry-Logik**
- **Peer-Verifizierung** und Blacklisting

## 📁 Architektur

### DiscoveryManager
```rust
pub struct DiscoveryManager {
    config: DiscoveryConfig,
    peers: Arc<Mutex<HashMap<String, PeerInfo>>>,
    topology: Arc<Mutex<NetworkTopology>>,
    discovery_socket: Option<UdpSocket>,
    broadcast_socket: Option<UdpSocket>,
    multicast_socket: Option<UdpSocket>,
    running: Arc<AtomicBool>,
}
```

### PeerInfo
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
}
```

### NetworkTopology
```rust
pub struct NetworkTopology {
    pub node_id: String,
    pub connections: HashSet<String>,
    pub routing_table: HashMap<String, String>,
    pub network_segments: Vec<NetworkSegment>,
    pub topology_version: u64,
}
```

## ⚙️ Konfiguration

### DiscoveryConfig
```rust
pub struct DiscoveryConfig {
    pub broadcast_interval: Duration,        // Standard: 30s
    pub peer_timeout: Duration,              // Standard: 300s
    pub max_peers: usize,                    // Standard: 50
    pub enable_qr: bool,                     // Standard: true
    pub discovery_port: u16,                 // Standard: 8888
    pub broadcast_address: String,           // Standard: "255.255.255.255:8888"
    pub multicast_address: String,           // Standard: "224.0.0.1:8888"
    pub heartbeat_interval: Duration,        // Standard: 60s
    pub connection_retry_limit: u32,         // Standard: 3
    pub enable_multicast: bool,              // Standard: true
    pub enable_broadcast: bool,              // Standard: true
}
```

### Beispiel-Konfiguration
```rust
let config = DiscoveryConfig {
    broadcast_interval: Duration::from_secs(15),
    peer_timeout: Duration::from_secs(180),
    max_peers: 100,
    enable_qr: true,
    discovery_port: 8888,
    broadcast_address: "255.255.255.255:8888".to_string(),
    multicast_address: "224.0.0.1:8888".to_string(),
    heartbeat_interval: Duration::from_secs(30),
    connection_retry_limit: 5,
    enable_multicast: true,
    enable_broadcast: true,
};
```

## 🔧 Verwendung

### Discovery-Manager initialisieren
```rust
use brezn::discovery::{DiscoveryManager, DiscoveryConfig};

// Konfiguration erstellen
let config = DiscoveryConfig::default();

// Discovery-Manager erstellen
let mut discovery_manager = DiscoveryManager::new(config);

// Discovery starten
discovery_manager.start().await?;
```

### Peer-Entdeckung
```rust
// Alle bekannten Peers abrufen
let peers = discovery_manager.get_all_peers().await?;

// Peer nach ID suchen
let peer = discovery_manager.get_peer("peer123").await?;

// Peers nach Capabilities filtern
let tor_peers = discovery_manager.get_peers_with_capability("tor").await?;
```

### Netzwerk-Topologie
```rust
// Aktuelle Topologie abrufen
let topology = discovery_manager.get_network_topology().await?;

// Netzwerk-Segmente analysieren
let segments = discovery_manager.get_network_segments().await?;

// Routing-Tabelle abrufen
let routing = discovery_manager.get_routing_table().await?;
```

### QR-Code-Management
```rust
// QR-Code für Peer-Beitritt generieren
let qr_data = discovery_manager.generate_qr_code().await?;

// QR-Code-Daten parsen und Peer hinzufügen
let peer_added = discovery_manager.parse_qr_code("qr_data_here").await?;

// QR-Code-Validierung
let is_valid = discovery_manager.validate_qr_code(&qr_data).await?;
```

## 🧪 Testing

### Discovery-Tests ausführen
```bash
# Alle Discovery-Tests
cargo test discovery

# Spezifische Test-Gruppen
cargo test discovery::peer_management
cargo test discovery::topology
cargo test discovery::qr_codes
```

### Integration-Tests
```bash
# Discovery mit Netzwerk-Integration
cargo test discovery_integration

# End-to-End Discovery-Tests
cargo test discovery_e2e
```

## 📊 Monitoring und Debugging

### Peer-Status überwachen
```rust
// Peer-Statistiken abrufen
let stats = discovery_manager.get_peer_statistics().await?;
println!("Total peers: {}", stats.total_peers);
println!("Active peers: {}", stats.active_peers);
println!("Verified peers: {}", stats.verified_peers);
```

### Topologie-Monitoring
```rust
// Topologie-Änderungen überwachen
let topology = discovery_manager.get_network_topology().await?;
println!("Topology version: {}", topology.topology_version);
println!("Network segments: {}", topology.network_segments.len());
println!("Total connections: {}", topology.connections.len());
```

### Discovery-Logs
```rust
// Discovery-Events loggen
discovery_manager.set_log_level(LogLevel::Debug);

// Peer-Events abonnieren
let mut events = discovery_manager.subscribe_to_events().await?;
while let Some(event) = events.recv().await {
    match event {
        DiscoveryEvent::PeerDiscovered(peer) => println!("Neuer Peer: {}", peer.node_id),
        DiscoveryEvent::PeerLost(peer_id) => println!("Peer verloren: {}", peer_id),
        DiscoveryEvent::TopologyChanged => println!("Topologie geändert"),
    }
}
```

## 🔒 Sicherheitsaspekte

### Peer-Verifizierung
- **Public-Key-basierte Authentifizierung**
- **Checksum-Validierung** für QR-Code-Daten
- **Automatische Blacklisting** verdächtiger Peers
- **Rate-Limiting** für Discovery-Requests

### Netzwerk-Sicherheit
- **Capability-basierte Zugriffskontrolle**
- **Segment-Isolation** für sensible Netzwerkbereiche
- **Verschlüsselte Discovery-Nachrichten**
- **Anti-Spam-Mechanismen**

## 📈 Performance-Optimierung

### Discovery-Optimierungen
- **Intelligente Broadcast-Intervalle** basierend auf Netzwerkgröße
- **Connection-Pooling** für Peer-Verbindungen
- **Lazy Loading** von Peer-Informationen
- **Background-Processing** für Topologie-Updates

### Skalierbarkeit
- **Hierarchische Netzwerkstruktur** für große Netzwerke
- **Distributed Discovery** über mehrere Segmente
- **Load Balancing** für Discovery-Requests
- **Caching** von häufig abgerufenen Daten

## 🔮 Zukünftige Erweiterungen

### Geplante Features
- **Machine Learning** für Peer-Qualitätsvorhersage
- **Geografische Peer-Gruppierung**
- **Erweiterte Routing-Algorithmen**
- **Real-time Collaboration** über Discovery-System

### API-Erweiterungen
- **WebSocket-API** für Live-Updates
- **GraphQL-Interface** für flexible Abfragen
- **Plugin-System** für Discovery-Erweiterungen
- **Mobile SDK** für Discovery-Integration

## 📚 API-Referenz

### Discovery-Endpoints
- `GET /api/discovery/peers` - Alle Peers auflisten
- `GET /api/discovery/network-topology` - Netzwerk-Topologie anzeigen
- `POST /api/discovery/announce` - Node ankündigen
- `GET /api/discovery/qr-generate` - QR-Code generieren
- `POST /api/discovery/qr-parse` - QR-Code parsen

### Discovery-Konfiguration
- `GET /api/discovery/config` - Discovery-Konfiguration abrufen
- `POST /api/discovery/config` - Discovery-Konfiguration aktualisieren
- `GET /api/discovery/status` - Discovery-Status anzeigen

## 🚨 Fehlerbehandlung

### Häufige Fehler

1. **Peer nicht gefunden**
   ```rust
   match discovery_manager.get_peer("peer123").await {
       Ok(peer) => println!("Peer gefunden: {:?}", peer),
       Err(DiscoveryError::PeerNotFound) => println!("Peer nicht gefunden"),
       Err(e) => println!("Fehler: {}", e),
   }
   ```

2. **QR-Code-Validierung fehlgeschlagen**
   ```rust
   match discovery_manager.parse_qr_code(qr_data).await {
       Ok(peer) => println!("Peer hinzugefügt: {}", peer.node_id),
       Err(DiscoveryError::InvalidQRCode) => println!("Ungültiger QR-Code"),
       Err(e) => println!("Fehler: {}", e),
   }
   ```

3. **Netzwerk-Segment voll**
   ```rust
   match discovery_manager.add_peer_to_segment(peer, "core").await {
       Ok(_) => println!("Peer zu Segment hinzugefügt"),
       Err(DiscoveryError::SegmentFull) => println!("Segment ist voll"),
       Err(e) => println!("Fehler: {}", e),
   }
   ```

## 🤝 Beitragen

Für Beiträge zum Discovery-System:

1. **Fork des Repositories**
2. **Feature-Branch erstellen**
3. **Tests schreiben**
4. **Pull Request einreichen**

### Coding Standards
- **Rust 2021 Edition**
- **Async/Await für alle I/O-Operationen**
- **Umfassende Fehlerbehandlung**
- **Dokumentation auf Deutsch**

---

**Entwickelt für das Brezn-Projekt** 🔍🌐