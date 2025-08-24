import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { Camera, CameraType, BarCodeScanner } from 'expo-camera';
import { MaterialIcons } from '@expo/vector-icons';
import { p2pNetworkService } from '../services/P2PNetworkService';

const { width, height } = Dimensions.get('window');

interface QRCodeScannerProps {
  onPeerDiscovered?: (peerData: any) => void;
  onScanComplete?: () => void;
  onError?: (error: string) => void;
}

interface PeerQRData {
  nodeId: string;
  address: string;
  port: number;
  publicKey: string;
  capabilities: string[];
  timestamp: number;
}

export const QRCodeScanner: React.FC<QRCodeScannerProps> = ({
  onPeerDiscovered,
  onScanComplete,
  onError,
}) => {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [flashMode, setFlashMode] = useState<'off' | 'on'>('off');
  const [cameraType, setCameraType] = useState<CameraType>(CameraType.back);
  const [lastScannedData, setLastScannedData] = useState<string | null>(null);
  const [scanHistory, setScanHistory] = useState<PeerQRData[]>([]);

  const cameraRef = useRef<Camera>(null);

  useEffect(() => {
    requestCameraPermission();
  }, []);

  const requestCameraPermission = async () => {
    try {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
      
      if (status !== 'granted') {
        Alert.alert(
          'Kamera-Berechtigung erforderlich',
          'Diese App benötigt Zugriff auf die Kamera, um QR-Codes zu scannen.',
          [
            { text: 'Einstellungen öffnen', onPress: () => {} },
            { text: 'Abbrechen', style: 'cancel' },
          ]
        );
      }
    } catch (error) {
      console.error('Failed to request camera permission:', error);
      setHasPermission(false);
    }
  };

  const handleBarCodeScanned = async ({ type, data }: { type: string; data: string }) => {
    if (scanned || isScanning) return;

    try {
      setIsScanning(true);
      setLastScannedData(data);

      console.log('QR Code scanned:', { type, data });

      // Parse QR code data
      const peerData = parsePeerQRData(data);
      if (!peerData) {
        throw new Error('Ungültiger QR-Code: Peer-Daten konnten nicht gelesen werden');
      }

      // Validate timestamp (max 1 hour old)
      const now = Date.now();
      const maxAge = 60 * 60 * 1000; // 1 hour
      if (now - peerData.timestamp > maxAge) {
        throw new Error('QR-Code ist zu alt (max. 1 Stunde)');
      }

      // Add to scan history
      setScanHistory(prev => [peerData, ...prev.slice(0, 9)]); // Keep last 10

      // Try to connect to peer
      await connectToScannedPeer(peerData);

      // Mark as scanned
      setScanned(true);

      // Notify parent component
      if (onPeerDiscovered) {
        onPeerDiscovered(peerData);
      }

      // Show success message
      Alert.alert(
        'Peer entdeckt!',
        `Verbinde mit ${peerData.address}:${peerData.port}`,
        [
          {
            text: 'OK',
            onPress: () => {
              if (onScanComplete) {
                onScanComplete();
              }
            },
          },
        ]
      );

    } catch (error) {
      console.error('QR Code processing failed:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
      
      Alert.alert(
        'Scan fehlgeschlagen',
        errorMessage,
        [
          { text: 'Erneut versuchen', onPress: () => resetScanner() },
          { text: 'Abbrechen', style: 'cancel' },
        ]
      );

      if (onError) {
        onError(errorMessage);
      }
    } finally {
      setIsScanning(false);
    }
  };

  const parsePeerQRData = (data: string): PeerQRData | null => {
    try {
      // Try to parse as JSON first
      if (data.startsWith('{')) {
        const parsed = JSON.parse(data);
        return {
          nodeId: parsed.node_id || parsed.nodeId,
          address: parsed.address,
          port: parseInt(parsed.port),
          publicKey: parsed.public_key || parsed.publicKey,
          capabilities: parsed.capabilities || [],
          timestamp: parsed.timestamp || Date.now(),
        };
      }

      // Try to parse as URL format
      if (data.startsWith('brezn://')) {
        const url = new URL(data);
        return {
          nodeId: url.hostname,
          address: url.hostname,
          port: parseInt(url.port) || 8888,
          publicKey: url.searchParams.get('key') || '',
          capabilities: url.searchParams.get('capabilities')?.split(',') || [],
          timestamp: parseInt(url.searchParams.get('ts') || '0') || Date.now(),
        };
      }

      // Try to parse as custom format
      const parts = data.split('|');
      if (parts.length >= 4) {
        return {
          nodeId: parts[0],
          address: parts[1],
          port: parseInt(parts[2]),
          publicKey: parts[3],
          capabilities: parts[4] ? parts[4].split(',') : [],
          timestamp: parts[5] ? parseInt(parts[5]) : Date.now(),
        };
      }

      return null;
    } catch (error) {
      console.error('Failed to parse QR data:', error);
      return null;
    }
  };

  const connectToScannedPeer = async (peerData: PeerQRData): Promise<void> => {
    try {
      console.log('Attempting to connect to scanned peer:', peerData);

      // Use P2P network service to connect
      const success = await p2pNetworkService.connectToPeer(peerData.address, peerData.port);
      
      if (!success) {
        throw new Error('Verbindung zum Peer fehlgeschlagen');
      }

      console.log('Successfully connected to scanned peer');
    } catch (error) {
      console.error('Failed to connect to scanned peer:', error);
      throw error;
    }
  };

  const resetScanner = () => {
    setScanned(false);
    setLastScannedData(null);
  };

  const toggleFlash = () => {
    setFlashMode(prev => (prev === 'off' ? 'on' : 'off'));
  };

  const switchCamera = () => {
    setCameraType(prev => (prev === CameraType.back ? CameraType.front : CameraType.back));
  };

  const renderScanOverlay = () => (
    <View style={styles.overlay}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.iconButton} onPress={switchCamera}>
          <MaterialIcons name="flip-camera-ios" size={24} color="white" />
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.iconButton} onPress={toggleFlash}>
          <MaterialIcons 
            name={flashMode === 'on' ? 'flash-on' : 'flash-off'} 
            size={24} 
            color="white" 
          />
        </TouchableOpacity>
      </View>

      {/* Scan frame */}
      <View style={styles.scanFrame}>
        <View style={styles.corner} />
        <View style={[styles.corner, styles.cornerTopRight]} />
        <View style={[styles.corner, styles.cornerBottomLeft]} />
        <View style={[styles.corner, styles.cornerBottomRight]} />
      </View>

      {/* Instructions */}
      <View style={styles.instructions}>
        <Text style={styles.instructionsText}>
          Positioniere den QR-Code im Rahmen
        </Text>
        <Text style={styles.instructionsSubtext}>
          Der Code wird automatisch gescannt
        </Text>
      </View>

      {/* Bottom controls */}
      <View style={styles.bottomControls}>
        <TouchableOpacity 
          style={styles.scanButton} 
          onPress={resetScanner}
          disabled={!scanned}
        >
          <Text style={styles.scanButtonText}>
            {scanned ? 'Erneut scannen' : 'Scanne...'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderScanHistory = () => (
    <View style={styles.historyContainer}>
      <Text style={styles.historyTitle}>Letzte Scans</Text>
      {scanHistory.map((peer, index) => (
        <View key={index} style={styles.historyItem}>
          <View style={styles.historyInfo}>
            <Text style={styles.historyAddress}>
              {peer.address}:{peer.port}
            </Text>
            <Text style={styles.historyNodeId}>
              {peer.nodeId}
            </Text>
          </View>
          <TouchableOpacity 
            style={styles.reconnectButton}
            onPress={() => connectToScannedPeer(peer)}
          >
            <Text style={styles.reconnectButtonText}>Verbinden</Text>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );

  if (hasPermission === null) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#667eea" />
        <Text style={styles.permissionText}>Kamera-Berechtigung wird angefordert...</Text>
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={styles.container}>
        <MaterialIcons name="camera-alt" size={64} color="#ccc" />
        <Text style={styles.permissionText}>Kamera-Zugriff verweigert</Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestCameraPermission}>
          <Text style={styles.permissionButtonText}>Berechtigung erneut anfordern</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Camera
        ref={cameraRef}
        style={styles.camera}
        type={cameraType}
        flashMode={flashMode === 'on' ? 'torch' : 'off'}
        onBarCodeScanned={scanned ? undefined : handleBarCodeScanned}
        barCodeScannerSettings={{
          barCodeTypes: [BarCodeScanner.Constants.BarCodeType.qr],
        }}
      >
        {renderScanOverlay()}
      </Camera>

      {/* Scan history panel */}
      {scanHistory.length > 0 && (
        <View style={styles.historyPanel}>
          {renderScanHistory()}
        </View>
      )}

      {/* Loading overlay */}
      {isScanning && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#667eea" />
          <Text style={styles.loadingText}>Verbinde mit Peer...</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 20,
    paddingTop: 50,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanFrame: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 250,
    height: 250,
    marginLeft: -125,
    marginTop: -125,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  corner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: '#667eea',
    borderTopWidth: 4,
    borderLeftWidth: 4,
    top: -2,
    left: -2,
  },
  cornerTopRight: {
    right: -2,
    left: 'auto',
    borderLeftWidth: 0,
    borderRightWidth: 4,
  },
  cornerBottomLeft: {
    bottom: -2,
    top: 'auto',
    borderTopWidth: 0,
    borderBottomWidth: 4,
  },
  cornerBottomRight: {
    bottom: -2,
    right: -2,
    top: 'auto',
    left: 'auto',
    borderTopWidth: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
  },
  instructions: {
    position: 'absolute',
    bottom: 150,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  instructionsText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  instructionsSubtext: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 14,
    textAlign: 'center',
  },
  bottomControls: {
    position: 'absolute',
    bottom: 50,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  scanButton: {
    backgroundColor: '#667eea',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 25,
    minWidth: 150,
    alignItems: 'center',
  },
  scanButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  historyContainer: {
    backgroundColor: 'white',
    padding: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  historyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#333',
  },
  historyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  historyInfo: {
    flex: 1,
  },
  historyAddress: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  historyNodeId: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  reconnectButton: {
    backgroundColor: '#667eea',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 15,
  },
  reconnectButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  historyPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: height * 0.4,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: 'white',
    fontSize: 16,
    marginTop: 15,
  },
  permissionText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 20,
    paddingHorizontal: 20,
  },
  permissionButton: {
    backgroundColor: '#667eea',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 20,
    marginTop: 20,
  },
  permissionButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default QRCodeScanner;