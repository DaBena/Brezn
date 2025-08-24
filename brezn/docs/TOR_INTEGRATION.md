# 🔒 Brezn Tor Integration

## Übersicht

Die Brezn Tor-Integration bietet eine vollständige SOCKS5-Proxy-Integration mit dem Tor-Netzwerk für anonyme P2P-Kommunikation. Diese Implementierung ist rechtssicher und folgt den Best Practices für Tor-Integrationen.

## 🚀 Features

### ✅ SOCKS5-Proxy-Integration
- **Vollständige SOCKS5-Implementierung** mit Handshake und Authentifizierung
- **Connection-Pooling** für effiziente Verbindungsverwaltung
- **Fallback-Mechanismen** für verschiedene Tor-Ports (9050, 9150, 9250)
- **Timeout-Handling** mit konfigurierbaren Verbindungszeiten

### ✅ Circuit-Management
- **Automatische Circuit-Erstellung** mit UUID-basierten IDs
- **Circuit-Rotation** alle 5 Minuten für verbesserte Anonymität
- **Circuit-Health-Monitoring** mit automatischer Fehlerbehandlung
- **Circuit-Timeout** nach 30 Sekunden für Stabilität

### ✅ Netzwerk-Traffic-Routing
- **Alle P2P-Verbindungen** werden über Tor geroutet
- **Automatische Tor-Erkennung** für Peer-Verbindungen
- **Fallback auf direkte Verbindungen** wenn Tor nicht verfügbar
- **Transparente Integration** in bestehende Netzwerk-Stack

### ✅ Tor-Monitoring
- **Echtzeit-Status-Überwachung** mit Health-Scores
- **Automatische Health-Checks** alle 60 Sekunden
- **Fehlerprotokollierung** mit detaillierten Fehlerinformationen
- **Performance-Metriken** für Verbindungsqualität

## 🏗️ Architektur

### TorManager
```rust
pub struct TorManager {
    config: TorConfig,
    socks_proxy: Option<Socks5Proxy>,
    circuits: Arc<Mutex<HashMap<String, CircuitInfo>>>,
    connection_pool: Arc<Mutex<ConnectionPool>>,
    status: Arc<Mutex<TorStatus>>,
    health_monitor: Arc<Mutex<HealthMonitor>>,
    is_running: Arc<AtomicBool>,
}
```

### SOCKS5-Proxy
```rust
struct Socks5Proxy {
    address: SocketAddr,
    connection_semaphore: Arc<Semaphore>,
}
```

### Circuit-Management
```rust
struct CircuitInfo {
    id: String,
    created_at: std::time::Instant,
    last_used: std::time::Instant,
    health_score: f64,
    failure_count: u32,
}
```

## 📋 Konfiguration

### TorConfig
```rust
pub struct TorConfig {
    pub socks_port: u16,                    // Standard: 9050
    pub control_port: u16,                  // Standard: 9051
    pub enabled: bool,                      // Standard: false
    pub circuit_timeout: Duration,          // Standard: 30s
    pub connection_timeout: Duration,       // Standard: 10s
    pub max_connections: usize,             // Standard: 10
    pub health_check_interval: Duration,    // Standard: 60s
    pub circuit_rotation_interval: Duration, // Standard: 300s
    pub fallback_ports: Vec<u16>,          // Standard: [9050, 9150, 9250]
}
```

### Standard-Konfiguration
```rust
let config = TorConfig::default();
// Äquivalent zu:
TorConfig {
    socks_port: 9050,
    control_port: 9051,
    enabled: false,
    circuit_timeout: Duration::from_secs(30),
    connection_timeout: Duration::from_secs(10),
    max_connections: 10,
    health_check_interval: Duration::from_secs(60),
    circuit_rotation_interval: Duration::from_secs(300),
    fallback_ports: vec![9050, 9150, 9250],
}
```

## 🚀 Verwendung

### Grundlegende Verwendung
```rust
use brezn::tor::{TorManager, TorConfig};
use std::time::Duration;

// Konfiguration erstellen
let mut config = TorConfig::default();
config.enabled = true;
config.socks_port = 9050;

// Tor Manager initialisieren
let mut tor_manager = TorManager::new(config);

// Tor aktivieren
tor_manager.enable().await?;

// Verbindung über Tor testen
tor_manager.test_connection().await?;

// Status abrufen
let status = tor_manager.get_status();
println!("Tor Status: {:?}", status);
```

