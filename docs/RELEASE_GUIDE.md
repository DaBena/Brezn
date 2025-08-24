# 📦 Brezn Release Guide

## Übersicht

Dieser Guide beschreibt den kompletten Release-Prozess für das Brezn-Projekt, einschließlich Installation, Deployment und Troubleshooting für alle unterstützten Plattformen.

## 🚀 Release-Prozess

### Release-Versionierung
```bash
# Semantic Versioning: MAJOR.MINOR.PATCH
# Beispiel: v2.1.0
git tag -a v2.1.0 -m "Release v2.1.0: P2P-Netzwerk & Tor-Integration"
git push origin v2.1.0
```

### Release-Checkliste
- [ ] Alle Tests bestehen
- [ ] Performance-Tests erfolgreich
- [ ] Security-Scans abgeschlossen
- [ ] Dokumentation aktualisiert
- [ ] Changelog erstellt
- [ ] Release-Notes geschrieben
- [ ] GitHub Release erstellt
- [ ] Docker Images gepusht
- [ ] Mobile Apps gebaut

## 📱 Mobile Installation

### Android APK Installation

#### Voraussetzungen
- Android 7.0 (API Level 24) oder höher
- Mindestens 100MB freier Speicherplatz
- Internet-Verbindung für Updates

#### Installation
1. **APK herunterladen**
   ```bash
   # Von GitHub Releases
   wget https://github.com/brezn-project/brezn/releases/latest/download/brezn-android.apk
   
   # Oder von CI/CD Artifacts
   # Lade die passende APK für deine Architektur herunter
   ```

2. **Unbekannte Quellen aktivieren**
   - Einstellungen → Sicherheit → Unbekannte Quellen
   - Oder: Einstellungen → Apps → Spezielle App-Zugriffe → Unbekannte Apps installieren

3. **APK installieren**
   ```bash
   adb install brezn-android.apk
   # Oder über den Datei-Manager doppelklicken
   ```

#### Build von Source
```bash
# Repository klonen
git clone https://github.com/brezn-project/brezn.git
cd brezn/mobile

# Dependencies installieren
npm install

# Android Build
cd android
./gradlew assembleRelease
```

### iOS Installation

#### Voraussetzungen
- iOS 15.0 oder höher
- Xcode 14.0+ für Development
- Apple Developer Account für Distribution

#### Installation
1. **Von Source bauen**
   ```bash
   # Repository klonen
   git clone https://github.com/brezn-project/brezn.git
   cd brezn/mobile/ios
   
   # Dependencies installieren
   pod install
   
   # Xcode öffnen
   open Brezn.xcworkspace
   ```

2. **App signieren**
   - Xcode → Project Settings → Signing & Capabilities
   - Team auswählen
   - Bundle Identifier anpassen

3. **Build & Deploy**
   ```bash
   # Archive erstellen
   xcodebuild -workspace Brezn.xcworkspace \
              -scheme Brezn \
              -configuration Release \
              -archivePath Brezn.xcarchive \
              archive
   
   # IPA exportieren
   xcodebuild -exportArchive \
              -archivePath Brezn.xcarchive \
              -exportPath ./export \
              -exportOptionsPlist exportOptions.plist
   ```

## 🐳 Docker Installation

### Docker Image herunterladen
```bash
# Neueste Version
docker pull brezn/brezn:latest

# Spezifische Version
docker pull brezn/brezn:v2.1.0

# Multi-Platform Image
docker pull --platform linux/arm64 brezn/brezn:latest
```

### Docker Container starten
```bash
# Einfacher Start
docker run -d \
  --name brezn \
  -p 8080:8080 \
  -p 8888:8888 \
  brezn/brezn:latest

# Mit Volume für Persistenz
docker run -d \
  --name brezn \
  -p 8080:8080 \
  -p 8888:8888 \
  -v brezn_data:/app/data \
  brezn/brezn:latest

# Mit Umgebungsvariablen
docker run -d \
  --name brezn \
  -p 8080:8080 \
  -p 8888:8888 \
  -e TOR_ENABLED=true \
  -e DISCOVERY_ENABLED=true \
  brezn/brezn:latest
```

