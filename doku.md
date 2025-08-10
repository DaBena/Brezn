# Brezn - Projektdokumentation

**Dezentrale Feed-App (wie Jodel/X) mit optionaler Tor‑Anonymisierung.**

Nutzer posten anonyme Beiträge in einen öffentlichen Feed. Alle Netzwerk‑Teilnehmer sehen alle Posts. Komplett dezentral, keine Server, Open Source (Ziel: F‑Droid).

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
│   ├── network.rs          # P2P-Netzwerk
│   ├── discovery.rs        # Discovery (UDP/QR)
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
}
```

## 🔒 Rechtssicherheit & Anonymität
- Optionaler Tor SOCKS5 Proxy (lokal, Standard 9050)
- Keine Speicherung echter Identitäten; Pseudonyme sind wechselbar
- Lokale Persistenz in SQLite; Transport‑Anonymisierung via Tor möglich

## 🔐 Anonyme Entwicklung (Git)
Ziel: Keine privaten E‑Mails in Commits/History.

Empfehlungen:
- GitHub: Settings → Emails
  - „Keep my email addresses private" aktivieren
  - „Block command line pushes that expose my email" aktivieren
- In diesem Repo (lokal):
  ```bash
  git config user.name "Anon Dev"
  git config user.email "anonymous@placeholder.com"
  git config user.useConfigOnly true
  ```
- Global (optional):
  ```bash
  git config --global user.name "Anon Dev"
  git config --global user.email "anonymous@placeholder.com"
  git config --global user.useConfigOnly true
  git config --global core.hooksPath ~/.git-hooks
  ```
- Hooks (empfohlen):
  - `commit-msg`: blockiert Nicht‑Noreply‑E‑Mails und entfernt unsichere Trailer (`Co-authored-by`, `Signed-off-by`, …)
  - `pre-push`: verweigert Pushes, wenn in Autor/Committer oder Trailern Nicht‑Noreply‑E‑Mails vorkommen
- Prüfen:
  ```bash
  git var GIT_AUTHOR_IDENT
  git var GIT_COMMITTER_IDENT
  git log -1 --pretty=fuller
  ```
- Historie bereinigen (falls nötig):
  - `mailmap.txt` pflegen und ausführen: `git filter-repo --mailmap mailmap.txt --use-mailmap`

## 🚀 Entwicklungsprioritäten
### MVP (aktuell)
- [x] Rust Backend mit SQLite
- [x] Tor SOCKS5 Integration (optional)
- [x] P2P‑Netzwerk Grundlagen
- [x] Einfache Web‑UI
- [ ] QR‑Code Features (Parsing/Join weiter ausbauen)
- [ ] Netzwerk‑Discovery (Automatisierung)

### Backlog (später)
- [ ] Erweiterte Sicherheitsfeatures (Anti‑Spam, Rate‑Limiting)
- [ ] React Native Frontend
- [ ] Mobile Builds (Android/iOS)
- [ ] F‑Droid Release

## 🧪 Erfolgs‑Kriterien
- [ ] Zwei Instanzen tauschen Posts über Tor aus
- [ ] Feed‑Konsistenz zwischen Peers
- [ ] QR‑Code Netzwerkbeitritt funktional
- [ ] Stabile Tor‑Verbindungen

## 📚 Weiterführende Dokumente
- Installation: `docs/INSTALL.md`
- API‑Referenz: `docs/API.md`
- Architektur: `docs/architecture.md`
- Mobile Setup: `docs/mobile-setup.md`
- Roadmap: `docs/ROADMAP_DETAILED.md`

## 🛠️ Entwickeln
```bash
cd brezn
cargo build
cargo test
```

Lizenz: siehe `LICENSE`.