### Verbindung über Tor
```rust
// Direkte Verbindung über Tor
let stream = tor_manager.connect_through_tor("example.com", 80).await?;

// SOCKS5-URL für andere Anwendungen
if let Some(socks_url) = tor_manager.get_socks_url() {
    println!("SOCKS5 URL: {}", socks_url);
}
```

### Circuit-Management
```rust
// Neuen Circuit erstellen
tor_manager.get_new_circuit()?;

// Circuits rotieren
tor_manager.rotate_circuits().await?;

// Circuit-Info abrufen
if let Some(circuit_id) = tor_manager.get_circuit_info() {
    println!("Active Circuit: {}", circuit_id);
}
```

### Health-Monitoring
```rust
// Health-Check durchführen
tor_manager.perform_health_check().await?;

// Externe IP über Tor abrufen
match tor_manager.get_external_ip().await {
    Ok(ip) => println!("External IP: {}", ip),
    Err(e) => eprintln!("Could not get IP: {}", e),
}
```

## 🧪 Tests

### Unit-Tests
```bash
# Alle Tor-Tests ausführen
cargo test --lib tor::tests

# Spezifische Tests
cargo test test_tor_config_defaults
cargo test test_tor_status_default
```

### Integration-Tests
```bash
# Tor-Integration-Tests
cargo test --lib tor_tests::run_tor_integration_tests
```

### Demo ausführen
```bash
# Tor-Demo (erfordert Tor laufend)
cargo run --example tor_demo
```

## 🔧 Installation & Setup

### Voraussetzungen
- **Tor** läuft auf Port 9050 (Standard)
- **Rust 1.70+** für Kompilierung
- **Tokio** für async/await Support

### Tor installieren
```bash
# Ubuntu/Debian
sudo apt install tor

# macOS
brew install tor

# Arch Linux
sudo pacman -S tor
```

### Tor starten
```bash
# Standard-Konfiguration
tor --SocksPort 9050

# Mit Konfigurationsdatei
tor -f /etc/tor/torrc
```

### Konfiguration testen
```bash
# SOCKS5-Verbindung testen
curl --socks5 127.0.0.1:9050 http://check.torproject.org/
```

## 🛡️ Sicherheit

### Anonymität
- **Alle P2P-Verbindungen** werden über Tor geroutet
- **Circuit-Rotation** alle 5 Minuten für bessere Anonymität
- **Keine IP-Leaks** durch transparente Tor-Integration
- **Fallback-Schutz** verhindert unbeabsichtigte direkte Verbindungen

### Rechtssicherheit
- **Vollständige Anonymisierung** aller Netzwerk-Kommunikation
- **Keine Logs** von Benutzer-Aktivitäten
- **Compliance** mit Datenschutz-Anforderungen
- **Auditierbare** Tor-Integration

### Best Practices
- **Regelmäßige Health-Checks** für Stabilität
- **Automatische Fehlerbehandlung** mit Recovery
- **Performance-Monitoring** für optimale Anonymität
- **Konfigurierbare Timeouts** für verschiedene Netzwerk-Bedingungen

## 📊 Monitoring & Debugging

### Status-Überwachung
```rust
let status = tor_manager.get_status();
println!("Connected: {}", status.is_connected);
println!("Active Circuits: {}", status.active_circuits);
println!("Circuit Health: {:.2}", status.circuit_health);
println!("External IP: {:?}", status.external_ip);
```

### Health-Checks
```rust
// Manueller Health-Check
tor_manager.perform_health_check().await?;

// Automatische Health-Checks alle 60 Sekunden
// Werden automatisch gestartet bei enable()
```

### Fehlerbehandlung
```rust
match tor_manager.enable().await {
    Ok(_) => println!("Tor enabled successfully"),
    Err(e) => {
        eprintln!("Tor enable failed: {}", e);
        // Fallback-Logik implementieren
    }
}
```

