import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../types/navigation';
import { BreznService } from '../services/BreznService';
import { Config } from '../types/navigation';
import Icon from 'react-native-vector-icons/MaterialIcons';

type CreatePostScreenNavigationProp = StackNavigationProp<RootStackParamList, 'CreatePost'>;

const CreatePostScreen: React.FC = () => {
  const navigation = useNavigation<CreatePostScreenNavigationProp>();
  const [content, setContent] = useState('');
  const [pseudonym, setPseudonym] = useState('');
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const configData = await BreznService.getConfig();
      setConfig(configData);
      setPseudonym(configData.defaultPseudonym);
    } catch (error) {
      console.error('Error loading config:', error);
    }
  };

  const handleCreatePost = async () => {
    if (!content.trim()) {
      Alert.alert('Fehler', 'Bitte gib einen Post-Inhalt ein!');
      return;
    }

    if (!pseudonym.trim()) {
      Alert.alert('Fehler', 'Bitte gib ein Pseudonym ein!');
      return;
    }

    setLoading(true);

    try {
      await BreznService.createPost(content.trim(), pseudonym.trim());
      
      Alert.alert(
        'Erfolg',
        'Post wurde erfolgreich erstellt!',
        [
          {
            text: 'OK',
            onPress: () => {
              setContent('');
              navigation.goBack();
            },
          },
        ]
      );
    } catch (error) {
      Alert.alert('Fehler', 'Post konnte nicht erstellt werden');
      console.error('Error creating post:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateRandomPseudonym = () => {
    const adjectives = [
      'Anonym', 'Versteckt', 'Geheim', 'Unbekannt', 'Mysteriös',
      'Verborgen', 'Unsichtbar', 'Stiller', 'Ruhiger', 'Bescheidener'
    ];
    const nouns = [
      'Brezn', 'Nutzer', 'Poster', 'Schreiber', 'Denker',
      'Beobachter', 'Zuhörer', 'Leser', 'Kommentator', 'Teilnehmer'
    ];
    const numbers = Math.floor(Math.random() * 999) + 1;
    
    const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    
    return `${adjective}${noun}${numbers}`;
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <Icon name="edit" size={24} color="#667eea" />
          <Text style={styles.headerText}>Neuer Post</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Pseudonym</Text>
            <View style={styles.pseudonymContainer}>
              <TextInput
                style={styles.pseudonymInput}
                value={pseudonym}
                onChangeText={setPseudonym}
                placeholder="Dein Pseudonym"
                placeholderTextColor="#999"
                maxLength={30}
              />
              <TouchableOpacity
                style={styles.randomButton}
                onPress={() => setPseudonym(generateRandomPseudonym())}
              >
                <Icon name="shuffle" size={20} color="#667eea" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Post-Inhalt</Text>
            <TextInput
              style={styles.contentInput}
              value={content}
              onChangeText={setContent}
              placeholder="Was möchtest du teilen?"
              placeholderTextColor="#999"
              multiline
              numberOfLines={6}
              maxLength={500}
              textAlignVertical="top"
            />
            <Text style={styles.charCount}>
              {content.length}/500 Zeichen
            </Text>
          </View>

          <View style={styles.infoContainer}>
            <Icon name="info" size={16} color="#666" />
            <Text style={styles.infoText}>
              Dein Post wird anonym im P2P-Netzwerk geteilt
            </Text>
          </View>
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.button, styles.cancelButton]}
            onPress={() => navigation.goBack()}
            disabled={loading}
          >
            <Text style={styles.cancelButtonText}>Abbrechen</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.button,
              styles.createButton,
              (!content.trim() || !pseudonym.trim() || loading) && styles.disabledButton
            ]}
            onPress={handleCreatePost}
            disabled={!content.trim() || !pseudonym.trim() || loading}
          >
            {loading ? (
              <Text style={styles.createButtonText}>Erstelle...</Text>
            ) : (
              <Text style={styles.createButtonText}>Post erstellen</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContainer: {
    flexGrow: 1,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  headerText: {
    fontSize: 20,
    fontWeight: 'bold',
    marginLeft: 8,
    color: '#333',
  },
  form: {
    flex: 1,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#333',
  },
  pseudonymContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pseudonymInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  randomButton: {
    marginLeft: 8,
    padding: 12,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
  },
  contentInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    minHeight: 120,
  },
  charCount: {
    fontSize: 12,
    color: '#666',
    textAlign: 'right',
    marginTop: 4,
  },
  infoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e3f2fd',
    padding: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  infoText: {
    fontSize: 14,
    color: '#1976d2',
    marginLeft: 8,
    flex: 1,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
  },
  button: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  cancelButton: {
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  createButton: {
    backgroundColor: '#667eea',
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  disabledButton: {
    backgroundColor: '#ccc',
  },
});

export default CreatePostScreen;