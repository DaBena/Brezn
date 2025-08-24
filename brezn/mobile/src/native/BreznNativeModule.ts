import { NativeModules, NativeEventEmitter, EmitterSubscription } from 'react-native';

// FFI Result types
export enum BreznFFIResult {
  Success = 0,
  Error = 1,
}

// Post structure
export interface PostFFI {
  id: string | null;
  content: string;
  timestamp: number;
  pseudonym: string;
  nodeId: string | null;
}

// Network status structure
export interface NetworkStatusFFI {
  networkEnabled: boolean;
  torEnabled: boolean;
  peersCount: number;
  discoveryPeersCount: number;
  port: number;
  torSocksPort: number;
}

// Performance metrics
export interface PerformanceMetrics {
  memoryUsage: number;
  threadCount: number;
  timestamp: number;
}

// Device information
export interface DeviceInfo {
  platform: string;
  arch: string;
  rustVersion: string;
  buildTime: string;
}

// Event types
export interface BreznEvent {
  type: 'network_status_changed' | 'post_created' | 'peer_discovered' | 'tor_status_changed';
  data: any;
}

// Native module interface
interface BreznNativeModuleInterface {
  // Core functions
  init(networkPort: number, torSocksPort: number): Promise<boolean>;
  start(): Promise<boolean>;
  createPost(content: string, pseudonym: string): Promise<boolean>;
  getPosts(): Promise<PostFFI[]>;
  getNetworkStatus(): Promise<NetworkStatusFFI>;
  
  // Tor functions
  enableTor(): Promise<boolean>;
  disableTor(): Promise<void>;
  
  // QR code functions
  generateQrCode(): Promise<string>;
  parseQrCode(qrData: string): Promise<boolean>;
  
  // Utility functions
  getPerformanceMetrics(): Promise<PerformanceMetrics>;
  getDeviceInfo(): Promise<DeviceInfo>;
  testP2pNetwork(): Promise<boolean>;
  
  // Cleanup
  cleanup(): Promise<void>;
}

// Native module instance
const { BreznNativeModule } = NativeModules;

// Event emitter for native events
const eventEmitter = new NativeEventEmitter(BreznNativeModule);

/**
 * Brezn Native Module - High-level wrapper for FFI functions
 * Provides a clean TypeScript interface to the Rust backend
 */
export class BreznNativeModuleWrapper implements BreznNativeModuleInterface {
  private eventSubscriptions: EmitterSubscription[] = [];
  private isInitialized = false;

  constructor() {
    this.setupEventListeners();
  }

  /**
   * Setup event listeners for native events
   */
  private setupEventListeners(): void {
    const events: (keyof BreznEvent['type'])[] = [
      'network_status_changed',
      'post_created', 
      'peer_discovered',
      'tor_status_changed'
    ];

    events.forEach(eventType => {
      const subscription = eventEmitter.addListener(eventType, (data) => {
        console.log(`Brezn event: ${eventType}`, data);
      });
      this.eventSubscriptions.push(subscription);
    });
  }

  /**
   * Initialize the Brezn FFI with network configuration
   */
  async init(networkPort: number, torSocksPort: number): Promise<boolean> {
    try {
      const result = await BreznNativeModule.init(networkPort, torSocksPort);
      this.isInitialized = result;
      return result;
    } catch (error) {
      console.error('Failed to initialize Brezn FFI:', error);
      return false;
    }
  }

  /**
   * Start the Brezn application
   */
  async start(): Promise<boolean> {
    if (!this.isInitialized) {
      throw new Error('Brezn FFI not initialized. Call init() first.');
    }

    try {
      return await BreznNativeModule.start();
    } catch (error) {
      console.error('Failed to start Brezn app:', error);
      return false;
    }
  }

  /**
   * Create a new post
   */
  async createPost(content: string, pseudonym: string): Promise<boolean> {
    if (!this.isInitialized) {
      throw new Error('Brezn FFI not initialized. Call init() first.');
    }

    try {
      return await BreznNativeModule.createPost(content, pseudonym);
    } catch (error) {
      console.error('Failed to create post:', error);
      return false;
    }
  }

  /**
   * Get all posts
   */
  async getPosts(): Promise<PostFFI[]> {
    if (!this.isInitialized) {
      throw new Error('Brezn FFI not initialized. Call init() first.');
    }

    try {
      const posts = await BreznNativeModule.getPosts();
      return posts.map(post => ({
        id: post.id,
        content: post.content,
        timestamp: post.timestamp,
        pseudonym: post.pseudonym,
        nodeId: post.nodeId,
      }));
    } catch (error) {
      console.error('Failed to get posts:', error);
      return [];
    }
  }

