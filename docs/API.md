# Brezn API Referenz

Basis-URL: `http://localhost:8080`

Hinweis: HTTP/API läuft auf Port 8080. P2P-Netzwerk nutzt Port 8888 (Standard), separat vom HTTP-Port.

## 🆕 **Neue P2P-Endpoints (Phase 2)**

### POST /api/network/request-posts
Fordert Posts von einem spezifischen Peer an.

```bash
curl -X POST http://localhost:8080/api/network/request-posts \
  -H 'Content-Type: application/json' \
  -d '{"peer_id":"peer123","post_ids":["post1","post2"],"sync_mode":"incremental"}'
```

**Request Body:**
```json
{
  "peer_id": "string",           // ID des Ziel-Peers
  "post_ids": ["string"],        // Array der gewünschten Post-IDs
  "sync_mode": "string",         // "full" oder "incremental"
  "since_timestamp": 1234567890  // Optional: Nur Posts seit diesem Zeitstempel
}
```

**Response:**
```json
{
  "success": true,
  "posts": [
    {
      "id": "post1",
      "content": "Hallo Brezn",
      "pseudonym": "Sepp",
      "timestamp": 1712345678,
      "signature": "base64_signature",
      "peer_id": "peer123"
    }
  ],
  "sync_status": "completed",
  "posts_count": 1
}
```

### POST /api/network/sync-all
Synchronisiert alle verfügbaren Peers.

```bash
curl -X POST http://localhost:8080/api/network/sync-all \
  -H 'Content-Type: application/json' \
  -d '{"sync_mode":"incremental","max_posts_per_peer":100}'
```

**Request Body:**
```json
{
  "sync_mode": "string",           // "full" oder "incremental"
  "max_posts_per_peer": 100,      // Maximale Anzahl Posts pro Peer
  "priority_peers": ["peer1"],     // Optional: Prioritäts-Peers zuerst
  "exclude_peers": ["peer2"]       // Optional: Peers ausschließen
}
```

**Response:**
```json
{
  "success": true,
  "sync_summary": {
    "total_peers_synced": 5,
    "total_posts_synced": 150,
    "failed_peers": ["peer3"],
    "sync_duration_ms": 2500
  },
  "peer_results": [
    {
      "peer_id": "peer1",
      "status": "success",
      "posts_synced": 25,
      "latency_ms": 45
    }
  ]
}
```

## 🔍 **Discovery-System-API**

### GET /api/discovery/peers
Listet alle bekannten Peers mit detaillierten Informationen.

```bash
curl http://localhost:8080/api/discovery/peers
```

**Response:**
```json
{
  "success": true,
  "peers": [
    {
      "node_id": "peer123",
      "public_key": "base64_public_key",
      "address": "192.168.1.100",
      "port": 8888,
      "last_seen": 1712345678,
      "capabilities": ["posts", "tor", "discovery"],
      "connection_quality": "excellent",
      "latency_ms": 25,
      "is_verified": true,
      "network_segment": "core"
    }
  ],
  "total_peers": 15,
  "active_peers": 12,
  "network_topology": {
    "segments": 3,
    "core_nodes": 5,
    "edge_nodes": 8,
    "bridge_nodes": 2
  }
}
```

### GET /api/discovery/network-topology
Zeigt die aktuelle Netzwerk-Topologie an.

```bash
curl http://localhost:8080/api/discovery/network-topology
```

**Response:**
```json
{
  "success": true,
  "topology": {
    "node_id": "local_node",
    "connections": ["peer1", "peer2", "peer3"],
    "routing_table": {
      "peer4": "peer2",
      "peer5": "peer1"
    },
    "network_segments": [
      {
        "segment_id": "core",
        "nodes": ["local_node", "peer1", "peer2"],
        "segment_type": "core",
        "connectivity_score": 0.95
      }
    ],
    "topology_version": 42
  },
  "stats": {
    "total_peers": 15,
    "active_peers": 12,
    "excellent_connections": 8,
    "poor_connections": 2,
    "avg_latency_ms": 75,
    "segments_count": 3
  }
}
```

### POST /api/discovery/announce
Kündigt den lokalen Node im Netzwerk an.

```bash
curl -X POST http://localhost:8080/api/discovery/announce \
  -H 'Content-Type: application/json' \
  -d '{"capabilities":["posts","tor","discovery"],"network_segment":"core"}'
```

