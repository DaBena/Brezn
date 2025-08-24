# 🌐 Brezn P2P Network Core

Das Brezn P2P Network Core implementiert ein vollständiges Peer-to-Peer-Netzwerk mit automatischer Peer-Discovery, Topology-Management und Health-Monitoring.

## 🚀 Features

### ✅ Implementiert

- **UDP-Multicast für Peer-Discovery** - Automatische Peer-Erkennung über Multicast und Broadcast
- **Peer-Registry mit Heartbeat-Mechanismus** - Kontinuierliche Überwachung der Peer-Verbindungen
- **Automatic Peer-Management** - Automatisches Hinzufügen und Entfernen von Peers
- **Peer-Health-Monitoring** - Überwachung der Verbindungsqualität und Latenz
- **Network-Topology-Management** - Analyse und Segmentierung des Netzwerks

### 🔧 Technische Details

#### Network Manager (`src/network.rs`)

Der `NetworkManager` ist das Herzstück des P2P-Netzwerks und verwaltet:

- **Peer-Verbindungen** mit Qualitätsbewertung
- **Message-Routing** zwischen Peers
- **Topology-Analyse** und Segmentierung
- **Health-Monitoring** und automatische Bereinigung

```rust
pub struct NetworkManager {
    port: u16,
    tor_enabled: bool,
    peers: Arc<Mutex<HashMap<String, PeerInfo>>>,
    topology: Arc<Mutex<NetworkTopology>>,
    discovery_manager: Option<Arc<Mutex<DiscoveryManager>>>,
}
```

#### Discovery Manager (`src/discovery.rs`)

Der `DiscoveryManager` kümmert sich um:

- **UDP-Multicast** für Peer-Erkennung
- **Broadcast-Nachrichten** für Netzwerk-Präsenz
- **Heartbeat-Mechanismus** für Verbindungsüberwachung
- **QR-Code-Generierung** für manuelle Peer-Verbindung

```rust
pub struct DiscoveryManager {
    config: DiscoveryConfig,
    peers: Arc<Mutex<HashMap<String, PeerInfo>>>,
    multicast_socket: Option<Arc<UdpSocket>>,
    broadcast_socket: Option<Arc<UdpSocket>>,
}
```

## 📊 Network Topology

Das System analysiert automatisch die Netzwerk-Topologie und kategorisiert Peers in Segmente:

### Segment Types

- **Core** - Hochverbundene Nodes mit exzellenter Verbindungsqualität
- **Bridge** - Nodes, die verschiedene Segmente verbinden
- **Edge** - Leaf-Nodes mit begrenzter Verbindung
- **Isolated** - Schlecht verbundene oder isolierte Nodes

### Connection Quality

- **Excellent** (< 50ms Latenz) - Score: 1.0
- **Good** (50-100ms Latenz) - Score: 0.8
- **Fair** (100-200ms Latenz) - Score: 0.6
- **Poor** (> 200ms Latenz) - Score: 0.3
- **Unknown** - Score: 0.5

## 🔍 Peer Discovery

### Automatische Erkennung

1. **Multicast Announcements** - Regelmäßige Bekanntmachung der eigenen Präsenz
2. **Heartbeat Messages** - Kontinuierliche Verbindungsüberwachung
3. **Capability Exchange** - Austausch der unterstützten Funktionen
4. **Network Segmentation** - Automatische Kategorisierung in Segmente

### Manuelle Verbindung

- **QR-Code-Generierung** für einfache Peer-Verbindung
- **JSON-Import** für erweiterte Konfiguration
- **Base64-Image-Decoding** für gescannte QR-Codes

## 📡 Message Types

### Discovery Messages

- `announce` - Neue Peer-Präsenz
- `heartbeat` - Verbindungsüberwachung
- `ping/pong` - Latenz-Messung
- `capabilities` - Funktionsaustausch

### Network Messages

- `post` - Inhaltsverteilung
- `config` - Konfigurationsaustausch
- `request_posts` - Inhaltsanfrage
- `sync` - Synchronisation