### Docker Compose
```yaml
# docker-compose.yml
version: '3.8'
services:
  brezn:
    image: brezn/brezn:latest
    container_name: brezn
    ports:
      - "8080:8080"  # HTTP API
      - "8888:8888"  # P2P Network
    volumes:
      - brezn_data:/app/data
      - ./config:/app/config
    environment:
      - TOR_ENABLED=true
      - DISCOVERY_ENABLED=true
      - LOG_LEVEL=info
    restart: unless-stopped
    networks:
      - brezn_network

  tor:
    image: dperson/torproxy:latest
    container_name: tor_proxy
    ports:
      - "9050:9050"  # SOCKS5
    restart: unless-stopped
    networks:
      - brezn_network

volumes:
  brezn_data:

networks:
  brezn_network:
    driver: bridge
```

```bash
# Starten
docker-compose up -d

# Logs anzeigen
docker-compose logs -f brezn

# Stoppen
docker-compose down
```

## 🔧 Source Code Installation

### Voraussetzungen
```bash
# Rust (1.75+)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env

# Node.js (18+)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Build Tools
sudo apt-get install -y build-essential pkg-config cmake
sudo apt-get install -y libssl-dev libsqlite3-dev
```

### Repository klonen
```bash
# HTTPS
git clone https://github.com/brezn-project/brezn.git
cd brezn

# SSH (mit GitHub Key)
git clone git@github.com:brezn-project/brezn.git
cd brezn
```

### Dependencies installieren
```bash
# Rust Dependencies
cargo build --release

# Web Dependencies
cd web
npm install

# Mobile Dependencies
cd ../mobile
npm install
```

### Konfiguration
```bash
# Konfigurationsdatei erstellen
cp config/brezn.example.toml config/brezn.toml

# Konfiguration anpassen
nano config/brezn.toml
```

```toml
# config/brezn.toml
[server]
host = "0.0.0.0"
port = 8080

[network]
p2p_port = 8888
discovery_enabled = true
tor_enabled = true

[tor]
socks_port = 9050
control_port = 9051
enabled = false

[discovery]
broadcast_interval = 30
peer_timeout = 300
max_peers = 50
```

## 🚀 Deployment

### Production Deployment

#### System Requirements
- **CPU**: 2+ Cores (x86_64 oder ARM64)
- **RAM**: 4GB+ (8GB empfohlen)
- **Storage**: 20GB+ SSD
- **Network**: 100Mbps+ Internet-Verbindung

#### Deployment-Skript
```bash
#!/bin/bash
# deploy.sh

set -e

echo "🚀 Deploying Brezn..."

# System aktualisieren
sudo apt-get update
sudo apt-get upgrade -y

# Dependencies installieren
sudo apt-get install -y curl wget git build-essential

# Rust installieren
if ! command -v cargo &> /dev/null; then
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source ~/.cargo/env
fi

# Repository klonen/aktualisieren
if [ -d "brezn" ]; then
    cd brezn
    git pull origin main
else
    git clone https://github.com/brezn-project/brezn.git
    cd brezn
fi

# Build
cargo build --release

# Systemd Service erstellen
sudo tee /etc/systemd/system/brezn.service > /dev/null <<EOF
[Unit]
Description=Brezn P2P Network
After=network.target

[Service]
Type=simple
User=brezn
WorkingDirectory=/home/brezn/brezn
ExecStart=/home/brezn/brezn/target/release/brezn
Restart=always
RestartSec=10
Environment=RUST_LOG=info

[Install]
WantedBy=multi-user.target
EOF

# Benutzer erstellen
sudo useradd -r -s /bin/false brezn
sudo mkdir -p /home/brezn
sudo chown brezn:brezn /home/brezn

# Service starten
sudo systemctl daemon-reload
sudo systemctl enable brezn
sudo systemctl start brezn

echo "✅ Brezn deployed successfully!"
echo "📊 Status: sudo systemctl status brezn"
echo "📝 Logs: sudo journalctl -u brezn -f"
```

#### Nginx Reverse Proxy
```nginx
# /etc/nginx/sites-available/brezn
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    location /ws {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

```bash
# Nginx aktivieren
sudo ln -s /etc/nginx/sites-available/brezn /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Staging Deployment
```bash
# Staging-Umgebung
export ENVIRONMENT=staging
export DOMAIN=staging.your-domain.com

# Deployment-Skript ausführen
./deploy.sh --environment=staging
```

