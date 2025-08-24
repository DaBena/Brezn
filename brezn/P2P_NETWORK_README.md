# Brezn P2P-Netzwerk - Implementierung

## Übersicht

Das Brezn P2P-Netzwerk ist eine vollständige Implementierung eines dezentralen Peer-to-Peer-Netzwerks für die Brezn-Anwendung. Es ermöglicht es Benutzern, Posts auszutauschen, ohne auf zentrale Server angewiesen zu sein.

## Features

### 🔍 Peer-Discovery
- **UDP-Broadcast** für automatische Peer-Entdeckung
- **Peer-Registry** mit Heartbeat-Monitoring
- **Automatisches Peer-Management** mit Qualitätsbewertung

### 🔄 Post-Synchronisation
- **Post-Broadcast-Mechanismus** mit TTL
- **Conflict-Resolution** für Posts mit mehreren Strategien
- **Konsistenz-Checks** zwischen Peers
- **Bidirektionale Synchronisation**

### 📡 Message-Handler
- **Alle Message-Typen** implementiert
- **Robuste Fehlerbehandlung** mit Retry-Logik
- **Automatische Verbindungswiederherstellung**

### 🔒 Tor-Unterstützung
- **Anonyme Verbindungen** über Tor-Netzwerk
- **Automatische Circuit-Rotation**
- **Health-Monitoring**

## Verwendung

### Grundlegende Einrichtung

```rust
use brezn::network::P2PNetworkExample;

#[tokio::main]
async fn main() -> Result<()> {
    // P2P-Netzwerk erstellen
    let mut p2p = P2PNetworkExample::new(8888, 8889);
    
    // Netzwerk starten
    p2p.start("your_public_key_here".to_string()).await?;
    
    // Post senden
    p2p.broadcast_post(
        "Hallo Brezn-Netzwerk!".to_string(),
        "AnonymBrezn42".to_string()
    ).await?;
    
    // Mit allen Peers synchronisieren
    p2p.sync_all_peers().await?;
    
    // Netzwerk-Status abrufen
    let status = p2p.get_status();
    println!("Aktive Peers: {}", status.peer_count);
    
    Ok(())
}
```

### Erweiterte Konfiguration

```rust
use brezn::network::NetworkManager;

#[tokio::main]
async fn main() -> Result<()> {
    // Netzwerk-Manager direkt verwenden
    let mut network = NetworkManager::new(8888, 9050);
    
    // Tor aktivieren
    network.enable_tor().await?;
    
    // UDP-Discovery starten
    network.start_udp_discovery(8889).await?;
    
    // Heartbeat-Monitoring starten
    network.start_heartbeat_monitoring().await?;
    
    // Fehlerbehebung aktivieren
    network.start_error_recovery_monitoring().await?;
    
    // TCP-Server starten
    network.start_server().await?;
    
    Ok(())
}
```

## Netzwerk-Architektur

### Peer-Discovery
1. **UDP-Broadcast** alle 30 Sekunden
2. **Peer-Announcements** werden empfangen und verarbeitet
3. **Automatische Peer-Verwaltung** mit Qualitätsbewertung
4. **Heartbeat-Monitoring** alle 60 Sekunden

### Post-Synchronisation
1. **Post-Broadcast** mit TTL (Time-to-Live)
2. **Conflict-Detection** bei doppelten Posts
3. **Automatische Konfliktlösung** mit verschiedenen Strategien
4. **Bidirektionale Synchronisation** zwischen Peers

### Message-Handling
1. **Alle Message-Typen** werden verarbeitet
2. **Retry-Logik** bei fehlgeschlagenen Verbindungen
3. **Automatische Verbindungswiederherstellung**
4. **Fehlerbehandlung** mit Recovery-Strategien

## Konfliktlösungs-Strategien

### LatestWins
Verwendet den neuesten Post basierend auf dem Timestamp.

### FirstWins
Verwendet den ersten empfangenen Post.

### ContentHash
Bewertet Posts basierend auf Inhaltsqualität und Einzigartigkeit.

