use std::ffi::{CStr, CString};
use std::os::raw::{c_char, c_int, c_void};
use std::ptr;
use std::sync::{Arc, Mutex};
use crate::{BreznApp, Result};
use crate::types::{Config, Post};
use crate::error::BreznError;

// FFI-safe wrapper structs
#[repr(C)]
pub struct BreznFFI {
    app: *mut c_void,
}

#[repr(C)]
pub struct PostFFI {
    id: *mut c_char,
    content: *mut c_char,
    timestamp: u64,
    pseudonym: *mut c_char,
    node_id: *mut c_char,
}

#[repr(C)]
pub struct NetworkStatusFFI {
    network_enabled: bool,
    tor_enabled: bool,
    peers_count: u32,
    discovery_peers_count: u32,
    port: u16,
    tor_socks_port: u16,
}

// Error handling
#[repr(C)]
pub enum BreznFFIResult {
    Success = 0,
    Error = 1,
}

// Global app instance (thread-safe)
static mut GLOBAL_APP: Option<Arc<Mutex<BreznApp>>> = None;

// Thread-safe app access
fn get_global_app() -> Option<Arc<Mutex<BreznApp>>> {
    unsafe {
        GLOBAL_APP.as_ref().map(|app| Arc::clone(app))
    }
}

// Helper functions for string conversion
fn c_string_to_rust(c_str: *const c_char) -> Result<String> {
    if c_str.is_null() {
        return Err(BreznError::InvalidInput("Null string pointer".to_string()));
    }
    
    unsafe {
        let c_str = CStr::from_ptr(c_str);
        c_str.to_str()
            .map(|s| s.to_string())
            .map_err(|e| BreznError::InvalidInput(format!("Invalid UTF-8: {}", e)))
    }
}

fn rust_string_to_c(s: &str) -> *mut c_char {
    match CString::new(s) {
        Ok(c_string) => c_string.into_raw(),
        Err(_) => ptr::null_mut(),
    }
}

// FFI Functions

#[no_mangle]
pub extern "C" fn brezn_ffi_init(
    network_port: u16,
    tor_socks_port: u16
) -> *mut BreznFFI {
    let config = Config {
        network_port,
        tor_socks_port,
        ..Default::default()
    };
    
    match BreznApp::new(config) {
        Ok(app) => {
            let app_arc = Arc::new(Mutex::new(app));
            unsafe {
                GLOBAL_APP = Some(Arc::clone(&app_arc));
            }
            
            let ffi_wrapper = Box::new(BreznFFI {
                app: Box::into_raw(app_arc) as *mut c_void,
            });
            
            Box::into_raw(ffi_wrapper)
        }
        Err(_) => ptr::null_mut(),
    }
}

#[no_mangle]
pub extern "C" fn brezn_ffi_start(ffi: *mut BreznFFI) -> BreznFFIResult {
    if ffi.is_null() {
        return BreznFFIResult::Error;
    }
    
    if let Some(app) = get_global_app() {
        let runtime = tokio::runtime::Runtime::new().unwrap();
        let result = runtime.block_on(async {
            let app_guard = app.lock().unwrap();
            app_guard.start().await
        });
        
        match result {
            Ok(_) => BreznFFIResult::Success,
            Err(_) => BreznFFIResult::Error,
        }
    } else {
        BreznFFIResult::Error
    }
}

#[no_mangle]
pub extern "C" fn brezn_ffi_create_post(
    content: *const c_char,
    pseudonym: *const c_char
) -> BreznFFIResult {
    let content_str = match c_string_to_rust(content) {
        Ok(s) => s,
        Err(_) => return BreznFFIResult::Error,
    };
    
    let pseudonym_str = match c_string_to_rust(pseudonym) {
        Ok(s) => s,
        Err(_) => return BreznFFIResult::Error,
    };
    
    if let Some(app) = get_global_app() {
        let runtime = tokio::runtime::Runtime::new().unwrap();
        let result = runtime.block_on(async {
            let app_guard = app.lock().unwrap();
            app_guard.create_post(content_str, pseudonym_str).await
        });
        
        match result {
            Ok(_) => BreznFFIResult::Success,
            Err(_) => BreznFFIResult::Error,
        }
    } else {
        BreznFFIResult::Error
    }
}

#[no_mangle]
pub extern "C" fn brezn_ffi_get_posts() -> *mut PostFFI {
    if let Some(app) = get_global_app() {
        let runtime = tokio::runtime::Runtime::new().unwrap();
        let posts = runtime.block_on(async {
            let app_guard = app.lock().unwrap();
            app_guard.get_posts().await
        });
        
        match posts {
            Ok(posts) => {
                let ffi_posts: Vec<PostFFI> = posts.into_iter().map(|post| PostFFI {
                    id: post.id.map(|id| rust_string_to_c(&id.to_string())).unwrap_or(ptr::null_mut()),
                    content: rust_string_to_c(&post.content),
                    timestamp: post.timestamp,
                    pseudonym: rust_string_to_c(&post.pseudonym),
                    node_id: post.node_id.map(|n| rust_string_to_c(&n)).unwrap_or(ptr::null_mut()),
                }).collect();
                
                let boxed_posts = Box::new(ffi_posts);
                Box::into_raw(boxed_posts) as *mut PostFFI
            }
            Err(_) => ptr::null_mut(),
        }
    } else {
        ptr::null_mut()
    }
}

