import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import PushNotificationService from '../services/PushNotificationService';

const router = Router();

interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

/**
 * Register device token for push notifications
 * POST /api/notifications/register-token
 */
router.post('/register-token', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { token, platform } = req.body;
    const userId = req.user!.id;

    if (!token || !platform) {
      return res.status(400).json({ error: 'Token and platform are required' });
    }

    if (!['ios', 'android', 'web'].includes(platform)) {
      return res.status(400).json({ error: 'Invalid platform. Must be ios, android, or web' });
    }

    await PushNotificationService.registerDeviceToken(userId, token, platform);

    res.json({ 
      success: true,
      message: 'Device token registered successfully' 
    });
  } catch (error) {
    console.error('Error registering device token:', error);
    res.status(500).json({ error: 'Failed to register device token' });
  }
});

/**
 * Unregister device token
 * POST /api/notifications/unregister-token
 */
router.post('/unregister-token', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { token } = req.body;
    const userId = req.user!.id;

    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    await PushNotificationService.unregisterDeviceToken(userId, token);

    res.json({ 
      success: true,
      message: 'Device token unregistered successfully' 
    });
  } catch (error) {
    console.error('Error unregistering device token:', error);
    res.status(500).json({ error: 'Failed to unregister device token' });
  }
});

/**
 * Get notification history
 * GET /api/notifications/history
 */
router.get('/history', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const limit = parseInt(req.query.limit as string) || 20;

    const history = await PushNotificationService.getNotificationHistory(userId, limit);

    res.json({ 
      success: true,
      notifications: history 
    });
  } catch (error) {
    console.error('Error getting notification history:', error);
    res.status(500).json({ error: 'Failed to get notification history' });
  }
});

/**
 * Send test notification
 * POST /api/notifications/test
 */
router.post('/test', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    await PushNotificationService.sendTestNotification(userId);

    res.json({ 
      success: true,
      message: 'Test notification sent' 
    });
  } catch (error) {
    console.error('Error sending test notification:', error);
    res.status(500).json({ error: 'Failed to send test notification' });
  }
});

/**
 * Get device tokens (for debugging)
 * GET /api/notifications/tokens
 */
router.get('/tokens', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const tokens = await PushNotificationService.getDeviceTokens(userId);

    res.json({ 
      success: true,
      tokens: tokens.map(t => ({
        platform: t.platform,
        createdAt: t.createdAt,
        tokenPreview: t.token.substring(0, 20) + '...'
      }))
    });
  } catch (error) {
    console.error('Error getting device tokens:', error);
    res.status(500).json({ error: 'Failed to get device tokens' });
  }
});

export default router;
