use std::env;
use brezn::{BreznApp, types::Config};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = env::args().collect();
    
    if args.len() < 2 {
        println!("Brezn CLI");
        println!("Usage: brezn-cli <command> [args...]");
        println!("Commands:");
        println!("  post <content> [pseudonym] - Create a new post");
        println!("  list                       - List all posts");
        println!("  connect <address> <port>   - Connect to a peer");
        println!("  status                     - Show network status");
        println!("  qr                         - Generate QR code");
        println!("  discovery                  - Show discovered peers");
        return Ok(());
    }

    let config = Config::default();
    let app = BreznApp::new(config)?;
    app.start().await?;

    match args[1].as_str() {
        "post" => {
            if args.len() < 3 {
                println!("Usage: brezn-cli post <content> [pseudonym]");
                return Ok(());
            }
            let content = args[2].clone();
            let pseudonym = args.get(3).cloned();
            
            match app.create_post(content.clone(), pseudonym.clone()) {
                Ok(id) => println!("✅ Post created with ID: {}", id),
                Err(e) => println!("❌ Failed to create post: {}", e),
            }
        }
        
        "list" => {
            match app.get_posts() {
                Ok(posts) => {
                    if posts.is_empty() {
                        println!("No posts found.");
                    } else {
                        println!("📝 Posts:");
                        for post in posts {
                            println!("  [{}] {}: {}", 
                                post.id.unwrap_or(0), 
                                post.pseudonym, 
                                post.content
                            );
                        }
                    }
                }
                Err(e) => println!("❌ Failed to get posts: {}", e),
            }
        }
        
        "connect" => {
            if args.len() < 4 {
                println!("Usage: brezn-cli connect <address> <port>");
                return Ok(());
            }
            let address = args[2].clone();
            let port: u16 = args[3].parse().unwrap_or(8888);
            
            match app.connect_to_peer(address.clone(), port).await {
                Ok(_) => println!("✅ Connected to {}:{}", address, port),
                Err(e) => println!("❌ Failed to connect: {}", e),
            }
        }
        
        "status" => {
            let status = app.get_network_status();
            println!("🌐 Network Status:");
            println!("  Enabled: {}", status.is_enabled);
            println!("  Peers: {}", status.peer_count);
            println!("  Bytes sent: {}", status.bytes_sent);
            println!("  Bytes received: {}", status.bytes_received);
        }
        
        "qr" => {
            match app.generate_qr_code() {
                Ok(qr) => println!("📱 QR Code generated: {}", qr),
                Err(e) => println!("❌ Failed to generate QR code: {}", e),
            }
        }
        
        "discovery" => {
            let peers = app.get_discovered_peers();
            let peer_count = app.get_discovery_peer_count();
            
            println!("🔍 Discovery Status:");
            println!("  Discovered peers: {}", peer_count);
            for peer in peers {
                println!("  - {} ({}:{})", peer.node_id, peer.address, peer.port);
            }
        }
        
        _ => {
            println!("Unknown command: {}", args[1]);
            println!("Run 'brezn-cli' without arguments to see available commands.");
        }
    }

    Ok(())
}