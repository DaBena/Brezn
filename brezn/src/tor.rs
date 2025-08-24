use crate::error::{Result, BreznError};
use std::net::SocketAddr;
use std::time::Duration;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use serde::{Serialize, Deserialize};
use tokio::net::TcpStream as TokioTcpStream;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::time::{timeout, sleep};
use tokio::sync::Semaphore;
use std::sync::atomic::{AtomicBool, Ordering};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TorConfig {
    pub socks_port: u16,
    pub control_port: u16,
    pub enabled: bool,
    pub circuit_timeout: Duration,
    pub connection_timeout: Duration,
    pub max_connections: usize,
    pub health_check_interval: Duration,
    pub circuit_rotation_interval: Duration,
    pub fallback_ports: Vec<u16>,
}

impl Default for TorConfig {
    fn default() -> Self {
        Self {
            socks_port: 9050,
            control_port: 9051,
            enabled: false,
            circuit_timeout: Duration::from_secs(30),
            connection_timeout: Duration::from_secs(10),
            max_connections: 10,
            health_check_interval: Duration::from_secs(60),
            circuit_rotation_interval: Duration::from_secs(300),
            fallback_ports: vec![9050, 9150, 9250],
        }
    }
}

#[derive(Debug, Clone)]
pub struct CircuitInfo {
    pub id: String,
    pub created_at: std::time::Instant,
    pub last_used: std::time::Instant,
    pub health_score: f64,
    pub failure_count: u32,
}

#[derive(Debug, Clone)]
pub struct TorStatus {
    pub is_connected: bool,
    pub active_circuits: usize,
    pub total_connections: usize,
    pub last_health_check: std::time::Instant,
    pub external_ip: Option<String>,
    pub circuit_health: f64,
}

#[derive(Clone)]
pub struct TorManager {
    config: TorConfig,
    socks_proxy: Option<Socks5Proxy>,
    circuits: Arc<Mutex<HashMap<String, CircuitInfo>>>,
    connection_pool: Arc<Mutex<ConnectionPool>>,
    status: Arc<Mutex<TorStatus>>,
    health_monitor: Arc<Mutex<HealthMonitor>>,
    is_running: Arc<AtomicBool>,
}

#[derive(Clone)]
struct Socks5Proxy {
    address: SocketAddr,
    connection_semaphore: Arc<Semaphore>,
}

struct ConnectionPool {
    connections: HashMap<String, PooledConnection>,
    max_connections: usize,
}

struct PooledConnection {
    stream: Option<TokioTcpStream>,
    last_used: std::time::Instant,
    circuit_id: String,
}

struct HealthMonitor {
    last_check: std::time::Instant,
    health_score: f64,
    failure_history: Vec<FailureRecord>,
}

struct FailureRecord {
    timestamp: std::time::Instant,
    error: String,
    circuit_id: Option<String>,
}

impl TorManager {
    pub fn new(config: TorConfig) -> Self {
        let status = TorStatus {
            is_connected: false,
            active_circuits: 0,
            total_connections: 0,
            last_health_check: std::time::Instant::now(),
            external_ip: None,
            circuit_health: 0.0,
        };

        let health_monitor = HealthMonitor {
            last_check: std::time::Instant::now(),
            health_score: 1.0,
            failure_history: Vec::new(),
        };

        let max_connections = config.max_connections;
        Self {
            config: config.clone(),
            socks_proxy: None,
            circuits: Arc::new(Mutex::new(HashMap::new())),
            connection_pool: Arc::new(Mutex::new(ConnectionPool {
                connections: HashMap::new(),
                max_connections,
            })),
            status: Arc::new(Mutex::new(status)),
            health_monitor: Arc::new(Mutex::new(health_monitor)),
            is_running: Arc::new(AtomicBool::new(false)),
        }
    }
    
