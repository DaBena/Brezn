# Brezn Installation Guide

## 🦀 Rust Installation

### Linux/macOS
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env
```

### Windows
```bash
# Download rustup-init.exe from https://rustup.rs/
# Or use winget:
winget install Rust.Rust
```

### Android Development
```bash
# Install Android NDK
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android

# Set up Android environment variables
export ANDROID_HOME=$HOME/Android/Sdk
export NDK_HOME=$ANDROID_HOME/ndk/25.1.8937393
```

### iOS Development
```bash
# Install Xcode Command Line Tools
xcode-select --install

# Add iOS targets
rustup target add aarch64-apple-ios x86_64-apple-ios
```

## 📱 React Native Setup

### Prerequisites
```bash
# Install Node.js (v18+)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18

# Install React Native CLI
npm install -g @react-native-community/cli

# Install Capacitor
npm install -g @capacitor/cli
```

### Create React Native App
```bash
# Create the React Native app
npx react-native init BreznApp --template react-native-template-typescript

cd BreznApp

# Add Capacitor
npm install @capacitor/core @capacitor/cli
npx cap init Brezn com.brezn.dev

# Add platforms
npx cap add android
npx cap add ios
```

## 🔧 Build Instructions

### Rust Library
```bash
cd brezn

# Check if everything compiles
cargo check

# Build for development
cargo build

# Build for release
cargo build --release

# Run tests
cargo test
```

### Android Build
```bash
# Build Rust library for Android
cargo build --target aarch64-linux-android --release
cargo build --target armv7-linux-androideabi --release
cargo build --target i686-linux-android --release
cargo build --target x86_64-linux-android --release

# Copy libraries to Android project
cp target/aarch64-linux-android/release/libbrezn.so ../BreznApp/android/app/src/main/jniLibs/arm64-v8a/
cp target/armv7-linux-androideabi/release/libbrezn.so ../BreznApp/android/app/src/main/jniLibs/armeabi-v7a/
cp target/i686-linux-android/release/libbrezn.so ../BreznApp/android/app/src/main/jniLibs/x86/
cp target/x86_64-linux-android/release/libbrezn.so ../BreznApp/android/app/src/main/jniLibs/x86_64/

# Build Android app
cd ../BreznApp
npx cap build android
```

### iOS Build
```bash
# Build Rust library for iOS
cargo build --target aarch64-apple-ios --release
cargo build --target x86_64-apple-ios --release

# Create universal library
lipo -create \
  target/aarch64-apple-ios/release/libbrezn.a \
  target/x86_64-apple-ios/release/libbrezn.a \
  -output libbrezn.a

# Copy to iOS project
cp libbrezn.a ../BreznApp/ios/BreznApp/

# Build iOS app
cd ../BreznApp
npx cap build ios
```

## 🐳 Docker Development

### Development Container
```dockerfile
FROM rust:1.70

# Install Android NDK
RUN apt-get update && apt-get install -y \
    openjdk-11-jdk \
    android-sdk \
    android-sdk-platform-tools

# Set up Android environment
ENV ANDROID_HOME=/usr/lib/android-sdk
ENV NDK_HOME=$ANDROID_HOME/ndk/25.1.8937393

# Add Android targets
RUN rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android

WORKDIR /app
COPY . .

CMD ["cargo", "build"]
```

### Run with Docker
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
# Download from https://www.torproject.org/download/
```

### Configure Tor
```bash
# Edit torrc file
sudo nano /etc/tor/torrc

# Add these lines:
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

# Windows
# Start Tor Browser or tor.exe
```

## 🧪 Testing

### Unit Tests
```bash
cargo test
```

### Integration Tests
```bash
# Test with Tor
cargo test --features tor

# Test network functionality
cargo test --features network
```

### Manual Testing
```bash
# Start the app
cargo run

# Test post creation
curl -X POST http://localhost:8080/posts \
  -H "Content-Type: application/json" \
  -d '{"content":"Test post","pseudonym":"TestUser"}'

# Test post retrieval
curl http://localhost:8080/posts
```

## 🐛 Troubleshooting

### Common Issues

#### Rust not found
```bash
# Add Rust to PATH
export PATH="$HOME/.cargo/bin:$PATH"
```

#### Android NDK not found
```bash
# Set ANDROID_HOME
export ANDROID_HOME=$HOME/Android/Sdk
export NDK_HOME=$ANDROID_HOME/ndk/25.1.8937393
```

#### iOS build fails
```bash
# Install Xcode Command Line Tools
xcode-select --install

# Accept Xcode license
sudo xcodebuild -license accept
```

#### Tor connection fails
```bash
# Check if Tor is running
sudo systemctl status tor

# Test SOCKS5 connection
curl --socks5 localhost:9050 http://httpbin.org/ip
```

## 📚 Next Steps

1. **Complete React Native UI**: Create the mobile interface
2. **Add P2P Discovery**: Implement peer discovery mechanisms
3. **Enhance Security**: Add more encryption layers
4. **Optimize Performance**: Improve database and network performance
5. **Add Tests**: Comprehensive test coverage
6. **Documentation**: API documentation and user guides