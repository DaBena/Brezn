# Contributing to Brezn

Danke, dass du zu Brezn beitragen möchtest!

## Development Setup
- Rust Toolchain via `rustup`
- Optional: Tor lokal (SOCKS5 auf Port 9050)

```bash
cd brezn
cargo build
cargo test
cargo run --bin brezn-server
# -> http://localhost:8080
```

## Coding Guidelines
- Klare, beschreibende Bezeichner (keine Abkürzungen)
- Frühe Rückgaben/Guard Clauses, Fehlerfälle zuerst behandeln
- Tests für neue Kernfunktionen
- Keine überflüssigen Kommentare; „Warum“, nicht „Wie“ dokumentieren

## 🚨 WICHTIG: Keine privaten E-Mail-Adressen veröffentlichen! 🚨

Bitte beachten: `docs/GIT_PROTECTION_GUIDE.md` (Setup & Hooks zum Schutz vor E-Mail-Leaks).

**Kritische Regeln für alle Beiträge:**
- **VERÖFFENTLICHEN SIE NIEMALS private E-Mail-Adressen von Benutzern**
- **Fügen Sie NIEMALS E-Mail-Adressen als Co-Author in Git-Commits oder Pull Requests hinzu**
- **Verwenden Sie nur generische Benutzernamen ohne E-Mail-Domains**
- **Wenn E-Mail-Adressen im Code vorkommen, ersetzen Sie sie durch Platzhalter wie "user@placeholder.com"**

## Commit Messages
- Format: `type(scope): kurzbeschreibung`
  - Beispiele: `docs(readme): quickstart ergänzt`, `feat(network): ping/pong automatisiert`
- **WICHTIG:** Verwenden Sie nur den Benutzernamen ohne E-Mail
- **WICHTIG:** Fügen Sie keine Co-Authors mit E-Mail-Adressen hinzu
- Folgen Sie dem Commit-Template in `.gitmessage`

## Pull Requests
- Kleine, thematisch fokussierte Änderungen
- Beschreibung: Motivation, Änderungen, Testhinweise
- Checklist:
  - [ ] Build grün (`cargo build`, `cargo test`)
  - [ ] Docs aktualisiert (falls relevant)
  - [ ] Manuelle Tests der relevanten Pfade

## Issue Reporting
- Fehlerbeschreibung, Repro‑Schritte, Logs
- Erwartetes vs. tatsächliches Verhalten
- Umgebung (OS, Rust Version)
