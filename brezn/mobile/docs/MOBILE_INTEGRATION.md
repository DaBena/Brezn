# Brezn Mobile FFI Integration

## Übersicht

Die Brezn Mobile FFI Integration ermöglicht es, die Rust-basierte Brezn-Backend-Funktionalität nahtlos in React Native-Apps zu integrieren. Diese Integration bietet eine performante, sichere und plattformübergreifende Lösung für dezentrale anonyme Feed-Apps.

## Architektur

### Komponenten

```
┌─────────────────────────────────────────────────────────────┐
│                    React Native App                        │
├─────────────────────────────────────────────────────────────┤
│                BreznNativeModuleWrapper                    │
│                    (TypeScript)                           │
├─────────────────────────────────────────────────────────────┤
│              Native Module Bridge                          │
│  ┌─────────────────┐  ┌─────────────────┐                │
│  │   Android       │  │      iOS        │                │
│  │   (Kotlin)      │  │    (Swift)      │                │
│  └─────────────────┘  └─────────────────┘                │
├─────────────────────────────────────────────────────────────┤
│                    JNI/FFI Layer                          │
│  ┌─────────────────┐  ┌─────────────────┐                │
│  │   Android NDK   │  │   iOS FFI       │                │
│  └─────────────────┘  └─────────────────┘                │
├─────────────────────────────────────────────────────────────┤
│                    Rust Backend                           │
│                (libbrezn.so/.a)                           │
└─────────────────────────────────────────────────────────────┘
```

### Datenfluss

1. **React Native** → Ruft TypeScript-Wrapper auf
2. **TypeScript-Wrapper** → Validiert Parameter und ruft Native Module auf
3. **Native Module** → Übersetzt Aufrufe in FFI-Funktionen
4. **FFI-Layer** → Kommuniziert mit Rust-Backend
5. **Rust-Backend** → Führt Operationen aus und gibt Ergebnisse zurück

## Installation

### Voraussetzungen

- Rust 1.70+
- Node.js 18+
- React Native 0.72+
- Android NDK (für Android-Builds)
- Xcode (für iOS-Builds)

### Setup

```bash
# Repository klonen
git clone https://github.com/your-org/brezn.git
cd brezn/mobile

# Dependencies installieren
npm install

# Build-Skript ausführbar machen
chmod +x scripts/build_mobile.sh

# Kompletten Build durchführen
./scripts/build_mobile.sh
```

### Einzelne Schritte

```bash
# Nur Rust FFI bauen
./scripts/build_mobile.sh build-rust

# Android-Umgebung einrichten
./scripts/build_mobile.sh setup-android

# iOS-Umgebung einrichten
./scripts/build_mobile.sh setup-ios

# Dependencies installieren
./scripts/build_mobile.sh install

# Tests ausführen
./scripts/build_mobile.sh test
```

## Verwendung

### Grundlegende Integration

```typescript
import { breznNative } from './src/native/BreznNativeModule';

// App initialisieren
const initApp = async () => {
  try {
    // FFI initialisieren
    const initResult = await breznNative.init(8080, 9050);
    if (!initResult) {
      throw new Error('Failed to initialize Brezn FFI');
    }

    // App starten
    const startResult = await breznNative.start();
    if (!startResult) {
      throw new Error('Failed to start Brezn app');
    }

    console.log('Brezn app started successfully');
  } catch (error) {
    console.error('Failed to start app:', error);
  }
};
```

### Posts verwalten

```typescript
// Post erstellen
const createPost = async (content: string, pseudonym: string) => {
  try {
    const result = await breznNative.createPost(content, pseudonym);
    if (result) {
      console.log('Post created successfully');
    }
  } catch (error) {
    console.error('Failed to create post:', error);
  }
};

// Posts abrufen
const getPosts = async () => {
  try {
    const posts = await breznNative.getPosts();
    console.log(`Retrieved ${posts.length} posts`);
    return posts;
  } catch (error) {
    console.error('Failed to get posts:', error);
    return [];
  }
};
```

### Netzwerk-Funktionen

