# Contributing to Brezn

Danke, dass du zu Brezn beitragen möchtest!

## 🎯 **Aktueller Projektstatus**

**MVP 45% abgeschlossen** - Wir arbeiten derzeit an der Vervollständigung der P2P-Netzwerk-Funktionalität.

### ✅ **Vollständig funktional**
- Rust-Backend mit SQLite-Datenbank
- Grundlegende Post-Funktionalität (CRUD)
- Web-UI mit Tab-Interface
- CLI-Interface mit erweiterten Funktionen
- Krypto-Module (AES-GCM, NaCl Box)
- Konfigurationsmanagement
- Mute-User-Funktionalität
- Test-Suite (10/10 Tests erfolgreich)

### ⚠️ **Aktuell in Entwicklung (Platzhalter ersetzen)**
- P2P-Netzwerk von Platzhalter zu funktional
- Tor-Integration vervollständigen
- QR-Code-Funktionalität implementieren
- Discovery-System vervollständigen

## 🚀 **Development Setup**

### Voraussetzungen
- Rust Toolchain via `rustup`
- Optional: Tor lokal (SOCKS5 auf Port 9050)

### Lokale Entwicklung
```bash
cd brezn
cargo build
cargo test
cargo run --bin brezn-server
# -> http://localhost:8080
```

### Tests ausführen
```bash
cargo test                    # Alle Tests
cargo test --package brezn   # Nur Brezn-Package
cargo test --lib             # Nur Library-Tests
```

## 📋 **Entwicklungsrichtlinien**

### Code-Qualität
- Klare, beschreibende Bezeichner (keine Abkürzungen)
- Frühe Rückgaben/Guard Clauses, Fehlerfälle zuerst behandeln
- Tests für neue Kernfunktionen
- Keine überflüssigen Kommentare; „Warum", nicht „Wie" dokumentieren

### Aktuelle Prioritäten
1. **P2P-Netzwerk vervollständigen** - Peer-Discovery und Post-Synchronisation
2. **Tor-Integration funktional machen** - SOCKS5-Proxy-Integration
3. **QR-Code implementieren** - Echte QR-Code-Generierung und -Parsing
4. **System-Integration** - Discovery + Network verbinden

## 🚨 **WICHTIG: Keine privaten E-Mail-Adressen veröffentlichen! 🚨**

Bitte beachten: `docs/REPOSITORY_SECURITY_SETUP.md` (Setup & Hooks zum Schutz vor E-Mail-Leaks).

**Kritische Regeln für alle Beiträge:**
- **VERÖFFENTLICHEN SIE NIEMALS private E-Mail-Adressen von Benutzern**
- **Fügen Sie NIEMALS E-Mail-Adressen als Co-Author in Git-Commits oder Pull Requests hinzu**
- **Verwenden Sie nur generische Benutzernamen ohne E-Mail-Domains**
- **Wenn E-Mail-Adressen im Code vorkommen, ersetzen Sie sie durch Platzhalter wie "user@placeholder.com"**

## 📝 **Commit Messages**

### Format
```
type(scope): kurzbeschreibung

- Beispiele: 
  - `feat(network): peer discovery implementiert`
  - `fix(tor): socks5 proxy integration korrigiert`
  - `docs(readme): projektstatus aktualisiert`
  - `test(network): p2p tests hinzugefügt`
```

### Wichtige Regeln
- **WICHTIG:** Verwenden Sie nur den Benutzernamen ohne E-Mail
- **WICHTIG:** Fügen Sie keine Co-Authors mit E-Mail-Adressen hinzu
- Folgen Sie dem Commit-Template in `.gitmessage`

## 🔄 **Pull Requests**

### Richtlinien
- Kleine, thematisch fokussierte Änderungen
- Beschreibung: Motivation, Änderungen, Testhinweise
- Verknüpfen Sie mit relevanten Issues

### Checklist
- [ ] Build grün (`cargo build`, `cargo test`)
- [ ] Alle Tests bestehen
- [ ] Docs aktualisiert (falls relevant)
- [ ] Manuelle Tests der relevanten Pfade
- [ ] Keine privaten E-Mail-Adressen im Code

### Aktuelle Entwicklungsbereiche
- **P2P-Netzwerk**: `src/network.rs` - Peer-Discovery implementieren
- **Tor-Integration**: `src/tor.rs` - SOCKS5-Proxy vervollständigen
- **QR-Code**: `src/discovery.rs` - QR-Code-Funktionalität hinzufügen
- **Discovery**: `src/discovery.rs` - Peer-Management vervollständigen

## 🐛 **Issue Reporting**

### Fehler melden
- Fehlerbeschreibung, Repro‑Schritte, Logs
- Erwartetes vs. tatsächliches Verhalten
- Umgebung (OS, Rust Version)

### Feature-Requests
- Beschreibung des gewünschten Features
- Begründung und Anwendungsfall
- Priorität (niedrig/mittel/hoch)

## 📚 **Weitere Dokumentation**

- **Projektstatus**: [docs/PROJECT_STATUS_ACTUAL.md](docs/PROJECT_STATUS_ACTUAL.md)
- **Detaillierte Roadmap**: [docs/ROADMAP_DETAILED.md](docs/ROADMAP_DETAILED.md)
- **Architektur**: [docs/architecture.md](docs/architecture.md)
- **API**: [docs/API.md](docs/API.md)
- **Installation**: [docs/INSTALL.md](docs/INSTALL.md)

## 🤝 **Community**

- Diskutieren Sie Änderungen in Issues vor der Implementierung
- Helfen Sie anderen Entwicklern bei Fragen
- Teilen Sie Ihr Wissen und Ihre Erfahrungen

---

**Vielen Dank für Ihren Beitrag zu Brezn!** 🚀
