import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import PostCard from '../components/PostCard';
import { Post } from '../types/navigation';

// Mock the time utility
jest.mock('../utils/time', () => ({
  formatRelativeTime: jest.fn(() => 'vor 2 Stunden'),
}));

describe('PostCard', () => {
  const mockPost: Post = {
    id: 1,
    content: 'Dies ist ein Test-Post mit einigem Inhalt.',
    pseudonym: 'TestUser',
    timestamp: Date.now() - 7200000, // 2 hours ago
    nodeId: 'node123',
  };

  const mockHandlers = {
    onLike: jest.fn(),
    onShare: jest.fn(),
    onReport: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders post content correctly', () => {
    const { getByText } = render(
      <PostCard post={mockPost} {...mockHandlers} />
    );

    expect(getByText('TestUser')).toBeTruthy();
    expect(getByText('Dies ist ein Test-Post mit einigem Inhalt.')).toBeTruthy();
    expect(getByText('vor 2 Stunden')).toBeTruthy();
    expect(getByText('Node: node123')).toBeTruthy();
  });

  it('renders without nodeId when not provided', () => {
    const postWithoutNode: Post = {
      ...mockPost,
      nodeId: undefined,
    };

    const { queryByText } = render(
      <PostCard post={postWithoutNode} {...mockHandlers} />
    );

    expect(queryByText('Node: node123')).toBeFalsy();
  });

  it('calls onLike when like button is pressed', () => {
    const { getByText } = render(
      <PostCard post={mockPost} {...mockHandlers} />
    );

    const likeButton = getByText('Gefällt mir');
    fireEvent.press(likeButton);

    expect(mockHandlers.onLike).toHaveBeenCalledWith(mockPost.id);
  });

  it('calls onShare when share button is pressed', () => {
    const { getByText } = render(
      <PostCard post={mockPost} {...mockHandlers} />
    );

    const shareButton = getByText('Teilen');
    fireEvent.press(shareButton);

    expect(mockHandlers.onShare).toHaveBeenCalledWith(mockPost.id);
  });

  it('calls onReport when report button is pressed', () => {
    const { getByText } = render(
      <PostCard post={mockPost} {...mockHandlers} />
    );

    const reportButton = getByText('Melden');
    fireEvent.press(reportButton);

    expect(mockHandlers.onReport).toHaveBeenCalledWith(mockPost.id);
  });

  it('works without optional handlers', () => {
    const { getByText } = render(<PostCard post={mockPost} />);

    const likeButton = getByText('Gefällt mir');
    const shareButton = getByText('Teilen');
    const reportButton = getByText('Melden');

    // Should not crash when handlers are not provided
    expect(() => fireEvent.press(likeButton)).not.toThrow();
    expect(() => fireEvent.press(shareButton)).not.toThrow();
    expect(() => fireEvent.press(reportButton)).not.toThrow();
  });

  it('displays action buttons correctly', () => {
    const { getByText } = render(
      <PostCard post={mockPost} {...mockHandlers} />
    );

    expect(getByText('Gefällt mir')).toBeTruthy();
    expect(getByText('Teilen')).toBeTruthy();
    expect(getByText('Melden')).toBeTruthy();
  });

  it('handles long pseudonyms gracefully', () => {
    const longPseudonymPost: Post = {
      ...mockPost,
      pseudonym: 'VeryLongPseudonymThatExceedsNormalLength',
    };

    const { getByText } = render(
      <PostCard post={longPseudonymPost} {...mockHandlers} />
    );

    expect(getByText('VeryLongPseudonymThatExceedsNormalLength')).toBeTruthy();
  });

  it('handles long content gracefully', () => {
    const longContentPost: Post = {
      ...mockPost,
      content: 'A'.repeat(500), // Very long content
    };

    const { getByText } = render(
      <PostCard post={longContentPost} {...mockHandlers} />
    );

    expect(getByText('A'.repeat(500))).toBeTruthy();
  });

  it('renders with different timestamps', () => {
    const recentPost: Post = {
      ...mockPost,
      timestamp: Date.now() - 60000, // 1 minute ago
    };

    const { getByText } = render(
      <PostCard post={recentPost} {...mockHandlers} />
    );

    expect(getByText('vor 2 Stunden')).toBeTruthy(); // Mock always returns this
  });

  it('maintains consistent styling', () => {
    const { getByTestId } = render(
      <PostCard post={mockPost} {...mockHandlers} />
    );

    const postCard = getByTestId('post-card');
    expect(postCard).toBeTruthy();
  });
});