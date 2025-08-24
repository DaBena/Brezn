use rusqlite::{Connection, Result};
use chrono::{DateTime, Utc};
use std::sync::Mutex;
use crate::types::Post;

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn new(path: &str) -> Result<Self> {
        let conn = Connection::open(path)?;
        
        // Create tables
        conn.execute(
            "CREATE TABLE IF NOT EXISTS posts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                content TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                pseudonym TEXT NOT NULL,
                node_id TEXT NOT NULL
            )",
            [],
        )?;
        
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }
    
    pub fn add_post(&self, post: &Post) -> Result<Post> {
        let conn = self.conn.lock().unwrap();
        
        conn.execute(
            "INSERT INTO posts (content, timestamp, pseudonym, node_id) 
             VALUES (?1, ?2, ?3, ?4)",
            (
                &post.content,
                &post.timestamp.to_rfc3339(),
                &post.pseudonym,
                &post.node_id,
            ),
        )?;
        
        let id = conn.last_insert_rowid();
        let mut new_post = post.clone();
        new_post.id = Some(id);
        
        Ok(new_post)
    }
    
    pub fn get_posts(&self, limit: Option<usize>) -> Result<Vec<Post>> {
        let conn = self.conn.lock().unwrap();
        let limit = limit.unwrap_or(100);
        
        let mut stmt = conn.prepare(
            "SELECT id, content, timestamp, pseudonym, node_id 
             FROM posts 
             ORDER BY timestamp DESC 
             LIMIT ?1"
        )?;
        
        let posts = stmt.query_map([limit], |row| {
            Ok(Post {
                id: Some(row.get(0)?),
                content: row.get(1)?,
                timestamp: row.get::<_, String>(2)?
                    .parse::<DateTime<Utc>>()
                    .unwrap_or_else(|_| Utc::now()),
                pseudonym: row.get(3)?,
                node_id: row.get(4)?,
            })
        })?
        .collect::<Result<Vec<_>>>()?;
        
        Ok(posts)
    }
    
    pub fn get_posts_after(&self, timestamp: DateTime<Utc>) -> Result<Vec<Post>> {
        let conn = self.conn.lock().unwrap();
        
        let mut stmt = conn.prepare(
            "SELECT id, content, timestamp, pseudonym, node_id 
             FROM posts 
             WHERE timestamp > ?1
             ORDER BY timestamp DESC"
        )?;
        
        let posts = stmt.query_map([timestamp.to_rfc3339()], |row| {
            Ok(Post {
                id: Some(row.get(0)?),
                content: row.get(1)?,
                timestamp: row.get::<_, String>(2)?
                    .parse::<DateTime<Utc>>()
                    .unwrap_or_else(|_| Utc::now()),
                pseudonym: row.get(3)?,
                node_id: row.get(4)?,
            })
        })?
        .collect::<Result<Vec<_>>>()?;
        
        Ok(posts)
    }
}