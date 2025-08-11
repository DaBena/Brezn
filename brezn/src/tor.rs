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
    _address: SocketAddr,
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
        let _test_stream = tokio::time::timeout(
            self.config.connection_timeout,
            TokioTcpStream::connect(format!("127.0.0.1:{}", self.config.socks_port))
        ).await
            .map_err(|_| BreznError::Tor("Tor connection timeout".to_string()))?
            .map_err(|e| BreznError::Tor(format!("Failed to connect to Tor SOCKS5: {}", e)))?;
        
        self.socks_proxy = Some(Socks5Proxy {
            _address: format!("127.0.0.1:{}", self.config.socks_port).parse()
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
        
        // SOCKS5 handshake: no authentication
        let handshake = [0x05, 0x01, 0x00];
        stream.write_all(&handshake).await
            .map_err(|e| BreznError::Tor(format!("SOCKS5 handshake failed: {}", e)))?;
        
        let mut response = [0u8; 2];
        stream.read_exact(&mut response).await
            .map_err(|e| BreznError::Tor(format!("SOCKS5 response failed: {}", e)))?;
        if response[0] != 0x05 || response[1] != 0x00 {
            return Err(BreznError::Tor("SOCKS5 handshake failed".to_string()));
        }
        
        // Build CONNECT request supporting IPv4 literal or domain name
        let mut connect_request: Vec<u8> = vec![0x05, 0x01, 0x00]; // VER=5, CMD=CONNECT, RSV=0
        if let Ok(ipv4) = target_host.parse::<std::net::Ipv4Addr>() {
            // ATYP = IPv4
            connect_request.push(0x01);
            connect_request.extend_from_slice(&ipv4.octets());
        } else {
            // ATYP = DOMAIN
            connect_request.push(0x03);
            let host_bytes = target_host.as_bytes();
            if host_bytes.len() > 255 {
                return Err(BreznError::Tor("Hostname too long for SOCKS5".to_string()));
            }
            connect_request.push(host_bytes.len() as u8);
            connect_request.extend_from_slice(host_bytes);
        }
        connect_request.extend_from_slice(&target_port.to_be_bytes());
        
        stream.write_all(&connect_request).await
            .map_err(|e| BreznError::Tor(format!("SOCKS5 connect request failed: {}", e)))?;
        
        // Parse CONNECT reply: VER, REP, RSV, ATYP, BND.ADDR, BND.PORT
        let mut head = [0u8; 4];
        stream.read_exact(&mut head).await
            .map_err(|e| BreznError::Tor(format!("SOCKS5 connect response header failed: {}", e)))?;
        if head[0] != 0x05 {
            return Err(BreznError::Tor("Invalid SOCKS5 version in reply".to_string()));
        }
        if head[1] != 0x00 {
            return Err(BreznError::Tor(format!("SOCKS5 connect failed (REP={:#04x})", head[1])));
        }
        let atyp = head[3];
        match atyp {
            0x01 => {
                // IPv4 addr (4) + port (2)
                let mut buf = [0u8; 6];
                stream.read_exact(&mut buf).await
                    .map_err(|e| BreznError::Tor(format!("SOCKS5 IPv4 bind read failed: {}", e)))?;
            }
            0x03 => {
                // DOMAIN: 1 len + addr + port (2)
                let mut len_buf = [0u8; 1];
                stream.read_exact(&mut len_buf).await
                    .map_err(|e| BreznError::Tor(format!("SOCKS5 domain length read failed: {}", e)))?;
                let len = len_buf[0] as usize;
                let mut domain_buf = vec![0u8; len + 2];
                stream.read_exact(&mut domain_buf).await
                    .map_err(|e| BreznError::Tor(format!("SOCKS5 domain bind read failed: {}", e)))?;
            }
            0x04 => {
                // IPv6 addr (16) + port (2)
                let mut buf = [0u8; 18];
                stream.read_exact(&mut buf).await
                    .map_err(|e| BreznError::Tor(format!("SOCKS5 IPv6 bind read failed: {}", e)))?;
            }
            _ => return Err(BreznError::Tor("Unknown ATYP in SOCKS5 reply".to_string())),
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

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_default_config_and_disable() {
        let mut cfg = TorConfig::default();
        assert_eq!(cfg.socks_port, 9050);
        assert!(!cfg.enabled);

        let mut manager = TorManager::new(cfg.clone());
        assert!(!manager.is_enabled());
        assert!(manager.get_socks_url().is_none());

        manager.disable();
        assert!(!manager.is_enabled());
    }

    #[tokio::test]
    async fn test_get_socks_url_when_enabled_flag_set_but_not_initialized() {
        // Note: enable() requires real Tor. We only verify get_socks_url returns formatted URL
        // after we simulate that socks_proxy would be present by calling disable/then checking None.
        let cfg = TorConfig { enabled: true, ..TorConfig::default() };
        let manager = TorManager::new(cfg);
        // Not actually enabled (no socks_proxy). get_socks_url should be None.
        assert!(manager.get_socks_url().is_none());
    }

    #[tokio::test]
    async fn test_test_connection_fails_when_not_enabled() {
        let cfg = TorConfig::default();
        let manager = TorManager::new(cfg);
        let err = manager.test_connection().await.err().expect("should fail");
        assert!(err.to_string().contains("Tor is not enabled"));
    }
}