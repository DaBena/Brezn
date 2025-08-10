import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
} from 'react-native';
import { Config } from '../types/navigation';
import { BreznService } from '../services/BreznService';
import Icon from 'react-native-vector-icons/MaterialIcons';

const SettingsScreen: React.FC = () => {
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const configData = await BreznService.getConfig();
      setConfig(configData);
    } catch (error) {
      Alert.alert('Fehler', 'Einstellungen konnten nicht geladen werden');
      console.error('Error loading config:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveConfig = async () => {
    if (!config) return;

    try {
      setSaving(true);
      await BreznService.updateConfig(config);
      Alert.alert('Erfolg', 'Einstellungen wurden gespeichert');
    } catch (error) {
      Alert.alert('Fehler', 'Einstellungen konnten nicht gespeichert werden');
      console.error('Error saving config:', error);
    } finally {
      setSaving(false);
    }
  };

  const updateConfig = (key: keyof Config, value: any) => {
    if (!config) return;
    setConfig({ ...config, [key]: value });
  };

  const renderSettingItem = (
    icon: string,
    title: string,
    subtitle: string,
    children: React.ReactNode
  ) => (
    <View style={styles.settingItem}>
      <View style={styles.settingHeader}>
        <Icon name={icon} size={24} color="#667eea" />
        <View style={styles.settingText}>
          <Text style={styles.settingTitle}>{title}</Text>
          <Text style={styles.settingSubtitle}>{subtitle}</Text>
        </View>
      </View>
      <View style={styles.settingControl}>
        {children}
      </View>
    </View>
  );

  const renderSwitchSetting = (
    icon: string,
    title: string,
    subtitle: string,
    value: boolean,
    onValueChange: (value: boolean) => void
  ) => (
    <View style={styles.settingItem}>
      <View style={styles.settingHeader}>
        <Icon name={icon} size={24} color="#667eea" />
        <View style={styles.settingText}>
          <Text style={styles.settingTitle}>{title}</Text>
          <Text style={styles.settingSubtitle}>{subtitle}</Text>
        </View>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: '#ddd', true: '#667eea' }}
        thumbColor={value ? '#fff' : '#f4f3f4'}
      />
    </View>
  );

  const renderInputSetting = (
    icon: string,
    title: string,
    subtitle: string,
    value: string,
    onValueChange: (value: string) => void,
    placeholder: string,
    keyboardType: 'default' | 'numeric' = 'default'
  ) => (
    <View style={styles.settingItem}>
      <View style={styles.settingHeader}>
        <Icon name={icon} size={24} color="#667eea" />
        <View style={styles.settingText}>
          <Text style={styles.settingTitle}>{title}</Text>
          <Text style={styles.settingSubtitle}>{subtitle}</Text>
        </View>
      </View>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onValueChange}
        placeholder={placeholder}
        placeholderTextColor="#999"
        keyboardType={keyboardType}
      />
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Icon name="settings" size={48} color="#667eea" />
        <Text style={styles.loadingText}>Lade Einstellungen...</Text>
      </View>
    );
  }

  if (!config) {
    return (
      <View style={styles.errorContainer}>
        <Icon name="error" size={48} color="#f44336" />
        <Text style={styles.errorText}>Einstellungen konnten nicht geladen werden</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadConfig}>
          <Text style={styles.retryButtonText}>Erneut versuchen</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Allgemeine Einstellungen</Text>
        
        {renderInputSetting(
          'person',
          'Standard-Pseudonym',
          'Standard-Pseudonym für neue Posts',
          config.defaultPseudonym,
          (value) => updateConfig('defaultPseudonym', value),
          'AnonymBrezn42'
        )}
        
        {renderInputSetting(
          'storage',
          'Maximale Posts',
          'Maximale Anzahl gespeicherter Posts',
          config.maxPosts.toString(),
          (value) => updateConfig('maxPosts', parseInt(value) || 1000),
          '1000',
          'numeric'
        )}
        
        {renderSwitchSetting(
          'save',
          'Auto-Save',
          'Posts automatisch speichern',
          config.autoSave,
          (value) => updateConfig('autoSave', value)
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Netzwerk-Einstellungen</Text>
        
        {renderSwitchSetting(
          'network-check',
          'Netzwerk aktivieren',
          'P2P-Netzwerk für Post-Synchronisation',
          config.networkEnabled,
          (value) => updateConfig('networkEnabled', value)
        )}
        
        {renderInputSetting(
          'router',
          'Netzwerk-Port',
          'Port für P2P-Netzwerk',
          config.networkPort.toString(),
          (value) => updateConfig('networkPort', parseInt(value) || 8888),
          '8888',
          'numeric'
        )}
        
        {renderSwitchSetting(
          'security',
          'Tor aktivieren',
          'Anonymisierung über Tor-Netzwerk',
          config.torEnabled,
          (value) => updateConfig('torEnabled', value)
        )}
        
        {renderInputSetting(
          'vpn-key',
          'Tor SOCKS-Port',
          'Port für Tor SOCKS5-Proxy',
          config.torSocksPort.toString(),
          (value) => updateConfig('torSocksPort', parseInt(value) || 9050),
          '9050',
          'numeric'
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>System-Informationen</Text>
        
        <View style={styles.infoItem}>
          <Icon name="info" size={20} color="#666" />
          <View style={styles.infoText}>
            <Text style={styles.infoTitle}>App-Version</Text>
            <Text style={styles.infoValue}>0.1.0</Text>
          </View>
        </View>
        
        <View style={styles.infoItem}>
          <Icon name="code" size={20} color="#666" />
          <View style={styles.infoText}>
            <Text style={styles.infoTitle}>Lizenz</Text>
            <Text style={styles.infoValue}>GPL-3.0</Text>
          </View>
        </View>
        
        <View style={styles.infoItem}>
          <Icon name="privacy-tip" size={20} color="#666" />
          <View style={styles.infoText}>
            <Text style={styles.infoTitle}>Datenschutz</Text>
            <Text style={styles.infoValue}>Anonym & dezentral</Text>
          </View>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.saveButton, saving && styles.saveButtonDisabled]}
        onPress={handleSaveConfig}
        disabled={saving}
      >
        <Icon name="save" size={20} color="#fff" />
        <Text style={styles.saveButtonText}>
          {saving ? 'Speichere...' : 'Einstellungen speichern'}
        </Text>
      </TouchableOpacity>
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 32,
  },
  errorText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 16,
  },
  retryButton: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: '#667eea',
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  section: {
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
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  settingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingText: {
    marginLeft: 12,
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  settingSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  settingControl: {
    marginLeft: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 8,
    fontSize: 16,
    minWidth: 100,
    textAlign: 'right',
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  infoText: {
    marginLeft: 12,
    flex: 1,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  infoValue: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#667eea',
    margin: 16,
    paddingVertical: 16,
    borderRadius: 12,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  saveButtonDisabled: {
    backgroundColor: '#ccc',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
});

export default SettingsScreen;