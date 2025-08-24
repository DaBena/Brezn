use rusqlite::{Connection, Result as SqliteResult};
use serde_json;
use crate::types::{Post, Config};
use ring::digest::{digest, SHA256};
use std::collections::HashMap;

#[derive(Debug)]
pub struct Database {
    conn: Connection,
}

impl Database {
    #[cfg(not(test))]
    pub fn new() -> SqliteResult<Self> {
        let conn = Connection::open("brezn.db")?;
        Self::init_conn(conn)
    }

    #[cfg(test)]
    pub fn new() -> SqliteResult<Self> {
        let conn = Connection::open_in_memory()?;
        Self::init_conn(conn)
    }

    fn init_conn(conn: Connection) -> SqliteResult<Self> {
        // Create tables
        conn.execute("
            CREATE TABLE IF NOT EXISTS posts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                content TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                pseudonym TEXT NOT NULL,
                node_id TEXT,
                hash TEXT
            )
        ", [])?;
        
        // Best-effort: ensure hash column exists (older DBs)
        let _ = conn.execute("ALTER TABLE posts ADD COLUMN hash TEXT", []);

        // Unique index on hash for conflict avoidance (multiple NULL allowed)
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_hash ON posts(hash)",
            [],
        )?;

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
        
        // Neue Tabelle für Synchronisations-Timestamps
        conn.execute("
            CREATE TABLE IF NOT EXISTS sync_timestamps (
                node_id TEXT PRIMARY KEY,
                last_sync_timestamp INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )
        ", [])?;
        
        // Neue Tabelle für Post-Konflikte
        conn.execute("
            CREATE TABLE IF NOT EXISTS post_conflicts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                post_id TEXT NOT NULL,
                conflicting_posts TEXT NOT NULL,
                resolution_strategy TEXT NOT NULL,
                resolved_at INTEGER,
                created_at INTEGER NOT NULL
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
    
    fn compute_post_hash(&self, post: &Post) -> String {
        let node_id_part = post.node_id.clone().unwrap_or_default();
        let data = format!("{}|{}|{}|{}", post.content, post.timestamp, post.pseudonym, node_id_part);
        let h = digest(&SHA256, data.as_bytes());
        hex::encode(h)
    }
    
    pub fn add_post(&self, post: &Post) -> SqliteResult<i64> {
        let node_id_opt: Option<&str> = post.node_id.as_deref();
        let hash = self.compute_post_hash(post);
        
        // Check if post already exists using multiple criteria
        if self.is_duplicate_post(post)? {
            return Err(rusqlite::Error::InvalidParameterName("Post already exists".to_string()));
        }
        
        self.conn.execute(
            "INSERT INTO posts (content, timestamp, pseudonym, node_id, hash) VALUES (?, ?, ?, ?, ?)",
            (&post.content, &(post.timestamp as i64), &post.pseudonym, &node_id_opt, &hash)
        )?;
        
        Ok(self.conn.last_insert_rowid())
    }

    /// Enhanced duplicate detection using multiple criteria
    pub fn is_duplicate_post(&self, post: &Post) -> SqliteResult<bool> {
        // Check by hash first (most reliable)
        let hash = self.compute_post_hash(post);
        let mut stmt = self.conn.prepare("SELECT EXISTS(SELECT 1 FROM posts WHERE hash = ?)")?;
        let exists: i64 = stmt.query_row([&hash], |row| row.get(0))?;
        
        if exists > 0 {
            return Ok(true);
        }
        
        // Check by content + pseudonym (within time window)
        let time_window: i64 = 300; // 5 minutes
        let mut stmt = self.conn.prepare("SELECT EXISTS(SELECT 1 FROM posts WHERE content = ? AND pseudonym = ? AND ABS(timestamp - ?) < ?)")?;
        let exists: i64 = stmt.query_row([&post.content, &post.pseudonym, &(post.timestamp as i64), &time_window], |row| row.get(0))?;
        
        Ok(exists > 0)
    }

    /// Gets posts with conflict resolution
    pub fn get_posts_with_conflicts(&self, limit: usize) -> SqliteResult<Vec<Post>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, content, timestamp, pseudonym, node_id FROM posts ORDER BY timestamp DESC LIMIT ?"
        )?;
        
        let post_iter = stmt.query_map([limit as i64], |row| {
            Ok(Post {
                id: Some(row.get(0)?),
                content: row.get(1)?,
                timestamp: row.get::<_, i64>(2)? as u64,
                pseudonym: row.get(3)?,
                node_id: row.get(4)?,
                post_id: None,
                parent_id: None,
                signature: None,
                version: 1,
            })
        })?;
        
        let mut posts: Vec<Post> = post_iter.collect::<Result<Vec<_>, _>>()?;
        
        // Remove duplicate posts (keep the most recent)
        posts = self.deduplicate_posts(posts);
        
        Ok(posts)
    }

