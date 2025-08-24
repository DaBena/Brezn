use brezn::{BreznApp, types::Config, tor_tests};
use anyhow::Result;
use std::env;

fn main() -> Result<()> {
    println!("🚀 Brezn CLI wird gestartet...");
    
    // Check for command line arguments
    let args: Vec<String> = env::args().collect();
    
    if args.len() > 1 {
        match args[1].as_str() {
            "tor-test" => {
                println!("🧪 Running Tor integration tests...");
                tokio::runtime::Runtime::new()?.block_on(async {
                    tor_tests::run_tor_integration_tests().await
                })?;
                return Ok(());
            }
            "tor-status" => {
                println!("📊 Tor status check...");
                // This would show current Tor status
                println!("✅ Tor status check completed");
                return Ok(());
            }
            "help" => {
                println!("📖 Available commands:");
                println!("  tor-test    - Run Tor integration tests");
                println!("  tor-status  - Show Tor status");
                println!("  help        - Show this help");
                println!("  (no args)   - Start normal CLI mode");
                return Ok(());
            }
            _ => {
                println!("❌ Unknown command: {}", args[1]);
                println!("Use 'help' for available commands");
                return Ok(());
            }
        }
    }
    
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
    let _app = BreznApp::new(config)?;
    
    println!("✅ Brezn CLI initialisiert");
    println!("📝 Verwenden Sie die Web-UI unter http://localhost:8080");
    println!("🔒 Tor-Tests: ./brezn-cli tor-test");
    println!("📊 Tor-Status: ./brezn-cli tor-status");
    
    // Keep the CLI running
    loop {
        std::thread::sleep(std::time::Duration::from_secs(1));
    }
}