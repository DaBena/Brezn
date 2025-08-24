use actix_web::{web, App, HttpServer, HttpResponse, middleware::Logger};
use serde::{Deserialize, Serialize};
use serde_json::json;
use rusqlite::{Connection, Result as SqlResult};
use std::sync::{Arc, Mutex};
use anyhow::Result;
use chrono::Utc;

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Post {
    id: Option<i64>,
    content: String,
    timestamp: u64,
    pseudonym: String,
    node_id: Option<String>,
}

#[derive(Clone)]
struct AppState {
    db: Arc<Mutex<Connection>>,
}

impl AppState {
    fn new() -> Result<Self> {
        let conn = Connection::open("brezn_mvp.db")?;
        
        // Create posts table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS posts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                content TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                pseudonym TEXT NOT NULL,
                node_id TEXT
            )",
            [],
        )?;
        
        Ok(Self {
            db: Arc::new(Mutex::new(conn)),
        })
    }
    
    fn get_posts(&self) -> SqlResult<Vec<Post>> {
        let conn = self.db.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, content, timestamp, pseudonym, node_id 
             FROM posts 
             ORDER BY timestamp DESC 
             LIMIT 100"
        )?;
        
        let posts = stmt.query_map([], |row| {
            Ok(Post {
                id: Some(row.get(0)?),
                content: row.get(1)?,
                timestamp: row.get(2)?,
                pseudonym: row.get(3)?,
                node_id: row.get(4)?,
            })
        })?
        .collect::<SqlResult<Vec<_>>>()?;
        
        Ok(posts)
    }
    
    fn create_post(&self, mut post: Post) -> SqlResult<Post> {
        post.timestamp = Utc::now().timestamp() as u64;
        if post.pseudonym.is_empty() {
            post.pseudonym = "AnonymBrezn".to_string();
        }
        post.node_id = Some("local".to_string());
        
        let conn = self.db.lock().unwrap();
        conn.execute(
            "INSERT INTO posts (content, timestamp, pseudonym, node_id) VALUES (?1, ?2, ?3, ?4)",
            (&post.content, &post.timestamp, &post.pseudonym, &post.node_id),
        )?;
        
        post.id = Some(conn.last_insert_rowid());
        Ok(post)
    }
}

async fn index_handler() -> HttpResponse {
    HttpResponse::Ok()
        .content_type("text/html")
        .body(r#"<!DOCTYPE html>
<html>
<head>
    <title>Brezn MVP</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        .post { border: 1px solid #ddd; padding: 15px; margin: 10px 0; border-radius: 5px; }
        .post-header { font-weight: bold; margin-bottom: 5px; }
        .post-time { color: #666; font-size: 0.9em; }
        #postForm { margin-bottom: 30px; }
        input, textarea { width: 100%; padding: 10px; margin: 5px 0; box-sizing: border-box; }
        button { background: #007bff; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; }
        button:hover { background: #0056b3; }
    </style>
</head>
<body>
    <h1>🥨 Brezn MVP</h1>
    
    <div id="postForm">
        <h2>Neuer Post</h2>
        <input type="text" id="pseudonym" placeholder="Pseudonym (optional)">
        <textarea id="content" placeholder="Was möchtest du teilen?" rows="3"></textarea>
        <button onclick="createPost()">Posten</button>
    </div>
    
    <div id="posts">
        <h2>Feed</h2>
        <div id="postsList"></div>
    </div>
    
    <script>
        async function loadPosts() {
            try {
                const response = await fetch('/api/posts');
                const posts = await response.json();
                
                const postsList = document.getElementById('postsList');
                postsList.innerHTML = '';
                
                posts.forEach(post => {
                    const postEl = document.createElement('div');
                    postEl.className = 'post';
                    
                    const date = new Date(post.timestamp * 1000);
                    postEl.innerHTML = `
                        <div class="post-header">${post.pseudonym}</div>
                        <div class="post-time">${date.toLocaleString()}</div>
                        <div>${post.content}</div>
                    `;
                    
                    postsList.appendChild(postEl);
                });
            } catch (error) {
                console.error('Error loading posts:', error);
            }
        }
        
        async function createPost() {
            const pseudonym = document.getElementById('pseudonym').value;
            const content = document.getElementById('content').value;
            
            if (!content.trim()) {
                alert('Bitte gib einen Text ein!');
                return;
            }
            
            try {
                const response = await fetch('/api/posts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content, pseudonym })
                });
                
                if (response.ok) {
                    document.getElementById('content').value = '';
                    loadPosts();
                } else {
                    alert('Fehler beim Posten!');
                }
            } catch (error) {
                console.error('Error creating post:', error);
                alert('Fehler beim Posten!');
            }
        }
        
        // Load posts on page load
        loadPosts();
        
        // Refresh posts every 5 seconds
        setInterval(loadPosts, 5000);
    </script>
</body>
</html>"#)
}

async fn get_posts_handler(state: web::Data<AppState>) -> HttpResponse {
    match state.get_posts() {
        Ok(posts) => HttpResponse::Ok().json(posts),
        Err(e) => HttpResponse::InternalServerError().json(json!({
            "error": format!("Failed to get posts: {}", e)
        }))
    }
}

async fn create_post_handler(
    state: web::Data<AppState>,
    post: web::Json<Post>
) -> HttpResponse {
    let post = post.into_inner();
    
    if post.content.is_empty() {
        return HttpResponse::BadRequest().json(json!({
            "error": "Post content cannot be empty"
        }));
    }
    
    if post.content.len() > 1000 {
        return HttpResponse::BadRequest().json(json!({
            "error": "Post content too long (max 1000 characters)"
        }));
    }
    
    match state.create_post(post) {
        Ok(created_post) => HttpResponse::Ok().json(created_post),
        Err(e) => HttpResponse::InternalServerError().json(json!({
            "error": format!("Failed to create post: {}", e)
        }))
    }
}

#[actix_web::main]
async fn main() -> Result<()> {
    println!("🚀 Brezn MVP Server wird gestartet...");
    
    let state = AppState::new()?;
    
    println!("✅ Datenbank initialisiert");
    println!("🌐 Server läuft auf http://localhost:8080");
    
    HttpServer::new(move || {
        App::new()
            .wrap(Logger::default())
            .app_data(web::Data::new(state.clone()))
            .route("/", web::get().to(index_handler))
            .route("/api/posts", web::get().to(get_posts_handler))
            .route("/api/posts", web::post().to(create_post_handler))
    })
    .bind("127.0.0.1:8080")?
    .run()
    .await?;
    
    Ok(())
}