### Blue-Green Deployment
```bash
#!/bin/bash
# blue-green-deploy.sh

set -e

BLUE_PORT=8080
GREEN_PORT=8081
CURRENT_PORT=$(curl -s http://localhost:8080/health | jq -r '.port' || echo $BLUE_PORT)

if [ "$CURRENT_PORT" = "$BLUE_PORT" ]; then
    NEW_PORT=$GREEN_PORT
    OLD_PORT=$BLUE_PORT
else
    NEW_PORT=$BLUE_PORT
    OLD_PORT=$GREEN_PORT
fi

echo "🔄 Deploying to port $NEW_PORT..."

# Neue Version starten
cargo build --release
./target/release/brezn --port $NEW_PORT &

# Health Check
sleep 10
if curl -f http://localhost:$NEW_PORT/health > /dev/null; then
    echo "✅ New version healthy, switching traffic..."
    
    # Traffic umleiten
    sudo iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-port $NEW_PORT
    
    # Alte Version stoppen
    pkill -f "brezn.*--port $OLD_PORT"
    
    echo "✅ Blue-green deployment completed!"
else
    echo "❌ New version unhealthy, rolling back..."
    pkill -f "brezn.*--port $NEW_PORT"
    exit 1
fi
```

## 🔍 Monitoring & Logging

### Systemd Logs
```bash
# Service-Status
sudo systemctl status brezn

# Live-Logs
sudo journalctl -u brezn -f

# Logs seit Neustart
sudo journalctl -u brezn -b

# Fehler-Logs
sudo journalctl -u brezn -p err
```

### Application Logs
```bash
# Log-Level setzen
export RUST_LOG=debug

# Logs in Datei
./target/release/brezn > brezn.log 2>&1 &

# Log-Rotation
sudo tee /etc/logrotate.d/brezn > /dev/null <<EOF
/home/brezn/brezn.log {
    daily
    missingok
    rotate 7
    compress
    delaycompress
    notifempty
    create 644 brezn brezn
}
EOF
```

### Health Checks
```bash
# HTTP Health Check
curl http://localhost:8080/health

# P2P Network Status
curl http://localhost:8080/api/network/status

# Tor Status
curl http://localhost:8080/api/tor/status

# Discovery Status
curl http://localhost:8080/api/discovery/peers
```

## 🚨 Troubleshooting

### Häufige Probleme

#### 1. Port bereits in Verwendung
```bash
# Ports prüfen
sudo netstat -tlnp | grep :8080
sudo netstat -tlnp | grep :8888

# Prozess beenden
sudo kill -9 <PID>

# Oder andere Ports verwenden
./target/release/brezn --port 8081 --p2p-port 8889
```

#### 2. Tor-Verbindung fehlgeschlagen
```bash
# Tor-Status prüfen
curl http://localhost:8080/api/tor/status

# Tor-Service starten
sudo systemctl start tor

# SOCKS5-Port prüfen
netstat -tlnp | grep :9050

# Tor-Konfiguration
sudo nano /etc/tor/torrc
```

#### 3. P2P-Netzwerk funktioniert nicht
```bash
# Firewall-Einstellungen
sudo ufw allow 8888/udp
sudo ufw allow 8888/tcp

# Discovery-Status
curl http://localhost:8080/api/discovery/peers

# Netzwerk-Interfaces prüfen
ip addr show
```

#### 4. Performance-Probleme
```bash
# System-Ressourcen
htop
iostat -x 1
iotop

# Rust-Profiling
cargo install flamegraph
cargo flamegraph

# Memory-Leaks
cargo install heim
cargo heim memory
```

#### 5. Build-Fehler
```bash
# Rust-Toolchain aktualisieren
rustup update

# Dependencies aktualisieren
cargo update

# Cache löschen
cargo clean
rm -rf target/

# Spezifische Target hinzufügen
rustup target add x86_64-unknown-linux-gnu
```

### Debug-Modus
```bash
# Debug-Logs aktivieren
export RUST_LOG=debug
export RUST_BACKTRACE=1

# Mit Debug-Informationen starten
./target/release/brezn --debug

# Valgrind für Memory-Checks
cargo install cargo-valgrind
cargo valgrind run
```

### Recovery-Prozeduren

#### Service-Wiederherstellung
```bash
# Service neu starten
sudo systemctl restart brezn

# Automatischer Restart
sudo systemctl enable brezn

# Restart-Policy anpassen
sudo systemctl edit brezn
```

