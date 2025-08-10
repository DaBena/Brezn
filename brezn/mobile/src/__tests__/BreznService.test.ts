import { BreznService } from '../services/BreznService';
import { Post, NetworkStatus, Config, PeerInfo } from '../types/navigation';

// Mock NativeModules
jest.mock('react-native', () => ({
  NativeModules: {
    BreznModule: {
      initBrezn: jest.fn(),
      getPosts: jest.fn(),
      createPost: jest.fn(),
      getNetworkStatus: jest.fn(),
      toggleNetwork: jest.fn(),
      toggleTor: jest.fn(),
      generateQRCode: jest.fn(),
      parseQRCode: jest.fn(),
      getConfig: jest.fn(),
      updateConfig: jest.fn(),
      testP2PNetwork: jest.fn(),
      requestPermissions: jest.fn(),
      startBackgroundService: jest.fn(),
      stopBackgroundService: jest.fn(),
      getAndroidDeviceInfo: jest.fn(),
    },
  },
  Platform: {
    OS: 'android',
  },
}));

describe('BreznService', () => {
  let breznService: BreznService;

  beforeEach(() => {
    breznService = BreznService.getInstance();
    jest.clearAllMocks();
  });

  describe('initialize', () => {
    it('should initialize successfully', async () => {
      const { BreznModule } = require('react-native').NativeModules;
      BreznModule.initBrezn.mockResolvedValue(true);

      const result = await breznService.initialize();
      
      expect(result).toBe(true);
      expect(BreznModule.initBrezn).toHaveBeenCalledTimes(1);
    });

    it('should handle initialization failure', async () => {
      const { BreznModule } = require('react-native').NativeModules;
      BreznModule.initBrezn.mockRejectedValue(new Error('Init failed'));

      await expect(breznService.initialize()).rejects.toThrow('Init failed');
    });

    it('should not reinitialize if already initialized', async () => {
      const { BreznModule } = require('react-native').NativeModules;
      BreznModule.initBrezn.mockResolvedValue(true);

      await breznService.initialize();
      await breznService.initialize();

      expect(BreznModule.initBrezn).toHaveBeenCalledTimes(1);
    });
  });

  describe('getPosts', () => {
    it('should return posts successfully', async () => {
      const { BreznModule } = require('react-native').NativeModules;
      const mockPosts = [
        {
          id: 1,
          content: 'Test post 1',
          pseudonym: 'TestUser1',
          timestamp: 1234567890,
          node_id: 'node1',
        },
        {
          id: 2,
          content: 'Test post 2',
          pseudonym: 'TestUser2',
          timestamp: 1234567891,
          node_id: 'node2',
        },
      ];
      BreznModule.getPosts.mockResolvedValue(mockPosts);

      const posts = await breznService.getPosts();

      expect(posts).toHaveLength(2);
      expect(posts[0]).toEqual({
        id: 1,
        content: 'Test post 1',
        pseudonym: 'TestUser1',
        timestamp: 1234567890,
        nodeId: 'node1',
      });
      expect(BreznModule.getPosts).toHaveBeenCalledTimes(1);
    });

    it('should handle getPosts error', async () => {
      const { BreznModule } = require('react-native').NativeModules;
      BreznModule.getPosts.mockRejectedValue(new Error('Failed to get posts'));

      await expect(breznService.getPosts()).rejects.toThrow('Failed to get posts');
    });
  });

  describe('createPost', () => {
    it('should create post successfully', async () => {
      const { BreznModule } = require('react-native').NativeModules;
      BreznModule.createPost.mockResolvedValue(true);

      const result = await breznService.createPost('Test content', 'TestUser');

      expect(result).toBe(true);
      expect(BreznModule.createPost).toHaveBeenCalledWith('Test content', 'TestUser');
    });

    it('should handle createPost error', async () => {
      const { BreznModule } = require('react-native').NativeModules;
      BreznModule.createPost.mockRejectedValue(new Error('Failed to create post'));

      await expect(breznService.createPost('Test', 'User')).rejects.toThrow('Failed to create post');
    });
  });

  describe('getNetworkStatus', () => {
    it('should return network status successfully', async () => {
      const { BreznModule } = require('react-native').NativeModules;
      const mockStatus = {
        network_enabled: true,
        tor_enabled: false,
        peers_count: 5,
        discovery_peers_count: 3,
        port: 8888,
        tor_socks_port: 9050,
        node_id: 'test-node',
      };
      BreznModule.getNetworkStatus.mockResolvedValue(mockStatus);

      const status = await breznService.getNetworkStatus();

      expect(status).toEqual({
        networkEnabled: true,
        torEnabled: false,
        peersCount: 5,
        discoveryPeersCount: 3,
        port: 8888,
        torSocksPort: 9050,
      });
      expect(BreznModule.getNetworkStatus).toHaveBeenCalledTimes(1);
    });
  });

  describe('toggleNetwork', () => {
    it('should toggle network successfully', async () => {
      const { BreznModule } = require('react-native').NativeModules;
      BreznModule.toggleNetwork.mockResolvedValue(true);

      const result = await breznService.toggleNetwork();

      expect(result).toBe(true);
      expect(BreznModule.toggleNetwork).toHaveBeenCalledTimes(1);
    });
  });

  describe('toggleTor', () => {
    it('should toggle Tor successfully', async () => {
      const { BreznModule } = require('react-native').NativeModules;
      BreznModule.toggleTor.mockResolvedValue(true);

      const result = await breznService.toggleTor();

      expect(result).toBe(true);
      expect(BreznModule.toggleTor).toHaveBeenCalledTimes(1);
    });
  });

  describe('generateQRCode', () => {
    it('should generate QR code successfully', async () => {
      const { BreznModule } = require('react-native').NativeModules;
      const mockQRCode = '{"node_id":"test","address":"127.0.0.1","port":8888}';
      BreznModule.generateQRCode.mockResolvedValue(mockQRCode);

      const qrCode = await breznService.generateQRCode();

      expect(qrCode).toBe(mockQRCode);
      expect(BreznModule.generateQRCode).toHaveBeenCalledTimes(1);
    });
  });

  describe('parseQRCode', () => {
    it('should parse QR code successfully', async () => {
      const { BreznModule } = require('react-native').NativeModules;
      const mockPeerInfo = {
        node_id: 'test-node',
        public_key: 'test-key',
        address: '127.0.0.1',
        port: 8888,
        last_seen: 1234567890,
        capabilities: ['posts', 'config'],
      };
      BreznModule.parseQRCode.mockResolvedValue(mockPeerInfo);

      const peerInfo = await breznService.parseQRCode('test-qr-data');

      expect(peerInfo).toEqual({
        nodeId: 'test-node',
        publicKey: 'test-key',
        address: '127.0.0.1',
        port: 8888,
        lastSeen: 1234567890,
        capabilities: ['posts', 'config'],
      });
      expect(BreznModule.parseQRCode).toHaveBeenCalledWith('test-qr-data');
    });
  });

  describe('getConfig', () => {
    it('should return config successfully', async () => {
      const { BreznModule } = require('react-native').NativeModules;
      const mockConfig = {
        auto_save: true,
        max_posts: 1000,
        default_pseudonym: 'TestUser',
        network_enabled: true,
        network_port: 8888,
        tor_enabled: false,
        tor_socks_port: 9050,
      };
      BreznModule.getConfig.mockResolvedValue(mockConfig);

      const config = await breznService.getConfig();

      expect(config).toEqual({
        autoSave: true,
        maxPosts: 1000,
        defaultPseudonym: 'TestUser',
        networkEnabled: true,
        networkPort: 8888,
        torEnabled: false,
        torSocksPort: 9050,
      });
    });
  });

  describe('updateConfig', () => {
    it('should update config successfully', async () => {
      const { BreznModule } = require('react-native').NativeModules;
      BreznModule.updateConfig.mockResolvedValue(true);

      const configUpdate = {
        defaultPseudonym: 'NewUser',
        maxPosts: 2000,
      };

      const result = await breznService.updateConfig(configUpdate);

      expect(result).toBe(true);
      expect(BreznModule.updateConfig).toHaveBeenCalledWith(configUpdate);
    });
  });

  describe('testP2PNetwork', () => {
    it('should test P2P network successfully', async () => {
      const { BreznModule } = require('react-native').NativeModules;
      BreznModule.testP2PNetwork.mockResolvedValue(true);

      const result = await breznService.testP2PNetwork();

      expect(result).toBe(true);
      expect(BreznModule.testP2PNetwork).toHaveBeenCalledTimes(1);
    });
  });

  describe('requestPermissions', () => {
    it('should request permissions successfully', async () => {
      const { BreznModule } = require('react-native').NativeModules;
      BreznModule.requestPermissions.mockResolvedValue(true);

      const result = await breznService.requestPermissions();

      expect(result).toBe(true);
      expect(BreznModule.requestPermissions).toHaveBeenCalledTimes(1);
    });
  });

  describe('backgroundService', () => {
    it('should start background service successfully', async () => {
      const { BreznModule } = require('react-native').NativeModules;
      BreznModule.startBackgroundService.mockResolvedValue(true);

      const result = await breznService.startBackgroundService();

      expect(result).toBe(true);
      expect(BreznModule.startBackgroundService).toHaveBeenCalledTimes(1);
    });

    it('should stop background service successfully', async () => {
      const { BreznModule } = require('react-native').NativeModules;
      BreznModule.stopBackgroundService.mockResolvedValue(true);

      const result = await breznService.stopBackgroundService();

      expect(result).toBe(true);
      expect(BreznModule.stopBackgroundService).toHaveBeenCalledTimes(1);
    });
  });

  describe('getDeviceInfo', () => {
    it('should return Android device info', async () => {
      const { BreznModule } = require('react-native').NativeModules;
      const mockDeviceInfo = {
        manufacturer: 'Samsung',
        model: 'Galaxy S21',
        version: 'Android 12',
        sdk: '31',
      };
      BreznModule.getAndroidDeviceInfo.mockResolvedValue(mockDeviceInfo);

      const deviceInfo = await breznService.getDeviceInfo();

      expect(deviceInfo).toEqual(mockDeviceInfo);
      expect(BreznModule.getAndroidDeviceInfo).toHaveBeenCalledTimes(1);
    });
  });
});