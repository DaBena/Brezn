# Brezn

## 🎯 Projektbeschreibung
**Entwickle eine dezentrale Feed-App (wie Jodel/X) mit I2P-Anonymisierung.**

Nutzer posten anonyme Beiträge in einen öffentlichen Feed. Alle Netzwerk-Teilnehmer sehen alle Posts. Komplett dezentral, keine Server, Open Source für F-Droid.

## 🛠️ Tech-Stack (FINAL)
```
Sprache: Rust (2021 Edition)
GUI: eframe/egui 0.24+
Netzwerk: I2P (i2p-rs crate)
Krypto: ring + sodiumoxide
DB: rusqlite + SQLCipher
Plattformen: Linux, Windows, iOS, Android
```

## 📱 Kernfunktionen
1. **Feed-Posts erstellen**: Text in öffentlichen Feed posten
2. **Feed anzeigen**: Alle Posts chronologisch (neueste oben)
3. **QR-Netzwerkbeitritt**: QR scannen → Feed-Netzwerk beitreten
4. **Anonyme Pseudonyme**: Wechselbare Handles, keine echten Namen
5. **Lokale Mute-Liste**: Störende Poster stummschalten
6. **I2P-Anonymisierung**: Alle Verbindungen über I2P-Tunnel

## 🏗️ Projektstruktur
```
brezn/
├── src/
│   ├── main.rs              // App-Start
│   ├── app/                 // GUI (egui)
│   │   └── ui/feed_window.rs
│   ├── network/             // I2P + P2P
│   │   ├── i2p_client.rs
│   │   └── feed_gossip.rs
│   ├── crypto/              // Verschlüsselung
│   │   └── pseudonym.rs
│   ├── storage/             // SQLite-DB
│   │   └── feed_store.rs
│   └── types/               // Datentypen
│       └── feed_post.rs
└── Cargo.toml
```

## 📋 Datenstrukturen
```rust
// Haupt-Datentyp für Feed-Posts
#[derive(Serialize, Deserialize, Clone)]
pub struct FeedPost {
    pub id: String,              // UUID
    pub content: String,         // Verschlüsselter Text
    pub timestamp: u64,          // Unix-Timestamp
    pub sender_pseudonym: String,// z.B. "AnonymBrezn42"
    pub signature: Vec<u8>,      // Anti-Spam-Signatur
    pub ttl: u8,                // Gossip-TTL (8 → 0)
}

// Netzwerk-Einladung für QR-Codes
#[derive(Serialize, Deserialize)]
pub struct NetworkInvite {
    pub bootstrap_destinations: Vec<String>, // I2P-Adressen
    pub network_name: String,                // "Mein Feed"
}
```

## 🔄 Feed-Logik (Kernalgorithmus)
```rust
// Wie Posts sich im Netzwerk verbreiten
impl FeedGossip {
    // 1. Nutzer erstellt Post → broadcast an alle Peers
    async fn broadcast_post(post: FeedPost) {
        for peer in connected_peers {
            peer.send(post.clone()).await;
        }
    }
    
    // 2. Peer empfängt Post → prüfen & weiterleiten
    async fn handle_received_post(post: FeedPost) {
        if !already_seen(post.id) && post.ttl > 0 {
            store_in_local_feed(post.clone());
            
            // Weiterleiten mit TTL-1
            let forwarded = FeedPost { ttl: post.ttl - 1, ..post };
            broadcast_post(forwarded).await;
        }
    }
}
```

## 🖥️ GUI-Layout (egui)
```
┌─────────────────────────────────────┬─────────────┐
│ 🥨 Brezn Feed                       │ Netzwerk    │
├─────────────────────────────────────┤ Status      │
│ [Neuen Post schreiben...]           │             │
│ [📝 Posten] [🎲 Neues Pseudonym]    │ 📶 5 Peers  │
├─────────────────────────────────────┤ 📊 23 Posts │
│ 👤 AnonymBrezn42 • vor 2min         │             │
│ Das ist mein anonymer Post!         │ [QR-Code    │
├─────────────────────────────────────┤  scannen]   │
│ 👤 GeheimUser99 • vor 5min          │             │
│ Hallo Feed! [🔇 Mute]               │ [Netzwerk   │
├─────────────────────────────────────┤  erstellen] │
│ ... weitere Posts ...               │             │
└─────────────────────────────────────┴─────────────┘
```

