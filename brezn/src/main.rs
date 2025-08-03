use std::io::{self, Write};
use std::fs;
use serde::{Serialize, Deserialize};
use std::collections::HashMap;
use std::net::{TcpListener, TcpStream};
use std::thread;
use std::time::Duration;

#[derive(Serialize, Deserialize, Clone)]
struct Post {
    content: String,
    timestamp: u64,
    pseudonym: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct Peer {
    id: String,
    address: String,
    last_seen: u64,
    posts_count: usize,
}

#[derive(Serialize, Deserialize)]
enum NetworkMessage {
    NewPost(Post),
    RequestPosts,
    PostsResponse(Vec<Post>),
    PeerDiscovery,
    PeerInfo(Peer),
}

#[derive(Serialize, Deserialize)]
struct Config {
    default_pseudonym: String,
    auto_save: bool,
    max_posts: usize,
    theme: String,
    language: String,
    network_enabled: bool,
    network_port: u16,
    discovery_port: u16,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            default_pseudonym: "AnonymBrezn42".to_string(),
            auto_save: true,
            max_posts: 1000,
            theme: "default".to_string(),
            language: "de".to_string(),
            network_enabled: false,
            network_port: 8080,
            discovery_port: 8081,
        }
    }
}

#[derive(Serialize, Deserialize)]
struct BreznData {
    posts: Vec<Post>,
    muted_users: std::collections::HashSet<String>,
    config: Config,
    peers: HashMap<String, Peer>,
    node_id: String,
}

impl BreznData {
    fn generate_node_id() -> String {
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let random_part = (timestamp % 999999) as u32;
        format!("brezn-{:x}-{:06}", timestamp, random_part)
    }

    fn new() -> Self {
        Self {
            posts: vec![
                Post {
                    content: "Willkommen bei Brezn! 🥨".to_string(),
                    timestamp: std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap()
                        .as_secs(),
                    pseudonym: "AnonymBrezn42".to_string(),
                },
                Post {
                    content: "Das ist ein anonymer Post!".to_string(),
                    timestamp: std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap()
                        .as_secs() - 300,
                    pseudonym: "GeheimUser99".to_string(),
                },
            ],
            muted_users: std::collections::HashSet::new(),
            config: Config::default(),
            peers: HashMap::new(),
            node_id: Self::generate_node_id(),
        }
    }

    fn save(&self) -> Result<(), Box<dyn std::error::Error>> {
        let data = serde_json::to_string_pretty(self)?;
        fs::write("brezn_data.json", data)?;
        Ok(())
    }

    fn load() -> Result<Self, Box<dyn std::error::Error>> {
        if let Ok(data) = fs::read_to_string("brezn_data.json") {
            let mut loaded_data: Self = serde_json::from_str(&data)?;
            // Stelle sicher, dass node_id gesetzt ist
            if loaded_data.node_id.is_empty() {
                loaded_data.node_id = Self::generate_node_id();
            }
            Ok(loaded_data)
        } else {
            Ok(Self::new())
        }
    }

    fn add_post(&mut self, content: String, pseudonym: String) {
        let post = Post {
            content,
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs(),
            pseudonym,
        };
        self.posts.insert(0, post);
        
        // Begrenze die Anzahl der Posts
        if self.posts.len() > self.config.max_posts {
            self.posts.truncate(self.config.max_posts);
        }
    }

    fn display_feed(&self) {
        println!("\n🥨 Brezn Feed");
        println!("{}", "=".repeat(50));
        
        for (i, post) in self.posts.iter().enumerate() {
            if !self.muted_users.contains(&post.pseudonym) {
                let current_time = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_secs();
                let time_diff = current_time - post.timestamp;
                
                let time_str = if time_diff < 60 {
                    "gerade eben".to_string()
                } else if time_diff < 3600 {
                    format!("vor {}min", time_diff / 60)
                } else if time_diff < 86400 {
                    format!("vor {}h", time_diff / 3600)
                } else {
                    format!("vor {}d", time_diff / 86400)
                };

                println!("👤 {} • {}", post.pseudonym, time_str);
                println!("📝 {}", post.content);
                println!("🔗 ID: {}", i + 1);
                println!("{}", "-".repeat(30));
            }
        }
    }

