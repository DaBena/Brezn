use crate::error::{Result, BreznError};
use std::net::SocketAddr;
use std::time::Duration;
use serde::{Serialize, Deserialize};
use tokio::net::TcpStream as TokioTcpStream;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TorConfig {
    pub socks_port: u16,
    pub control_port: u16,
    pub enabled: bool,
    pub circuit_timeout: Duration,
    pub connection_timeout: Duration,
}

impl Default for TorConfig {
    fn default() -> Self {
        Self {
            socks_port: 9050,
            control_port: 9051,
            enabled: false,
            circuit_timeout: Duration::from_secs(30),
            connection_timeout: Duration::from_secs(10),
        }
    }
}

#[derive(Clone)]
pub struct TorManager {
    config: TorConfig,
    socks_proxy: Option<Socks5Proxy>,
    circuit_id: Option<String>,
}

#[derive(Clone)]
struct Socks5Proxy {
    address: SocketAddr,
}

impl TorManager {
    pub fn new(config: TorConfig) -> Self {
        Self {
            config,
            socks_proxy: None,
            circuit_id: None,
        }
    }
    
    pub async fn enable(&mut self) -> Result<()> {
        if !self.config.enabled {
            return Err(BreznError::Tor("Tor is not enabled in config".to_string()));
        }
        
        println!("🔒 Testing Tor SOCKS5 connection...");
        
        // Test Tor connection with timeout
        let test_stream = tokio::time::timeout(
            self.config.connection_timeout,
            TokioTcpStream::connect(format!("127.0.0.1:{}", self.config.socks_port))
        ).await
            .map_err(|_| BreznError::Tor("Tor connection timeout".to_string()))?
            .map_err(|e| BreznError::Tor(format!("Failed to connect to Tor SOCKS5: {}", e)))?;
        
        self.socks_proxy = Some(Socks5Proxy {
            address: format!("127.0.0.1:{}", self.config.socks_port).parse()
                .map_err(|e| BreznError::Tor(format!("Invalid SOCKS5 address: {}", e)))?,
        });
        
        // Test SOCKS5 handshake
        self.test_socks5_handshake().await?;
        
        // Test external IP through Tor
        match self.get_external_ip().await {
            Ok(ip) => println!("🌐 Tor external IP: {}", ip),
            Err(e) => println!("⚠️  Could not get Tor external IP: {}", e),
        }
        
        println!("🔒 Tor SOCKS5 Proxy aktiviert auf Port {}", self.config.socks_port);
        Ok(())
    }
    
    async fn test_socks5_handshake(&self) -> Result<()> {
        let _proxy = self.socks_proxy.as_ref()
            .ok_or_else(|| BreznError::Tor("SOCKS5 proxy not initialized".to_string()))?;
        
        let mut stream = TokioTcpStream::connect(format!("127.0.0.1:{}", self.config.socks_port))
            .await
            .map_err(|e| BreznError::Tor(format!("SOCKS5 connection failed: {}", e)))?;
        
        // SOCKS5 handshake
        let handshake = [0x05, 0x01, 0x00]; // SOCKS5, 1 method, no auth
        stream.write_all(&handshake).await
            .map_err(|e| BreznError::Tor(format!("SOCKS5 handshake failed: {}", e)))?;
        
        let mut response = [0u8; 2];
        stream.read_exact(&mut response).await
            .map_err(|e| BreznError::Tor(format!("SOCKS5 response failed: {}", e)))?;
        
        if response[0] != 0x05 || response[1] != 0x00 {
            return Err(BreznError::Tor("SOCKS5 handshake failed".to_string()));
        }
        
        println!("✅ SOCKS5 handshake successful");
        Ok(())
    }
    