## 🔐 Sicherheits-Grundsätze
- **Keine Server**: App läuft nur auf User-Geräten
- **I2P-Tunneling**: Alle Verbindungen anonymisiert
- **Pseudonyme**: Keine echten Namen, wechselbare Handles
- **Lokale Verschlüsselung**: Posts verschlüsselt gespeichert
- **Open Source**: Code auditierbar, F-Droid-Distribution

## 🚀 Entwicklungsschritte (für KI)

### Schritt 1: Basis-Setup
```bash
cargo new brezn
cd brezn
# Cargo.toml mit Dependencies konfigurieren
# Projektstruktur erstellen
```

### Schritt 2: Datentypen
```rust
// src/types/feed_post.rs implementieren
// Serialisierung testen
```

### Schritt 3: Lokaler Feed
```rust
// src/storage/feed_store.rs
// SQLite-Integration für Posts
// CRUD-Operationen implementieren
```

### Schritt 4: GUI-Prototype
```rust
// src/app/ui/feed_window.rs
// Feed-Liste + Post-Input mit egui
```

### Schritt 5: I2P-Integration
```rust
// src/network/i2p_client.rs
// I2P-Router starten, Destinations verwalten
```

### Schritt 6: P2P-Feed-Broadcasting
```rust
// src/network/feed_gossip.rs
// Posts zwischen Peers austauschen
```

### Schritt 7: QR-Code-Features
```rust
// QR-Generation und -Scanning
// Netzwerk-Beitritt implementieren
```

## ⚠️ Kritische Implementierungs-Hinweise

### Must-Haves für jede Komponente:
- **Error-Handling**: Alle `Result<T, E>` behandeln
- **Async/Await**: Tokio für I2P-Networking
- **No-Panic**: Keine `unwrap()` in Production
- **Crypto-Sicherheit**: Konstante-Zeit-Operationen
- **Memory-Clearing**: Sensitive Daten überschreiben

### Cargo.toml Dependencies:
```toml
[dependencies]
eframe = "0.24"          # GUI
tokio = "1.0"            # Async
i2p-rs = "0.3"           # I2P-Netzwerk
ring = "0.17"            # Kryptographie
rusqlite = "0.29"        # Datenbank
serde = "1.0"            # Serialisierung
uuid = "1.6"             # Post-IDs
qrcode = "0.14"          # QR-Codes
anyhow = "1.0"           # Error-Handling
```

### Kritische Funktionen implementieren:
1. `FeedPost::new()` - Post-Erstellung mit Crypto
2. `I2pClient::broadcast()` - P2P-Verteilung
3. `FeedStore::get_posts()` - Chronologische Feed-Anzeige
4. `NetworkInvite::from_qr()` - QR-Code-Parsing
5. `Pseudonym::generate()` - Anonyme Handles

## 🎯 MVP-Definition
**Eine funktionale App, die**:
- Posts im lokalen Feed anzeigt
- Neue Posts erstellen kann
- Posts über I2P an andere Peers verteilt
- QR-Code-Netzwerkbeitritt ermöglicht
- Auf Linux Desktop läuft

**Nicht im MVP**:
- Mobile-Builds (erst später)
- Bilder/Umfragen (nur Text)
- Reactions/Antworten
- Erweiterte Krypto-Features

## 🧪 Erfolgs-Kriterien
- [ ] Zwei App-Instanzen tauschen Posts aus
- [ ] Feed-Konsistenz zwischen Peers
- [ ] QR-Code-Netzwerkbeitritt funktional
- [ ] Stabile I2P-Verbindungen
- [ ] Intuitive Feed-GUI

**Ziel**: Funktionaler Jodel/X-Klon ohne zentrale Server, 100% dezentral über I2P.