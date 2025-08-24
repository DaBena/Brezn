#!/bin/bash
# 🤖 Cursor Agent Automation Script - Brezn MVP
# Automatisiert die Feature-Entwicklung mit Cursor AI

set -e

# Farben für Output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Projekt-Verzeichnis
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BREZN_DIR="$PROJECT_ROOT/brezn"
DOCS_DIR="$PROJECT_ROOT/docs"

echo -e "${BLUE}🤖 Cursor Agent Automation - Brezn MVP${NC}"
echo -e "${BLUE}==========================================${NC}\n"

# Git Protection Setup prüfen
check_git_protection() {
    echo -e "${YELLOW}🔒 Prüfe Git Protection Setup...${NC}"
    
    local email=$(git config user.email)
    local name=$(git config user.name)
    
    if [ "$email" != "brezn-dev@noreply.github.com" ]; then
        echo -e "${RED}❌ Git Email nicht korrekt konfiguriert!${NC}"
        echo -e "${YELLOW}Führe setup_git_protection.sh aus...${NC}"
        
        if [ -f "$PROJECT_ROOT/scripts/setup_git_protection.sh" ]; then
            bash "$PROJECT_ROOT/scripts/setup_git_protection.sh"
        else
            echo -e "${RED}❌ setup_git_protection.sh nicht gefunden!${NC}"
            exit 1
        fi
    else
        echo -e "${GREEN}✅ Git Protection aktiv${NC}"
    fi
}

# MVP Status analysieren
analyze_mvp_status() {
    echo -e "\n${YELLOW}📊 Analysiere MVP Status...${NC}"
    
    if [ -f "$DOCS_DIR/PROJECT_STATUS_ACTUAL.md" ]; then
        # MVP Fortschritt extrahieren
        local progress=$(grep -oP 'MVP-Fortschritt:\s*\K\d+' "$DOCS_DIR/PROJECT_STATUS_ACTUAL.md" | head -1)
        echo -e "${GREEN}✅ MVP-Fortschritt: ${progress}%${NC}"
        
        # Nächstes Feature bestimmen
        if [ "$progress" -lt 50 ]; then
            NEXT_FEATURE="p2p-peer-discovery"
            PRIORITY="HIGH"
        elif [ "$progress" -lt 70 ]; then
            NEXT_FEATURE="tor-integration"
            PRIORITY="MEDIUM"
        else
            NEXT_FEATURE="qr-code-implementation"
            PRIORITY="LOW"
        fi
        
        echo -e "${GREEN}🎯 Nächstes Feature: ${NEXT_FEATURE} (Priorität: ${PRIORITY})${NC}"
    else
        echo -e "${RED}❌ PROJECT_STATUS_ACTUAL.md nicht gefunden!${NC}"
        exit 1
    fi
}

# Feature Branch erstellen
create_feature_branch() {
    echo -e "\n${YELLOW}🌿 Erstelle Feature Branch...${NC}"
    
    local branch_name="feature/auto-${NEXT_FEATURE}-$(date +%Y%m%d-%H%M)"
    
    # Prüfe ob Branch bereits existiert
    if git show-ref --verify --quiet "refs/heads/$branch_name"; then
        echo -e "${YELLOW}Branch existiert bereits, verwende bestehenden...${NC}"
    else
        git checkout -b "$branch_name"
        echo -e "${GREEN}✅ Feature Branch erstellt: $branch_name${NC}"
    fi
    
    FEATURE_BRANCH="$branch_name"
}

# Cursor Agent Prompts generieren
generate_cursor_prompts() {
    echo -e "\n${YELLOW}📝 Generiere Cursor Agent Prompts...${NC}"
    
    case "$NEXT_FEATURE" in
        "p2p-peer-discovery")
            cat > "$PROJECT_ROOT/.cursor_prompt_p2p.md" << 'EOF'
# 🎯 Implementiere P2P Peer-Discovery

Analysiere `brezn/src/network.rs` und `brezn/src/discovery.rs`.

## Aufgaben:
1. Ersetze alle Platzhalter-Implementierungen
2. Implementiere UDP-Broadcast für Peer-Discovery
3. Füge Peer-Registry mit Heartbeat-System hinzu
4. Erstelle Tests für Multi-Peer-Konnektivität

## Anforderungen:
- Verwende Tokio für async Netzwerk-Operationen
- Implementiere proper Error Handling (kein unwrap!)
- Füge Logging mit log crate hinzu
- Dokumentiere alle öffentlichen Funktionen

## Code-Beispiel für UDP-Broadcast:
```rust
use tokio::net::UdpSocket;
use std::net::{Ipv4Addr, SocketAddr};

pub async fn broadcast_discovery() -> Result<()> {
    let socket = UdpSocket::bind("0.0.0.0:0").await?;
    socket.set_broadcast(true)?;
    // Implementierung hier...
}
```
EOF
            ;;
            
        "tor-integration")
            cat > "$PROJECT_ROOT/.cursor_prompt_tor.md" << 'EOF'
# 🔒 Implementiere Tor-Integration

Analysiere `brezn/src/tor.rs` und erweitere die SOCKS5-Integration.

