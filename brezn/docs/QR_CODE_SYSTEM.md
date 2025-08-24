# 🔐 Brezn QR-Code System

Das Brezn QR-Code System ermöglicht es Netzwerk-Teilnehmern, sich einfach über QR-Codes zu verbinden und dem dezentralen Netzwerk beizutreten.

## 📋 Übersicht

Das QR-Code-System besteht aus mehreren Komponenten:

- **QR-Code-Generierung**: Erstellt QR-Codes mit Peer-Informationen
- **QR-Code-Parsing**: Verarbeitet QR-Codes von anderen Peers
- **QR-Code-Validierung**: Überprüft die Integrität der QR-Code-Daten
- **Web-Interface**: Benutzerfreundliche Oberfläche für alle QR-Code-Funktionen

## 🏗️ Architektur

### Core-Komponenten

#### 1. QRCodeData-Struktur
```rust
pub struct QRCodeData {
    pub version: String,           // Version des QR-Code-Formats
    pub node_id: String,          // Eindeutige Node-ID
    pub public_key: String,       // Öffentlicher Schlüssel für Verschlüsselung
    pub address: String,          // IP-Adresse des Peers
    pub port: u16,                // Port des Peers
    pub timestamp: u64,           // Zeitstempel der Erstellung
    pub capabilities: Vec<String>, // Verfügbare Funktionen
    pub checksum: String,         // SHA256-Checksum für Validierung
}
```

#### 2. DiscoveryManager
Verwaltet die Peer-Discovery und QR-Code-Funktionalität:

- `generate_qr_code()`: Generiert PNG-Format
- `generate_qr_code_svg()`: Generiert SVG-Format
- `generate_qr_code_image()`: Generiert PNG-Bytes
- `parse_qr_code()`: Parst QR-Code-Daten
- `validate_qr_data()`: Validiert QR-Code-Daten

### Web-Interface

#### Hauptseite: `/web/qr.html`
- Moderne, responsive Benutzeroberfläche
- Unterstützt verschiedene QR-Code-Formate (PNG, SVG, JSON)
- Datei-Upload für QR-Code-Verarbeitung
- Echtzeit-Statistiken und Validierung

#### Integration: `/web/index.html`
- Grundlegende QR-Code-Funktionalität im Netzwerk-Tab
- Einfache Peer-Verbindung über QR-Codes

## 🚀 Verwendung

### QR-Code generieren

1. **Web-Interface öffnen**: Navigiere zu `/web/qr.html`
2. **Format auswählen**: Wähle zwischen PNG, SVG, JSON oder allen Formaten
3. **Größe einstellen**: Wähle die gewünschte QR-Code-Größe
4. **Generieren**: Klicke auf "QR-Code generieren"
5. **Download**: Lade den QR-Code in verschiedenen Formaten herunter

### QR-Code verarbeiten

1. **QR-Code scannen**: Verwende eine QR-Code-Scanner-App
2. **Daten eingeben**: Füge QR-Code-Daten manuell ein
3. **Datei hochladen**: Lade ein QR-Code-Bild hoch
4. **Verarbeiten**: Klicke auf "QR-Code verarbeiten"
5. **Peer hinzufügen**: Der Peer wird automatisch zum Netzwerk hinzugefügt

### QR-Code validieren

1. **Daten eingeben**: Füge QR-Code-Daten in das Validierungsfeld ein
2. **Validieren**: Klicke auf "Nur validieren"
3. **Ergebnis prüfen**: Überprüfe die Validierungsergebnisse

## 🔒 Sicherheitsfeatures

### Checksum-Validierung
- SHA256-Hash über alle Peer-Daten
- Verhindert Manipulation der QR-Code-Daten
- Automatische Überprüfung bei der Verarbeitung

### Zeitstempel-Validierung
- QR-Codes sind maximal 1 Stunde gültig
- Verhindert Replay-Angriffe
- Automatische Bereinigung veralteter Daten

### Datenvalidierung
- Überprüfung aller Pflichtfelder
- Port-Bereichsvalidierung (1-65535)
- Version-Kompatibilitätsprüfung

## 📊 API-Endpunkte

### QR-Code-Generierung
```
GET /api/network/qr
GET /api/network/qr-formats?size={size}
```

### QR-Code-Verarbeitung
```
POST /api/network/parse-qr
POST /api/network/parse-qr-advanced
POST /api/network/validate-qr
```

### Antwortformate

