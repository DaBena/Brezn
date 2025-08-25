# Brezn MVP - Verwendungsanleitung

## 🚀 **Schnellstart**

### 1. **System starten**
```bash
cd brezn
cargo build
cargo run --bin brezn-server
```

### 2. **Browser öffnen**
```
http://localhost:8080
```

### 3. **MVP-Features testen**

#### **Posts erstellen und verwalten**
- Tab "Feed" öffnen
- Neuen Post mit Pseudonym erstellen
- Posts werden automatisch gespeichert

#### **P2P-Netzwerk aktivieren**
- Tab "Netzwerk" öffnen
- P2P-Discovery starten
- Peers werden automatisch erkannt

#### **Tor-Integration testen**
- Tor-Status überwachen
- Tor-Verbindung testen
- Sichere Peer-Kommunikation aktivieren

#### **QR-Code-System nutzen**
- QR-Code für Peer-Verbindung generieren
- QR-Code von anderem Peer scannen
- Peer wird automatisch hinzugefügt

## 🔧 **Konfiguration**

### **Netzwerk-Einstellungen**
- **Netzwerk-Port**: 8888 (Standard)
- **Discovery-Port**: 8888 (Standard)
- **Tor SOCKS-Port**: 9050 (Standard)
- **Maximale Peers**: 50 (Standard)

### **Post-Einstellungen**
- **Standard-Pseudonym**: AnonymBrezn
- **Maximale Posts**: 1000
- **Auto-Save**: Aktiviert

## 📱 **Verfügbare Tabs**

### **Feed**
- Posts anzeigen und erstellen
- Echtzeit-Updates alle 5 Sekunden

### **Netzwerk**
- P2P-Netzwerk-Status
- Tor-Integration
- Peer-Verwaltung
- Netzwerk-Gesundheit

### **QR-Code**
- Peer-Verbindungs-QR-Codes
- QR-Code-Parsing
- Peer-Hinzufügung

### **Einstellungen**
- Konfiguration verwalten
- Netzwerk-Parameter anpassen
- Tor-Einstellungen konfigurieren

## 🌐 **API-Verwendung**

### **Posts abrufen**
```bash
curl http://localhost:8080/api/posts
```

### **Neuen Post erstellen**
```bash
curl -X POST http://localhost:8080/api/posts \
  -H "Content-Type: application/json" \
  -d '{"content":"Hallo Welt!","pseudonym":"TestUser"}'
```

### **Netzwerk-Status abrufen**
```bash
curl http://localhost:8080/api/network/status
```

### **QR-Code generieren**
```bash
curl http://localhost:8080/api/network/qr
```

## 🔍 **Troubleshooting**

### **Netzwerk funktioniert nicht**
1. Firewall-Einstellungen prüfen
2. Ports 8888 und 9050 freigeben
3. Netzwerk-Status im Browser prüfen

### **Tor-Verbindung fehlschlägt**
1. Tor-Service läuft auf Port 9050
2. SOCKS5-Proxy konfiguriert
3. Tor-Status im Browser prüfen

### **Peers werden nicht erkannt**
1. Discovery aktiviert
2. Netzwerk-Ports korrekt
3. Firewall-Einstellungen prüfen

## 📊 **Monitoring**

### **Real-time Updates**
- **Posts**: Alle 5 Sekunden
- **Netzwerk-Status**: Alle 10 Sekunden
- **P2P-Status**: Alle 15 Sekunden
- **Tor-Status**: Alle 20 Sekunden
- **Auto-Sync**: Alle 30 Sekunden

### **Netzwerk-Gesundheit**
- **Health-Score**: 0-100%
- **Peer-Anzahl**: Aktive/Verfügbare
- **Verbindungsqualität**: Excellent/Good/Fair/Poor

## 🎯 **Nächste Schritte**

Das MVP ist zu 85% fertig. Die verbleibenden 15% konzentrieren sich auf:
1. **Performance-Optimierung**
2. **End-to-End-Tests**
3. **Dokumentation vervollständigen**

**Geschätzte Zeit bis zur vollständigen MVP-Fertigstellung: 1 Woche**