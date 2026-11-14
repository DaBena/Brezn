# Datenschutzhinweis

Ich habe diesen Client gebaut. Wie du ihn nutzt, liegt bei dir. Lies das, bevor du etwas Sensibles veröffentlichst. Tor hilft nicht, wenn du dich mit wiederverwendeten Nicknames, verknüpften Konten oder einem festen Postingrhythmus selbst deanonymisierst. Daten, die schon auf Relays liegen, und ein verlorener Privatschlüssel lassen sich in der Regel nicht zurückholen. Veröffentliche keine unnötigen oder sensiblen personenbezogenen Daten über andere oder dich selbst (Nickname und grobe Geohash-Zelle sind oft schon personenbezogen). Der formelle DSGVO-Teil steht in [Abschnitt 10](#10-formelle-datenschutzinformationen-dsgvo). Englische Fassung: [`PRIVACY.md`](PRIVACY.md).

---

## Inhaltsverzeichnis

1. [Wer macht was](#1-wer-macht-was)
2. [Lokaler Speicher](#2-lokaler-speicher)
3. [Relays](#3-relays)
4. [Geohash und Karte](#4-geohash-und-karte)
5. [Schlüssel, Löschen, DMs](#5-schlüssel-löschen-dms)
6. [Medien](#6-medien)
7. [Gerätezugriff](#7-gerätezugriff)
8. [Tor Browser](#8-tor-browser)
9. [Dritte und Haftung](#9-dritte-und-haftung)
10. [Formelle Datenschutzinformationen (DSGVO)](#10-formelle-datenschutzinformationen-dsgvo)

---

## 1. Wer macht was

Kontakt zum Anbieter steht im [Impressum](https://mein.online-impressum.de/dabena/). Der Anbieter stellt den Brezn-Client bereit (Quellcode, Web-Build, optional APK) und liefert eingebaute Standard-Relays sowie einen Standard-Media-Host nur als Bootstrapping, damit der Einstieg ohne leere Liste möglich ist - das ist keine Empfehlung bestimmter Betreiber. Du kannst und sollst die Endpunkte in den Einstellungen jederzeit durch eigene ersetzen.

Der Web-Build läuft üblicherweise auf GitHub Pages, sodass GitHub Zugriffe protokollieren kann, wenn du die Seite oder ein Release lädst ([GitHub Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement)). Bei der Nutzung verbindet sich dein Browser mit Relays, Media-Hosts und (wenn du die Karte öffnest) Kachelanbietern. Der Anbieter betreibt diese Server nicht und kann weder lesen noch löschen, was sie speichern. Einstellungen und Schlüssel bleiben auf deinem Gerät und werden nicht an den Anbieter hochgeladen.

---

## 2. Lokaler Speicher

Nachdem du durch Standortwahl (GPS-Freigabe oder Kartenklick) dem Erststarthinweis zugestimmt hast, wird damit auch der lokale Speicher freigeschaltet. Dann speichert der Browser den Privatschlüssel (zufällig erzeugt oder importiert; ohne Freischaltung nur im Arbeitsspeicher) sowie Einstellungen wie Relays und Theme, Einwilligungskennzeichen und Profil-Caches (IndexedDB / Dexie). Die Oberfläche folgt der Spracheinstellung des Browsers und wird nicht separat als Brezn-Einstellung gespeichert.

Ist Web Crypto verfügbar, wird der Privatschlüssel mit AES-GCM umhüllt; der dafür genutzte Wrapping-Schlüssel liegt jedoch im selben Browserspeicher (IndexedDB) auf demselben Gerät. Das ist Verschleierung gegen beiläufiges Auslesen auf dem Gerät, kein Passworttresor und kein Schutz, wenn jemand schon deine Festplatte oder denselben Browserspeicher dieser Website hat. Fehlt Web Crypto, speichert der Client den Schlüssel unverschlüsselt (Klartext) im Browserspeicher. Die letzte Geohash-Zelle kann zusätzlich in localStorage für den Feed und den Composer liegen. Nach dieser Einwilligung darf ein Service Worker Cache Storage für die PWA unter dieser Website nutzen.

Diese lokalen Daten gehen nicht an den Anbieter. Lokal lesbar sind sie für dich, für Software im selben Browserprofil und derselben Website, für Festplatten-Forensik, für mächtige Browsererweiterungen und für XSS unter derselben Website (Same-Origin). Sichere den geheimen Schlüssel (`nsec`, siehe Abschnitt 5) offline, wenn die Identität wichtig ist.

Zum Löschen der Websitedaten in Chromium: Seiteninformationen oder Entwicklertools unter Application, oder Websitedaten in den Einstellungen. In Firefox oder Tor Browser: Schloss-Symbol oder Storage in den Entwicklertools. Das entfernt nur den Speicher dieser Website (Schlüssel, Einstellungen, Caches) - nicht Tor-Circuits und nicht die Daten anderer Sites. Events auf Relays bleiben (Abschnitt 5). New Identity und Beenden von Tor Browser: Abschnitt 8.

---

## 3. Relays

Brezn erreicht Relays über verschlüsselte WebSockets (`wss://`) über die Nostr-Bibliothek NDK. Die Standard-Relays und der übliche GitHub-Pages-Deploy nutzen `wss://`; unverschlüsseltes `ws://` blockiert der Browser auf HTTPS-Seiten oft als Mixed Content. In den Einstellungen kannst du Relays jederzeit ändern. Bis dahin öffnet Brezn Verbindungen zu den eingebauten Standard-Relays (nur Bootstrapping, keine Betreiber-Empfehlung), sobald der Client startet, nicht erst beim Veröffentlichen. Die Betreiber nehmen die Verbindung entgegen und erhalten dabei deine öffentliche IP (oder bei Tor eine Exit-IP; Abschnitt 8). Sie können diese Verbindungsdaten protokollieren.

Was ein Relay mit Verbindungsdaten und Events macht, bestimmst du nicht. Es kann Logs führen, Events länger behalten als dir lieb ist, Löschbitten ignorieren oder Beiträge mit Verbindungszeiten korrelieren - absichtlich oder einfach nach eigener Praxis. Jedes zusätzliche Relay ist eine weitere Partei, die deinen öffentlichen Schlüssel (Pubkey), deine Events und Timing-Metadaten erhalten und speichern kann.

Verlässt du Relays, bei denen dein öffentlicher Schlüssel mit einer IP oder Sitzung verknüpft worden sein könnte, erzeuge beim Wechsel in den Einstellungen ein neues Schlüsselpaar. Dieselbe `npub` behält die Verknüpfung. Altes `nsec` vorher sichern. Beiträge, die schon im Netz sind, bleiben unter dem alten öffentlichen Schlüssel.

---

## 4. Geohash und Karte

Ein Geohash ist eine kurze Zeichenkette, die eine rechteckige Zelle auf der Erdoberfläche bezeichnet - nicht einen GPS-Punkt. Je mehr Stellen, desto kleiner die Zelle. Eine fünfstellige Zelle misst grob 5 x 5 km, abhängig vom Breitengrad.

Brezn nutzt Geohash-Zellen für ortsbezogene Feeds und Beiträge. Stammbeiträge erhalten öffentliche `g`-Tags mit der vollen Zelle und ihren kürzeren Prefixen (zum Beispiel `u0m1x` zusammen mit `u`, `u0`, `u0m`, `u0m1`). So finden Relays und Clients die Note über Geo-Abfragen (`#g`) auf mehreren Präzisionen. Antworten (Replies) tragen keine `g`-Tags; sie bleiben öffentliche Nostr-Events vom Typ kind 1, nur ohne Ortstags. Brezn schreibt kein Roh-GPS in Tags oder Abfragen: GPS dient nur geräteseitig dazu, eine Zelle abzuleiten. Tipst du Koordinaten selbst in den Beitragstext, ist dieser Text trotzdem öffentlich. Zell-Tags bleiben lesbar, solange Relays das Event behalten.

Die In-App-Karte zeigt Geohash-Zellen. Du kannst eine Zelle frei wählen, indem du auf die Karte klickst (auch beim Erststart und später über Plus); alternativ GPS oder manuelle Geohash-Eingabe. Beim ersten Start zeigt die Karte eine Weltübersicht: Dabei können grobe OSM-Übersichtskacheln schon geladen werden, bevor du per Standortwahl dem Hinweis zugestimmt und den lokalen Speicher freigeschaltet hast. Das ist eine Netzwerkanfrage an den Kachelanbieter (nicht der IndexedDB-Schlüsselspeicher) und kann Verbindungsdaten wie deine IP übermitteln; der Kachelanbieter sieht dabei höchstens einen groben Kartenausschnitt, keinen fein aufgelösten Standort wie bei GPS oder einer gewählten Geohash-Zelle.

Die Karte lädt OSM-Kacheln von `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`. Nutzung und Datenschutz der Kacheln: [Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/) und [OSMF Privacy Policy](https://osmfoundation.org/wiki/Privacy_Policy). Manche Distanz-Links führen zu `esp.info` (externe Zell-/Distanzansicht im Browser). Hinweise zu öffentlicher Zelle, Geo-Jittering und Timing: Abschnitt 8.

---

## 5. Schlüssel, Löschen, DMs

Deine Nostr-Identität ist ein Schlüsselpaar, kein Konto beim Anbieter. Der öffentliche Schlüssel (`npub` / Pubkey) ist deine Adresse im Netz: Beiträge und Profile hängen daran, und jeder kann ihn lesen. Der geheime Schlüssel (`nsec`) beweist die Kontrolle über diese Identität: Nur wer ihn hat, kann als diese Identität posten, Löschungen anfragen, Direktnachrichten entschlüsseln oder die Identität weitergeben. Deshalb bleibt `nsec` privat - teile ihn nicht, poste ihn nicht und gib ihn nicht in fremde Websites oder Erweiterungen ein. Es gilt sinngemäß dasselbe wie bei Krypto-Wallets: Ohne deine Schlüssel hast du die Kontrolle über die Identität nicht - und wer dein `nsec` hat, hat sie.

Es gibt keine Cloud-Konten beim Anbieter und keinen serverseitigen Passwort-Reset. Sobald der Client eine Identität braucht, erzeugt Brezn lokal ein zufälliges Schlüsselpaar (oder du importierst eines). Dauerhaft im Browserspeicher dieses Geräts für diese Website landet es erst, nachdem der lokale Speicher durch die Standortwahl freigeschaltet ist (Details und Schutzgrenzen: Abschnitt 2); vorher bleibt es nur im Arbeitsspeicher der laufenden Sitzung. Der Anbieter erhält das Paar nicht und kann es weder einsehen noch wiederherstellen.

Die Identität bleibt typischerweise so lange erhalten, bis du die Websitedaten dieser Website löschst, in den Einstellungen bewusst ein neues Paar erzeugst oder - in Tor Browser - New Identity nutzt bzw. den Browser beendest (Details: Abschnitt 8). Ohne vorheriges Offline-Backup von `nsec` ist ein verlorener Schlüssel in der Regel unwiederbringlich: Beiträge auf Relays können unter dem alten öffentlichen Schlüssel weiter sichtbar sein, aber du kannst sie nicht mehr als diese Identität steuern.

In den Einstellungen kannst du ein `nsec` importieren oder ein neues Schlüsselpaar erzeugen. Ohne `nsec` kannst du kein Lösch-Event vom Typ kind 5 (NIP-09) senden. Ein solches Event ist nur eine unverbindliche Bitte an Relays nach dem Nostr-Protokoll - keine Löschzusage und keine Moderation durch den Anbieter. Relays können Spiegel behalten oder die Bitte ignorieren. Technisch gibt es keinen netzweiten Löschknopf: Weder du noch der Anbieter könnt Löschung auf sämtlichen Relays erzwingen. Das schließt nicht aus, dass Betroffene unter den gesetzlichen Voraussetzungen Löschansprüche (etwa Art. 17 DSGVO) gegenüber einem verantwortlichen Relay- oder Media-Host-Betreiber geltend machen können - das ist dann Sache dieses Betreibers, nicht des Brezn-Anbieters.

Direktnachrichten nutzen clientseitige Verschlüsselung (NIP-17 Gift Wrap / NIP-44): Der Nachrichteninhalt bleibt für Relay-Betreiber typischerweise unlesbar. Relays erhalten trotzdem die verschlüsselten Hüllen und können sie speichern, einschließlich Zeitmetadaten, öffentlicher Schlüssel im Wrap-Ablauf und deiner Verbindungs-IP. Behandle Direktnachrichten nicht so, als wären Hüllen und Metadaten für Betreiber unsichtbar.

---

## 6. Medien

Vor dem Hochladen entfernt Brezn Dateimetadaten so gut wie möglich (Bilder per Neukodierung, MP4/MOV per Containerbereinigung). Das ist keine Garantie auf Vollständigkeit und deckt weder den Bildinhalt selbst noch Host-Logs oder die IP beim Hochladen ab. Bis du es in den Einstellungen änderst, gehen Uploads an einen eingebauten Standard-NIP-96-Host. Dieser Host erhält mit dem Upload deine öffentliche IP (oder bei Tor eine Exit-IP) und kann sie nach eigener Richtlinie speichern.

---

## 7. Gerätezugriff

Auf gewöhnlichen Betriebssystemen sind Browserspeicher und Caches nach Beschlagnahme oft lesbar. Wer das Gerät oder das Browserprofil hat, kann lokale Schlüssel und Einstellungen auslesen (Abschnitt 2). Eine stärkere Einrichtung mit Tor und flüchtigem Speicher: Abschnitt 8 (Tails).

---

## 8. Tor Browser

Ohne Tor erhalten Relays, Media-Hosts und ähnliche Dienste über die TCP-Verbindung deine echte öffentliche IP und können sie protokollieren. Das gilt für normalen Browser, installierte PWA und APK. Die APK ist kein Tor Browser und leitet Verbindungen nicht über Tor; behandle sie wie jede andere App.

Ein aktueller [Tor Browser](https://support.torproject.org/tor-browser/getting-started/about-tor-browser/) leitet die Verbindungen dieses Browsers einschließlich Relay-WebSockets über Tor. Clearnet-Dienste erhalten dann eine Tor-Exit-IP statt deiner Heim-IP und können diese Exit-IP protokollieren. Relays und Media-Hosts sehen damit nicht deine Heim-IP - genau das ist der Zweck von Tor. Dein Internetanbieter oder der Tor-Entry-Guard kann weiterhin erkennen, dass du Tor nutzt. Am Exit ist erkennbar, welches Relay bzw. welchen Host du erreicht hast. Öffentlicher Schlüssel, Beitragstext und Geohash bleiben trotzdem öffentlich, wenn du sie veröffentlichst.

Nutze Brezn in einem Tor-Browser-Tab, wenn du verhindern willst, dass Relays und Media-Hosts deine Heim-IP erhalten. Installiere es nicht als PWA aus Chrome, Edge, Safari oder gewöhnlichem Firefox und erwarte denselben Schutz: dieser eigenständige App-Pfad leitet den Verkehr außerhalb von Tor, sodass Relays und Media-Hosts deine echte IP erhalten. Der Desktop-Tor-Browser bietet keine gewöhnliche PWA-Installation wie Chrome oder Edge. Unter Android hilft eine Homescreen-Verknüpfung nur dann für denselben Tor-Schutz, wenn sie innerhalb von Tor Browser öffnet. Nur weil Tor Browser installiert ist, laufen andere Apps auf dem Gerät nicht über Tor.

Schlüssel und Einstellungen liegen im Tor-Browser-Speicher für diese Website. New Identity, Beenden von Tor Browser oder Löschen der Websitedaten entfernen den lokalen `nsec` typischerweise; ohne Offline-Backup ist die Identität dann verloren. Tor anonymisiert weder Nickname noch Geohash, Schreibstil oder Inhalt. Vermeide wiederkehrende Muster, wenn dir der Schutz deiner Heim-IP allein nicht reicht. Mit Tor Browser halte die Relay-Liste kurz und nutze nur Betreiber, denen du wirklich vertraust; Tor macht den Betreiber nicht vertrauenswürdig. Die eingebauten Standard-Relays sind auch hier nur Bootstrapping, keine Empfehlung.

Tor verhindert, dass Relays deine Heim-IP erhalten - nicht, dass die Geohash-Zelle im Beitrag öffentlich ist (Abschnitt 4). Ein fünfstelliger Geohash deines tatsächlichen Standorts bleibt öffentlich und schränkt die Anonymitätsmenge schon auf Personen ein, die plausibel in dieser grob 5 km großen Zelle sein können. Eine stabile Heim- oder Arbeitszelle plus regelmäßige Postingzeiten verrät weiterhin Gewohnheiten. Wenn du mit Tor anonym bleiben willst, veröffentliche nicht die Geohash-Zelle deines tatsächlichen Standorts.

Geo-Jittering heißt: die veröffentlichte Zelle bewusst verschieben oder verkürzen - auf der Karte neben dem echten Ort klicken, den Geohash in der Oberfläche ändern oder auf weniger Stellen kürzen. Dafür brauchst du kein GPS. Koordinaten landen nur dann im Netz, wenn du sie selbst in den Beitragstext tippst.

Wer mehr als eine Seite des Pfads beobachten kann (dein Zugangsnetz oder Tor-Entry sowie Exit oder Relay), kann versuchen, deinen Verkehr zeitlich mit einem Event am Relay abzugleichen. Das setzt in der Regel einen starken Angreifer voraus. Tor hilft gegen einen lokalen Beobachter, der Exit- oder Relay-Seite nicht mitbeobachten kann. Gegen Akteure, die beide Enden beobachten können, hilft es weniger. Tor ist für latenzarmes Web gebaut, nicht für starkes Delay-Padding. Eine öffentliche Geohash-Zelle macht solche Korrelationen leichter: Wer „Post aus Zelle X um Zeit T“ mit Tor-Nutzung aus Netzen zusammenführt, die diese Zelle abdecken, macht die Anonymitätsmenge noch kleiner - deshalb Geo-Jittering und unregelmäßige Postingzeiten.

Eine übliche, robustere Einrichtung ist [Tails](https://tails.net/): Tails hält das Dateisystem im RAM, löscht beim Herunterfahren und leitet den Netzverkehr durch Tor. Tails ist darauf ausgelegt, ohne Persistence keine Nutzerdaten dauerhaft auf der internen Festplatte des Host-Rechners abzulegen. Das ist keine Garantie gegen sämtliche Spuren außerhalb des Tails-Systems, beispielsweise durch Firmware, kompromittierte Hardware oder externe Überwachung.

---

## 9. Dritte und Haftung

Feeds, Profile, Medien und Karten laden Inhalte Dritter außerhalb der Kontrolle des Anbieters. Stummschalten und Blockieren bleiben auf dem Gerät. Gibst du beim Blockieren einen Report-Grund an, sendet Brezn ein NIP-56-Report-Event (kind 1984) an deine Relays; ohne Grund bleibt nur die lokale Blockliste. Dieses Report-Event ist eine Protokollmeldung an Relays, kein Moderations- oder Durchsetzungsversprechen des Anbieters. Ob Relays den Report speichern oder darauf reagieren, liegt bei den Betreibern.

Brezn ist kostenlose Software ohne Versprechen von Anonymität oder Verfügbarkeit. Du bist für Schlüssel, Veröffentlichungen und rechtmäßige Nutzung verantwortlich.

---

## 10. Formelle Datenschutzinformationen (DSGVO)

Dieser Abschnitt ist die formelle Information nach Art. 12-14 DSGVO. Er ergänzt die Abschnitte 1-9. Bei Konflikt mit zwingendem Recht gilt das Recht.

### Verantwortlicher

**Verantwortlicher** für die hier beschriebene Verarbeitung im Zusammenhang mit dem Angebot des Brezn-Clients: der im [Impressum](https://mein.online-impressum.de/dabena/) genannte Anbieter.

Es ist **kein Datenschutzbeauftragter** bestellt. Datenschutzanfragen: über die Kontaktdaten im Impressum.

Dieser Hinweis richtet sich insbesondere an Nutzerinnen und Nutzer in der EU/EWR und an Verarbeitungen im Zusammenhang mit dem Angebot des Clients aus Deutschland (Bayern).

### Rollen (was der Anbieter ist / nicht ist)

- **Anbieter als Verantwortlicher (begrenzt):** Bereitstellung von Software und Dokumentation; Verteilung der Builds über GitHub; Mitliefern von Standard-Relay-/Media-Endpunkten nur als Bootstrapping (keine Betreiber-Empfehlung); Gestaltung, was der Client auf dem Gerät speichert und welche Dritt-URLs er bei Nutzung aufrufen kann; optionale NIP-56-Reports, die du über den Client sendest.
- **Keine anbietereigenen Server:** Der Anbieter betreibt keine Nostr-Relays oder Media-Hosts und hostet den Inhalt deiner Beiträge nicht in anbietereigenen Datenbanken. Events und Medien, die du veröffentlichst, verarbeiten die Betreiber, zu denen du dich verbindest (oder die Bootstrap-Endpunkte, die du noch nicht geändert hast). Diese Betreiber sind typischerweise **eigene Verantwortliche** für ihre Logs und gespeicherten Events. Rechte gegen sie musst du bei ihnen geltend machen.
- **GitHub:** Beim Laden von Pages oder Releases verarbeitet GitHub Zugriffsdaten nach eigenen Bedingungen und seiner [Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement). Der Anbieter nutzt GitHub zum Hosten und Ausliefern der Builds; die Verarbeitung der Zugriffslogs bestimmt GitHub.
- **Du:** Du entscheidest, was du veröffentlichst, welche Relays/Media-Hosts du nach dem ersten Start nutzt, ob Geolocation erlaubt ist und ob du Reports sendest.

Der Anbieter **verkauft** keine personenbezogenen Daten und betreibt **keine** Werbe- oder Analytics-Tracker in Brezn.

### Gegenstand dieses Hinweises

1. Bereitstellung des Clients (GitHub-Pages-Build, Repository, optionale APK auf GitHub Releases).
2. Geräteseitiger Speicher und Zugriff durch die Software (localStorage, IndexedDB, Cache Storage / Service Worker) und Geolocation über den Browser.
3. Netzwerkanfragen des Clients bei Nutzung (Relays, Medien, Kartenkacheln, optionale `esp.info`-Links).
4. Optionale NIP-56-Report-Events.

### Quellen personenbezogener Daten

- **Von dir / deinem Gerät:** eingegebene Inhalte; gesetzter Geohash; erzeugte oder importierte Schlüssel; Einstellungen; Einwilligungen; hochgeladene Dateien.
- **Vom Browser/Betriebssystem:** IP und sonstige Verbindungsmetadaten, die Hosts bei deiner Verbindung erhalten; ungefährer Kartenausschnitt bei Kacheln; präzise Koordinaten nur bei erlaubter Geolocation (geräteseitig zur Ableitung einer Zelle, nicht als Roh-GPS an Relays).
- **Von Dritten:** Profil- und Feed-Events, die dein Client von Relays holt; geladene Media-URLs.

### Kategorien von Daten

| Kontext                 | Beispiele                                                                                                |
| ----------------------- | -------------------------------------------------------------------------------------------------------- |
| Auslieferung Site / APK | IP, Zeit, User-Agent, referrerähnliche Daten, Download-Metadaten bei GitHub                              |
| Auf dem Gerät           | Einstellungen, Privatschlüssel, Einwilligungskennzeichen, letzter Geohash, Profil-Caches, SW-Caches      |
| Nostr-Nutzung           | Öffentliche Events (Text, `g`-Tags, Media-URLs), öffentlicher Schlüssel, Verbindungs-IP bei Relays/Hosts |
| Reports                 | NIP-56-Event: gemeldeter Pubkey/Event, dein Grundtext, dein Pubkey                                       |

Eine Geohash-Zelle ist kein GPS-Fix, kann aber trotzdem **personenbezogene Daten** sein. Nutzerinhalte können zufällig besondere Kategorien (Art. 9 DSGVO) enthalten, wenn du sie in einen Beitrag schreibst; der Anbieter fordert solche Daten nicht an und hat kein serverseitiges Mittel, jede Relay-Kopie zu filtern.

### Zwecke und Rechtsgrundlagen

| Zweck                                                                                                         | Rechtsgrundlage                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Angebot und Dokumentation des kostenlosen Clients                                                             | Art. 6 Abs. 1 lit. f DSGVO - berechtigtes Interesse an der Bereitstellung freier Software und Information. Abwägung: offene Verteilung, keine Ads/Tracker, begrenzte anbieterseitige Daten; Nutzerinnen und Nutzer können auf Veröffentlichung verzichten oder Tor/Self-Hosting nutzen. |
| Hosting/Auslieferung der Builds über GitHub                                                                   | Art. 6 Abs. 1 lit. f DSGVO; eigene Grundlagen/Bedingungen von GitHub für deren Logs                                                                                                                                                                                                     |
| Strikt erforderlicher Gerätespeicher für einen von dir angeforderten Dienst nach Opt-in (z. B. Einstellungen) | § 25 Abs. 2 Nr. 2 TDDDG, soweit anwendbar                                                                                                                                                                                                                                               |
| Sonstiger Gerätespeicher/Zugriff (Caches, Service Worker) und Geolocation                                     | Art. 6 Abs. 1 lit. a DSGVO und § 25 Abs. 1 TDDDG (Einwilligung). Widerruf durch Löschen der Websitedaten / Verweigern der Erlaubnis; Funktionen können entfallen.                                                                                                                       |
| Client-initiierte Verbindungen zu Relays, Medien, Karten, externen Zell-Links                                 | Deine Nutzung des Clients; Dritte verarbeiten als eigene Verantwortliche nach ihren Hinweisen. Standardendpunkte sind nur als Bootstrapping mitgeliefert (keine Betreiber-Empfehlung), damit die App vor dem Anpassen der Einstellungen läuft.                                          |
| Optionaler NIP-56-Report                                                                                      | Art. 6 Abs. 1 lit. a DSGVO (du sendest ihn bewusst)                                                                                                                                                                                                                                     |

**Bereitstellung von Daten:** Du bist nicht gesetzlich verpflichtet, personenbezogene Daten anzugeben, um einen statischen Download der Software zu nutzen. Ohne Netz und ohne Standortwahl (mit Zustimmung zum Hinweis und Freischalten des lokalen Speichers) funktionieren viele Funktionen nicht. Veröffentlichen ist freiwillig und im Netz typischerweise irreversibel.

### Empfänger / Kategorien von Empfängern

- GitHub (Pages, Repository, Releases), wenn du dort lädst oder herunterlädst.
- Relay-Betreiber auf deiner Liste (eingebaute Standard-Relays ab erstem Start nur als Bootstrapping, bis geändert).
- Media-Hosts (einschließlich des eingebauten Standard-NIP-96-Hosts nur als Bootstrapping, bis geändert).
- OpenStreetMap-Kachel-Infrastruktur, wenn du die In-App-Karte öffnest.
- `esp.info`, wenn du einen Distanz-/Zell-Link öffnest.
- Kein Verkauf von Empfängerlisten; kein Brezn-Werbenetzwerk.

### Internationale Übermittlungen

GitHub und viele Relays, Media-Hosts oder CDNs können Daten **außerhalb der EU/EWR** verarbeiten. Für die GitHub-Auslieferung stützt sich der Anbieter auf die Übermittlungsmechanismen von GitHub (einschließlich Standardvertragsklauseln, soweit anwendbar). Für Relays und andere Hosts folgt die Übermittlung aus **deiner** Verbindung zu diesem Betreiber; siehe deren Dokumentation. Tor ändert, welche IP diese Betreiber erhalten; es beseitigt **nicht** den grenzüberschreitenden Charakter einer Clearnet-Verbindung.

### Speicherdauer

| Speicher                             | Dauer                                                                                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Anbieter-Datenbanken deiner Beiträge | Keine (der Anbieter betreibt keine)                                                                                                   |
| GitHub-Auslieferungslogs             | Nach GitHub-Richtlinie                                                                                                                |
| Korrespondenz über Impressum         | Nur soweit nötig zur Bearbeitung der Anfrage, danach Löschung oder Sperrung nach gesetzlichen Aufbewahrungspflichten                  |
| Gerätespeicher                       | Bis du Websitedaten dieser Website löschst, deinstallierst oder (Tor Browser) New Identity nutzt / den Browser beendest (Abschnitt 8) |
| Relay-/Media-/Kachel-Logs und Events | Nach jeweiligem Betreiber; der Anbieter kann sie nicht für dich löschen                                                               |

### Deine Rechte

Soweit anwendbar hast du Rechte auf **Auskunft, Berichtigung, Löschung, Einschränkung, Widerspruch** (einschließlich Art. 21 gegen Verarbeitungen nach Art. 6 Abs. 1 lit. f aus Gründen, die sich aus deiner besonderen Situation ergeben), **Datenübertragbarkeit** und **Widerruf einer Einwilligung** für die Zukunft (Art. 15-21 DSGVO). Der Widerruf berührt die Rechtmäßigkeit der Verarbeitung bis zum Widerruf nicht.

**Gegenüber dem Anbieter:** für Daten, die der Anbieter tatsächlich hält (z. B. E-Mail an die Impressum-Adresse), Kontakt über das Impressum. Der Anbieter reagiert innerhalb der gesetzlichen Fristen, soweit die DSGVO gilt.

**Gegenüber Relays, Media-Hosts, Kartenanbietern, GitHub:** die jeweilige Organisation kontaktieren. Der Brezn-Anbieter kann die Löschung von Nostr-Events, die im Netz gespiegelt sind, nicht erzwingen; gesetzliche Löschansprüche gegen einen verantwortlichen Relay- oder Host-Betreiber bleiben davon unberührt. NIP-09-Löschung aus dem Client ist nur eine Bitte an Relays (Abschnitt 5).

**Beschwerde (Art. 77 DSGVO):** Du kannst dich bei einer Aufsichtsbehörde beschweren, insbesondere am Ort deines Aufenthalts oder Arbeitsplatzes in der EU/EWR. Für dieses Angebot aus Bayern: [Bayerisches Landesamt für Datenschutzaufsicht (BayLDA)](https://www.lda.bayern.de/).

### Automatisierte Entscheidungen / Profiling

Keine automatisierten Entscheidungen mit Rechtswirkung oder ähnlich erheblicher Beeinträchtigung (Art. 22 DSGVO). Kein Werbe-Profiling durch den Anbieter in Brezn.

### Kinder

Brezn richtet sich nicht an Kinder oder Jugendliche unter 16 Jahren. Standortbezogene, öffentlich getaggte Beiträge und die damit verbundenen Einwilligungen sind nichts für Minderjährige. Nutze keine einwilligungsbasierten Funktionen, wenn du unter dem für dich geltenden Alter der digitalen Einwilligungsfähigkeit bist.

### Sicherheit (Kurz)

Transport zu Relays nutzt TLS über `wss://` (siehe Abschnitt 3). Umgang mit Privatschlüsseln auf dem Gerät: Abschnitt 2 (kein Passworttresor). Keine Maßnahme macht öffentliche Nostr-Beiträge oder ein kompromittiertes Gerät privat. Siehe auch Tor und Tails in Abschnitt 8.

### Änderungen

Der Anbieter kann diesen Hinweis anpassen, wenn sich Client oder Rechtslage ändern. Das Datum „Zuletzt aktualisiert“ unten ändert sich. Wesentliche Änderungen sollen in der Repository-Kopie dieser Datei sichtbar sein. Wenn du den Client danach weiter nutzt, gilt der neue Text für die spätere Nutzung; bereits auf Relays liegende Events werden dadurch nicht rückwirkend umgeschrieben. Einwilligungen kannst du widerrufen, indem du Websitedaten löschst bzw. Geräterechte verweigerst (Abschnitt 2 und Zwecke oben); für neue oder geänderte einwilligungsbasierte Verarbeitungen kann erneut eine Einwilligung nötig sein.

### Sprache

Deutsche Fassung: diese Datei (`DATENSCHUTZ.md`). Englische Fassung: [`PRIVACY.md`](PRIVACY.md). Für Nutzerinnen und Nutzer in Deutschland ist der deutsche Text als primäre DSGVO-Information gedacht. Bei Abweichungen gilt zwingendes Recht; ansonsten für DSGVO-Fragen diesen deutschen Text bevorzugen, für die praxisnahe Formulierung in den Abschnitten 1-9 ggf. auch die englische Fassung.

_Zuletzt aktualisiert: 2026-11-14._
