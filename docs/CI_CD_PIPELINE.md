# 🚀 Brezn CI/CD Pipeline

## Übersicht

Die Brezn CI/CD Pipeline ist eine fortschrittliche GitHub Actions-basierte Lösung für parallele Entwicklung, automatische Tests und Build-Artifacts. Sie unterstützt Multi-Platform-Builds, parallele Test-Ausführung und automatisierte Deployments.

## 🏗️ Pipeline-Architektur

### Workflow-Struktur
```
.github/workflows/
├── ci-pipeline.yml          # Haupt-CI-Pipeline
├── android-apk.yml          # Android APK Build
├── ios-archive.yml          # iOS Archive Build
├── docker-build.yml         # Docker Image Build
├── security-scan.yml        # Sicherheits-Scans
├── performance-test.yml     # Performance-Tests
└── deployment.yml           # Deployment-Pipeline
```

### Pipeline-Phasen
1. **Code-Qualität** - Linting, Formatierung, Sicherheits-Scans
2. **Build** - Multi-Platform Compilation
3. **Test** - Parallele Test-Ausführung
4. **Artifact** - Build-Artifacts erstellen
5. **Deploy** - Automatische Deployments

## 🔧 Haupt-CI-Pipeline

### ci-pipeline.yml
```yaml
name: CI Pipeline

on:
  push:
    branches: [ main, develop, feature/* ]
  pull_request:
    branches: [ main, develop ]

env:
  RUST_VERSION: '1.75'
  CARGO_INCREMENTAL: 0
  RUST_BACKTRACE: 1

jobs:
  # Code-Qualität
  code-quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable
        
      - name: Install clippy
        run: rustup component add clippy
        
      - name: Run clippy
        run: cargo clippy --all-targets --all-features -- -D warnings
        
      - name: Run rustfmt
        run: cargo fmt --all -- --check
        
      - name: Security audit
        run: cargo audit

  # Rust Build & Test
  rust-build-test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        target: [x86_64-unknown-linux-gnu, aarch64-unknown-linux-gnu]
        features: [default, full, minimal]
        
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable
        
      - name: Add target
        run: rustup target add ${{ matrix.target }}
        
      - name: Build
        run: cargo build --target ${{ matrix.target }} --features ${{ matrix.features }}
        
      - name: Test
        run: cargo test --target ${{ matrix.target }} --features ${{ matrix.features }}
        
      - name: Upload build artifacts
        uses: actions/upload-artifact@v4
        with:
          name: rust-build-${{ matrix.target }}-${{ matrix.features }}
          path: target/${{ matrix.target }}/debug/

  # Web Build & Test
  web-build-test:
    runs-on: ubuntu-latest
    needs: rust-build-test
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
          
      - name: Install dependencies
        run: |
          cd brezn/web
          npm ci
          
      - name: Build web
        run: |
          cd brezn/web
          npm run build
          
      - name: Test web
        run: |
          cd brezn/web
          npm run test:ci
          
      - name: Upload web artifacts
        uses: actions/upload-artifact@v4
        with:
          name: web-build
          path: brezn/web/dist/

  # Mobile Build & Test
  mobile-build-test:
    runs-on: ubuntu-latest
    needs: rust-build-test
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
          
      - name: Install mobile dependencies
        run: |
          cd brezn/mobile
          npm ci
          
      - name: Test mobile
        run: |
          cd brezn/mobile
          npm run test:ci
          
      - name: Upload mobile artifacts
        uses: actions/upload-artifact@v4
        with:
          name: mobile-test-results
          path: brezn/mobile/test-results/

  # Integration Tests
  integration-tests:
    runs-on: ubuntu-latest
    needs: [rust-build-test, web-build-test, mobile-build-test]
    
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
          
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable
        
      - name: Run integration tests
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/brezn_test
        run: cargo test --test integration_tests
        
      - name: Upload test results
        uses: actions/upload-artifact@v4
        with:
          name: integration-test-results
          path: test-results/

  # Performance Tests
  performance-tests:
    runs-on: ubuntu-latest
    needs: integration-tests
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable
        
      - name: Install cargo-criterion
        run: cargo install cargo-criterion
        
      - name: Run performance tests
        run: cargo criterion --message-format=json > performance-results.json
        
      - name: Upload performance results
        uses: actions/upload-artifact@v4
        with:
          name: performance-results
          path: performance-results.json
```

## 📱 Mobile Build-Pipelines

