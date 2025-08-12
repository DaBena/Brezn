use std::sync::Arc;
use actix_web::{
    web, App, HttpServer, HttpResponse,
    middleware::Logger,
};
use serde_json::json;
use anyhow::Result;

use brezn::{BreznApp, types::Config};

#[actix_web::main]
async fn main() -> Result<()> {
    println!("🚀 Brezn Server wird gestartet...");
    
    // Initialize configuration
    let config = Config {
        auto_save: true,
        max_posts: 1000,
        default_pseudonym: "AnonymBrezn".to_string(),
        network_enabled: true,
        network_port: 8888,
        tor_enabled: false,
        tor_socks_port: 9050,
        discovery_enabled: true,
        discovery_port: 8888,
        sync_interval: 30,
        max_peers: 50,
        heartbeat_interval: 60,
        post_validation: PostValidationConfig::default(),
    };
    
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
            .route("/api/config", web::get().to(get_config_handler))
            .route("/api/config", web::post().to(update_config_handler))
            .route("/api/network/toggle", web::post().to(toggle_network_handler))
            .route("/api/tor/toggle", web::post().to(toggle_tor_handler))
            .route("/api/network/status", web::get().to(network_status_handler))
            .route("/api/network/qr", web::get().to(qr_code_handler))
            .route("/api/network/parse-qr", web::post().to(parse_qr_handler))
            .route("/api/network/request-posts", web::post().to(request_posts_handler))
            .route("/api/network/sync-all", web::post().to(sync_all_peers_handler))
    })
    .bind("127.0.0.1:8080")?
    .run()
    .await?;
    
    Ok(())
}

async fn index_handler() -> HttpResponse {
    let html = include_str!("../web/index.html");
    HttpResponse::Ok()
        .content_type("text/html")
        .body(html)
}

