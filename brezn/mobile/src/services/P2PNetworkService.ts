import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import { EventEmitter } from 'events';

// Types
export interface P2PNetworkStatus {
  isConnected: boolean;
  activePeers: number;
  totalPeers: number;
  syncStatus: 'idle' | 'syncing' | 'error';
  lastSyncTime: number;
  networkLatency: number;
  torEnabled: boolean;
  torStatus: 'connected' | 'disconnected' | 'connecting' | 'error';
}

export interface PeerInfo {
  nodeId: string;
  address: string;
  port: number;
  publicKey: string;
  capabilities: string[];
  connectionQuality: 'excellent' | 'good' | 'fair' | 'poor';
  lastSeen: number;
  isActive: boolean;
}

export interface Post {
  id: string;
  content: string;
  timestamp: number;
  pseudonym: string;
  nodeId?: string;
}

export interface NetworkMessage {
  type: 'post' | 'sync_request' | 'sync_response' | 'heartbeat' | 'peer_discovery';
  data: any;
  timestamp: number;
  sender: string;
}

export interface P2PConfig {
  enableAutoDiscovery: boolean;
  enableTor: boolean;
  maxPeers: number;
  syncInterval: number;
  heartbeatInterval: number;
  connectionTimeout: number;
}

// P2P Network Service
export class P2PNetworkService extends EventEmitter {
  private static instance: P2PNetworkService;
  private nativeModule: any;
  private eventEmitter: NativeEventEmitter;
  private isInitialized: boolean = false;
  private config: P2PConfig;
  private networkStatus: P2PNetworkStatus;
  private peers: Map<string, PeerInfo> = new Map();
  private posts: Map<string, Post> = new Map();

  private constructor() {
    super();
    
    // Get native module
    if (Platform.OS === 'android') {
      this.nativeModule = NativeModules.BreznNativeModule;
    } else if (Platform.OS === 'ios') {
      this.nativeModule = NativeModules.BreznNativeModule;
    } else {
      throw new Error('Platform not supported');
    }

    // Create event emitter
    this.eventEmitter = new NativeEventEmitter(this.nativeModule);

    // Default configuration
    this.config = {
      enableAutoDiscovery: true,
      enableTor: false,
      maxPeers: 50,
      syncInterval: 30000, // 30 seconds
      heartbeatInterval: 60000, // 60 seconds
      connectionTimeout: 10000, // 10 seconds
    };

    // Default network status
    this.networkStatus = {
      isConnected: false,
      activePeers: 0,
      totalPeers: 0,
      syncStatus: 'idle',
      lastSyncTime: 0,
      networkLatency: 0,
      torEnabled: false,
      torStatus: 'disconnected',
    };

    this.setupEventListeners();
  }

  // Singleton pattern
  public static getInstance(): P2PNetworkService {
    if (!P2PNetworkService.instance) {
      P2PNetworkService.instance = new P2PNetworkService();
    }
    return P2PNetworkService.instance;
  }

  // Initialize the P2P network service
  public async initialize(config?: Partial<P2PConfig>): Promise<void> {
    try {
      if (this.isInitialized) {
        console.log('P2P Network Service already initialized');
        return;
      }

      // Update configuration
      if (config) {
        this.config = { ...this.config, ...config };
      }

      console.log('Initializing P2P Network Service...');

      // Initialize native module
      await this.nativeModule.init(8888, 9050);

      // Start the service
      await this.nativeModule.start();

      // Start background tasks
      this.startBackgroundTasks();

      this.isInitialized = true;
      console.log('P2P Network Service initialized successfully');

      // Emit initialization event
      this.emit('initialized', { success: true, config: this.config });

    } catch (error) {
      console.error('Failed to initialize P2P Network Service:', error);
      this.emit('error', { type: 'initialization_failed', error });
      throw error;
    }
  }

  // Start background network tasks
  private startBackgroundTasks(): void {
    // Start peer discovery
    if (this.config.enableAutoDiscovery) {
      this.startPeerDiscovery();
    }

    // Start heartbeat
    this.startHeartbeat();

    // Start synchronization
    this.startSynchronization();
  }

  // Start peer discovery
  private startPeerDiscovery(): void {
    setInterval(async () => {
      try {
        await this.discoverPeers();
      } catch (error) {
        console.error('Peer discovery failed:', error);
      }
    }, 30000); // Every 30 seconds
  }

  // Start heartbeat
  private startHeartbeat(): void {
    setInterval(async () => {
      try {
        await this.sendHeartbeat();
      } catch (error) {
        console.error('Heartbeat failed:', error);
      }
    }, this.config.heartbeatInterval);
  }

  // Start synchronization
  private startSynchronization(): void {
    setInterval(async () => {
      try {
        await this.synchronizePosts();
      } catch (error) {
        console.error('Synchronization failed:', error);
      }
    }, this.config.syncInterval);
  }

