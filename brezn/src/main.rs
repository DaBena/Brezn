use std::sync::Arc;
use actix_web::{
    web, App, HttpServer, HttpResponse, HttpRequest,
    middleware::Logger,
};
use serde_json::json;
use anyhow::Result;

use brezn::BreznApp;

#[actix_web::main]
async fn main() -> Result<()> {
    println!("🚀 Brezn Server wird gestartet...");
    
    // Initialize the app
    let app = Arc::new(BreznApp::new()?);
    println!("✅ Brezn App initialisiert");
    
    println!("🌐 Server läuft auf http://localhost:8080");
    println!("📱 Öffnen Sie http://localhost:8080 in Ihrem Browser");
    
    HttpServer::new(move || {
        App::new()
            .wrap(Logger::default())
            .app_data(web::Data::new(app.clone()))
            .route("/", web::get().to(index_handler))
            .route("/api/posts", web::get().to(get_posts_handler))
            .route("/api/posts", web::post().to(create_post_handler))
            .route("/api/config", web::get().to(get_config_handler))
            .route("/api/config", web::post().to(update_config_handler))
            .route("/api/network/toggle", web::post().to(toggle_network_handler))
            .route("/api/tor/toggle", web::post().to(toggle_tor_handler))
    })
    .bind("127.0.0.1:8080")?
    .run()
    .await?;
    
    Ok(())
}

async fn index_handler() -> HttpResponse {
    let html = include_str!("../index.html");
    HttpResponse::Ok()
        .content_type("text/html")
        .body(html)
}

async fn get_posts_handler(
    app: web::Data<Arc<BreznApp>>,
) -> HttpResponse {
    match app.get_posts(100) {
        Ok(posts) => {
            let response = json!({
                "success": true,
                "posts": posts
            });
            HttpResponse::Ok()
                .content_type("application/json")
                .header("access-control-allow-origin", "*")
                .json(response)
        }
        Err(e) => {
            let response = json!({
                "success": false,
                "error": e.to_string()
            });
            HttpResponse::InternalServerError()
                .content_type("application/json")
                .header("access-control-allow-origin", "*")
                .json(response)
        }
    }
}

async fn create_post_handler(
    app: web::Data<Arc<BreznApp>>,
    post_data: web::Json<serde_json::Value>,
) -> HttpResponse {
    let content = post_data["content"].as_str().unwrap_or("");
    let pseudonym = post_data["pseudonym"].as_str().unwrap_or("AnonymBrezn");
    
    match app.add_post(content.to_string(), pseudonym.to_string()) {
        Ok(id) => {
            let response = json!({
                "success": true,
                "id": id
            });
            HttpResponse::Ok()
                .content_type("application/json")
                .header("access-control-allow-origin", "*")
                .json(response)
        }
        Err(e) => {
            let response = json!({
                "success": false,
                "error": e.to_string()
            });
            HttpResponse::InternalServerError()
                .content_type("application/json")
                .header("access-control-allow-origin", "*")
                .json(response)
        }
    }
}

async fn get_config_handler(
    app: web::Data<Arc<BreznApp>>,
) -> HttpResponse {
    match app.get_config() {
        Ok(config) => {
            let response = json!({
                "success": true,
                "config": config
            });
            HttpResponse::Ok()
                .content_type("application/json")
                .header("access-control-allow-origin", "*")
                .json(response)
        }
        Err(e) => {
            let response = json!({
                "success": false,
                "error": e.to_string()
            });
            HttpResponse::InternalServerError()
                .content_type("application/json")
                .header("access-control-allow-origin", "*")
                .json(response)
        }
    }
}

async fn update_config_handler(
    _app: web::Data<Arc<BreznApp>>,
    _config_data: web::Json<serde_json::Value>,
) -> HttpResponse {
    let response = json!({
        "success": true,
        "message": "Config updated (simplified)"
    });
    HttpResponse::Ok()
        .content_type("application/json")
        .header("access-control-allow-origin", "*")
        .json(response)
}

async fn toggle_network_handler(
    _app: web::Data<Arc<BreznApp>>,
) -> HttpResponse {
    let response = json!({
        "success": true,
        "message": "Network toggled (not implemented yet)"
    });
    HttpResponse::Ok()
        .content_type("application/json")
        .header("access-control-allow-origin", "*")
        .json(response)
}

async fn toggle_tor_handler(
    _app: web::Data<Arc<BreznApp>>,
) -> HttpResponse {
    let response = json!({
        "success": true,
        "message": "Tor toggled (not implemented yet)"
    });
    HttpResponse::Ok()
        .content_type("application/json")
        .header("access-control-allow-origin", "*")
        .json(response)
}