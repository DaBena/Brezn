# Brezn - Dezentrale Feed-App

Eine komplett dezentrale, anonyme Feed-App wie Jodel/X mit Tor-Anonymisierung für rechtliche Absicherung. Alle Netzwerk-Teilnehmer sehen alle Posts. Komplett dezentral, keine Server, Open Source für F-Droid.

## 🥨 Features

- **Anonyme Posts**: Nutzer posten unter Pseudonymen
- **Dezentrales Netzwerk**: P2P-Netzwerk ohne zentrale Server
- **Tor-Integration**: SOCKS5 Proxy für Anonymisierung und Rechtssicherheit
- **End-to-End Verschlüsselung**: NaCl Box für sichere Kommunikation
- **Lokale Verschlüsselung**: AES-256-GCM für lokale Daten
- **Multi-Plattform**: Linux, Windows (später iOS, Android)

## 🏗️ Architektur

### Tech-Stack
- **Backend**: Rust (2021 Edition)
- **Frontend**: Einfache Web-UI (HTML/CSS/JS) - später React Native
- **Netzwerk**: Tor SOCKS5 Proxy (für Rechtssicherheit)
- **Krypto**: ring + sodiumoxide
- **DB**: rusqlite
- **Plattformen**: Linux, Windows (später iOS, Android)

### Komponenten

```
brezn/
├── src/
│   ├── lib.rs          # Hauptbibliothek mit FFI
│   ├── types.rs        # Datenstrukturen (Post, Config, TorProxy)
│   ├── database.rs     # SQLite-Operationen
│   ├── crypto.rs       # Verschlüsselung
│   └── network.rs      # P2P-Netzwerk
├── Cargo.toml          # Rust-Dependencies
├── index.html          # Einfache Web-UI
└── README.md
```

## 🔒 Rechtssicherheit & Anonymität

### Tor SOCKS5 Integration (Priorität 1)
- **Störerhaftung**: Tor-Integration umgeht rechtliche Risiken für Nutzer
- **Anonymität**: Keine Logs von Nutzer-IPs
- **Rechtssicherheit**: Alle Verbindungen über Tor für rechtliche Absicherung

### Sicherheitsfeatures (Backlog)
- Anti-Spam-Signaturen
- Rate-Limiting
- Sybil-Attack-Schutz
- **Begründung**: MVP wird von wenigen Nutzern gesehen, Sicherheit später

## 🚀 Setup

### Rust Backend

```bash
cd brezn
cargo build
cargo test
```

### Web-UI (Aktuell)

```bash
# Einfache HTML/CSS/JS UI
# Später: React Native Frontend
```

## 🔧 Entwicklung

### Rust Backend

Das Backend ist als Library konfiguriert und bietet FFI-Funktionen für Frontend-Integration:

```rust
// FFI-Funktionen
brezn_init() -> *mut BreznApp
brezn_free(app: *mut BreznApp)
brezn_add_post(app, content, pseudonym) -> i64
brezn_get_posts_json(app, limit) -> *mut i8
```

### Datenstrukturen

```rust
struct Post {
    id: Option<i64>,
    content: String,
    timestamp: u64,
    pseudonym: String,
    node_id: Option<String>,
}

struct Config {
    auto_save: bool,
    max_posts: usize,
    default_pseudonym: String,
    network_enabled: bool,
    network_port: u16,
    tor_enabled: bool,
    tor_socks_port: u16,
}
```

### Verschlüsselung

- **Lokale Daten**: AES-256-GCM
- **Netzwerk-Kommunikation**: NaCl Box (X25519 + ChaCha20-Poly1305)
- **Hashing**: SHA-256

### Netzwerk

- **Protokoll**: P2P über TCP
- **Anonymisierung**: Tor SOCKS5 Proxy (für Rechtssicherheit)
- **Nachrichten**: JSON-basiert mit Längen-Präfix

## 🔒 Sicherheit

- **Anonymität**: Tor-Integration für IP-Anonymisierung
- **Verschlüsselung**: End-to-End für alle Nachrichten
- **Lokale Sicherheit**: Verschlüsselte SQLite-Datenbank
- **Pseudonyme**: Keine echten Identitäten
- **Rechtssicherheit**: Tor schützt vor Störerhaftung

## 📱 Frontend (Aktuell)

### Web-UI Features:
- **Feed-Ansicht**: Alle Posts chronologisch
- **Post-Erstellung**: Anonyme Beiträge
- **Einstellungen**: Tor, Pseudonym, Netzwerk
- **Offline-Funktionalität**: Lokale Speicherung

### Später: React Native App
- Mobile-optimierte UI
- Native Performance
- Cross-Platform (iOS/Android)

## 🛠️ Build

### Rust Library

```bash
cargo build --release
```

### Web-UI

```bash
# Einfache HTML/CSS/JS
# Später: React Native Builds
```

## 📄 Lizenz

Open Source - siehe LICENSE Datei.

## 🤝 Beitragen

1. Fork das Repository
2. Erstelle einen Feature Branch
3. Committe deine Änderungen
4. Push zum Branch
5. Erstelle einen Pull Request

## 🐛 Bekannte Probleme

- Tor-Integration noch in Entwicklung
- P2P-Netzwerk Discovery fehlt
- React Native UI noch nicht implementiert

## 📋 Roadmap

### MVP (Aktuell)
- [x] Rust Backend mit SQLite
- [x] Verschlüsselung (AES + NaCl)
- [x] P2P-Netzwerk Grundlagen
- [x] Tor-Integration
- [x] Einfache Web-UI
- [ ] QR-Code Features
- [ ] Netzwerk-Discovery

### Backlog (Später)
- [ ] Erweiterte Sicherheitsfeatures
- [ ] React Native Frontend
- [ ] Android/iOS Builds
- [ ] F-Droid Release
- [ ] Offline-Synchronisation 