    /// Removes duplicate posts, keeping the most recent
    fn deduplicate_posts(&self, mut posts: Vec<Post>) -> Vec<Post> {
        let mut seen: HashMap<String, Post> = std::collections::HashMap::new();
        let mut unique_posts = Vec::new();
        
        for post in posts {
            let key = format!("{}|{}", post.content, post.pseudonym);
            
            if let Some(existing_post) = seen.get(&key) {
                // Keep the more recent post
                if post.timestamp > existing_post.timestamp {
                    // Remove the old post from unique_posts and add the new one
                    if let Some(pos) = unique_posts.iter().position(|p: &Post| p.id == existing_post.id) {
                        unique_posts.remove(pos);
                    }
                    unique_posts.push(post.clone());
                    seen.insert(key, post);
                }
            } else {
                unique_posts.push(post.clone());
                seen.insert(key, post);
            }
        }
        
        // Sort by timestamp (most recent first)
        unique_posts.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
        unique_posts
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
    
    /// Get posts since a specific timestamp for synchronization
    pub fn get_posts_since_timestamp(&self, since_timestamp: u64) -> SqliteResult<Vec<Post>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, content, timestamp, pseudonym, node_id FROM posts WHERE timestamp > ? ORDER BY timestamp ASC"
        )?;
        
        let post_iter = stmt.query_map([since_timestamp as i64], |row| {
            Ok(Post {
                id: Some(row.get(0)?),
                content: row.get(1)?,
                timestamp: row.get::<_, i64>(2)? as u64,
                pseudonym: row.get(3)?,
                node_id: row.get(4)?,
                post_id: None,
                parent_id: None,
                signature: None,
                version: 1,
            })
        })?;
        
        let mut posts = Vec::new();
        for post in post_iter {
            posts.push(post?);
        }
        
        Ok(posts)
    }
    
    /// Get posts by content for conflict detection
    pub fn get_posts_by_content(&self, content: &str) -> SqliteResult<Vec<Post>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, content, timestamp, pseudonym, node_id FROM posts WHERE content = ? ORDER BY timestamp ASC"
        )?;
        
        let post_iter = stmt.query_map([content], |row| {
            Ok(Post {
                id: Some(row.get(0)?),
                content: row.get(1)?,
                timestamp: row.get::<_, i64>(2)? as u64,
                pseudonym: row.get(3)?,
                node_id: row.get(4)?,
                post_id: None,
                parent_id: None,
                signature: None,
                version: 1,
            })
        })?;
        
        let mut posts = Vec::new();
        for post in post_iter {
            posts.push(post?);
        }
        
        Ok(posts)
    }
    
    /// Get the last synchronization timestamp for a specific node
    pub fn get_last_sync_timestamp(&self, node_id: &str) -> SqliteResult<u64> {
        let mut stmt = self.conn.prepare(
            "SELECT last_sync_timestamp FROM sync_timestamps WHERE node_id = ?"
        )?;
        
        match stmt.query_row([node_id], |row| row.get::<_, i64>(0)) {
            Ok(timestamp) => Ok(timestamp as u64),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(0), // Default to 0 if no sync record
            Err(e) => Err(e),
        }
    }
    
    /// Update the last synchronization timestamp for a specific node
    pub fn update_last_sync_timestamp(&self, node_id: &str, timestamp: u64) -> SqliteResult<()> {
        let current_time = chrono::Utc::now().timestamp();
        
        self.conn.execute(
            "INSERT OR REPLACE INTO sync_timestamps (node_id, last_sync_timestamp, updated_at) VALUES (?, ?, ?)",
            (node_id, timestamp as i64, current_time)
        )?;
        
        Ok(())
    }
    
    /// Store a post conflict for manual resolution
    pub fn store_post_conflict(&self, post_id: &str, conflicting_posts: &str, resolution_strategy: &str) -> SqliteResult<i64> {
        let current_time = chrono::Utc::now().timestamp();
        
        self.conn.execute(
            "INSERT INTO post_conflicts (post_id, conflicting_posts, resolution_strategy, created_at) VALUES (?, ?, ?, ?)",
            (post_id, conflicting_posts, resolution_strategy, current_time)
        )?;
        
        Ok(self.conn.last_insert_rowid())
    }
    
    /// Get all unresolved post conflicts
    pub fn get_unresolved_conflicts(&self) -> SqliteResult<Vec<(i64, String, String, String)>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, post_id, conflicting_posts, resolution_strategy FROM post_conflicts WHERE resolved_at IS NULL ORDER BY created_at ASC"
        )?;
        
        let conflict_iter = stmt.query_map([], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
            ))
        })?;
        
        let mut conflicts = Vec::new();
        for conflict in conflict_iter {
            conflicts.push(conflict?);
        }
        
        Ok(conflicts)
    }
    
    /// Mark a conflict as resolved
    pub fn resolve_conflict(&self, conflict_id: i64) -> SqliteResult<()> {
        let current_time = chrono::Utc::now().timestamp();
        
        self.conn.execute(
            "UPDATE post_conflicts SET resolved_at = ? WHERE id = ?",
            (current_time, conflict_id)
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
            post_id: None,
            parent_id: None,
            signature: None,
            version: 1,
        };
        
        let id = db.add_post(&post).unwrap();
        assert!(id > 0);
        
        let posts = db.get_posts_with_conflicts(10).unwrap();
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