```typescript
// Netzwerk-Status abrufen
const getNetworkStatus = async () => {
  try {
    const status = await breznNative.getNetworkStatus();
    console.log(`Network: ${status.networkEnabled}, Tor: ${status.torEnabled}`);
    console.log(`Peers: ${status.peersCount}, Discovery: ${status.discoveryPeersCount}`);
    return status;
  } catch (error) {
    console.error('Failed to get network status:', error);
    throw error;
  }
};

// Tor aktivieren/deaktivieren
const toggleTor = async (enable: boolean) => {
  try {
    if (enable) {
      await breznNative.enableTor();
      console.log('Tor enabled');
    } else {
      await breznNative.disableTor();
      console.log('Tor disabled');
    }
  } catch (error) {
    console.error('Failed to toggle Tor:', error);
  }
};
```

### QR-Code-Funktionen

```typescript
// QR-Code für Peer-Discovery generieren
const generateQrCode = async () => {
  try {
    const qrData = await breznNative.generateQrCode();
    console.log('QR code generated:', qrData);
    return qrData;
  } catch (error) {
    console.error('Failed to generate QR code:', error);
    throw error;
  }
};

// QR-Code parsen um Peer hinzuzufügen
const addPeerFromQr = async (qrData: string) => {
  try {
    const result = await breznNative.parseQrCode(qrData);
    if (result) {
      console.log('Peer added successfully from QR code');
    }
    return result;
  } catch (error) {
    console.error('Failed to parse QR code:', error);
    return false;
  }
};
```

### Event-Handling

```typescript
// Event-Listener hinzufügen
const setupEventListeners = () => {
  // Netzwerk-Status-Änderungen
  const networkSubscription = breznNative.addEventListener(
    'network_status_changed',
    (data) => {
      console.log('Network status changed:', data);
    }
  );

  // Neue Posts
  const postSubscription = breznNative.addEventListener(
    'post_created',
    (data) => {
      console.log('New post created:', data);
    }
  );

  // Peer entdeckt
  const peerSubscription = breznNative.addEventListener(
    'peer_discovered',
    (data) => {
      console.log('New peer discovered:', data);
    }
  );

  // Tor-Status-Änderungen
  const torSubscription = breznNative.addEventListener(
    'tor_status_changed',
    (data) => {
      console.log('Tor status changed:', data);
    }
  );

  // Cleanup-Funktion zurückgeben
  return () => {
    networkSubscription.remove();
    postSubscription.remove();
    peerSubscription.remove();
    torSubscription.remove();
  };
};
```

## Performance-Optimierung

### Asynchrone Operationen

Alle FFI-Aufrufe sind asynchron implementiert, um die UI-Threads nicht zu blockieren:

```typescript
// Korrekte Verwendung - nicht-blockierend
const handlePostCreation = async () => {
  setIsLoading(true);
  try {
    await breznNative.createPost(content, pseudonym);
    // UI aktualisieren
  } catch (error) {
    // Fehler behandeln
  } finally {
    setIsLoading(false);
  }
};

// Falsche Verwendung - blockierend
const handlePostCreation = () => {
  setIsLoading(true);
  breznNative.createPost(content, pseudonym)
    .then(() => {
      // UI aktualisieren
    })
    .catch((error) => {
      // Fehler behandeln
    })
    .finally(() => {
      setIsLoading(false);
    });
};
```

### Batch-Operationen

Für mehrere Operationen sollten Batch-Operationen verwendet werden:

```typescript
// Effizient: Batch-Operationen
const createMultiplePosts = async (posts: Array<{content: string, pseudonym: string}>) => {
  const promises = posts.map(post => 
    breznNative.createPost(post.content, post.pseudonym)
  );
  
  const results = await Promise.all(promises);
  const successCount = results.filter(Boolean).length;
  
  console.log(`Created ${successCount}/${posts.length} posts`);
  return successCount;
};

// Ineffizient: Sequenzielle Operationen
const createMultiplePostsSequential = async (posts: Array<{content: string, pseudonym: string}>) => {
  let successCount = 0;
  
  for (const post of posts) {
    const result = await breznNative.createPost(post.content, post.pseudonym);
    if (result) successCount++;
  }
  
  return successCount;
};
```

### Memory Management

```typescript
// Cleanup bei Komponenten-Unmount
useEffect(() => {
  return () => {
    // Event-Listener entfernen
    cleanup();
    
    // FFI-Ressourcen freigeben (optional, da global)
    // breznNative.cleanup();
  };
}, []);

// Memory-Usage überwachen
const monitorMemoryUsage = () => {
  if ((performance as any).memory) {
    const memoryInfo = (performance as any).memory;
    console.log('Memory usage:', {
      used: `${(memoryInfo.usedJSHeapSize / 1024 / 1024).toFixed(2)}MB`,
      total: `${(memoryInfo.totalJSHeapSize / 1024 / 1024).toFixed(2)}MB`,
      limit: `${(memoryInfo.jsHeapSizeLimit / 1024 / 1024).toFixed(2)}MB`
    });
  }
};
```

