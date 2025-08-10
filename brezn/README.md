# Brezn (Rust Crate)

Dieses Verzeichnis enthält das Rust‑Backend von Brezn.

- Hauptdokumentation, Architektur, Roadmap: siehe Repository‑Root `README.md` und `docs/`.
- Die Web‑UI wird aus `web/index.html` ausgeliefert.
- Binärprogramme: `brezn-server` (HTTP/API+UI), `brezn-cli` (CLI Tools, experimentell).

## Entwickeln & Starten
```bash
cd brezn
cargo build
cargo run --bin brezn-server
# -> http://localhost:8080
```

## Tests
```bash
cargo test
```

Weitere Endpunkte siehe `docs/API.md`.

Hinweis: Für reproduzierbare Builds wird `Cargo.lock` versioniert. 