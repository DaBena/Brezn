# Brezn Mobile Testing Guide

## 🧪 Testing Overview

This document provides comprehensive testing guidelines for the Brezn mobile application, covering unit tests, integration tests, and manual testing procedures.

## 📋 Test Categories

### 1. Unit Tests
- **BreznService Tests**: Test Rust library integration
- **Component Tests**: Test React Native screen components
- **Navigation Tests**: Test app navigation flow
- **Type Tests**: Test TypeScript type safety

### 2. Integration Tests
- **Build Tests**: Test APK compilation
- **Dependency Tests**: Test package installation
- **Configuration Tests**: Test app configuration
- **Native Module Tests**: Test Android native modules

### 3. Manual Tests
- **UI Tests**: Test user interface functionality
- **Network Tests**: Test P2P network connectivity
- **QR Code Tests**: Test QR code generation/scanning
- **Tor Tests**: Test Tor integration
- **Performance Tests**: Test app performance

## 🚀 Running Tests

### Unit Tests
```bash
# Run all unit tests
npm test

# Run specific test file
npm test -- BreznService.test.ts

# Run tests with coverage
npm test -- --coverage
```

### Integration Tests
```bash
# Run integration tests
./test_integration.sh

# This will test:
# - Dependencies installation
# - TypeScript compilation
# - ESLint validation
# - Android build configuration
# - Rust library integration
# - Navigation structure
# - Screen components
# - Android native modules
# - F-Droid configuration
# - Build script validation
```

### Android Emulator Tests
```bash
# Run Android emulator tests
./test_android.sh

# This will test:
# - Android SDK tools
# - APK building and installation
# - App startup
# - Permissions
# - Native library loading
# - Background services
# - Performance metrics
# - Crash detection
```

## 📱 Manual Testing Checklist

### Feed Screen
- [ ] Posts load correctly
- [ ] Pull-to-refresh works
- [ ] Empty state displays properly
- [ ] Post timestamps format correctly
- [ ] Node information displays
- [ ] FAB navigates to Create Post

### Create Post Screen
- [ ] Form validation works
- [ ] Random pseudonym generation
- [ ] Character counter updates
- [ ] Post creation succeeds
- [ ] Error handling works
- [ ] Navigation back works

### Network Screen
- [ ] Network status displays
- [ ] QR code generation works
- [ ] QR code scanning works
- [ ] Network toggle works
- [ ] Tor toggle works
- [ ] Peer count updates

### Settings Screen
- [ ] Configuration loads
- [ ] Settings save correctly
- [ ] Form validation works
- [ ] Default values display
- [ ] Error handling works

### QR Scanner Screen
- [ ] Camera permission request
- [ ] QR code scanning works
- [ ] Manual input works
- [ ] Peer addition succeeds
- [ ] Error handling works

## 🔧 Test Environment Setup

### Prerequisites
```bash
# Install Node.js and npm
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install React Native CLI
npm install -g @react-native-community/cli

# Install Android SDK
# Download from: https://developer.android.com/studio

# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env

# Install Android targets for Rust
rustup target add aarch64-linux-android
rustup target add armv7-linux-androideabi
rustup target add i686-linux-android
rustup target add x86_64-linux-android
```

### Environment Variables
```bash
# Set Android SDK path
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/tools
export PATH=$PATH:$ANDROID_HOME/tools/bin
export PATH=$PATH:$ANDROID_HOME/platform-tools

# Set Android NDK path
export ANDROID_NDK_HOME=$ANDROID_HOME/ndk/25.1.8937393
```

## 🐛 Debugging Tests

### Common Issues

#### 1. Metro Bundler Issues
```bash
# Clear Metro cache
npx react-native start --reset-cache

# Clear npm cache
npm cache clean --force
```

#### 2. Android Build Issues
```bash
# Clean Android build
cd android
./gradlew clean
cd ..

# Clear Android cache
rm -rf android/app/build
```

#### 3. Rust Integration Issues
```bash
# Rebuild Rust library
cargo clean
cargo build --target aarch64-linux-android --release

# Copy libraries
cp target/aarch64-linux-android/release/libbrezn.so mobile/android/app/src/main/jniLibs/arm64-v8a/
```