## Fehlerbehandlung

### Fehlertypen

```typescript
// FFI-Initialisierungsfehler
try {
  await breznNative.init(8080, 9050);
} catch (error) {
  if (error.message.includes('INIT_ERROR')) {
    console.error('FFI initialization failed');
  }
}

// Netzwerk-Fehler
try {
  await breznNative.start();
} catch (error) {
  if (error.message.includes('START_ERROR')) {
    console.error('Network startup failed');
  }
}

// Post-Erstellungsfehler
try {
  await breznNative.createPost(content, pseudonym);
} catch (error) {
  if (error.message.includes('CREATE_POST_ERROR')) {
    console.error('Post creation failed');
  }
}
```

### Retry-Logik

```typescript
const retryOperation = async <T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> => {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      if (attempt < maxRetries) {
        console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
      }
    }
  }
  
  throw lastError!;
};

// Verwendung
const createPostWithRetry = async (content: string, pseudonym: string) => {
  return retryOperation(
    () => breznNative.createPost(content, pseudonym),
    3,
    1000
  );
};
```

## Testing

### Performance-Tests

```typescript
import { runPerformanceTests } from './src/tests/PerformanceTests';

// Performance-Tests ausführen
const runTests = async () => {
  try {
    const report = await runPerformanceTests();
    console.log('Performance test report:', report);
    
    // Report speichern
    const fs = require('react-native-fs');
    const path = `${fs.DocumentDirectoryPath}/performance_report.json`;
    await fs.writeFile(path, report, 'utf8');
    
  } catch (error) {
    console.error('Performance tests failed:', error);
  }
};
```

### Unit-Tests

```typescript
// Jest-Test-Beispiel
describe('BreznNativeModule', () => {
  beforeEach(async () => {
    await breznNative.init(8080, 9050);
    await breznNative.start();
  });

  afterEach(async () => {
    await breznNative.cleanup();
  });

  test('should create post successfully', async () => {
    const result = await breznNative.createPost('Test content', 'test_user');
    expect(result).toBe(true);
  });

  test('should retrieve posts', async () => {
    const posts = await breznNative.getPosts();
    expect(Array.isArray(posts)).toBe(true);
  });
});
```

## Deployment

### Android

```bash
# Release-Build erstellen
cd android
./gradlew assembleRelease

# APK signieren
./gradlew assembleRelease
./gradlew signReleaseApk
```

### iOS

```bash
# Release-Build erstellen
cd ios
xcodebuild -workspace Brezn.xcworkspace -scheme Brezn -configuration Release archive
```

### Build-Konfiguration

```json
// package.json
{
  "scripts": {
    "build:android": "cd android && ./gradlew assembleRelease",
    "build:ios": "cd ios && xcodebuild -workspace Brezn.xcworkspace -scheme Brezn -configuration Release archive",
    "build:mobile": "./scripts/build_mobile.sh all"
  }
}
```

## Troubleshooting

### Häufige Probleme

#### FFI-Initialisierung schlägt fehl

```bash
# Rust-Version prüfen
rustc --version

# Dependencies aktualisieren
cargo update

# Clean build
cargo clean
cargo build --release
```

#### Android NDK-Fehler

```bash
# NDK-Pfad setzen
export ANDROID_NDK_HOME=/path/to/android-ndk

# NDK-Version prüfen
ls $ANDROID_NDK_HOME

# Gradle-Cache löschen
cd android
./gradlew clean
```

#### iOS Build-Fehler

```bash
# Xcode-Command-Line-Tools installieren
xcode-select --install

# Pods aktualisieren
cd ios
pod install

# Xcode-Projekt öffnen und manuell bauen
open Brezn.xcworkspace
```

### Debug-Logs

```typescript
// Debug-Modus aktivieren
if (__DEV__) {
  console.log('Debug mode enabled');
  
  // Native Module-Status prüfen
  console.log('Module initialized:', breznNative.isModuleInitialized());
  
  // Performance-Metriken abrufen
  const metrics = await breznNative.getPerformanceMetrics();
  console.log('Performance metrics:', metrics);
}
```

## API-Referenz

### BreznNativeModuleWrapper

#### Konstruktor
```typescript
constructor()
```