#### Daten-Wiederherstellung
```bash
# Backup wiederherstellen
cp /backup/brezn.db /home/brezn/brezn/data/

# Datenbank-Reparatur
sqlite3 /home/brezn/brezn/data/brezn.db "VACUUM;"

# Konfiguration zurücksetzen
cp /backup/brezn.toml /home/brezn/brezn/config/
```

## 📊 Performance-Optimierung

### Rust-Optimierungen
```toml
# Cargo.toml
[profile.release]
opt-level = 3
lto = true
codegen-units = 1
panic = 'abort'
strip = true

[profile.release.package.brezn]
opt-level = 3
```

### System-Optimierungen
```bash
# CPU-Frequenz
echo performance | sudo tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor

# I/O-Scheduler
echo 'ACTION=="add|change", KERNEL=="sd[a-z]*", ATTR{queue/scheduler}="none"' | sudo tee /etc/udev/rules.d/60-ioschedulers.rules

# Network-Optimierungen
echo 'net.core.rmem_max = 134217728' | sudo tee -a /etc/sysctl.conf
echo 'net.core.wmem_max = 134217728' | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

### Monitoring-Setup
```bash
# Prometheus Node Exporter
docker run -d \
  --name node-exporter \
  -p 9100:9100 \
  prom/node-exporter

# Grafana
docker run -d \
  --name grafana \
  -p 3000:3000 \
  grafana/grafana
```

## 🔒 Sicherheit

### Firewall-Konfiguration
```bash
# UFW aktivieren
sudo ufw enable

# Standard-Regeln
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Brezn-Ports
sudo ufw allow 8080/tcp  # HTTP API
sudo ufw allow 8888/udp  # P2P Discovery
sudo ufw allow 8888/tcp  # P2P Connections

# SSH (nur von bestimmten IPs)
sudo ufw allow from 192.168.1.0/24 to any port 22
```

### SSL/TLS-Zertifikate
```bash
# Let's Encrypt
sudo apt-get install -y certbot python3-certbot-nginx

# Zertifikat erstellen
sudo certbot --nginx -d your-domain.com

# Auto-Renewal
sudo crontab -e
# 0 12 * * * /usr/bin/certbot renew --quiet
```

### Backup-Strategie
```bash
#!/bin/bash
# backup.sh

BACKUP_DIR="/backup/brezn"
DATE=$(date +%Y%m%d_%H%M%S)

# Backup-Verzeichnis erstellen
mkdir -p "$BACKUP_DIR"

# Datenbank-Backup
sqlite3 /home/brezn/brezn/data/brezn.db ".backup '$BACKUP_DIR/brezn_$DATE.db'"

# Konfigurations-Backup
cp /home/brezn/brezn/config/brezn.toml "$BACKUP_DIR/brezn_$DATE.toml"

# Alte Backups löschen (älter als 30 Tage)
find "$BACKUP_DIR" -name "brezn_*.db" -mtime +30 -delete
find "$BACKUP_DIR" -name "brezn_*.toml" -mtime +30 -delete

echo "✅ Backup completed: $BACKUP_DIR/brezn_$DATE.*"
```

## 📚 Weitere Ressourcen

- [API-Dokumentation](API.md)
- [Discovery-System](discovery.md)
- [Tor-Integration](tor_integration.md)
- [CI/CD-Pipeline](CI_CD_PIPELINE.md)
- [Entwickler-Quickstart](DEVELOPER_QUICKSTART.md)

## 🤝 Support

### Community-Support
- **GitHub Issues**: [Brezn Repository](https://github.com/brezn-project/brezn/issues)
- **Discussions**: [GitHub Discussions](https://github.com/brezn-project/brezn/discussions)
- **Wiki**: [Projekt-Wiki](https://github.com/brezn-project/brezn/wiki)

### Logs sammeln
```bash
# Support-Paket erstellen
mkdir brezn-support
cd brezn-support

# System-Informationen
uname -a > system-info.txt
rustc --version > rust-version.txt
cargo --version >> rust-version.txt

# Service-Status
sudo systemctl status brezn > service-status.txt

# Logs
sudo journalctl -u brezn --no-pager > service-logs.txt

# Konfiguration
cp /home/brezn/brezn/config/brezn.toml ./

# Archiv erstellen
tar -czf brezn-support-$(date +%Y%m%d).tar.gz *
```

---

**Entwickelt für das Brezn-Projekt** 📦🚀