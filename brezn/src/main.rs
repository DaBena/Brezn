use std::collections::HashSet;
use rusqlite::{Connection, Result as SqliteResult};
use serde::{Serialize, Deserialize};
use std::sync::Arc;
use tokio::sync::Mutex;

#[derive(Debug, Serialize, Deserialize)]
struct Post {
    id: Option<i64>,
    content: String,
    timestamp: u64,
    pseudonym: String,
    node_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct Config {
    auto_save: bool,
    max_posts: usize,
    default_pseudonym: String,
    network_enabled: bool,
    network_port: u16,
    tor_enabled: bool,
    tor_socks_port: u16,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            auto_save: true,
            max_posts: 100,
            default_pseudonym: "AnonymBrezn42".to_string(),
            network_enabled: false,
            network_port: 8080,
            tor_enabled: false,
            tor_socks_port: 9050,
        }
    }
}

#[derive(Debug)]
struct TorProxy {
    socks_port: u16,
    enabled: bool,
}

impl TorProxy {
    fn new(port: u16) -> Self {
        Self {
            socks_port: port,
            enabled: false,
        }
    }
    
    fn enable(&mut self) {
        self.enabled = true;
        println!("🔒 Tor SOCKS5 Proxy aktiviert auf Port {}", self.socks_port);
    }
    
    fn disable(&mut self) {
        self.enabled = false;
        println!("🔓 Tor SOCKS5 Proxy deaktiviert");
    }
    
    fn is_enabled(&self) -> bool {
        self.enabled
    }
    
    fn get_socks_url(&self) -> String {
        format!("socks5://127.0.0.1:{}", self.socks_port)
    }
}

#[derive(Debug)]
struct Database {
    conn: Connection,
}

