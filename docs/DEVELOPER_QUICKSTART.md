# Brezn - Developer Quickstart

## 🚀 **Schnellstart für Entwickler**

**Letzte Aktualisierung**: 19. Dezember 2024  
**Projektstatus**: MVP 45% abgeschlossen

---

## 📋 **Was ist funktional?**

### ✅ **Vollständig implementiert**
- **Backend**: Rust-Server mit SQLite-Datenbank
- **Posts**: CRUD-Operationen für Social Media Posts
- **Web-UI**: Tab-basierte Benutzeroberfläche
- **CLI**: Kommandozeilen-Interface
- **Krypto**: AES-GCM und NaCl Box Verschlüsselung
- **Konfiguration**: Umgebungsvariablen und Config-Dateien
- **Tests**: 10/10 Tests bestehen

### ⚠️ **Platzhalter (nicht funktional)**
- **P2P-Netzwerk**: Grundstruktur vorhanden, aber keine echte Peer-Kommunikation
- **Tor-Integration**: Protokoll vorhanden, aber keine echte Proxy-Integration
- **QR-Code**: Tests vorhanden, aber keine echte QR-Code-Funktionalität
- **Discovery**: Manager vorhanden, aber keine echte Peer-Findung

---

## 🔧 **Lokale Entwicklung**

### Voraussetzungen
```bash
# Rust installieren
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env

# Optional: Tor für lokale Tests
sudo apt install tor  # Ubuntu/Debian
brew install tor      # macOS
```

### Projekt starten
```bash
# Repository klonen
git clone <repository-url>
cd brezn

# Dependencies installieren
cargo build

# Tests ausführen
cargo test

# Server starten
cargo run --bin brezn-server
# -> http://localhost:8080
```

### Entwicklungsumgebung
```bash
# Live-Reload für Tests
cargo watch -x test

# Spezifische Tests
cargo test --package brezn
cargo test --lib
cargo test network::tests
```

---

## 🎯 **Aktuelle Entwicklungsaufgaben**

### **Priorität 1: P2P-Netzwerk (2 Wochen)**
**Datei**: `src/network.rs`

**Was implementieren:**
- Echte Peer-Discovery über UDP-Broadcast
- Post-Synchronisation zwischen Peers
- Netzwerk-Traffic-Routing
- Peer-Heartbeat-System

**Tests schreiben:**
- Unit-Tests für Network-Module
- Integration-Tests für P2P-Kommunikation
- Performance-Tests

### **Priorität 2: Tor-Integration (1 Woche)**
**Datei**: `src/tor.rs`

**Was implementieren:**
- Funktionale SOCKS5-Proxy-Integration
- Netzwerk-Traffic über Tor routen
- Tor-Status-Monitoring
- Circuit-Management

### **Priorität 3: QR-Code (1 Woche)**
**Datei**: `src/discovery.rs`

**Was implementieren:**
- Echte QR-Code-Generierung
- QR-Code-Parsing und Peer-Beitritt
- QR-Code-Validierung

### **Priorität 4: System-Integration (1 Woche)**
**Datei**: `src/discovery.rs` + `src/network.rs`

**Was implementieren:**
- Discovery + Network verbinden
- Peer-Management vervollständigen
- Integration-Tests

---

## 🧪 **Testing-Strategie**

### Unit-Tests
```bash
# Alle Tests
cargo test

# Spezifische Module
cargo test network
cargo test tor
cargo test discovery
```

### Integration-Tests
```bash
# Netzwerk-Tests
cargo test --test network_integration

# End-to-End Tests
cargo test --test e2e
```

### Performance-Tests
```bash
# Benchmarks
cargo bench

# Spezifische Benchmarks
cargo bench network
```

---

## 📁 **Projektstruktur**

```
brezn/
├── src/
│   ├── main.rs          # CLI-Interface
│   ├── lib.rs           # Library-Entry-Point
│   ├── server.rs        # HTTP-Server
│   ├── network.rs       # P2P-Netzwerk (PLATZHALTER)
│   ├── tor.rs           # Tor-Integration (BASIS-SETUP)
│   ├── discovery.rs     # Peer-Discovery (PLATZHALTER)
│   ├── crypto.rs        # Verschlüsselung
│   ├── config.rs        # Konfiguration
│   └── models.rs        # Datenmodelle
├── tests/               # Integration-Tests
├── docs/                # Dokumentation
└── scripts/             # Build-Scripts
```

---

## 🚨 **Wichtige Regeln**

### E-Mail-Schutz
- **NIEMALS** private E-Mail-Adressen veröffentlichen
- **NIEMALS** Co-authored-by mit echten E-Mails
- **NUR** `brezn-dev@noreply.github.com` verwenden

### Code-Qualität
- Klare, beschreibende Bezeichner
- Frühe Rückgaben/Guard Clauses
- Tests für neue Funktionen
- "Warum" dokumentieren, nicht "Wie"

### Git-Workflow
- Feature-Branches für alle Änderungen
- Pull Requests für alle Commits
- Keine direkten Pushes zu main/develop

---

## 🔗 **Weitere Dokumentation**

- **Projektstatus**: [PROJECT_STATUS_ACTUAL.md](PROJECT_STATUS_ACTUAL.md)
- **Detaillierte Roadmap**: [ROADMAP_DETAILED.md](ROADMAP_DETAILED.md)
- **API-Dokumentation**: [API.md](API.md)
- **Architektur**: [architecture.md](architecture.md)
- **Installation**: [INSTALL.md](INSTALL.md)
- **Beitragen**: [../CONTRIBUTING.md](../CONTRIBUTING.md)

---

## 💡 **Tipps für neue Entwickler**

1. **Fangen Sie mit den Tests an** - Sie zeigen, was funktionieren sollte
2. **Schauen Sie sich die Platzhalter an** - Sie zeigen, was implementiert werden muss
3. **Kleine Änderungen** - Implementieren Sie eine Funktion nach der anderen
4. **Fragen stellen** - Erstellen Sie Issues für unklare Punkte
5. **Dokumentation aktualisieren** - Halten Sie diese Datei aktuell

---

**Viel Erfolg bei der Entwicklung von Brezn!** 🚀