#### Erfolgreiche Generierung
```json
{
  "success": true,
  "qr_data": {
    "version": "1.0",
    "node_id": "node_123",
    "public_key": "pub_key_456",
    "address": "192.168.1.100",
    "port": 8080,
    "timestamp": 1640995200,
    "capabilities": ["posts", "config", "p2p"],
    "checksum": "abc123..."
  },
  "qr_code": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
}
```

#### Erweiterte Formate
```json
{
  "success": true,
  "qr_data": { ... },
  "formats": {
    "png_base64": "data:image/png;base64,...",
    "svg": "<svg>...</svg>",
    "raw_data": "QR-Code-Rohdaten",
    "json": "{...}"
  }
}
```

## 🧪 Tests

Das System umfasst umfassende Tests:

```bash
# Alle Tests ausführen
cargo test

# Nur QR-Code-Tests
cargo test --test discovery

# Spezifische QR-Code-Tests
cargo test test_qr_code_generation
cargo test test_qr_code_validation
```

### Test-Coverage
- QR-Code-Generierung (PNG, SVG, JSON)
- QR-Code-Parsing und -Validierung
- Checksum-Berechnung und -Validierung
- Zeitstempel-Validierung
- Fehlerbehandlung und Edge Cases

## 🔧 Konfiguration

### DiscoveryConfig
```rust
pub struct DiscoveryConfig {
    pub enable_qr: bool,           // QR-Code-Funktionalität aktivieren
    pub discovery_port: u16,       // Port für Peer-Discovery
    pub broadcast_address: String, // Broadcast-Adresse
    // ... weitere Einstellungen
}
```

### Umgebungsvariablen
```bash
BREZN_QR_ENABLED=true
BREZN_DISCOVERY_PORT=8888
BREZN_BROADCAST_ADDRESS=255.255.255.255:8888
```

## 📱 Mobile Integration

Das QR-Code-System ist für mobile Geräte optimiert:

- **Responsive Design**: Funktioniert auf allen Bildschirmgrößen
- **Touch-Optimiert**: Große Buttons und Touch-freundliche Bedienelemente
- **Kamera-Integration**: Unterstützt native Kamera-Apps für QR-Code-Scanning
- **Offline-Funktionalität**: Funktioniert auch ohne Internetverbindung

## 🚨 Fehlerbehandlung

### Häufige Fehler

1. **"QR code data is too old"**
   - Lösung: Generiere einen neuen QR-Code

2. **"QR code checksum validation failed"**
   - Lösung: Überprüfe die Integrität der Daten

3. **"Invalid port number"**
   - Lösung: Stelle sicher, dass der Port zwischen 1-65535 liegt

4. **"Missing required fields"**
   - Lösung: Überprüfe alle Pflichtfelder

### Debugging

```bash
# Logs aktivieren
RUST_LOG=debug cargo run

# Spezifische QR-Code-Logs
RUST_LOG=brezn::discovery=debug cargo run
```

## 🔮 Zukünftige Erweiterungen

### Geplante Features
- **QR-Code-Batch-Verarbeitung**: Mehrere QR-Codes gleichzeitig verarbeiten
- **QR-Code-Templates**: Anpassbare QR-Code-Designs
- **QR-Code-Historie**: Verlauf aller generierten und verarbeiteten QR-Codes
- **QR-Code-Statistiken**: Detaillierte Analysen und Berichte
- **QR-Code-API**: RESTful API für externe Integrationen

### Technische Verbesserungen
- **Bessere Fehlerkorrektur**: Unterstützung für beschädigte QR-Codes
- **Komprimierung**: Optimierte Datenkomprimierung für kleinere QR-Codes
- **Verschlüsselung**: Optionale Ende-zu-Ende-Verschlüsselung
- **Multi-Format**: Unterstützung für weitere QR-Code-Formate

## 📚 Weitere Ressourcen

- [Brezn Hauptdokumentation](../README.md)
- [API-Referenz](../docs/API.md)
- [Netzwerk-Architektur](../docs/NETWORK.md)
- [Entwickler-Guide](../docs/DEVELOPER.md)

## 🤝 Beitragen

Das QR-Code-System ist ein Open-Source-Projekt. Beiträge sind willkommen!

### Entwicklung
1. Fork das Repository
2. Erstelle einen Feature-Branch
3. Implementiere deine Änderungen
4. Schreibe Tests
5. Erstelle einen Pull Request

### Feedback
- **Issues**: Melde Bugs oder Feature-Requests
- **Discussions**: Diskutiere Verbesserungen
- **Code Review**: Überprüfe Pull Requests

---

**Entwickelt für das Brezn-Projekt** 🥨
*Dezentrale Feed-App mit QR-Code-Integration*