export const colors = {
  // Primary Colors
  primary: '#667eea',
  primaryLight: '#8b9ff0',
  primaryDark: '#4c63d2',
  
  // Secondary Colors
  secondary: '#764ba2',
  secondaryLight: '#9b7bb8',
  secondaryDark: '#5a3d7a',
  
  // Accent Colors
  accent: '#f093fb',
  accentLight: '#f4b5fc',
  accentDark: '#e85af0',
  
  // Success Colors
  success: '#4caf50',
  successLight: '#81c784',
  successDark: '#388e3c',
  
  // Warning Colors
  warning: '#ff9800',
  warningLight: '#ffb74d',
  warningDark: '#f57c00',
  
  // Error Colors
  error: '#f44336',
  errorLight: '#e57373',
  errorDark: '#d32f2f',
  
  // Info Colors
  info: '#2196f3',
  infoLight: '#64b5f6',
  infoDark: '#1976d2',
  
  // Neutral Colors
  white: '#ffffff',
  black: '#000000',
  
  // Gray Scale
  gray50: '#fafafa',
  gray100: '#f5f5f5',
  gray200: '#eeeeee',
  gray300: '#e0e0e0',
  gray400: '#bdbdbd',
  gray500: '#9e9e9e',
  gray600: '#757575',
  gray700: '#616161',
  gray800: '#424242',
  gray900: '#212121',
  
  // Background Colors
  background: '#f5f5f5',
  surface: '#ffffff',
  card: '#ffffff',
  
  // Text Colors
  textPrimary: '#333333',
  textSecondary: '#666666',
  textTertiary: '#999999',
  textDisabled: '#cccccc',
  
  // Border Colors
  border: '#e5e5e7',
  borderLight: '#f0f0f0',
  borderDark: '#d0d0d0',
  
  // Shadow Colors
  shadow: 'rgba(0, 0, 0, 0.1)',
  shadowDark: 'rgba(0, 0, 0, 0.3)',
  
  // Overlay Colors
  overlay: 'rgba(0, 0, 0, 0.5)',
  overlayLight: 'rgba(0, 0, 0, 0.3)',
  
  // Status Colors
  online: '#4caf50',
  offline: '#9e9e9e',
  connecting: '#ff9800',
  error: '#f44336',
};

export const darkColors = {
  // Primary Colors
  primary: '#8b9ff0',
  primaryLight: '#a8b7f4',
  primaryDark: '#667eea',
  
  // Secondary Colors
  secondary: '#9b7bb8',
  secondaryLight: '#b8a0d0',
  secondaryDark: '#764ba2',
  
  // Accent Colors
  accent: '#f4b5fc',
  accentLight: '#f8d0fd',
  accentDark: '#f093fb',
  
  // Success Colors
  success: '#81c784',
  successLight: '#a5d6a7',
  successDark: '#4caf50',
  
  // Warning Colors
  warning: '#ffb74d',
  warningLight: '#ffcc80',
  warningDark: '#ff9800',
  
  // Error Colors
  error: '#e57373',
  errorLight: '#ef9a9a',
  errorDark: '#f44336',
  
  // Info Colors
  info: '#64b5f6',
  infoLight: '#90caf9',
  infoDark: '#2196f3',
  
  // Neutral Colors
  white: '#000000',
  black: '#ffffff',
  
  // Gray Scale (inverted for dark mode)
  gray50: '#212121',
  gray100: '#424242',
  gray200: '#616161',
  gray300: '#757575',
  gray400: '#9e9e9e',
  gray500: '#bdbdbd',
  gray600: '#e0e0e0',
  gray700: '#eeeeee',
  gray800: '#f5f5f5',
  gray900: '#fafafa',
  
  // Background Colors
  background: '#121212',
  surface: '#1e1e1e',
  card: '#2d2d2d',
  
  // Text Colors
  textPrimary: '#ffffff',
  textSecondary: '#e0e0e0',
  textTertiary: '#bdbdbd',
  textDisabled: '#757575',
  
  // Border Colors
  border: '#424242',
  borderLight: '#616161',
  borderDark: '#212121',
  
  // Shadow Colors
  shadow: 'rgba(0, 0, 0, 0.3)',
  shadowDark: 'rgba(0, 0, 0, 0.5)',
  
  // Overlay Colors
  overlay: 'rgba(0, 0, 0, 0.7)',
  overlayLight: 'rgba(0, 0, 0, 0.5)',
  
  // Status Colors
  online: '#81c784',
  offline: '#757575',
  connecting: '#ffb74d',
  error: '#e57373',
};

export type ColorScheme = 'light' | 'dark';

export const getColors = (scheme: ColorScheme) => {
  return scheme === 'dark' ? darkColors : colors;
};