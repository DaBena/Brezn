use std::env;
use std::path::PathBuf;

fn main() {
    // Tell Cargo to rerun this script if any of these files change
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-changed=src/lib.rs");
    
    // Set up platform-specific configurations
    let target = env::var("TARGET").unwrap();
    
    if target.contains("android") {
        // Android-specific configurations
        println!("cargo:rustc-cfg=target_os=\"android\"");
        
        // Link against Android-specific libraries
        println!("cargo:rustc-link-lib=android");
        println!("cargo:rustc-link-lib=log");
    } else if target.contains("ios") {
        // iOS-specific configurations
        println!("cargo:rustc-cfg=target_os=\"ios\"");
        
        // Link against iOS-specific frameworks
        println!("cargo:rustc-link-framework=Foundation");
        println!("cargo:rustc-link-framework=Security");
    } else if target.contains("windows") {
        // Windows-specific configurations
        println!("cargo:rustc-cfg=target_os=\"windows\"");
        
        // Link against Windows-specific libraries
        println!("cargo:rustc-link-lib=ws2_32");
        println!("cargo:rustc-link-lib=iphlpapi");
    } else {
        // Linux/Unix configurations
        // Note: Removed target_os cfg to avoid compiler warnings
    }
    
    // Set up FFI bindings
    // Note: FFI feature is not defined in Cargo.toml, so we'll always generate bindings
    generate_ffi_bindings();
}

fn generate_ffi_bindings() {
    // This would generate C headers for the FFI functions
    // For now, we'll just set up the configuration
    println!("cargo:rustc-cfg=feature=\"ffi\"");
    
    // Set up the output directory for generated files
    let out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());
    let bindings_file = out_dir.join("bindings.rs");
    
    // Generate basic FFI bindings
    let bindings = r#"
        use std::ffi::{CStr, CString};
        use std::os::raw::c_char;
        
        #[no_mangle]
        pub extern "C" fn brezn_init() -> *mut crate::BreznApp {
            match crate::BreznApp::new() {
                Ok(app) => Box::into_raw(Box::new(app)),
                Err(_) => std::ptr::null_mut(),
            }
        }
        
        #[no_mangle]
        pub extern "C" fn brezn_free(app: *mut crate::BreznApp) {
            if !app.is_null() {
                unsafe {
                    let _ = Box::from_raw(app);
                }
            }
        }
        
        #[no_mangle]
        pub extern "C" fn brezn_add_post(
            app: *mut crate::BreznApp,
            content: *const c_char,
            pseudonym: *const c_char,
        ) -> i64 {
            if app.is_null() || content.is_null() || pseudonym.is_null() {
                return -1;
            }
            
            unsafe {
                let app = &*app;
                let content = CStr::from_ptr(content).to_string_lossy().to_string();
                let pseudonym = CStr::from_ptr(pseudonym).to_string_lossy().to_string();
                
                match app.add_post(content, pseudonym) {
                    Ok(id) => id,
                    Err(_) => -1,
                }
            }
        }
        
        #[no_mangle]
        pub extern "C" fn brezn_get_posts_json(
            app: *mut crate::BreznApp,
            limit: usize,
        ) -> *mut c_char {
            if app.is_null() {
                return std::ptr::null_mut();
            }
            
            unsafe {
                let app = &*app;
                match app.get_posts(limit) {
                    Ok(posts) => {
                        match serde_json::to_string(&posts) {
                            Ok(json) => {
                                match CString::new(json) {
                                    Ok(c_string) => c_string.into_raw(),
                                    Err(_) => std::ptr::null_mut(),
                                }
                            }
                            Err(_) => std::ptr::null_mut(),
                        }
                    }
                    Err(_) => std::ptr::null_mut(),
                }
            }
        }
        
        #[no_mangle]
        pub extern "C" fn brezn_free_string(s: *mut c_char) {
            if !s.is_null() {
                unsafe {
                    let _ = CString::from_raw(s);
                }
            }
        }
    "#;
    
    std::fs::write(bindings_file, bindings).unwrap();
}