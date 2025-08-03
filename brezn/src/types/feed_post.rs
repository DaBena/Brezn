use serde::{Deserialize, Serialize};
use uuid::Uuid;
use std::time::{SystemTime, UNIX_EPOCH};

/// Haupt-Datentyp für Feed-Posts
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct FeedPost {
    pub id: String,              // UUID
    pub content: String,         // Post-Inhalt (verschlüsselt in der Zukunft)
    pub timestamp: u64,          // Unix-Timestamp
    pub sender_pseudonym: String,// z.B. "AnonymBrezn42"
    pub signature: Vec<u8>,      // Anti-Spam-Signatur
    pub ttl: u8,                // Gossip-TTL (8 → 0)
}

impl FeedPost {
    /// Erstellt einen neuen Feed-Post
    pub fn new(content: String, sender_pseudonym: String) -> Self {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();

        Self {
            id: Uuid::new_v4().to_string(),
            content,
            timestamp,
            sender_pseudonym,
            signature: Vec::new(), // TODO: Echte Signatur implementieren
            ttl: 8, // Standard-TTL für Gossip-Protokoll
        }
    }

    /// Erstellt eine Kopie mit reduzierter TTL für Weiterleitung
    pub fn with_reduced_ttl(&self) -> Option<Self> {
        if self.ttl == 0 {
            None
        } else {
            Some(Self {
                ttl: self.ttl - 1,
                ..self.clone()
            })
        }
    }

    /// Prüft ob der Post noch gültig ist (TTL > 0)
    pub fn is_valid(&self) -> bool {
        self.ttl > 0
    }

    /// Formatiert Zeitstempel für UI-Anzeige
    pub fn formatted_time(&self) -> String {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        
        let diff = now.saturating_sub(self.timestamp);
        
        match diff {
            0..=59 => "gerade eben".to_string(),
            60..=3599 => format!("vor {}min", diff / 60),
            3600..=86399 => format!("vor {}h", diff / 3600),
            _ => format!("vor {}d", diff / 86400),
        }
    }
}

/// Netzwerk-Einladung für QR-Codes
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct NetworkInvite {
    pub bootstrap_destinations: Vec<String>, // I2P-Adressen
    pub network_name: String,                // "Mein Feed"
    pub invite_code: String,                 // Eindeutiger Code
}

impl NetworkInvite {
    /// Erstellt eine neue Netzwerk-Einladung
    pub fn new(network_name: String, bootstrap_destinations: Vec<String>) -> Self {
        Self {
            bootstrap_destinations,
            network_name,
            invite_code: Uuid::new_v4().to_string(),
        }
    }

    /// Konvertiert zu JSON für QR-Code
    pub fn to_qr_data(&self) -> anyhow::Result<String> {
        serde_json::to_string(self).map_err(Into::into)
    }

    /// Parst aus QR-Code-JSON
    pub fn from_qr_data(data: &str) -> anyhow::Result<Self> {
        serde_json::from_str(data).map_err(Into::into)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_feed_post_creation() {
        let post = FeedPost::new(
            "Test-Post".to_string(),
            "TestUser".to_string()
        );
        
        assert!(!post.id.is_empty());
        assert_eq!(post.content, "Test-Post");
        assert_eq!(post.sender_pseudonym, "TestUser");
        assert_eq!(post.ttl, 8);
        assert!(post.is_valid());
    }

    #[test]
    fn test_ttl_reduction() {
        let mut post = FeedPost::new("Test".to_string(), "User".to_string());
        post.ttl = 1;
        
        let reduced = post.with_reduced_ttl().unwrap();
        assert_eq!(reduced.ttl, 0);
        
        let none = reduced.with_reduced_ttl();
        assert!(none.is_none());
    }

    #[test]
    fn test_network_invite() {
        let invite = NetworkInvite::new(
            "Test Network".to_string(),
            vec!["test.i2p".to_string()]
        );
        
        let qr_data = invite.to_qr_data().unwrap();
        let parsed = NetworkInvite::from_qr_data(&qr_data).unwrap();
        
        assert_eq!(parsed.network_name, invite.network_name);
        assert_eq!(parsed.bootstrap_destinations, invite.bootstrap_destinations);
    }
}