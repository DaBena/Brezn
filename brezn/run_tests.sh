#!/bin/bash

# Brezn P2P-Netzwerk Test Suite
# Führt alle Tests aus und generiert Berichte

set -e

echo "🧪 Brezn P2P-Netzwerk Test Suite"
echo "=================================="
echo ""

# Farben für Output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test-Verzeichnis erstellen
mkdir -p test_results

echo -e "${BLUE}📋 Führe Unit Tests aus...${NC}"
echo ""

# Unit Tests ausführen
if cargo test --lib --tests 2>&1 | tee test_results/unit_tests.log; then
    echo -e "${GREEN}✅ Unit Tests erfolgreich!${NC}"
else
    echo -e "${RED}❌ Unit Tests fehlgeschlagen!${NC}"
    echo "Siehe test_results/unit_tests.log für Details"
fi

echo ""

echo -e "${BLUE}🔍 Führe Integration Tests aus...${NC}"
echo ""

# Integration Tests ausführen
if cargo test --test integration_tests 2>&1 | tee test_results/integration_tests.log; then
    echo -e "${GREEN}✅ Integration Tests erfolgreich!${NC}"
else
    echo -e "${RED}❌ Integration Tests fehlgeschlagen!${NC}"
    echo "Siehe test_results/integration_tests.log für Details"
fi

echo ""

echo -e "${BLUE}⚡ Führe Performance Tests aus...${NC}"
echo ""

# Performance Tests ausführen (falls criterion verfügbar)
if command -v cargo-criterion &> /dev/null; then
    if cargo criterion 2>&1 | tee test_results/performance_tests.log; then
        echo -e "${GREEN}✅ Performance Tests erfolgreich!${NC}"
    else
        echo -e "${YELLOW}⚠️ Performance Tests fehlgeschlagen (nicht kritisch)${NC}"
    fi
else
    echo -e "${YELLOW}⚠️ cargo-criterion nicht verfügbar, überspringe Performance Tests${NC}"
    echo "Installation: cargo install cargo-criterion"
fi

echo ""

echo -e "${BLUE}📊 Generiere Test-Bericht...${NC}"
echo ""

# Test-Bericht generieren
{
    echo "# Brezn P2P-Netzwerk Test-Bericht"
    echo "Generiert am: $(date)"
    echo ""
    
    echo "## Unit Tests"
    if [ -f test_results/unit_tests.log ]; then
        echo "Status: $(grep -c "test result:" test_results/unit_tests.log || echo "Unbekannt")"
        echo "Erfolgreich: $(grep -c "test result: ok" test_results/unit_tests.log || echo "0")"
        echo "Fehlgeschlagen: $(grep -c "test result: FAILED" test_results/unit_tests.log || echo "0")"
    fi
    
    echo ""
    echo "## Integration Tests"
    if [ -f test_results/integration_tests.log ]; then
        echo "Status: $(grep -c "test result:" test_results/integration_tests.log || echo "Unbekannt")"
        echo "Erfolgreich: $(grep -c "test result: ok" test_results/integration_tests.log || echo "0")"
        echo "Fehlgeschlagen: $(grep -c "test result: FAILED" test_results/integration_tests.log || echo "0")"
    fi
    
    echo ""
    echo "## Performance Tests"
    if [ -f test_results/performance_tests.log ]; then
        echo "Status: $(grep -c "test result:" test_results/performance_tests.log || echo "Unbekannt")"
    else
        echo "Status: Nicht ausgeführt"
    fi
    
    echo ""
    echo "## Zusammenfassung"
    echo "Alle Tests wurden ausgeführt. Überprüfen Sie die Log-Dateien in test_results/ für Details."
    
} > test_results/test_report.md

echo -e "${GREEN}✅ Test-Bericht generiert: test_results/test_report.md${NC}"
echo ""

echo -e "${BLUE}📁 Test-Ergebnisse:${NC}"
echo "  📄 Unit Tests: test_results/unit_tests.log"
echo "  📄 Integration Tests: test_results/integration_tests.log"
echo "  📄 Performance Tests: test_results/performance_tests.log"
echo "  📊 Bericht: test_results/test_report.md"
echo ""

echo -e "${GREEN}🎉 Test Suite abgeschlossen!${NC}"
echo ""

# Zeige Test-Bericht an
if [ -f test_results/test_report.md ]; then
    echo -e "${BLUE}📊 Test-Bericht:${NC}"
    cat test_results/test_report.md
fi