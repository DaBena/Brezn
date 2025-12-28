# Brezn

Brezn is like CB radio for the internet: local communication in your area, without central control. Brezn is a PWA client for the Nostr protocol and focuses on local networking using five-digit geohash (4.9 × 4.9 km cell).

## Installation

[Brezn](https://dabena.github.io/Brezn/) can be installed as a Progressive Web App (PWA) and then runs like a native app:

- **Android**: Banner "Add to Home Screen" or Menu → "Add to Home Screen"
- **iOS Safari**: Share button → "Add to Home Screen"

After installation, Brezn appears with the Brezn icon on the home screen/start menu and opens as a standalone app without browser UI.

## What is Nostr?

Nostr is an open protocol for social networks. Many independent relays store and distribute messages (Nostr events). Different Nostr apps speak the same protocol and can access the same content. Your identity consists of a key pair (npub/nsec) and is not bound to a server – you can sign in to different clients and keep the same account and posts everywhere. If a relay is blocked or goes offline, users can switch to others without losing their identity or posts.

## Network Architectures Compared

![Network Architectures Compared](diagramm.svg)

- **Classic social networks**: All users via a central server. The platform can censor content and exclude users.
- **Federated networks** (e.g., Mastodon): Users on different instances that communicate via an instance backbone. Each instance can enforce its own rules and block others.
- **Nostr**: Users connect to multiple relays simultaneously. Relays do **not** communicate directly with each other – communication runs through clients. For censorship to occur, **all shared relays** would need to cooperate – as long as just one shared relay doesn't cooperate, no censorship happens.

## What does Brezn do exactly?

Brezn is just a view of Nostr and not its own social network. The app loads, displays, and sends Nostr events that are stored on relays. With the same relays and keys, you see the same content in other Nostr clients (e.g., Amethyst, Damus, Coracle) – just in a different interface.

## Legal Notice

The developer of Brezn does not operate Nostr relays, host content, or store posts server-side. Posts are sent to relays configured by the user, which store and distribute content according to their own rules. The developer has no influence on content in the Nostr network and no access to external relays. Brezn only provides client-side moderation (keyword blocklist). Users are responsible for their own usage, keys and content.

## Tech Stack

- React + Vite
- Tailwind CSS
- `nostr-tools`
- PWA: `vite-plugin-pwa` (Service Worker + Offline Fallback)

## Development

```bash
npm install
npm run dev        # Development Server
npm run build      # Build
npm run preview    # Preview Build
```

**GitHub Pages**: Automatic deployment on push to `main` via `.github/workflows/deploy-pages.yml`.

## Acknowledgments

Many thanks to operators of public Nostr relays who make all of this possible.
