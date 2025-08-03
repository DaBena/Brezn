use std::io::{self, Write};

fn main() {
    println!("🥨 Willkommen bei Brezn!");
    println!("Eine dezentrale Feed-App (Demo-Version)");
    println!("{}", "=".repeat(50));

    let mut posts = vec![
        "Willkommen bei Brezn! 🥨".to_string(),
        "Das ist ein anonymer Post!".to_string()
    ];

    let mut pseudonym = "AnonymBrezn42".to_string();
    let mut muted_users = std::collections::HashSet::new();
    
    loop {
        println!("\n📋 Menü:");
        println!("1. Feed anzeigen");
        println!("2. Neuen Post erstellen");
        println!("3. Neues Pseudonym generieren");
        println!("4. Benutzer stummschalten");
        println!("5. Netzwerk-Status");
        println!("6. Beenden");
        println!("Aktuelles Pseudonym: {}", pseudonym);
        print!("Wähle eine Option (1-6): ");
        io::stdout().flush().unwrap();
        
        let mut input = String::new();
        io::stdin().read_line(&mut input).unwrap();
        let choice = input.trim();

        match choice {
            "1" => {
                println!("\n🥨 Brezn Feed");
                println!("{}", "=".repeat(50));
                
                for (i, post) in posts.iter().enumerate() {
                    if !muted_users.contains(&format!("user_{}", i)) {
                        println!("👤 {} • vor {}min", pseudonym, i + 1);
                        println!("📝 {}", post);
                        println!("🔗 ID: {}", i + 1);
                        println!("{}", "-".repeat(30));
                    }
                }
            }
            "2" => {
                print!("Gib deinen Post ein: ");
                io::stdout().flush().unwrap();
                let mut content = String::new();
                io::stdin().read_line(&mut content).unwrap();
                let content = content.trim().to_string();
                
                if !content.is_empty() {
                    posts.insert(0, content);
                    println!("✅ Post erfolgreich erstellt!");
                } else {
                    println!("❌ Post kann nicht leer sein!");
                }
            }
            "3" => {
                let random_num = (std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos() % 9999) as u32;
                pseudonym = format!("AnonymBrezn{}", random_num);
                println!("🎲 Neues Pseudonym: {}", pseudonym);
            }
            "4" => {
                print!("Pseudonym zum Stummschalten: ");
                io::stdout().flush().unwrap();
                let mut pseudonym_to_mute = String::new();
                io::stdin().read_line(&mut pseudonym_to_mute).unwrap();
                let pseudonym_to_mute = pseudonym_to_mute.trim();
                
                if !pseudonym_to_mute.is_empty() {
                    muted_users.insert(pseudonym_to_mute.to_string());
                    println!("🔇 {} wurde stummgeschaltet.", pseudonym_to_mute);
                } else {
                    println!("❌ Pseudonym kann nicht leer sein!");
                }
            }
            "5" => {
                println!("\n📶 Netzwerk-Status:");
                println!("📊 {} Posts lokal", posts.len());
                println!("🔇 {} stummgeschaltete Benutzer", muted_users.len());
                println!("🌐 I2P-Netzwerk: Nicht verfügbar (Demo-Modus)");
                println!("📱 QR-Code-Scanning: Nicht verfügbar (Demo-Modus)");
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