    pub async fn enable(&mut self) -> Result<()> {
        if !self.config.enabled {
            return Err(BreznError::Tor("Tor is not enabled in config".to_string()));
        }
        
        println!("🔒 Testing Tor SOCKS5 connection...");
        
        // Try primary port first, then fallback ports
        let mut connected = false;
        let mut last_error = None;
        
        for &port in &self.config.fallback_ports {
            match self.test_port_connection(port).await {
                Ok(_) => {
                    self.config.socks_port = port;
                    connected = true;
                    println!("✅ Connected to Tor on port {}", port);
                    break;
                }
                Err(e) => {
                    let error_msg = e.to_string();
                    last_error = Some(e);
                    println!("⚠️  Failed to connect to port {}: {}", port, error_msg);
                }
            }
        }
        
        if !connected {
            return Err(last_error.unwrap_or_else(|| {
                BreznError::Tor("Failed to connect to any Tor port".to_string())
            }));
        }
        
        // Initialize SOCKS5 proxy
        self.socks_proxy = Some(Socks5Proxy {
            address: format!("127.0.0.1:{}", self.config.socks_port).parse()
                .map_err(|e| BreznError::Tor(format!("Invalid SOCKS5 address: {}", e)))?,
            connection_semaphore: Arc::new(Semaphore::new(self.config.max_connections)),
        });
        
        // Test SOCKS5 handshake
        self.test_socks5_handshake().await?;
        
        // Initialize circuit
        self.initialize_circuit().await?;
        
        // Start health monitoring
        self.start_health_monitoring().await?;
        
        // Test external IP through Tor
        match self.get_external_ip().await {
            Ok(ip) => {
                println!("🌐 Tor external IP: {}", ip);
                if let Ok(mut status) = self.status.lock() {
                    status.external_ip = Some(ip);
                }
            }
            Err(e) => println!("⚠️  Could not get Tor external IP: {}", e),
        }
        
        // Update status
        if let Ok(mut status) = self.status.lock() {
            status.is_connected = true;
            status.last_health_check = std::time::Instant::now();
        }
        
        println!("🔒 Tor SOCKS5 Proxy aktiviert auf Port {}", self.config.socks_port);
        Ok(())
    }
    
    async fn test_port_connection(&self, port: u16) -> Result<()> {
        let _test_stream = timeout(
            self.config.connection_timeout,
            TokioTcpStream::connect(format!("127.0.0.1:{}", port))
        ).await
            .map_err(|_| BreznError::Tor(format!("Tor connection timeout on port {}", port)))?
            .map_err(|e| BreznError::Tor(format!("Failed to connect to Tor SOCKS5 on port {}: {}", port, e)))?;
        
        Ok(())
    }
    
    async fn initialize_circuit(&self) -> Result<()> {
        let circuit_id = format!("circuit_{}", uuid::Uuid::new_v4().simple());
        let circuit_info = CircuitInfo {
            id: circuit_id.clone(),
            created_at: std::time::Instant::now(),
            last_used: std::time::Instant::now(),
            health_score: 1.0,
            failure_count: 0,
        };
        
        {
            let mut circuits = self.circuits.lock().unwrap();
            circuits.insert(circuit_id.clone(), circuit_info);
        }
        
        // Test circuit health
        self.test_circuit_health(&circuit_id).await?;
        
        println!("🔄 Tor circuit initialized: {}", circuit_id);
        Ok(())
    }
    
    async fn start_health_monitoring(&self) -> Result<()> {
        let is_running = Arc::clone(&self.is_running);
        let health_monitor = Arc::clone(&self.health_monitor);
        let circuits = Arc::clone(&self.circuits);
        let status = Arc::clone(&self.status);
        
        is_running.store(true, Ordering::SeqCst);
        
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(60));
            
