use brezn::{BreznApp, types::Config};
use anyhow::Result;

fn main() -> Result<()> {
    println!("🚀 Brezn CLI wird gestartet...");
    
    // Initialize configuration
    let config = Config {
        auto_save: true,
        max_posts: 1000,
        default_pseudonym: "AnonymBrezn".to_string(),
        network_enabled: true,
        network_port: 8888,
        tor_enabled: false,
        tor_socks_port: 9050,
    };
    
    // Initialize the app
    let app = BreznApp::new(config)?;
    
    println!("✅ Brezn CLI initialisiert");
    println!("📝 Verwenden Sie die Web-UI unter http://localhost:8080");
    
    // Keep the CLI running
    loop {
        std::thread::sleep(std::time::Duration::from_secs(1));
    }
}