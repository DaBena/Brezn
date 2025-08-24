import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { Post } from '../types/navigation';
import { formatRelativeTime } from '../utils/time';

interface PostCardProps {
  post: Post;
  onLike?: (postId: number) => void;
  onShare?: (postId: number) => void;
  onReport?: (postId: number) => void;
}

const PostCard: React.FC<PostCardProps> = ({ 
  post, 
  onLike, 
  onShare, 
  onReport 
}) => {
  const handleLike = () => {
    if (onLike) {
      onLike(post.id);
    }
  };

  const handleShare = () => {
    if (onShare) {
      onShare(post.id);
    }
  };

  const handleReport = () => {
    Alert.alert(
      'Post melden',
      'Möchtest du diesen Post wirklich melden?',
      [
        { text: 'Abbrechen', style: 'cancel' },
        { 
          text: 'Melden', 
          style: 'destructive',
          onPress: () => onReport && onReport(post.id)
        },
      ]
    );
  };

  return (
    <View style={styles.container} testID="post-card">
      <View style={styles.header}>
        <View style={styles.authorInfo}>
          <Icon name="person" size={20} color="#667eea" />
          <Text style={styles.pseudonym}>{post.pseudonym}</Text>
        </View>
        <Text style={styles.timestamp}>{formatRelativeTime(post.timestamp)}</Text>
      </View>
      
      <Text style={styles.content}>{post.content}</Text>
      
      {post.nodeId && (
        <View style={styles.nodeInfo}>
          <Icon name="device-hub" size={14} color="#666" />
          <Text style={styles.nodeText}>Node: {post.nodeId}</Text>
        </View>
      )}
      
      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionButton} onPress={handleLike}>
          <Icon name="favorite-border" size={20} color="#666" />
          <Text style={styles.actionText}>Gefällt mir</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.actionButton} onPress={handleShare}>
          <Icon name="share" size={20} color="#666" />
          <Text style={styles.actionText}>Teilen</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.actionButton} onPress={handleReport}>
          <Icon name="report" size={20} color="#666" />
          <Text style={styles.actionText}>Melden</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 16,
    borderRadius: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  authorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  pseudonym: {
    fontSize: 16,
    fontWeight: '600',
    color: '#667eea',
    marginLeft: 8,
    flex: 1,
  },
  timestamp: {
    fontSize: 12,
    color: '#999',
  },
  content: {
    fontSize: 16,
    lineHeight: 24,
    color: '#333',
    marginBottom: 12,
  },
  nodeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
  },
  nodeText: {
    fontSize: 12,
    color: '#666',
    marginLeft: 6,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  actionText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 4,
  },
});

export default PostCard;