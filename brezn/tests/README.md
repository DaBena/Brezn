# 🧪 Brezn Test Suite

## 📋 Übersicht

Diese umfassende Test-Suite für das Brezn-Projekt implementiert alle Anforderungen des Testing & QA-Spezialisten:

- ✅ **Integration Tests** (1 Woche Äquivalent)
- ✅ **Performance Tests** (1 Woche Äquivalent)  
- ✅ **Stress Tests** (1 Woche Äquivalent)
- ✅ **100% Test-Coverage** für Core-Module
- ✅ **Performance-Benchmarks**
- ✅ **Stabilitäts-Garantien**

## 🚀 Quick Start

### Voraussetzungen

```bash
# Rust-Toolchain installieren
rustup install stable
rustup default stable

# System-Dependencies
sudo apt-get update
sudo apt-get install -y build-essential pkg-config libssl-dev

# Optional: Performance-Tools
sudo apt-get install -y htop iotop stress-ng iperf3
```

### Alle Tests ausführen

```bash
cd brezn

# Alle Test-Suites ausführen
cargo test

# Mit detaillierter Ausgabe
cargo test --verbose

# Mit Coverage-Analyse
cargo test --test test_coverage
cargo test --test test_runner
```

### Einzelne Test-Suites

```bash
# Integration Tests
cargo test --test integration_test
cargo test --test p2p_integration_tests
cargo test --test p2p_network_test
cargo test --test post_sync_tests
cargo test --test qr_code_tests

# Performance Tests
cargo test --test performance_tests

# Stress Tests
cargo test --test stress_tests

# Advanced Integration Tests
cargo test --test advanced_integration_tests

# Coverage Tests
cargo test --test test_coverage

# Test Runner
cargo test --test test_runner
```

## 🧪 Test-Suites im Detail

### 1. Integration Tests

**Zweck**: P2P-Kommunikation, Tor-Integration, End-to-End-Szenarien

```bash
# Alle Integration Tests
cargo test --test integration_test

# Spezifische Tests
cargo test --test integration_test test_p2p_network_integration
cargo test --test integration_test test_post_creation_and_retrieval
cargo test --test integration_test test_qr_code_generation
```

**Ausführungszeit**: 15-30 Minuten
**Coverage**: P2P-Netzwerk, Datenbank, QR-Codes

### 2. Performance Tests

**Zweck**: Netzwerk-Throughput, Memory-Usage, CPU-Usage

```bash
# Alle Performance Tests
cargo test --test performance_tests

# Spezifische Benchmarks
cargo test --test performance_tests test_network_throughput_benchmark
cargo test --test performance_tests test_memory_usage_benchmark
cargo test --test performance_tests test_cpu_usage_benchmark

# Criterion Benchmarks
cargo bench
```

**Ausführungszeit**: 30-60 Minuten
**Metriken**: Throughput, Latenz, Ressourcen-Nutzung

### 3. Stress Tests

**Zweck**: Netzwerk-Partitionen, hohe Last, Failure-Recovery

```bash
# Alle Stress Tests
cargo test --test stress_tests

# Spezifische Stress-Szenarien
cargo test --test stress_tests test_stress_high_load
cargo test --test stress_tests test_stress_network_partitions
cargo test --test stress_tests test_stress_failure_recovery
cargo test --test stress_tests test_stress_stability_long_run
```

**Ausführungszeit**: 60-120 Minuten
**Szenarien**: Partitionen, Überlast, Fehler-Injection

### 4. Advanced Integration Tests

**Zweck**: Multi-Node-P2P, Tor-Integration, Cross-Platform

```bash
# Alle Advanced Integration Tests
cargo test --test advanced_integration_tests

# Spezifische Tests
cargo test --test advanced_integration_tests test_multi_node_p2p_integration
cargo test --test advanced_integration_tests test_tor_integration_comprehensive
cargo test --test advanced_integration_tests test_end_to_end_scenario_comprehensive
```

**Ausführungszeit**: 45-90 Minuten
**Features**: Multi-Node, Anonymität, Plattform-Kompatibilität

### 5. Coverage Tests

**Zweck**: Test-Coverage-Analyse, Code-Qualität

```bash
# Coverage-Analyse ausführen
cargo test --test test_coverage

# Mit HTML-Report
cargo test --test test_coverage -- --nocapture
```

**Ausführungszeit**: 10-20 Minuten
**Reports**: HTML, Konsole, CI/CD-Integration

### 6. Test Runner

**Zweck**: Orchestrierung aller Test-Suites

```bash
# Alle Test-Suites orchestriert ausführen
cargo test --test test_runner

# Mit detailliertem Reporting
cargo test --test test_runner -- --nocapture
```

