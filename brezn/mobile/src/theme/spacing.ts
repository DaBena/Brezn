export const spacing = {
  // Base spacing unit (4px)
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
  
  // Specific spacing values
  none: 0,
  tiny: 2,
  small: 12,
  medium: 20,
  large: 36,
  huge: 80,
  
  // Screen margins
  screenHorizontal: 16,
  screenVertical: 16,
  
  // Component spacing
  componentPadding: 16,
  componentMargin: 16,
  
  // List spacing
  listItemSpacing: 8,
  listSectionSpacing: 16,
  
  // Form spacing
  formFieldSpacing: 20,
  formGroupSpacing: 24,
  
  // Button spacing
  buttonPadding: 16,
  buttonMargin: 8,
  
  // Card spacing
  cardPadding: 16,
  cardMargin: 8,
  cardBorderRadius: 12,
  
  // Input spacing
  inputPadding: 12,
  inputMargin: 8,
  inputBorderRadius: 8,
  
  // Navigation spacing
  tabBarHeight: 88,
  headerHeight: 56,
  statusBarHeight: 44,
  
  // Icon spacing
  iconSize: 24,
  iconPadding: 8,
  
  // Avatar spacing
  avatarSize: 40,
  avatarSpacing: 12,
  
  // Badge spacing
  badgeSize: 20,
  badgePadding: 4,
  
  // FAB spacing
  fabSize: 56,
  fabMargin: 24,
  
  // Modal spacing
  modalPadding: 20,
  modalMargin: 16,
  
  // Overlay spacing
  overlayPadding: 16,
  overlayMargin: 8,
};

export const borderRadius = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  round: 50,
  full: 9999,
  
  // Component specific
  button: 8,
  card: 12,
  input: 8,
  avatar: 20,
  badge: 10,
  tab: 20,
  chip: 16,
};

export const shadows = {
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  xs: {
    shadowColor: 'rgba(0, 0, 0, 0.1)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  sm: {
    shadowColor: 'rgba(0, 0, 0, 0.1)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: 'rgba(0, 0, 0, height: 0.1)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  lg: {
    shadowColor: 'rgba(0, 0, 0, 0.15)',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  xl: {
    shadowColor: 'rgba(0, 0, 0, 0.2)',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 12,
  },
};

export const layout = {
  // Screen dimensions
  screenWidth: '100%',
  screenHeight: '100%',
  
  // Container dimensions
  containerMaxWidth: 400,
  containerPadding: spacing.screenHorizontal,
  
  // Grid system
  gridColumns: 12,
  gridGutter: spacing.md,
  
  // Breakpoints (for responsive design)
  breakpoints: {
    xs: 320,
    sm: 480,
    md: 768,
    lg: 1024,
    xl: 1200,
  },
};

export const zIndex = {
  // Base layers
  base: 0,
  above: 1,
  below: -1,
  
  // Component layers
  card: 1,
  button: 2,
  input: 3,
  modal: 1000,
  overlay: 999,
  tooltip: 1001,
  popover: 1002,
  
  // Navigation layers
  tabBar: 100,
  header: 99,
  drawer: 200,
  
  // Special layers
  floating: 1000,
  notification: 2000,
  loading: 3000,
};