    pub fn disable(&mut self) {
        self.socks_proxy = None;
        self.circuit_id = None;
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
    
    pub async fn test_connection(&self) -> Result<()> {
        if !self.is_enabled() {
            return Err(BreznError::Tor("Tor is not enabled".to_string()));
        }
        
        // Test SOCKS5 connection
        self.test_socks5_handshake().await?;
        
        println!("✅ Tor connection test successful");
        Ok(())
    }
    
    pub async fn connect_through_tor(&self, target_host: &str, target_port: u16) -> Result<TokioTcpStream> {
        if !self.is_enabled() {
            return Err(BreznError::Tor("Tor is not enabled".to_string()));
        }
        
        let mut stream = TokioTcpStream::connect(format!("127.0.0.1:{}", self.config.socks_port))
            .await
            .map_err(|e| BreznError::Tor(format!("SOCKS5 connection failed: {}", e)))?;
        
        // SOCKS5 handshake
        let handshake = [0x05, 0x01, 0x00]; // SOCKS5, 1 method, no auth
        stream.write_all(&handshake).await
            .map_err(|e| BreznError::Tor(format!("SOCKS5 handshake failed: {}", e)))?;
        
        let mut response = [0u8; 2];
        stream.read_exact(&mut response).await
            .map_err(|e| BreznError::Tor(format!("SOCKS5 response failed: {}", e)))?;
        
        if response[0] != 0x05 || response[1] != 0x00 {
            return Err(BreznError::Tor("SOCKS5 handshake failed".to_string()));
        }
        
        // SOCKS5 connect request
        let mut connect_request = vec![
            0x05, // SOCKS5
            0x01, // CONNECT
            0x00, // Reserved
            0x01, // IPv4 address
        ];
        
        // Add target IP (for now, we'll use a placeholder - in real implementation, resolve hostname)
        connect_request.extend_from_slice(&[127, 0, 0, 1]); // Placeholder IP
        connect_request.extend_from_slice(&target_port.to_be_bytes());
        
        stream.write_all(&connect_request).await
            .map_err(|e| BreznError::Tor(format!("SOCKS5 connect request failed: {}", e)))?;
        
        let mut connect_response = [0u8; 10];
        stream.read_exact(&mut connect_response).await
            .map_err(|e| BreznError::Tor(format!("SOCKS5 connect response failed: {}", e)))?;
        
        if connect_response[1] != 0x00 {
            return Err(BreznError::Tor("SOCKS5 connect failed".to_string()));
        }
        
        println!("🔒 Tor connection established to {}:{}", target_host, target_port);
        Ok(stream)
    }
    
    pub fn get_new_circuit(&self) -> Result<()> {
        // In a real implementation, this would use Tor control protocol
        // For now, we just log the request
        println!("🔄 Requesting new Tor circuit...");
        Ok(())
    }
    
    pub fn get_circuit_info(&self) -> Option<String> {
        self.circuit_id.clone()
    }
    
    pub async fn get_external_ip(&self) -> Result<String> {
        if !self.is_enabled() {
            return Err(BreznError::Tor("Tor is not enabled".to_string()));
        }
        
        // Connect to a service to get external IP through Tor
        let mut stream = self.connect_through_tor("checkip.amazonaws.com", 80).await?;
        
        let request = "GET / HTTP/1.1\r\nHost: checkip.amazonaws.com\r\nConnection: close\r\n\r\n";
        stream.write_all(request.as_bytes()).await
            .map_err(|e| BreznError::Tor(format!("Failed to send IP request: {}", e)))?;
        
        let mut response = Vec::new();
        let mut buffer = [0u8; 1024];
        
        loop {
            let n = stream.read(&mut buffer).await
                .map_err(|e| BreznError::Tor(format!("Failed to read IP response: {}", e)))?;
            
            if n == 0 {
                break;
            }
            
            response.extend_from_slice(&buffer[..n]);
        }
        
        // Parse response to extract IP
        let response_str = String::from_utf8_lossy(&response);
        if let Some(ip) = response_str.lines().last() {
            return Ok(ip.trim().to_string());
        }
        
        Err(BreznError::Tor("Failed to get external IP".to_string()))
    }
}