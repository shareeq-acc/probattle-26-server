import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import jwt from 'jsonwebtoken';
import RedisService from './RedisService';
import MessageQueueService from './MessageQueueService';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userRole?: string;
}

class WebSocketService {
  private io: SocketIOServer | null = null;
  private userSockets: Map<string, Set<string>> = new Map(); // userId -> Set of socketIds

  initialize(httpServer: HTTPServer): void {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: true,
        credentials: true,
      },
      transports: ['websocket', 'polling'],
      pingTimeout: 60000,
      pingInterval: 25000,
    });

    // Authentication middleware
    this.io.use(async (socket: AuthenticatedSocket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
        
        if (!token) {
          return next(new Error('Authentication required'));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
        socket.userId = decoded.userId;
        socket.userRole = decoded.role;
        
        next();
      } catch (error) {
        next(new Error('Invalid token'));
      }
    });

    this.io.on('connection', (socket: AuthenticatedSocket) => {
      this.handleConnection(socket);
    });

    console.log('✅ WebSocket server initialized');
  }

  private handleConnection(socket: AuthenticatedSocket): void {
    const userId = socket.userId!;
    
    // Track user's socket connections
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)!.add(socket.id);

    console.log(`User ${userId} connected (socket: ${socket.id})`);

    // Join user's personal room
    socket.join(`user:${userId}`);

    // Handle chat messages
    socket.on('send_message', async (data) => {
      await this.handleSendMessage(socket, data);
    });

    // Handle typing indicators
    socket.on('typing', (data) => {
      this.handleTyping(socket, data);
    });

    // Handle read receipts
    socket.on('message_read', async (data) => {
      await this.handleMessageRead(socket, data);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      this.handleDisconnection(socket);
    });
  }

  private async handleSendMessage(socket: AuthenticatedSocket, data: any): Promise<void> {
    const { receiverId, message, conversationId } = data;
    const senderId = socket.userId!;

    try {
      // Import Message entity dynamically to avoid circular dependency
      const { AppDataSource } = await import('../data-source');
      const { Message } = await import('../entities/Message');
      const messageRepo = AppDataSource.getRepository(Message);

      // Generate conversation ID if not provided
      const convId = conversationId || `conv_${[senderId, receiverId].sort().join('_')}`;

      // Save message to database
      const newMessage = messageRepo.create({
        senderId,
        receiverId,
        message,
        conversationId: convId,
        read: false,
      });

      const savedMessage = await messageRepo.save(newMessage);

      // Prepare message data
      const messageData = {
        id: savedMessage.id,
        senderId,
        receiverId,
        message,
        conversationId: convId,
        timestamp: savedMessage.createdAt,
        read: false,
      };

      // Cache the message
      await RedisService.setJSON(
        `message:${savedMessage.id}`,
        messageData,
        3600 // 1 hour TTL
      );

      // Invalidate conversation caches
      await RedisService.del(`user:${senderId}:conversations`);
      await RedisService.del(`user:${receiverId}:conversations`);
      await RedisService.del(`user:${receiverId}:unread-count`);

      // Send to receiver if online
      const receiverOnline = this.userSockets.has(receiverId);
      this.io!.to(`user:${receiverId}`).emit('new_message', messageData);

      // Send confirmation to sender
      socket.emit('message_sent', { 
        messageId: savedMessage.id, 
        timestamp: savedMessage.createdAt,
        conversationId: convId 
      });

      // If receiver is offline, store message and send push notification
      if (!receiverOnline) {
        await MessageQueueService.storeOfflineMessage(receiverId, messageData);
        
        // Get sender's name for notification
        const { User } = await import('../entities/User');
        const userRepo = AppDataSource.getRepository(User);
        const sender = await userRepo.findOne({ where: { id: senderId } });
        
        if (sender) {
          // Import and use PushNotificationService
          const PushNotificationService = (await import('./PushNotificationService')).default;
          await PushNotificationService.sendNewMessageNotification(
            receiverId,
            sender.name,
            message.length > 50 ? message.substring(0, 50) + '...' : message
          );
        }
      }

      // Publish to message queue for any additional processing
      await MessageQueueService.sendChatMessage(senderId, receiverId, message);
    } catch (error) {
      console.error('Error handling send message:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  }

  private handleTyping(socket: AuthenticatedSocket, data: any): void {
    const { receiverId, isTyping } = data;
    const senderId = socket.userId!;

    this.io!.to(`user:${receiverId}`).emit('user_typing', {
      userId: senderId,
      isTyping,
    });
  }

  private async handleMessageRead(socket: AuthenticatedSocket, data: any): Promise<void> {
    const { messageId, senderId } = data;
    const readerId = socket.userId!;

    try {
      // Update message read status in cache
      const cachedMessage = await RedisService.getJSON<any>(`message:${messageId}`);
      if (cachedMessage) {
        cachedMessage.read = true;
        await RedisService.setJSON(`message:${messageId}`, cachedMessage, 3600);
      }

      // Notify sender that message was read
      this.io!.to(`user:${senderId}`).emit('message_read', {
        messageId,
        readBy: readerId,
        readAt: new Date(),
      });
    } catch (error) {
      console.error('Error handling message read:', error);
    }
  }

  private handleDisconnection(socket: AuthenticatedSocket): void {
    const userId = socket.userId!;
    
    const userSocketSet = this.userSockets.get(userId);
    if (userSocketSet) {
      userSocketSet.delete(socket.id);
      if (userSocketSet.size === 0) {
        this.userSockets.delete(userId);
      }
    }

    console.log(`User ${userId} disconnected (socket: ${socket.id})`);
  }

  // Public methods to emit events from other parts of the application
  emitToUser(userId: string, event: string, data: any): void {
    if (this.io) {
      this.io.to(`user:${userId}`).emit(event, data);
    }
  }

  emitToAll(event: string, data: any): void {
    if (this.io) {
      this.io.emit(event, data);
    }
  }

  isUserOnline(userId: string): boolean {
    return this.userSockets.has(userId);
  }

  getOnlineUsers(): string[] {
    return Array.from(this.userSockets.keys());
  }

  getIO(): SocketIOServer | null {
    return this.io;
  }
}

export default new WebSocketService();