  // Discover new peers
  public async discoverPeers(): Promise<PeerInfo[]> {
    try {
      console.log('Discovering peers...');
      
      const discoveredPeers = await this.nativeModule.discoverPeers();
      const newPeers: PeerInfo[] = [];

      for (const peerData of discoveredPeers) {
        const peer: PeerInfo = {
          nodeId: peerData.node_id,
          address: peerData.address,
          port: peerData.port,
          publicKey: peerData.public_key,
          capabilities: peerData.capabilities || [],
          connectionQuality: this.calculateConnectionQuality(peerData.latency_ms),
          lastSeen: Date.now(),
          isActive: true,
        };

        if (!this.peers.has(peer.nodeId)) {
          this.peers.set(peer.nodeId, peer);
          newPeers.push(peer);
          this.emit('peer_discovered', peer);
        }
      }

      console.log(`Discovered ${newPeers.length} new peers`);
      return newPeers;

    } catch (error) {
      console.error('Peer discovery failed:', error);
      throw error;
    }
  }

  // Connect to a specific peer
  public async connectToPeer(address: string, port: number): Promise<boolean> {
    try {
      console.log(`Connecting to peer ${address}:${port}`);
      
      const result = await this.nativeModule.connectToPeer(`${address}:${port}`);
      
      if (result) {
        console.log(`Successfully connected to peer ${address}:${port}`);
        this.emit('peer_connected', { address, port });
        return true;
      } else {
        console.log(`Failed to connect to peer ${address}:${port}`);
        return false;
      }

    } catch (error) {
      console.error(`Connection to peer ${address}:${port} failed:`, error);
      throw error;
    }
  }

  // Send heartbeat to all peers
  private async sendHeartbeat(): Promise<void> {
    try {
      const activePeers = Array.from(this.peers.values()).filter(p => p.isActive);
      
      for (const peer of activePeers) {
        try {
          await this.nativeModule.sendHeartbeat(peer.nodeId);
        } catch (error) {
          console.error(`Heartbeat to peer ${peer.nodeId} failed:`, error);
          // Mark peer as inactive
          peer.isActive = false;
          this.emit('peer_disconnected', peer);
        }
      }

      // Update network status
      this.updateNetworkStatus();

    } catch (error) {
      console.error('Heartbeat failed:', error);
    }
  }

  // Synchronize posts with peers
  public async synchronizePosts(): Promise<void> {
    try {
      if (this.networkStatus.syncStatus === 'syncing') {
        console.log('Synchronization already in progress');
        return;
      }

      console.log('Starting post synchronization...');
      this.networkStatus.syncStatus = 'syncing';
      this.emit('sync_started');

      const activePeers = Array.from(this.peers.values()).filter(p => p.isActive);
      
      for (const peer of activePeers) {
        try {
          const syncResult = await this.nativeModule.syncWithPeer(peer.nodeId);
          
          if (syncResult && syncResult.posts) {
            // Process new posts
            for (const postData of syncResult.posts) {
              const post: Post = {
                id: postData.id,
                content: postData.content,
                timestamp: postData.timestamp,
                pseudonym: postData.pseudonym,
                nodeId: postData.node_id,
              };

              if (!this.posts.has(post.id)) {
                this.posts.set(post.id, post);
                this.emit('post_received', post);
              }
            }
          }

        } catch (error) {
          console.error(`Sync with peer ${peer.nodeId} failed:`, error);
        }
      }

      this.networkStatus.syncStatus = 'idle';
      this.networkStatus.lastSyncTime = Date.now();
      this.emit('sync_completed', { timestamp: this.networkStatus.lastSyncTime });

    } catch (error) {
      console.error('Post synchronization failed:', error);
      this.networkStatus.syncStatus = 'error';
      this.emit('sync_error', { error });
    }
  }

  // Create and broadcast a post
  public async createPost(content: string, pseudonym: string): Promise<Post> {
    try {
      console.log('Creating new post...');
      
      const post: Post = {
        id: this.generatePostId(),
        content,
        pseudonym,
        timestamp: Date.now(),
        nodeId: await this.getNodeId(),
      };

      // Store post locally
      this.posts.set(post.id, post);

      // Broadcast to network
      await this.broadcastPost(post);

      console.log('Post created and broadcasted successfully');
      this.emit('post_created', post);
      
      return post;

    } catch (error) {
      console.error('Failed to create post:', error);
      throw error;
    }
  }

  // Broadcast post to all peers
  private async broadcastPost(post: Post): Promise<void> {
    try {
      const activePeers = Array.from(this.peers.values()).filter(p => p.isActive);
      
      for (const peer of activePeers) {
        try {
          await this.nativeModule.broadcastPost(peer.nodeId, post);
        } catch (error) {
          console.error(`Failed to broadcast post to peer ${peer.nodeId}:`, error);
        }
      }

    } catch (error) {
      console.error('Post broadcasting failed:', error);
      throw error;
    }
  }

  // Get all posts
  public getPosts(): Post[] {
    return Array.from(this.posts.values()).sort((a, b) => b.timestamp - a.timestamp);
  }

  // Get network status
  public getNetworkStatus(): P2PNetworkStatus {
    return { ...this.networkStatus };
  }

