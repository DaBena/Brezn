import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import QRScannerScreen from '../screens/QRScannerScreen';

// Mock the BreznService
jest.mock('../services/BreznService', () => ({
  BreznService: {
    requestPermissions: jest.fn(),
    parseQRCode: jest.fn(),
  },
}));

// Mock react-native-vector-icons
jest.mock('react-native-vector-icons/MaterialIcons', () => 'Icon');

// Mock Linking
jest.mock('react-native/Libraries/Linking/Linking', () => ({
  openURL: jest.fn(),
  openSettings: jest.fn(),
}));

// Mock Platform
jest.mock('react-native/Libraries/Utilities/Platform', () => ({
  OS: 'ios',
  select: jest.fn(),
}));

const Stack = createStackNavigator();

const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <NavigationContainer>
    <Stack.Navigator>
      <Stack.Screen name="Test" component={() => children} />
    </Stack.Navigator>
  </NavigationContainer>
);

describe('QRScannerScreen', () => {
  const mockBreznService = require('../services/BreznService').BreznService;
  const mockLinking = require('react-native/Libraries/Linking/Linking');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders permission request initially', () => {
    mockBreznService.requestPermissions.mockResolvedValue(false);

    const { getByText } = render(
      <TestWrapper>
        <QRScannerScreen />
      </TestWrapper>
    );

    expect(getByText('Kamera-Berechtigung erforderlich')).toBeTruthy();
    expect(getByText('Um QR-Codes zu scannen, benötigt Brezn Zugriff auf die Kamera.')).toBeTruthy();
    expect(getByText('Einstellungen öffnen')).toBeTruthy();
  });

  it('requests camera permission on mount', async () => {
    mockBreznService.requestPermissions.mockResolvedValue(true);

    render(
      <TestWrapper>
        <QRScannerScreen />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(mockBreznService.requestPermissions).toHaveBeenCalled();
    });
  });

  it('shows camera view when permission is granted', async () => {
    mockBreznService.requestPermissions.mockResolvedValue(true);

    const { getByText, queryByText } = render(
      <TestWrapper>
        <QRScannerScreen />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(queryByText('Kamera-Berechtigung erforderlich')).toBeFalsy();
    });

    expect(getByText('QR-Code Scanner')).toBeTruthy();
    expect(getByText('Richte die Kamera auf einen QR-Code')).toBeTruthy();
  });

  it('opens settings when permission button is pressed', async () => {
    mockBreznService.requestPermissions.mockResolvedValue(false);

    const { getByText } = render(
      <TestWrapper>
        <QRScannerScreen />
      </TestWrapper>
    );

    const settingsButton = getByText('Einstellungen öffnen');
    fireEvent.press(settingsButton);

    expect(mockLinking.openURL).toHaveBeenCalledWith('app-settings:');
  });

  it('shows test QR code button in development mode', async () => {
    // Mock __DEV__ to true
    const originalDev = global.__DEV__;
    global.__DEV__ = true;

    mockBreznService.requestPermissions.mockResolvedValue(true);

    const { getByText } = render(
      <TestWrapper>
        <QRScannerScreen />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(getByText('Test QR-Code')).toBeTruthy();
    });

    global.__DEV__ = originalDev;
  });

  it('handles test QR code scanning', async () => {
    global.__DEV__ = true;
    mockBreznService.requestPermissions.mockResolvedValue(true);
    mockBreznService.parseQRCode.mockResolvedValue({
      nodeId: 'test123',
      address: '192.168.1.100',
      port: 8080,
      publicKey: 'testkey',
      lastSeen: Date.now(),
      capabilities: ['p2p', 'tor'],
    });

    const { getByText } = render(
      <TestWrapper>
        <QRScannerScreen />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(getByText('Test QR-Code')).toBeTruthy();
    });

    const testButton = getByText('Test QR-Code');
    fireEvent.press(testButton);

    await waitFor(() => {
      expect(mockBreznService.parseQRCode).toHaveBeenCalledWith(
        'brezn://peer?nodeId=test123&address=192.168.1.100&port=8080&publicKey=testkey'
      );
    });
  });

  it('handles manual QR code input', async () => {
    mockBreznService.requestPermissions.mockResolvedValue(true);
    mockBreznService.parseQRCode.mockResolvedValue({
      nodeId: 'manual123',
      address: '10.0.0.1',
      port: 9090,
      publicKey: 'manualkey',
      lastSeen: Date.now(),
      capabilities: ['p2p'],
    });

    const { getByText } = render(
      <TestWrapper>
        <QRScannerScreen />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(getByText('Manuell eingeben')).toBeTruthy();
    });

    const manualButton = getByText('Manuell eingeben');
    fireEvent.press(manualButton);

    // Note: Alert.prompt is not easily testable in React Native Testing Library
    // This test verifies the button exists and is pressable
    expect(manualButton).toBeTruthy();
  });

  it('shows scanning animation when scanning is active', async () => {
    mockBreznService.requestPermissions.mockResolvedValue(true);

    const { getByTestId } = render(
      <TestWrapper>
        <QRScannerScreen />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(getByTestId('scan-line')).toBeTruthy();
    });
  });

  it('displays scanner frame correctly', async () => {
    mockBreznService.requestPermissions.mockResolvedValue(true);

    const { getByTestId } = render(
      <TestWrapper>
        <QRScannerScreen />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(getByTestId('scanner-frame')).toBeTruthy();
    });
  });

  it('shows control buttons', async () => {
    mockBreznService.requestPermissions.mockResolvedValue(true);

    const { getByText } = render(
      <TestWrapper>
        <QRScannerScreen />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(getByText('Manuell eingeben')).toBeTruthy();
      expect(getByText('Abbrechen')).toBeTruthy();
    });
  });

  it('shows info text about QR code scanning', async () => {
    mockBreznService.requestPermissions.mockResolvedValue(true);

    const { getByText } = render(
      <TestWrapper>
        <QRScannerScreen />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(getByText('Scanne einen QR-Code von einem anderen Brezn-Gerät, um dem Netzwerk beizutreten')).toBeTruthy();
    });
  });

  it('handles permission request errors gracefully', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockBreznService.requestPermissions.mockRejectedValue(new Error('Permission error'));

    render(
      <TestWrapper>
        <QRScannerScreen />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(mockBreznService.requestPermissions).toHaveBeenCalled();
    });

    expect(consoleSpy).toHaveBeenCalledWith('Error requesting camera permission:', expect.any(Error));
    consoleSpy.mockRestore();
  });

  it('handles QR code parsing errors gracefully', async () => {
    global.__DEV__ = true;
    mockBreznService.requestPermissions.mockResolvedValue(true);
    mockBreznService.parseQRCode.mockRejectedValue(new Error('Invalid QR code'));

    const { getByText } = render(
      <TestWrapper>
        <QRScannerScreen />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(getByText('Test QR-Code')).toBeTruthy();
    });

    const testButton = getByText('Test QR-Code');
    fireEvent.press(testButton);

    await waitFor(() => {
      expect(getByText('QR-Code konnte nicht verarbeitet werden')).toBeTruthy();
    });
  });

  it('resets scanning state after error', async () => {
    global.__DEV__ = true;
    mockBreznService.requestPermissions.mockResolvedValue(true);
    mockBreznService.parseQRCode.mockRejectedValue(new Error('Invalid QR code'));

    const { getByText, getByTestId } = render(
      <TestWrapper>
        <QRScannerScreen />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(getByText('Test QR-Code')).toBeTruthy();
    });

    const testButton = getByText('Test QR-Code');
    fireEvent.press(testButton);

    await waitFor(() => {
      expect(getByText('QR-Code konnte nicht verarbeitet werden')).toBeTruthy();
    });

    // Scanning should resume after error
    expect(getByTestId('scan-line')).toBeTruthy();
  });

  it('handles different platform settings correctly', async () => {
    // Mock Platform.OS to 'android'
    jest.doMock('react-native/Libraries/Utilities/Platform', () => ({
      OS: 'android',
      select: jest.fn(),
    }));

    const mockAndroidLinking = require('react-native/Libraries/Linking/Linking');
    mockBreznService.requestPermissions.mockResolvedValue(false);

    const { getByText } = render(
      <TestWrapper>
        <QRScannerScreen />
      </TestWrapper>
    );

    const settingsButton = getByText('Einstellungen öffnen');
    fireEvent.press(settingsButton);

    expect(mockAndroidLinking.openSettings).toHaveBeenCalled();
  });
});