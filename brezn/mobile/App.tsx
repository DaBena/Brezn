import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar, View, Text, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

// Screens
import FeedScreen from './src/screens/FeedScreen';
import CreatePostScreen from './src/screens/CreatePostScreen';
import NetworkScreen from './src/screens/NetworkScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import QRScannerScreen from './src/screens/QRScannerScreen';

// Components
import Icon from 'react-native-vector-icons/MaterialIcons';

// Types
import { RootStackParamList, TabParamList } from './src/types/navigation';

const Tab = createBottomTabNavigator<TabParamList>();
const Stack = createStackNavigator<RootStackParamList>();

// Custom Tab Bar Icon Component
const TabBarIcon = ({ route, focused, color, size }: any) => {
  let iconName: string;
  let badge: number | undefined;

  switch (route.name) {
    case 'Feed':
      iconName = 'rss-feed';
      badge = 0; // TODO: Implement unread posts count
      break;
    case 'Network':
      iconName = 'network-check';
      badge = 0; // TODO: Implement connected peers count
      break;
    case 'Settings':
      iconName = 'settings';
      break;
    default:
      iconName = 'home';
  }

  return (
    <View style={styles.tabIconContainer}>
      <Icon name={iconName} size={size} color={color} />
      {badge !== undefined && badge > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      )}
    </View>
  );
};

const TabNavigator = () => {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => (
          <TabBarIcon route={route} focused={focused} color={color} size={size} />
        ),
        tabBarActiveTintColor: '#667eea',
        tabBarInactiveTintColor: '#8e8e93',
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopWidth: 1,
          borderTopColor: '#e5e5e7',
          paddingBottom: 8,
          paddingTop: 8,
          height: 88,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
          marginTop: 4,
        },
        headerStyle: {
          backgroundColor: '#667eea',
          elevation: 0,
          shadowOpacity: 0,
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: 'bold',
          fontSize: 18,
        },
        headerShadowVisible: false,
      })}
    >
      <Tab.Screen 
        name="Feed" 
        component={FeedScreen}
        options={{ 
          title: 'Brezn Feed',
          tabBarLabel: 'Feed',
        }}
      />
      <Tab.Screen 
        name="Network" 
        component={NetworkScreen}
        options={{ 
          title: 'Netzwerk',
          tabBarLabel: 'Netzwerk',
        }}
      />
      <Tab.Screen 
        name="Settings" 
        component={SettingsScreen}
        options={{ 
          title: 'Einstellungen',
          tabBarLabel: 'Einstellungen',
        }}
      />
    </Tab.Navigator>
  );
};

const App = () => {
  return (
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaProvider>
        <StatusBar 
          barStyle="light-content" 
          backgroundColor="#667eea"
          translucent={false}
        />
        <NavigationContainer
          theme={{
            dark: false,
            colors: {
              primary: '#667eea',
              background: '#f5f5f5',
              card: '#ffffff',
              text: '#333333',
              border: '#e5e5e7',
              notification: '#ff3b30',
            },
          }}
        >
          <Stack.Navigator
            screenOptions={{
              headerStyle: {
                backgroundColor: '#667eea',
                elevation: 0,
                shadowOpacity: 0,
              },
              headerTintColor: '#fff',
              headerTitleStyle: {
                fontWeight: 'bold',
                fontSize: 18,
              },
              headerShadowVisible: false,
              cardStyle: { backgroundColor: '#f5f5f5' },
            }}
          >
            <Stack.Screen 
              name="Main" 
              component={TabNavigator}
              options={{ headerShown: false }}
            />
            <Stack.Screen 
              name="CreatePost" 
              component={CreatePostScreen}
              options={{ 
                title: 'Neuer Post',
                presentation: 'modal',
              }}
            />
            <Stack.Screen 
              name="QRScanner" 
              component={QRScannerScreen}
              options={{ 
                title: 'QR-Code Scanner',
                presentation: 'fullScreenModal',
              }}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabIconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: '#ff3b30',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
});

export default App;