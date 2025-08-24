import { Platform } from 'react-native';

export const fontFamily = {
  regular: Platform.select({
    ios: 'System',
    android: 'Roboto',
    default: 'System',
  }),
  medium: Platform.select({
    ios: 'System',
    android: 'Roboto-Medium',
    default: 'System',
  }),
  bold: Platform.select({
    ios: 'System',
    android: 'Roboto-Bold',
    default: 'System',
  }),
  light: Platform.select({
    ios: 'System',
    android: 'Roboto-Light',
    default: 'System',
  }),
};

export const fontSize = {
  // Display
  displayLarge: 57,
  displayMedium: 45,
  displaySmall: 36,
  
  // Headline
  headlineLarge: 32,
  headlineMedium: 28,
  headlineSmall: 24,
  
  // Title
  titleLarge: 22,
  titleMedium: 16,
  titleSmall: 14,
  
  // Body
  bodyLarge: 16,
  bodyMedium: 14,
  bodySmall: 12,
  
  // Label
  labelLarge: 14,
  labelMedium: 12,
  labelSmall: 11,
  
  // Caption
  caption: 12,
  overline: 10,
};

export const lineHeight = {
  // Display
  displayLarge: 64,
  displayMedium: 52,
  displaySmall: 44,
  
  // Headline
  headlineLarge: 40,
  headlineMedium: 36,
  headlineSmall: 32,
  
  // Title
  titleLarge: 28,
  titleMedium: 24,
  titleSmall: 20,
  
  // Body
  bodyLarge: 24,
  bodyMedium: 20,
  bodySmall: 16,
  
  // Label
  labelLarge: 20,
  labelMedium: 16,
  labelSmall: 16,
  
  // Caption
  caption: 16,
  overline: 16,
};

export const fontWeight = {
  light: '300' as const,
  regular: '400' as const,
  medium: '500' as const,
  semiBold: '600' as const,
  bold: '700' as const,
  extraBold: '800' as const,
};

export const letterSpacing = {
  displayLarge: -0.25,
  displayMedium: 0,
  displaySmall: 0,
  
  headlineLarge: -0.25,
  headlineMedium: 0,
  headlineSmall: 0,
  
  titleLarge: 0,
  titleMedium: 0.15,
  titleSmall: 0.1,
  
  bodyLarge: 0.5,
  bodyMedium: 0.25,
  bodySmall: 0.4,
  
  labelLarge: 0.1,
  labelMedium: 0.5,
  labelSmall: 0.5,
  
  caption: 0.4,
  overline: 1.5,
};

// Predefined text styles
export const textStyles = {
  displayLarge: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.displayLarge,
    lineHeight: lineHeight.displayLarge,
    fontWeight: fontWeight.regular,
    letterSpacing: letterSpacing.displayLarge,
  },
  displayMedium: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.displayMedium,
    lineHeight: lineHeight.displayMedium,
    fontWeight: fontWeight.regular,
    letterSpacing: letterSpacing.displayMedium,
  },
  displaySmall: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.displaySmall,
    lineHeight: lineHeight.displaySmall,
    fontWeight: fontWeight.regular,
    letterSpacing: letterSpacing.displaySmall,
  },
  
  headlineLarge: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.headlineLarge,
    lineHeight: lineHeight.headlineLarge,
    fontWeight: fontWeight.regular,
    letterSpacing: letterSpacing.headlineLarge,
  },
  headlineMedium: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.headlineMedium,
    lineHeight: lineHeight.headlineMedium,
    fontWeight: fontWeight.regular,
    letterSpacing: letterSpacing.headlineMedium,
  },
  headlineSmall: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.headlineSmall,
    lineHeight: lineHeight.headlineSmall,
    fontWeight: fontWeight.regular,
    letterSpacing: letterSpacing.headlineSmall,
  },
  
  titleLarge: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.titleLarge,
    lineHeight: lineHeight.titleLarge,
    fontWeight: fontWeight.medium,
    letterSpacing: letterSpacing.titleLarge,
  },
  titleMedium: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.titleMedium,
    lineHeight: lineHeight.titleMedium,
    fontWeight: fontWeight.medium,
    letterSpacing: letterSpacing.titleMedium,
  },
  titleSmall: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.titleSmall,
    lineHeight: lineHeight.titleSmall,
    fontWeight: fontWeight.medium,
    letterSpacing: letterSpacing.titleSmall,
  },
  
  bodyLarge: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.bodyLarge,
    lineHeight: lineHeight.bodyLarge,
    fontWeight: fontWeight.regular,
    letterSpacing: letterSpacing.bodyLarge,
  },
  bodyMedium: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.bodyMedium,
    lineHeight: lineHeight.bodyMedium,
    fontWeight: fontWeight.regular,
    letterSpacing: letterSpacing.bodyMedium,
  },
  bodySmall: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.bodySmall,
    lineHeight: lineHeight.bodySmall,
    fontWeight: fontWeight.regular,
    letterSpacing: letterSpacing.bodySmall,
  },
  
  labelLarge: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.labelLarge,
    lineHeight: lineHeight.labelLarge,
    fontWeight: fontWeight.medium,
    letterSpacing: letterSpacing.labelLarge,
  },
  labelMedium: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.labelMedium,
    lineHeight: lineHeight.labelMedium,
    fontWeight: fontWeight.medium,
    letterSpacing: letterSpacing.labelMedium,
  },
  labelSmall: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.labelSmall,
    lineHeight: lineHeight.labelSmall,
    fontWeight: fontWeight.medium,
    letterSpacing: letterSpacing.labelSmall,
  },
  
  caption: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
    fontWeight: fontWeight.regular,
    letterSpacing: letterSpacing.caption,
  },
  overline: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.overline,
    lineHeight: lineHeight.overline,
    fontWeight: fontWeight.medium,
    letterSpacing: letterSpacing.overline,
  },
};

export type TextVariant = keyof typeof textStyles;