    fn show_network_status(&self) {
        println!("\n📶 Netzwerk-Status:");
        println!("{}", "=".repeat(50));
        println!("📊 {} Posts lokal", self.posts.len());
        println!("🔇 {} stummgeschaltete Benutzer", self.muted_users.len());
        println!("🆔 Node-ID: {}", self.node_id);
        println!("🌐 Netzwerk: {}", if self.config.network_enabled { "Aktiv" } else { "Inaktiv" });
        println!("🔌 Port: {}", self.config.network_port);
        println!("🔍 Discovery Port: {}", self.config.discovery_port);
        println!("👥 Bekannte Peers: {}", self.peers.len());
        
        if !self.peers.is_empty() {
            println!("\n📋 Bekannte Peers:");
            for (_id, peer) in &self.peers {
                let last_seen = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_secs() - peer.last_seen;
                let time_str = if last_seen < 60 {
                    "gerade eben".to_string()
                } else if last_seen < 3600 {
                    format!("vor {}min", last_seen / 60)
                } else {
                    format!("vor {}h", last_seen / 3600)
                };
                println!("  • {} ({}) - {} Posts - {}", 
                    peer.id, peer.address, peer.posts_count, time_str);
            }
        }
        
        println!("💾 Persistenz: Aktiv (brezn_data.json)");
        println!("⚙️  Auto-Save: {}", if self.config.auto_save { "Aktiv" } else { "Inaktiv" });
    }

    fn start_network_server(&self) {
        if !self.config.network_enabled {
            println!("❌ Netzwerk ist deaktiviert!");
            return;
        }

        let port = self.config.network_port;
        let node_id = self.node_id.clone();
        
        thread::spawn(move || {
            if let Ok(listener) = TcpListener::bind(format!("127.0.0.1:{}", port)) {
                println!("🌐 Netzwerk-Server gestartet auf Port {}", port);
                println!("🆔 Node-ID: {}", node_id);
                
                for stream in listener.incoming() {
                    match stream {
                        Ok(stream) => {
                            println!("📡 Neue Verbindung von: {}", 
                                stream.peer_addr().map_or("Unbekannt".to_string(), |addr| addr.to_string()));
                            // Hier würde die Nachrichtenverarbeitung stattfinden
                            thread::sleep(Duration::from_millis(100));
                        }
                        Err(e) => {
                            println!("❌ Verbindungsfehler: {}", e);
                        }
                    }
                }
            } else {
                println!("❌ Fehler beim Starten des Netzwerk-Servers auf Port {}", port);
            }
        });
    }

    fn discover_peers(&mut self) {
        if !self.config.network_enabled {
            println!("❌ Netzwerk ist deaktiviert!");
            return;
        }

        println!("🔍 Suche nach anderen Brezn-Nodes...");
        
        // Simuliere Peer-Discovery
        let local_port = self.config.network_port;
        
        thread::spawn(move || {
            // Versuche Verbindung zu anderen Nodes
            for port in 8080..8090 {
                if port != local_port {
                    if let Ok(stream) = TcpStream::connect(format!("127.0.0.1:{}", port)) {
                        println!("✅ Node gefunden auf Port {}", port);
                        // Hier würde Peer-Information ausgetauscht
                        drop(stream);
                    }
                }
            }
        });
    }

    fn show_config(&self) {
        println!("\n⚙️  Konfiguration:");
        println!("{}", "=".repeat(50));
        println!("👤 Standard-Pseudonym: {}", self.config.default_pseudonym);
        println!("💾 Auto-Save: {}", if self.config.auto_save { "Aktiv" } else { "Inaktiv" });
        println!("📊 Max Posts: {}", self.config.max_posts);
        println!("🎨 Theme: {}", self.config.theme);
        println!("🌐 Sprache: {}", self.config.language);
        println!("🌐 Netzwerk: {}", if self.config.network_enabled { "Aktiv" } else { "Inaktiv" });
        println!("🔌 Netzwerk-Port: {}", self.config.network_port);
        println!("🔍 Discovery-Port: {}", self.config.discovery_port);
        println!("📁 Daten-Datei: brezn_data.json");
    }

