# Brezn Installation Guide

## ⚡ Desktop Quickstart (Empfohlen)
Voraussetzungen: Rust Toolchain (rustup), optional Tor Dienst.

```bash
# Rust installieren (Linux/macOS)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env

# Projekt starten
cd brezn
cargo run --bin brezn-server
# -> http://localhost:8080
```

Optional: Tor aktivieren (lokaler SOCKS5 auf 9050), siehe Abschnitt „Tor Setup“ unten. API‑Beispiele finden sich im Root `README.md`.

---

## 🦀 Rust Installation

### Linux/macOS
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env
```

### Windows
```bash
# Download rustup-init.exe von https://rustup.rs/
# Oder via winget:
winget install Rust.Rust
```

### Android Development (optional)
```bash
# Install Android NDK
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android

# Set up Android environment variables
export ANDROID_HOME=$HOME/Android/Sdk
export NDK_HOME=$ANDROID_HOME/ndk/25.1.8937393
```

### iOS Development (optional)
```bash
# Install Xcode Command Line Tools
xcode-select --install

# Add iOS targets
rustup target add aarch64-apple-ios x86_64-apple-ios
```

## 📱 React Native Setup (experimentell/optional)

### Prerequisites
```bash
# Install Node.js (v18+)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18

# React Native CLI
npm install -g @react-native-community/cli

# Capacitor (optional)
npm install -g @capacitor/cli
```

### Create React Native App
```bash
npx react-native init BreznApp --template react-native-template-typescript
cd BreznApp
npm install @capacitor/core @capacitor/cli
npx cap init Brezn com.brezn.dev
npx cap add android
npx cap add ios
```

## 🔧 Build Instructions

### Rust Library
```bash
cd brezn
cargo check
cargo build
cargo build --release
cargo test
```

### Android Build (optional)
```bash
cargo build --target aarch64-linux-android --release
cargo build --target armv7-linux-androideabi --release
cargo build --target i686-linux-android --release
cargo build --target x86_64-linux-android --release

# In Android‑Projekt kopieren
cp target/aarch64-linux-android/release/libbrezn.so ../BreznApp/android/app/src/main/jniLibs/arm64-v8a/
cp target/armv7-linux-androideabi/release/libbrezn.so ../BreznApp/android/app/src/main/jniLibs/armeabi-v7a/
cp target/i686-linux-android/release/libbrezn.so ../BreznApp/android/app/src/main/jniLibs/x86/
cp target/x86_64-linux-android/release/libbrezn.so ../BreznApp/android/app/src/main/jniLibs/x86_64/

cd ../BreznApp
npx cap build android
```

### iOS Build (optional)
```bash
cargo build --target aarch64-apple-ios --release
cargo build --target x86_64-apple-ios --release

lipo -create \
  target/aarch64-apple-ios/release/libbrezn.a \
  target/x86_64-apple-ios/release/libbrezn.a \
  -output libbrezn.a

cp libbrezn.a ../BreznApp/ios/BreznApp/
cd ../BreznApp
npx cap build ios
```

## 🐳 Docker Development (optional)
```bash
docker build -t brezn-dev .
docker run -it --rm -v $(pwd):/app brezn-dev
```

## 🔒 Tor Setup

### Install Tor
```bash
# Ubuntu/Debian
sudo apt-get install tor
# macOS
brew install tor
# Windows
# Download von https://www.torproject.org/download/
```

### Configure Tor
```bash
# /etc/tor/torrc
SocksPort 9050
DataDirectory /var/lib/tor
```

### Start Tor Service
```bash
# Linux
sudo systemctl start tor
sudo systemctl enable tor
# macOS
brew services start tor
```

## 🧪 Testing
```bash
# Unit-Tests
cargo test

# P2P-Schnelltest (experimentell)
./scripts/tests/test_p2p.sh
```

## 🐛 Troubleshooting
```bash
# Rust nicht gefunden
export PATH="$HOME/.cargo/bin:$PATH"

# Tor prüfen
sudo systemctl status tor
curl --socks5 localhost:9050 http://httpbin.org/ip
```

## 📚 Next Steps
1. React Native UI vervollständigen (optional)
2. Peer Discovery erweitern
3. Sicherheit erhöhen (Anti‑Spam, Rate‑Limiting)
4. Performance optimieren
5. Tests ausbauen
6. API‑/User‑Doku erweitern