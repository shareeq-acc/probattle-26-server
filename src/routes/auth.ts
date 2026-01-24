import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { AppDataSource } from "../data-source";
import { User } from "../entities/User";
import { generateTokenPair, verifyRefreshToken, findValidRefreshToken, revokeRefreshToken } from "../utils/jwt";
import { authLimiter } from "../middleware/rateLimiter";

const router = Router();
const userRepository = AppDataSource.getRepository(User);

// POST /api/auth/register
router.post("/register", authLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password, name, phone, role, bio, latitude, longitude } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: "Email, password, and name are required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const existingUser = await userRepository.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: "Email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = userRepository.create({
      email,
      password: hashedPassword,
      name,
      phone,
      role,
      bio,
      latitude: latitude ? parseFloat(latitude) : null,
      longitude: longitude ? parseFloat(longitude) : null
    });

    await userRepository.save(user);

    // Generate token pair
    const { accessToken, refreshToken } = await generateTokenPair(user);

    const { password: _, ...userWithoutPassword } = user;

    res.status(201).json({ 
      user: userWithoutPassword, 
      accessToken, 
      refreshToken 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/auth/login
router.post("/login", authLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const user = await userRepository.findOne({ 
      where: { email }
    });
    
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Generate token pair
    const { accessToken, refreshToken } = await generateTokenPair(user);

    const { password: _, ...userWithoutPassword } = user;

    res.json({ 
      user: userWithoutPassword, 
      accessToken, 
      refreshToken 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/auth/refresh
router.post("/refresh", async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: "Refresh token required" });
    }

    // Verify token signature
    const payload = verifyRefreshToken(refreshToken);

    // Check if token exists in database and is valid
    const storedToken = await findValidRefreshToken(refreshToken);
    if (!storedToken) {
      return res.status(403).json({ error: "Invalid or expired refresh token" });
    }

    // Check if token is expired
    if (storedToken.expiresAt < new Date()) {
      await revokeRefreshToken(refreshToken);
      return res.status(403).json({ error: "Refresh token expired" });
    }

    // Generate new token pair
    const { accessToken: newAccessToken, refreshToken: newRefreshToken } = await generateTokenPair(storedToken.user);

    // Revoke old refresh token
    await revokeRefreshToken(refreshToken);

    res.json({ 
      accessToken: newAccessToken, 
      refreshToken: newRefreshToken 
    });
  } catch (error) {
    console.error(error);
    res.status(403).json({ error: "Invalid refresh token" });
  }
});

// POST /api/auth/logout
router.post("/logout", async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      await revokeRefreshToken(refreshToken);
    }

    res.json({ message: "Logged out successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
