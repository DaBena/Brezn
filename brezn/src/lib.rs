use std::sync::{Arc, Mutex};
use anyhow::{Result, Context};
use chrono::Utc;
use uuid::Uuid;

pub mod types;
pub mod crypto;
pub mod network;
pub mod database;

use types::{Post, Config, TorProxy};
use database::Database;

#[derive(Debug)]
pub struct BreznApp {
    db: Arc<Mutex<Database>>,
    config: Arc<Mutex<Config>>,
    node_id: String,
    tor_proxy: Arc<Mutex<TorProxy>>,
}

impl BreznApp {
    pub fn new() -> Result<Self> {
        let db = Database::new()
            .context("Failed to initialize database")?;
        
        let config = db.get_config()
            .context("Failed to load configuration")?;
        
        let node_id = Self::generate_node_id();
        let tor_proxy = TorProxy::new(config.tor_socks_port);
        
        Ok(Self {
            db: Arc::new(Mutex::new(db)),
            config: Arc::new(Mutex::new(config)),
            node_id,
            tor_proxy: Arc::new(Mutex::new(tor_proxy)),
        })
    }
    
    fn generate_node_id() -> String {
        Uuid::new_v4().to_string()
    }
    
    // Post management
    pub fn add_post(&self, content: String, pseudonym: String) -> Result<i64> {
        let post = Post {
            id: None,
            content,
            timestamp: Utc::now().timestamp() as u64,
            pseudonym,
            node_id: Some(self.node_id.clone()),
        };
        
        let db = self.db.lock().unwrap();
        db.add_post(&post)
            .context("Failed to add post")
    }
    
    pub fn get_posts(&self, limit: usize) -> Result<Vec<Post>> {
        let db = self.db.lock().unwrap();
        db.get_posts(limit)
            .context("Failed to get posts")
    }
    
    // Configuration management
    pub fn get_config(&self) -> Result<Config> {
        let config = self.config.lock().unwrap();
        Ok(config.clone())
    }
    
    pub fn update_config(&self, new_config: Config) -> Result<()> {
        let db = self.db.lock().unwrap();
        db.update_config(&new_config)
            .context("Failed to update configuration")?;
        
        let mut config = self.config.lock().unwrap();
        *config = new_config;
        
        Ok(())
    }
    
    // Tor proxy management
    pub fn enable_tor(&self) -> Result<()> {
        let mut tor = self.tor_proxy.lock().unwrap();
        tor.enable();
        Ok(())
    }
    
    pub fn disable_tor(&self) -> Result<()> {
        let mut tor = self.tor_proxy.lock().unwrap();
        tor.disable();
        Ok(())
    }
    
    pub fn is_tor_enabled(&self) -> bool {
        let tor = self.tor_proxy.lock().unwrap();
        tor.is_enabled()
    }
    
    // User management
    pub fn add_muted_user(&self, pseudonym: &str) -> Result<()> {
        let db = self.db.lock().unwrap();
        db.add_muted_user(pseudonym)
            .context("Failed to add muted user")
    }
    
    pub fn get_muted_users(&self) -> Result<Vec<String>> {
        let db = self.db.lock().unwrap();
        db.get_muted_users()
            .context("Failed to get muted users")
    }
    
    // Network operations
    pub fn get_node_id(&self) -> &str {
        &self.node_id
    }
}

// FFI functions for React Native
#[no_mangle]
pub extern "C" fn brezn_init() -> *mut BreznApp {
    match BreznApp::new() {
        Ok(app) => Box::into_raw(Box::new(app)),
        Err(_) => std::ptr::null_mut(),
    }
}

#[no_mangle]
pub extern "C" fn brezn_free(app: *mut BreznApp) {
    if !app.is_null() {
        unsafe {
            let _ = Box::from_raw(app);
        }
    }
}

#[no_mangle]
pub extern "C" fn brezn_add_post(
    app: *mut BreznApp,
    content: *const i8,
    pseudonym: *const i8,
) -> i64 {
    if app.is_null() || content.is_null() || pseudonym.is_null() {
        return -1;
    }
    
    unsafe {
        let app = &*app;
        let content = std::ffi::CStr::from_ptr(content).to_string_lossy().to_string();
        let pseudonym = std::ffi::CStr::from_ptr(pseudonym).to_string_lossy().to_string();
        
        match app.add_post(content, pseudonym) {
            Ok(id) => id,
            Err(_) => -1,
        }
    }
}

#[no_mangle]
pub extern "C" fn brezn_get_posts_json(
    app: *mut BreznApp,
    limit: usize,
) -> *mut i8 {
    if app.is_null() {
        return std::ptr::null_mut();
    }
    
    unsafe {
        let app = &*app;
        match app.get_posts(limit) {
            Ok(posts) => {
                match serde_json::to_string(&posts) {
                    Ok(json) => {
                        let c_string = std::ffi::CString::new(json).unwrap();
                        c_string.into_raw()
                    }
                    Err(_) => std::ptr::null_mut(),
                }
            }
            Err(_) => std::ptr::null_mut(),
        }
    }
}

#[no_mangle]
pub extern "C" fn brezn_free_string(s: *mut i8) {
    if !s.is_null() {
        unsafe {
            let _ = std::ffi::CString::from_raw(s);
        }
    }
}