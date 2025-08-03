use std::collections::HashSet;
use rusqlite::{Connection, Result as SqliteResult};
use serde::{Serialize, Deserialize};
use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::{App, AppHandle, Manager, Window};

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

// Tauri Commands
#[tauri::command]
async fn get_posts(app_handle: AppHandle) -> Result<Vec<Post>, String> {
    let data = app_handle.state::<Arc<Mutex<BreznData>>>();
    let data = data.lock().await;
    data.get_posts().map_err(|e| e.to_string())
}

#[tauri::command]
async fn create_post(content: String, pseudonym: String, app_handle: AppHandle) -> Result<(), String> {
    let data = app_handle.state::<Arc<Mutex<BreznData>>>();
    let mut data = data.lock().await;
    data.add_post(content, pseudonym).map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_config(app_handle: AppHandle) -> Result<Config, String> {
    let data = app_handle.state::<Arc<Mutex<BreznData>>>();
    let data = data.lock().await;
    Ok(data.config.clone())
}

#[tauri::command]
async fn update_config(config: Config, app_handle: AppHandle) -> Result<(), String> {
    let data = app_handle.state::<Arc<Mutex<BreznData>>>();
    let mut data = data.lock().await;
    data.config = config;
    data.update_config().map_err(|e| e.to_string())
}

#[tauri::command]
async fn toggle_tor(app_handle: AppHandle) -> Result<bool, String> {
    let data = app_handle.state::<Arc<Mutex<BreznData>>>();
    let mut data = data.lock().await;
    
    if data.is_tor_enabled() {
        data.disable_tor();
        Ok(false)
    } else {
        data.enable_tor();
        Ok(true)
    }
}

#[tauri::command]
async fn get_network_status(app_handle: AppHandle) -> Result<serde_json::Value, String> {
    let data = app_handle.state::<Arc<Mutex<BreznData>>>();
    let data = data.lock().await;
    
    let posts = data.get_posts().map_err(|e| e.to_string())?;
    let muted_users = data.get_muted_users().map_err(|e| e.to_string())?;
    
    Ok(serde_json::json!({
        "posts_count": posts.len(),
        "muted_users_count": muted_users.len(),
        "node_id": data.node_id,
        "network_enabled": data.config.network_enabled,
        "network_port": data.config.network_port,
        "tor_enabled": data.is_tor_enabled(),
        "tor_port": data.config.tor_socks_port
    }))
}

fn main() {
    // Initialize BreznData
    let brezn_data = match BreznData::new() {
        Ok(data) => data,
        Err(e) => {
            eprintln!("Fehler beim Initialisieren der Datenbank: {}", e);
            return;
        }
    };
    
    let brezn_data = Arc::new(Mutex::new(brezn_data));
    
    tauri::Builder::default()
        .manage(brezn_data)
        .invoke_handler(tauri::generate_handler![
            get_posts,
            create_post,
            get_config,
            update_config,
            toggle_tor,
            get_network_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
