# Privacy notice

I built this client. How you use it is up to you. Read this before you publish anything sensitive. Tor will not help if you deanonymize yourself with reused nicknames, linked accounts or a fixed posting schedule. Data already on relays, and a private key you lose, usually cannot be walked back. Do not publish unnecessary or sensitive personal data about anyone, including yourself (a nickname and a coarse geohash cell are often already personal data). The formal GDPR notice is in [section 10](#10-formal-privacy-information-gdpr). German version: [`DATENSCHUTZ.md`](DATENSCHUTZ.md).

---

## Table of contents

1. [Who does what](#1-who-does-what)
2. [Local storage](#2-local-storage)
3. [Relays](#3-relays)
4. [Geohash and map](#4-geohash-and-map)
5. [Keys, deletion, DMs](#5-keys-deletion-dms)
6. [Media](#6-media)
7. [Device access](#7-device-access)
8. [Tor Browser](#8-tor-browser)
9. [Third parties and liability](#9-third-parties-and-liability)
10. [Formal privacy information (GDPR)](#10-formal-privacy-information-gdpr)

---

## 1. Who does what

Publisher contact is in the [legal notice (Impressum)](https://mein.online-impressum.de/dabena/). The publisher ships the Brezn client (source, web build, optional APK) and built-in default relays plus a default media host only as bootstrapping so first run is not an empty list - that is not an endorsement of those operators. You can and should replace the endpoints in settings anytime.

The web build usually runs on GitHub Pages, so GitHub may log access when you load the site or a release ([GitHub Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement)). When you use the app, your browser connects to relays, media hosts and (if you open the map) tile providers. The publisher does not run those servers and can neither read nor delete what they store. Settings and keys stay on your device and are not uploaded to the publisher.

---

## 2. Local storage

After you confirm the first-run notice by choosing a location (GPS permission or map click), local storage is unlocked as well. The browser then stores the private key (randomly generated or imported; before unlock it exists only in session memory) as well as settings such as relays and theme, consent flags and profile caches (IndexedDB / Dexie). The UI language follows the browser locale and is not stored separately as a Brezn setting.

When Web Crypto is available, the secret key is wrapped with AES-GCM; the wrapping key, however, lives in the same browser storage (IndexedDB) on the same device. That is at-rest obfuscation against casual inspection, not a password vault, and not protection if someone already has your disk or this site's browser storage. Without Web Crypto the client stores the key in plaintext in browser storage. The last geohash cell may also sit in localStorage for the feed and the composer. After that consent, a service worker may use Cache Storage for the PWA under this site.

None of that on-device data is sent to the publisher. It is readable locally by you, by software in the same browser profile and site, by disk forensics, by powerful extensions and by same-origin XSS. Keep an offline backup of the secret key (`nsec`, see section 5) if the identity matters.

To clear site data in Chromium, use site info or Developer Tools under Application storage, or clear site data in settings. In Firefox or Tor Browser, use the lock icon or Storage in Developer Tools. That removes only this site's storage (keys, settings, caches) - not Tor circuits and not other sites' data. Events on relays stay (section 5). New Identity and quitting Tor Browser: section 8.

---

## 3. Relays

Brezn reaches relays over encrypted WebSockets (`wss://`) through the Nostr library NDK. Defaults and the usual GitHub Pages deploy use `wss://`; plain `ws://` is often blocked as mixed content on HTTPS pages. You can change relays anytime in settings. Until you do, Brezn opens connections to the built-in defaults (bootstrapping only, not an operator recommendation) as soon as the client starts, not only when you publish. Operators receive the connection and your public IP with it (or a Tor exit IP when using Tor; section 8). They can log that connection data.

You do not control what a relay does with connection data and events. It may keep logs, retain events longer than you like, ignore deletion requests or correlate posts with connect times - on purpose or simply as its own practice. Every extra relay is another party that can receive your public key (pubkey), your events and timing metadata.

If you leave relays where your public key may have been linked to an IP or session, generate a new keypair in settings when you switch. Reusing the same `npub` keeps that link. Back up the old `nsec` first. Posts already on the network stay under the old public key.

---

## 4. Geohash and map

A geohash is a short string that names a rectangular cell on Earth - not a GPS point. More characters mean a smaller cell. A five-character cell is roughly 5 x 5 km depending on latitude.

Brezn uses geohash cells for location-based feeds and posts. Root posts get public `g` tags with the full cell and its shorter prefixes (for example `u0m1x` together with `u`, `u0`, `u0m`, `u0m1`). That lets relays and clients find the note via geo queries (`#g`) at several precisions. Replies get no `g` tags; they remain public kind 1 Nostr events, just without location tags. Brezn does not put raw GPS into tags or queries: GPS is used on-device only to derive a cell. If you type coordinates into the post text yourself, that text is still public. Cell tags remain readable for as long as relays keep the event.

The in-app map shows geohash cells. You can choose a cell freely by clicking the map (on first run and later via plus); alternatively use GPS or enter a geohash manually. On first run the map shows a world overview: coarse OSM overview tiles may already load before you confirm the notice by choosing a location and unlocking local storage. That is a network request to the tile provider (not IndexedDB key storage) and can send connection data such as your IP; the tile provider sees at most a coarse map view, not a fine-grained location the way GPS or a chosen geohash cell would.

The map loads OSM tiles from `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`. Tile use and privacy: [Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/) and [OSMF Privacy Policy](https://osmfoundation.org/wiki/Privacy_Policy). Some distance links lead to `esp.info` (external cell/distance view in the browser). For public cells, geo jittering and timing, see section 8.

---

## 5. Keys, deletion, DMs

Your Nostr identity is a keypair, not an account with the publisher. The public key (`npub` / pubkey) is your address on the network: posts and profiles are tied to it, and anyone can read it. The secret key (`nsec`) proves control of that identity: only someone who has it can post as that identity, request deletions, decrypt DMs, or transfer the identity. Keep `nsec` private - do not share it, post it, or paste it into other sites or extensions. The crypto-wallet rule applies in spirit: not your keys, not your identity (and whoever has your `nsec` has it).

There are no publisher cloud accounts and no server-side password reset. As soon as the client needs an identity, Brezn generates a random keypair locally (or you import one). It is written into this device's browser storage for this site only after local storage is unlocked by choosing a location (details and limits: section 2); before that it stays in the running session's memory only. The publisher never receives the pair and cannot view or recover it.

The identity typically lasts until you clear this site's data, deliberately create a new pair in settings, or - in Tor Browser - use New Identity or quit the browser (details: section 8). Without an offline `nsec` backup first, a lost key is usually gone for good: posts on relays may still show under the old public key, but you can no longer control them as that identity.

Settings let you import an `nsec` or generate a new keypair. Without `nsec` you cannot send a kind 5 / NIP-09 deletion event. Such an event is only a non-binding protocol request to relays - not a deletion promise and not moderation by the publisher. Relays may keep mirrors or ignore the request. Technically there is no network-wide delete button: neither you nor the publisher can force erasure on every relay. That does not rule out that, where the law applies, a data subject may still have erasure claims (e.g. Art. 17 GDPR) against a responsible relay or media-host operator - that is then for that operator, not for the Brezn publisher.

Direct messages use client-side encryption (NIP-17 gift wrap / NIP-44): message content is typically unreadable to relay operators. Relays still receive the encrypted envelopes and can store them, including timing metadata, public keys involved in the wrap flow, and your connection IP. Do not treat envelopes and metadata as invisible to operators.

---

## 6. Media

Before upload, Brezn removes file metadata as best it can (images by re-encoding, MP4/MOV by container cleanup). That is not a guarantee of completeness and does not cover image content itself, host logs or the IP used at upload time. Until you change it in settings, uploads go to a built-in default NIP-96 host. That host receives your public IP with the upload (or a Tor exit IP when using Tor) and can log it under its own policy.

---

## 7. Device access

On ordinary operating systems, browser storage and caches are often readable after seizure. Anyone with the device or browser profile can read local keys and settings (section 2). For a stronger setup with Tor and volatile storage, see section 8 (Tails).

---

## 8. Tor Browser

Without Tor, relays, media hosts and similar services receive your real public IP over the TCP connection and can log it. That applies to a normal browser, an installed PWA and the APK. The APK is not Tor Browser and does not route connections over Tor; treat it like any other app.

A current [Tor Browser](https://support.torproject.org/tor-browser/getting-started/about-tor-browser/) routes that browser's connections, including relay WebSockets, over Tor. Clearnet services then receive a Tor exit IP instead of your home IP, and they can log that exit IP. Relays and media hosts do not see your home IP that way - that is the point of Tor. Your ISP or Tor entry guard can still tell that you are using Tor. The exit hop learns which relay or host you reached. Public key, post text and geohash stay public if you publish them.

Use Brezn in a Tor Browser tab if you want to keep relays and media hosts from receiving your home IP. Do not install it as a PWA from Chrome, Edge, Safari or ordinary Firefox and expect the same protection: that standalone app path sends traffic outside Tor, so relays and media hosts receive your real IP. Desktop Tor Browser does not offer ordinary PWA install like Chrome or Edge. On Android a home-screen shortcut only gives the same Tor protection if it opens inside Tor Browser. Installing Tor Browser does not put other apps on the device onto Tor.

Keys and settings live in Tor Browser storage for this site. New Identity, quitting Tor Browser or clearing site data typically removes the local `nsec`; without an offline backup the identity is then lost. Tor does not anonymize nickname, geohash, writing style or content. Avoid recurring patterns if hiding your home IP alone is not enough. With Tor Browser, keep the relay list short and stick to operators you actually trust; Tor does not make the operator trustworthy. Built-in default relays are bootstrapping here too, not a recommendation.

Tor keeps relays from receiving your home IP - it does not keep the geohash cell in the post from being public (section 4). A five-character geohash of your actual location stays public and already shrinks the anonymity set to people who could plausibly be in that roughly 5 km cell. A stable home or work cell plus regular posting times still reveals habits. If you want to stay anonymous with Tor, do not publish the geohash cell of your actual location.

Geo jittering means deliberately shifting or shortening the published cell - click beside your real place on the map, edit the geohash in the UI, or shorten it. No GPS permission is required for that. Coordinates only reach the network if you type them into the post text yourself.

Someone who can observe more than one side of the path (your access network or Tor entry, and the exit or the relay) may try to match your traffic in time with an event that arrives at a relay. That usually takes a strong adversary. Tor helps against a local observer who cannot also watch the exit or relay side. It helps less against actors who can watch both ends. Tor is built for low-latency web use, not for strong delay padding. A public geohash cell makes such correlation easier: matching "post from cell X around time T" with Tor use from networks that cover that cell shrinks the anonymity set further - hence geo jittering and irregular posting times.

A common, stronger setup is [Tails](https://tails.net/): Tails keeps the filesystem in RAM, clears on shutdown and forces traffic through Tor. Without persistence, Tails is designed not to leave user data permanently on the host machine's internal disk. That is not a guarantee against all traces outside the Tails system, for example via firmware, compromised hardware or external surveillance.

---

## 9. Third parties and liability

Feeds, profiles, media and maps load third-party content outside the publisher's control. Mute and block stay on your device. If you enter a report reason when blocking, Brezn publishes a NIP-56 report event (kind 1984) to your relays; without a reason, only the local blocklist is updated. That report event is a protocol notice to relays, not a moderation or enforcement promise by the publisher. Whether relays store or act on the report is up to the operators.

Brezn is free software with no promise of anonymity or uptime. You are responsible for your keys, what you publish and lawful use.

---

## 10. Formal privacy information (GDPR)

This section is the formal information under Arts. 12-14 GDPR. It supplements sections 1-9. Where this notice and mandatory law conflict, the law prevails.

### Controller

**Controller** for processing described here as relating to the Brezn client offer: the publisher named in the [legal notice (Impressum)](https://mein.online-impressum.de/dabena/).

No **data protection officer** (DPO) is appointed. Privacy requests: use the Impressum contact.

This notice is aimed in particular at users in the EU/EEA and at processing connected with offering the client from Germany (Bavaria).

### Roles (what the publisher is / is not)

- **Publisher as controller (limited):** providing the software and documentation; choosing to distribute builds via GitHub; shipping default relay/media endpoints only as bootstrapping (not an operator endorsement); designing what the client stores on your device and which third-party URLs it may call when you use features; optional NIP-56 reports you choose to send through the client.
- **No publisher-run servers:** The publisher does not operate Nostr relays or media hosts and does not host the body of your posts on publisher-run databases. Events and media you publish are processed by the operators you (or the bootstrap endpoints you have not yet changed) connect to. Those operators are typically **independent controllers** for their own logs and stored events. Rights against them must be exercised with them.
- **GitHub:** When you load Pages or Releases, GitHub processes access data under its own terms and [privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement). The publisher uses GitHub to host and deliver builds; how GitHub processes access logs is set by GitHub.
- **You:** You decide what to publish, which relays/media hosts to use after first run, whether to allow geolocation, and whether to send reports.

The publisher does **not** sell personal data and does **not** run advertising or analytics trackers inside Brezn.

### Scope of this notice

1. Making the client available (GitHub Pages build, repository, optional APK on GitHub Releases).
2. On-device storage and access initiated by the software (localStorage, IndexedDB, Cache Storage / service worker) and geolocation via the browser.
3. Network requests the client makes when you use it (relays, media, map tiles, optional `esp.info` links).
4. Optional NIP-56 report events.

### Sources of personal data

- **From you / your device:** content you enter; geohash you set; keys generated or imported; settings; consents; files you upload.
- **From your browser/OS:** IP and other connection metadata that hosts receive when you contact them; approximate view area for map tiles; precise coordinates only if you allow geolocation (used on-device to derive a cell, not sent as raw GPS to relays).
- **From third parties:** profile and feed events your client fetches from relays; media URLs you load.

### Categories of data

| Context             | Examples                                                                              |
| ------------------- | ------------------------------------------------------------------------------------- |
| Site / APK delivery | IP, time, user agent, referrer-like data, download metadata at GitHub                 |
| On device           | Settings, private key, consent flags, last geohash, profile caches, SW caches         |
| Nostr use           | Public events (text, `g` tags, media URLs), public key, connection IP at relays/hosts |
| Reports             | NIP-56 event: reported pubkey/event, your reason text, your pubkey                    |

A geohash cell is not a GPS fix but can still be **personal data**. User-generated content may incidentally include special-category data (Art. 9 GDPR) if you put it in a post; the publisher does not seek such data and has no server-side means to filter every relay copy.

### Purposes and legal bases

| Purpose                                                                                                         | Legal basis                                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Offer and document the free client                                                                              | Art. 6(1)(f) GDPR - legitimate interest in providing free software and information. Balancing: open distribution, no ads/trackers, limited publisher-side data; users can abstain from publishing or use Tor/self-host paths. |
| Host/deliver builds via GitHub                                                                                  | Art. 6(1)(f) GDPR; GitHub's own bases/terms for their logs                                                                                                                                                                    |
| Strictly necessary on-device storage for a service you request after opt-in (e.g. settings so the client works) | § 25(2) no. 2 TDDDG where applicable                                                                                                                                                                                          |
| Other on-device storage/access (caches, SW) and geolocation                                                     | Art. 6(1)(a) GDPR and § 25(1) TDDDG (consent). Withdraw by clearing site data / refusing permission; features may stop working.                                                                                               |
| Client-initiated connections to relays, media, maps, external cell links                                        | Your use of the client; third parties process as their own controllers under their notices. Defaults ship only as bootstrapping (not an endorsement) so the app works before you edit settings.                               |
| Optional NIP-56 report                                                                                          | Art. 6(1)(a) GDPR (you choose to send it)                                                                                                                                                                                     |

**Provision of data:** You are not legally required to provide personal data to use a static download of the software. Without network use and without choosing a location (which confirms the notice and unlocks local storage), many features will not work. Publishing is voluntary and typically irreversible on the network.

### Recipients / categories of recipients

- GitHub (Pages, repo, Releases), if you load or download from there.
- Relay operators on your list (built-in defaults from first start as bootstrapping only, until changed).
- Media hosts (including the built-in default NIP-96 host as bootstrapping only, until changed).
- OpenStreetMap tile infrastructure if you open the in-app map.
- `esp.info` if you open a distance/cell link.
- No sale of recipient lists; no Brezn ad network.

### International transfers

GitHub and many relays, media hosts or CDNs may process data **outside the EU/EEA**. For GitHub delivery the publisher relies on GitHub's transfer mechanisms (including Standard Contractual Clauses where applicable). For relays and other hosts, the transfer follows from **your** connection to that operator; see their documentation. Tor changes which IP those operators receive; it does **not** remove the cross-border character of a clearnet connection.

### Retention

| Store                                | Duration                                                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Publisher databases of your posts    | None (the publisher does not run them)                                                                        |
| GitHub delivery logs                 | Per GitHub policy                                                                                             |
| Impressum correspondence             | Only as needed to handle the request, then delete or restrict per legal retention duties                      |
| Device storage                       | Until you clear this site's data, uninstall, or (Tor Browser) use New Identity / quit the browser (section 8) |
| Relay / media / tile logs and events | Per each operator; the publisher cannot delete them for you                                                   |

### Your rights

Depending on applicable law, you may have rights of **access, rectification, erasure, restriction, objection** (including Art. 21 objection to Art. 6(1)(f) processing on grounds relating to your particular situation), **portability**, and **withdrawal of consent** for the future (Arts. 15-21 GDPR). Withdrawal does not affect processing before withdrawal.

**Against the publisher:** for data the publisher actually holds (e.g. email you send to the Impressum address), contact via the Impressum. The publisher will respond within the statutory periods where GDPR applies.

**Against relays, media hosts, map providers, GitHub:** contact that organization. The Brezn publisher cannot compel erasure of Nostr events mirrored across the network; statutory erasure claims against a responsible relay or host operator remain unaffected. NIP-09 deletion from your client is only a request to relays (section 5).

**Complaint (Art. 77 GDPR):** You may lodge a complaint with a supervisory authority, in particular where you live or work in the EU/EEA. For this Bavaria-based offer the competent data protection authority is the [Bayerisches Landesamt für Datenschutzaufsicht (BayLDA)](https://www.lda.bayern.de/).

### Automated decision-making / profiling

No automated decision-making with legal or similarly significant effects (Art. 22 GDPR). No advertising profiling by the publisher inside Brezn.

### Children

Brezn is not directed at children or teens under 16. Location-tagged public posts and the related consents are not for minors. Do not use consent-based features if you are below the applicable digital consent age where you live.

### Security (summary)

Transport to relays uses TLS over `wss://` (see section 3). Private-key at-rest handling is described in section 2 (not a password vault). No measure makes public Nostr posts or a compromised device private. See also Tor and Tails notes in section 8.

### Changes

The publisher may update this notice when the client or legal requirements change. The "Last updated" date below will change. Material changes should be reflected in the repository copy of this file. If you keep using the client after an update is published, the new text applies to subsequent use; it does not retroactively rewrite events already on relays. You can withdraw consent by clearing site data or refusing device permissions (section 2 and purposes above); new or changed consent-based processing may require consent again.

### Language

English version: this file (`PRIVACY.md`). German version: [`DATENSCHUTZ.md`](DATENSCHUTZ.md). For users in Germany, the German text is intended as the primary GDPR information. If translations diverge, mandatory law prevails; otherwise prefer the German text for GDPR questions and this English text for the practical wording in sections 1-9.

_Last updated: 2026-11-14._
