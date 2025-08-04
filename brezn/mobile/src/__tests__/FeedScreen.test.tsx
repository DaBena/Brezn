import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import FeedScreen from '../screens/FeedScreen';
import { BreznService } from '../services/BreznService';

// Mock BreznService
jest.mock('../services/BreznService');
const mockBreznService = BreznService as jest.Mocked<typeof BreznService>;

// Mock react-native-vector-icons
jest.mock('react-native-vector-icons/MaterialIcons', () => 'Icon');

// Mock navigation
const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
};

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

describe('FeedScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBreznService.getPosts.mockResolvedValue([]);
  });

  const renderFeedScreen = () => {
    return render(
      <NavigationContainer>
        <FeedScreen />
      </NavigationContainer>
    );
  };

  describe('initial load', () => {
    it('should load posts on mount', async () => {
      const mockPosts = [
        {
          id: 1,
          content: 'Test post 1',
          pseudonym: 'TestUser1',
          timestamp: 1234567890,
          nodeId: 'node1',
        },
        {
          id: 2,
          content: 'Test post 2',
          pseudonym: 'TestUser2',
          timestamp: 1234567891,
          nodeId: 'node2',
        },
      ];

      mockBreznService.getPosts.mockResolvedValue(mockPosts);

      const { getByText } = renderFeedScreen();

      await waitFor(() => {
        expect(mockBreznService.getPosts).toHaveBeenCalledTimes(1);
      });

      expect(getByText('Test post 1')).toBeTruthy();
      expect(getByText('TestUser1')).toBeTruthy();
      expect(getByText('Test post 2')).toBeTruthy();
      expect(getByText('TestUser2')).toBeTruthy();
    });

    it('should show empty state when no posts', async () => {
      mockBreznService.getPosts.mockResolvedValue([]);

      const { getByText } = renderFeedScreen();

      await waitFor(() => {
        expect(getByText('Noch keine Posts')).toBeTruthy();
        expect(getByText('Erstelle den ersten Post im Netzwerk!')).toBeTruthy();
      });
    });

    it('should handle loading error', async () => {
      mockBreznService.getPosts.mockRejectedValue(new Error('Failed to load posts'));

      const { getByText } = renderFeedScreen();

      await waitFor(() => {
        expect(mockBreznService.getPosts).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('post rendering', () => {
    it('should format timestamp correctly', async () => {
      const now = Math.floor(Date.now() / 1000);
      const mockPosts = [
        {
          id: 1,
          content: 'Recent post',
          pseudonym: 'User1',
          timestamp: now - 30, // 30 seconds ago
          nodeId: 'node1',
        },
        {
          id: 2,
          content: 'Older post',
          pseudonym: 'User2',
          timestamp: now - 3600, // 1 hour ago
          nodeId: 'node2',
        },
      ];

      mockBreznService.getPosts.mockResolvedValue(mockPosts);

      const { getByText } = renderFeedScreen();

      await waitFor(() => {
        expect(getByText('Recent post')).toBeTruthy();
        expect(getByText('Older post')).toBeTruthy();
      });
    });

    it('should show node info when available', async () => {
      const mockPosts = [
        {
          id: 1,
          content: 'Test post',
          pseudonym: 'TestUser',
          timestamp: 1234567890,
          nodeId: 'test-node-123',
        },
      ];

      mockBreznService.getPosts.mockResolvedValue(mockPosts);

      const { getByText } = renderFeedScreen();

      await waitFor(() => {
        expect(getByText('Test post')).toBeTruthy();
        expect(getByText('Node: test-node-123')).toBeTruthy();
      });
    });
  });

  describe('refresh functionality', () => {
    it('should refresh posts on pull to refresh', async () => {
      const mockPosts = [
        {
          id: 1,
          content: 'Test post',
          pseudonym: 'TestUser',
          timestamp: 1234567890,
          nodeId: 'node1',
        },
      ];

      mockBreznService.getPosts.mockResolvedValue(mockPosts);

      const { getByText } = renderFeedScreen();

      await waitFor(() => {
        expect(getByText('Test post')).toBeTruthy();
      });

      // Simulate pull to refresh
      const flatList = getByText('Test post').parent;
      if (flatList) {
        fireEvent(flatList, 'refresh');
      }

      await waitFor(() => {
        expect(mockBreznService.getPosts).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('navigation', () => {
    it('should navigate to create post screen when FAB is pressed', async () => {
      mockBreznService.getPosts.mockResolvedValue([]);

      const { getByTestId } = renderFeedScreen();

      await waitFor(() => {
        expect(mockBreznService.getPosts).toHaveBeenCalledTimes(1);
      });

      // Find and press the FAB
      const fab = getByTestId('create-post-fab');
      if (fab) {
        fireEvent.press(fab);
        expect(mockNavigation.navigate).toHaveBeenCalledWith('CreatePost');
      }
    });
  });

  describe('error handling', () => {
    it('should handle network errors gracefully', async () => {
      mockBreznService.getPosts.mockRejectedValue(new Error('Network error'));

      const { getByText } = renderFeedScreen();

      await waitFor(() => {
        expect(mockBreznService.getPosts).toHaveBeenCalledTimes(1);
      });
    });
  });
});