import { NativeModules, Platform } from 'react-native';
import { Post, NetworkStatus, Config, PeerInfo } from '../types/navigation';

const { BreznModule } = NativeModules;

export class BreznService {
  private static instance: BreznService;
  private initialized: boolean = false;

  static getInstance(): BreznService {
    if (!BreznService.instance) {
      BreznService.instance = new BreznService();
    }
    return BreznService.instance;
  }

  async initialize(): Promise<boolean> {
    if (this.initialized) {
      return true;
    }

    try {
      await BreznModule.initBrezn();
      this.initialized = true;
      console.log('BreznService initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize BreznService:', error);
      throw error;
    }
  }

  async getPosts(): Promise<Post[]> {
    try {
      const posts = await BreznModule.getPosts();
      return posts.map((post: any) => ({
        id: post.id || 0,
        content: post.content,
        pseudonym: post.pseudonym,
        timestamp: post.timestamp,
        nodeId: post.node_id,
      }));
    } catch (error) {
      console.error('Error getting posts:', error);
      throw error;
    }
  }

  async createPost(content: string, pseudonym: string): Promise<boolean> {
    try {
      await BreznModule.createPost(content, pseudonym);
      return true;
    } catch (error) {
      console.error('Error creating post:', error);
      throw error;
    }
  }

  async getNetworkStatus(): Promise<NetworkStatus> {
    try {
      const status = await BreznModule.getNetworkStatus();
      return {
        networkEnabled: status.network_enabled,
        torEnabled: status.tor_enabled,
        peersCount: status.peers_count,
        discoveryPeersCount: status.discovery_peers_count,
        port: status.port,
        torSocksPort: status.tor_socks_port,
      };
    } catch (error) {
      console.error('Error getting network status:', error);
      throw error;
    }
  }

  async toggleNetwork(): Promise<boolean> {
    try {
      const result = await BreznModule.toggleNetwork();
      return result;
    } catch (error) {
      console.error('Error toggling network:', error);
      throw error;
    }
  }

  async toggleTor(): Promise<boolean> {
    try {
      const result = await BreznModule.toggleTor();
      return result;
    } catch (error) {
      console.error('Error toggling Tor:', error);
      throw error;
    }
  }

  async generateQRCode(): Promise<string> {
    try {
      const qrCode = await BreznModule.generateQRCode();
      return qrCode;
    } catch (error) {
      console.error('Error generating QR code:', error);
      throw error;
    }
  }

  async parseQRCode(qrData: string): Promise<PeerInfo> {
    try {
      const peerInfo = await BreznModule.parseQRCode(qrData);
      return {
        nodeId: peerInfo.node_id,
        publicKey: peerInfo.public_key,
        address: peerInfo.address,
        port: peerInfo.port,
        lastSeen: peerInfo.last_seen,
        capabilities: peerInfo.capabilities,
      };
    } catch (error) {
      console.error('Error parsing QR code:', error);
      throw error;
    }
  }

  async getConfig(): Promise<Config> {
    try {
      const config = await BreznModule.getConfig();
      return {
        autoSave: config.auto_save,
        maxPosts: config.max_posts,
        defaultPseudonym: config.default_pseudonym,
        networkEnabled: config.network_enabled,
        networkPort: config.network_port,
        torEnabled: config.tor_enabled,
        torSocksPort: config.tor_socks_port,
      };
    } catch (error) {
      console.error('Error getting config:', error);
      throw error;
    }
  }

  async updateConfig(config: Partial<Config>): Promise<boolean> {
    try {
      const result = await BreznModule.updateConfig(config);
      return result;
    } catch (error) {
      console.error('Error updating config:', error);
      throw error;
    }
  }

  async testP2PNetwork(): Promise<boolean> {
    try {
      const result = await BreznModule.testP2PNetwork();
      return result;
    } catch (error) {
      console.error('Error testing P2P network:', error);
      throw error;
    }
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
    try {
      const permissions = await BreznModule.requestPermissions();
      return permissions;
    } catch (error) {
      console.error('Error requesting permissions:', error);
      throw error;
    }
  }

  async startBackgroundService(): Promise<boolean> {
    try {
      const result = await BreznModule.startBackgroundService();
      return result;
    } catch (error) {
      console.error('Error starting background service:', error);
      throw error;
    }
  }

  async stopBackgroundService(): Promise<boolean> {
    try {
      const result = await BreznModule.stopBackgroundService();
      return result;
    } catch (error) {
      console.error('Error stopping background service:', error);
      throw error;
    }
  }
}

export default BreznService.getInstance();