    fn edit_config(&mut self) {
        println!("\n⚙️  Konfiguration bearbeiten:");
        println!("{}", "=".repeat(50));
        println!("1. Standard-Pseudonym ändern");
        println!("2. Auto-Save umschalten");
        println!("3. Max Posts ändern");
        println!("4. Theme ändern");
        println!("5. Sprache ändern");
        println!("6. Netzwerk aktivieren/deaktivieren");
        println!("7. Netzwerk-Port ändern");
        println!("8. Zurück");
        
        print!("Wähle eine Option (1-8): ");
        io::stdout().flush().unwrap();
        
        let mut input = String::new();
        io::stdin().read_line(&mut input).unwrap();
        let choice = input.trim();

        match choice {
            "1" => {
                print!("Neues Standard-Pseudonym: ");
                io::stdout().flush().unwrap();
                let mut new_pseudonym = String::new();
                io::stdin().read_line(&mut new_pseudonym).unwrap();
                let new_pseudonym = new_pseudonym.trim();
                
                if !new_pseudonym.is_empty() {
                    self.config.default_pseudonym = new_pseudonym.to_string();
                    println!("✅ Standard-Pseudonym geändert!");
                } else {
                    println!("❌ Pseudonym kann nicht leer sein!");
                }
            }
            "2" => {
                self.config.auto_save = !self.config.auto_save;
                println!("✅ Auto-Save: {}", if self.config.auto_save { "Aktiv" } else { "Inaktiv" });
            }
            "3" => {
                print!("Neue Max Posts Anzahl: ");
                io::stdout().flush().unwrap();
                let mut max_posts = String::new();
                io::stdin().read_line(&mut max_posts).unwrap();
                
                if let Ok(max) = max_posts.trim().parse::<usize>() {
                    self.config.max_posts = max;
                    println!("✅ Max Posts auf {} gesetzt!", max);
                } else {
                    println!("❌ Ungültige Zahl!");
                }
            }
            "4" => {
                println!("Verfügbare Themes: default, dark, light");
                print!("Neues Theme: ");
                io::stdout().flush().unwrap();
                let mut theme = String::new();
                io::stdin().read_line(&mut theme).unwrap();
                let theme = theme.trim();
                
                if !theme.is_empty() {
                    self.config.theme = theme.to_string();
                    println!("✅ Theme geändert!");
                } else {
                    println!("❌ Theme kann nicht leer sein!");
                }
            }
            "5" => {
                println!("Verfügbare Sprachen: de, en");
                print!("Neue Sprache: ");
                io::stdout().flush().unwrap();
                let mut language = String::new();
                io::stdin().read_line(&mut language).unwrap();
                let language = language.trim();
                
                if !language.is_empty() {
                    self.config.language = language.to_string();
                    println!("✅ Sprache geändert!");
                } else {
                    println!("❌ Sprache kann nicht leer sein!");
                }
            }
            "6" => {
                self.config.network_enabled = !self.config.network_enabled;
                println!("✅ Netzwerk: {}", if self.config.network_enabled { "Aktiv" } else { "Inaktiv" });
            }
            "7" => {
                print!("Neuer Netzwerk-Port: ");
                io::stdout().flush().unwrap();
                let mut port = String::new();
                io::stdin().read_line(&mut port).unwrap();
                
                if let Ok(new_port) = port.trim().parse::<u16>() {
                    self.config.network_port = new_port;
                    println!("✅ Netzwerk-Port auf {} gesetzt!", new_port);
                } else {
                    println!("❌ Ungültiger Port!");
                }
            }
            "8" => {
                println!("Zurück zum Hauptmenü");
            }
            _ => {
                println!("❌ Ungültige Option!");
            }
        }
    }
}