#### 4. Test Environment Issues
```bash
# Reinstall dependencies
rm -rf node_modules
npm install

# Clear Jest cache
npx jest --clearCache
```

## 📊 Test Coverage

### Current Coverage Targets
- **Unit Tests**: 80% minimum
- **Integration Tests**: 90% minimum
- **Manual Tests**: 100% completion

### Coverage Reports
```bash
# Generate coverage report
npm test -- --coverage --watchAll=false

# View coverage in browser
open coverage/lcov-report/index.html
```

## 🔍 Performance Testing

### Memory Usage
```bash
# Monitor app memory usage
adb shell dumpsys meminfo com.brezn.dev
```

### CPU Usage
```bash
# Monitor app CPU usage
adb shell top -p $(adb shell pidof com.brezn.dev)
```

### Network Performance
```bash
# Monitor network traffic
adb shell dumpsys netstats detail
```

## 🚨 Error Handling Tests

### Network Errors
- [ ] Test with no internet connection
- [ ] Test with slow network
- [ ] Test with Tor connection issues
- [ ] Test P2P network failures

### Permission Errors
- [ ] Test camera permission denied
- [ ] Test network permission denied
- [ ] Test storage permission denied

### App Crashes
- [ ] Test with invalid QR codes
- [ ] Test with corrupted data
- [ ] Test with memory pressure
- [ ] Test with background kill

## 📱 Device Testing

### Supported Android Versions
- Android 7.0 (API 24) - Minimum
- Android 13 (API 33) - Target
- Android 14 (API 34) - Latest

### Device Types
- [ ] Phone (Portrait)
- [ ] Phone (Landscape)
- [ ] Tablet (Portrait)
- [ ] Tablet (Landscape)

### Screen Sizes
- [ ] Small (320dp)
- [ ] Normal (320dp)
- [ ] Large (480dp)
- [ ] Extra Large (720dp)

## 🔒 Security Testing

### Privacy Tests
- [ ] No data sent to external servers
- [ ] Local data encryption
- [ ] Anonymous user identification
- [ ] Tor network usage

### Permission Tests
- [ ] Minimal permission usage
- [ ] Permission justification
- [ ] Permission revocation handling

### Network Security
- [ ] P2P communication security
- [ ] Tor integration verification
- [ ] QR code data validation

## 📈 Continuous Integration

### GitHub Actions
```yaml
# .github/workflows/mobile-tests.yml
name: Mobile Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - uses: actions/setup-java@v3
      - run: cd mobile && npm install
      - run: cd mobile && npm test
      - run: cd mobile && ./test_integration.sh
```

## 📝 Test Reports

### Automated Reports
- Jest test results
- ESLint reports
- TypeScript compilation
- Android build logs
- Performance metrics

### Manual Test Reports
- UI functionality checklist
- Network connectivity tests
- QR code functionality
- Tor integration tests
- Performance benchmarks

## 🎯 Test Priorities

### High Priority
1. **Core Functionality**: Post creation and display
2. **Network Integration**: P2P connectivity
3. **QR Code Features**: Generation and scanning
4. **Tor Integration**: Anonymization
5. **App Stability**: Crash prevention

### Medium Priority
1. **UI/UX**: User interface polish
2. **Performance**: App responsiveness
3. **Accessibility**: Screen reader support
4. **Internationalization**: Multi-language support

### Low Priority
1. **Advanced Features**: Background services
2. **Optimization**: Memory and battery usage
3. **Analytics**: Usage statistics (privacy-focused)

## 🔄 Test Maintenance

### Regular Tasks
- [ ] Update test dependencies
- [ ] Review test coverage
- [ ] Update test data
- [ ] Validate test results
- [ ] Document new features

### Monthly Reviews
- [ ] Performance benchmark updates
- [ ] Security test updates
- [ ] Device compatibility checks
- [ ] User feedback integration

## 📞 Support

For testing issues or questions:
1. Check the troubleshooting section
2. Review test logs and error messages
3. Consult the development team
4. Create detailed bug reports

---

**Last Updated**: $(date)
**Version**: 0.1.0
**Maintainer**: Brezn Development Team