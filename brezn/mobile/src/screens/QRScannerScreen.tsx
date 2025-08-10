import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Dimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../types/navigation';
import { BreznService } from '../services/BreznService';
import Icon from 'react-native-vector-icons/MaterialIcons';

type QRScannerScreenNavigationProp = StackNavigationProp<RootStackParamList, 'QRScanner'>;

const { width, height } = Dimensions.get('window');

const QRScannerScreen: React.FC = () => {
  const navigation = useNavigation<QRScannerScreenNavigationProp>();
  const [scanning, setScanning] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);

  useEffect(() => {
    requestCameraPermission();
  }, []);

  const requestCameraPermission = async () => {
    try {
      const granted = await BreznService.requestPermissions();
      setHasPermission(granted);
      
      if (granted) {
        setScanning(true);
      } else {
        Alert.alert(
          'Kamera-Berechtigung erforderlich',
          'Bitte erlaube den Zugriff auf die Kamera, um QR-Codes zu scannen.',
          [
            { text: 'Abbrechen', onPress: () => navigation.goBack() },
            { text: 'Einstellungen', onPress: () => requestCameraPermission() },
          ]
        );
      }
    } catch (error) {
      console.error('Error requesting camera permission:', error);
      Alert.alert('Fehler', 'Kamera-Berechtigung konnte nicht angefordert werden');
    }
  };

  const handleQRCodeScanned = async (qrData: string) => {
    try {
      setScanning(false);
      
      // Parse QR code data
      const peerInfo = await BreznService.parseQRCode(qrData);
      
      Alert.alert(
        'Peer gefunden',
        `Node: ${peerInfo.nodeId}\nAdresse: ${peerInfo.address}:${peerInfo.port}\n\nPeer zum Netzwerk hinzufügen?`,
        [
          { text: 'Abbrechen', style: 'cancel' },
          {
            text: 'Hinzufügen',
            onPress: async () => {
              try {
                // Add peer to network
                // This would be implemented in the native module
                Alert.alert('Erfolg', 'Peer wurde zum Netzwerk hinzugefügt!');
                navigation.goBack();
              } catch (error) {
                Alert.alert('Fehler', 'Peer konnte nicht hinzugefügt werden');
                console.error('Error adding peer:', error);
              }
            },
          },
        ]
      );
    } catch (error) {
      Alert.alert('Fehler', 'QR-Code konnte nicht verarbeitet werden');
      console.error('Error processing QR code:', error);
      setScanning(true);
    }
  };

  const handleManualInput = () => {
    Alert.prompt(
      'QR-Code manuell eingeben',
      'Gib die QR-Code-Daten ein:',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Hinzufügen',
          onPress: (qrData) => {
            if (qrData) {
              handleQRCodeScanned(qrData);
            }
          },
        },
      ],
      'plain-text'
    );
  };

  if (!hasPermission) {
    return (
      <View style={styles.container}>
        <View style={styles.permissionContainer}>
          <Icon name="camera-alt" size={64} color="#667eea" />
          <Text style={styles.permissionTitle}>Kamera-Berechtigung erforderlich</Text>
          <Text style={styles.permissionText}>
            Um QR-Codes zu scannen, benötigt Brezn Zugriff auf die Kamera.
          </Text>
          <TouchableOpacity
            style={styles.permissionButton}
            onPress={requestCameraPermission}
          >
            <Text style={styles.permissionButtonText}>Berechtigung erteilen</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.cancelButtonText}>Abbrechen</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Camera View Placeholder */}
      <View style={styles.cameraContainer}>
        <View style={styles.cameraPlaceholder}>
          <Icon name="qr-code-scanner" size={120} color="#667eea" />
          <Text style={styles.cameraText}>QR-Code Scanner</Text>
          <Text style={styles.cameraSubtext}>
            Richte die Kamera auf einen QR-Code
          </Text>
        </View>
        
        {/* Scanner Frame */}
        <View style={styles.scannerFrame}>
          <View style={styles.corner} />
          <View style={[styles.corner, styles.cornerTopRight]} />
          <View style={[styles.corner, styles.cornerBottomLeft]} />
          <View style={[styles.corner, styles.cornerBottomRight]} />
        </View>
      </View>

      {/* Controls */}
      <View style={styles.controlsContainer}>
        <View style={styles.controlButtons}>
          <TouchableOpacity
            style={styles.controlButton}
            onPress={handleManualInput}
          >
            <Icon name="keyboard" size={24} color="#fff" />
            <Text style={styles.controlButtonText}>Manuell eingeben</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.controlButton, styles.cancelControlButton]}
            onPress={() => navigation.goBack()}
          >
            <Icon name="close" size={24} color="#fff" />
            <Text style={styles.controlButtonText}>Abbrechen</Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.infoContainer}>
          <Icon name="info" size={16} color="#666" />
          <Text style={styles.infoText}>
            Scanne einen QR-Code von einem anderen Brezn-Gerät, um dem Netzwerk beizutreten
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#fff',
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 16,
    color: '#333',
    textAlign: 'center',
  },
  permissionText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 24,
  },
  permissionButton: {
    backgroundColor: '#667eea',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginTop: 24,
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
  },
  cameraContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    width: width,
    height: height * 0.7,
  },
  cameraText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 16,
  },
  cameraSubtext: {
    fontSize: 16,
    color: '#ccc',
    marginTop: 8,
    textAlign: 'center',
  },
  scannerFrame: {
    position: 'absolute',
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: '#667eea',
    borderRadius: 20,
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
    left: undefined,
    borderLeftWidth: 0,
    borderRightWidth: 4,
  },
  cornerBottomLeft: {
    bottom: -2,
    top: undefined,
    borderTopWidth: 0,
    borderBottomWidth: 4,
  },
  cornerBottomRight: {
    bottom: -2,
    right: -2,
    top: undefined,
    left: undefined,
    borderTopWidth: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
  },
  controlsContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    padding: 20,
  },
  controlButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  controlButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#667eea',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  cancelControlButton: {
    backgroundColor: '#f44336',
  },
  controlButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  infoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: 12,
    borderRadius: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#ccc',
    marginLeft: 8,
    flex: 1,
  },
});

export default QRScannerScreen;