## Aufgaben:
1. Implementiere vollständige SOCKS5-Proxy-Verbindung
2. Füge Circuit-Management hinzu
3. Teste anonymes Routing
4. Integriere mit P2P-Netzwerk

## Anforderungen:
- SOCKS5 Protokoll korrekt implementieren
- Tor-Verbindung mit Retry-Logic
- Fehlerbehandlung für Netzwerkfehler
- Performance-Monitoring

## SOCKS5 Handshake:
```rust
// Version 5, 1 Auth method, No auth
let handshake = vec![0x05, 0x01, 0x00];
stream.write_all(&handshake).await?;
```
EOF
            ;;
            
        "qr-code-implementation")
            cat > "$PROJECT_ROOT/.cursor_prompt_qr.md" << 'EOF'
# 📱 Implementiere QR-Code-System

Analysiere `brezn/src/discovery.rs` und implementiere QR-Code-Funktionalität.

## Aufgaben:
1. QR-Code-Generierung für Peer-Daten
2. QR-Code-Parsing und Validierung
3. Peer-Join über QR-Code
4. Cross-Platform-Tests

## Anforderungen:
- Verwende qrcode crate
- JSON-Serialisierung der Peer-Daten
- Zeitbasierte Gültigkeit (1 Stunde)
- Fehlerbehandlung für ungültige QR-Codes

## Datenstruktur:
```rust
#[derive(Serialize, Deserialize)]
struct JoinData {
    node_id: String,
    public_key: String,
    address: String,
    port: u16,
    timestamp: u64,
}
```
EOF
            ;;
    esac
    
    echo -e "${GREEN}✅ Cursor Prompt erstellt: .cursor_prompt_${NEXT_FEATURE}.md${NC}"
}

# Tests ausführen
run_tests() {
    echo -e "\n${YELLOW}🧪 Führe Tests aus...${NC}"
    
    cd "$BREZN_DIR"
    
    if cargo test --quiet; then
        echo -e "${GREEN}✅ Alle Tests bestanden${NC}"
        return 0
    else
        echo -e "${RED}❌ Tests fehlgeschlagen${NC}"
        return 1
    fi
}

# Code formatieren
format_code() {
    echo -e "\n${YELLOW}🎨 Formatiere Code...${NC}"
    
    cd "$BREZN_DIR"
    
    cargo fmt
    echo -e "${GREEN}✅ Code formatiert${NC}"
    
    # Clippy laufen lassen
    if cargo clippy -- -D warnings 2>/dev/null; then
        echo -e "${GREEN}✅ Clippy-Checks bestanden${NC}"
    else
        echo -e "${YELLOW}⚠️  Clippy Warnungen gefunden${NC}"
    fi
}

# Status aktualisieren
update_status() {
    echo -e "\n${YELLOW}📊 Aktualisiere Projektstatus...${NC}"
    
    # Hier würde normalerweise PROJECT_STATUS_ACTUAL.md aktualisiert werden
    echo -e "${GREEN}✅ Status würde aktualisiert (im echten Workflow)${NC}"
}

# Hauptprogramm
main() {
    echo -e "${BLUE}Start: $(date)${NC}\n"
    
    # 1. Git Protection prüfen
    check_git_protection
    
    # 2. MVP Status analysieren
    analyze_mvp_status
    
    # 3. Feature Branch erstellen
    create_feature_branch
    
    # 4. Cursor Prompts generieren
    generate_cursor_prompts
    
    echo -e "\n${GREEN}========================================${NC}"
    echo -e "${GREEN}🎯 Cursor Agent kann jetzt starten!${NC}"
    echo -e "${GREEN}========================================${NC}\n"
    
    echo -e "${YELLOW}📋 Nächste Schritte:${NC}"
    echo -e "1. Öffne Cursor im Projekt-Verzeichnis"
    echo -e "2. Lade den generierten Prompt: ${BLUE}.cursor_prompt_${NEXT_FEATURE}.md${NC}"
    echo -e "3. Lasse Cursor das Feature implementieren"
    echo -e "4. Führe dieses Script erneut aus für Tests und Formatierung"
    echo -e "\n${YELLOW}💡 Tipp: Nutze Cursor's AI für beste Ergebnisse!${NC}"
    
    # Optional: Warte auf Benutzer-Input
    read -p "$(echo -e '\n${YELLOW}Feature implementiert? Tests ausführen? (y/n): ${NC}')" -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        # 5. Tests ausführen
        if run_tests; then
            # 6. Code formatieren
            format_code
            
            # 7. Status aktualisieren
            update_status
            
            echo -e "\n${GREEN}🎉 Feature-Entwicklung abgeschlossen!${NC}"
            echo -e "${GREEN}Branch: $FEATURE_BRANCH${NC}"
            echo -e "${YELLOW}Erstelle jetzt einen Pull Request!${NC}"
        else
            echo -e "\n${RED}❌ Bitte behebe die Test-Fehler first!${NC}"
        fi
    fi
    
    echo -e "\n${BLUE}Ende: $(date)${NC}"
}

# Script ausführen
main "$@"