fn main() {
    println!("🥨 Willkommen bei Brezn!");
    println!("Eine dezentrale Feed-App (Demo-Version)");
    println!("{}", "=".repeat(50));

    // Daten laden oder neu erstellen
    let mut data = match BreznData::load() {
        Ok(data) => {
            println!("📂 Daten erfolgreich geladen!");
            data
        }
        Err(e) => {
            println!("⚠️  Fehler beim Laden der Daten: {}. Erstelle neue Daten.", e);
            BreznData::new()
        }
    };

    let mut current_pseudonym = data.config.default_pseudonym.clone();
    
    loop {
        println!("\n📋 Menü:");
        println!("1. Feed anzeigen");
        println!("2. Neuen Post erstellen");
        println!("3. Neues Pseudonym generieren");
        println!("4. Benutzer stummschalten");
        println!("5. Netzwerk-Status");
        println!("6. Netzwerk-Server starten");
        println!("7. Peers suchen");
        println!("8. Konfiguration anzeigen");
        println!("9. Konfiguration bearbeiten");
        println!("10. Beenden");
        println!("Aktuelles Pseudonym: {}", current_pseudonym);
        print!("Wähle eine Option (1-10): ");
        io::stdout().flush().unwrap();
        
        let mut input = String::new();
        io::stdin().read_line(&mut input).unwrap();
        let choice = input.trim();

        match choice {
            "1" => {
                data.display_feed();
            }
            "2" => {
                print!("Gib deinen Post ein: ");
                io::stdout().flush().unwrap();
                let mut content = String::new();
                io::stdin().read_line(&mut content).unwrap();
                let content = content.trim().to_string();
                
                if !content.is_empty() {
                    data.add_post(content, current_pseudonym.clone());
                    println!("✅ Post erfolgreich erstellt!");
                    
                    // Automatisch speichern nach neuem Post (wenn aktiviert)
                    if data.config.auto_save {
                        if let Err(e) = data.save() {
                            println!("⚠️  Fehler beim Speichern: {}", e);
                        }
                    }
                } else {
                    println!("❌ Post kann nicht leer sein!");
                }
            }
            "3" => {
                let random_num = (std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos() % 9999) as u32;
                current_pseudonym = format!("AnonymBrezn{}", random_num);
                println!("🎲 Neues Pseudonym: {}", current_pseudonym);
            }
            "4" => {
                print!("Pseudonym zum Stummschalten: ");
                io::stdout().flush().unwrap();
                let mut pseudonym_to_mute = String::new();
                io::stdin().read_line(&mut pseudonym_to_mute).unwrap();
                let pseudonym_to_mute = pseudonym_to_mute.trim();
                
                if !pseudonym_to_mute.is_empty() {
                    data.muted_users.insert(pseudonym_to_mute.to_string());
                    println!("🔇 {} wurde stummgeschaltet.", pseudonym_to_mute);
                    
                    // Automatisch speichern nach Mute (wenn aktiviert)
                    if data.config.auto_save {
                        if let Err(e) = data.save() {
                            println!("⚠️  Fehler beim Speichern: {}", e);
                        }
                    }
                } else {
                    println!("❌ Pseudonym kann nicht leer sein!");
                }
            }
            "5" => {
                data.show_network_status();
            }
            "6" => {
                data.start_network_server();
                println!("🌐 Netzwerk-Server wird gestartet...");
                println!("💡 Tipp: Aktiviere das Netzwerk in der Konfiguration für volle Funktionalität");
            }
            "7" => {
                data.discover_peers();
                println!("🔍 Peer-Discovery gestartet...");
                println!("💡 Tipp: Starte mehrere Brezn-Instanzen auf verschiedenen Ports");
            }
            "8" => {
                data.show_config();
            }
            "9" => {
                data.edit_config();
                // Nach Konfigurationsänderungen speichern
                if let Err(e) = data.save() {
                    println!("⚠️  Fehler beim Speichern: {}", e);
                } else {
                    println!("✅ Konfiguration gespeichert!");
                }
            }
            "10" => {
                println!("💾 Speichere Daten...");
                if let Err(e) = data.save() {
                    println!("⚠️  Fehler beim Speichern: {}", e);
                } else {
                    println!("✅ Daten erfolgreich gespeichert!");
                }
                println!("👋 Auf Wiedersehen!");
                break;
            }
            _ => {
                println!("❌ Ungültige Option!");
            }
        }
    }
}
