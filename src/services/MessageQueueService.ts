import RedisService from './RedisService';

interface MessagePayload {
  type: string;
  data: any;
  timestamp: number;
}

class MessageQueueService {
  private readonly CHANNEL_MESSAGES = 'messages_channel';
  private readonly CHANNEL_NOTIFICATIONS = 'notifications_channel';
  private isInitialized = false;

  /**
   * Initialize message queue service
   */
  async connect(): Promise<void> {
    if (this.isInitialized) {
      console.log('⚠️ MessageQueue already initialized');
      return;
    }

    try {
      console.log('✅ MessageQueue (Redis Pub/Sub) initialized');
      this.isInitialized = true;
    } catch (error) {
      console.error('❌ Failed to initialize MessageQueue:', error);
      throw error;
    }
  }

  /**
   * Publish a message to a channel
   */
  private async publishToChannel(channel: string, payload: MessagePayload): Promise<void> {
    try {
      const message = JSON.stringify(payload);
      await RedisService.publish(channel, message);
    } catch (error) {
      console.error(`Error publishing to channel ${channel}:`, error);
    }
  }

  /**
   * Subscribe to messages channel
   */
  async consumeMessages(callback: (message: MessagePayload) => Promise<void>): Promise<void> {
    try {
      await RedisService.subscribe(this.CHANNEL_MESSAGES, async (message) => {
        try {
          const payload: MessagePayload = JSON.parse(message);
          await callback(payload);
        } catch (error) {
          console.error('Error processing message:', error);
        }
      });
      console.log(`📨 Subscribed to ${this.CHANNEL_MESSAGES}`);
    } catch (error) {
      console.error('Error subscribing to messages:', error);
    }
  }

  /**
   * Subscribe to notifications channel
   */
  async consumeNotifications(callback: (notification: MessagePayload) => Promise<void>): Promise<void> {
    try {
      await RedisService.subscribe(this.CHANNEL_NOTIFICATIONS, async (message) => {
        try {
          const payload: MessagePayload = JSON.parse(message);
          await callback(payload);
        } catch (error) {
          console.error('Error processing notification:', error);
        }
      });
      console.log(`🔔 Subscribed to ${this.CHANNEL_NOTIFICATIONS}`);
    } catch (error) {
      console.error('Error subscribing to notifications:', error);
    }
  }

  /**
   * Send a chat message
   */
  async sendChatMessage(senderId: string, receiverId: string, message: string): Promise<void> {
    await this.publishToChannel(this.CHANNEL_MESSAGES, {
      type: 'chat_message',
      data: { senderId, receiverId, message },
      timestamp: Date.now(),
    });
  }

  /**
   * Send a notification
   */
  async sendNotification(userId: string, title: string, body: string, data?: any): Promise<void> {
    await this.publishToChannel(this.CHANNEL_NOTIFICATIONS, {
      type: 'push_notification',
      data: { userId, title, body, data },
      timestamp: Date.now(),
    });
  }

  /**
   * Publish a generic message to messages channel
   */
  async publishMessage(type: string, payload: MessagePayload): Promise<void> {
    await this.publishToChannel(this.CHANNEL_MESSAGES, payload);
  }

  /**
   * Store message in Redis list for offline users (backup)
   */
  async storeOfflineMessage(userId: string, message: any): Promise<void> {
    try {
      const key = `offline_messages:${userId}`;
      await RedisService.lpush(key, JSON.stringify(message));
      // Set expiry for 7 days
      await RedisService.expire(key, 7 * 24 * 60 * 60);
    } catch (error) {
      console.error('Error storing offline message:', error);
    }
  }

  /**
   * Get offline messages for a user
   */
  async getOfflineMessages(userId: string): Promise<any[]> {
    try {
      const key = `offline_messages:${userId}`;
      const messages: any[] = [];
      
      let message = await RedisService.rpop(key);
      while (message) {
        messages.push(JSON.parse(message));
        message = await RedisService.rpop(key);
      }
      
      return messages;
    } catch (error) {
      console.error('Error getting offline messages:', error);
      return [];
    }
  }

  /**
   * Close connections (cleanup)
   */
  async close(): Promise<void> {
    try {
      console.log('MessageQueue closed (Redis Pub/Sub)');
      this.isInitialized = false;
    } catch (error) {
      console.error('Error closing MessageQueue:', error);
    }
  }
}

export default new MessageQueueService();
