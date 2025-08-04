import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../types/navigation';
import { NetworkStatus } from '../types/navigation';
import { BreznService } from '../services/BreznService';
import Icon from 'react-native-vector-icons/MaterialIcons';

type NetworkScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Main'>;

const NetworkScreen: React.FC = () => {
  const navigation = useNavigation<NetworkScreenNavigationProp>();
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus | null>(null);
  const [qrCode, setQrCode] = useState<string>('');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadNetworkStatus();
  }, []);

  const loadNetworkStatus = async () => {
    try {
      setLoading(true);
      const status = await BreznService.getNetworkStatus();
      setNetworkStatus(status);
    } catch (error) {
      Alert.alert('Fehler', 'Netzwerk-Status konnte nicht geladen werden');
      console.error('Error loading network status:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadNetworkStatus();
    setRefreshing(false);
  };

  const handleToggleNetwork = async () => {
    try {
      const result = await BreznService.toggleNetwork();
      if (result) {
        Alert.alert('Erfolg', 'Netzwerk-Status wurde geändert');
        loadNetworkStatus();
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
        loadNetworkStatus();
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

  const renderStatusItem = (icon: string, label: string, value: string | number, color: string = '#333') => (
    <View style={styles.statusItem}>
      <Icon name={icon} size={20} color={color} />
      <Text style={styles.statusLabel}>{label}</Text>
      <Text style={[styles.statusValue, { color }]}>{value}</Text>
    </View>
  );

  const renderNetworkStatus = () => {
    if (!networkStatus) return null;

    return (
      <View style={styles.statusContainer}>
        <Text style={styles.sectionTitle}>Netzwerk-Status</Text>
        
        {renderStatusItem(
          'network-check',
          'Netzwerk',
          networkStatus.networkEnabled ? 'Aktiv' : 'Inaktiv',
          networkStatus.networkEnabled ? '#4caf50' : '#f44336'
        )}
        
        {renderStatusItem(
          'security',
          'Tor',
          networkStatus.torEnabled ? 'Aktiv' : 'Inaktiv',
          networkStatus.torEnabled ? '#4caf50' : '#f44336'
        )}
        
        {renderStatusItem(
          'people',
          'Peers',
          networkStatus.peersCount,
          networkStatus.peersCount > 0 ? '#4caf50' : '#666'
        )}
        
        {renderStatusItem(
          'search',
          'Discovery Peers',
          networkStatus.discoveryPeersCount,
          networkStatus.discoveryPeersCount > 0 ? '#4caf50' : '#666'
        )}
        
        {renderStatusItem(
          'router',
          'Port',
          networkStatus.port
        )}
        
        {renderStatusItem(
          'vpn-key',
          'Tor Port',
          networkStatus.torSocksPort
        )}
      </View>
    );
  };

  const renderQRCode = () => (
    <View style={styles.qrContainer}>
      <Text style={styles.sectionTitle}>QR-Code für Netzwerkbeitritt</Text>
      
      {qrCode ? (
        <View style={styles.qrCodeContainer}>
          <View style={styles.qrCodePlaceholder}>
            <Icon name="qr-code" size={64} color="#667eea" />
            <Text style={styles.qrCodeText}>QR-Code generiert</Text>
          </View>
          <Text style={styles.qrDataText} numberOfLines={3}>
            {qrCode}
          </Text>
        </View>
      ) : (
        <View style={styles.qrCodePlaceholder}>
          <Icon name="qr-code-2" size={64} color="#ccc" />
          <Text style={styles.qrCodeText}>QR-Code generieren</Text>
        </View>
      )}
      
      <View style={styles.qrButtons}>
        <TouchableOpacity
          style={styles.qrButton}
          onPress={handleGenerateQR}
        >
          <Icon name="qr-code" size={20} color="#fff" />
          <Text style={styles.qrButtonText}>QR-Code generieren</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.qrButton, styles.scanButton]}
          onPress={handleScanQR}
        >
          <Icon name="qr-code-scanner" size={20} color="#fff" />
          <Text style={styles.qrButtonText}>QR-Code scannen</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderControls = () => (
    <View style={styles.controlsContainer}>
      <Text style={styles.sectionTitle}>Netzwerk-Steuerung</Text>
      
      <View style={styles.controlButtons}>
        <TouchableOpacity
          style={[
            styles.controlButton,
            networkStatus?.networkEnabled ? styles.activeButton : styles.inactiveButton
          ]}
          onPress={handleToggleNetwork}
        >
          <Icon 
            name="network-check" 
            size={20} 
            color={networkStatus?.networkEnabled ? '#fff' : '#666'} 
          />
          <Text style={[
            styles.controlButtonText,
            networkStatus?.networkEnabled ? styles.activeButtonText : styles.inactiveButtonText
          ]}>
            Netzwerk {networkStatus?.networkEnabled ? 'stoppen' : 'starten'}
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[
            styles.controlButton,
            networkStatus?.torEnabled ? styles.activeButton : styles.inactiveButton
          ]}
          onPress={handleToggleTor}
        >
          <Icon 
            name="security" 
            size={20} 
            color={networkStatus?.torEnabled ? '#fff' : '#666'} 
          />
          <Text style={[
            styles.controlButtonText,
            networkStatus?.torEnabled ? styles.activeButtonText : styles.inactiveButtonText
          ]}>
            Tor {networkStatus?.torEnabled ? 'deaktivieren' : 'aktivieren'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Icon name="network-check" size={48} color="#667eea" />
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
      {renderNetworkStatus()}
      {renderQRCode()}
      {renderControls()}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
    marginTop: 16,
  },
  statusContainer: {
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
    marginBottom: 16,
    color: '#333',
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  statusLabel: {
    flex: 1,
    fontSize: 16,
    marginLeft: 12,
    color: '#333',
  },
  statusValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  qrContainer: {
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
  qrCodeContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  qrCodePlaceholder: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    marginBottom: 12,
  },
  qrCodeText: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
  },
  qrDataText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    fontFamily: 'monospace',
  },
  qrButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  qrButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#667eea',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginHorizontal: 4,
  },
  scanButton: {
    backgroundColor: '#4caf50',
  },
  qrButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginLeft: 8,
  },
  controlsContainer: {
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
  controlButtons: {
    gap: 12,
  },
  controlButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
  },
  activeButton: {
    backgroundColor: '#667eea',
    borderColor: '#667eea',
  },
  inactiveButton: {
    backgroundColor: '#f5f5f5',
    borderColor: '#ddd',
  },
  controlButtonText: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  activeButtonText: {
    color: '#fff',
  },
  inactiveButtonText: {
    color: '#666',
  },
});

export default NetworkScreen;