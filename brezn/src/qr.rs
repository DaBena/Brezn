use crate::error::{Result, BreznError};
use crate::types::QRCodeData;
use qrcode::QrCode;
use qrcode::render::svg;
use base64::{Engine as _, engine::general_purpose};
// Removed unused import

pub struct QRCodeManager {
    node_id: String,
    public_key: String,
    port: u16,
}

impl QRCodeManager {
    pub fn new(node_id: String, public_key: String, port: u16) -> Self {
        Self {
            node_id,
            public_key,
            port,
        }
    }

    /// Generate a QR code with peer connection information
    pub fn generate_peer_qr(&self) -> Result<String> {
        let local_ip = self.get_local_ip()?;
        
        let qr_data = QRCodeData {
            node_id: self.node_id.clone(),
            address: local_ip,
            port: self.port,
            public_key: self.public_key.clone(),
            network_type: "brezn".to_string(),
        };

        let json_data = serde_json::to_string(&qr_data)?;
        
        // Generate QR code
        let code = QrCode::new(&json_data)
            .map_err(|e| BreznError::QrCode(format!("Failed to generate QR code: {}", e)))?;
        
        // Render as SVG
        let svg = code.render::<svg::Color>()
            .min_dimensions(200, 200)
            .build();
        
        // Encode as base64 for easy transport
        let encoded = general_purpose::STANDARD.encode(svg.as_bytes());
        
        println!("✅ Generated QR code for peer connection");
        Ok(encoded)
    }

    /// Parse a QR code string and extract peer information
    pub fn parse_peer_qr(&self, qr_data: &str) -> Result<QRCodeData> {
        // Try to decode base64 first
        let decoded_data = if let Ok(decoded) = general_purpose::STANDARD.decode(qr_data) {
            String::from_utf8(decoded)
                .map_err(|e| BreznError::QrCode(format!("Invalid UTF-8 in QR data: {}", e)))?
        } else {
            // Assume it's already plain text JSON
            qr_data.to_string()
        };

        // Parse JSON
        let qr_info: QRCodeData = serde_json::from_str(&decoded_data)
            .map_err(|e| BreznError::QrCode(format!("Invalid QR code format: {}", e)))?;

        // Validate the network type
        if qr_info.network_type != "brezn" {
            return Err(BreznError::QrCode(format!(
                "Unsupported network type: {}",
                qr_info.network_type
            )));
        }

        println!("✅ Parsed QR code for peer: {}", qr_info.node_id);
        Ok(qr_info)
    }

    /// Generate a simple join QR code with just address and port
    pub fn generate_simple_join_qr(&self, custom_address: Option<&str>) -> Result<String> {
        let address = if let Some(addr) = custom_address {
            addr.to_string()
        } else {
            self.get_local_ip()?
        };

        let join_data = serde_json::json!({
            "type": "brezn_join",
            "address": address,
            "port": self.port,
            "timestamp": std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs()
        });

        let json_string = serde_json::to_string(&join_data)?;
        
        let code = QrCode::new(&json_string)
            .map_err(|e| BreznError::QrCode(format!("Failed to generate join QR code: {}", e)))?;
        
        let svg = code.render::<svg::Color>()
            .min_dimensions(150, 150)
            .build();
        
        println!("✅ Generated simple join QR code");
        Ok(svg)
    }

    /// Parse a simple join QR code
    pub fn parse_simple_join_qr(&self, qr_data: &str) -> Result<(String, u16)> {
        let json_value: serde_json::Value = serde_json::from_str(qr_data)
            .map_err(|e| BreznError::QrCode(format!("Invalid join QR format: {}", e)))?;

        let qr_type = json_value.get("type")
            .and_then(|t| t.as_str())
            .ok_or_else(|| BreznError::QrCode("Missing 'type' field in QR code".to_string()))?;

        if qr_type != "brezn_join" {
            return Err(BreznError::QrCode(format!("Invalid QR type: {}", qr_type)));
        }

        let address = json_value.get("address")
            .and_then(|a| a.as_str())
            .ok_or_else(|| BreznError::QrCode("Missing 'address' field in QR code".to_string()))?
            .to_string();

        let port = json_value.get("port")
            .and_then(|p| p.as_u64())
            .ok_or_else(|| BreznError::QrCode("Missing 'port' field in QR code".to_string()))?
            as u16;

        println!("✅ Parsed join QR code: {}:{}", address, port);
        Ok((address, port))
    }

    /// Get the local IP address
    fn get_local_ip(&self) -> Result<String> {
        // Try to get local network interface IP
        let interfaces = get_if_addrs::get_if_addrs()
            .map_err(|e| BreznError::QrCode(format!("Failed to get network interfaces: {}", e)))?;

        for interface in interfaces {
            if !interface.is_loopback() {
                if let std::net::IpAddr::V4(ipv4) = interface.ip() {
                    return Ok(ipv4.to_string());
                }
            }
        }

        // Fallback to localhost
        Ok("127.0.0.1".to_string())
    }

    /// Generate a QR code with network discovery information
    pub fn generate_discovery_qr(&self) -> Result<String> {
        let discovery_data = serde_json::json!({
            "type": "brezn_discovery",
            "node_id": self.node_id,
            "discovery_port": self.port + 1, // Use next port for discovery
            "network_port": self.port,
            "public_key": self.public_key,
            "capabilities": ["post_sync", "peer_discovery"],
            "version": "1.0.0"
        });

        let json_string = serde_json::to_string(&discovery_data)?;
        
        let code = QrCode::new(&json_string)
            .map_err(|e| BreznError::QrCode(format!("Failed to generate discovery QR code: {}", e)))?;
        
        let svg = code.render::<svg::Color>()
            .min_dimensions(250, 250)
            .build();
        
        println!("✅ Generated discovery QR code");
        Ok(svg)
    }

    /// Validate QR code format
    pub fn validate_qr_format(&self, qr_data: &str) -> Result<bool> {
        // Try to parse as JSON
        let json_value: serde_json::Value = serde_json::from_str(qr_data)
            .map_err(|_| BreznError::QrCode("Not valid JSON format".to_string()))?;

        // Check if it has a type field
        if let Some(qr_type) = json_value.get("type").and_then(|t| t.as_str()) {
            match qr_type {
                "brezn_join" | "brezn_discovery" => Ok(true),
                _ => {
                    // Try to parse as QRCodeData
                    match serde_json::from_str::<QRCodeData>(qr_data) {
                        Ok(_) => Ok(true),
                        Err(_) => Ok(false),
                    }
                }
            }
        } else {
            // Try to parse as QRCodeData
            match serde_json::from_str::<QRCodeData>(qr_data) {
                Ok(_) => Ok(true),
                Err(_) => Ok(false),
            }
        }
    }
}