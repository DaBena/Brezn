use std::sync::Arc;
use actix_web::{
    web, App, HttpServer, HttpResponse,
    middleware::Logger,
};
use serde_json::json;
use anyhow::Result;

use brezn::database::Database;
use brezn::types::{Config, PostValidationConfig, Post};

#[actix_web::main]
async fn main() -> Result<()> {
    println!("🚀 Brezn Server (MVP) wird gestartet...");
    
    // Initialize configuration
    let config = Config {
        auto_save: true,
        max_posts: 1000,
        default_pseudonym: "AnonymBrezn".to_string(),
        network_enabled: false, // Disabled for MVP
        network_port: 8888,
        tor_enabled: false,
        tor_socks_port: 9050,
        discovery_enabled: false, // Disabled for MVP
        discovery_port: 8888,
        sync_interval: 30,
        max_peers: 50,
        heartbeat_interval: 60,
        post_validation: PostValidationConfig::default(),
    };
    
    // Initialize database
    let db = Arc::new(Database::new("brezn_mvp.db")?);
    
    println!("✅ Brezn MVP initialisiert");
    println!("🌐 Server läuft auf http://localhost:8080");
    println!("📱 Öffnen Sie http://localhost:8080 in Ihrem Browser");
    
    let db_clone = db.clone();
    
    HttpServer::new(move || {
        App::new()
            .wrap(Logger::default())
            .app_data(web::Data::new(db.clone()))
            .app_data(web::Data::new(config.clone()))
            .route("/", web::get().to(index_handler))
            .route("/api/posts", web::get().to(get_posts_handler))
            .route("/api/posts", web::post().to(create_post_handler))
            .route("/api/config", web::get().to(get_config_handler))
    })
    .bind("127.0.0.1:8080")?
    .run()
    .await?;
    
    Ok(())
}

async fn index_handler() -> HttpResponse {
    HttpResponse::Ok()
        .content_type("text/html")
        .body(include_str!("../web/index.html"))
}

async fn get_posts_handler(db: web::Data<Database>) -> HttpResponse {
    match db.get_posts(None, None) {
        Ok(posts) => HttpResponse::Ok().json(posts),
        Err(e) => HttpResponse::InternalServerError().json(json!({
            "error": format!("Failed to get posts: {}", e)
        }))
    }
}

async fn create_post_handler(
    db: web::Data<Database>,
    config: web::Data<Config>,
    post: web::Json<Post>
) -> HttpResponse {
    let mut new_post = post.into_inner();
    
    // Validate post
    if new_post.content.is_empty() {
        return HttpResponse::BadRequest().json(json!({
            "error": "Post content cannot be empty"
        }));
    }
    
    if new_post.content.len() > config.post_validation.max_content_length as usize {
        return HttpResponse::BadRequest().json(json!({
            "error": format!("Post content too long (max {} characters)", config.post_validation.max_content_length)
        }));
    }
    
    // Set defaults
    if new_post.pseudonym.is_empty() {
        new_post.pseudonym = config.default_pseudonym.clone();
    }
    
    new_post.timestamp = chrono::Utc::now().timestamp() as u64;
    new_post.node_id = Some("local".to_string());
    
    match db.add_post(&new_post) {
        Ok(post_with_id) => HttpResponse::Ok().json(post_with_id),
        Err(e) => HttpResponse::InternalServerError().json(json!({
            "error": format!("Failed to create post: {}", e)
        }))
    }
}

async fn get_config_handler(config: web::Data<Config>) -> HttpResponse {
    HttpResponse::Ok().json(config.as_ref())
}