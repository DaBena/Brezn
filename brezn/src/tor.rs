use crate::error::{Result, BreznError};
use std::net::{TcpStream, SocketAddr};
use std::time::Duration;
use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TorConfig {
    pub socks_port: u16,
    pub control_port: u16,
    pub enabled: bool,
    pub circuit_timeout: Duration,
}

impl Default for TorConfig {
    fn default() -> Self {
        Self {
            socks_port: 9050,
            control_port: 9051,
            enabled: false,
            circuit_timeout: Duration::from_secs(30),
        }
    }
}

pub struct TorManager {
    config: TorConfig,
    socks_proxy: Option<Socks5Proxy>,
}

struct Socks5Proxy {
    address: SocketAddr,
}

impl TorManager {
    pub fn new(config: TorConfig) -> Self {
        Self {
            config,
            socks_proxy: None,
        }
    }
    
    pub fn enable(&mut self) -> Result<()> {
        if !self.config.enabled {
            return Err(BreznError::Tor("Tor is not enabled in config".to_string()));
        }
        
        // Test Tor connection
        let test_stream = TcpStream::connect(format!("127.0.0.1:{}", self.config.socks_port))
            .map_err(|e| BreznError::Tor(format!("Failed to connect to Tor SOCKS5: {}", e)))?;
        
        self.socks_proxy = Some(Socks5Proxy {
            address: format!("127.0.0.1:{}", self.config.socks_port).parse()
                .map_err(|e| BreznError::Tor(format!("Invalid SOCKS5 address: {}", e)))?,
        });
        
        println!("🔒 Tor SOCKS5 Proxy aktiviert auf Port {}", self.config.socks_port);
        Ok(())
    }
    
    pub fn disable(&mut self) {
        self.socks_proxy = None;
        println!("🔓 Tor SOCKS5 Proxy deaktiviert");
    }
    
    pub fn is_enabled(&self) -> bool {
        self.socks_proxy.is_some()
    }
    
    pub fn get_socks_url(&self) -> Option<String> {
        self.socks_proxy.as_ref().map(|_| {
            format!("socks5://127.0.0.1:{}", self.config.socks_port)
        })
    }
    
    pub fn test_connection(&self) -> Result<()> {
        if !self.is_enabled() {
            return Err(BreznError::Tor("Tor is not enabled".to_string()));
        }
        
        // Simple connection test
        let _stream = TcpStream::connect(format!("127.0.0.1:{}", self.config.socks_port))
            .map_err(|e| BreznError::Tor(format!("Tor connection test failed: {}", e)))?;
        
        println!("✅ Tor connection test successful");
        Ok(())
    }
    
    pub fn get_new_circuit(&self) -> Result<()> {
        // In a real implementation, this would use Tor control protocol
        // For now, we just log the request
        println!("🔄 Requesting new Tor circuit...");
        Ok(())
    }
}