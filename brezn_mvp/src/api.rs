use actix_web::{web, HttpResponse};
use serde_json::json;
use chrono::Utc;
use uuid::Uuid;

use crate::{AppState, types::{Post, CreatePostRequest}};
use crate::qr::{PeerConnectionInfo, generate_qr_code_base64};

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg
        .route("/", web::get().to(index))
        .route("/api/posts", web::get().to(get_posts))
        .route("/api/posts", web::post().to(create_post))
        .route("/api/network/status", web::get().to(network_status))
        .route("/api/network/peers", web::get().to(get_peers))
        .route("/api/network/connect", web::post().to(connect_peer))
        .route("/api/network/qr", web::get().to(generate_qr))
        .route("/api/discovery/peers", web::get().to(discovered_peers));
}

async fn index() -> HttpResponse {
    HttpResponse::Ok()
        .content_type("text/html")
        .body(include_str!("../static/index.html"))
}

async fn get_posts(state: web::Data<AppState>) -> HttpResponse {
    match state.db.get_posts(Some(100)) {
        Ok(posts) => HttpResponse::Ok().json(posts),
        Err(e) => HttpResponse::InternalServerError().json(json!({
            "error": format!("Failed to get posts: {}", e)
        }))
    }
}

async fn create_post(
    state: web::Data<AppState>,
    req: web::Json<CreatePostRequest>,
) -> HttpResponse {
    // Validate post
    if req.content.is_empty() {
        return HttpResponse::BadRequest().json(json!({
            "error": "Post content cannot be empty"
        }));
    }
    
    if req.content.len() > 1000 {
        return HttpResponse::BadRequest().json(json!({
            "error": "Post content too long (max 1000 characters)"
        }));
    }
    
    // Create post
    let post = Post {
        id: None,
        content: req.content.clone(),
        timestamp: Utc::now(),
        pseudonym: req.pseudonym.clone()
            .unwrap_or_else(|| state.config.default_pseudonym.clone()),
        node_id: Uuid::new_v4().to_string(),
    };
    
    // Save to database
    match state.db.add_post(&post) {
        Ok(saved_post) => {
            // Broadcast to network if enabled
            if state.config.network_enabled {
                let network = state.network.lock().await;
                let _ = network.broadcast_post(&saved_post).await;
            }
            
            HttpResponse::Ok().json(saved_post)
        }
        Err(e) => HttpResponse::InternalServerError().json(json!({
            "error": format!("Failed to create post: {}", e)
        }))
    }
}

async fn network_status(state: web::Data<AppState>) -> HttpResponse {
    let network = state.network.lock().await;
    let status = network.get_status().await;
    HttpResponse::Ok().json(status)
}

async fn get_peers(state: web::Data<AppState>) -> HttpResponse {
    let network = state.network.lock().await;
    let peer_count = network.get_peer_count().await;
    
    HttpResponse::Ok().json(json!({
        "peer_count": peer_count,
        "peers": []  // TODO: Implement peer list
    }))
}

async fn connect_peer(
    state: web::Data<AppState>,
    req: web::Json<serde_json::Value>,
) -> HttpResponse {
    let address = req.get("address")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    
    if address.is_empty() {
        return HttpResponse::BadRequest().json(json!({
            "error": "Address is required"
        }));
    }
    
    let network = state.network.lock().await;
    match network.connect_to_peer(address).await {
        Ok(_) => HttpResponse::Ok().json(json!({
            "success": true,
            "message": format!("Connected to {}", address)
        })),
        Err(e) => HttpResponse::InternalServerError().json(json!({
            "error": format!("Failed to connect: {}", e)
        }))
    }
}

async fn generate_qr(state: web::Data<AppState>) -> HttpResponse {
    let info = PeerConnectionInfo {
        node_id: Uuid::new_v4().to_string(),
        address: "localhost".to_string(),
        port: state.config.network_port,
    };
    
    match generate_qr_code_base64(&info) {
        Ok(qr_base64) => HttpResponse::Ok().json(json!({
            "qr_code": format!("data:image/png;base64,{}", qr_base64),
            "connection_info": info
        })),
        Err(e) => HttpResponse::InternalServerError().json(json!({
            "error": format!("Failed to generate QR code: {}", e)
        }))
    }
}

async fn discovered_peers(state: web::Data<AppState>) -> HttpResponse {
    let discovery = state.discovery.lock().await;
    let peers = discovery.get_peers().await;
    HttpResponse::Ok().json(peers)
}