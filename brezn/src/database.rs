use crate::error::Result;
use crate::types::Post;
use rusqlite::{Connection, params};
use std::sync::Mutex;

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn new() -> Result<Self> {
        let conn = Connection::open_in_memory()?;
        
        conn.execute(
            "CREATE TABLE IF NOT EXISTS posts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                content TEXT NOT NULL,
                pseudonym TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                node_id TEXT
            )",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS config (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )",
            [],
        )?;

        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub fn create_post(&self, post: &Post) -> Result<i64> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO posts (content, pseudonym, timestamp, node_id) VALUES (?1, ?2, ?3, ?4)",
            params![post.content, post.pseudonym, post.timestamp as i64, post.node_id],
        )?;
        Ok(conn.last_insert_rowid())
    }

    pub fn get_all_posts(&self) -> Result<Vec<Post>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, content, pseudonym, timestamp, node_id FROM posts ORDER BY timestamp DESC"
        )?;
        
        let post_iter = stmt.query_map([], |row| {
            Ok(Post {
                id: Some(row.get(0)?),
                content: row.get(1)?,
                pseudonym: row.get(2)?,
                timestamp: row.get::<_, i64>(3)? as u64,
                node_id: row.get(4)?,
            })
        })?;

        let mut posts = Vec::new();
        for post in post_iter {
            posts.push(post?);
        }
        Ok(posts)
    }

    pub fn get_posts_since(&self, timestamp: u64) -> Result<Vec<Post>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, content, pseudonym, timestamp, node_id FROM posts WHERE timestamp > ?1 ORDER BY timestamp DESC"
        )?;
        
        let post_iter = stmt.query_map(params![timestamp as i64], |row| {
            Ok(Post {
                id: Some(row.get(0)?),
                content: row.get(1)?,
                pseudonym: row.get(2)?,
                timestamp: row.get::<_, i64>(3)? as u64,
                node_id: row.get(4)?,
            })
        })?;

        let mut posts = Vec::new();
        for post in post_iter {
            posts.push(post?);
        }
        Ok(posts)
    }

    pub fn delete_post(&self, id: i64) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM posts WHERE id = ?1", params![id])?;
        Ok(())
    }
}