impl Database {
    fn new() -> SqliteResult<Self> {
        let conn = Connection::open("brezn.db")?;
        
        // Create tables
        conn.execute("
            CREATE TABLE IF NOT EXISTS posts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                content TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                pseudonym TEXT NOT NULL,
                node_id TEXT
            )
        ", [])?;
        
        conn.execute("
            CREATE TABLE IF NOT EXISTS config (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        ", [])?;
        
        conn.execute("
            CREATE TABLE IF NOT EXISTS muted_users (
                pseudonym TEXT PRIMARY KEY
            )
        ", [])?;
        
        conn.execute("
            CREATE TABLE IF NOT EXISTS peers (
                id TEXT PRIMARY KEY,
                address TEXT NOT NULL,
                last_seen INTEGER NOT NULL,
                posts_count INTEGER NOT NULL
            )
        ", [])?;
        
        Ok(Self { conn })
    }
    
    fn init_default_config(&self) -> SqliteResult<()> {
        let config = Config::default();
        let config_json = serde_json::to_string(&config).unwrap();
        
        self.conn.execute(
            "INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)",
            ["app_config", &config_json]
        )?;
        
        Ok(())
    }
    
    fn add_post(&self, post: &Post) -> SqliteResult<i64> {
        self.conn.execute(
            "INSERT INTO posts (content, timestamp, pseudonym, node_id) VALUES (?, ?, ?, ?)",
            [&post.content, &post.timestamp.to_string(), &post.pseudonym, &post.node_id.as_deref().unwrap_or("")]
        )?;
        Ok(self.conn.last_insert_rowid())
    }
    
    fn get_posts(&self, limit: usize) -> SqliteResult<Vec<Post>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, content, timestamp, pseudonym, node_id FROM posts ORDER BY timestamp DESC LIMIT ?"
        )?;
        
        let post_iter = stmt.query_map([limit as i64], |row| {
            Ok(Post {
                id: Some(row.get(0)?),
                content: row.get(1)?,
                timestamp: row.get(2)?,
                pseudonym: row.get(3)?,
                node_id: Some(row.get(4)?),
            })
        })?;
        
        let mut posts = Vec::new();
        for post in post_iter {
            posts.push(post?);
        }
        Ok(posts)
    }
    
    fn get_config(&self) -> SqliteResult<Config> {
        let mut stmt = self.conn.prepare("SELECT value FROM config WHERE key = ?")?;
        let config_json: String = stmt.query_row(["app_config"], |row| row.get(0))?;
        Ok(serde_json::from_str(&config_json).unwrap_or_default())
    }
    
    fn update_config(&self, config: &Config) -> SqliteResult<()> {
        let config_json = serde_json::to_string(config).unwrap();
        self.conn.execute(
            "UPDATE config SET value = ? WHERE key = ?",
            [&config_json, "app_config"]
        )?;
        Ok(())
    }
    
    fn add_muted_user(&self, pseudonym: &str) -> SqliteResult<()> {
        self.conn.execute(
            "INSERT OR IGNORE INTO muted_users (pseudonym) VALUES (?)",
            [pseudonym]
        )?;
        Ok(())
    }
    
    fn get_muted_users(&self) -> SqliteResult<Vec<String>> {
        let mut stmt = self.conn.prepare("SELECT pseudonym FROM muted_users")?;
        let user_iter = stmt.query_map([], |row| row.get(0))?;
        
        let mut users = Vec::new();
        for user in user_iter {
            users.push(user?);
        }
        Ok(users)
    }
}

#[derive(Debug)]
struct BreznData {
    db: Database,
    config: Config,
    node_id: String,
    tor_proxy: TorProxy,
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

    fn new() -> Result<Self, Box<dyn std::error::Error>> {
        let db = Database::new()?;
        db.init_default_config()?;
        let config = db.get_config()?;
        let node_id = Self::generate_node_id();
        let tor_proxy = TorProxy::new(config.tor_socks_port);
        
        // Add sample posts if database is empty
        let posts = db.get_posts(10)?;
        if posts.is_empty() {
            let sample_posts = vec![
                Post {
                    id: None,
                    content: "Willkommen bei Brezn! 🥨".to_string(),
                    timestamp: std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap()
                        .as_secs(),
                    pseudonym: "AnonymBrezn42".to_string(),
                    node_id: Some(node_id.clone()),
                },
                Post {
                    id: None,
                    content: "Das ist ein anonymer Post!".to_string(),
                    timestamp: std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap()
                        .as_secs() - 300,
                    pseudonym: "GeheimUser99".to_string(),
                    node_id: Some(node_id.clone()),
                },
            ];
            
            for post in sample_posts {
                db.add_post(&post)?;
            }
        }
        
        Ok(Self { db, config, node_id, tor_proxy })
    }

    fn add_post(&mut self, content: String, pseudonym: String) -> Result<(), Box<dyn std::error::Error>> {
        let post = Post {
            id: None,
            content,
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs(),
            pseudonym,
            node_id: Some(self.node_id.clone()),
        };
        
        self.db.add_post(&post)?;
        
        // Check if we need to limit posts
        let posts = self.db.get_posts(self.config.max_posts + 1)?;
        if posts.len() > self.config.max_posts {
            // TODO: Implement post cleanup
        }
        
        Ok(())
    }
    
    fn get_posts(&self) -> Result<Vec<Post>, Box<dyn std::error::Error>> {
        Ok(self.db.get_posts(self.config.max_posts)?)
    }
    
    fn get_muted_users(&self) -> Result<Vec<String>, Box<dyn std::error::Error>> {
        Ok(self.db.get_muted_users()?)
    }
    
    fn add_muted_user(&self, pseudonym: &str) -> Result<(), Box<dyn std::error::Error>> {
        Ok(self.db.add_muted_user(pseudonym)?)
    }
    
    fn update_config(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        Ok(self.db.update_config(&self.config)?)
    }
    
    fn enable_tor(&mut self) {
        self.tor_proxy.enable();
        self.config.tor_enabled = true;
        println!("🔒 Tor-Netzwerk aktiviert");
    }
    
    fn disable_tor(&mut self) {
        self.tor_proxy.disable();
        self.config.tor_enabled = false;
        println!("🔓 Tor-Netzwerk deaktiviert");
    }
    
    fn is_tor_enabled(&self) -> bool {
        self.tor_proxy.is_enabled()
    }
}

fn format_time_diff(timestamp: u64) -> String {
    let current_time = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let time_diff = current_time - timestamp;
    if time_diff < 60 {
        "gerade eben".to_string()
    } else if time_diff < 3600 {
        format!("vor {}min", time_diff / 60)
    } else if time_diff < 86400 {
        format!("vor {}h", time_diff / 3600)
    } else {
        format!("vor {}d", time_diff / 86400)
    }
}

fn show_feed(data: &BreznData) {
    println!("{}", "=".repeat(50));
    println!("📰 FEED");
    println!("{}", "=".repeat(50));
    
    match data.get_posts() {
        Ok(posts) => {
            let muted_users: HashSet<String> = data.get_muted_users().unwrap_or_default().into_iter().collect();
            
            for (i, post) in posts.iter().enumerate() {
                if !muted_users.contains(&post.pseudonym) {
                    let time_str = format_time_diff(post.timestamp);
                    println!("👤 {} • {}", post.pseudonym, time_str);
                    println!("📝 {}", post.content);
                    println!("🔗 ID: {}", i + 1);
                    println!("{}", "-".repeat(30));
                }
            }
        }
        Err(e) => eprintln!("Fehler beim Laden der Posts: {}", e),
    }
}

fn show_new_post(data: &mut BreznData, current_pseudonym: &mut String) {
    println!("{}", "=".repeat(50));
    println!("✏️  NEUER POST");
    println!("{}", "=".repeat(50));
    
    println!("Aktuelles Pseudonym: {}", current_pseudonym);
    println!("Drücke Enter für neues Pseudonym oder gib dein Pseudonym ein:");
    
    let mut input = String::new();
    std::io::stdin().read_line(&mut input).unwrap();
    let input = input.trim();
    
    if !input.is_empty() {
        *current_pseudonym = input.to_string();
    } else {
        let random_num = (std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos() % 9999) as u32;
        *current_pseudonym = format!("AnonymBrezn{}", random_num);
    }
    
    println!("Gib deinen Post ein:");
    let mut content = String::new();
    std::io::stdin().read_line(&mut content).unwrap();
    let content = content.trim().to_string();
    
    if !content.is_empty() {
        if let Err(e) = data.add_post(content, current_pseudonym.clone()) {
            eprintln!("Fehler beim Erstellen des Posts: {}", e);
        } else {
            println!("✅ Post erstellt!");
        }
    }
}

fn show_network(data: &BreznData) {
    println!("{}", "=".repeat(50));
    println!("🌐 NETZWERK");
    println!("{}", "=".repeat(50));
    
    match data.get_posts() {
        Ok(posts) => {
            println!("📊 {} Posts lokal", posts.len());
        }
        Err(_) => {
            println!("📊 Posts konnten nicht geladen werden");
        }
    }
    
    match data.get_muted_users() {
        Ok(muted_users) => {
            println!("🔇 {} stummgeschaltete Benutzer", muted_users.len());
        }
        Err(_) => {
            println!("🔇 Stummgeschaltete Benutzer konnten nicht geladen werden");
        }
    }
    
    println!("🆔 Node-ID: {}", data.node_id);
    println!("🌐 Netzwerk: {}", 
        if data.config.network_enabled { "Aktiv" } else { "Inaktiv" });
    println!("🔌 Port: {}", data.config.network_port);
    println!("🔒 Tor: {}", 
        if data.is_tor_enabled() { "Aktiv" } else { "Inaktiv" });
    if data.is_tor_enabled() {
        println!("🔌 Tor SOCKS5: {}", data.tor_proxy.get_socks_url());
    }
}

fn show_config(data: &mut BreznData) {
    println!("{}", "=".repeat(50));
    println!("⚙️  KONFIGURATION");
    println!("{}", "=".repeat(50));
    
    println!("1. Standard-Pseudonym ändern (aktuell: {})", data.config.default_pseudonym);
    println!("2. Auto-Save {} (aktuell: {})", 
        if data.config.auto_save { "deaktivieren" } else { "aktivieren" },
        if data.config.auto_save { "Aktiv" } else { "Inaktiv" });
    println!("3. Max Posts ändern (aktuell: {})", data.config.max_posts);
    println!("4. Netzwerk-Einstellungen");
    println!("5. Tor-Einstellungen");
    println!("6. Speichern");
    println!("0. Zurück");
    
    let mut choice = String::new();
    std::io::stdin().read_line(&mut choice).unwrap();
    
    match choice.trim() {
        "1" => {
            println!("Neues Standard-Pseudonym:");
            let mut input = String::new();
            std::io::stdin().read_line(&mut input).unwrap();
            data.config.default_pseudonym = input.trim().to_string();
        }
        "2" => {
            data.config.auto_save = !data.config.auto_save;
            println!("Auto-Save: {}", if data.config.auto_save { "Aktiv" } else { "Inaktiv" });
        }
        "3" => {
            println!("Neue Max Posts Anzahl:");
            let mut input = String::new();
            std::io::stdin().read_line(&mut input).unwrap();
            if let Ok(num) = input.trim().parse::<usize>() {
                data.config.max_posts = num;
            }
        }
        "4" => {
            println!("Netzwerk aktiviert: {}", data.config.network_enabled);
            data.config.network_enabled = !data.config.network_enabled;
            println!("Netzwerk aktiviert: {}", data.config.network_enabled);
            println!("Netzwerk-Port: {}", data.config.network_port);
        }
        "5" => {
            println!("Tor aktiviert: {}", data.is_tor_enabled());
            if data.is_tor_enabled() {
                data.disable_tor();
            } else {
                data.enable_tor();
            }
            println!("Tor SOCKS5 Port: {}", data.config.tor_socks_port);
        }
        "6" => {
            if let Err(e) = data.update_config() {
                eprintln!("Fehler beim Speichern: {}", e);
            } else {
                println!("✅ Konfiguration gespeichert!");
            }
        }
        _ => {}
    }
}

fn main() {
    println!("🥨 Willkommen bei Brezn - Dezentrale Feed-App!");
    
    let mut data = match BreznData::new() {
        Ok(data) => data,
        Err(e) => {
            eprintln!("Fehler beim Initialisieren der Datenbank: {}", e);
            return;
        }
    };
    
    let mut current_pseudonym = data.config.default_pseudonym.clone();
    
    loop {
        println!("\n{}", "=".repeat(50));
        println!("🥨 BREZN - HAUPTMENÜ");
        println!("{}", "=".repeat(50));
        println!("1. 📰 Feed anzeigen");
        println!("2. ✏️  Neuer Post");
        println!("3. 🌐 Netzwerk");
        println!("4. ⚙️  Konfiguration");
        println!("0. 🚪 Beenden");
        println!("{}", "=".repeat(50));
        
        let mut choice = String::new();
        std::io::stdin().read_line(&mut choice).unwrap();
        
        match choice.trim() {
            "1" => show_feed(&data),
            "2" => show_new_post(&mut data, &mut current_pseudonym),
            "3" => show_network(&data),
            "4" => show_config(&mut data),
            "0" => {
                println!("👋 Auf Wiedersehen!");
                break;
            }
            _ => println!("❌ Ungültige Auswahl!"),
        }
    }
}
