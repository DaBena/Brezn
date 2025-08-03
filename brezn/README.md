# Brezn - Dezentrale Feed-App

Eine komplett dezentrale, anonyme Feed-App wie Jodel/X mit I2P-Anonymisierung. Alle Netzwerk-Teilnehmer sehen alle Posts. Komplett dezentral, keine Server, Open Source für F-Droid.

## 🥨 Features

- **Anonyme Posts**: Nutzer posten unter Pseudonymen
- **Dezentrales Netzwerk**: P2P-Netzwerk ohne zentrale Server
- **Tor-Integration**: SOCKS5 Proxy für Anonymisierung
- **End-to-End Verschlüsselung**: NaCl Box für sichere Kommunikation
- **Lokale Verschlüsselung**: AES-256-GCM für lokale Daten
- **Multi-Plattform**: Linux, Windows, iOS, Android

## 🏗️ Architektur

### Tech-Stack
- **Backend**: Rust (2021 Edition)
- **Frontend**: React Native + Capacitor
- **Netzwerk**: Tor SOCKS5 Proxy
- **Krypto**: ring + sodiumoxide
- **DB**: rusqlite + SQLCipher
- **Plattformen**: Linux, Windows, iOS, Android

### Komponenten

```
brezn/
├── src/
│   ├── lib.rs          # Hauptbibliothek mit FFI
│   ├── types.rs        # Datenstrukturen
│   ├── database.rs     # SQLite-Operationen
│   ├── crypto.rs       # Verschlüsselung
│   └── network.rs      # P2P-Netzwerk
├── Cargo.toml          # Rust-Dependencies
└── README.md
```

## 🚀 Setup

### Rust Backend

```bash
cd brezn
cargo build
cargo test
```

### React Native Frontend (Coming Soon)

```bash
# React Native App wird hier erstellt
npx react-native init BreznApp
cd BreznApp
npm install @capacitor/core @capacitor/cli
npx cap init
```

## 🔧 Entwicklung

### Rust Backend

Das Backend ist als Library konfiguriert und bietet FFI-Funktionen für React Native:

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
- **Anonymisierung**: Tor SOCKS5 Proxy
- **Nachrichten**: JSON-basiert mit Längen-Präfix

## 🔒 Sicherheit

- **Anonymität**: Tor-Integration für IP-Anonymisierung
- **Verschlüsselung**: End-to-End für alle Nachrichten
- **Lokale Sicherheit**: Verschlüsselte SQLite-Datenbank
- **Pseudonyme**: Keine echten Identitäten

## 📱 Mobile App (Coming Soon)

Die React Native App wird folgende Features haben:

- **Feed-Ansicht**: Alle Posts chronologisch
- **Post-Erstellung**: Anonyme Beiträge
- **Einstellungen**: Tor, Pseudonym, Netzwerk
- **Offline-Funktionalität**: Lokale Speicherung

## 🛠️ Build

### Rust Library

```bash
cargo build --release
```

### Mobile App

```bash
# Android
npx cap build android

# iOS
npx cap build ios
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
- Mobile UI noch nicht implementiert

## 📋 Roadmap

- [x] Rust Backend mit SQLite
- [x] Verschlüsselung (AES + NaCl)
- [x] P2P-Netzwerk Grundlagen
- [x] Tor-Integration
- [ ] React Native Frontend
- [ ] Android/iOS Builds
- [ ] F-Droid Release
- [ ] Netzwerk Discovery
- [ ] Offline-Synchronisation 