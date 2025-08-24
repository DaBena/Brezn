// Removed unused import
use thiserror::Error;

pub type Result<T> = std::result::Result<T, BreznError>;

#[derive(Error, Debug)]
pub enum BreznError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),
    
    #[error("Network error: {0}")]
    Network(String),
    
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
    
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
    
    #[error("Discovery error: {0}")]
    Discovery(String),
    
    #[error("QR code error: {0}")]
    QrCode(String),
    
    #[error("Configuration error: {0}")]
    Config(String),
    
    #[error("Generic error: {0}")]
    Generic(String),
}

// Display implementation is already provided by thiserror::Error derive