## 🧪 Testing

### Unit Tests

```bash
# Alle Tests ausführen
cargo test

# Nur Network-Tests
cargo test network

# Nur Discovery-Tests
cargo test discovery
```

### Integration Tests

```bash
# Integration-Tests mit 2+ Nodes
cargo test --test p2p_integration_tests
```

Die Integration-Tests simulieren ein vollständiges P2P-Netzwerk mit mehreren Nodes und testen:

- Peer-Discovery und -Management
- Message-Routing
- Connection Quality Monitoring
- Topology Analysis
- Health Monitoring

## 🚀 Verwendung

### Grundlegende Einrichtung

```rust
use brezn::network::NetworkManager;
use brezn::discovery::DiscoveryManager;

// Network Manager erstellen
let mut network = NetworkManager::new(8888, 9050);

// Discovery initialisieren
network.init_discovery("my_node".to_string(), "public_key".to_string()).await?;

// Discovery starten
network.start_discovery().await?;
```

### Peer-Management

```rust
// Peer hinzufügen
network.add_peer("peer_id".to_string(), public_key, "127.0.0.1".to_string(), 8889, false);

// Peers nach Qualität filtern
let excellent_peers = network.get_peers_by_quality(ConnectionQuality::Excellent);

// Netzwerk-Statistiken abrufen
let stats = network.get_network_stats();
```

### Topology-Analyse

```rust
// Netzwerk-Topologie analysieren
network.analyze_topology().await?;

// Topology-Informationen abrufen
let topology = network.get_topology();
println!("Netzwerk hat {} Segmente", topology.network_segments.len());
```

## ⚙️ Konfiguration

### Discovery Config

```rust
let config = DiscoveryConfig {
    discovery_port: 8888,
    broadcast_interval: Duration::from_secs(30),
    heartbeat_interval: Duration::from_secs(60),
    max_peers: 50,
    enable_multicast: true,
    enable_broadcast: true,
    connection_retry_limit: 3,
};
```

### Network Config

- **Port**: Standard-Netzwerk-Port
- **Tor Support**: Optionaler Tor-SOCKS5-Proxy
- **Message Handlers**: Erweiterbare Nachrichtenverarbeitung
- **Peer Limits**: Maximale Anzahl von Peers

## 🔒 Sicherheit

- **Kryptographische Authentifizierung** mit Sodiumoxide
- **Tor-Integration** für anonyme Verbindungen
- **Rate Limiting** für Nachrichten
- **Validierung** aller eingehenden Daten

## 📈 Performance

- **Asynchrone Verarbeitung** mit Tokio
- **Effiziente Peer-Verwaltung** mit HashMaps
- **Lazy Topology-Analyse** nur bei Bedarf
- **Intelligente Peer-Bereinigung** für inaktive Verbindungen

## 🐛 Troubleshooting

### Häufige Probleme

1. **Port bereits belegt** - Anderen Port wählen
2. **Multicast nicht verfügbar** - Broadcast-Modus verwenden
3. **Firewall-Blockierung** - UDP-Ports freigeben
4. **Tor-Verbindungsfehler** - Tor-Service überprüfen

### Debug-Modi

```rust
// Erweiterte Logging aktivieren
env_logger::init();

// Network-Statistiken ausgeben
println!("{:?}", network.get_network_stats());
```

## 🔮 Zukünftige Erweiterungen

- **DHT-Integration** für verteilte Peer-Suche
- **NAT-Traversal** für bessere Konnektivität
- **Bandwidth-Management** für optimale Ressourcennutzung
- **Geographic Routing** für lokale Peer-Optimierung

## 📚 Weitere Dokumentation

- [API Reference](API.md)
- [Configuration Guide](CONFIG.md)
- [Troubleshooting](TROUBLESHOOTING.md)
- [Performance Tuning](PERFORMANCE.md)

---

**Entwickelt für das Brezn-Projekt** - Ein sicheres, dezentrales Social-Media-Netzwerk.