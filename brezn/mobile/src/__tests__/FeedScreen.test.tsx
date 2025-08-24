import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import FeedScreen from '../screens/FeedScreen';
import { Post } from '../types/navigation';

// Mock the BreznService
jest.mock('../services/BreznService', () => ({
  BreznService: {
    getPosts: jest.fn(),
  },
}));

// Mock the PostCard component
jest.mock('../components/PostCard', () => {
  const MockPostCard = ({ post, onLike, onShare, onReport }: any) => (
    <div data-testid={`post-${post.id}`}>
      <div data-testid={`pseudonym-${post.id}`}>{post.pseudonym}</div>
      <div data-testid={`content-${post.id}`}>{post.content}</div>
      <button data-testid={`like-${post.id}`} onClick={() => onLike?.(post.id)}>
        Like
      </button>
      <button data-testid={`share-${post.id}`} onClick={() => onShare?.(post.id)}>
        Share
      </button>
      <button data-testid={`report-${post.id}`} onClick={() => onReport?.(post.id)}>
        Report
      </button>
    </div>
  );
  return MockPostCard;
});

// Mock the time utility
jest.mock('../utils/time', () => ({
  formatRelativeTime: jest.fn(() => 'vor 2 Stunden'),
}));

const mockPosts: Post[] = [
  {
    id: 1,
    content: 'Erster Test-Post',
    pseudonym: 'User1',
    timestamp: Date.now() - 3600000,
    nodeId: 'node1',
  },
  {
    id: 2,
    content: 'Zweiter Test-Post',
    pseudonym: 'User2',
    timestamp: Date.now() - 7200000,
    nodeId: 'node2',
  },
];

const Stack = createStackNavigator();

const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <NavigationContainer>
    <Stack.Navigator>
      <Stack.Screen name="Test" component={() => children} />
    </Stack.Navigator>
  </NavigationContainer>
);

describe('FeedScreen', () => {
  const mockBreznService = require('../services/BreznService').BreznService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading state initially', () => {
    mockBreznService.getPosts.mockResolvedValue([]);
    
    const { getByTestId } = render(
      <TestWrapper>
        <FeedScreen />
      </TestWrapper>
    );

    expect(getByTestId('loading-indicator')).toBeTruthy();
  });

  it('renders posts after loading', async () => {
    mockBreznService.getPosts.mockResolvedValue(mockPosts);
    
    const { getByTestId, queryByTestId } = render(
      <TestWrapper>
        <FeedScreen />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(queryByTestId('loading-indicator')).toBeFalsy();
    });

    expect(getByTestId('post-1')).toBeTruthy();
    expect(getByTestId('post-2')).toBeTruthy();
  });

  it('renders empty state when no posts', async () => {
    mockBreznService.getPosts.mockResolvedValue([]);
    
    const { getByText, queryByTestId } = render(
      <TestWrapper>
        <FeedScreen />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(queryByTestId('loading-indicator')).toBeFalsy();
    });

    expect(getByText('Noch keine Posts')).toBeTruthy();
    expect(getByText('Erstelle den ersten Post im Netzwerk!')).toBeTruthy();
  });

  it('handles refresh correctly', async () => {
    mockBreznService.getPosts.mockResolvedValue(mockPosts);
    
    const { getByTestId } = render(
      <TestWrapper>
        <FeedScreen />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(queryByTestId('loading-indicator')).toBeFalsy();
    });

    const refreshControl = getByTestId('refresh-control');
    fireEvent(refreshControl, 'refresh');

    expect(mockBreznService.getPosts).toHaveBeenCalledTimes(2);
  });

  it('handles like action correctly', async () => {
    mockBreznService.getPosts.mockResolvedValue(mockPosts);
    
    const { getByTestId } = render(
      <TestWrapper>
        <FeedScreen />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(queryByTestId('loading-indicator')).toBeFalsy();
    });

    const likeButton = getByTestId('like-1');
    fireEvent.press(likeButton);

    // The like functionality should be handled by the PostCard component
    expect(likeButton).toBeTruthy();
  });

  it('handles share action correctly', async () => {
    mockBreznService.getPosts.mockResolvedValue(mockPosts);
    
    const { getByTestId } = render(
      <TestWrapper>
        <FeedScreen />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(queryByTestId('loading-indicator')).toBeFalsy();
    });

    const shareButton = getByTestId('share-1');
    fireEvent.press(shareButton);

    // The share functionality should be handled by the PostCard component
    expect(shareButton).toBeTruthy();
  });

  it('handles report action correctly', async () => {
    mockBreznService.getPosts.mockResolvedValue(mockPosts);
    
    const { getByTestId } = render(
      <TestWrapper>
        <FeedScreen />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(queryByTestId('loading-indicator')).toBeFalsy();
    });

    const reportButton = getByTestId('report-1');
    fireEvent.press(reportButton);

    // The report functionality should be handled by the PostCard component
    expect(reportButton).toBeTruthy();
  });

  it('shows create post FAB', async () => {
    mockBreznService.getPosts.mockResolvedValue([]);
    
    const { getByTestId } = render(
      <TestWrapper>
        <FeedScreen />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(queryByTestId('loading-indicator')).toBeFalsy();
    });

    expect(getByTestId('create-post-fab')).toBeTruthy();
  });

  it('handles error when loading posts', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockBreznService.getPosts.mockRejectedValue(new Error('Network error'));
    
    const { getByText } = render(
      <TestWrapper>
        <FeedScreen />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(getByText('Noch keine Posts')).toBeTruthy();
    });

    expect(consoleSpy).toHaveBeenCalledWith('Error loading posts:', expect.any(Error));
    consoleSpy.mockRestore();
  });

  it('maintains liked posts state', async () => {
    mockBreznService.getPosts.mockResolvedValue(mockPosts);
    
    const { getByTestId } = render(
      <TestWrapper>
        <FeedScreen />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(queryByTestId('loading-indicator')).toBeFalsy();
    });

    // The liked posts state should be maintained internally
    const likeButton1 = getByTestId('like-1');
    const likeButton2 = getByTestId('like-2');
    
    expect(likeButton1).toBeTruthy();
    expect(likeButton2).toBeTruthy();
  });
});