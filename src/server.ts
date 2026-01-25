import "reflect-metadata";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { createServer } from "http";
import { AppDataSource } from "./data-source";
import authRoutes from "./routes/auth";
import usersRoutes from "./routes/users";
import servicesRoutes from "./routes/services";
import bookingsRoutes from "./routes/bookings";
import ratingsRoutes from "./routes/ratings";
import moderationRoutes from "./routes/moderation";
import reportsRoutes from "./routes/reports";
import adminRoutes from "./routes/admin";
import dashboardRoutes from "./routes/dashboard";
import messagesRoutes from "./routes/messages";
import notificationsRoutes from "./routes/notifications";
import { generalLimiter } from "./middleware/rateLimiter";
import WebSocketService from "./services/WebSocketService";
import RedisService from "./services/RedisService";
import MessageQueueService from "./services/MessageQueueService";
import PushNotificationService from "./services/PushNotificationService";

dotenv.config();

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 5000;

// Trust proxy for Vercel deployment
app.set('trust proxy', 1);

// Middleware
app.use(cors({
  origin: true, // Allow all origins
  credentials: true, // Allow credentials (cookies, authorization headers)
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));
app.use(express.json());
app.use(generalLimiter); // Apply rate limiting globally

// Serve static files (uploaded images)
const uploadDir = process.env.UPLOAD_DIR || 'uploads';
app.use(`/${uploadDir}`, express.static(path.join(__dirname, '..', uploadDir)));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/services", servicesRoutes);
app.use("/api/bookings", bookingsRoutes);
app.use("/api/ratings", ratingsRoutes);
app.use("/api/moderation", moderationRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/messages", messagesRoutes);
app.use("/api/notifications", notificationsRoutes);

app.get("/", (req, res) => {
  res.json({
    message: "Neighbourly API - National Scale",
    version: "3.0.0",
    features: [
      "Multi-city support",
      "Geospatial search with H3",
      "Image uploads",
      "Service moderation",
      "Role-based access control",
      "Refresh token authentication",
      "Rate limiting",
      "Real-time messaging (WebSocket)",
      "Redis caching",
      "Redis Pub/Sub message queue",
      "Push notifications (FCM)",
      "Load balancing (Nginx)",
      "Horizontal scaling"
    ],
    scaling: {
      instances: process.env.INSTANCE_ID || "1",
      redis: RedisService.getClient().status,
      websocket: WebSocketService.getIO() ? "active" : "inactive",
    }
  });
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File too large' });
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ error: 'Unexpected file field' });
  }

  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Initialize all services and start server
async function startServer() {
  try {
    // Initialize database
    await AppDataSource.initialize();
    console.log("✅ Database connected successfully");

    // Initialize WebSocket
    WebSocketService.initialize(httpServer);

    // Initialize Message Queue
    await MessageQueueService.connect();

    // Initialize Push Notification Service
    await PushNotificationService.initialize();

    // Start consuming messages
    MessageQueueService.consumeMessages(async (message) => {
      console.log("Processing message:", message);
      // Handle message persistence to database
      if (message.type === 'chat_message') {
        const { senderId, receiverId, message: msg } = message.data;
        const messageRepo = AppDataSource.getRepository(require("./entities/Message").Message);
        await messageRepo.save({
          senderId,
          receiverId,
          message: msg,
          createdAt: new Date(message.timestamp),
        });
      }
    });

    // Start consuming notifications (deprecated - now using PushNotificationService)
    MessageQueueService.consumeNotifications(async (notification) => {
      console.log("Processing notification:", notification);
    });

    // Start HTTP server
    httpServer.listen(PORT, () => {
      console.log(`🌟 Neighbourly API - National Scale`);
      console.log(`📍 Server running on port ${PORT}`);
      console.log(`🔗 Base URL: ${process.env.BASE_URL || `http://localhost:${PORT}`}`);
      console.log(`📁 Upload directory: ${uploadDir}`);
      console.log(`🗄️  Database: PostgreSQL (Pool: 5-20 connections)`);
      console.log(`💾 Redis: ${process.env.REDIS_URL || 'redis://localhost:6379'}`);
      console.log(`📨 Message Queue: Redis Pub/Sub`);
      console.log(`🔔 Push Notifications: ${process.env.FIREBASE_SERVICE_ACCOUNT ? 'Enabled (FCM)' : 'Disabled'}`);
      console.log(`🔌 WebSocket: Active`);
      console.log(`🔐 JWT Access Token Expiry: ${process.env.JWT_ACCESS_EXPIRES_IN || '15m'}`);
      console.log(`🔄 JWT Refresh Token Expiry: ${process.env.JWT_REFRESH_EXPIRES_IN || '7d'}`);
      console.log(`⚡ Instance ID: ${process.env.INSTANCE_ID || '1'}`);
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('SIGTERM received, shutting down gracefully...');
      await MessageQueueService.close();
      await RedisService.disconnect();
      await AppDataSource.destroy();
      httpServer.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    });

  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

// Start server (skip in production Vercel environment)
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  startServer();
}

export default app;