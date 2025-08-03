# 🥨 Brezn - Dezentrale Feed-App

## Projektbeschreibung

Brezn ist eine dezentrale Feed-App (ähnlich wie Jodel/X), die anonyme Beiträge in einem öffentlichen Feed ermöglicht. Das Projekt ist komplett dezentral, benötigt keine Server und ist als Open Source für F-Droid geplant.

## 🚀 Lokale Ausführung

### Voraussetzungen

Das Projekt benötigt Rust und einen C++-Compiler. Auf Windows gibt es zwei Optionen:

#### Option 1: Visual Studio Build Tools (Empfohlen)
```bash
# Installieren Sie Visual Studio Build Tools mit C++ Build Tools
winget install Microsoft.VisualStudio.2022.BuildTools --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools"
```

#### Option 2: MinGW-w64
```bash
# Installieren Sie MSYS2 und MinGW-w64
winget install MSYS2.MSYS2
# Dann in MSYS2: pacman -S mingw-w64-x86_64-gcc
```

### Ausführung

1. **Rust installieren** (falls noch nicht geschehen):
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

2. **Projekt kompilieren**:
```bash
cd brezn
cargo build
```

3. **Anwendung ausführen**:
```bash
cargo run
```

## 🛠️ Alternative Ausführung

Falls die Kompilierung auf Windows Probleme bereitet, können Sie:

1. **WSL (Windows Subsystem for Linux)** verwenden
2. **Linux-VM** nutzen
3. **Docker** mit Rust-Image verwenden

### Docker-Ausführung
```bash
docker run --rm -v ${PWD}:/app -w /app rust:latest cargo build
```

## 📱 Funktionen (Demo-Version)

Die aktuelle Demo-Version bietet:

- ✅ **Feed anzeigen**: Alle Posts chronologisch
- ✅ **Posts erstellen**: Neue anonyme Beiträge
- ✅ **Pseudonyme**: Wechselbare anonyme Handles
- ✅ **Mute-Funktion**: Störende Poster stummschalten
- ✅ **Netzwerk-Status**: Lokale Statistiken

## 🔮 Geplante Features

- 🌐 **I2P-Integration**: Anonyme Netzwerkverbindungen
- 📱 **QR-Code-Scanning**: Netzwerkbeitritt per QR
- 🔐 **Verschlüsselung**: Sichere Post-Speicherung
- 📊 **P2P-Synchronisation**: Posts zwischen Peers
- 🎨 **GUI**: Moderne Benutzeroberfläche mit egui

## 🏗️ Projektstruktur

```
brezn/
├── src/
│   ├── main.rs              # Hauptanwendung
│   └── types/
│       └── feed_post.rs     # Datentypen
├── Cargo.toml               # Dependencies
└── README.md               # Diese Datei
```

## 🐛 Bekannte Probleme

- **Linker-Fehler auf Windows**: Benötigt Visual Studio Build Tools
- **GCC nicht gefunden**: MinGW-w64 muss installiert sein
- **GUI-Dependencies**: eframe benötigt zusätzliche System-Dependencies

## 💡 Lösungsansätze

1. **Visual Studio Build Tools installieren**
2. **WSL für Linux-Umgebung verwenden**
3. **Docker für isolierte Entwicklungsumgebung nutzen**
4. **Minimal-Version ohne GUI-Dependencies verwenden**

## 📞 Support

Bei Problemen:
1. Prüfen Sie die Rust-Installation: `rustc --version`
2. Prüfen Sie Cargo: `cargo --version`
3. Installieren Sie die Build Tools
4. Versuchen Sie WSL für Linux-Umgebung

---

**Status**: Demo-Version funktional, GUI-Version benötigt Build Tools 