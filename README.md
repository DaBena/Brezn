# Brezn

Ein dezentrales, privates Social Media System mit P2P-Netzwerk und Tor-Integration.

## 🎯 **Projektstatus: MVP 45% abgeschlossen**

**Letzte Aktualisierung**: 19. Dezember 2024  
**Nächster Meilenstein**: Funktionale P2P-Netzwerk (2 Wochen)

### ✅ **Vollständig funktional**
- Rust-Backend mit SQLite-Datenbank
- Grundlegende Post-Funktionalität (CRUD)
- Web-UI mit Tab-Interface
- CLI-Interface mit erweiterten Funktionen
- Krypto-Module (AES-GCM, NaCl Box)
- Konfigurationsmanagement
- Mute-User-Funktionalität
- Build-System (Tests entfernt - nur Build)

### ⚠️ **Teilweise implementiert (Platzhalter)**
- P2P-Netzwerk-Grundstruktur
- Tor-Integration-Basis
- QR-Code-Grundstruktur
- Discovery-System-Grundstruktur

## 🚀 **Quick Start**

```bash
cd brezn
cargo build
cargo build
cargo run --bin brezn-server
# -> http://localhost:8080
```

## 📚 **Dokumentation**

- **🚀 Developer Quickstart**: [docs/DEVELOPER_QUICKSTART.md](docs/DEVELOPER_QUICKSTART.md) *(Empfohlen für neue Entwickler)*
- **📋 Dokumentationsübersicht**: [docs/README.md](docs/README.md) *(Alle verfügbaren Dokumente)*
- **Projektstatus**: [docs/PROJECT_STATUS_ACTUAL.md](docs/PROJECT_STATUS_ACTUAL.md)
- **Detaillierte Roadmap**: [docs/ROADMAP_DETAILED.md](docs/ROADMAP_DETAILED.md)
- **Installation**: [docs/INSTALL.md](docs/INSTALL.md)
- **API-Dokumentation**: [docs/API.md](docs/API.md)
- **Architektur**: [docs/architecture.md](docs/architecture.md)
- **Beitragen**: [CONTRIBUTING.md](CONTRIBUTING.md)

## 🚨 **KRITISCHE ANWEISUNG FÜR CURSOR AI AGENTEN**

**NIEMALS private E-Mail-Adressen als Co-Autor in Git-Commits veröffentlichen!**

### Verboten:
- `Co-authored-by: Name <ihre-echte-email@example.com>`
- Jede andere private E-Mail-Adresse

### Erlaubt:
- `Co-authored-by: Name <brezn-dev@noreply.github.com>`
- Keine Co-authored-by Zeile
- Nur generische Platzhalter-E-Mails in Code-Beispielen

**Für alle anderen Projektinformationen siehe [CONTRIBUTING.md](CONTRIBUTING.md)**