async fn get_posts_handler(
    app: web::Data<Arc<BreznApp>>,
) -> HttpResponse {
    match app.get_posts().await {
        Ok(posts) => {
            let response = json!({
                "success": true,
                "posts": posts
            });
            HttpResponse::Ok()
                .content_type("application/json")
                .append_header(("access-control-allow-origin", "*"))
                .json(response)
        }
        Err(e) => {
            let response = json!({
                "success": false,
                "error": e.to_string()
            });
            HttpResponse::InternalServerError()
                .content_type("application/json")
                .append_header(("access-control-allow-origin", "*"))
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
    
    // Validate post data
    let config = app.config.lock().unwrap();
    let validation = &config.post_validation;
    
    // Check content length
    if content.len() < validation.min_content_length {
        let response = json!({
            "success": false,
            "error": format!("Post-Inhalt zu kurz (Minimum: {} Zeichen)", validation.min_content_length)
        });
        return HttpResponse::BadRequest()
            .content_type("application/json")
            .append_header(("access-control-allow-origin", "*"))
            .json(response);
    }
    
    if content.len() > validation.max_content_length {
        let response = json!({
            "success": false,
            "error": format!("Post-Inhalt zu lang (Maximum: {} Zeichen)", validation.max_content_length)
        });
        return HttpResponse::BadRequest()
            .content_type("application/json")
            .append_header(("access-control-allow-origin", "*"))
            .json(response);
    }
    
    // Check pseudonym length
    if pseudonym.len() > validation.max_pseudonym_length {
        let response = json!({
            "success": false,
            "error": format!("Pseudonym zu lang (Maximum: {} Zeichen)", validation.max_pseudonym_length)
        });
        return HttpResponse::BadRequest()
            .content_type("application/json")
            .append_header(("access-control-allow-origin", "*"))
            .json(response);
    }
    
    // Check for empty content if not allowed
    if !validation.allow_empty_content && content.trim().is_empty() {
        let response = json!({
            "success": false,
            "error": "Post-Inhalt darf nicht leer sein"
        });
        return HttpResponse::BadRequest()
            .content_type("application/json")
            .append_header(("access-control-allow-origin", "*"))
            .json(response);
    }
    
    match app.create_post(content.to_string(), pseudonym.to_string()).await {
        Ok(_) => {
            let response = json!({
                "success": true,
                "message": "Post erfolgreich erstellt"
            });
            HttpResponse::Ok()
                .content_type("application/json")
                .append_header(("access-control-allow-origin", "*"))
                .json(response)
        }
        Err(e) => {
            let response = json!({
                "success": false,
                "error": e.to_string()
            });
            HttpResponse::InternalServerError()
                .content_type("application/json")
                .append_header(("access-control-allow-origin", "*"))
                .json(response)
        }
    }
}

async fn get_config_handler(
    app: web::Data<Arc<BreznApp>>,
) -> HttpResponse {
    let config = app.config.lock().unwrap().clone();
    let response = json!({
        "success": true,
        "config": config
    });
    HttpResponse::Ok()
        .content_type("application/json")
        .append_header(("access-control-allow-origin", "*"))
        .json(response)
}

async fn update_config_handler(
    app: web::Data<Arc<BreznApp>>,
    config_data: web::Json<serde_json::Value>,
) -> HttpResponse {
    let mut config = app.config.lock().unwrap();
    
    match config.update(&config_data) {
        Ok(_) => {
            let response = json!({
                "success": true,
                "message": "Konfiguration erfolgreich aktualisiert",
                "config": config.clone()
            });
            HttpResponse::Ok()
                .content_type("application/json")
                .append_header(("access-control-allow-origin", "*"))
                .json(response)
        }
        Err(validation_errors) => {
            let response = json!({
                "success": false,
                "error": "Konfigurationsvalidierung fehlgeschlagen",
                "validation_errors": validation_errors
            });
            HttpResponse::BadRequest()
                .content_type("application/json")
                .append_header(("access-control-allow-origin", "*"))
                .json(response)
        }
    }
}

async fn toggle_network_handler(
    app: web::Data<Arc<BreznApp>>,
) -> HttpResponse {
    let mut config = app.config.lock().unwrap();
    config.network_enabled = !config.network_enabled;
    
    let response = json!({
        "success": true,
        "network_enabled": config.network_enabled,
        "message": format!("Network {}", if config.network_enabled { "enabled" } else { "disabled" })
    });
    HttpResponse::Ok()
        .content_type("application/json")
        .append_header(("access-control-allow-origin", "*"))
        .json(response)
}

async fn toggle_tor_handler(
    app: web::Data<Arc<BreznApp>>,
) -> HttpResponse {
    let mut config = app.config.lock().unwrap();
    config.tor_enabled = !config.tor_enabled;

    // Actually enable/disable Tor in the network layer
    let enable_result = if config.tor_enabled {
        drop(config); // release lock before await
        match app.enable_tor().await {
            Ok(_) => Ok(()),
            Err(e) => Err(e),
        }
    } else {
        // Disable directly on the network manager
        let mut nm = app.network_manager.lock().unwrap();
        nm.disable_tor();
        Ok(())
    };

    let (success, message) = match enable_result {
        Ok(_) => (true, format!("Tor {}", if app.network_manager.lock().unwrap().is_tor_enabled() { "enabled" } else { "disabled" })),
        Err(e) => (false, format!("Failed to toggle Tor: {}", e)),
    };

    let response = json!({
        "success": success,
        "tor_enabled": app.network_manager.lock().unwrap().is_tor_enabled(),
        "message": message,
    });
    HttpResponse::Ok()
        .content_type("application/json")
        .append_header(("access-control-allow-origin", "*"))
        .json(response)
}

async fn network_status_handler(
    app: web::Data<Arc<BreznApp>>,
) -> HttpResponse {
    match app.get_network_status() {
        Ok(status) => {
            // Add additional network health information
            let network_health = {
                let config = app.config.lock().unwrap();
                let peer_count = status["peers_count"].as_u64().unwrap_or(0) as usize;
                let max_peers = config.max_peers;
                let health_score = if peer_count == 0 {
                    0
                } else if peer_count >= max_peers {
                    100
                } else {
                    (peer_count * 100) / max_peers
                };
                
                json!({
                    "health_score": health_score,
                    "max_peers": max_peers,
                    "sync_interval": config.sync_interval,
                    "heartbeat_interval": config.heartbeat_interval,
                    "discovery_enabled": config.discovery_enabled,
                    "discovery_port": config.discovery_port
                })
            };
            
            let enhanced_status = json!({
                "success": true,
                "network": status,
                "health": network_health,
                "timestamp": chrono::Utc::now().timestamp()
            });
            
            HttpResponse::Ok()
                .content_type("application/json")
                .append_header(("access-control-allow-origin", "*"))
                .json(enhanced_status)
        }
        Err(e) => {
            let response = json!({
                "success": false,
                "error": e.to_string()
            });
            HttpResponse::InternalServerError()
                .content_type("application/json")
                .append_header(("access-control-allow-origin", "*"))
                .json(response)
        }
    }
}

async fn request_posts_handler(
    app: web::Data<Arc<BreznApp>>,
    body: web::Json<serde_json::Value>,
) -> HttpResponse {
    let node_id = match body.get("node_id").and_then(|v| v.as_str()) {
        Some(s) if !s.is_empty() => s.to_string(),
        _ => {
            let response = json!({
                "success": false,
                "error": "Missing or invalid node_id"
            });
            return HttpResponse::BadRequest()
                .content_type("application/json")
                .append_header(("access-control-allow-origin", "*"))
                .json(response);
        }
    };

    // Clone manager to avoid holding lock across await
    let nm_clone = {
        let nm = app.network_manager.lock().unwrap();
        nm.clone()
    };

    let result = nm_clone.request_posts_from_peer(&node_id).await;
    let response = match result {
        Ok(_) => json!({
            "success": true,
            "message": format!("Requested posts from {}", node_id)
        }),
        Err(e) => json!({
            "success": false,
            "error": e.to_string()
        }),
    };

    HttpResponse::Ok()
        .content_type("application/json")
        .append_header(("access-control-allow-origin", "*"))
        .json(response)
}

async fn qr_code_handler(
    app: web::Data<Arc<BreznApp>>,
) -> HttpResponse {
    match app.generate_qr_code() {
        Ok(qr_code) => {
            let response = json!({
                "success": true,
                "qr_code": qr_code,
                "message": "QR code generated successfully"
            });
            HttpResponse::Ok()
                .content_type("application/json")
                .append_header(("access-control-allow-origin", "*"))
                .json(response)
        }
        Err(e) => {
            let response = json!({
                "success": false,
                "error": e.to_string()
            });
            HttpResponse::InternalServerError()
                .content_type("application/json")
                .append_header(("access-control-allow-origin", "*"))
                .json(response)
        }
    }
}

async fn parse_qr_handler(
    app: web::Data<Arc<BreznApp>>,
    qr_data: web::Json<serde_json::Value>,
) -> HttpResponse {
    let qr_string = qr_data["qr_data"].as_str().unwrap_or("");
    
    match app.parse_qr_code(qr_string) {
        Ok(_) => {
            let response = json!({
                "success": true,
                "message": "Peer erfolgreich hinzugefügt"
            });
            HttpResponse::Ok()
                .content_type("application/json")
                .append_header(("access-control-allow-origin", "*"))
                .json(response)
        }
        Err(e) => {
            let response = json!({
                "success": false,
                "error": e.to_string()
            });
            HttpResponse::BadRequest()
                .content_type("application/json")
                .append_header(("access-control-allow-origin", "*"))
                .json(response)
        }
    }
}

async fn sync_all_peers_handler(
    app: web::Data<Arc<BreznApp>>,
) -> HttpResponse {
    let network_manager = Arc::clone(&app.network_manager);
    
    // Run sync in background to avoid blocking the response
    tokio::spawn(async move {
        if let Err(e) = network_manager.lock().unwrap().sync_all_peers().await {
            eprintln!("Failed to sync all peers: {}", e);
        }
    });
    
    let response = json!({
        "success": true,
        "message": "Post-Synchronisation mit allen Peers gestartet"
    });
    
    HttpResponse::Ok()
        .content_type("application/json")
        .append_header(("access-control-allow-origin", "*"))
        .json(response)
}