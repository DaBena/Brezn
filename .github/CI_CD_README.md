# 🚀 CI/CD Pipeline Documentation

## 📋 Übersicht

Diese Repository verwendet GitHub Actions für Continuous Integration und Deployment. Alle Workflows sind so konfiguriert, dass sie die E-Mail-Schutz-Regeln befolgen und eine sichere, automatisierte Pipeline bereitstellen.

## 🔧 Verfügbare Workflows

### 1. **CI Pipeline** (`.github/workflows/ci-pipeline.yml`)
**Trigger:** Push zu `main`, `develop`, `feature/*` Branches und Pull Requests

**Jobs:**
- **Code-Qualität**: Clippy, rustfmt, Security Audit
- **Rust Build & Test**: Multi-Target Builds mit Features (default, full, minimal)
- **Web Build & Test**: Node.js Build und Tests
- **Mobile Build & Test**: React Native Build und Tests
- **Integration Tests**: End-to-End Tests
- **Performance Tests**: Performance-Benchmarks

### 2. **Android APK Build** (`.github/workflows/android-apk.yml`)
**Trigger:** Push zu `main` und manueller Dispatch

**Features:**
- Multi-Architecture Support (ARM64, ARMv7, x86_64)
- Debug und Release Builds
- Automatische NDK-Konfiguration
- Rust Library Cross-Compilation

### 3. **iOS Archive Build** (`.github/workflows/ios-archive.yml`)
**Trigger:** Manueller Dispatch

**Features:**
- Universal Binary Builds (ARM64 + x86_64)
- CocoaPods Integration
- Rust Library Cross-Compilation

### 4. **Docker Build** (`.github/workflows/docker-build.yml`)
**Trigger:** Push zu `main`, `develop` und Pull Requests

**Features:**
- Multi-Architecture Images (AMD64, ARM64)
- GitHub Container Registry Integration
- Build Cache Optimierung

### 5. **Deployment** (`.github/workflows/deployment.yml`)
**Trigger:** Nach erfolgreicher CI Pipeline

**Environments:**
- **Staging**: Automatisch bei Push zu `develop`
- **Production**: Automatisch bei Push zu `main`

### 6. **Email Protection** (`.github/workflows/email-protection.yml`)
**Trigger:** Alle Commits und Pull Requests

**Schutz:**
- Überprüfung auf private E-Mail-Adressen
- Validierung der Git-Konfiguration
- Blockierung von unsicheren Commits

## 🚨 E-Mail-Schutz-Regeln

### ❌ **Blockierte E-Mail-Provider:**
- Gmail, Web.de, GMX, T-Online
- Freenet, Arcor, 1&1
- Vodafone, Telekom, T-Mobile
- O2, E-Plus, AOL, iCloud
- ProtonMail, Tutanota, Posteo, Mailbox.org

### ✅ **Erlaubte E-Mail-Adressen:**
- `brezn-dev@noreply.github.com`
- `user@placeholder.com`
- `test@example.com`

## 🔧 Konfiguration

### Rust Features
```toml
[features]
default = ["web", "mobile"]
full = ["web", "mobile", "p2p", "tor", "encryption"]
minimal = ["core"]
web = ["actix-web", "qrcode", "image", "base64"]
mobile = ["uniffi", "uniffi_bindgen"]
p2p = ["get_if_addrs", "sha2"]
tor = ["sodiumoxide"]
encryption = ["ring", "sodiumoxide"]
core = ["rusqlite", "serde", "serde_json", "tokio", "uuid", "chrono", "anyhow", "thiserror"]
```

### Build Targets
- **Linux**: `x86_64-unknown-linux-gnu`, `aarch64-unknown-linux-gnu`
- **Android**: `aarch64-linux-android`, `armv7-linux-androideabi`, `x86_64-linux-android`
- **iOS**: `aarch64-apple-ios`, `x86_64-apple-ios`

## 🚀 Verwendung

### Lokale Entwicklung
```bash
# Git-Konfiguration für E-Mail-Schutz
git config user.email "brezn-dev@noreply.github.com"
git config user.name "Brezn Developer"

# Rust Build mit Features
cargo build --features full
cargo test --features mobile

# Web Build
cd brezn/web
npm install
npm run build

# Mobile Build
cd brezn/mobile
npm install
npm run test:ci
```

### CI/CD Pipeline starten
```bash
# Feature Branch erstellen
git checkout -b feature/neue-funktion

# Änderungen committen
git add .
git commit -m "feat: neue Funktion hinzugefügt"

# Push und PR erstellen
git push origin feature/neue-funktion
```

## 📊 Monitoring

### GitHub Actions Dashboard
- **URL**: `https://github.com/[username]/[repo]/actions`
- **Status**: Alle Workflow-Runs und deren Ergebnisse
- **Logs**: Detaillierte Build- und Test-Logs

### Artifacts
- **Rust Builds**: `rust-build-{target}-{features}`
- **Web Builds**: `web-build`
- **Mobile Builds**: `mobile-build`
- **Docker Images**: `ghcr.io/[username]/[repo]:[tag]`

## 🔍 Troubleshooting

### Häufige Probleme

#### 1. **Feature Build schlägt fehl**
```bash
# Überprüfen Sie verfügbare Features
cargo features --list

# Build mit minimalen Features
cargo build --features minimal
```

#### 2. **Android Build schlägt fehl**
- Stellen Sie sicher, dass das Android-Projekt existiert
- Überprüfen Sie die NDK-Version
- Validiere die Rust-Targets

#### 3. **E-Mail-Schutz schlägt fehl**
```bash
# Git-Konfiguration überprüfen
git config --list | grep user

# Korrekte Konfiguration setzen
git config user.email "brezn-dev@noreply.github.com"
git config user.name "Brezn Developer"
```

### Debug-Modi
```bash
# Rust mit Debug-Informationen
RUST_BACKTRACE=1 cargo build

# GitHub Actions Debug
# Setze Repository Secret: ACTIONS_STEP_DEBUG=true
```

## 🔐 Sicherheit

### Branch Protection
- **main**: Nur über Pull Requests
- **develop**: Nur über Pull Requests
- **feature/***: Direkte Pushes erlaubt

### Secrets
- `DOCKERHUB_USERNAME`: Docker Hub Benutzername
- `DOCKERHUB_TOKEN`: Docker Hub Access Token
- `GITHUB_TOKEN`: Automatisch von GitHub bereitgestellt

## 📈 Performance-Optimierungen

### Caching
- **Cargo**: `~/.cargo/registry`, `~/.cargo/git`
- **Node.js**: `npm` Cache
- **Docker**: Buildx Cache

### Parallelisierung
- **Matrix Builds**: Multi-Target, Multi-Feature
- **Job Dependencies**: Optimierte Ausführungsreihenfolge
- **Resource Sharing**: Gemeinsame Build-Artefakte

## 🆘 Support

### Bei Problemen
1. **GitHub Issues**: Erstellen Sie ein Issue mit Workflow-Logs
2. **Actions Logs**: Überprüfen Sie die detaillierten Build-Logs
3. **Repository Admins**: Kontaktieren Sie das Team bei kritischen Problemen

### Nützliche Links
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Rust Cargo Features](https://doc.rust-lang.org/cargo/reference/features.html)
- [React Native CI/CD](https://reactnative.dev/docs/publishing)
- [Docker Multi-Architecture](https://docs.docker.com/build/building/multi-platform/)