**Request Body:**
```json
{
  "capabilities": ["posts", "tor", "discovery"],
  "network_segment": "core",
  "force_announce": false
}
```

**Response:**
```json
{
  "success": true,
  "announcement_sent": true,
  "peers_reached": 8,
  "response_time_ms": 120
}
```

### GET /api/discovery/qr-generate
Generiert einen QR-Code für Peer-Beitritt.

```bash
curl http://localhost:8080/api/discovery/qr-generate
```

**Response:**
```json
{
  "success": true,
  "qr_data": {
    "version": "1.0",
    "node_id": "local_node",
    "public_key": "base64_public_key",
    "address": "192.168.1.100",
    "port": 8888,
    "timestamp": 1712345678,
    "capabilities": ["posts", "tor", "discovery"],
    "checksum": "sha256_checksum"
  },
  "qr_code_svg": "<svg>...</svg>",
  "expires_at": 1712432078
}
```

### POST /api/discovery/qr-parse
Parst QR-Code-Daten und fügt den Peer hinzu.

```bash
curl -X POST http://localhost:8080/api/discovery/qr-parse \
  -H 'Content-Type: application/json' \
  -d '{"qr_data":"base64_encoded_qr_data"}'
```

**Request Body:**
```json
{
  "qr_data": "base64_encoded_qr_data",
  "verify_checksum": true,
  "auto_connect": true
}
```

**Response:**
```json
{
  "success": true,
  "peer_added": {
    "node_id": "new_peer",
    "public_key": "base64_public_key",
    "address": "192.168.1.101",
    "port": 8888,
    "capabilities": ["posts", "tor"]
  },
  "connection_attempted": true,
  "verification_status": "verified"
}
```

## 🔒 **Erweiterte Tor-Integration-API**

### GET /api/tor/status
Zeigt detaillierten Tor-Status an.

```bash
curl http://localhost:8080/api/tor/status
```

**Response:**
```json
{
  "success": true,
  "tor_enabled": true,
  "connection_status": "connected",
  "circuits": [
    {
      "circuit_id": "circuit1",
      "status": "active",
      "age_seconds": 180,
      "health_score": 0.95,
      "exit_node": "exit_node_1",
      "latency_ms": 120
    }
  ],
  "connection_pool": {
    "active_connections": 5,
    "max_connections": 20,
    "pool_health": 0.85
  },
  "external_ip": "185.220.101.42",
  "last_rotation": 1712345678,
  "overall_health": 0.92
}
```

### POST /api/tor/rotate-circuits
Rotiert alle Tor-Circuits.

```bash
curl -X POST http://localhost:8080/api/tor/rotate-circuits \
  -H 'Content-Type: application/json' \
  -d '{"force_rotation":false,"max_age_seconds":300}'
```

**Request Body:**
```json
{
  "force_rotation": false,
  "max_age_seconds": 300,
  "health_threshold": 0.7
}
```

**Response:**
```json
{
  "success": true,
  "circuits_rotated": 3,
  "new_circuits_created": 3,
  "rotation_duration_ms": 2500,
  "new_external_ip": "185.220.101.43"
}
```

### GET /api/tor/health
Führt eine umfassende Tor-Gesundheitsprüfung durch.

```bash
curl http://localhost:8080/api/tor/health
```

**Response:**
```json
{
  "success": true,
  "health_check": {
    "overall_health": 0.92,
    "connection_health": 0.95,
    "circuit_health": 0.88,
    "performance_health": 0.94
  },
  "metrics": {
    "total_circuits": 5,
    "active_circuits": 4,
    "failed_circuits": 1,
    "avg_latency_ms": 150,
    "connection_success_rate": 0.98
  },
  "recommendations": [
    "Circuit rotation recommended in 2 minutes",
    "Connection pool utilization: 75%"
  ]
}
```

## 📊 **Erweiterte Netzwerk-Status-API**

### GET /api/network/status
Zeigt erweiterten Netzwerkstatus an.

```bash
curl http://localhost:8080/api/network/status
```