  /**
   * Get network status information
   */
  async getNetworkStatus(): Promise<NetworkStatusFFI> {
    if (!this.isInitialized) {
      throw new Error('Brezn FFI not initialized. Call init() first.');
    }

    try {
      const status = await BreznNativeModule.getNetworkStatus();
      return {
        networkEnabled: status.networkEnabled,
        torEnabled: status.torEnabled,
        peersCount: status.peersCount,
        discoveryPeersCount: status.discoveryPeersCount,
        port: status.port,
        torSocksPort: status.torSocksPort,
      };
    } catch (error) {
      console.error('Failed to get network status:', error);
      throw error;
    }
  }

  /**
   * Enable Tor network
   */
  async enableTor(): Promise<boolean> {
    if (!this.isInitialized) {
      throw new Error('Brezn FFI not initialized. Call init() first.');
    }

    try {
      return await BreznNativeModule.enableTor();
    } catch (error) {
      console.error('Failed to enable Tor:', error);
      return false;
    }
  }

  /**
   * Disable Tor network
   */
  async disableTor(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Brezn FFI not initialized. Call init() first.');
    }

    try {
      await BreznNativeModule.disableTor();
    } catch (error) {
      console.error('Failed to disable Tor:', error);
    }
  }

  /**
   * Generate QR code for peer discovery
   */
  async generateQrCode(): Promise<string> {
    if (!this.isInitialized) {
      throw new Error('Brezn FFI not initialized. Call init() first.');
    }

    try {
      return await BreznNativeModule.generateQrCode();
    } catch (error) {
      console.error('Failed to generate QR code:', error);
      throw error;
    }
  }

  /**
   * Parse QR code to add peer
   */
  async parseQrCode(qrData: string): Promise<boolean> {
    if (!this.isInitialized) {
      throw new Error('Brezn FFI not initialized. Call init() first.');
    }

    try {
      return await BreznNativeModule.parseQrCode(qrData);
    } catch (error) {
      console.error('Failed to parse QR code:', error);
      return false;
    }
  }

  /**
   * Get performance metrics
   */
  async getPerformanceMetrics(): Promise<PerformanceMetrics> {
    if (!this.isInitialized) {
      throw new Error('Brezn FFI not initialized. Call init() first.');
    }

    try {
      return await BreznNativeModule.getPerformanceMetrics();
    } catch (error) {
      console.error('Failed to get performance metrics:', error);
      throw error;
    }
  }

  /**
   * Get device information
   */
  async getDeviceInfo(): Promise<DeviceInfo> {
    if (!this.isInitialized) {
      throw new Error('Brezn FFI not initialized. Call init() first.');
    }

    try {
      return await BreznNativeModule.getDeviceInfo();
    } catch (error) {
      console.error('Failed to get device info:', error);
      throw error;
    }
  }

  /**
   * Test P2P network functionality
   */
  async testP2pNetwork(): Promise<boolean> {
    if (!this.isInitialized) {
      throw new Error('Brezn FFI not initialized. Call init() first.');
    }

    try {
      return await BreznNativeModule.testP2pNetwork();
    } catch (error) {
      console.error('Failed to test P2P network:', error);
      return false;
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    try {
      await BreznNativeModule.cleanup();
      this.isInitialized = false;
      
      // Remove event listeners
      this.eventSubscriptions.forEach(subscription => subscription.remove());
      this.eventSubscriptions = [];
    } catch (error) {
      console.error('Failed to cleanup:', error);
    }
  }

  /**
   * Add event listener
   */
  addEventListener(eventType: BreznEvent['type'], callback: (data: any) => void): EmitterSubscription {
    const subscription = eventEmitter.addListener(eventType, callback);
    this.eventSubscriptions.push(subscription);
    return subscription;
  }

  /**
   * Remove event listener
   */
  removeEventListener(subscription: EmitterSubscription): void {
    subscription.remove();
    const index = this.eventSubscriptions.indexOf(subscription);
    if (index > -1) {
      this.eventSubscriptions.splice(index, 1);
    }
  }

  /**
   * Check if module is initialized
   */
  isModuleInitialized(): boolean {
    return this.isInitialized;
  }
}

// Export singleton instance
export const breznNative = new BreznNativeModuleWrapper();

// Export types
export type {
  PostFFI,
  NetworkStatusFFI,
  PerformanceMetrics,
  DeviceInfo,
  BreznEvent,
};