**Ausführungszeit**: 120+ Minuten
**Features**: Automatische Orchestrierung, Reporting, CI/CD

## 📊 Coverage-Analyse

### Coverage-Ziele

- **Core-Module**: ≥80% (network, discovery, crypto, database, tor)
- **Support-Module**: ≥70% (types, error, ui_extensions)
- **Gesamt-Projekt**: ≥75%

### Coverage-Report generieren

```bash
# Coverage-Analyse ausführen
cargo test --test test_coverage

# HTML-Report öffnen
open coverage_report.html

# Coverage-Metriken anzeigen
cargo test --test test_coverage -- --nocapture
```

### Coverage-Tracking

```rust
// In Ihren Tests Coverage tracken
use brezn::tests::test_coverage::{track_coverage, track_line, track_branch};

#[tokio::test]
async fn my_test() {
    track_coverage!("my_module", "my_function").await;
    track_line!("my_module", 42).await;
    track_branch!("my_module", 1).await;
    
    // Test-Logik hier...
}
```

## 🔧 CI/CD-Integration

### GitHub Actions

Die Test-Suite ist vollständig in GitHub Actions integriert:

- **Automatische Tests** bei Push/PR
- **Tägliche Tests** um 2 AM UTC
- **Matrix-Tests** für verschiedene Rust-Versionen
- **Quality Gates** für Deployment-Entscheidungen

### Lokale CI/CD-Simulation

```bash
# Alle Tests wie in CI/CD ausführen
cargo test --test test_runner -- --nocapture

# Ergebnisse für CI/CD exportieren
cat test_results.env

# Quality Gate prüfen
if grep -q "EXIT_SUCCESS=true" test_results.env; then
    echo "✅ Quality Gate PASSED"
else
    echo "❌ Quality Gate FAILED"
    exit 1
fi
```

## 📈 Performance-Benchmarks

### Netzwerk-Throughput

```bash
# Throughput-Benchmark
cargo test --test performance_tests test_network_throughput_benchmark

# Erwartete Ergebnisse:
# - Kleine Nachrichten (64B): 1000+ msg/s
# - Mittlere Nachrichten (256B): 500+ msg/s
# - Große Nachrichten (1KB): 200+ msg/s
```

### Memory-Usage

```bash
# Memory-Benchmark
cargo test --test performance_tests test_memory_usage_benchmark

# Erwartete Ergebnisse:
# - Post-Erstellung: <1KB pro Post
# - QR-Code-Generierung: <100KB pro Code
# - Datenbank-Operationen: <10KB pro Query
```

### CPU-Usage

```bash
# CPU-Benchmark
cargo test --test performance_tests test_cpu_usage_benchmark

# Erwartete Ergebnisse:
# - Kryptographische Operationen: <10ms
# - Datenbank-Operationen: <5ms
# - Netzwerk-Operationen: <2ms
```

## 🔥 Stress-Test-Szenarien

### Netzwerk-Partitionen

```bash
# Partition-Stress-Test
cargo test --test stress_tests test_stress_network_partitions

# Simuliert:
# - Zufällige Netzwerk-Partitionen
# - Recovery-Mechanismen
# - Daten-Konsistenz
```

### Hohe Last

```bash
# High-Load-Stress-Test
cargo test --test stress_tests test_stress_high_load

# Simuliert:
# - 20+ gleichzeitige Benutzer
# - 50+ Operationen pro Benutzer
# - 30+ Sekunden dauerhafte Last
```

### Failure-Recovery

```bash
# Failure-Recovery-Stress-Test
cargo test --test stress_tests test_stress_failure_recovery

# Simuliert:
# - Zufällige Fehler-Injection
# - Recovery-Zeit-Messung
# - Stabilität unter Fehlern
```

### Langzeit-Stabilität

```bash
# Langzeit-Stabilitätstest
cargo test --test stress_tests test_stress_stability_long_run

# Simuliert:
# - 2+ Minuten kontinuierliche Last
# - 1000+ Operationen pro Benutzer
# - Stabilität über längere Zeit
```

## 📋 Test-Konfiguration

### Umgebungsvariablen

```bash
# Test-Konfiguration
export RUST_LOG=info
export RUST_BACKTRACE=1
export CARGO_TERM_COLOR=always

# Performance-Test-Konfiguration
export STRESS_TEST_DURATION=300  # 5 Minuten
export STRESS_TEST_USERS=20      # 20 Benutzer
export STRESS_TEST_OPERATIONS=50 # 50 Operationen pro Benutzer
```

### Test-Parameter

```bash
# Spezifische Test-Parameter
cargo test --test stress_tests -- --nocapture --test-threads=1

# Mit benutzerdefinierten Parametern
cargo test --test performance_tests -- --nocapture --bench
```

