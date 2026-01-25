# Push Notifications Quick Start

## 🚀 Get Started in 5 Minutes

### Step 1: Get Firebase Credentials

1. Go to https://console.firebase.google.com/
2. Create a project or select existing one
3. Click ⚙️ (Settings) → Project Settings
4. Go to "Service Accounts" tab
5. Click "Generate New Private Key"
6. Download the JSON file

### Step 2: Configure Server

**Option A: Use Helper Script (Recommended)**
```bash
cd server
node scripts/setup-firebase.js ~/Downloads/your-firebase-key.json
```

**Option B: Manual Setup**
```bash
# Open server/.env and add:
FIREBASE_SERVICE_ACCOUNT='{"type":"service_account","project_id":"your-project",...}'
```

### Step 3: Install & Start

```bash
cd server
npm install
npm run dev
```

Look for this in logs:
```
✅ PushNotificationService initialized with Firebase
🔔 Subscribed to push_notifications_channel
```

### Step 4: Test It

```bash
# Get your access token by logging in
TOKEN="your_access_token_here"

# Register a test device token
curl -X POST http://localhost:5000/api/notifications/register-token \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "token": "test_device_token_12345",
    "platform": "android"
  }'

# Send a test notification
curl -X POST http://localhost:5000/api/notifications/test \
  -H "Authorization: Bearer $TOKEN"
```

## 📱 Client Integration

### React Native

```javascript
import messaging from '@react-native-firebase/messaging';

// Request permission
await messaging().requestPermission();

// Get token
const token = await messaging().getToken();

// Register with backend
await fetch('http://your-api/api/notifications/register-token', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    token: token,
    platform: Platform.OS, // 'ios' or 'android'
  }),
});

// Handle notifications
messaging().onMessage(async remoteMessage => {
  console.log('Notification:', remoteMessage);
});
```

### iOS (Swift)

```swift
import FirebaseMessaging

// Request permission
UNUserNotificationCenter.current().requestAuthorization(
  options: [.alert, .sound, .badge]
) { granted, _ in
  if granted {
    DispatchQueue.main.async {
      UIApplication.shared.registerForRemoteNotifications()
    }
  }
}

// Get token
Messaging.messaging().token { token, error in
  guard let token = token else { return }
  
  // Register with backend
  registerToken(token: token, platform: "ios")
}
```

### Android (Kotlin)

```kotlin
import com.google.firebase.messaging.FirebaseMessaging

FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
  if (task.isSuccessful) {
    val token = task.result
    // Register with backend
    registerToken(token, "android")
  }
}
```

## 🎯 How It Works

1. **User goes offline** → WebSocket detects disconnection
2. **Message arrives** → Server checks if user is online
3. **User is offline** → Push notification is queued
4. **Redis Pub/Sub** → Distributes to all server instances
5. **Firebase FCM** → Delivers to user's device
6. **User receives** → Notification appears on device

## 📊 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/notifications/register-token` | POST | Register device token |
| `/api/notifications/unregister-token` | POST | Remove device token |
| `/api/notifications/test` | POST | Send test notification |
| `/api/notifications/history` | GET | Get notification history |
| `/api/notifications/tokens` | GET | View registered tokens |

## 🔍 Troubleshooting

### "Push notifications disabled" in logs
- Firebase credentials not configured
- Run setup script or add `FIREBASE_SERVICE_ACCOUNT` to .env

### No notifications received
1. Check device token is registered: `GET /api/notifications/tokens`
2. Verify Firebase project is configured correctly
3. Test token directly in Firebase Console
4. Check server logs for errors

### Invalid token errors
- Tokens are automatically removed when invalid
- User needs to re-register (happens on app restart)

## 📚 Full Documentation

- **Complete Guide**: `server/PUSH_NOTIFICATIONS_GUIDE.md`
- **Implementation Details**: `PUSH_NOTIFICATIONS_IMPLEMENTATION.md`
- **API Reference**: See guide for detailed API docs

## 🎉 That's It!

Your push notification system is now ready. Users will automatically receive notifications when they're offline and someone sends them a message.

**Need Help?**
- Check the full guide: `server/PUSH_NOTIFICATIONS_GUIDE.md`
- Review server logs for error messages
- Test with Firebase Console directly
