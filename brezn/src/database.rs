use rusqlite::{Connection, Result as SqliteResult};
use serde_json;
use crate::types::{Post, Config};

#[derive(Debug)]
pub struct Database {
    conn: Connection,
}

impl Database {
    pub fn new() -> SqliteResult<Self> {
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
        
        let db = Self { conn };
        db.init_default_config()?;
        
        Ok(db)
    }
    
    fn init_default_config(&self) -> SqliteResult<()> {
        let config = Config::default();
        self.update_config(&config)
    }
    
    pub fn add_post(&self, post: &Post) -> SqliteResult<i64> {
        let node_id_str = post.node_id.as_deref().unwrap_or("").to_string();
        self.conn.execute(
            "INSERT INTO posts (content, timestamp, pseudonym, node_id) VALUES (?, ?, ?, ?)",
            [&post.content, &post.timestamp.to_string(), &post.pseudonym, &node_id_str]
        )?;
        
        Ok(self.conn.last_insert_rowid())
    }
    
    pub fn get_posts(&self, limit: usize) -> SqliteResult<Vec<Post>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, content, timestamp, pseudonym, node_id FROM posts ORDER BY timestamp DESC LIMIT ?"
        )?;
        
        let post_iter = stmt.query_map([limit.to_string()], |row| {
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
    
    pub fn get_config(&self) -> SqliteResult<Config> {
        let mut stmt = self.conn.prepare("SELECT value FROM config WHERE key = 'main_config'")?;
        
        let config_str: String = stmt.query_row([], |row| row.get(0))
            .unwrap_or_else(|_| serde_json::to_string(&Config::default()).unwrap());
        
        serde_json::from_str(&config_str)
            .map_err(|_| rusqlite::Error::InvalidParameterName("Invalid config JSON".to_string()))
    }
    
    pub fn update_config(&self, config: &Config) -> SqliteResult<()> {
        let config_json = serde_json::to_string(config)
            .map_err(|_| rusqlite::Error::InvalidParameterName("Failed to serialize config".to_string()))?;
        
        self.conn.execute(
            "INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)",
            ["main_config", &config_json]
        )?;
        
        Ok(())
    }
    
    pub fn add_muted_user(&self, pseudonym: &str) -> SqliteResult<()> {
        self.conn.execute(
            "INSERT OR IGNORE INTO muted_users (pseudonym) VALUES (?)",
            [pseudonym]
        )?;
        
        Ok(())
    }
    
    pub fn get_muted_users(&self) -> SqliteResult<Vec<String>> {
        let mut stmt = self.conn.prepare("SELECT pseudonym FROM muted_users")?;
        
        let user_iter = stmt.query_map([], |row| {
            Ok(row.get(0)?)
        })?;
        
        let mut users = Vec::new();
        for user in user_iter {
            users.push(user?);
        }
        
        Ok(users)
    }
    
    pub fn remove_muted_user(&self, pseudonym: &str) -> SqliteResult<()> {
        self.conn.execute(
            "DELETE FROM muted_users WHERE pseudonym = ?",
            [pseudonym]
        )?;
        
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::Post;
    
    #[test]
    fn test_database_creation() {
        let db = Database::new();
        assert!(db.is_ok());
    }
    
    #[test]
    fn test_add_and_get_post() {
        let db = Database::new().unwrap();
        
        let post = Post {
            id: None,
            content: "Test post".to_string(),
            timestamp: 1234567890,
            pseudonym: "TestUser".to_string(),
            node_id: Some("test-node".to_string()),
        };
        
        let id = db.add_post(&post).unwrap();
        assert!(id > 0);
        
        let posts = db.get_posts(10).unwrap();
        // Check that our post is in the list (there might be existing posts)
        let our_post = posts.iter().find(|p| p.content == "Test post" && p.pseudonym == "TestUser");
        assert!(our_post.is_some());
        
        let found_post = our_post.unwrap();
        assert_eq!(found_post.content, "Test post");
        assert_eq!(found_post.pseudonym, "TestUser");
    }
    
    #[test]
    fn test_config_defaults() {
        let db = Database::new().unwrap();
        let config = db.get_config().unwrap();
        
        assert_eq!(config.default_pseudonym, "AnonymBrezn42");
        assert_eq!(config.max_posts, 100);
        assert!(config.auto_save);
    }
    
    #[test]
    fn test_muted_users() {
        let db = Database::new().unwrap();
        
        db.add_muted_user("Spammer").unwrap();
        db.add_muted_user("Troll").unwrap();
        
        let muted = db.get_muted_users().unwrap();
        assert_eq!(muted.len(), 2);
        assert!(muted.contains(&"Spammer".to_string()));
        assert!(muted.contains(&"Troll".to_string()));
    }
}