**Response:**
```json
{
  "success": true,
  "network_enabled": true,
  "local_node": {
    "node_id": "local_node",
    "public_key": "base64_public_key",
    "address": "192.168.1.100",
    "port": 8888,
    "capabilities": ["posts", "tor", "discovery"]
  },
  "peers": {
    "total": 15,
    "active": 12,
    "excellent": 8,
    "good": 3,
    "fair": 1,
    "poor": 0
  },
  "tor_status": {
    "enabled": true,
    "connected": true,
    "circuits": 5,
    "external_ip": "185.220.101.42"
  },
  "sync_status": {
    "last_sync": 1712345678,
    "posts_synced": 150,
    "sync_in_progress": false,
    "failed_syncs": 2
  },
  "network_metrics": {
    "avg_latency_ms": 75,
    "packet_loss_rate": 0.02,
    "bandwidth_usage_mbps": 1.2
  }
}
```

## 🔧 **Bestehende Endpunkte (Aktualisiert)**

### GET /api/posts
Liefert alle Posts mit erweiterten Metadaten.

```bash
curl http://localhost:8080/api/posts
```

**Response (erweitert):**
```json
{
  "success": true,
  "posts": [
    {
      "id": "post1",
      "content": "Hallo Brezn",
      "pseudonym": "Sepp",
      "timestamp": 1712345678,
      "signature": "base64_signature",
      "peer_id": "peer123",
      "sync_status": "synced",
      "verification_status": "verified"
    }
  ],
  "total_posts": 1,
  "sync_status": "up_to_date"
}
```

### POST /api/posts
Erstellt einen neuen Post mit erweiterter Validierung.

```bash
curl -X POST http://localhost:8080/api/posts \
  -H 'Content-Type: application/json' \
  -d '{"content":"Hallo Brezn","pseudonym":"Sepp","sync_to_peers":true}'
```

**Request Body (erweitert):**
```json
{
  "content": "string",
  "pseudonym": "string",
  "sync_to_peers": true,
  "priority": "normal"
}
```

## 📋 **API-Status Übersicht**

### ✅ **Vollständig funktional (Phase 2)**
- `GET /api/posts` - Posts abrufen (erweitert)
- `POST /api/posts` - Post erstellen (erweitert)
- `GET /api/config` - Konfiguration abrufen
- `POST /api/config` - Konfiguration aktualisieren
- `GET /api/network/status` - Erweiterter Netzwerkstatus
- `POST /api/network/toggle` - Netzwerk ein/ausschalten
- `GET /api/tor/status` - Detaillierter Tor-Status
- `POST /api/tor/toggle` - Tor ein/ausschalten
- `POST /api/tor/rotate-circuits` - Tor-Circuits rotieren
- `GET /api/tor/health` - Tor-Gesundheitsprüfung

### 🆕 **Neue P2P-Endpoints (Phase 2)**
- `POST /api/network/request-posts` - Posts von Peer anfordern
- `POST /api/network/sync-all` - Alle Peers synchronisieren
- `GET /api/discovery/peers` - Alle bekannten Peers auflisten
- `GET /api/discovery/network-topology` - Netzwerk-Topologie anzeigen
- `POST /api/discovery/announce` - Node im Netzwerk ankündigen
- `GET /api/discovery/qr-generate` - QR-Code für Peer-Beitritt generieren
- `POST /api/discovery/qr-parse` - QR-Code-Daten parsen

### 🔄 **Verbesserte Features**
- **Erweiterte Post-Synchronisation** mit Peer-spezifischen Requests
- **Netzwerk-Topologie-Monitoring** mit Segment-Analyse
- **Tor-Circuit-Management** mit automatischer Rotation
- **Peer-Discovery-System** mit QR-Code-Integration
- **Connection-Quality-Monitoring** mit Latency-Tracking

## 🚨 **Bekannte Einschränkungen**

### **Phase 2 Features**
- **QR-Code-Generierung**: Vollständig implementiert mit Checksum-Validierung
- **Peer-Discovery**: Vollständig funktional mit Multicast/Broadcast
- **Tor-Integration**: Vollständig funktional mit Circuit-Management
- **P2P-Synchronisation**: Vollständig implementiert mit Konfliktlösung

### **Nächste Schritte**
- **Performance-Optimierung** für große Netzwerke
- **Erweiterte Metriken** für Netzwerk-Monitoring
- **Mobile Integration** für Discovery-System

## 📚 **Weitere Ressourcen**

- [Discovery-System Dokumentation](discovery.md)
- [Tor-Integration Dokumentation](tor_integration.md)
- [Netzwerk-Architektur](architecture.md)
- [Entwickler-Quickstart](DEVELOPER_QUICKSTART.md)