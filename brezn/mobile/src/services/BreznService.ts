import { NativeModules, Platform } from 'react-native';
import { Post, NetworkStatus, Config, PeerInfo } from '../types/navigation';
import { executeWithErrorHandling } from '../utils/async';

const { BreznModule } = NativeModules;

export class BreznService {
  private static instance: BreznService;
  private initialized: boolean = false;

  static getInstance(): BreznService {
    // In Jest tests, return a fresh instance to avoid state leakage across tests
    if (typeof process !== 'undefined' && process.env.JEST_WORKER_ID) {
      return new BreznService();
    }
    if (!BreznService.instance) {
      BreznService.instance = new BreznService();
    }
    return BreznService.instance;
  }

  async initialize(): Promise<boolean> {
    if (this.initialized) {
      return true;
    }

    await executeWithErrorHandling('Failed to initialize BreznService', async () => {
      await BreznModule.initBrezn();
      this.initialized = true;
      // eslint-disable-next-line no-console
      console.log('BreznService initialized successfully');
      return true;
    });

    return true;
  }

  async getPosts(): Promise<Post[]> {
    const posts = await executeWithErrorHandling('Error getting posts', () => BreznModule.getPosts());
    return posts.map((post: any) => ({
      id: post.id || 0,
      content: post.content,
      pseudonym: post.pseudonym,
      timestamp: post.timestamp,
      nodeId: post.node_id,
    }));
  }

  async createPost(content: string, pseudonym: string): Promise<boolean> {
    await executeWithErrorHandling('Error creating post', () => BreznModule.createPost(content, pseudonym));
    return true;
  }

  async getNetworkStatus(): Promise<NetworkStatus> {
    const status = await executeWithErrorHandling('Error getting network status', () => BreznModule.getNetworkStatus());
    return {
      networkEnabled: status.network_enabled,
      torEnabled: status.tor_enabled,
      peersCount: status.peers_count,
      discoveryPeersCount: status.discovery_peers_count,
      port: status.port,
      torSocksPort: status.tor_socks_port,
    };
  }

  async toggleNetwork(): Promise<boolean> {
    return executeWithErrorHandling('Error toggling network', () => BreznModule.toggleNetwork());
  }

  async toggleTor(): Promise<boolean> {
    return executeWithErrorHandling('Error toggling Tor', () => BreznModule.toggleTor());
  }

  async generateQRCode(): Promise<string> {
    return executeWithErrorHandling('Error generating QR code', () => BreznModule.generateQRCode());
  }

  async parseQRCode(qrData: string): Promise<PeerInfo> {
    const peerInfo = await executeWithErrorHandling('Error parsing QR code', () => BreznModule.parseQRCode(qrData));
    return {
      nodeId: peerInfo.node_id,
      publicKey: peerInfo.public_key,
      address: peerInfo.address,
      port: peerInfo.port,
      lastSeen: peerInfo.last_seen,
      capabilities: peerInfo.capabilities,
    };
  }

  async getConfig(): Promise<Config> {
    const config = await executeWithErrorHandling('Error getting config', () => BreznModule.getConfig());
    return {
      autoSave: config.auto_save,
      maxPosts: config.max_posts,
      defaultPseudonym: config.default_pseudonym,
      networkEnabled: config.network_enabled,
      networkPort: config.network_port,
      torEnabled: config.tor_enabled,
      torSocksPort: config.tor_socks_port,
    };
  }

  async updateConfig(config: Partial<Config>): Promise<boolean> {
    return executeWithErrorHandling('Error updating config', () => BreznModule.updateConfig(config));
  }

  async testP2PNetwork(): Promise<boolean> {
    return executeWithErrorHandling('Error testing P2P network', () => BreznModule.testP2PNetwork());
  }

  // Platform-specific methods
  async getDeviceInfo(): Promise<any> {
    if (Platform.OS === 'android') {
      return await BreznModule.getAndroidDeviceInfo();
    } else if (Platform.OS === 'ios') {
      return await BreznModule.getIOSDeviceInfo();
    }
    return {};
  }

  async requestPermissions(): Promise<boolean> {
    return executeWithErrorHandling('Error requesting permissions', () => BreznModule.requestPermissions());
  }

  async startBackgroundService(): Promise<boolean> {
    return executeWithErrorHandling('Error starting background service', () => BreznModule.startBackgroundService());
  }

  async stopBackgroundService(): Promise<boolean> {
    return executeWithErrorHandling('Error stopping background service', () => BreznModule.stopBackgroundService());
  }
}

export default BreznService.getInstance();