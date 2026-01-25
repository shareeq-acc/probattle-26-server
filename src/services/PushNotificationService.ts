import admin from 'firebase-admin';
import RedisService from './RedisService';
import { AppDataSource } from '../data-source';
import { User } from '../entities/User';

interface PushNotification {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  imageUrl?: string;
  priority?: 'high' | 'normal';
}

interface DeviceToken {
  userId: string;
  token: string;
  platform: 'ios' | 'android' | 'web';
  createdAt: Date;
}

class PushNotificationService {
  private isInitialized = false;
  private readonly CHANNEL_PUSH_NOTIFICATIONS = 'push_notifications_channel';
  private readonly DEVICE_TOKENS_KEY_PREFIX = 'device_tokens:';

  /**
   * Initialize Firebase Admin SDK
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('⚠️ PushNotificationService already initialized');
      return;
    }

    try {
      // Check if Firebase credentials are provided
      const firebaseCredentials = process.env.FIREBASE_SERVICE_ACCOUNT;
      
      if (!firebaseCredentials) {
        console.log('⚠️ Firebase credentials not found. Push notifications disabled.');
        console.log('💡 To enable push notifications, set FIREBASE_SERVICE_ACCOUNT environment variable');
        return;
      }

      // Initialize Firebase Admin
      const serviceAccount = JSON.parse(firebaseCredentials);
      
      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
      }

      // Subscribe to push notification channel
      await this.subscribeToNotifications();

      this.isInitialized = true;
      console.log('✅ PushNotificationService initialized with Firebase');
    } catch (error) {
      console.error('❌ Failed to initialize PushNotificationService:', error);
      console.log('⚠️ Push notifications will be disabled');
    }
  }

  /**
   * Subscribe to Redis Pub/Sub channel for push notifications
   */
  private async subscribeToNotifications(): Promise<void> {
    try {
      await RedisService.subscribe(this.CHANNEL_PUSH_NOTIFICATIONS, async (message) => {
        try {
          const notification: PushNotification = JSON.parse(message);
          await this.sendPushNotification(notification);
        } catch (error) {
          console.error('Error processing push notification:', error);
        }
      });
      console.log(`🔔 Subscribed to ${this.CHANNEL_PUSH_NOTIFICATIONS}`);
    } catch (error) {
      console.error('Error subscribing to push notifications:', error);
    }
  }

  /**
   * Queue a push notification via Redis Pub/Sub
   */
  async queueNotification(notification: PushNotification): Promise<void> {
    try {
      const message = JSON.stringify(notification);
      await RedisService.publish(this.CHANNEL_PUSH_NOTIFICATIONS, message);
      console.log(`📤 Queued push notification for user ${notification.userId}`);
    } catch (error) {
      console.error('Error queuing push notification:', error);
    }
  }

