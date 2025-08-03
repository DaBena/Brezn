# Brezn

## 🎯 Projektbeschreibung
**Entwickle eine dezentrale Feed-App (wie Jodel/X) mit Tor-Anonymisierung.**

Nutzer posten anonyme Beiträge in einen öffentlichen Feed. Alle Netzwerk-Teilnehmer sehen alle Posts. Komplett dezentral, keine Server, Open Source für F-Droid.

## 🛠️ Tech-Stack (AKTUELL)
```
Backend: Rust (2021 Edition)
Frontend: Einfache Web-UI (HTML/CSS/JS) - später React Native
Netzwerk: Tor SOCKS5 Proxy (für Rechtssicherheit)
Krypto: ring + sodiumoxide
DB: rusqlite
Plattformen: Linux, Windows (später iOS, Android)
```

## 📱 Kernfunktionen
1. **Feed-Posts erstellen**: Text in öffentlichen Feed posten
2. **Feed anzeigen**: Alle Posts chronologisch (neueste oben)
3. **QR-Netzwerkbeitritt**: QR scannen → Feed-Netzwerk beitreten
4. **Anonyme Pseudonyme**: Wechselbare Handles, keine echten Namen
5. **Lokale Mute-Liste**: Störende Poster stummschalten
6. **Tor-Anonymisierung**: Alle Verbindungen über Tor SOCKS5-Proxy (Rechtssicherheit)

## 🏗️ Projektstruktur (AKTUELL)
```
brezn/
├── src/
│   ├── lib.rs              // Hauptbibliothek mit FFI
│   ├── types.rs            // Datenstrukturen (Post, Config, TorProxy)
│   ├── database.rs         // SQLite-Operationen
│   ├── crypto.rs           // Verschlüsselung
│   ├── network.rs          // P2P-Netzwerk
│   └── types/
│       └── feed_post.rs    // Erweiterte Feed-Post-Datentypen
├── Cargo.toml
└── index.html              // Einfache Web-UI
```

## 📋 Datenstrukturen (AKTUELL)
```rust
// Haupt-Datentyp für Posts
#[derive(Serialize, Deserialize, Clone)]
pub struct Post {
    pub id: Option<i64>,
    pub content: String,
    pub timestamp: u64,
    pub pseudonym: String,
    pub node_id: Option<String>,
}

// Konfiguration
#[derive(Serialize, Deserialize, Clone)]
pub struct Config {
    pub auto_save: bool,
    pub max_posts: usize,
    pub default_pseudonym: String,
    pub network_enabled: bool,
    pub network_port: u16,
    pub tor_enabled: bool,
    pub tor_socks_port: u16,
}
```

## 🔒 Rechtssicherheit & Anonymität
- **Tor SOCKS5 Proxy**: Alle Verbindungen über Tor für rechtliche Absicherung
- **Störerhaftung**: Tor-Integration umgeht rechtliche Risiken für Nutzer
- **Anonyme Pseudonyme**: Keine echten Identitäten, wechselbare Handles
- **Lokale Verschlüsselung**: Posts verschlüsselt gespeichert

## 🚀 Entwicklungsprioritäten

### MVP (Aktuell)
- [x] Rust Backend mit SQLite
- [x] Tor SOCKS5 Integration
- [x] P2P-Netzwerk Grundlagen
- [x] Einfache Web-UI
- [ ] QR-Code Features
- [ ] Netzwerk-Discovery

### Backlog (Später)
- [ ] Erweiterte Sicherheitsfeatures (Anti-Spam, Rate-Limiting)
- [ ] React Native Frontend
- [ ] Mobile Builds (Android/iOS)
- [ ] F-Droid Release

## ⚠️ Sicherheits-Hinweise

### Rechtssicherheit (Priorität 1)
- **Tor SOCKS5**: Muss für rechtliche Absicherung implementiert werden
- **Störerhaftung**: Tor-Integration schützt Nutzer vor rechtlichen Risiken
- **Anonymität**: Keine Logs von Nutzer-IPs

### Sicherheit vor Angriffen (Backlog)
- Anti-Spam-Signaturen
- Rate-Limiting
- Sybil-Attack-Schutz
- **Begründung**: MVP wird von wenigen Nutzern gesehen, Sicherheit später

## 🎯 MVP-Definition
**Eine funktionale App, die**:
- Posts im lokalen Feed anzeigt
- Neue Posts erstellen kann
- Posts über Tor-Netzwerk an andere Peers verteilt
- QR-Code-Netzwerkbeitritt ermöglicht
- Auf Linux/Windows Desktop läuft

**Nicht im MVP**:
- Erweiterte Sicherheitsfeatures
- Mobile-Builds
- Bilder/Umfragen (nur Text)

## 🧪 Erfolgs-Kriterien
- [ ] Zwei App-Instanzen tauschen Posts über Tor aus
- [ ] Feed-Konsistenz zwischen Peers
- [ ] QR-Code-Netzwerkbeitritt funktional
- [ ] Stabile Tor-Verbindungen
- [ ] Rechtssichere Anonymisierung

**Ziel**: Funktionaler Jodel/X-Klon ohne zentrale Server, 100% dezentral über Tor mit rechtlicher Absicherung.