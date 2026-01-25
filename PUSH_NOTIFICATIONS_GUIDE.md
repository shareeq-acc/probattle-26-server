# Push Notifications Implementation Guide

## Overview

This guide explains how to implement and use push notifications in the Neighbourly platform. The system uses Firebase Cloud Messaging (FCM) for cross-platform push notifications and Redis Pub/Sub for message distribution across multiple server instances.

## Architecture

```
┌─────────────────┐
│  Client App     │
│  (iOS/Android)  │
└────────┬────────┘
         │ Register Device Token
         ▼
┌─────────────────────────────────────────────────────────┐
│                    API Server                            │
│  ┌──────────────────────────────────────────────────┐  │
│  │  PushNotificationService                          │  │
│  │  - Register/Unregister tokens                     │  │
│  │  - Queue notifications via Redis Pub/Sub          │  │
│  │  - Send via Firebase Cloud Messaging              │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────┐         ┌──────────────────┐
│  Redis Pub/Sub  │────────▶│  Firebase FCM    │
│  (Distribution) │         │  (Delivery)      │
└─────────────────┘         └──────────────────┘
         │                           │
         ▼                           ▼
┌─────────────────┐         ┌──────────────────┐
│  Multiple       │         │  User Devices    │
│  Server         │         │  (iOS/Android)   │
│  Instances      │         └──────────────────┘
└─────────────────┘
```

## Setup Instructions

### 1. Firebase Project Setup

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or select existing one
3. Navigate to Project Settings → Service Accounts
4. Click "Generate New Private Key"
5. Download the JSON file (service account credentials)

### 2. Environment Configuration

Add the following to your `.env` file:

```bash
# Firebase Cloud Messaging (for push notifications)
# Paste the entire JSON content from Firebase service account file
FIREBASE_SERVICE_ACCOUNT='{"type":"service_account","project_id":"your-project-id",...}'
```

**Note:** The entire Firebase service account JSON should be on a single line.

### 3. Install Dependencies

```bash
cd server
npm install firebase-admin
```

### 4. Server Initialization

The push notification service is automatically initialized when the server starts. Check the logs:

```
✅ PushNotificationService initialized with Firebase
🔔 Subscribed to push_notifications_channel
```

If Firebase credentials are not configured:
```
⚠️ Firebase credentials not found. Push notifications disabled.
💡 To enable push notifications, set FIREBASE_SERVICE_ACCOUNT environment variable
```

## API Endpoints

### Register Device Token

Register a device token for receiving push notifications.

**Endpoint:** `POST /api/notifications/register-token`

**Headers:**
```
Authorization: Bearer <access_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "token": "device_fcm_token_here",
  "platform": "ios" // or "android" or "web"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Device token registered successfully"
}
```

### Unregister Device Token

Remove a device token (e.g., on logout).

**Endpoint:** `POST /api/notifications/unregister-token`

**Headers:**
```
Authorization: Bearer <access_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "token": "device_fcm_token_here"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Device token unregistered successfully"
}
```

### Get Notification History

Retrieve notification history for the authenticated user.

**Endpoint:** `GET /api/notifications/history?limit=20`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "success": true,
  "notifications": [
    {
      "title": "New message from John",
      "body": "Hey, are you available tomorrow?",
      "data": {
        "type": "new_message",
        "senderId": "user-uuid"
      },
      "sentAt": "2026-01-25T10:30:00Z"
    }
  ]
}
```

### Send Test Notification

Send a test notification to verify setup.

**Endpoint:** `POST /api/notifications/test`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "success": true,
  "message": "Test notification sent"
}
```

### Get Device Tokens (Debug)

View registered device tokens for the authenticated user.

**Endpoint:** `GET /api/notifications/tokens`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "success": true,
  "tokens": [
    {
      "platform": "ios",
      "createdAt": "2026-01-25T10:00:00Z",
      "tokenPreview": "dXNlcl9kZXZpY2VfdG9r..."
    }
  ]
}
```

## Client Integration

### iOS (Swift)

```swift
import FirebaseMessaging

