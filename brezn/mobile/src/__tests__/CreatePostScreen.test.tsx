import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import CreatePostScreen from '../screens/CreatePostScreen';
import { Config } from '../types/navigation';

// Mock the BreznService
jest.mock('../services/BreznService', () => ({
  BreznService: {
    getConfig: jest.fn(),
    createPost: jest.fn(),
  },
}));

// Mock react-native-vector-icons
jest.mock('react-native-vector-icons/MaterialIcons', () => 'Icon');

const Stack = createStackNavigator();

const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <NavigationContainer>
    <Stack.Navigator>
      <Stack.Screen name="Test" component={() => children} />
    </Stack.Navigator>
  </NavigationContainer>
);

describe('CreatePostScreen', () => {
  const mockBreznService = require('../services/BreznService').BreznService;
  const mockConfig: Config = {
    autoSave: true,
    maxPosts: 1000,
    defaultPseudonym: 'DefaultUser',
    networkEnabled: true,
    networkPort: 8080,
    torEnabled: false,
    torSocksPort: 9050,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockBreznService.getConfig.mockResolvedValue(mockConfig);
  });

  it('renders correctly with default config', async () => {
    const { getByText, getByPlaceholderText } = render(
      <TestWrapper>
        <CreatePostScreen />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(getByText('Neuer Post')).toBeTruthy();
    });

    expect(getByText('Pseudonym')).toBeTruthy();
    expect(getByText('Post-Inhalt')).toBeTruthy();
    expect(getByText('Kategorie')).toBeTruthy();
    expect(getByText('Hashtags (optional)')).toBeTruthy();
    expect(getByPlaceholderText('Dein Pseudonym')).toBeTruthy();
    expect(getByPlaceholderText('Was möchtest du teilen?')).toBeTruthy();
  });

  it('loads config and sets default pseudonym', async () => {
    const { getByDisplayValue } = render(
      <TestWrapper>
        <CreatePostScreen />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(mockBreznService.getConfig).toHaveBeenCalled();
    });

    expect(getByDisplayValue('DefaultUser')).toBeTruthy();
  });

  it('generates random pseudonym when shuffle button is pressed', async () => {
    const { getByText, getByDisplayValue } = render(
      <TestWrapper>
        <CreatePostScreen />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(getByDisplayValue('DefaultUser')).toBeTruthy();
    });

    const shuffleButton = getByText('shuffle').parent;
    fireEvent.press(shuffleButton!);

    // Should generate a new pseudonym
    const newPseudonym = getByDisplayValue(/Anonym|Versteckt|Geheim/);
    expect(newPseudonym).toBeTruthy();
  });

  it('allows category selection', async () => {
    const { getByText } = render(
      <TestWrapper>
        <CreatePostScreen />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(getByText('Allgemein')).toBeTruthy();
    });

    // Test category selection
    const newsCategory = getByText('News');
    fireEvent.press(newsCategory);

    // Should show selected category
    expect(newsCategory.parent?.props.style).toContainEqual(
      expect.objectContaining({ backgroundColor: '#667eea' })
    );
  });

  it('allows hashtag input and removal', async () => {
    const { getByPlaceholderText, getByText } = render(
      <TestWrapper>
        <CreatePostScreen />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(getByText('Hashtags (optional)')).toBeTruthy();
    });

    const hashtagInput = getByPlaceholderText('Hashtag hinzufügen');
    const addButton = getByText('add').parent;

    // Add hashtag
    fireEvent.changeText(hashtagInput, 'test');
    fireEvent.press(addButton!);

    // Should display hashtag
    expect(getByText('#test')).toBeTruthy();

    // Remove hashtag
    const hashtagChip = getByText('#test');
    fireEvent.press(hashtagChip);

    // Should remove hashtag
    expect(() => getByText('#test')).toThrow();
  });

  it('prevents duplicate hashtags', async () => {
    const { getByPlaceholderText, getByText, getAllByText } = render(
      <TestWrapper>
        <CreatePostScreen />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(getByText('Hashtags (optional)')).toBeTruthy();
    });

    const hashtagInput = getByPlaceholderText('Hashtag hinzufügen');
    const addButton = getByText('add').parent;

    // Add same hashtag twice
    fireEvent.changeText(hashtagInput, 'test');
    fireEvent.press(addButton!);
    fireEvent.changeText(hashtagInput, 'test');
    fireEvent.press(addButton!);

    // Should only show one instance
    const hashtags = getAllByText('#test');
    expect(hashtags).toHaveLength(1);
  });

  it('validates content length', async () => {
    const { getByPlaceholderText, getByText } = render(
      <TestWrapper>
        <CreatePostScreen />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(getByText('Post-Inhalt')).toBeTruthy();
    });

    const contentInput = getByPlaceholderText('Was möchtest du teilen?');
    const longContent = 'A'.repeat(501); // Exceeds 500 character limit

    fireEvent.changeText(contentInput, longContent);

    // Should show character count
    expect(getByText('501/500 Zeichen')).toBeTruthy();
  });

  it('creates post successfully with valid data', async () => {
    mockBreznService.createPost.mockResolvedValue(true);

    const { getByPlaceholderText, getByText } = render(
      <TestWrapper>
        <CreatePostScreen />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(getByText('Post-Inhalt')).toBeTruthy();
    });

    const contentInput = getByPlaceholderText('Was möchtest du teilen?');
    const pseudonymInput = getByPlaceholderText('Dein Pseudonym');
    const createButton = getByText('Post erstellen');

    // Fill in form
    fireEvent.changeText(contentInput, 'Test post content');
    fireEvent.changeText(pseudonymInput, 'TestUser');

    // Submit form
    fireEvent.press(createButton);

    await waitFor(() => {
      expect(mockBreznService.createPost).toHaveBeenCalledWith(
        'Test post content',
        'TestUser'
      );
    });
  });

  it('shows error for empty content', async () => {
    const { getByPlaceholderText, getByText } = render(
      <TestWrapper>
        <CreatePostScreen />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(getByText('Post-Inhalt')).toBeTruthy();
    });

    const pseudonymInput = getByPlaceholderText('Dein Pseudonym');
    const createButton = getByText('Post erstellen');

    // Fill only pseudonym
    fireEvent.changeText(pseudonymInput, 'TestUser');

    // Try to submit
    fireEvent.press(createButton);

    // Should show validation error
    expect(getByText('Bitte gib einen Post-Inhalt ein!')).toBeTruthy();
  });

  it('shows error for empty pseudonym', async () => {
    const { getByPlaceholderText, getByText } = render(
      <TestWrapper>
        <CreatePostScreen />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(getByText('Post-Inhalt')).toBeTruthy();
    });

    const contentInput = getByPlaceholderText('Was möchtest du teilen?');
    const createButton = getByText('Post erstellen');

    // Fill only content
    fireEvent.changeText(contentInput, 'Test post content');

    // Try to submit
    fireEvent.press(createButton);

    // Should show validation error
    expect(getByText('Bitte gib ein Pseudonym ein!')).toBeTruthy();
  });

  it('shows error for content exceeding limit', async () => {
    const { getByPlaceholderText, getByText } = render(
      <TestWrapper>
        <CreatePostScreen />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(getByText('Post-Inhalt')).toBeTruthy();
    });

    const contentInput = getByPlaceholderText('Was möchtest du teilen?');
    const pseudonymInput = getByPlaceholderText('Dein Pseudonym');
    const createButton = getByText('Post erstellen');

    // Fill form with long content
    fireEvent.changeText(contentInput, 'A'.repeat(501));
    fireEvent.changeText(pseudonymInput, 'TestUser');

    // Try to submit
    fireEvent.press(createButton);

    // Should show validation error
    expect(getByText('Post ist zu lang (max. 500 Zeichen)!')).toBeTruthy();
  });

  it('handles create post error gracefully', async () => {
    mockBreznService.createPost.mockRejectedValue(new Error('Network error'));

    const { getByPlaceholderText, getByText } = render(
      <TestWrapper>
        <CreatePostScreen />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(getByText('Post-Inhalt')).toBeTruthy();
    });

    const contentInput = getByPlaceholderText('Was möchtest du teilen?');
    const pseudonymInput = getByPlaceholderText('Dein Pseudonym');
    const createButton = getByText('Post erstellen');

    // Fill in form
    fireEvent.changeText(contentInput, 'Test post content');
    fireEvent.changeText(pseudonymInput, 'TestUser');

    // Submit form
    fireEvent.press(createButton);

    await waitFor(() => {
      expect(getByText('Post konnte nicht erstellt werden')).toBeTruthy();
    });
  });

  it('resets form after successful post creation', async () => {
    mockBreznService.createPost.mockResolvedValue(true);

    const { getByPlaceholderText, getByText } = render(
      <TestWrapper>
        <CreatePostScreen />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(getByText('Post-Inhalt')).toBeTruthy();
    });

    const contentInput = getByPlaceholderText('Was möchtest du teilen?');
    const pseudonymInput = getByPlaceholderText('Dein Pseudonym');
    const createButton = getByText('Post erstellen');

    // Fill in form
    fireEvent.changeText(contentInput, 'Test post content');
    fireEvent.changeText(pseudonymInput, 'TestUser');

    // Submit form
    fireEvent.press(createButton);

    await waitFor(() => {
      expect(mockBreznService.createPost).toHaveBeenCalled();
    });

    // Form should be reset
    expect(contentInput.props.value).toBe('');
    expect(pseudonymInput.props.value).toBe('DefaultUser');
  });

  it('disables create button when form is invalid', async () => {
    const { getByPlaceholderText, getByText } = render(
      <TestWrapper>
        <CreatePostScreen />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(getByText('Post-Inhalt')).toBeTruthy();
    });

    const createButton = getByText('Post erstellen');

    // Button should be disabled initially
    expect(createButton.parent?.props.disabled).toBe(true);
  });

  it('enables create button when form is valid', async () => {
    const { getByPlaceholderText, getByText } = render(
      <TestWrapper>
        <CreatePostScreen />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(getByText('Post-Inhalt')).toBeTruthy();
    });

    const contentInput = getByPlaceholderText('Was möchtest du teilen?');
    const pseudonymInput = getByPlaceholderText('Dein Pseudonym');
    const createButton = getByText('Post erstellen');

    // Fill in form
    fireEvent.changeText(contentInput, 'Test post content');
    fireEvent.changeText(pseudonymInput, 'TestUser');

    // Button should be enabled
    expect(createButton.parent?.props.disabled).toBe(false);
  });
});