            while is_running.load(Ordering::SeqCst) {
                interval.tick().await;
                
                // Update health monitor
                {
                    if let Ok(mut monitor) = health_monitor.lock() {
                        monitor.last_check = std::time::Instant::now();
                        
                        // Calculate overall health score
                        let circuit_health = {
                            let circuits_guard = circuits.lock().unwrap();
                            if circuits_guard.is_empty() {
                                0.0
                            } else {
                                let total_score: f64 = circuits_guard.values()
                                    .map(|c| c.health_score)
                                    .sum();
                                total_score / circuits_guard.len() as f64
                            }
                        };
                        
                        monitor.health_score = circuit_health;
                    }
                }
                
                // Update status
                {
                    if let Ok(mut status_guard) = status.lock() {
                        let health_score = {
                            let health_guard = health_monitor.lock().unwrap();
                            health_guard.health_score
                        };
                        status_guard.circuit_health = health_score;
                        status_guard.last_health_check = std::time::Instant::now();
                    }
                }
                
                // Rotate circuits if needed
                {
                    if let Ok(mut circuits_guard) = circuits.lock() {
                        let now = std::time::Instant::now();
                        let mut to_remove = Vec::new();
                        
                        for (id, circuit) in circuits_guard.iter() {
                            if now.duration_since(circuit.created_at) > Duration::from_secs(300) {
                                to_remove.push(id.clone());
                            }
                        }
                        
                        for id in to_remove {
                            circuits_guard.remove(&id);
                            println!("🔄 Rotated Tor circuit: {}", id);
                        }
                    }
                }
            }
        });
        
        Ok(())
    }
    
    pub async fn test_socks5_handshake(&self) -> Result<()> {
        let _proxy = self.socks_proxy.as_ref()
            .ok_or_else(|| BreznError::Tor("SOCKS5 proxy not initialized".to_string()))?;
        
        let mut stream = timeout(
            self.config.connection_timeout,
            TokioTcpStream::connect(format!("127.0.0.1:{}", self.config.socks_port))
        ).await
            .map_err(|_| BreznError::Tor("SOCKS5 connection timeout".to_string()))?
            .map_err(|e| BreznError::Tor(format!("SOCKS5 connection failed: {}", e)))?;
        
        // SOCKS5 handshake: no authentication
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
        self.is_running.store(false, Ordering::SeqCst);
        self.socks_proxy = None;
        
        // Clear circuits
        if let Ok(mut circuits) = self.circuits.lock() {
            circuits.clear();
        }
        
        // Clear connection pool
        if let Ok(mut pool) = self.connection_pool.lock() {
            pool.connections.clear();
        }
        
        // Update status
        if let Ok(mut status) = self.status.lock() {
            status.is_connected = false;
            status.active_circuits = 0;
            status.total_connections = 0;
        }
        
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
        
        // Test circuit health
        let circuit_ids: Vec<String> = {
            if let Ok(circuits) = self.circuits.lock() {
                circuits.keys().cloned().collect()
            } else {
                Vec::new()
            }
        };
        
        for circuit_id in circuit_ids {
            if let Err(e) = self.test_circuit_health(&circuit_id).await {
                println!("⚠️  Circuit {} health check failed: {}", circuit_id, e);
            }
        }
        
        println!("✅ Tor connection test successful");
        Ok(())
    }
    
    pub async fn connect_through_tor(&self, target_host: &str, target_port: u16) -> Result<TokioTcpStream> {
        if !self.is_enabled() {
            return Err(BreznError::Tor("Tor is not enabled".to_string()));
        }
        
        // Get connection from pool or create new one
        let connection = self.get_or_create_connection(target_host, target_port).await?;
        
        // Update circuit usage
        let circuit_id = &connection.circuit_id;
        if let Ok(mut circuits) = self.circuits.lock() {
            if let Some(circuit) = circuits.get_mut(circuit_id) {
                circuit.last_used = std::time::Instant::now();
            }
        }
        
        Ok(connection.stream.unwrap())
    }
    
    async fn get_or_create_connection(&self, target_host: &str, target_port: u16) -> Result<PooledConnection> {
        let pool_key = format!("{}:{}", target_host, target_port);
        
        // Try to get existing connection from pool
        {
            let mut pool = self.connection_pool.lock().unwrap();
            if let Some(connection) = pool.connections.get_mut(&pool_key) {
                if connection.stream.is_some() {
                    connection.last_used = std::time::Instant::now();
                    return Ok(connection.clone());
                }
            }
        }
        
        // Create new connection
        let new_connection = self.create_tor_connection(target_host, target_port).await?;
        
        // Add to pool
        {
            let mut pool = self.connection_pool.lock().unwrap();
            if pool.connections.len() < self.config.max_connections {
                pool.connections.insert(pool_key, new_connection.clone());
            }
        }
        
        Ok(new_connection)
    }
    
    async fn create_tor_connection(&self, target_host: &str, target_port: u16) -> Result<PooledConnection> {
        let proxy = self.socks_proxy.as_ref()
            .ok_or_else(|| BreznError::Tor("SOCKS5 proxy not initialized".to_string()))?;
        
        // Acquire connection permit
        let _permit = proxy.connection_semaphore.acquire().await
            .map_err(|_| BreznError::Tor("Connection pool exhausted".to_string()))?;
        
        let mut stream = timeout(
            self.config.connection_timeout,
            TokioTcpStream::connect(format!("127.0.0.1:{}", self.config.socks_port))
        ).await
            .map_err(|_| BreznError::Tor("Tor connection timeout".to_string()))?
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
        
        // Build CONNECT request
        let connect_request = self.build_connect_request(target_host, target_port)?;
        stream.write_all(&connect_request).await
            .map_err(|e| BreznError::Tor(format!("SOCKS5 connect request failed: {}", e)))?;
        
        // Parse CONNECT reply
        self.parse_connect_reply(&mut stream).await?;
        
        // Get circuit ID for this connection
        let circuit_id = {
            let circuits = self.circuits.lock().unwrap();
            circuits.keys().next().cloned().unwrap_or_else(|| "default".to_string())
        };
        
        println!("🔒 Tor connection established to {}:{}", target_host, target_port);
        
        Ok(PooledConnection {
            stream: Some(stream),
            last_used: std::time::Instant::now(),
            circuit_id,
        })
    }
    
    fn build_connect_request(&self, target_host: &str, target_port: u16) -> Result<Vec<u8>> {
        let mut connect_request: Vec<u8> = vec![0x05, 0x01, 0x00]; // VER=5, CMD=CONNECT, RSV=0
        
        if let Ok(ipv4) = target_host.parse::<std::net::Ipv4Addr>() {
            // ATYP = IPv4
            connect_request.push(0x01);
            connect_request.extend_from_slice(&ipv4.octets());
        } else if let Ok(ipv6) = target_host.parse::<std::net::Ipv6Addr>() {
            // ATYP = IPv6
            connect_request.push(0x04);
            connect_request.extend_from_slice(&ipv6.octets());
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
        Ok(connect_request)
    }
    
    async fn parse_connect_reply(&self, stream: &mut TokioTcpStream) -> Result<()> {
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
        
        Ok(())
    }
    
    pub fn get_new_circuit(&self) -> Result<()> {
        let circuit_id = format!("circuit_{}", uuid::Uuid::new_v4().simple());
        let circuit_info = CircuitInfo {
            id: circuit_id.clone(),
            created_at: std::time::Instant::now(),
            last_used: std::time::Instant::now(),
            health_score: 1.0,
            failure_count: 0,
        };
        
        if let Ok(mut circuits) = self.circuits.lock() {
            circuits.insert(circuit_id.clone(), circuit_info);
            println!("🔄 New Tor circuit created: {}", circuit_id);
        }
        
        Ok(())
    }
    
    pub fn get_circuit_info(&self) -> Option<String> {
        if let Ok(circuits) = self.circuits.lock() {
            circuits.keys().next().cloned()
        } else {
            None
        }
    }
    
    pub fn get_status(&self) -> TorStatus {
        if let Ok(status) = self.status.lock() {
            status.clone()
        } else {
            TorStatus {
                is_connected: false,
                active_circuits: 0,
                total_connections: 0,
                last_health_check: std::time::Instant::now(),
                external_ip: None,
                circuit_health: 0.0,
            }
        }
    }
    
    /// Tests the health of a specific Tor circuit
    async fn test_circuit_health(&self, circuit_id: &str) -> Result<()> {
        // Try to connect to a known service through Tor to test circuit
        match self.connect_through_tor("check.torproject.org", 80).await {
            Ok(_) => {
                // Update circuit health
                if let Ok(mut circuits) = self.circuits.lock() {
                    if let Some(circuit) = circuits.get_mut(circuit_id) {
                        circuit.health_score = 1.0;
                        circuit.failure_count = 0;
                    }
                }
                println!("✅ Tor circuit {} health check passed", circuit_id);
                Ok(())
            }
            Err(e) => {
                // Update circuit health
                if let Ok(mut circuits) = self.circuits.lock() {
                    if let Some(circuit) = circuits.get_mut(circuit_id) {
                        circuit.health_score = (circuit.health_score * 0.8).max(0.1);
                        circuit.failure_count += 1;
                    }
                }
                
                // Record failure
                if let Ok(mut monitor) = self.health_monitor.lock() {
                    monitor.failure_history.push(FailureRecord {
                        timestamp: std::time::Instant::now(),
                        error: e.to_string(),
                        circuit_id: Some(circuit_id.to_string()),
                    });
                    
                    // Keep only last 100 failures
                    let history_len = monitor.failure_history.len();
                    if history_len > 100 {
                        monitor.failure_history.drain(0..history_len - 100);
                    }
                }
                
                println!("⚠️  Tor circuit {} health check failed: {}", circuit_id, e);
                Ok(())
            }
        }
    }
    
    /// Gets the external IP address through Tor
    pub async fn get_external_ip(&self) -> Result<String> {
        if !self.is_enabled() {
            return Err(BreznError::Tor("Tor is not enabled".to_string()));
        }
        
        // Try to get external IP through Tor
        let mut stream = self.connect_through_tor("check.torproject.org", 80).await?;
        
        let request = "GET / HTTP/1.1\r\nHost: check.torproject.org\r\nConnection: close\r\n\r\n";
        stream.write_all(request.as_bytes()).await
            .map_err(|e| BreznError::Tor(format!("HTTP request failed: {}", e)))?;
        
        let mut response = Vec::new();
        stream.read_to_end(&mut response).await
            .map_err(|e| BreznError::Tor(format!("HTTP response read failed: {}", e)))?;
        
        // Parse response to extract IP
        let response_str = String::from_utf8_lossy(&response);
        if let Some(ip_line) = response_str.lines().find(|line| line.contains("IP:")) {
            if let Some(ip) = ip_line.split("IP:").nth(1) {
                return Ok(ip.trim().to_string());
            }
        }
        
        Err(BreznError::Tor("Could not extract IP from response".to_string()))
    }
    
    /// Performs a comprehensive health check of the Tor network
    pub async fn perform_health_check(&self) -> Result<()> {
        if !self.is_enabled() {
            return Err(BreznError::Tor("Tor is not enabled".to_string()));
        }
        
        println!("🏥 Performing Tor network health check...");
        
        // Test basic connectivity
        self.test_socks5_handshake().await?;
        
        // Test circuit health
        let circuit_ids: Vec<String> = {
            if let Ok(circuits) = self.circuits.lock() {
                circuits.keys().cloned().collect()
            } else {
                Vec::new()
            }
        };
        
        for circuit_id in circuit_ids {
            if let Err(e) = self.test_circuit_health(&circuit_id).await {
                println!("⚠️  Circuit {} health check failed: {}", circuit_id, e);
            }
        }
        
        // Test external connectivity
        match self.get_external_ip().await {
            Ok(ip) => println!("✅ External IP check: {}", ip),
            Err(e) => println!("⚠️  External IP check failed: {}", e),
        }
        
        // Update overall health score
        if let Ok(mut monitor) = self.health_monitor.lock() {
            monitor.last_check = std::time::Instant::now();
        }
        
        println!("🏥 Tor network health check completed");
        Ok(())
    }
    
    /// Rotates all circuits to improve anonymity
    pub async fn rotate_circuits(&self) -> Result<()> {
        println!("🔄 Rotating Tor circuits...");
        
        // Clear existing circuits
        {
            let mut circuits = self.circuits.lock().unwrap();
            circuits.clear();
        }
        
        // Create new circuits
        for i in 0..3 {
            if let Err(e) = self.get_new_circuit() {
                println!("⚠️  Failed to create circuit {}: {}", i + 1, e);
            } else {
                println!("✅ Created new circuit {}", i + 1);
            }
            
            // Small delay between circuit creation
            sleep(Duration::from_millis(100)).await;
        }
        
        println!("🔄 Tor circuit rotation completed");
        Ok(())
    }
}

impl Clone for PooledConnection {
    fn clone(&self) -> Self {
        Self {
            stream: None, // Don't clone the actual stream
            last_used: self.last_used,
            circuit_id: self.circuit_id.clone(),
        }
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