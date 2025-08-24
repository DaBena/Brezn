import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  RefreshControl,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../types/navigation';
import { NetworkStatus } from '../types/navigation';
import { BreznService } from '../services/BreznService';
import Icon from 'react-native-vector-icons/MaterialIcons';

type NetworkScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Main'>;

interface PeerInfo {
  node_id: string;
  address: string;
  port: number;
  capabilities: string[];
  health_score: number;
  last_seen: number;
  is_active: boolean;
}

interface NetworkMetrics {
  total_peers: number;
  active_peers: number;
  network_health: number;
  average_latency: number;
  posts_synced: number;
  conflicts_resolved: number;
}

const NetworkScreen: React.FC = () => {
  const navigation = useNavigation<NetworkScreenNavigationProp>();
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus | null>(null);
  const [networkMetrics, setNetworkMetrics] = useState<NetworkMetrics | null>(null);
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [qrCode, setQrCode] = useState<string>('');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    loadNetworkStatus();
    loadNetworkMetrics();
    loadPeers();
    
    // Auto-Refresh alle 10 Sekunden
    const interval = setInterval(() => {
      if (autoRefresh) {
        refreshNetworkData();
      }
    }, 10000);
    
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const loadNetworkStatus = async () => {
    try {
      const status = await BreznService.getNetworkStatus();
      setNetworkStatus(status);
    } catch (error) {
      console.error('Error loading network status:', error);
    }
  };

  const loadNetworkMetrics = async () => {
    try {
      // Simuliere Netzwerk-Metriken (später durch echte API ersetzen)
      const metrics: NetworkMetrics = {
        total_peers: 12,
        active_peers: 8,
        network_health: 0.85,
        average_latency: 45,
        posts_synced: 156,
        conflicts_resolved: 3,
      };
      setNetworkMetrics(metrics);
    } catch (error) {
      console.error('Error loading network metrics:', error);
    }
  };

  const loadPeers = async () => {
    try {
      // Simuliere Peer-Liste (später durch echte API ersetzen)
      const mockPeers: PeerInfo[] = [
        {
          node_id: "peer-001",
          address: "192.168.1.100",
          port: 8888,
          capabilities: ["posts", "p2p"],
          health_score: 0.95,
          last_seen: Date.now() - 30000,
          is_active: true,
        },
        {
          node_id: "peer-002",
          address: "192.168.1.101",
          port: 8888,
          capabilities: ["posts", "config"],
          health_score: 0.87,
          last_seen: Date.now() - 45000,
          is_active: true,
        },
        {
          node_id: "peer-003",
          address: "192.168.1.102",
          port: 8888,
          capabilities: ["p2p"],
          health_score: 0.72,
          last_seen: Date.now() - 120000,
          is_active: false,
        },
      ];
      setPeers(mockPeers);
    } catch (error) {
      console.error('Error loading peers:', error);
    } finally {
      setLoading(false);
    }
  };

  const refreshNetworkData = async () => {
    await Promise.all([
      loadNetworkStatus(),
      loadNetworkMetrics(),
      loadPeers(),
    ]);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshNetworkData();
    setRefreshing(false);
  };

  const handleToggleNetwork = async () => {
    try {
      const result = await BreznService.toggleNetwork();
      if (result) {
        Alert.alert('Erfolg', 'Netzwerk-Status wurde geändert');
        refreshNetworkData();
      }
    } catch (error) {
      Alert.alert('Fehler', 'Netzwerk konnte nicht umgeschaltet werden');
      console.error('Error toggling network:', error);
    }
  };

  const handleToggleTor = async () => {
    try {
      const result = await BreznService.toggleTor();
      if (result) {
        Alert.alert('Erfolg', 'Tor-Status wurde geändert');
        refreshNetworkData();
      }
    } catch (error) {
      Alert.alert('Fehler', 'Tor konnte nicht umgeschaltet werden');
      console.error('Error toggling Tor:', error);
    }
  };

  const handleGenerateQR = async () => {
    try {
      const qrData = await BreznService.generateQRCode();
      setQrCode(qrData);
    } catch (error) {
      Alert.alert('Fehler', 'QR-Code konnte nicht generiert werden');
      console.error('Error generating QR code:', error);
    }
  };

  const handleScanQR = () => {
    navigation.navigate('QRScanner');
  };

  const handlePeerAction = (peer: PeerInfo, action: 'connect' | 'disconnect' | 'remove') => {
    Alert.alert(
      'Peer-Aktion',
      `Möchten Sie ${action === 'connect' ? 'mit' : action === 'disconnect' ? 'von' : ''} ${peer.node_id} ${action === 'connect' ? 'verbinden' : action === 'disconnect' ? 'trennen' : 'entfernen'}?`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Bestätigen',
          onPress: () => {
            // TODO: Implementiere echte Peer-Aktionen
            console.log(`${action} peer: ${peer.node_id}`);
            refreshNetworkData();
          },
        },
      ]
    );
  };

  const renderStatusItem = (icon: string, label: string, value: string | number, color: string = '#333') => (
    <View style={styles.statusItem}>
      <Icon name={icon} size={20} color={color} />
      <Text style={styles.statusLabel}>{label}</Text>
      <Text style={[styles.statusValue, { color }]}>{value}</Text>
    </View>
  );

  const renderPeerItem = ({ item }: { item: PeerInfo }) => (
    <View style={styles.peerItem}>
      <View style={styles.peerHeader}>
        <View style={styles.peerInfo}>
          <Text style={styles.peerId}>{item.node_id}</Text>
          <Text style={styles.peerAddress}>{item.address}:{item.port}</Text>
        </View>
        <View style={styles.peerStatus}>
          <View style={[styles.healthIndicator, { backgroundColor: getHealthColor(item.health_score) }]} />
          <Text style={styles.healthScore}>{Math.round(item.health_score * 100)}%</Text>
        </View>
      </View>
      
      <View style={styles.peerCapabilities}>
        {item.capabilities.map((cap, index) => (
          <View key={index} style={styles.capabilityTag}>
            <Text style={styles.capabilityText}>{cap}</Text>
          </View>
        ))}
      </View>
      
      <View style={styles.peerActions}>
        <TouchableOpacity
          style={[styles.actionButton, item.is_active ? styles.disconnectButton : styles.connectButton]}
          onPress={() => handlePeerAction(item, item.is_active ? 'disconnect' : 'connect')}
        >
          <Icon 
            name={item.is_active ? 'link-off' : 'link'} 
            size={16} 
            color="#fff" 
          />
          <Text style={styles.actionButtonText}>
            {item.is_active ? 'Trennen' : 'Verbinden'}
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={styles.removeButton}
          onPress={() => handlePeerAction(item, 'remove')}
        >
          <Icon name="delete" size={16} color="#fff" />
          <Text style={styles.actionButtonText}>Entfernen</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const getHealthColor = (health: number): string => {
    if (health >= 0.8) return '#4CAF50'; // Grün
    if (health >= 0.6) return '#FF9800'; // Orange
    return '#F44336'; // Rot
  };

  const renderNetworkStatus = () => {
    if (!networkStatus) return null;

    return (
      <View style={styles.statusSection}>
        <Text style={styles.sectionTitle}>Netzwerk-Status</Text>
        <View style={styles.statusGrid}>
          {renderStatusItem(
            'wifi',
            'Netzwerk',
            networkStatus.network_enabled ? 'Aktiv' : 'Inaktiv',
            networkStatus.network_enabled ? '#4CAF50' : '#F44336'
          )}
          {renderStatusItem(
            'security',
            'Tor',
            networkStatus.tor_enabled ? 'Aktiv' : 'Inaktiv',
            networkStatus.tor_enabled ? '#4CAF50' : '#F44336'
          )}
          {renderStatusItem(
            'router',
            'Port',
            networkStatus.network_port,
            '#2196F3'
          )}
          {renderStatusItem(
            'discovery',
            'Discovery',
            networkStatus.discovery_active ? 'Aktiv' : 'Inaktiv',
            networkStatus.discovery_active ? '#4CAF50' : '#F44336'
          )}
        </View>
      </View>
    );
  };

  const renderNetworkMetrics = () => {
    if (!networkMetrics) return null;

    return (
      <View style={styles.metricsSection}>
        <Text style={styles.sectionTitle}>Netzwerk-Metriken</Text>
        <View style={styles.metricsGrid}>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{networkMetrics.total_peers}</Text>
            <Text style={styles.metricLabel}>Gesamt Peers</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{networkMetrics.active_peers}</Text>
            <Text style={styles.metricLabel}>Aktive Peers</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{Math.round(networkMetrics.network_health * 100)}%</Text>
            <Text style={styles.metricLabel}>Netzwerk-Gesundheit</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{networkMetrics.average_latency}ms</Text>
            <Text style={styles.metricLabel}>Durchschn. Latenz</Text>
          </View>
        </View>
        
        <View style={styles.syncMetrics}>
          <View style={styles.syncMetric}>
            <Icon name="sync" size={20} color="#4CAF50" />
            <Text style={styles.syncMetricText}>
              {networkMetrics.posts_synced} Posts synchronisiert
            </Text>
          </View>
          <View style={styles.syncMetric}>
            <Icon name="warning" size={20} color="#FF9800" />
            <Text style={styles.syncMetricText}>
              {networkMetrics.conflicts_resolved} Konflikte gelöst
            </Text>
          </View>
        </View>
      </View>
    );
  };

  const renderPeerList = () => {
    if (peers.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Icon name="people-outline" size={48} color="#ccc" />
          <Text style={styles.emptyStateText}>Keine Peers gefunden</Text>
          <Text style={styles.emptyStateSubtext}>
            Starten Sie das Netzwerk, um Peers zu entdecken
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.peersSection}>
        <View style={styles.peersHeader}>
          <Text style={styles.sectionTitle}>Verbundene Peers ({peers.length})</Text>
          <TouchableOpacity
            style={styles.autoRefreshToggle}
            onPress={() => setAutoRefresh(!autoRefresh)}
          >
            <Icon 
              name={autoRefresh ? 'autorenew' : 'autorenew-off'} 
              size={20} 
              color={autoRefresh ? '#4CAF50' : '#ccc'} 
            />
          </TouchableOpacity>
        </View>
        
        <FlatList
          data={peers}
          renderItem={renderPeerItem}
          keyExtractor={(item) => item.node_id}
          showsVerticalScrollIndicator={false}
          style={styles.peerList}
        />
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#667eea" />
        <Text style={styles.loadingText}>Lade Netzwerk-Status...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Netzwerk-Steuerung */}
      <View style={styles.controlSection}>
        <Text style={styles.sectionTitle}>Netzwerk-Steuerung</Text>
        <View style={styles.controlButtons}>
          <TouchableOpacity
            style={[styles.controlButton, networkStatus?.network_enabled ? styles.activeButton : styles.inactiveButton]}
            onPress={handleToggleNetwork}
          >
            <Icon 
              name="wifi" 
              size={20} 
              color={networkStatus?.network_enabled ? "#fff" : "#666"} 
            />
            <Text style={[styles.controlButtonText, { color: networkStatus?.network_enabled ? "#fff" : "#666" }]}>
              {networkStatus?.network_enabled ? 'Netzwerk Stoppen' : 'Netzwerk Starten'}
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.controlButton, networkStatus?.tor_enabled ? styles.activeButton : styles.inactiveButton]}
            onPress={handleToggleTor}
          >
            <Icon 
              name="security" 
              size={20} 
              color={networkStatus?.tor_enabled ? "#fff" : "#666"} 
            />
            <Text style={[styles.controlButtonText, { color: networkStatus?.tor_enabled ? "#fff" : "#666" }]}>
              {networkStatus?.tor_enabled ? 'Tor Stoppen' : 'Tor Starten'}
            </Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.qrSection}>
          <TouchableOpacity style={styles.qrButton} onPress={handleGenerateQR}>
            <Icon name="qr-code" size={20} color="#fff" />
            <Text style={styles.qrButtonText}>QR-Code Generieren</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.qrButton} onPress={handleScanQR}>
            <Icon name="qr-code-scanner" size={20} color="#fff" />
            <Text style={styles.qrButtonText}>QR-Code Scannen</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Netzwerk-Status */}
      {renderNetworkStatus()}

      {/* Netzwerk-Metriken */}
      {renderNetworkMetrics()}

      {/* Peer-Liste */}
      {renderPeerList()}

      {/* QR-Code Anzeige */}
      {qrCode ? (
        <View style={styles.qrDisplaySection}>
          <Text style={styles.sectionTitle}>Generierter QR-Code</Text>
          <Text style={styles.qrCodeText}>{qrCode}</Text>
          <TouchableOpacity
            style={styles.copyButton}
            onPress={() => {
              // TODO: Implementiere Copy-to-Clipboard
              Alert.alert('Info', 'QR-Code in Zwischenablage kopiert');
            }}
          >
            <Icon name="content-copy" size={16} color="#fff" />
            <Text style={styles.copyButtonText}>Kopieren</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  controlSection: {
    backgroundColor: '#fff',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  controlButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  controlButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    marginHorizontal: 4,
  },
  activeButton: {
    backgroundColor: '#F44336',
  },
  inactiveButton: {
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  controlButtonText: {
    marginLeft: 8,
    fontWeight: '600',
    fontSize: 14,
  },
  qrSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  qrButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#667eea',
    padding: 12,
    borderRadius: 8,
    marginHorizontal: 4,
  },
  qrButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
    marginLeft: 8,
  },
  statusSection: {
    backgroundColor: '#fff',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  statusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  statusItem: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    marginBottom: 8,
  },
  statusLabel: {
    marginLeft: 8,
    fontSize: 14,
    color: '#666',
    flex: 1,
  },
  statusValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  metricsSection: {
    backgroundColor: '#fff',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  metricCard: {
    width: '48%',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    marginBottom: 8,
  },
  metricValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#667eea',
  },
  metricLabel: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginTop: 4,
  },
  syncMetrics: {
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 16,
  },
  syncMetric: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  syncMetricText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#666',
  },
  peersSection: {
    backgroundColor: '#fff',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  peersHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  autoRefreshToggle: {
    padding: 8,
  },
  peerList: {
    maxHeight: 400,
  },
  peerItem: {
    backgroundColor: '#f8f9fa',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  peerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  peerInfo: {
    flex: 1,
  },
  peerId: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  peerAddress: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  peerStatus: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  healthIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  healthScore: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  peerCapabilities: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  capabilityTag: {
    backgroundColor: '#667eea',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 8,
    marginBottom: 4,
  },
  capabilityText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  peerActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    flex: 1,
    marginHorizontal: 4,
  },
  connectButton: {
    backgroundColor: '#4CAF50',
  },
  disconnectButton: {
    backgroundColor: '#FF9800',
  },
  removeButton: {
    backgroundColor: '#F44336',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  emptyState: {
    alignItems: 'center',
    padding: 32,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#666',
    marginTop: 16,
    fontWeight: '600',
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
  },
  qrDisplaySection: {
    backgroundColor: '#fff',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  qrCodeText: {
    fontSize: 12,
    color: '#666',
    fontFamily: 'monospace',
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 6,
    marginBottom: 16,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#667eea',
    padding: 12,
    borderRadius: 8,
  },
  copyButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
    marginLeft: 8,
  },
});

export default NetworkScreen;