use brezn::{types};
use qrcode::{QrCode, render::svg};

#[test]
fn test_qr_code_generation() {
    // Test basic QR code generation
    let data = "test data for qr code";
    let qr_result = QrCode::new(data);
    assert!(qr_result.is_ok());
    
    let qr = qr_result.unwrap();
    assert_eq!(qr.version(), qrcode::Version::Normal(1));
}

#[test]
fn test_qr_code_serialization() {
    // Test QR code serialization
    let data = "serialization test data";
    let qr = QrCode::new(data).unwrap();
    
    // Test SVG rendering
    let svg_string = qr.render()
        .min_dimensions(200, 200)
        .dark_color(svg::Color("#000000"))
        .light_color(svg::Color("#ffffff"))
        .build();
    
    assert!(svg_string.contains("<svg"));
    assert!(svg_string.contains("</svg>"));
}

#[test]
fn test_qr_code_error_correction() {
    // Test QR code error correction levels
    let data = "error correction test";
    
    // Test with different error correction levels
    let qr_low = QrCode::with_error_correction_level(data, qrcode::EcLevel::L);
    let qr_medium = QrCode::with_error_correction_level(data, qrcode::EcLevel::M);
    let qr_high = QrCode::with_error_correction_level(data, qrcode::EcLevel::H);
    let qr_quartile = QrCode::with_error_correction_level(data, qrcode::EcLevel::Q);
    
    assert!(qr_low.is_ok());
    assert!(qr_medium.is_ok());
    assert!(qr_high.is_ok());
    assert!(qr_quartile.is_ok());
}

#[test]
fn test_qr_code_content_types() {
    // Test QR code with different content types
    let test_cases = vec![
        "Simple text",
        "https://example.com",
        "mailto:test@example.com",
        "tel:+1234567890",
        "WIFI:S:MyWiFi;T:WPA;P:password123;;",
    ];
    
    for content in test_cases {
        let qr_result = QrCode::new(content);
        assert!(qr_result.is_ok(), "Failed to generate QR code for: {}", content);
        
        let qr = qr_result.unwrap();
        assert!(!qr.to_string().is_empty());
    }
}

#[test]
fn test_qr_code_size_variations() {
    // Test QR code with different sizes
    let data = "size variation test";
    
    // Test minimum size
    let qr_min = QrCode::new(data);
    assert!(qr_min.is_ok());
    
    // Test with longer data (should use larger version)
    let long_data = "a".repeat(100);
    let qr_large = QrCode::new(&long_data);
    assert!(qr_large.is_ok());
    
    let qr_min = qr_min.unwrap();
    let qr_large = qr_large.unwrap();
    
    // Larger data should result in larger QR code version
    assert!(qr_large.version() >= qr_min.version());
}