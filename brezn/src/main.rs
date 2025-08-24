use std::sync::Arc;
use actix_web::{
    web, App, HttpServer, HttpResponse, HttpRequest,
    middleware::Logger,
};
use serde_json::json;
use serde::{Serialize, Deserialize};
use anyhow::Result;

use brezn::{BreznApp, types::Config};

#[derive(Serialize, Deserialize)]
struct CreatePostRequest {
    content: String,
    pseudonym: Option<String>,
}

#[derive(Serialize, Deserialize)]
struct ConnectPeerRequest {
    address: String,
    port: u16,
}

#[derive(Serialize, Deserialize)]
struct ParseQRRequest {
    qr_data: String,
}

#[actix_web::main]
async fn main() -> Result<()> {
    println!("🚀 Brezn Server wird gestartet...");
    
    // Initialize configuration
    let config = Config::default();
    
    // Initialize the app
    let app = Arc::new(BreznApp::new(config)?);
    
    // Start the app
    app.start().await?;
    
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
            .route("/api/posts/{id}", web::delete().to(delete_post_handler))
            .route("/api/config", web::get().to(get_config_handler))
            .route("/api/network/status", web::get().to(get_network_status_handler))
            .route("/api/network/peers", web::get().to(get_peers_handler))
            .route("/api/network/connect", web::post().to(connect_peer_handler))
            .route("/api/network/qr", web::get().to(generate_qr_handler))
            .route("/api/network/parse-qr", web::post().to(parse_qr_handler))
            .route("/api/discovery/peers", web::get().to(get_discovery_peers_handler))
    })
    .bind("127.0.0.1:8080")?
    .run()
    .await?;
    
    Ok(())
}

async fn index_handler(_req: HttpRequest) -> HttpResponse {
    let html = include_str!("../web/index.html");
    HttpResponse::Ok()
        .content_type("text/html; charset=utf-8")
        .body(html)
}

async fn get_posts_handler(app_data: web::Data<Arc<BreznApp>>) -> HttpResponse {
    match app_data.get_posts() {
        Ok(posts) => HttpResponse::Ok().json(posts),
        Err(e) => HttpResponse::InternalServerError().json(json!({
            "error": format!("Failed to get posts: {}", e)
        }))
    }
}

async fn create_post_handler(
    app_data: web::Data<Arc<BreznApp>>,
    req: web::Json<CreatePostRequest>,
) -> HttpResponse {
    match app_data.create_post(req.content.clone(), req.pseudonym.clone()) {
        Ok(post_id) => HttpResponse::Ok().json(json!({
            "id": post_id,
            "message": "Post created successfully"
        })),
        Err(e) => HttpResponse::InternalServerError().json(json!({
            "error": format!("Failed to create post: {}", e)
        }))
    }
}

async fn delete_post_handler(
    app_data: web::Data<Arc<BreznApp>>,
    path: web::Path<i64>,
) -> HttpResponse {
    let post_id = path.into_inner();
    match app_data.delete_post(post_id) {
        Ok(_) => HttpResponse::Ok().json(json!({
            "message": "Post deleted successfully"
        })),
        Err(e) => HttpResponse::InternalServerError().json(json!({
            "error": format!("Failed to delete post: {}", e)
        }))
    }
}

async fn get_config_handler(app_data: web::Data<Arc<BreznApp>>) -> HttpResponse {
    HttpResponse::Ok().json(app_data.get_config())
}

async fn get_network_status_handler(app_data: web::Data<Arc<BreznApp>>) -> HttpResponse {
    let status = app_data.get_network_status();
    HttpResponse::Ok().json(status)
}

async fn get_peers_handler(app_data: web::Data<Arc<BreznApp>>) -> HttpResponse {
    let peers = app_data.get_peers();
    HttpResponse::Ok().json(peers)
}

async fn connect_peer_handler(
    app_data: web::Data<Arc<BreznApp>>,
    req: web::Json<ConnectPeerRequest>,
) -> HttpResponse {
    match app_data.connect_to_peer(req.address.clone(), req.port).await {
        Ok(_) => HttpResponse::Ok().json(json!({
            "message": "Connected to peer successfully"
        })),
        Err(e) => HttpResponse::InternalServerError().json(json!({
            "error": format!("Failed to connect to peer: {}", e)
        }))
    }
}

async fn generate_qr_handler(app_data: web::Data<Arc<BreznApp>>) -> HttpResponse {
    match app_data.generate_qr_code() {
        Ok(qr_code) => HttpResponse::Ok().json(json!({
            "qr_code": qr_code
        })),
        Err(e) => HttpResponse::InternalServerError().json(json!({
            "error": format!("Failed to generate QR code: {}", e)
        }))
    }
}

async fn parse_qr_handler(
    app_data: web::Data<Arc<BreznApp>>,
    req: web::Json<ParseQRRequest>,
) -> HttpResponse {
    match app_data.parse_qr_code(req.qr_data.clone()) {
        Ok((address, port)) => HttpResponse::Ok().json(json!({
            "address": address,
            "port": port
        })),
        Err(e) => HttpResponse::InternalServerError().json(json!({
            "error": format!("Failed to parse QR code: {}", e)
        }))
    }
}

async fn get_discovery_peers_handler(app_data: web::Data<Arc<BreznApp>>) -> HttpResponse {
    let peers = app_data.get_discovered_peers();
    let peer_count = app_data.get_discovery_peer_count();
    
    HttpResponse::Ok().json(json!({
        "peer_count": peer_count,
        "peers": peers
    }))
}