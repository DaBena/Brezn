use std::env;
use std::path::PathBuf;

fn main() {
    // Generate FFI bindings for mobile platforms
    if env::var("CARGO_CFG_TARGET_OS").unwrap() == "android" {
        generate_mobile_bindings();
    }
    
    // Set up build-time environment variables
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-changed=src/lib.rs");
    
    // Set build timestamp
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    println!("cargo:rustc-env=VERGEN_BUILD_TIMESTAMP={}", timestamp);
    
    // Set version info
    println!("cargo:rustc-env=VERGEN_BUILD_SEMVER={}", env!("CARGO_PKG_VERSION"));
    println!("cargo:rustc-env=VERGEN_GIT_SHA={}", get_git_sha());
    println!("cargo:rustc-env=VERGEN_GIT_BRANCH={}", get_git_branch());
}

fn generate_mobile_bindings() {
    // Check if uniffi-bindgen is available
    if let Ok(uniffi_bindgen) = which::which("uniffi-bindgen") {
        let out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());
        let udl_file = PathBuf::from("src/brezn.udl");
        
        if udl_file.exists() {
            // Generate bindings using uniffi-bindgen
            let status = std::process::Command::new(uniffi_bindgen)
                .arg("generate")
                .arg(&udl_file)
                .arg("--language")
                .arg("kotlin")
                .arg("--out-dir")
                .arg(&out_dir)
                .status();
                
            if let Ok(exit_status) = status {
                if !exit_status.success() {
                    eprintln!("Warning: Failed to generate uniffi bindings");
                }
            }
        }
    }
    
    // Generate C header file for direct FFI
    let out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());
    let header_path = out_dir.join("brezn.h");
    
    let header_content = r#"// Auto-generated C header for Brezn FFI
#ifndef BREZN_H
#define BREZN_H

#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

// Forward declarations
typedef struct BreznApp BreznApp;
typedef struct NetworkStatus NetworkStatus;
typedef struct PerformanceMetrics PerformanceMetrics;
typedef struct DeviceInfo DeviceInfo;

// Core functions
BreznApp* brezn_app_new(void);
void brezn_app_free(BreznApp* app);
bool brezn_app_init(BreznApp* app, uint16_t network_port, uint16_t tor_socks_port);
bool brezn_app_start(BreznApp* app);

// Post functions
bool brezn_app_create_post(BreznApp* app, const char* content, const char* pseudonym);

// Network functions
NetworkStatus* brezn_app_get_network_status(BreznApp* app);
bool brezn_app_enable_tor(BreznApp* app);
void brezn_app_disable_tor(BreznApp* app);

// QR code functions
char* brezn_app_generate_qr_code(BreznApp* app);
bool brezn_app_parse_qr_code(BreznApp* app, const char* qr_data);

// Utility functions
PerformanceMetrics* brezn_app_get_performance_metrics(BreznApp* app);
DeviceInfo* brezn_app_get_device_info(BreznApp* app);
bool brezn_app_test_p2p_network(BreznApp* app);
void brezn_app_cleanup(BreznApp* app);

// Memory management
void brezn_string_free(char* ptr);
void brezn_network_status_free(NetworkStatus* ptr);
void brezn_performance_metrics_free(PerformanceMetrics* ptr);
void brezn_device_info_free(DeviceInfo* ptr);

// Struct definitions
struct NetworkStatus {
    bool network_enabled;
    bool tor_enabled;
    uint32_t peers_count;
    uint32_t discovery_peers_count;
    uint16_t port;
    uint16_t tor_socks_port;
};

struct PerformanceMetrics {
    uint64_t memory_usage;
    uint32_t thread_count;
    uint64_t timestamp;
};

struct DeviceInfo {
    char* platform;
    char* arch;
    char* rust_version;
    char* build_time;
};

#ifdef __cplusplus
}
#endif

#endif // BREZN_H
"#;
    
    std::fs::write(&header_path, header_content).unwrap();
    println!("cargo:rustc-env=BREZN_HEADER_PATH={}", header_path.display());
}

fn get_git_sha() -> String {
    std::process::Command::new("git")
        .args(["rev-parse", "--short", "HEAD"])
        .output()
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string())
        .unwrap_or_else(|_| "unknown".to_string())
}

fn get_git_branch() -> String {
    std::process::Command::new("git")
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .output()
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string())
        .unwrap_or_else(|_| "unknown".to_string())
}