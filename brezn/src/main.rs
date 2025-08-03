use std::io::{self, Write};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Clone, Debug)]
struct FeedPost {
    id: String,
    content: String,
    timestamp: u64,
    sender_pseudonym: String,
    ttl: u8,
}

struct BreznApp {
    posts: Vec<FeedPost>,
    pseudonym: String,
    muted_users: std::collections::HashSet<String>,
    post_counter: u32,
}

impl BreznApp {
    fn new() -> Self {
        Self {
            posts: vec![
                FeedPost {
                    id: "1".to_string(),
                    content: "Willkommen bei Brezn! 🥨".to_string(),
                    timestamp: SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .unwrap()
                        .as_secs(),
                    sender_pseudonym: "AnonymBrezn42".to_string(),
                    ttl: 8,
                },
                FeedPost {
                    id: "2".to_string(),
                    content: "Das ist ein anonymer Post!".to_string(),
                    timestamp: SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .unwrap()
                        .as_secs() - 300,
                    sender_pseudonym: "GeheimUser99".to_string(),
                    ttl: 8,
                },
            ],
            pseudonym: "AnonymBrezn42".to_string(),
            muted_users: std::collections::HashSet::new(),
            post_counter: 3,
        }
    }

    fn add_post(&mut self, content: String) {
        let post = FeedPost {
            id: format!("post_{}", self.post_counter),
            content,
            timestamp: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs(),
            sender_pseudonym: self.pseudonym.clone(),
            ttl: 8,
        };
        self.posts.insert(0, post);
        self.post_counter += 1;
        println!("✅ Post erfolgreich erstellt!");
    }

    fn display_feed(&self) {
        println!("\n🥨 Brezn Feed");
        println!("{}", "=".repeat(50));
        
        for post in &self.posts {
            if !self.muted_users.contains(&post.sender_pseudonym) {
                let current_time = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_secs();
                let time_diff = current_time - post.timestamp;
                
                let time_str = if time_diff < 60 {
                    "gerade eben".to_string()
                } else if time_diff < 3600 {
                    format!("vor {}min", time_diff / 60)
                } else if time_diff < 86400 {
                    format!("vor {}h", time_diff / 3600)
                } else {
                    format!("vor {}d", time_diff / 86400)
                };

                println!("👤 {} • {}", post.sender_pseudonym, time_str);
                println!("📝 {}", post.content);
                println!("🔗 ID: {}", post.id);
                println!("{}", "-".repeat(30));
            }
        }
    }

    fn generate_new_pseudonym(&mut self) {
        let random_num = (SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos() % 9999) as u32;
        self.pseudonym = format!("AnonymBrezn{}", random_num);
        println!("🎲 Neues Pseudonym: {}", self.pseudonym);
    }

    fn mute_user(&mut self, pseudonym: &str) {
        self.muted_users.insert(pseudonym.to_string());
        println!("🔇 {} wurde stummgeschaltet.", pseudonym);
    }

    fn show_menu(&self) {
        println!("\n📋 Menü:");
        println!("1. Feed anzeigen");
        println!("2. Neuen Post erstellen");
        println!("3. Neues Pseudonym generieren");
        println!("4. Benutzer stummschalten");
        println!("5. Netzwerk-Status");
        println!("6. Beenden");
        println!("Aktuelles Pseudonym: {}", self.pseudonym);
        print!("Wähle eine Option (1-6): ");
        io::stdout().flush().unwrap();
    }

    fn show_network_status(&self) {
        println!("\n📶 Netzwerk-Status:");
        println!("📊 {} Posts lokal", self.posts.len());
        println!("🔇 {} stummgeschaltete Benutzer", self.muted_users.len());
        println!("🌐 I2P-Netzwerk: Nicht verfügbar (Demo-Modus)");
        println!("📱 QR-Code-Scanning: Nicht verfügbar (Demo-Modus)");
    }
}

fn main() {
    println!("🥨 Willkommen bei Brezn!");
    println!("Eine dezentrale Feed-App (Demo-Version)");
    println!("{}", "=".repeat(50));

    let mut app = BreznApp::new();
    
    loop {
        app.show_menu();
        
        let mut input = String::new();
        io::stdin().read_line(&mut input).unwrap();
        let choice = input.trim();

        match choice {
            "1" => {
                app.display_feed();
            }
            "2" => {
                print!("Gib deinen Post ein: ");
                io::stdout().flush().unwrap();
                let mut content = String::new();
                io::stdin().read_line(&mut content).unwrap();
                let content = content.trim().to_string();
                
                if !content.is_empty() {
                    app.add_post(content);
                } else {
                    println!("❌ Post kann nicht leer sein!");
                }
            }
            "3" => {
                app.generate_new_pseudonym();
            }
            "4" => {
                print!("Pseudonym zum Stummschalten: ");
                io::stdout().flush().unwrap();
                let mut pseudonym = String::new();
                io::stdin().read_line(&mut pseudonym).unwrap();
                let pseudonym = pseudonym.trim();
                
                if !pseudonym.is_empty() {
                    app.mute_user(pseudonym);
                } else {
                    println!("❌ Pseudonym kann nicht leer sein!");
                }
            }
            "5" => {
                app.show_network_status();
            }
            "6" => {
                println!("👋 Auf Wiedersehen!");
                break;
            }
            _ => {
                println!("❌ Ungültige Option!");
            }
        }
    }
}
