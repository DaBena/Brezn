use qrcode::QrCode;
use image::{Luma, ImageBuffer};
use anyhow::Result;
use serde::{Serialize, Deserialize};
use base64::{Engine as _, engine::general_purpose};

#[derive(Debug, Serialize, Deserialize)]
pub struct PeerConnectionInfo {
    pub node_id: String,
    pub address: String,
    pub port: u16,
}

pub fn generate_qr_code(info: &PeerConnectionInfo) -> Result<Vec<u8>> {
    let data = serde_json::to_string(info)?;
    let code = QrCode::new(&data)?;
    
    let image = code.render::<Luma<u8>>()
        .build();
    
    let mut buffer = Vec::new();
    image.write_to(&mut std::io::Cursor::new(&mut buffer), image::ImageFormat::Png)?;
    
    Ok(buffer)
}

pub fn generate_qr_code_base64(info: &PeerConnectionInfo) -> Result<String> {
    let png_data = generate_qr_code(info)?;
    Ok(general_purpose::STANDARD.encode(png_data))
}

pub fn parse_qr_data(data: &str) -> Result<PeerConnectionInfo> {
    let info: PeerConnectionInfo = serde_json::from_str(data)?;
    Ok(info)
}