// Request permission
UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
    if granted {
        DispatchQueue.main.async {
            UIApplication.shared.registerForRemoteNotifications()
        }
    }
}

// Get FCM token
Messaging.messaging().token { token, error in
    if let token = token {
        // Send token to your backend
        registerDeviceToken(token: token, platform: "ios")
    }
}
```

### Android (Kotlin)

```kotlin
import com.google.firebase.messaging.FirebaseMessaging

// Get FCM token
FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
    if (task.isSuccessful) {
        val token = task.result
        // Send token to your backend
        registerDeviceToken(token, "android")
    }
}
```

### React Native

```javascript
import messaging from '@react-native-firebase/messaging';

// Request permission
async function requestUserPermission() {
  const authStatus = await messaging().requestPermission();
  const enabled =
    authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
    authStatus === messaging.AuthorizationStatus.PROVISIONAL;

  if (enabled) {
    const token = await messaging().getToken();
    // Send token to your backend
    await registerDeviceToken(token, Platform.OS);
  }
}

// Handle foreground notifications
messaging().onMessage(async remoteMessage => {
  console.log('Notification received:', remoteMessage);
});
```

### Web (PWA)

```javascript
import { getMessaging, getToken } from 'firebase/messaging';

const messaging = getMessaging();

// Request permission and get token
async function requestNotificationPermission() {
  const permission = await Notification.requestPermission();
  
  if (permission === 'granted') {
    const token = await getToken(messaging, {
      vapidKey: 'YOUR_VAPID_KEY'
    });
    
    // Send token to your backend
    await registerDeviceToken(token, 'web');
  }
}
```

## Notification Types

### 1. New Message Notification

Automatically sent when a user receives a message while offline.

```typescript
await PushNotificationService.sendNewMessageNotification(
  receiverId,
  senderName,
  messagePreview
);
```

**Notification:**
- Title: "New message from {senderName}"
- Body: Message preview (truncated to 50 chars)
- Data: `{ type: 'new_message', senderId: '...' }`

### 2. Service Request Notification

Sent when a seeker messages a provider about a service.

```typescript
await PushNotificationService.sendServiceRequestNotification(
  providerId,
  seekerName,
  serviceName
);
```

**Notification:**
- Title: "New Service Request"
- Body: "{seekerName} is interested in your {serviceName} service"
- Data: `{ type: 'service_request', seekerId: '...' }`

### 3. Custom Notification

Send custom notifications programmatically.

```typescript
await PushNotificationService.queueNotification({
  userId: 'user-uuid',
  title: 'Custom Title',
  body: 'Custom message body',
  data: {
    type: 'custom',
    customField: 'value'
  },
  priority: 'high'
});
```

## How It Works

### 1. Device Token Registration

When a user logs in and grants notification permission:
1. Client app requests FCM token from Firebase
2. Client sends token to backend via `/api/notifications/register-token`
3. Backend stores token in Redis with 90-day TTL
4. Token is associated with user ID

### 2. Notification Flow (Offline User)

When a message is sent to an offline user:

1. **WebSocket Service** detects receiver is offline
2. Calls `PushNotificationService.sendNewMessageNotification()`
3. **PushNotificationService** queues notification via Redis Pub/Sub
4. Notification is published to `push_notifications_channel`
5. All server instances subscribed to channel receive notification
6. One instance processes it and sends to Firebase FCM
7. Firebase delivers notification to user's device
8. Notification history is stored in Redis

### 3. Token Management

- **Storage:** Redis with key pattern `device_tokens:{userId}`
- **TTL:** 90 days (auto-refresh on app usage)
- **Invalid Tokens:** Automatically removed when FCM reports them as invalid
- **Multiple Devices:** Users can have multiple tokens (iOS + Android + Web)

### 4. Scalability

- **Redis Pub/Sub:** Distributes notifications across multiple server instances
- **Horizontal Scaling:** Any instance can queue notifications, any can send them
- **Load Distribution:** Firebase handles delivery to millions of devices
- **Retry Logic:** Firebase automatically retries failed deliveries

## Testing

### 1. Test with cURL

```bash
# Register device token
curl -X POST http://localhost:5000/api/notifications/register-token \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "token": "test_device_token",
    "platform": "android"
  }'

