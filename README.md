# Brezn

Ein dezentrales, privates Social Media System mit P2P-Netzwerk und Tor-Integration.

## 🎯 **Projektstatus: MVP 85% abgeschlossen**

**Letzte Aktualisierung**: 19. Dezember 2024  
**Nächster Meilenstein**: Vollständige P2P-Netzwerk-Integration (1 Woche)

### ✅ **Vollständig funktional**
- Rust-Backend mit SQLite-Datenbank
- Grundlegende Post-Funktionalität (CRUD)
- Web-UI mit Tab-Interface und vollständiger JavaScript-Funktionalität
- CLI-Interface mit erweiterten Funktionen
- Krypto-Module (AES-GCM, NaCl Box)
- Konfigurationsmanagement
- Mute-User-Funktionalität
- Build-System (Tests entfernt - nur Build)
- **P2P-Netzwerk-Grundstruktur** ✅
- **Tor-Integration-Basis** ✅
- **QR-Code-Funktionalität** ✅
- **Discovery-System-Grundstruktur** ✅
- **Vollständige Web-UI mit MVP-Features** ✅

### ⚠️ **Teilweise implementiert (Funktional, aber optimierungsbedürftig)**
- P2P-Netzwerk-Performance-Optimierung
- Tor-Integration-Performance
- Discovery-System-Performance
- Netzwerk-Topologie-Visualisierung

### 🔧 **Neue MVP-Features (Vollständig implementiert)**
- **Erweiterte P2P-Status-Anzeige** mit Echtzeit-Updates
- **Tor-Status-Monitoring** mit Verbindungstests
- **QR-Code-Generierung und -Parsing** für Peer-Verbindungen
- **Netzwerk-Gesundheits-Monitoring** mit visuellen Indikatoren
- **Erweiterte Peer-Verwaltung** mit Health-Scores
- **Automatische Post-Synchronisation** zwischen Peers
- **Responsive Web-UI** mit modernem Design
- **Fehlerbehandlung und Benutzer-Feedback** mit Toast-Nachrichten
- **Konfigurationsvalidierung** und -persistierung
- **Real-time Updates** für alle Netzwerk-Komponenten

## 🚀 **Quick Start**

```bash
cd brezn
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

## 🌟 **Neue MVP-Features im Detail**

### **P2P-Netzwerk-Status**
- Echtzeit-Peer-Überwachung
- Netzwerk-Gesundheits-Scores
- Automatische Peer-Synchronisation
- Verbindungsqualitäts-Monitoring

### **Tor-Integration**
- Tor-Status-Monitoring
- Verbindungstests
- SOCKS5-Proxy-Konfiguration
- Sichere Peer-Kommunikation

### **QR-Code-System**
- Peer-Verbindungs-QR-Codes
- Automatische Peer-Erkennung
- QR-Daten-Export
- Einfache Peer-Hinzufügung

### **Web-UI-Verbesserungen**
- Responsive Design
- Real-time Updates
- Erweiterte Fehlerbehandlung
- Moderne Benutzeroberfläche

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

## 🎯 **Nächste Schritte für MVP-Vervollständigung**

1. **P2P-Netzwerk-Performance-Optimierung** (2-3 Tage)
2. **Tor-Integration-Performance-Verbesserung** (1-2 Tage)
3. **Discovery-System-Performance-Optimierung** (1-2 Tage)
4. **End-to-End-Tests** (1 Tag)
5. **Dokumentation vervollständigen** (1 Tag)

**Geschätzte Zeit bis MVP-Vervollständigung: 1 Woche**