  // Get all peers
  public getPeers(): PeerInfo[] {
    return Array.from(this.peers.values());
  }

  // Get active peers
  public getActivePeers(): PeerInfo[] {
    return Array.from(this.peers.values()).filter(p => p.isActive);
  }

  // Update network status
  private updateNetworkStatus(): void {
    const activePeers = this.getActivePeers();
    
    this.networkStatus.activePeers = activePeers.length;
    this.networkStatus.totalPeers = this.peers.size;
    this.networkStatus.isConnected = activePeers.length > 0;

    // Calculate average latency
    if (activePeers.length > 0) {
      const totalLatency = activePeers.reduce((sum, peer) => {
        // Convert connection quality to latency estimate
        const latencyMap = { excellent: 50, good: 100, fair: 200, poor: 500 };
        return sum + latencyMap[peer.connectionQuality];
      }, 0);
      
      this.networkStatus.networkLatency = totalLatency / activePeers.length;
    }

    this.emit('network_status_changed', this.networkStatus);
  }

  // Calculate connection quality based on latency
  private calculateConnectionQuality(latencyMs: number): 'excellent' | 'good' | 'fair' | 'poor' {
    if (latencyMs < 100) return 'excellent';
    if (latencyMs < 200) return 'good';
    if (latencyMs < 500) return 'fair';
    return 'poor';
  }

  // Generate unique post ID
  private generatePostId(): string {
    return `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Get node ID from native module
  private async getNodeId(): Promise<string> {
    try {
      return await this.nativeModule.getNodeId();
    } catch (error) {
      console.error('Failed to get node ID:', error);
      return 'unknown';
    }
  }

  // Setup event listeners
  private setupEventListeners(): void {
    // Listen to native module events
    this.eventEmitter.addListener('peer_discovered', (peerData) => {
      console.log('Peer discovered via native module:', peerData);
      this.emit('peer_discovered', peerData);
    });

    this.eventEmitter.addListener('peer_connected', (peerData) => {
      console.log('Peer connected via native module:', peerData);
      this.emit('peer_connected', peerData);
    });

    this.eventEmitter.addListener('peer_disconnected', (peerData) => {
      console.log('Peer disconnected via native module:', peerData);
      this.emit('peer_disconnected', peerData);
    });

    this.eventEmitter.addListener('post_received', (postData) => {
      console.log('Post received via native module:', postData);
      this.emit('post_received', postData);
    });

    this.eventEmitter.addListener('network_status_changed', (statusData) => {
      console.log('Network status changed via native module:', statusData);
      this.networkStatus = { ...this.networkStatus, ...statusData };
      this.emit('network_status_changed', this.networkStatus);
    });
  }

  // Enable/disable Tor
  public async setTorEnabled(enabled: boolean): Promise<void> {
    try {
      if (enabled) {
        await this.nativeModule.enableTor();
        this.networkStatus.torEnabled = true;
        this.networkStatus.torStatus = 'connecting';
      } else {
        await this.nativeModule.disableTor();
        this.networkStatus.torEnabled = false;
        this.networkStatus.torStatus = 'disconnected';
      }

      this.emit('tor_status_changed', { enabled, status: this.networkStatus.torStatus });

    } catch (error) {
      console.error('Failed to change Tor status:', error);
      throw error;
    }
  }

  // Get Tor status
  public getTorStatus(): { enabled: boolean; status: string } {
    return {
      enabled: this.networkStatus.torEnabled,
      status: this.networkStatus.torStatus,
    };
  }

  // Disconnect from network
  public async disconnect(): Promise<void> {
    try {
      console.log('Disconnecting from P2P network...');
      
      // Stop background tasks
      this.isInitialized = false;
      
      // Disconnect from all peers
      const activePeers = this.getActivePeers();
      for (const peer of activePeers) {
        try {
          await this.nativeModule.disconnectFromPeer(peer.nodeId);
        } catch (error) {
          console.error(`Failed to disconnect from peer ${peer.nodeId}:`, error);
        }
      }

      // Clear local state
      this.peers.clear();
      this.posts.clear();
      
      this.networkStatus = {
        isConnected: false,
        activePeers: 0,
        totalPeers: 0,
        syncStatus: 'idle',
        lastSyncTime: 0,
        networkLatency: 0,
        torEnabled: false,
        torStatus: 'disconnected',
      };

      console.log('Disconnected from P2P network');
      this.emit('disconnected');

    } catch (error) {
      console.error('Failed to disconnect from network:', error);
      throw error;
    }
  }

  // Cleanup
  public destroy(): void {
    this.removeAllListeners();
    this.eventEmitter.removeAllListeners('peer_discovered');
    this.eventEmitter.removeAllListeners('peer_connected');
    this.eventEmitter.removeAllListeners('peer_disconnected');
    this.eventEmitter.removeAllListeners('post_received');
    this.eventEmitter.removeAllListeners('network_status_changed');
  }
}

// Export singleton instance
export const p2pNetworkService = P2PNetworkService.getInstance();