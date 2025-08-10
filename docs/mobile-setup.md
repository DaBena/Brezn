# Mobile Build Setup für Brezn

## 🚀 React Native Integration

### 1. React Native App erstellen
```bash
# React Native App mit TypeScript
npx react-native init BreznApp --template react-native-template-typescript

cd BreznApp

# Capacitor für native Features
npm install @capacitor/core @capacitor/cli
npx cap init Brezn com.brezn.dev

# Platforms hinzufügen
npx cap add android
npx cap add ios
```

### 2. Rust Library Integration
```bash
# Rust Library für mobile Targets bauen
cargo build --target aarch64-linux-android --release
cargo build --target armv7-linux-androideabi --release
cargo build --target i686-linux-android --release
cargo build --target x86_64-linux-android --release

# Libraries in Android Project kopieren
cp target/aarch64-linux-android/release/libbrezn.so android/app/src/main/jniLibs/arm64-v8a/
cp target/armv7-linux-androideabi/release/libbrezn.so android/app/src/main/jniLibs/armeabi-v7a/
cp target/i686-linux-android/release/libbrezn.so android/app/src/main/jniLibs/x86/
cp target/x86_64-linux-android/release/libbrezn.so android/app/src/main/jniLibs/x86_64/
```

### 3. Android Native Module
```typescript
// android/app/src/main/java/com/brezn/dev/BreznModule.kt
package com.brezn.dev

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise

class BreznModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    override fun getName() = "BreznModule"
    
    @ReactMethod
    fun initBrezn(promise: Promise) {
        try {
            // Rust Library initialisieren
            System.loadLibrary("brezn")
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("INIT_ERROR", e.message)
        }
    }
    
    @ReactMethod
    fun addPost(content: String, pseudonym: String, promise: Promise) {
        try {
            // Rust Funktion aufrufen
            val result = addPostNative(content, pseudonym)
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("POST_ERROR", e.message)
        }
    }
    
    private external fun addPostNative(content: String, pseudonym: String): Long
}
```

### 4. iOS Native Module
```swift
// ios/BreznModule.swift
import Foundation
import React

@objc(BreznModule)
class BreznModule: NSObject {
    
    @objc
    func initBrezn(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        do {
            // Rust Library laden
            try loadBreznLibrary()
            resolve(true)
        } catch {
            reject("INIT_ERROR", error.localizedDescription, error)
        }
    }
    
    @objc
    func addPost(_ content: String, pseudonym: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        do {
            let result = try addPostNative(content: content, pseudonym: pseudonym)
            resolve(result)
        } catch {
            reject("POST_ERROR", error.localizedDescription, error)
        }
    }
    
    private func loadBreznLibrary() throws {
        // Rust Library laden
    }
    
    private func addPostNative(content: String, pseudonym: String) throws -> Int64 {
        // Rust Funktion aufrufen
        return 0
    }
}
```

### 5. F-Droid Release Preparation
```yaml
# .fdroid.yml
appId: com.brezn.dev
name: Brezn
summary: Dezentrale anonyme Feed-App
description: |
  Brezn ist eine dezentrale Feed-App wie Jodel/X, 
  die komplett anonym über das Tor-Netzwerk läuft.
  
  Features:
  - Anonyme Posts ohne zentrale Server
  - Tor-Anonymisierung für Rechtssicherheit
  - QR-Code-Netzwerkbeitritt
  - P2P-Netzwerk ohne zentrale Infrastruktur

categories:
  - Social
  - Internet

license: GPL-3.0
webSite: https://github.com/brezn/brezn
sourceCode: https://github.com/brezn/brezn
issueTracker: https://github.com/brezn/brezn/issues

builds:
  - versionName: "0.1.0"
    versionCode: 1
    commit: v0.1.0
    subdir: mobile
    gradle:
      - yes
    output: app-release.apk
    srclibs:
      - brezn@0.1.0
    build:
      - cd android
      - ./gradlew assembleRelease
    ndk: r25b
    sdk: "33"
```

## 📱 Mobile Features

### Android Features
- Tor SOCKS5 Proxy Integration
- QR-Code Scanner für Peer-Discovery
- Background Service für P2P-Netzwerk
- Push Notifications für neue Posts

### iOS Features
- Tor Network Extension
- QR-Code Scanner mit Camera API
- Background App Refresh für Netzwerk
- Local Network Permission Handling

## 🔒 Mobile Sicherheit

### Android Permissions
```xml
<!-- android/app/src/main/AndroidManifest.xml -->
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
```

### iOS Permissions
```xml
<!-- ios/Brezn/Info.plist -->
<key>NSCameraUsageDescription</key>
<string>QR-Code scannen für Netzwerkbeitritt</string>
<key>NSLocalNetworkUsageDescription</key>
<string>P2P-Netzwerk für anonyme Kommunikation</string>
```

## 🚀 Build Pipeline

### Android Build
```bash
# Android Release Build
cd android
./gradlew assembleRelease
./gradlew bundleRelease

# APK signieren
jarsigner -verbose -sigalg SHA256withRSA -digestalg SHA-256 \
  -keystore ~/.android/debug.keystore \
  app-release-unsigned.apk androiddebugkey
```

### iOS Build
```bash
# iOS Archive
cd ios
xcodebuild -workspace Brezn.xcworkspace \
  -scheme Brezn \
  -configuration Release \
  -archivePath Brezn.xcarchive \
  archive

# IPA erstellen
xcodebuild -exportArchive \
  -archivePath Brezn.xcarchive \
  -exportPath ./build \
  -exportOptionsPlist exportOptions.plist
```

## 📊 Testing Strategy

### Unit Tests
```bash
# Rust Tests
cargo test

# React Native Tests
npm test

# Mobile Integration Tests
npm run test:android
npm run test:ios
```

### Integration Tests
- Tor Connection Tests
- P2P Network Tests
- QR-Code Generation/Scanning Tests
- Cross-Platform Sync Tests

### Security Tests
- Tor Anonymity Tests
- Crypto Implementation Tests
- Network Security Tests
- Privacy Leak Tests