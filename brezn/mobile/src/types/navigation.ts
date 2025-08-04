export type RootStackParamList = {
  Main: undefined;
  CreatePost: undefined;
  QRScanner: undefined;
};

export type TabParamList = {
  Feed: undefined;
  Network: undefined;
  Settings: undefined;
};

export type Post = {
  id: number;
  content: string;
  pseudonym: string;
  timestamp: number;
  nodeId?: string;
};

export type NetworkStatus = {
  networkEnabled: boolean;
  torEnabled: boolean;
  peersCount: number;
  discoveryPeersCount: number;
  port: number;
  torSocksPort: number;
};

export type PeerInfo = {
  nodeId: string;
  publicKey: string;
  address: string;
  port: number;
  lastSeen: number;
  capabilities: string[];
};

export type Config = {
  autoSave: boolean;
  maxPosts: number;
  defaultPseudonym: string;
  networkEnabled: boolean;
  networkPort: number;
  torEnabled: boolean;
  torSocksPort: number;
};