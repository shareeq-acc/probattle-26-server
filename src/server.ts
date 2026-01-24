import "reflect-metadata";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { AppDataSource } from "./data-source";
import authRoutes from "./routes/auth";
import usersRoutes from "./routes/users";
import servicesRoutes from "./routes/services";
import bookingsRoutes from "./routes/bookings";
import moderationRoutes from "./routes/moderation";
import reportsRoutes from "./routes/reports";
import adminRoutes from "./routes/admin";
import { generalLimiter } from "./middleware/rateLimiter";

dotenv.config();

const app = express();
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
app.use("/api/moderation", moderationRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/admin", adminRoutes);

app.get("/", (req, res) => {
  res.json({
    message: "Neighbourly API Stage 2 is running",
    version: "2.0.0",
    features: [
      "Multi-city support",
      "Geospatial search with H3",
      "Image uploads",
      "Service moderation",
      "Role-based access control",
      "Refresh token authentication",
      "Rate limiting"
    ]
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

// Initialize database and start server (only for local development)
if (process.env.NODE_ENV !== 'production') {
  AppDataSource.initialize()
    .then(() => {
      console.log("✅ Database connected successfully");
      console.log("🚀 Starting server...");

      app.listen(PORT, () => {
        console.log(`🌟 Neighbourly API Stage 2 is running on port ${PORT}`);
        console.log(`📍 Base URL: ${process.env.BASE_URL || `http://localhost:${PORT}`}`);
        console.log(`📁 Upload directory: ${uploadDir}`);
        console.log(`🗄️  Database: PostgreSQL`);
        console.log(`🔐 JWT Access Token Expiry: ${process.env.JWT_ACCESS_EXPIRES_IN || '15m'}`);
        console.log(`🔄 JWT Refresh Token Expiry: ${process.env.JWT_REFRESH_EXPIRES_IN || '7d'}`);
      });
    })
    .catch((error: any) => {
      console.error("❌ Database connection failed:", error);
      process.exit(1);
    });
}

export default app;