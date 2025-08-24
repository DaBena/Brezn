# 📚 Brezn Dokumentation

Willkommen zur umfassenden Dokumentation des Brezn-Projekts! Diese Dokumentation deckt alle Aspekte des Projekts ab, von der Installation bis zur Entwicklung.

## 🚀 Schnellstart

### Für Benutzer
- **[Installation Guide](RELEASE_GUIDE.md#installation)** - Schnelle Installation und Einrichtung
- **[API Referenz](API.md)** - Alle verfügbaren API-Endpoints
- **[Troubleshooting](RELEASE_GUIDE.md#troubleshooting)** - Häufige Probleme und Lösungen

### Für Entwickler
- **[Developer Quickstart](DEVELOPER_QUICKSTART.md)** - Entwicklungsumgebung einrichten
- **[Architektur](architecture.md)** - System-Architektur und Design
- **[CI/CD Pipeline](CI_CD_PIPELINE.md)** - Build- und Deployment-Prozesse

## 📖 Dokumentationsübersicht

### 🆕 **Phase 2 Features (Neu)**

#### **P2P-Netzwerk & Discovery**
- **[Discovery-System](discovery.md)** - Vollständige Dokumentation des Peer-Discovery-Systems
- **[API - Neue P2P-Endpoints](API.md#neue-p2p-endpoints-phase-2)** - Alle neuen P2P-API-Endpoints
- **[Netzwerk-Topologie](discovery.md#netzwerk-topologie-management)** - Segment-basierte Netzwerkstruktur

#### **Tor-Integration**
- **[Tor-Integration](tor_integration.md)** - Vollständige SOCKS5-Proxy-Integration
- **[Tor-API](API.md#erweiterte-tor-integration-api)** - Erweiterte Tor-API-Endpoints
- **[Circuit-Management](tor_integration.md#circuit-management)** - Automatische Circuit-Rotation

#### **QR-Code-System**
- **[QR-Code-Integration](discovery.md#qr-code-integration)** - Peer-Beitritt über QR-Codes
- **[QR-Code-API](API.md#discovery-system-api)** - QR-Code-Generierung und -Parsing

### 🔧 **Entwicklung & DevOps**

#### **CI/CD Pipeline**
- **[Haupt-CI-Pipeline](CI_CD_PIPELINE.md#haupt-ci-pipeline)** - Parallele Entwicklung und Tests
- **[Mobile Builds](CI_CD_PIPELINE.md#mobile-build-pipelines)** - Android & iOS Build-Pipelines
- **[Docker Builds](CI_CD_PIPELINE.md#docker-build-pipeline)** - Multi-Platform Docker Images
- **[Security Scans](CI_CD_PIPELINE.md#sicherheits-pipeline)** - Automatische Sicherheitsprüfungen
- **[Performance Tests](CI_CD_PIPELINE.md#performance-test-pipeline)** - Performance-Benchmarks

#### **Deployment & Operations**
- **[Release Guide](RELEASE_GUIDE.md)** - Kompletter Release-Prozess
- **[Installation](RELEASE_GUIDE.md#installation)** - Alle Installationsmethoden
- **[Deployment](RELEASE_GUIDE.md#deployment)** - Production & Staging Deployments
- **[Monitoring](RELEASE_GUIDE.md#monitoring--logging)** - Logging und Health Checks

### 📱 **Plattformen**

#### **Mobile Apps**
- **[Android Setup](RELEASE_GUIDE.md#android-apk-installation)** - APK-Installation und Build
- **[iOS Setup](RELEASE_GUIDE.md#ios-installation)** - iOS-Development und Distribution
- **[Mobile Integration](mobile-setup.md)** - React Native Setup

#### **Web & Desktop**
- **[Web Interface](DEVELOPER_QUICKSTART.md#web-development)** - Web-Entwicklung
- **[CLI Tools](DEVELOPER_QUICKSTART.md#cli-development)** - Command-Line Interface

### 🔒 **Sicherheit & Konfiguration**

#### **Sicherheit**
- **[Repository Security](REPOSITORY_SECURITY_SETUP.md)** - Git-Schutz und E-Mail-Schutz
- **[Tor-Sicherheit](tor_integration.md#sicherheitsaspekte)** - Anonymität und Privatsphäre
- **[Firewall-Konfiguration](RELEASE_GUIDE.md#firewall-konfiguration)** - Netzwerk-Sicherheit

#### **Konfiguration**
- **[Server-Konfiguration](RELEASE_GUIDE.md#konfiguration)** - Konfigurationsdateien
- **[Umgebungsvariablen](RELEASE_GUIDE.md#deployment)** - Environment-Setup
- **[Docker-Konfiguration](RELEASE_GUIDE.md#docker-compose)** - Container-Konfiguration

## 🎯 **Verwendung nach Anwendungsfall**

### **Ich möchte Brezn installieren**
1. [Installation Guide](RELEASE_GUIDE.md#installation) lesen
2. [Docker](RELEASE_GUIDE.md#docker-installation) oder [Source](RELEASE_GUIDE.md#source-code-installation) wählen
3. [Konfiguration](RELEASE_GUIDE.md#konfiguration) anpassen

### **Ich möchte das P2P-Netzwerk nutzen**
1. [Discovery-System](discovery.md) verstehen
2. [P2P-API](API.md#neue-p2p-endpoints-phase-2) verwenden
3. [QR-Codes](discovery.md#qr-code-integration) für Peer-Beitritt nutzen

### **Ich möchte Tor aktivieren**
1. [Tor-Integration](tor_integration.md) einrichten
2. [Tor-API](API.md#erweiterte-tor-integration-api) verwenden
3. [Circuit-Management](tor_integration.md#circuit-management) konfigurieren

### **Ich möchte entwickeln**
1. [Developer Quickstart](DEVELOPER_QUICKSTART.md) durcharbeiten
2. [Architektur](architecture.md) verstehen
3. [CI/CD Pipeline](CI_CD_PIPELINE.md) nutzen

### **Ich möchte deployen**
1. [Release Guide](RELEASE_GUIDE.md) folgen
2. [Deployment-Skripte](RELEASE_GUIDE.md#deployment) verwenden
3. [Monitoring](RELEASE_GUIDE.md#monitoring--logging) einrichten

## 📊 **Projekt-Status**

### **Phase 2 - Abgeschlossen ✅**
- [x] **P2P-Netzwerk** - Vollständig implementiert
- [x] **Discovery-System** - Peer-Entdeckung funktional
- [x] **Tor-Integration** - SOCKS5-Proxy vollständig
- [x] **QR-Code-System** - Peer-Beitritt implementiert
- [x] **CI/CD Pipeline** - Parallele Entwicklung
- [x] **Performance-Tests** - Automatische Benchmarks

### **Nächste Schritte 🚀**
- [ ] **Mobile Apps** - React Native Integration
- [ ] **Web Interface** - Moderne UI/UX
- [ ] **Monitoring** - Grafana Dashboards
- [ ] **Scaling** - Kubernetes Deployment

## 🔍 **Schnelle Referenz**

### **Wichtige Ports**
- **8080** - HTTP API
- **8888** - P2P Network & Discovery
- **9050** - Tor SOCKS5 Proxy

### **Häufige Befehle**
```bash
# Brezn starten
cargo run --release

# Tests ausführen
cargo test

# Performance-Tests
cargo criterion

# Docker starten
docker-compose up -d

# Status prüfen
curl http://localhost:8080/api/network/status
```

### **Konfigurationsdateien**
- `config/brezn.toml` - Hauptkonfiguration
- `docker-compose.yml` - Docker-Setup
- `.github/workflows/` - CI/CD-Pipelines

## 🤝 **Beitragen**

### **Dokumentation verbessern**
1. [Issues](https://github.com/brezn-project/brezn/issues) für Dokumentationsprobleme erstellen
2. [Pull Requests](https://github.com/brezn-project/brezn/pulls) für Verbesserungen einreichen
3. [Discussions](https://github.com/brezn-project/brezn/discussions) für Fragen nutzen

### **Entwicklung**
1. [Contributing Guide](../CONTRIBUTING.md) lesen
2. [Developer Quickstart](DEVELOPER_QUICKSTART.md) durcharbeiten
3. [Code of Conduct](../CODE_OF_CONDUCT.md) befolgen

## 📞 **Support & Hilfe**

### **Community-Ressourcen**
- **GitHub Issues**: [Probleme melden](https://github.com/brezn-project/brezn/issues)
- **Discussions**: [Fragen stellen](https://github.com/brezn-project/brezn/discussions)
- **Wiki**: [Detaillierte Anleitungen](https://github.com/brezn-project/brezn/wiki)

### **Dokumentation**
- **API-Dokumentation**: [Alle Endpoints](API.md)
- **Troubleshooting**: [Häufige Probleme](RELEASE_GUIDE.md#troubleshooting)
- **Beispiele**: [Code-Beispiele](DEVELOPER_QUICKSTART.md#examples)

---

**Entwickelt für das Brezn-Projekt** 📚🚀

*Letzte Aktualisierung: Phase 2 abgeschlossen - Alle P2P-Features und CI/CD-Pipelines funktional*