  /**
   * Send push notification to a user
   */
  private async sendPushNotification(notification: PushNotification): Promise<void> {
    if (!this.isInitialized) {
      console.log('⚠️ Push notifications not initialized. Skipping notification.');
      return;
    }

    try {
      // Get user's device tokens
      const tokens = await this.getDeviceTokens(notification.userId);

      if (tokens.length === 0) {
        console.log(`No device tokens found for user ${notification.userId}`);
        return;
      }

      // Prepare FCM message
      const message: admin.messaging.MulticastMessage = {
        notification: {
          title: notification.title,
          body: notification.body,
          imageUrl: notification.imageUrl,
        },
        data: notification.data || {},
        tokens: tokens.map(t => t.token),
        android: {
          priority: notification.priority || 'high',
          notification: {
            sound: 'default',
            channelId: 'messages',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
        webpush: {
          notification: {
            icon: '/icon-192x192.png',
            badge: '/badge-72x72.png',
          },
        },
      };

      // Send notification
      const response = await admin.messaging().sendEachForMulticast(message);

      console.log(`✅ Sent push notification to user ${notification.userId}: ${response.successCount} success, ${response.failureCount} failed`);

      // Remove invalid tokens
      if (response.failureCount > 0) {
        const invalidTokens: string[] = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success && resp.error) {
            const errorCode = resp.error.code;
            if (
              errorCode === 'messaging/invalid-registration-token' ||
              errorCode === 'messaging/registration-token-not-registered'
            ) {
              invalidTokens.push(tokens[idx].token);
            }
          }
        });

        if (invalidTokens.length > 0) {
          await this.removeDeviceTokens(notification.userId, invalidTokens);
        }
      }

      // Store notification in database for history
      await this.storeNotificationHistory(notification);
    } catch (error) {
      console.error('Error sending push notification:', error);
    }
  }

  /**
   * Register a device token for a user
   */
  async registerDeviceToken(
    userId: string,
    token: string,
    platform: 'ios' | 'android' | 'web'
  ): Promise<void> {
    try {
      const key = `${this.DEVICE_TOKENS_KEY_PREFIX}${userId}`;
      
      // Get existing tokens
      const existingTokens = await RedisService.getJSON<DeviceToken[]>(key) || [];
      
      // Check if token already exists
      const tokenExists = existingTokens.some(t => t.token === token);
      
      if (!tokenExists) {
        const deviceToken: DeviceToken = {
          userId,
          token,
          platform,
          createdAt: new Date(),
        };
        
        existingTokens.push(deviceToken);
        
        // Store with 90 days TTL
        await RedisService.setJSON(key, existingTokens, 90 * 24 * 60 * 60);
        
        console.log(`✅ Registered device token for user ${userId} (${platform})`);
      }
    } catch (error) {
      console.error('Error registering device token:', error);
    }
  }

  /**
   * Get device tokens for a user
   */
  async getDeviceTokens(userId: string): Promise<DeviceToken[]> {
    try {
      const key = `${this.DEVICE_TOKENS_KEY_PREFIX}${userId}`;
      const tokens = await RedisService.getJSON<DeviceToken[]>(key);
      return tokens || [];
    } catch (error) {
      console.error('Error getting device tokens:', error);
      return [];
    }
  }

  /**
   * Remove device tokens for a user
   */
  async removeDeviceTokens(userId: string, tokensToRemove: string[]): Promise<void> {
    try {
      const key = `${this.DEVICE_TOKENS_KEY_PREFIX}${userId}`;
      const existingTokens = await RedisService.getJSON<DeviceToken[]>(key) || [];
      
      const filteredTokens = existingTokens.filter(
        t => !tokensToRemove.includes(t.token)
      );
      
      if (filteredTokens.length > 0) {
        await RedisService.setJSON(key, filteredTokens, 90 * 24 * 60 * 60);
      } else {
        await RedisService.del(key);
      }
      
      console.log(`🗑️ Removed ${tokensToRemove.length} invalid tokens for user ${userId}`);
    } catch (error) {
      console.error('Error removing device tokens:', error);
    }
  }

  /**
   * Unregister a specific device token
   */
  async unregisterDeviceToken(userId: string, token: string): Promise<void> {
    await this.removeDeviceTokens(userId, [token]);
  }

  /**
   * Store notification in history (for tracking)
   */
  private async storeNotificationHistory(notification: PushNotification): Promise<void> {
    try {
      const key = `notification_history:${notification.userId}`;
      const history = await RedisService.getJSON<any[]>(key) || [];
      
      history.unshift({
        title: notification.title,
        body: notification.body,
        data: notification.data,
        sentAt: new Date(),
      });
      
      // Keep only last 50 notifications
      if (history.length > 50) {
        history.splice(50);
      }
      
      // Store with 30 days TTL
      await RedisService.setJSON(key, history, 30 * 24 * 60 * 60);
    } catch (error) {
      console.error('Error storing notification history:', error);
    }
  }

  /**
   * Get notification history for a user
   */
  async getNotificationHistory(userId: string, limit: number = 20): Promise<any[]> {
    try {
      const key = `notification_history:${userId}`;
      const history = await RedisService.getJSON<any[]>(key) || [];
      return history.slice(0, limit);
    } catch (error) {
      console.error('Error getting notification history:', error);
      return [];
    }
  }

  /**
   * Send notification for new message
   */
  async sendNewMessageNotification(
    receiverId: string,
    senderName: string,
    messagePreview: string
  ): Promise<void> {
    await this.queueNotification({
      userId: receiverId,
      title: `New message from ${senderName}`,
      body: messagePreview,
      data: {
        type: 'new_message',
        senderId: receiverId,
      },
      priority: 'high',
    });
  }

  /**
   * Send notification for service request
   */
  async sendServiceRequestNotification(
    providerId: string,
    seekerName: string,
    serviceName: string
  ): Promise<void> {
    await this.queueNotification({
      userId: providerId,
      title: 'New Service Request',
      body: `${seekerName} is interested in your ${serviceName} service`,
      data: {
        type: 'service_request',
        seekerId: seekerName,
      },
      priority: 'high',
    });
  }

  /**
   * Test notification (for debugging)
   */
  async sendTestNotification(userId: string): Promise<void> {
    await this.queueNotification({
      userId,
      title: 'Test Notification',
      body: 'This is a test push notification',
      data: {
        type: 'test',
      },
    });
  }
}

export default new PushNotificationService();