### Merged
Versucht, Inhalte zusammenzuführen, falls möglich.

### Manual
Erfordert manuelle Konfliktlösung durch den Benutzer.

## Netzwerk-Status

```rust
let status = network.get_network_status();

println!("Node ID: {}", status.node_id);
println!("Discovery aktiv: {}", status.discovery_active);
println!("Aktive Peers: {}", status.peer_count);
println!("Unaufgelöste Konflikte: {}", status.unresolved_conflicts);
println!("Tor aktiv: {}", status.tor_enabled);
```

## Fehlerbehandlung

Das Netzwerk implementiert robuste Fehlerbehandlung:

- **Automatische Wiederherstellung** bei Verbindungsproblemen
- **Retry-Logik** mit exponentieller Verzögerung
- **Peer-Gesundheitsüberwachung** mit automatischer Bereinigung
- **Topologie-Analyse** zur Netzwerkoptimierung

## Tor-Integration

```rust
// Tor aktivieren
network.enable_tor().await?;

// Tor-Status abrufen
let tor_status = network.get_tor_status();
if let Some(status) = tor_status {
    println!("Tor Circuits: {}", status.active_circuits);
    println!("Tor Health: {:.2}", status.circuit_health);
}

// Circuits rotieren
network.rotate_tor_circuits().await?;
```

## Performance-Optimierung

- **Asynchrone Verarbeitung** aller Netzwerk-Operationen
- **Effiziente Peer-Verwaltung** mit Qualitätsbewertung
- **Intelligente Synchronisation** nur bei Änderungen
- **Automatische Bereinigung** inaktiver Peers

## Monitoring und Debugging

```rust
// Netzwerk-Statistiken
let stats = network.get_network_stats();
println!("Gesamt-Peers: {}", stats.total_peers);
println!("Exzellente Verbindungen: {}", stats.excellent_connections);
println!("Durchschnittliche Latenz: {}ms", stats.avg_latency_ms);

// Topologie-Analyse
let topology = network.get_topology();
println!("Netzwerk-Segmente: {}", topology.network_segments.len());
println!("Topologie-Version: {}", topology.topology_version);

// Peer-Qualität nach Verbindungsqualität filtern
let excellent_peers = network.get_peers_by_quality(ConnectionQuality::Excellent);
println!("Exzellente Peers: {}", excellent_peers.len());
```

## Sicherheitsfeatures

- **Kryptographische Verifizierung** von Posts
- **Signatur-basierte Authentifizierung**
- **Tor-Unterstützung** für Anonymität
- **Rate-Limiting** gegen Spam
- **Validierung** aller eingehenden Daten

## Entwicklung und Tests

### Tests ausführen

```bash
cd brezn
cargo test network
```

### Beispiel-Anwendung

```bash
cargo run --bin brezn-server
```

## Troubleshooting

### Häufige Probleme

1. **Peer wird nicht gefunden**
   - Überprüfen Sie die Firewall-Einstellungen
   - Stellen Sie sicher, dass der Discovery-Port offen ist

2. **Verbindungsfehler**
   - Überprüfen Sie die Netzwerk-Konfiguration
   - Testen Sie die Tor-Verbindung

3. **Posts werden nicht synchronisiert**
   - Überprüfen Sie die Conflict-Resolution-Strategien
   - Stellen Sie sicher, dass Peers aktiv sind

### Debug-Ausgaben aktivieren

```rust
// Erweiterte Logging aktivieren
env_logger::init();
```

## Nächste Schritte

- [ ] **Web-Interface** für Netzwerk-Status
- [ ] **Erweiterte Metriken** und Visualisierung
- [ ] **Mobile Unterstützung** für P2P-Netzwerk
- [ ] **Erweiterte Verschlüsselung** für Posts
- [ ] **Distributed Hash Table (DHT)** für bessere Peer-Discovery

## Lizenz

Dieses Projekt ist unter der MIT-Lizenz lizenziert.