#### Methoden

##### init(networkPort: number, torSocksPort: number): Promise<boolean>
Initialisiert die Brezn FFI mit Netzwerk-Konfiguration.

**Parameter:**
- `networkPort`: Netzwerk-Port für P2P-Kommunikation
- `torSocksPort`: Tor SOCKS-Proxy-Port

**Rückgabe:** Promise<boolean> - true bei Erfolg

##### start(): Promise<boolean>
Startet die Brezn-Anwendung.

**Rückgabe:** Promise<boolean> - true bei Erfolg

##### createPost(content: string, pseudonym: string): Promise<boolean>
Erstellt einen neuen Post.

**Parameter:**
- `content`: Post-Inhalt
- `pseudonym`: Autor-Pseudonym

**Rückgabe:** Promise<boolean> - true bei Erfolg

##### getPosts(): Promise<PostFFI[]>
Ruft alle Posts ab.

**Rückgabe:** Promise<PostFFI[]> - Array von Posts

##### getNetworkStatus(): Promise<NetworkStatusFFI>
Ruft Netzwerk-Status-Informationen ab.

**Rückgabe:** Promise<NetworkStatusFFI> - Netzwerk-Status

##### enableTor(): Promise<boolean>
Aktiviert das Tor-Netzwerk.

**Rückgabe:** Promise<boolean> - true bei Erfolg

##### disableTor(): Promise<void>
Deaktiviert das Tor-Netzwerk.

##### generateQrCode(): Promise<string>
Generiert QR-Code für Peer-Discovery.

**Rückgabe:** Promise<string> - QR-Code-Daten

##### parseQrCode(qrData: string): Promise<boolean>
Parst QR-Code um Peer hinzuzufügen.

**Parameter:**
- `qrData`: QR-Code-Daten

**Rückgabe:** Promise<boolean> - true bei Erfolg

##### getPerformanceMetrics(): Promise<PerformanceMetrics>
Ruft Performance-Metriken ab.

**Rückgabe:** Promise<PerformanceMetrics> - Performance-Daten

##### getDeviceInfo(): Promise<DeviceInfo>
Ruft Geräte-Informationen ab.

**Rückgabe:** Promise<DeviceInfo> - Geräte-Info

##### testP2pNetwork(): Promise<boolean>
Testet P2P-Netzwerk-Funktionalität.

**Rückgabe:** Promise<boolean> - true bei Erfolg

##### cleanup(): Promise<void>
Gibt Ressourcen frei.

##### addEventListener(eventType: string, callback: Function): EmitterSubscription
Fügt Event-Listener hinzu.

**Parameter:**
- `eventType`: Event-Typ
- `callback`: Callback-Funktion

**Rückgabe:** EmitterSubscription - Subscription-Objekt

##### removeEventListener(subscription: EmitterSubscription): void
Entfernt Event-Listener.

**Parameter:**
- `subscription`: Subscription-Objekt

##### isModuleInitialized(): boolean
Prüft ob das Modul initialisiert ist.

**Rückgabe:** boolean - true wenn initialisiert

### Datentypen

#### PostFFI
```typescript
interface PostFFI {
  id: string | null;
  content: string;
  timestamp: number;
  pseudonym: string;
  nodeId: string | null;
}
```

#### NetworkStatusFFI
```typescript
interface NetworkStatusFFI {
  networkEnabled: boolean;
  torEnabled: boolean;
  peersCount: number;
  discoveryPeersCount: number;
  port: number;
  torSocksPort: number;
}
```

#### PerformanceMetrics
```typescript
interface PerformanceMetrics {
  memoryUsage: number;
  threadCount: number;
  timestamp: number;
}
```

#### DeviceInfo
```typescript
interface DeviceInfo {
  platform: string;
  arch: string;
  rustVersion: string;
  buildTime: string;
}
```

## Lizenz

Dieses Projekt steht unter der GPL-3.0-Lizenz. Siehe [LICENSE](../LICENSE) für Details.

## Support

Bei Fragen oder Problemen:

1. **Issues**: GitHub Issues verwenden
2. **Discussions**: GitHub Discussions für allgemeine Fragen
3. **Wiki**: Projekt-Wiki für detaillierte Anleitungen
4. **Community**: Community-Chat für schnelle Hilfe

## Beitragen

Wir freuen uns über Beiträge! Bitte lesen Sie [CONTRIBUTING.md](../CONTRIBUTING.md) für Richtlinien.