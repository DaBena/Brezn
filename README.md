# Brezn

Live auf GitHub Pages: https://dabena.github.io/Brezn/

**Brezn** ist ein PWA Client für das offene und dezentrale **Nostr‑Protokoll**. Die App verbindet sich mit öffentlichen Relays und zeigt bzw. erstellt Nostr‑Events – sie ist damit nur eine von vielen möglichen Nostr‑Ansichten. Im Unterschied zu vielen anderen Nostr‑Clients, die auf globale Kommunikation ausgelegt sind, fokussiert sich Brezn auf lokale Vernetzung. Der Client nutzt dafür einen fünfstelligen Geohash, der eine 4,9 × 4,9 Kilometer große Zelle identifiziert.

## Was ist Nostr?

Nostr ist ein offenes Protokoll – vergleichbar mit E‑Mail, nur für soziale Netzwerke. Viele unabhängige Relays speichern und verteilen Nachrichten (Nostr‑Events). Verschiedene Nostr‑Apps (Clients) sprechen alle dasselbe Protokoll und können dadurch auf dieselben Inhalte zugreifen. Deine Identität besteht aus einem Schlüsselpaar (npub/nsec); mit diesen Schlüsseln kannst du dich in unterschiedlichen Nostr‑Clients anmelden und behältst überall denselben Account und dieselben Posts.

Nostr ist **zensurresistent**, weil es keine zentrale Instanz gibt, die Inhalte kontrollieren kann. Das Netzwerk besteht aus vielen unabhängigen Relays weltweit. Wenn ein Relay blockiert oder offline geht, können Nutzer zu anderen Relays wechseln, ohne ihre Identität oder Posts zu verlieren. Da deine Identität durch dein Schlüsselpaar definiert ist und nicht an einen Server gebunden, kann dich niemand dauerhaft ausschließen.

## Netzwerkarchitekturen im Vergleich

Das folgende Diagramm zeigt die Unterschiede zwischen zentralen, federierten und dezentralen Netzwerken:

```mermaid
graph TB
    subgraph X["X (Twitter) - Zentrale Autorität"]
        XServer["X Server<br/>(kann zensieren)"]
        XUser1["Nutzer 1"]
        XUser2["Nutzer 2"]
        XUser3["Nutzer 3"]
        XUser1 --> XServer
        XUser2 --> XServer
        XUser3 --> XServer
        XServer --> XUser1
        XServer --> XUser2
        XServer --> XUser3
    end
    
    subgraph Mastodon["Mastodon - Federiert"]
        MInstance1["Instanz 1<br/>(kann zensieren)"]
        MInstance2["Instanz 2<br/>(kann zensieren)"]
        MInstance3["Instanz 3<br/>(kann zensieren)"]
        MRelay["Relay Backbone"]
        MUser1["Nutzer 1"]
        MUser2["Nutzer 2"]
        MUser3["Nutzer 3"]
        MUser1 --> MInstance1
        MUser2 --> MInstance2
        MUser3 --> MInstance3
        MInstance1 <--> MRelay
        MInstance2 <--> MRelay
        MInstance3 <--> MRelay
    end
    
    subgraph Nostr["Nostr - Zensurfrei"]
        NRelay1["Relay 1"]
        NRelay2["Relay 2"]
        NRelay3["Relay 3"]
        NRelay4["Relay 4"]
        NUser1["Nutzer 1<br/>(Schlüsselpaar)"]
        NUser2["Nutzer 2<br/>(Schlüsselpaar)"]
        NUser3["Nutzer 3<br/>(Schlüsselpaar)"]
        NUser1 <--> NRelay1
        NUser1 <--> NRelay2
        NUser2 <--> NRelay2
        NUser2 <--> NRelay3
        NUser3 <--> NRelay3
        NUser3 <--> NRelay4
        NRelay1 <--> NRelay2
        NRelay2 <--> NRelay3
        NRelay3 <--> NRelay4
    end
    
    style XServer fill:#ff6b6b
    style MInstance1 fill:#ffd93d
    style MInstance2 fill:#ffd93d
    style MInstance3 fill:#ffd93d
    style NRelay1 fill:#6bcf7f
    style NRelay2 fill:#6bcf7f
    style NRelay3 fill:#6bcf7f
    style NRelay4 fill:#6bcf7f
```

**Erklärung:**

- **X (Twitter)**: Alle Nutzer sind über einen zentralen Server verbunden. Die Plattform kann Inhalte zensieren und Nutzer ausschließen.
- **Mastodon**: Nutzer sind auf verschiedenen Instanzen verteilt, die über ein Relay-Backbone kommunizieren. Jede Instanz kann ihre eigenen Regeln durchsetzen und zensieren (federierte Zensur).
- **Nostr**: Nutzer verbinden sich mit mehreren Relays gleichzeitig. Ihre Identität ist durch ein Schlüsselpaar definiert und nicht an einen Server gebunden. Keine zentrale Kontrolle möglich – zensurfrei.

## Was macht Brezn genau?

Brezn ist nur eine Ansicht auf Nostr und kein eigenes soziales Netzwerk. Die App lädt, zeigt und sendet Nostr‑Events, die auf Relays liegen. Wenn du andere Nostr‑Clients wie Amethyst, Damus oder Coracle verwendest und dort dieselben Relays sowie dieselben Schlüssel einstellst, siehst du in der Regel die gleichen Inhalte – nur in einer anderen Oberfläche.

## Rechtlicher Hinweis

Der Entwickler von Brezn betreibt keine Nostr‑Relays, hostet keine Inhalte und speichert keine Beiträge serverseitig. Posts werden an die vom Nutzer konfigurierten Relays gesendet, die Inhalte nach ihren eigenen Regeln speichern und verteilen. Der Entwickler hat keinen Einfluss auf Inhalte im Nostr‑Netzwerk und keinen Zugriff auf fremde Relays. Brezn stellt nur client‑seitige Moderation (Wörter Blockliste) bereit. Nutzer sind selbst verantwortlich für ihre Nutzung, Schlüssel und Inhalte.

## Tech-Stack

- React + Vite
- Tailwind CSS (Dark Mode only)
- `nostr-tools`
- PWA: `vite-plugin-pwa` (Service Worker + Offline-Fallback)

## Entwicklung

```bash
npm install
npm run dev        # Development Server
npm run build      # Build
npm run preview    # Preview Build
```

**GitHub Pages**: Automatisches Deploy bei Push auf `main` via `.github/workflows/deploy-pages.yml`.