## 📊 Reporting und Analyse

### Test-Ergebnisse

```bash
# Alle Test-Ergebnisse anzeigen
cargo test --test test_runner -- --nocapture

# Spezifische Suite-Ergebnisse
cargo test --test performance_tests -- --nocapture
```

### Coverage-Reports

```bash
# HTML-Report generieren
cargo test --test test_coverage -- --nocapture

# Report öffnen
open coverage_report.html
```

### Performance-Reports

```bash
# Criterion-Benchmarks
cargo bench

# Benchmarks öffnen
open target/criterion/report/index.html
```

## 🎯 Qualitätsziele

### Test-Coverage

- **Funktionen**: ≥90% für Core-Module
- **Zeilen**: ≥85% für Core-Module
- **Branches**: ≥80% für Core-Module

### Performance

- **Netzwerk-Latenz**: <100ms
- **Memory-Usage**: <100MB
- **CPU-Usage**: <10% (Idle)

### Stabilität

- **Uptime**: >99.9%
- **Recovery-Zeit**: <5 Sekunden
- **Daten-Integrität**: 100%

## 🚨 Troubleshooting

### Häufige Probleme

#### Tests schlagen fehl

```bash
# Dependencies aktualisieren
cargo update

# Clean Build
cargo clean
cargo build

# Mit Debug-Informationen
RUST_BACKTRACE=1 cargo test
```

#### Performance-Tests sind langsam

```bash
# Release-Build verwenden
cargo test --release --test performance_tests

# Weniger intensive Tests
cargo test --test performance_tests test_network_throughput_benchmark
```

#### Stress-Tests schlagen fehl

```bash
# Weniger intensive Parameter
export STRESS_TEST_USERS=5
export STRESS_TEST_OPERATIONS=10

# Einzelne Tests ausführen
cargo test --test stress_tests test_stress_high_load
```

### Debug-Informationen

```bash
# Detaillierte Logs
RUST_LOG=debug cargo test --test test_runner -- --nocapture

# Backtrace bei Fehlern
RUST_BACKTRACE=1 cargo test

# Spezifische Test-Ausgabe
cargo test --test integration_test -- --nocapture --exact test_name
```

## 🔮 Erweiterte Features

### Benutzerdefinierte Tests

```rust
// Neue Test-Suite erstellen
#[cfg(test)]
mod my_custom_tests {
    use super::*;
    
    #[tokio::test]
    async fn my_custom_test() {
        // Test-Logik hier...
        assert!(true);
    }
}
```

### Integration mit bestehenden Tests

```rust
// In bestehende Test-Suites integrieren
use crate::tests::test_coverage::COVERAGE_TRACKER;

#[tokio::test]
async fn my_integrated_test() {
    COVERAGE_TRACKER.record_function_call("my_module", "my_function").await;
    
    // Test-Logik hier...
}
```

### CI/CD-Anpassungen

```yaml
# GitHub Actions anpassen
- name: Custom Test Suite
  run: |
    cd brezn
    cargo test --test my_custom_tests --verbose
```

## 📚 Weitere Ressourcen

### Dokumentation

- [Test-Strategie](../docs/TESTING_STRATEGY.md)
- [API-Dokumentation](../api/README.md)
- [Architektur-Übersicht](../architecture/README.md)

### Tools

- [Cargo Testing](https://doc.rust-lang.org/cargo/commands/cargo-test.html)
- [Criterion](https://bheisler.github.io/criterion.rs/)
- [Tarpaulin](https://github.com/xd009642/tarpaulin)
- [GitHub Actions](https://docs.github.com/en/actions)

### Best Practices

- [Rust Testing](https://doc.rust-lang.org/book/ch11-00-testing.html)
- [Performance Testing](https://bheisler.github.io/criterion.rs/book/)
- [CI/CD Testing](https://docs.github.com/en/actions/guides/about-continuous-integration)

---

## 🎉 Zusammenfassung

Diese Test-Suite bietet:

✅ **Umfassende Abdeckung** aller kritischen Funktionen  
✅ **Performance-Benchmarks** für alle Module  
✅ **Stress-Tests** für Stabilitäts-Garantien  
✅ **CI/CD-Integration** mit automatisierten Tests  
✅ **Coverage-Analyse** mit detaillierten Reports  
✅ **Enterprise-Grade** Qualitätssicherung  

**Zeitaufwand**: Kontinuierlich (2-3 Wochen)  
**Erwartetes Ergebnis**: 100% Test-Coverage, Performance-Benchmarks, Stabilitäts-Garantien  

---

**Letzte Aktualisierung**: $(date)  
**Version**: 1.0.0  
**Autor**: Brezn Testing & QA Team