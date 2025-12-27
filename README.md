# Brezn

Brezn ist wie CB‑Funk für das Internet: Lokale Kommunikation in deiner Nähe, ohne zentrale Kontrolle. Brezn ist ein PWA Client für das Nostr‑Protokoll und fokussiert sich auf lokale Vernetzung mittels fünfstelligem Geohash (4,9 × 4,9 km Zelle).

## Installation

[Brezn](https://dabena.github.io/Brezn/) kann als Progressive Web App (PWA) installiert werden und läuft dann wie eine native App:

- **Android**: Banner "Zum Startbildschirm hinzufügen" oder Menü → "Zum Startbildschirm hinzufügen"
- **iOS Safari**: Teilen-Button → "Zum Home-Bildschirm"

Nach der Installation erscheint Brezn mit dem Brezn-Icon auf dem Homebildschirm/Startmenü und öffnet sich als eigenständige App ohne Browser-UI.

## Was ist Nostr?

Nostr ist ein offenes Protokoll – vergleichbar mit E‑Mail, nur für soziale Netzwerke. Viele unabhängige Relays speichern und verteilen Nachrichten (Nostr‑Events). Verschiedene Nostr‑Apps sprechen dasselbe Protokoll und können auf dieselben Inhalte zugreifen. Deine Identität besteht aus einem Schlüsselpaar (npub/nsec) und ist nicht an einen Server gebunden – damit kannst du dich in unterschiedlichen Clients anmelden und behältst überall denselben Account und dieselben Posts. Wenn ein Relay blockiert oder offline geht, können Nutzer zu anderen wechseln, ohne ihre Identität oder Posts zu verlieren.

## Netzwerkarchitekturen im Vergleich

![Netzwerkarchitekturen im Vergleich](diagramm.svg)

- **Klassische soziale Netzwerke**: Alle Nutzer über einen zentralen Server. Die Plattform kann Inhalte zensieren und Nutzer ausschließen.
- **Federierte Netzwerke** (z.B. Mastodon): Nutzer auf verschiedenen Instanzen, die über ein Instanz-Backbone kommunizieren. Jede Instanz kann eigene Regeln durchsetzen und andere blockieren.
- **Nostr**: Nutzer verbinden sich mit mehreren Relays gleichzeitig. Relays kommunizieren **nicht** direkt miteinander – die Kommunikation läuft über die Clients. Für Zensur müssten **alle gemeinsam genutzten Relays** mitmachen – solange nur ein gemeinsam genutztes Relay nicht mitmacht, findet keine Zensur statt.

## Was macht Brezn genau?

Brezn ist nur eine Ansicht auf Nostr und kein eigenes soziales Netzwerk. Die App lädt, zeigt und sendet Nostr‑Events, die auf Relays liegen. Mit denselben Relays und Schlüsseln siehst du in anderen Nostr‑Clients (z.B. Amethyst, Damus, Coracle) die gleichen Inhalte – nur in einer anderen Oberfläche.

## Rechtlicher Hinweis

Der Entwickler von Brezn betreibt keine Nostr‑Relays, hostet keine Inhalte und speichert keine Beiträge serverseitig. Posts werden an die vom Nutzer konfigurierten Relays gesendet, die Inhalte nach ihren eigenen Regeln speichern und verteilen. Der Entwickler hat keinen Einfluss auf Inhalte im Nostr‑Netzwerk und keinen Zugriff auf fremde Relays. Brezn stellt nur client‑seitige Moderation (Wörter Blockliste) bereit. Nutzer sind selbst verantwortlich für ihre Nutzung, Schlüssel und Inhalte.

## Tech-Stack

- React + Vite
- Tailwind CSS
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

## Danksagung

Vielen Dank an alle Betreiber von öffentlichen Nostr-Relays, die das alles erst möglich machen.
