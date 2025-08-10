# Brezn API Referenz

Basis-URL: `http://localhost:8080`

Hinweis: HTTP/API läuft auf Port 8080. P2P-Netzwerk nutzt Port 8888 (Standard), separat vom HTTP-Port.

## Endpunkte

### GET /api/posts
Liefert alle Posts.

```bash
curl http://localhost:8080/api/posts
```

Beispielantwort (gekürzt):
```json
{
  "success": true,
  "posts": [
    { "id": 1, "content": "Hallo Brezn", "pseudonym": "Sepp", "timestamp": 1712345678 }
  ]
}
```

### POST /api/posts
Erstellt einen neuen Post.

```bash
curl -X POST http://localhost:8080/api/posts \
  -H 'Content-Type: application/json' \
  -d '{"content":"Hallo Brezn","pseudonym":"Sepp"}'
```

### GET /api/config
Liest die aktuelle Konfiguration.

```bash
curl http://localhost:8080/api/config
```

### POST /api/config
Aktualisiert Konfiguration (vereinfacht; derzeit Platzhalter).

```bash
curl -X POST http://localhost:8080/api/config -H 'Content-Type: application/json' -d '{}'
```

### POST /api/network/toggle
Aktiviert/Deaktiviert das P2P‑Netzwerk zur Laufzeit.

```bash
curl -X POST http://localhost:8080/api/network/toggle
```

### GET /api/network/status
Zeigt Netzwerkstatus inkl. Peers und Tor‑Status.

```bash
curl http://localhost:8080/api/network/status
```

### GET /api/network/qr
Erzeugt QR‑Code‑Daten für Peer‑Beitritt.

```bash
curl http://localhost:8080/api/network/qr
```

### POST /api/network/parse-qr
Parst QR‑Code‑Daten und fügt den Peer hinzu.

```bash
curl -X POST http://localhost:8080/api/network/parse-qr \
  -H 'Content-Type: application/json' \
  -d '{"qr_data":"..."}'
```

### POST /api/tor/toggle
Aktiviert/Deaktiviert Tor (SOCKS5 auf 9050 muss laufen).

```bash
curl -X POST http://localhost:8080/api/tor/toggle
```

## Hinweise
- CORS ist für die API-Endpunkte aktiviert.
- Tor muss lokal laufen, wenn Tor aktiviert werden soll (Standard‑SOCKS5: 9050).
- Der P2P‑Port kann in der App‑Konfiguration angepasst werden (Standard: 8888).