# 🔒 Tor-Integration für Brezn

## Übersicht

Die Tor-Integration für das Brezn-Projekt bietet eine vollständige SOCKS5-Proxy-Integration mit erweiterten Features für Anonymität, Sicherheit und Performance.

## 🚀 Features

### 1. Echte SOCKS5-Proxy-Integration
- **Vollständige SOCKS5-Protokoll-Implementierung**
- **Unterstützung für IPv4, IPv6 und Domain-Namen**
- **Robuste Handshake-Behandlung**
- **Fehlerbehandlung und Recovery**

### 2. Tor-Connection-Pooling
- **Intelligentes Connection-Pooling**
- **Konfigurierbare Pool-Größe**
- **Automatische Connection-Reinigung**
- **Performance-Optimierung**

### 3. Circuit-Management
- **Automatische Circuit-Erstellung**
- **Circuit-Gesundheitsüberwachung**
- **Circuit-Rotation für bessere Anonymität**
- **Circuit-Lifecycle-Management**

### 4. Tor-Status-Monitoring
- **Echtzeit-Gesundheitsüberwachung**
- **Circuit-Status-Tracking**
- **Performance-Metriken**
- **Fehlerprotokollierung**

### 5. Fallback-Mechanismen
- **Mehrere Tor-Port-Fallbacks**
- **Automatische Wiederherstellung**
- **Retry-Logik mit Exponential Backoff**
- **Graceful Degradation**

## 📁 Dateistruktur

```
brezn/src/
├── tor.rs           # Hauptimplementierung der Tor-Integration
├── network.rs       # Erweiterte Netzwerk-Integration
└── tor_tests.rs     # Umfassende Test-Suite

brezn/src/bin/
└── cli.rs          # CLI mit Tor-Kommandos
```

## ⚙️ Konfiguration

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

### Beispiel-Konfiguration

```rust
let config = TorConfig {
    enabled: true,
    socks_port: 9050,
    max_connections: 20,
    health_check_interval: Duration::from_secs(30),
    circuit_rotation_interval: Duration::from_secs(180),
    ..TorConfig::default()
};
```

## 🔧 Verwendung

### Grundlegende Tor-Integration

```rust
use brezn::tor::{TorManager, TorConfig};

// Konfiguration erstellen
let mut config = TorConfig::default();
config.enabled = true;

// Tor-Manager initialisieren
let mut tor_manager = TorManager::new(config);

// Tor aktivieren
tor_manager.enable().await?;

// Durch Tor verbinden
let stream = tor_manager.connect_through_tor("example.com", 80).await?;
```

### Netzwerk-Integration

```rust
use brezn::network::NetworkManager;

// Netzwerk-Manager mit Tor erstellen
let mut network_manager = NetworkManager::new(8888, 9050);

// Tor aktivieren
network_manager.enable_tor().await?;

// Tor-Status abrufen
let status = network_manager.get_tor_status();
let health = network_manager.get_tor_health();
```

### Health-Monitoring

```rust
// Umfassende Gesundheitsprüfung
tor_manager.perform_health_check().await?;

// Circuit-Rotation
tor_manager.rotate_circuits().await?;

// Status abrufen
let status = tor_manager.get_status();
println!("Circuit health: {:.2}", status.circuit_health);
```

## 🧪 Testing

### CLI-Tests

```bash
# Alle Tor-Tests ausführen
./brezn-cli tor-test

# Tor-Status anzeigen
./brezn-cli tor-status

# Hilfe anzeigen
./brezn-cli help
```

### Programmatische Tests

```rust
use brezn::tor_tests::TorTestSuite;

// Test-Suite erstellen
let mut test_suite = TorTestSuite::new();

// Alle Tests ausführen
test_suite.run_all_tests().await?;

// Spezifische Tests
test_suite.test_failure_recovery().await?;
test_suite.test_performance_metrics().await?;
```

## 📊 Monitoring und Debugging

### Tor-Status

```rust
let status = tor_manager.get_status();
println!("Connected: {}", status.is_connected);
println!("Active circuits: {}", status.active_circuits);
println!("Circuit health: {:.2}", status.circuit_health);
println!("External IP: {:?}", status.external_ip);
```

### Health-Monitoring

```rust
let health = network_manager.get_tor_health();
println!("Overall health: {:.2}", health.overall_health);
println!("Circuit count: {}", health.circuit_count);
println!("Active connections: {}", health.active_connections);
println!("Failure count: {}", health.failure_count);
```

### Logging

Die Tor-Integration verwendet strukturiertes Logging mit Emojis für bessere Lesbarkeit:

- 🔒 Tor-aktiviert
- 🔓 Tor-deaktiviert
- 🔄 Circuit-Rotation
- ✅ Erfolgreiche Operationen
- ⚠️ Warnungen
- ❌ Fehler

## 🚨 Fehlerbehandlung

### Häufige Fehler

1. **Tor nicht verfügbar**
   ```rust
   match tor_manager.enable().await {
       Ok(_) => println!("Tor aktiviert"),
       Err(BreznError::Tor(msg)) => println!("Tor-Fehler: {}", msg),
       Err(e) => println!("Unerwarteter Fehler: {}", e),
   }
   ```

2. **Connection-Pool erschöpft**
   ```rust
   // Automatische Retry-Logik
   let stream = network_manager.connect_through_tor_with_retry(host, port).await?;
   ```

3. **Circuit-Gesundheit schlecht**
   ```rust
   // Automatische Circuit-Rotation
   if status.circuit_health < 0.5 {
       tor_manager.rotate_circuits().await?;
   }
   ```

## 🔒 Sicherheitsaspekte

### Anonymität
- **Automatische Circuit-Rotation**
- **Keine Logs von Benutzerdaten**
- **Isolierte Connection-Pools**

### Fallback-Sicherheit
- **Graceful Degradation**
- **Keine Datenlecks bei Tor-Fehlern**
- **Sichere Fehlerbehandlung**

## 📈 Performance-Optimierung

### Connection-Pooling
- **Wiederverwendung von Verbindungen**
- **Intelligente Pool-Größe**
- **Automatische Bereinigung**

### Circuit-Management
- **Optimale Circuit-Lebensdauer**
- **Gesundheitsbasierte Rotation**
- **Performance-Monitoring**

## 🔮 Zukünftige Erweiterungen

### Geplante Features
- **Tor Control Protocol Integration**
- **Onion Service Support**
- **Erweiterte Circuit-Strategien**
- **Machine Learning für Circuit-Optimierung**

### API-Erweiterungen
- **WebSocket-Status-Updates**
- **REST-API für Tor-Management**
- **Grafische Monitoring-Dashboards**

## 📚 Weitere Ressourcen

- [Tor Project Documentation](https://2019.www.torproject.org/docs/documentation.html.en)
- [SOCKS5 Protocol RFC](https://tools.ietf.org/html/rfc1928)
- [Brezn Project Repository](https://github.com/brezn-project/brezn)

## 🤝 Beitragen

Für Beiträge zur Tor-Integration:

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

**Entwickelt für das Brezn-Projekt** 🔒🌐