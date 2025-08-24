# Brezn - Projektdokumentation

**Dezentrale Feed-App (wie Jodel/X) mit optionaler Tor‑Anonymisierung.**

Nutzer posten anonyme Beiträge in einen öffentlichen Feed. Alle Netzwerk‑Teilnehmer sehen alle Posts. Komplett dezentral, keine Server, Open Source (Ziel: F‑Droid).

## 🚨 **WICHTIG: Projektstatus korrigiert (19. Dezember 2024)**

**Der ursprüngliche Fortschritt von 70% war irreführend.** Das Projekt ist tatsächlich zu **45% abgeschlossen**.

**Grund**: Platzhalter-Implementierungen wurden als funktional bewertet, obwohl sie keine echte Funktionalität bieten.

**Für den aktuellen, ehrlichen Projektstatus siehe**: [`docs/PROJECT_STATUS_ACTUAL.md`](docs/PROJECT_STATUS_ACTUAL.md)

---

## 🛠️ Tech‑Stack (aktuell)
- Backend: Rust (Edition 2021)
- HTTP/API: Actix‑Web (Port 8080)
- P2P: TCP über Tokio (separater P2P‑Port, Standard 8888)
- Netzwerk: optional über Tor SOCKS5 Proxy
- Krypto: ring, sodiumoxide
- DB: rusqlite
- Plattformen: Linux, Windows (Mobile iOS/Android in Arbeit)

## ⚡ Quickstart (Desktop)
Voraussetzungen: Rust Toolchain installiert (rustup), optional Tor Dienst.

```bash
# Bauen und starten
cd brezn
cargo run --bin brezn-server

# Browser öffnen
# -> http://localhost:8080
```

### API Beispiele
```bash
# Post erstellen
curl -X POST http://localhost:8080/api/posts \
  -H 'Content-Type: application/json' \
  -d '{"content":"Hallo Brezn","pseudonym":"Sepp"}'

# Posts abrufen
curl http://localhost:8080/api/posts

# Netzwerkstatus abrufen
curl http://localhost:8080/api/network/status

# Netzwerk an/aus (P2P)
curl -X POST http://localhost:8080/api/network/toggle

# Tor an/aus
curl -X POST http://localhost:8080/api/tor/toggle

# Aktuelle Config abrufen
curl http://localhost:8080/api/config

# QR-Code für Peer-Join generieren
curl http://localhost:8080/api/network/qr

# QR-Code Daten parsen
curl -X POST http://localhost:8080/api/network/parse-qr \
  -H 'Content-Type: application/json' \
  -d '{"qr_data":"..."}'
```

**⚠️ Hinweis**: Netzwerk-Features (QR-Code, Tor, P2P) sind derzeit nur Platzhalter und nicht funktional.

Hinweise:
- HTTP UI/API läuft auf Port 8080.
- Der P2P‑Port (Standard 8888) ist separat und wird für Peer‑Verbindungen genutzt.
- Tor ist optional. Für Betrieb über Tor muss ein lokaler Tor‑Dienst laufen (SOCKS auf 9050).

## 🏗️ Projektstruktur
```
brezn/
├── src/
│   ├── lib.rs              
│   ├── main.rs             # Actix-Web Server + API
│   ├── database.rs         # SQLite-Operationen
│   ├── crypto.rs           # Verschlüsselung
│   ├── network.rs          # P2P-Netzwerk (PLATZHALTER)
│   ├── discovery.rs        # Discovery (UDP/QR) (PLATZHALTER)
│   └── types.rs            # Datenstrukturen (Post, Config, ...)
├── web/
│   └── index.html          # Einfache Web-UI (wird ausgeliefert)
├── Cargo.toml
└── README.md
```