# Send test notification
curl -X POST http://localhost:5000/api/notifications/test \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### 2. Test Message Notification

1. Login as User A
2. Register device token for User A
3. Logout User A (to simulate offline)
4. Login as User B
5. Send message to User A
6. User A should receive push notification

### 3. Check Logs

Server logs will show:
```
📤 Queued push notification for user {userId}
✅ Sent push notification to user {userId}: 1 success, 0 failed
```

## Troubleshooting

### No notifications received

1. **Check Firebase credentials:**
   ```bash
   # Verify FIREBASE_SERVICE_ACCOUNT is set
   echo $FIREBASE_SERVICE_ACCOUNT
   ```

2. **Check device token registration:**
   ```bash
   curl http://localhost:5000/api/notifications/tokens \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```

3. **Check server logs:**
   - Look for "PushNotificationService initialized"
   - Check for error messages

4. **Verify FCM token is valid:**
   - Test token directly in Firebase Console
   - Ensure app is configured correctly in Firebase

### Invalid token errors

- Tokens are automatically removed when FCM reports them as invalid
- User needs to re-register token (happens automatically on app restart)

### Notifications not working in production

1. Ensure `FIREBASE_SERVICE_ACCOUNT` is set in production environment
2. Verify Redis is accessible from all server instances
3. Check firewall rules allow FCM connections
4. Verify SSL certificates are valid

## Best Practices

1. **Register tokens on login:** Always register/refresh token when user logs in
2. **Unregister on logout:** Remove token when user logs out
3. **Handle token refresh:** FCM tokens can change, handle `onTokenRefresh` events
4. **Respect user preferences:** Allow users to disable notifications
5. **Meaningful notifications:** Only send important, actionable notifications
6. **Test thoroughly:** Test on real devices before production deployment
7. **Monitor delivery:** Track notification delivery rates and failures
8. **Batch notifications:** Don't spam users with too many notifications

## Security Considerations

1. **Token Storage:** Tokens are stored in Redis with encryption at rest
2. **Access Control:** Only authenticated users can register tokens
3. **Token Validation:** Invalid tokens are automatically removed
4. **Rate Limiting:** API endpoints are rate-limited to prevent abuse
5. **Data Privacy:** Notification content should not contain sensitive data
6. **User Consent:** Always request permission before sending notifications

## Performance

- **Token Lookup:** O(1) Redis lookup by user ID
- **Notification Queue:** Redis Pub/Sub provides near-instant distribution
- **Delivery:** Firebase handles millions of notifications per second
- **Storage:** Minimal storage (tokens + 50 recent notifications per user)
- **Scalability:** Horizontally scalable across multiple server instances

## Monitoring

Monitor these metrics:

1. **Registration Rate:** Tokens registered per day
2. **Delivery Rate:** Successful vs failed deliveries
3. **Invalid Tokens:** Rate of invalid token removal
4. **Notification Volume:** Notifications sent per hour/day
5. **Response Time:** Time from queue to delivery

## Future Enhancements

- [ ] Rich notifications with images and actions
- [ ] Notification preferences per user
- [ ] Scheduled notifications
- [ ] Notification analytics dashboard
- [ ] A/B testing for notification content
- [ ] Multi-language support
- [ ] Notification templates
- [ ] Silent notifications for data sync

## Support

For issues or questions:
- Check server logs for error messages
- Verify Firebase configuration
- Test with Firebase Console directly
- Review Redis Pub/Sub subscriptions
- Contact development team

---

**Last Updated:** January 25, 2026
**Version:** 1.0.0