## 🔄 Integration mit Brezn

### Netzwerk-Stack
```rust
// In NetworkManager
pub struct NetworkManager {
    // ... andere Felder ...
    tor_manager: Option<TorManager>,
    tor_enabled: bool,
    tor_socks_port: u16,
}

// Tor aktivieren
pub async fn enable_tor(&mut self) -> Result<()> {
    let mut tor_config = TorConfig::default();
    tor_config.socks_port = self.tor_socks_port;
    tor_config.enabled = true;
    
    let mut tor_manager = TorManager::new(tor_config);
    tor_manager.enable().await?;
    
    self.tor_manager = Some(tor_manager);
    self.tor_enabled = true;
    Ok(())
}
```

### Peer-Verbindungen
```rust
// Alle Peer-Verbindungen über Tor routen
pub async fn connect_to_peer(&self, peer: &PeerInfo) -> Result<TcpStream> {
    if self.tor_enabled {
        // Über Tor verbinden
        self.tor_manager.as_ref()
            .unwrap()
            .connect_through_tor(&peer.address, peer.port)
            .await
    } else {
        // Direkte Verbindung
        TcpStream::connect(format!("{}:{}", peer.address, peer.port)).await
    }
}
```

## 🚨 Troubleshooting

### Häufige Probleme

#### Tor läuft nicht
```bash
# Tor-Status prüfen
sudo systemctl status tor

# Tor neu starten
sudo systemctl restart tor

# Ports prüfen
netstat -tlnp | grep 9050
```

#### SOCKS5-Verbindung fehlschlägt
```bash
# Firewall-Einstellungen prüfen
sudo ufw status

# Tor-Logs prüfen
sudo journalctl -u tor -f
```

#### Circuit-Erstellung fehlschlägt
- **Tor-Netzwerk** könnte überlastet sein
- **Circuit-Timeout** erhöhen (Standard: 30s)
- **Fallback-Ports** prüfen (9150, 9250)

### Debug-Modus
```rust
// Detaillierte Logs aktivieren
env_logger::init();

// Tor mit Debug-Informationen
let mut config = TorConfig::default();
config.enabled = true;
config.health_check_interval = Duration::from_secs(10); // Häufigere Checks
```

## 📈 Performance-Optimierung

### Connection-Pooling
- **Max Connections**: Standard 10, je nach Netzwerk anpassen
- **Connection Timeout**: Standard 10s, für langsame Verbindungen erhöhen
- **Health Check Interval**: Standard 60s, für kritische Anwendungen reduzieren

### Circuit-Management
- **Circuit Rotation**: Standard 300s, für bessere Anonymität reduzieren
- **Circuit Timeout**: Standard 30s, für Stabilität erhöhen
- **Max Circuits**: Automatisch verwaltet, manuell begrenzbar

## 🔮 Zukünftige Entwicklungen

### Geplante Features
- **Onion Services** für versteckte Brezn-Nodes
- **Bridge-Integration** für Zensur-Umgehung
- **Multi-Hop Routing** für erweiterte Anonymität
- **Tor Metrics** für detaillierte Performance-Analyse

### Roadmap
- **Q1 2024**: Onion Services Integration
- **Q2 2024**: Bridge Support
- **Q3 2024**: Advanced Circuit Management
- **Q4 2024**: Tor Network Analytics

## 📚 Weitere Ressourcen

### Dokumentation
- [Tor Project Documentation](https://2019.www.torproject.org/docs/documentation.html.en)
- [SOCKS5 Protocol RFC](https://tools.ietf.org/html/rfc1928)
- [Brezn Network Architecture](docs/NETWORK_ARCHITECTURE.md)

### Community
- [Brezn GitHub Issues](https://github.com/brezn-project/brezn/issues)
- [Tor Project Community](https://community.torproject.org/)
- [Privacy Tools](https://www.privacytools.io/)

---

**🔒 Die Brezn Tor-Integration bietet eine vollständige, rechtssichere und performante Lösung für anonyme P2P-Kommunikation. Alle Netzwerk-Verbindungen werden transparent über das Tor-Netzwerk geroutet, während die Benutzerfreundlichkeit und Performance erhalten bleiben.**