## 📋 Datenstrukturen (Auszug)
```rust
#[derive(Serialize, Deserialize, Clone)]
pub struct Post {
    pub id: Option<i64>,
    pub content: String,
    pub timestamp: u64,
    pub pseudonym: String,
    pub node_id: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct Config {
    pub auto_save: bool,
    pub max_posts: usize,
    pub default_pseudonym: String,
    pub network_enabled: bool,
    pub network_port: u16,     // P2P-Port
    pub tor_enabled: bool,
    pub tor_socks_port: u16,   // i.d.R. 9050
    pub discovery_enabled: bool,
    pub discovery_port: u16,   // Discovery-Port
    pub sync_interval: u64,    // Sync-Intervall in Sekunden
    pub max_peers: usize,      // Maximale Peer-Anzahl
    pub heartbeat_interval: u64, // Heartbeat-Intervall in Sekunden
    pub post_validation: PostValidationConfig,
}
```

## 🚨 **Aktuelle Einschränkungen (19. Dezember 2024)**

### **Funktional (45%)**
- ✅ Posts erstellen und anzeigen
- ✅ Lokale Datenbank
- ✅ Web-UI
- ✅ CLI-Interface
- ✅ Krypto-Module
- ✅ Konfigurationsmanagement

### **Platzhalter (35%)**
- ⚠️ P2P-Netzwerk: Nur Grundstruktur, keine echte Peer-Kommunikation
- ⚠️ Tor-Integration: Nur Basis-Setup, keine funktionale SOCKS5-Integration
- ⚠️ QR-Code: Nur Platzhalter, keine echte Funktionalität
- ⚠️ Discovery: Nur Grundstruktur, keine echte Peer-Findung

### **Nicht implementiert (20%)**
- ❌ Echte Peer-Discovery
- ❌ Post-Synchronisation
- ❌ Netzwerk-Traffic über Tor
- ❌ QR-Code-Peer-Beitritt

## 📚 **Dokumentation**

### **Aktuelle, ehrliche Bewertung**
- [`docs/PROJECT_STATUS_ACTUAL.md`](docs/PROJECT_STATUS_ACTUAL.md) - Ehrliche Projektbewertung
- [`docs/ROADMAP_DETAILED.md`](docs/ROADMAP_DETAILED.md) - Korrigierte Roadmap (5 Wochen MVP)
- [`docs/PHASE2_PROGRESS.md`](docs/PHASE2_PROGRESS.md) - Aktualisierter Fortschritt

### **Technische Dokumentation**
- [`docs/API.md`](docs/API.md) - API-Referenz mit Funktionsstatus
- [`docs/architecture.md`](docs/architecture.md) - Netzwerkarchitektur
- [`docs/INSTALL.md`](docs/INSTALL.md) - Installationsanleitung

### **Entwicklungsdokumentation**
- [`docs/REPOSITORY_SECURITY_SETUP.md`](docs/REPOSITORY_SECURITY_SETUP.md) - Sicherheitssetup
- [`docs/mobile-setup.md`](docs/mobile-setup.md) - Mobile-Entwicklung
- [`CONTRIBUTING.md`](../CONTRIBUTING.md) - Beitragsrichtlinien

## 🎯 **Nächste Schritte**

### **Priorität 1: Platzhalter ersetzen (4-5 Wochen)**
1. **P2P-Netzwerk** von Platzhalter zu funktional
2. **Tor-Integration** von Basis-Setup zu funktional
3. **QR-Code** von Platzhalter zu funktional
4. **Discovery** von Platzhalter zu funktional

### **Priorität 2: Produktionsreife (4-5 Wochen)**
1. Sicherheit & Robustheit
2. Mobile Foundation

### **Priorität 3: Deployment (2-3 Wochen)**
1. F-Droid Release
2. Desktop-Distribution

## 📊 **Projektstatus**

- **MVP-Fortschritt**: 45% abgeschlossen (KORRIGIERT)
- **Nächster Meilenstein**: Funktionale P2P-Netzwerk (2 Wochen)
- **Ziel**: Vollständiges MVP in 5 Wochen (KORRIGIERT)
- **Hauptproblem**: Platzhalter-Implementierungen müssen ersetzt werden

---

**Für detaillierte Informationen siehe die aktualisierten Dokumentationen in [`docs/`](docs/)**