### Android APK Build (aktualisiert)
```yaml
name: Build Android APK

on:
  workflow_dispatch:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  build-android:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        target: [aarch64-linux-android, armv7-linux-androideabi, x86_64-linux-android]
        build_type: [debug, release]
        
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 18
          cache: 'npm'

      - name: Setup Java 17
        uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '17'

      - name: Setup Android SDK
        uses: android-actions/setup-android@v3

      - name: Setup Rust toolchain
        uses: dtolnay/rust-toolchain@stable

      - name: Add Rust Android targets
        run: |
          rustup target add ${{ matrix.target }}

      - name: Cache cargo
        uses: actions/cache@v4
        with:
          path: |
            ~/.cargo/registry
            ~/.cargo/git
            brezn/target
          key: ${{ runner.os }}-cargo-${{ hashFiles('brezn/Cargo.lock') }}

      - name: Build Rust libraries
        run: |
          cd brezn
          cargo build --target ${{ matrix.target }} --${{ matrix.build_type }}

      - name: Build Android APK
        run: |
          cd brezn/mobile/android
          chmod +x gradlew
          ./gradlew assemble${{ matrix.build_type }}

      - name: Upload APK
        uses: actions/upload-artifact@v4
        with:
          name: brezn-android-${{ matrix.target }}-${{ matrix.build_type }}
          path: brezn/mobile/android/app/build/outputs/apk/${{ matrix.build_type }}/*.apk
```

### iOS Archive Build (erweitert)
```yaml
name: Build iOS Archive

on:
  workflow_dispatch:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  build-ios:
    runs-on: macos-latest
    strategy:
      matrix:
        ios_version: ['15.0', '16.0', '17.0']
        build_configuration: [Debug, Release]
        
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 18
          cache: 'npm'

      - name: Setup Rust toolchain
        uses: dtolnay/rust-toolchain@stable

      - name: Add Rust iOS targets
        run: |
          rustup target add aarch64-apple-ios
          rustup target add x86_64-apple-ios

      - name: Cache cargo
        uses: actions/cache@v4
        with:
          path: |
            ~/.cargo/registry
            ~/.cargo/git
            brezn/target
          key: ${{ runner.os }}-cargo-${{ hashFiles('brezn/Cargo.lock') }}

      - name: Build Rust libraries
        run: |
          cd brezn
          cargo build --target aarch64-apple-ios --${{ matrix.build_configuration }}
          cargo build --target x86_64-apple-ios --${{ matrix.build_configuration }}

      - name: Setup iOS
        uses: maxim-lobanov/setup-xcode@v1
        with:
          xcode-version: latest

      - name: Build iOS
        run: |
          cd brezn/mobile/ios
          xcodebuild -workspace Brezn.xcworkspace \
                     -scheme Brezn \
                     -configuration ${{ matrix.build_configuration }} \
                     -destination 'platform=iOS Simulator,name=iPhone 14,OS=${{ matrix.ios_version }}' \
                     -derivedDataPath build \
                     build

      - name: Upload iOS build
        uses: actions/upload-artifact@v4
        with:
          name: brezn-ios-${{ matrix.build_configuration }}
          path: brezn/mobile/ios/build/
```

## 🐳 Docker Build-Pipeline

### docker-build.yml
```yaml
name: Docker Build

on:
  push:
    branches: [ main, develop ]
    tags: [ 'v*' ]
  pull_request:
    branches: [ main ]

jobs:
  docker-build:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        platform: [linux/amd64, linux/arm64]
        variant: [alpine, debian]
        
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: brezn/brezn
          tags: |
            type=ref,event=branch
            type=ref,event=pr
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: ./brezn
          platforms: ${{ matrix.platform }}
          build-args: |
            VARIANT=${{ matrix.variant }}
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

## 🔒 Sicherheits-Pipeline

### security-scan.yml
```yaml
name: Security Scan

on:
  schedule:
    - cron: '0 2 * * *'  # Täglich um 2:00 UTC
  workflow_dispatch:
  push:
    branches: [ main, develop ]

jobs:
  security-scan:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Run cargo audit
        run: cargo audit

      - name: Run cargo deny
        run: |
          cargo install cargo-deny
          cargo deny check

      - name: Run trivy vulnerability scanner
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          scan-ref: '.'
          format: 'sarif'
          output: 'trivy-results.sarif'

      - name: Upload Trivy scan results
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: 'trivy-results.sarif'

      - name: Run dependency check
        uses: dependency-check/Dependency-Check_Action@main
        with:
          project: 'Brezn'
          path: '.'
          format: 'HTML'
          out: 'reports'

      - name: Upload dependency check results
        uses: actions/upload-artifact@v4
        with:
          name: dependency-check-report
          path: reports/
```

## 📊 Performance-Test-Pipeline

### performance-test.yml
```yaml
name: Performance Tests

on:
  workflow_dispatch:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  performance-tests:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Install cargo-criterion
        run: cargo install cargo-criterion

      - name: Run performance benchmarks
        run: |
          cd brezn
          cargo criterion --message-format=json > performance-results.json

      - name: Analyze performance results
        run: |
          python3 scripts/analyze_performance.py performance-results.json

      - name: Upload performance results
        uses: actions/upload-artifact@v4
        with:
          name: performance-results
          path: |
            performance-results.json
            performance-analysis.html

      - name: Comment PR with results
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const results = JSON.parse(fs.readFileSync('performance-results.json', 'utf8'));
            
            const comment = `## 📊 Performance Test Results
            
            **Build Time:** ${results.build_time}ms
            **Memory Usage:** ${results.memory_usage}MB
            **CPU Usage:** ${results.cpu_usage}%
            
            ${results.regressions > 0 ? '⚠️ **Performance regressions detected!**' : '✅ **No performance regressions**'}
            `;
            
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: comment
            });
