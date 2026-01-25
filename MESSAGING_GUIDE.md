# Messaging System Guide

## Overview

The Neighbourly platform includes a complete real-time messaging system that allows Seekers and Providers to communicate directly. The system uses WebSocket for real-time communication, Redis Pub/Sub for message broadcasting, and PostgreSQL for message persistence.

## Architecture

```
┌─────────────┐         ┌─────────────┐
│   Seeker    │◄───────►│  Provider   │
└──────┬──────┘         └──────┬──────┘
       │                       │
       │    WebSocket (Socket.IO)
       │                       │
       └───────────┬───────────┘
                   │
            ┌──────▼──────┐
            │   Server    │
            │  (Node.js)  │
            └──────┬──────┘
                   │
       ┌───────────┼───────────┐
       │           │           │
  ┌────▼────┐ ┌───▼────┐ ┌───▼────┐
  │PostgreSQL│ │ Redis  │ │Socket.IO│
  │Messages │ │Pub/Sub │ │ Rooms  │
  └─────────┘ └────────┘ └────────┘
```

## Features

### ✅ Real-Time Messaging
- Instant message delivery via WebSocket
- Message persistence in PostgreSQL
- Offline message storage in Redis
- Message read receipts
- Typing indicators
- Online/offline status

### ✅ Conversation Management
- List all conversations
- Unread message count
- Search messages
- Delete messages
- Mark conversations as read

### ✅ Scalability
- Redis Pub/Sub for multi-instance support
- Horizontal scaling with load balancing
- Efficient caching strategy
- Connection pooling

## API Endpoints

### REST API

#### Get All Conversations
```http
GET /api/messages/conversations
Authorization: Bearer <token>
```

**Response:**
```json
[
  {
    "otherUser": {
      "id": 123,
      "name": "John Doe",
      "email": "john@example.com",
      "profilePicture": "https://..."
    },
    "lastMessage": {
      "message": "Hello!",
      "senderId": 123,
      "createdAt": "2024-01-25T10:00:00Z"
    },
    "unreadCount": 2,
    "isOnline": true
  }
]
```

#### Get Conversation with User
```http
GET /api/messages/conversation/:otherUserId?page=1&limit=50
Authorization: Bearer <token>
```

**Response:**
```json
{
  "messages": [
    {
      "id": 1,
      "senderId": 123,
      "receiverId": 456,
      "message": "Hello!",
      "read": true,
      "readAt": "2024-01-25T10:05:00Z",
      "createdAt": "2024-01-25T10:00:00Z",
      "sender": {
        "id": 123,
        "name": "John Doe",
        "profilePicture": "https://..."
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 100,
    "totalPages": 2
  }
}
```

#### Mark Message as Read
```http
POST /api/messages/read/:messageId
Authorization: Bearer <token>
```

#### Mark Conversation as Read
```http
POST /api/messages/read-conversation/:otherUserId
Authorization: Bearer <token>
```

#### Get Unread Count
```http
GET /api/messages/unread-count
Authorization: Bearer <token>
```

**Response:**
```json
{
  "count": 5
}
```

#### Search Messages
```http
GET /api/messages/search?q=hello&limit=20
Authorization: Bearer <token>
```

#### Delete Message
```http
DELETE /api/messages/:messageId
Authorization: Bearer <token>
```

### WebSocket Events

#### Connect
```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:5000', {
  auth: { token: 'your-jwt-token' }
});
```

#### Send Message
```javascript
socket.emit('send_message', {
  receiverId: 123,
  message: 'Hello!',
  conversationId: 'conv_123_456' // optional
});
```

#### Receive Message
```javascript
socket.on('new_message', (data) => {
  console.log('New message:', data);
  // {
  //   id: 1,
  //   senderId: 123,
  //   receiverId: 456,
  //   message: 'Hello!',
  //   conversationId: 'conv_123_456',
  //   timestamp: '2024-01-25T10:00:00Z',
  //   read: false
  // }
});
```

#### Message Sent Confirmation
```javascript
socket.on('message_sent', (data) => {
  console.log('Message sent:', data);
  // {
  //   messageId: 1,
  //   timestamp: '2024-01-25T10:00:00Z',
  //   conversationId: 'conv_123_456'
  // }
});
```

#### Typing Indicator
```javascript
// Send typing indicator
socket.emit('typing', {
  receiverId: 123,
  isTyping: true
});

// Receive typing indicator
socket.on('user_typing', (data) => {
  console.log('User typing:', data);
  // { userId: 123, isTyping: true }
});
```

#### Message Read Receipt
```javascript
// Send read receipt
socket.emit('message_read', {
  messageId: 1,
  senderId: 123
});

// Receive read receipt
socket.on('message_read', (data) => {
  console.log('Message read:', data);
  // {
  //   messageId: 1,
  //   readBy: 456,
  //   readAt: '2024-01-25T10:05:00Z'
  // }
});
```

#### Error Handling
```javascript
socket.on('error', (error) => {
  console.error('Socket error:', error);
});
```

## Client Integration

### React Hook Usage