#[no_mangle]
pub extern "C" fn brezn_ffi_get_network_status() -> *mut NetworkStatusFFI {
    if let Some(app) = get_global_app() {
        let runtime = tokio::runtime::Runtime::new().unwrap();
        let status = runtime.block_on(async {
            let app_guard = app.lock().unwrap();
            app_guard.get_network_status()
        });
        
        match status {
            Ok(status_json) => {
                let status_obj = status_json.as_object().unwrap();
                
                let ffi_status = Box::new(NetworkStatusFFI {
                    network_enabled: status_obj.get("network_enabled").and_then(|v| v.as_bool()).unwrap_or(false),
                    tor_enabled: status_obj.get("tor_enabled").and_then(|v| v.as_bool()).unwrap_or(false),
                    peers_count: status_obj.get("peers_count").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
                    discovery_peers_count: status_obj.get("discovery_peers_count").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
                    port: status_obj.get("port").and_then(|v| v.as_u64()).unwrap_or(0) as u16,
                    tor_socks_port: status_obj.get("tor_socks_port").and_then(|v| v.as_u64()).unwrap_or(0) as u16,
                });
                
                Box::into_raw(ffi_status)
            }
            Err(_) => ptr::null_mut(),
        }
    } else {
        ptr::null_mut()
    }
}

#[no_mangle]
pub extern "C" fn brezn_ffi_enable_tor() -> BreznFFIResult {
    if let Some(app) = get_global_app() {
        let runtime = tokio::runtime::Runtime::new().unwrap();
        let result = runtime.block_on(async {
            let app_guard = app.lock().unwrap();
            app_guard.enable_tor().await
        });
        
        match result {
            Ok(_) => BreznFFIResult::Success,
            Err(_) => BreznFFIResult::Error,
        }
    } else {
        BreznFFIResult::Error
    }
}

#[no_mangle]
pub extern "C" fn brezn_ffi_disable_tor() {
    if let Some(app) = get_global_app() {
        let app_guard = app.lock().unwrap();
        app_guard.disable_tor();
    }
}

#[no_mangle]
pub extern "C" fn brezn_ffi_generate_qr_code() -> *mut c_char {
    if let Some(app) = get_global_app() {
        let app_guard = app.lock().unwrap();
        match app_guard.generate_qr_code() {
            Ok(qr_data) => rust_string_to_c(&qr_data),
            Err(_) => ptr::null_mut(),
        }
    } else {
        ptr::null_mut()
    }
}

#[no_mangle]
pub extern "C" fn brezn_ffi_parse_qr_code(qr_data: *const c_char) -> BreznFFIResult {
    let qr_str = match c_string_to_rust(qr_data) {
        Ok(s) => s,
        Err(_) => return BreznFFIResult::Error,
    };
    
    if let Some(app) = get_global_app() {
        match app.lock().unwrap().parse_qr_code(&qr_str) {
            Ok(_) => BreznFFIResult::Success,
            Err(_) => BreznFFIResult::Error,
        }
    } else {
        BreznFFIResult::Error
    }
}

// Memory management
#[no_mangle]
pub extern "C" fn brezn_ffi_free_string(ptr: *mut c_char) {
    if !ptr.is_null() {
        unsafe {
            let _ = CString::from_raw(ptr);
        }
    }
}

#[no_mangle]
pub extern "C" fn brezn_ffi_free_posts(posts: *mut PostFFI) {
    if !posts.is_null() {
        unsafe {
            let _ = Box::from_raw(posts);
        }
    }
}

#[no_mangle]
pub extern "C" fn brezn_ffi_free_network_status(status: *mut NetworkStatusFFI) {
    if !status.is_null() {
        unsafe {
            let _ = Box::from_raw(status);
        }
    }
}

#[no_mangle]
pub extern "C" fn brezn_ffi_cleanup() {
    unsafe {
        GLOBAL_APP = None;
    }
}

// Performance monitoring
#[no_mangle]
pub extern "C" fn brezn_ffi_get_performance_metrics() -> *mut c_char {
    // Return basic performance metrics as JSON
    let metrics = serde_json::json!({
        "memory_usage": std::mem::size_of::<BreznApp>(),
        "thread_count": std::thread::available_parallelism().map(|n| n.get()).unwrap_or(1),
        "timestamp": chrono::Utc::now().timestamp(),
    });
    
    rust_string_to_c(&metrics.to_string())
}

// Mobile-specific APIs
#[no_mangle]
pub extern "C" fn brezn_ffi_get_device_info() -> *mut c_char {
    let device_info = serde_json::json!({
        "platform": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
        "rust_version": env!("CARGO_PKG_VERSION"),
        "build_time": env!("VERGEN_BUILD_TIMESTAMP"),
    });
    
    rust_string_to_c(&device_info.to_string())
}

#[no_mangle]
pub extern "C" fn brezn_ffi_test_p2p_network() -> BreznFFIResult {
    if let Some(app) = get_global_app() {
        let runtime = tokio::runtime::Runtime::new().unwrap();
        let result = runtime.block_on(async {
            let app_guard = app.lock().unwrap();
            app_guard.test_p2p_network().await
        });
        
        match result {
            Ok(_) => BreznFFIResult::Success,
            Err(_) => BreznFFIResult::Error,
        }
    } else {
        BreznFFIResult::Error
    }
}