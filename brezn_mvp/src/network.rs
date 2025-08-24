use tokio::net::{TcpListener, TcpStream};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use anyhow::Result;
use serde::{Serialize, Deserialize};
use uuid::Uuid;

use crate::database::Database;
use crate::types::{Post, NetworkStatus};
use tokio::io::AsyncBufReadExt;
use tokio::io::BufReader;

#[derive(Debug, Serialize, Deserialize)]
pub enum Message {
    Hello { node_id: String },
    PostBroadcast { post: Post },
    PostSync { posts: Vec<Post> },
    Ping,
    Pong,
}

pub struct Peer {
    pub node_id: String,
    pub stream: TcpStream,
}

pub struct NetworkManager {
    port: u16,
    node_id: String,
    peers: Arc<RwLock<HashMap<String, Peer>>>,
    db: Arc<Database>,
    stats: Arc<RwLock<NetworkStatus>>,
}

impl NetworkManager {
    pub fn new(port: u16, db: Arc<Database>) -> Self {
        Self {
            port,
            node_id: Uuid::new_v4().to_string(),
            peers: Arc::new(RwLock::new(HashMap::new())),
            db,
            stats: Arc::new(RwLock::new(NetworkStatus {
                active: false,
                peer_count: 0,
                bytes_sent: 0,
                bytes_received: 0,
            })),
        }
    }
    
    pub async fn start(&mut self) -> Result<()> {
        let listener = TcpListener::bind(format!("0.0.0.0:{}", self.port)).await?;
        
        // Update status
        {
            let mut stats = self.stats.write().await;
            stats.active = true;
        }
        
        // Accept connections in background
        let peers = self.peers.clone();
        let db = self.db.clone();
        let stats = self.stats.clone();
        let node_id = self.node_id.clone();
        
        tokio::spawn(async move {
            loop {
                if let Ok((stream, addr)) = listener.accept().await {
                    log::info!("New connection from: {}", addr);
                    
                    let peers = peers.clone();
                    let db = db.clone();
                    let stats = stats.clone();
                    let node_id = node_id.clone();
                    
                    tokio::spawn(async move {
                        if let Err(e) = handle_peer(stream, peers, db, stats, node_id).await {
                            log::error!("Error handling peer: {}", e);
                        }
                    });
                }
            }
        });
        
        Ok(())
    }
    
    pub async fn connect_to_peer(&self, address: &str) -> Result<()> {
        let stream = TcpStream::connect(address).await?;
        let peer_id = Uuid::new_v4().to_string();
        
        // Send hello message
        let hello = Message::Hello {
            node_id: self.node_id.clone(),
        };
        
        let msg = serde_json::to_vec(&hello)?;
        // We'll handle writing in the peer handler instead
        // For now, just store the peer
        
        // Store peer
        let peer = Peer {
            node_id: peer_id.clone(),
            stream,
        };
        
        self.peers.write().await.insert(peer_id, peer);
        
        // Update stats
        let mut stats = self.stats.write().await;
        stats.peer_count = self.peers.read().await.len();
        
        Ok(())
    }
    
    pub async fn broadcast_post(&self, post: &Post) -> Result<()> {
        let msg = Message::PostBroadcast {
            post: post.clone(),
        };
        
        let data = serde_json::to_vec(&msg)?;
        let peers = self.peers.read().await;
        
        for (_id, peer) in peers.iter() {
            // TODO: Implement proper message sending to peers
            // For MVP, we'll skip broadcasting for now
        }
        
        Ok(())
    }
    
    pub async fn get_status(&self) -> NetworkStatus {
        self.stats.read().await.clone()
    }
    
    pub async fn get_peer_count(&self) -> usize {
        self.peers.read().await.len()
    }
}

async fn handle_peer(
    stream: TcpStream,
    _peers: Arc<RwLock<HashMap<String, Peer>>>,
    db: Arc<Database>,
    stats: Arc<RwLock<NetworkStatus>>,
    _local_node_id: String,
) -> Result<()> {
    let (reader, mut writer) = stream.into_split();
    let mut reader = BufReader::new(reader);
    let mut line = String::new();
    
    loop {
        line.clear();
        let n = reader.read_line(&mut line).await?;
        if n == 0 {
            break;
        }
        
        // Update stats
        {
            let mut s = stats.write().await;
            s.bytes_received += n as u64;
        }
        
        // Parse message
        if let Ok(msg) = serde_json::from_str::<Message>(&line) {
            match msg {
                Message::Hello { node_id } => {
                    log::info!("Received hello from node: {}", node_id);
                }
                Message::PostBroadcast { post } => {
                    log::info!("Received post broadcast");
                    let _ = db.add_post(&post);
                }
                Message::PostSync { posts } => {
                    log::info!("Received {} posts in sync", posts.len());
                    for post in posts {
                        let _ = db.add_post(&post);
                    }
                }
                Message::Ping => {
                    let pong = serde_json::to_vec(&Message::Pong)?;
                    writer.write_all(&pong).await?;
                    writer.write_all(b"\n").await?;
                }
                Message::Pong => {
                    log::debug!("Received pong");
                }
            }
        }
    }
    
    Ok(())
}