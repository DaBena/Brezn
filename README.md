# Brezn (PWA)

Live auf GitHub Pages: https://dabena.github.io/Brezn/

**Brezn** ist ein Progressive Web App Client für das offene und dezentrale **Nostr‑Protokoll**. Die App verbindet sich mit öffentlichen Relays und zeigt bzw. erstellt Nostr‑Events – sie ist damit nur eine von vielen möglichen Nostr‑Ansichten. Im Unterschied zu vielen anderen Nostr‑Clients, die auf globale Kommunikation ausgelegt sind, fokussiert sich Brezn auf lokale Vernetzung. Der Client nutzt dafür einen fünfstelligen Geohash, der eine 4,9 × 4,9 Kilometer große Zelle identifiziert.

## Was ist Nostr?

Nostr ist kein einzelnes Netzwerk, keine Firma und keine App, sondern ein offenes Protokoll – vergleichbar mit E‑Mail, nur für soziale Netzwerke. Viele unabhängige Server, die Relays genannt werden, speichern und verteilen Nachrichten (Nostr‑Events). Verschiedene Nostr‑Apps (Clients) – zum Beispiel Desktop‑Programme, mobile Apps oder Web‑Clients – sprechen alle dasselbe Protokoll und können dadurch auf dieselben Inhalte zugreifen. Deine Identität besteht aus einem Schlüsselpaar (npub/nsec); mit diesen Schlüsseln kannst du dich in unterschiedlichen Nostr‑Clients anmelden und behältst trotzdem überall denselben Account und dieselben Posts.

## Was macht Brezn genau?

Brezn ist nur eine Ansicht auf Nostr und kein eigenes soziales Netzwerk. Die App lädt, zeigt und sendet Nostr‑Events, die auf Relays liegen. Wenn du andere Nostr‑Clients wie Amethyst, Damus oder Coracle verwendest und dort dieselben Relays sowie dieselben Schlüssel einstellst, siehst du in der Regel die gleichen Inhalte – nur in einer anderen Oberfläche.

## Rechtlicher Hinweis / Haftungs-Disclaimer

Der Entwickler von Brezn betreibt keine Nostr‑Relays, hostet keine Inhalte und speichert keine Beiträge serverseitig. Beim Veröffentlichen werden Posts und andere Events an die vom Nutzer konfigurierten Nostr‑Relays gesendet; diese Relays speichern und verteilen die Inhalte nach ihren eigenen Regeln. Alle Inhalte stammen aus dem offenen Nostr‑Netzwerk, der Entwickler hat keinen Einfluss darauf, was dort veröffentlicht, verfügbar gehalten oder entfernt wird und besitzt keinen technischen Zugriff auf fremde Relays, um Inhalte zu moderieren, zu sperren oder zu löschen. Brezn stellt nur client‑seitige Werkzeuge für lokale Moderation (Wörter Blockliste) auf dem Endgerät des Nutzers bereit. Nutzer sind selbst verantwortlich für ihre Nutzung, ihre Schlüssel und die Inhalte, die sie veröffentlichen oder abrufen; dieses Projekt und diese Hinweise stellen keine Rechtsberatung dar. Die Software wird bereitgestellt wie gesehen ohne Zusage, dass sie fehlerfrei ist oder für irgendeinen bestimmten Zweck geeignet ist.

## Tech-Stack

- React + Vite
- Tailwind CSS (Dark Mode only)
- `nostr-tools`
- PWA: `vite-plugin-pwa` (Service Worker + Offline-Fallback)

## Bild-Upload (NIP-96)

- **Default**: Brezn nutzt standardmäßig einen **NIP-96** Upload-Server (Discovery via `/.well-known/nostr/nip96.json`). Du kannst den Endpoint in der App unter **Filter → Bild-Upload** ändern oder durch „leer speichern“ deaktivieren.
- **Terminal-Test**:

```bash
node scripts/test-nip96-upload.mjs
```

Optional:

```bash
MEDIA_SERVER=https://files.sovbit.host node scripts/test-nip96-upload.mjs
MEDIA_FILE=/pfad/zu/bild.png node scripts/test-nip96-upload.mjs
```

## Entwicklung

```bash
npm install
npm run dev
```

Build/Preview:

```bash
npm run build
npm run preview
```

## GitHub Actions (Build + Upload / Pages)

- **GitHub Pages Deploy**: `.github/workflows/deploy-pages.yml` deployed bei Push auf `main` nach GitHub Pages.

