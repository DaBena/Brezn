use crate::BreznApp;
use anyhow::Result;
use std::io::{self, Write};

pub struct CliInterface {
    app: BreznApp,
}

impl CliInterface {
    pub fn new() -> Result<Self> {
        let app = BreznApp::new()?;
        Ok(Self { app })
    }
    
    pub fn run(&self) -> Result<()> {
        println!("🥨 Brezn CLI - Dezentrale Feed-App");
        println!("=====================================");
        
        loop {
            print!("\n> ");
            io::stdout().flush()?;
            
            let mut input = String::new();
            io::stdin().read_line(&mut input)?;
            let input = input.trim();
            
            match input {
                "help" | "h" => self.show_help(),
                "posts" | "p" => self.show_posts(),
                "post" => self.create_post(),
                "config" | "c" => self.show_config(),
                "network" | "n" => self.show_network_info(),
                "qr" => self.generate_qr_code(),
                "peers" => self.show_peers(),
                "quit" | "q" | "exit" => break,
                "" => continue,
                _ => println!("❌ Unbekannter Befehl. Tippe 'help' für Hilfe."),
            }
        }
        
        println!("👋 Auf Wiedersehen!");
        Ok(())
    }
    
    fn show_help(&self) {
        println!("\n📋 Verfügbare Befehle:");
        println!("  help/h     - Diese Hilfe anzeigen");
        println!("  posts/p    - Alle Posts anzeigen");
        println!("  post       - Neuen Post erstellen");
        println!("  config/c   - Konfiguration anzeigen");
        println!("  network/n  - Netzwerk-Informationen");
        println!("  qr         - QR-Code für Netzwerkbeitritt generieren");
        println!("  peers      - Verbundene Peers anzeigen");
        println!("  quit/q     - Beenden");
    }
    
    fn show_posts(&self) {
        match self.app.get_posts(50) {
            Ok(posts) => {
                if posts.is_empty() {
                    println!("📭 Keine Posts vorhanden.");
                } else {
                    println!("\n📝 Posts:");
                    for post in posts {
                        println!("  [{}] {}: {}", 
                            post.get_formatted_time(),
                            post.pseudonym,
                            post.content
                        );
                    }
                }
            }
            Err(e) => println!("❌ Fehler beim Laden der Posts: {}", e),
        }
    }
    
    fn create_post(&self) {
        print!("📝 Post-Inhalt: ");
        io::stdout().flush().unwrap();
        
        let mut content = String::new();
        io::stdin().read_line(&mut content).unwrap();
        let content = content.trim().to_string();
        
        if content.is_empty() {
            println!("❌ Post-Inhalt darf nicht leer sein.");
            return;
        }
        
        print!("👤 Pseudonym (Enter für Standard): ");
        io::stdout().flush().unwrap();
        
        let mut pseudonym = String::new();
        io::stdin().read_line(&mut pseudonym).unwrap();
        let pseudonym = pseudonym.trim();
        
        let pseudonym = if pseudonym.is_empty() {
            "AnonymBrezn".to_string()
        } else {
            pseudonym.to_string()
        };
        
        match self.app.add_post(content, pseudonym) {
            Ok(id) => println!("✅ Post erstellt mit ID: {}", id),
            Err(e) => println!("❌ Fehler beim Erstellen des Posts: {}", e),
        }
    }
    
    fn show_config(&self) {
        match self.app.get_config() {
            Ok(config) => {
                println!("\n⚙️  Konfiguration:");
                println!("  Standard-Pseudonym: {}", config.default_pseudonym);
                println!("  Max Posts: {}", config.max_posts);
                println!("  Auto-Save: {}", config.auto_save);
                println!("  Netzwerk aktiv: {}", config.network_enabled);
                println!("  Tor aktiv: {}", config.tor_enabled);
                println!("  Netzwerk-Port: {}", config.network_port);
                println!("  Tor SOCKS-Port: {}", config.tor_socks_port);
            }
            Err(e) => println!("❌ Fehler beim Laden der Konfiguration: {}", e),
        }
    }
    
    fn show_network_info(&self) {
        println!("\n🌐 Netzwerk-Informationen:");
        println!("  Node ID: {}", self.app.get_node_id());
        println!("  Tor aktiv: {}", self.app.is_tor_enabled());
        
        match self.app.get_config() {
            Ok(config) => {
                println!("  Netzwerk aktiv: {}", config.network_enabled);
                println!("  Netzwerk-Port: {}", config.network_port);
                println!("  Tor SOCKS-Port: {}", config.tor_socks_port);
            }
            Err(e) => println!("❌ Fehler beim Laden der Konfiguration: {}", e),
        }
    }
    
    fn generate_qr_code(&self) {
        println!("\n📱 QR-Code für Netzwerkbeitritt:");
        println!("  Node ID: {}", self.app.get_node_id());
        
        // In a real implementation, this would use the discovery module
        println!("  QR-Code-Generierung wird implementiert...");
        println!("  (Für MVP: Manuelle Peer-Konfiguration)");
    }
    
    fn show_peers(&self) {
        println!("\n👥 Verbundene Peers:");
        println!("  (Peer-Management wird in Phase 2 implementiert)");
        println!("  Aktuell: Lokaler Modus");
    }
}