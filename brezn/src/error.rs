use thiserror::Error;
use std::io;

#[derive(Error, Debug)]
pub enum BreznError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),
    
    #[error("Network error: {0}")]
    Network(#[from] io::Error),
    
    #[error("Crypto error: {0}")]
    Crypto(String),
    
    #[error("Tor error: {0}")]
    Tor(String),
    
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
    
    #[error("Configuration error: {0}")]
    Config(String),
    
    #[error("Invalid input: {0}")]
    InvalidInput(String),
    
    #[error("Generic error: {0}")]
    Generic(String),
}

pub type Result<T> = std::result::Result<T, BreznError>;