```typescript
import { useWebSocket } from '@/hooks/useWebSocket';

function ChatComponent() {
  const { token } = useAuth();
  
  const {
    isConnected,
    sendMessage,
    sendTypingIndicator,
    markMessageAsRead,
  } = useWebSocket(token, {
    onNewMessage: (message) => {
      console.log('New message:', message);
      // Update UI
    },
    onMessageSent: (data) => {
      console.log('Message sent:', data);
    },
    onMessageRead: (data) => {
      console.log('Message read:', data);
      // Update message status in UI
    },
    onUserTyping: (data) => {
      console.log('User typing:', data);
      // Show typing indicator
    },
  });

  const handleSend = () => {
    sendMessage(receiverId, 'Hello!');
  };

  return (
    <div>
      <p>Status: {isConnected ? 'Connected' : 'Disconnected'}</p>
      <button onClick={handleSend}>Send Message</button>
    </div>
  );
}
```

### Components

#### ChatWindow
Full-featured chat interface with message list and input.

```tsx
import ChatWindow from '@/components/messaging/ChatWindow';

<ChatWindow
  currentUserId={user.id}
  otherUser={{
    id: 123,
    name: 'John Doe',
    profilePicture: 'https://...'
  }}
  token={token}
  onClose={() => console.log('Closed')}
/>
```

#### ConversationList
List of all conversations with unread counts.

```tsx
import ConversationList from '@/components/messaging/ConversationList';

<ConversationList
  conversations={conversations}
  currentUserId={user.id}
  selectedUserId={selectedUserId}
  onSelectConversation={(userId) => setSelectedUserId(userId)}
/>
```

#### StartConversationButton
Button to start a conversation with a user (e.g., on service details page).

```tsx
import StartConversationButton from '@/components/messaging/StartConversationButton';

<StartConversationButton
  userId={provider.id}
  userName={provider.name}
  variant="solid"
  size="md"
/>
```

#### MessageNotificationBadge
Badge showing unread message count (e.g., in navbar).

```tsx
import MessageNotificationBadge from '@/components/messaging/MessageNotificationBadge';

<MessageNotificationBadge>
  <MessageIcon />
</MessageNotificationBadge>
```

## Database Schema

### Messages Table

```sql
CREATE TABLE messages (
  id SERIAL PRIMARY KEY,
  sender_id INTEGER NOT NULL REFERENCES users(id),
  receiver_id INTEGER NOT NULL REFERENCES users(id),
  message TEXT NOT NULL,
  conversation_id VARCHAR(255),
  read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB
);

CREATE INDEX idx_messages_sender_receiver ON messages(sender_id, receiver_id);
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);
```

## Caching Strategy

### Message Caching
- Individual messages: 1 hour TTL
- Conversation list: 30 seconds TTL
- Unread count: 10 seconds TTL

### Cache Keys
- `message:{messageId}` - Individual message
- `conversation:{userId1}:{userId2}:{page}` - Conversation messages
- `user:{userId}:conversations` - User's conversation list
- `user:{userId}:unread-count` - Unread message count
- `offline_messages:{userId}` - Offline messages queue

## Offline Message Handling

When a user is offline:
1. Message is saved to PostgreSQL
2. Message is stored in Redis list: `offline_messages:{userId}`
3. Notification is queued via Redis Pub/Sub
4. When user comes online, offline messages are delivered
5. Offline messages expire after 7 days

## Performance Optimization

### Best Practices

1. **Pagination**: Always paginate message history
2. **Caching**: Use Redis cache for frequently accessed data
3. **Indexing**: Ensure database indexes on sender_id, receiver_id, created_at
4. **Connection Pooling**: Configure appropriate pool size
5. **Rate Limiting**: Implement rate limits on message sending

### Recommended Limits

- Messages per conversation: 50 per page
- Message length: 5000 characters max
- Messages per minute: 60 per user
- Concurrent connections: 10,000+ per instance

## Security

### Authentication
- JWT token required for WebSocket connection
- Token validated on connection and message send
- User can only send messages as themselves

### Authorization
- Users can only read their own messages
- Users can only delete their own sent messages
- Message content is not encrypted (consider E2E encryption for sensitive data)

### Rate Limiting
- Implemented at Nginx level
- Per-user rate limiting in application
- Prevents spam and abuse

## Monitoring

### Key Metrics
- Active WebSocket connections
- Messages sent per second
- Message delivery latency
- Offline message queue depth
- Cache hit/miss ratio
- Database query performance

### Logging
```javascript
// Message sent
console.log(`Message sent: ${senderId} -> ${receiverId}`);

// Message delivered
console.log(`Message delivered: ${messageId}`);

// User connected
console.log(`User connected: ${userId}`);

// User disconnected
console.log(`User disconnected: ${userId}`);
```

## Troubleshooting

### WebSocket Not Connecting
1. Check JWT token is valid
2. Verify CORS settings
3. Check firewall rules
4. Ensure WebSocket upgrade headers in Nginx

### Messages Not Delivering
1. Check Redis Pub/Sub is working
2. Verify user is connected
3. Check offline message queue
4. Review server logs

### High Latency
1. Check Redis connection
2. Review database query performance
3. Monitor network latency
4. Check server load

## Future Enhancements

- [ ] End-to-end encryption
- [ ] File/image sharing
- [ ] Voice messages
- [ ] Video calling
- [ ] Message reactions
- [ ] Message editing
- [ ] Group conversations
- [ ] Message forwarding
- [ ] Push notifications (FCM/APNs)
- [ ] Desktop notifications

## Support

For issues or questions:
- Check server logs: `docker-compose logs -f app1`
- Review Redis logs: `docker-compose logs -f redis`
- Test WebSocket connection: Use Socket.IO client tester
- API documentation: `/api/docs`
