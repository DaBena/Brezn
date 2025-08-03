use std::io::{self, Write};
use std::fs;
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Clone)]
struct Post {
    content: String,
    timestamp: u64,
    pseudonym: String,
}

#[derive(Serialize, Deserialize)]
struct BreznData {
    posts: Vec<Post>,
    muted_users: std::collections::HashSet<String>,
}

impl BreznData {
    fn new() -> Self {
        Self {
            posts: vec![
                Post {
                    content: "Willkommen bei Brezn! 🥨".to_string(),
                    timestamp: std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap()
                        .as_secs(),
                    pseudonym: "AnonymBrezn42".to_string(),
                },
                Post {
                    content: "Das ist ein anonymer Post!".to_string(),
                    timestamp: std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap()
                        .as_secs() - 300,
                    pseudonym: "GeheimUser99".to_string(),
                },
            ],
            muted_users: std::collections::HashSet::new(),
        }
    }

    fn save(&self) -> Result<(), Box<dyn std::error::Error>> {
        let data = serde_json::to_string_pretty(self)?;
        fs::write("brezn_data.json", data)?;
        Ok(())
    }

    fn load() -> Result<Self, Box<dyn std::error::Error>> {
        if let Ok(data) = fs::read_to_string("brezn_data.json") {
            Ok(serde_json::from_str(&data)?)
        } else {
            Ok(Self::new())
        }
    }

    fn add_post(&mut self, content: String, pseudonym: String) {
        let post = Post {
            content,
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs(),
            pseudonym,
        };
        self.posts.insert(0, post);
    }

    fn display_feed(&self) {
        println!("\n🥨 Brezn Feed");
        println!("{}", "=".repeat(50));
        
        for (i, post) in self.posts.iter().enumerate() {
            if !self.muted_users.contains(&post.pseudonym) {
                let current_time = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
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

                println!("👤 {} • {}", post.pseudonym, time_str);
                println!("📝 {}", post.content);
                println!("🔗 ID: {}", i + 1);
                println!("{}", "-".repeat(30));
            }
        }
    }
}

fn main() {
    println!("🥨 Willkommen bei Brezn!");
    println!("Eine dezentrale Feed-App (Demo-Version)");
    println!("{}", "=".repeat(50));

    // Daten laden oder neu erstellen
    let mut data = match BreznData::load() {
        Ok(data) => {
            println!("📂 Daten erfolgreich geladen!");
            data
        }
        Err(e) => {
            println!("⚠️  Fehler beim Laden der Daten: {}. Erstelle neue Daten.", e);
            BreznData::new()
        }
    };

    let mut current_pseudonym = "AnonymBrezn42".to_string();
    
    loop {
        println!("\n📋 Menü:");
        println!("1. Feed anzeigen");
        println!("2. Neuen Post erstellen");
        println!("3. Neues Pseudonym generieren");
        println!("4. Benutzer stummschalten");
        println!("5. Netzwerk-Status");
        println!("6. Beenden");
        println!("Aktuelles Pseudonym: {}", current_pseudonym);
        print!("Wähle eine Option (1-6): ");
        io::stdout().flush().unwrap();
        
        let mut input = String::new();
        io::stdin().read_line(&mut input).unwrap();
        let choice = input.trim();

        match choice {
            "1" => {
                data.display_feed();
            }
            "2" => {
                print!("Gib deinen Post ein: ");
                io::stdout().flush().unwrap();
                let mut content = String::new();
                io::stdin().read_line(&mut content).unwrap();
                let content = content.trim().to_string();
                
                if !content.is_empty() {
                    data.add_post(content, current_pseudonym.clone());
                    println!("✅ Post erfolgreich erstellt!");
                    
                    // Automatisch speichern nach neuem Post
                    if let Err(e) = data.save() {
                        println!("⚠️  Fehler beim Speichern: {}", e);
                    }
                } else {
                    println!("❌ Post kann nicht leer sein!");
                }
            }
            "3" => {
                let random_num = (std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos() % 9999) as u32;
                current_pseudonym = format!("AnonymBrezn{}", random_num);
                println!("🎲 Neues Pseudonym: {}", current_pseudonym);
            }
            "4" => {
                print!("Pseudonym zum Stummschalten: ");
                io::stdout().flush().unwrap();
                let mut pseudonym_to_mute = String::new();
                io::stdin().read_line(&mut pseudonym_to_mute).unwrap();
                let pseudonym_to_mute = pseudonym_to_mute.trim();
                
                if !pseudonym_to_mute.is_empty() {
                    data.muted_users.insert(pseudonym_to_mute.to_string());
                    println!("🔇 {} wurde stummgeschaltet.", pseudonym_to_mute);
                    
                    // Automatisch speichern nach Mute
                    if let Err(e) = data.save() {
                        println!("⚠️  Fehler beim Speichern: {}", e);
                    }
                } else {
                    println!("❌ Pseudonym kann nicht leer sein!");
                }
            }
            "5" => {
                println!("\n📶 Netzwerk-Status:");
                println!("📊 {} Posts lokal", data.posts.len());
                println!("🔇 {} stummgeschaltete Benutzer", data.muted_users.len());
                println!("🌐 I2P-Netzwerk: Nicht verfügbar (Demo-Modus)");
                println!("📱 QR-Code-Scanning: Nicht verfügbar (Demo-Modus)");
                println!("💾 Persistenz: Aktiv (brezn_data.json)");
            }
            "6" => {
                println!("💾 Speichere Daten...");
                if let Err(e) = data.save() {
                    println!("⚠️  Fehler beim Speichern: {}", e);
                } else {
                    println!("✅ Daten erfolgreich gespeichert!");
                }
                println!("👋 Auf Wiedersehen!");
                break;
            }
            _ => {
                println!("❌ Ungültige Option!");
            }
        }
    }
}