```

## 🚀 Deployment-Pipeline

### deployment.yml
```yaml
name: Deployment

on:
  push:
    tags: [ 'v*' ]
  workflow_dispatch:
    inputs:
      environment:
        description: 'Environment to deploy to'
        required: true
        default: 'staging'
        type: choice
        options:
        - staging
        - production

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: ${{ github.event.inputs.environment || 'staging' }}
    
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Download artifacts
        uses: actions/download-artifact@v4
        with:
          name: rust-build-x86_64-unknown-linux-gnu-default

      - name: Setup deployment
        run: |
          mkdir -p deployment
          cp -r * deployment/

      - name: Deploy to staging
        if: github.event.inputs.environment == 'staging' || github.ref == 'refs/tags/v*'
        run: |
          echo "Deploying to staging..."
          # Staging deployment logic

      - name: Deploy to production
        if: github.event.inputs.environment == 'production'
        run: |
          echo "Deploying to production..."
          # Production deployment logic

      - name: Notify deployment
        run: |
          echo "Deployment completed successfully!"
          # Notification logic
```

## ⚙️ Konfiguration

### GitHub Secrets
```bash
# Docker Hub
DOCKERHUB_USERNAME=your_username
DOCKERHUB_TOKEN=your_token

# Deployment
DEPLOYMENT_KEY=your_deployment_key
STAGING_HOST=staging.example.com
PRODUCTION_HOST=production.example.com

# Notifications
SLACK_WEBHOOK_URL=your_slack_webhook
DISCORD_WEBHOOK_URL=your_discord_webhook
```

### Workflow-Konfiguration
```yaml
# .github/workflows/config.yml
ci:
  rust_version: '1.75'
  cache_enabled: true
  parallel_jobs: 4
  
build:
  android_enabled: true
  ios_enabled: true
  docker_enabled: true
  
test:
  unit_tests: true
  integration_tests: true
  performance_tests: true
  
deployment:
  auto_deploy: false
  environments:
    - staging
    - production
```

## 📈 Monitoring und Metriken

### Pipeline-Metriken
- **Build-Zeit** - Durchschnittliche Build-Dauer
- **Test-Coverage** - Code-Coverage-Statistiken
- **Performance** - Benchmark-Ergebnisse
- **Deployment-Frequency** - Häufigkeit der Deployments
- **Lead Time** - Zeit von Commit bis Deployment

### Dashboard-Integration
```yaml
- name: Update metrics dashboard
  run: |
    curl -X POST ${{ secrets.METRICS_DASHBOARD_URL }} \
      -H "Content-Type: application/json" \
      -d "{
        \"pipeline\": \"${{ github.workflow }}\",
        \"status\": \"${{ job.status }}\",
        \"duration\": \"${{ job.steps.duration }}\",
        \"timestamp\": \"${{ github.event.head_commit.timestamp }}\"
      }"
```

## 🔧 Troubleshooting

### Häufige Probleme

1. **Build-Fehler**
   ```bash
   # Cache löschen
   cargo clean
   rm -rf target/
   
   # Dependencies aktualisieren
   cargo update
   ```

2. **Test-Fehler**
   ```bash
   # Tests mit Debug-Output
   RUST_BACKTRACE=1 cargo test -- --nocapture
   
   # Spezifische Tests
   cargo test test_name
   ```

3. **Deployment-Fehler**
   ```bash
   # Logs prüfen
   kubectl logs deployment/brezn
   
   # Rollback
   kubectl rollout undo deployment/brezn
   ```

### Debug-Modus
```yaml
- name: Enable debug mode
  run: |
    echo "::set-output name=debug::true"
    echo "::set-output name=verbose::true"
    
- name: Debug information
  if: steps.debug.outputs.debug == 'true'
  run: |
    echo "Debug mode enabled"
    echo "Repository: ${{ github.repository }}"
    echo "Branch: ${{ github.ref }}"
    echo "Commit: ${{ github.sha }}"
```

## 📚 Weitere Ressourcen

- [GitHub Actions Dokumentation](https://docs.github.com/en/actions)
- [Rust CI/CD Best Practices](https://rust-lang.github.io/rustup/concepts/channels.html)
- [Docker Multi-Platform Builds](https://docs.docker.com/build/building/multi-platform/)
- [Security Scanning Tools](https://github.com/features/security)

---

**Entwickelt für das Brezn-Projekt** 🚀🔧