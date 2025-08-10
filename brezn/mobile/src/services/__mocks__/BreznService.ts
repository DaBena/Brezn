export const BreznService = {
  initialize: jest.fn().mockResolvedValue(true),
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
  getDeviceInfo: jest.fn(),
};

export default BreznService;