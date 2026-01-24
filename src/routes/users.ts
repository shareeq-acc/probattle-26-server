import { Router, Response } from "express";
import { AppDataSource } from "../data-source";
import { User } from "../entities/User";
import { authenticateToken, AuthRequest } from "../middleware/auth";
import { uploadAvatar, deleteCloudinaryImage } from "../middleware/cloudinaryUpload";
import { generalLimiter, uploadLimiter } from "../middleware/rateLimiter";

const router = Router();
const userRepository = AppDataSource.getRepository(User);

// GET /api/users/me
router.get("/me", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const user = await userRepository.findOne({ 
      where: { id: req.user!.id },
      relations: ['city']
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const { password: _, ...userWithoutPassword } = user;

    res.json(userWithoutPassword);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT /api/users/me
router.put("/me", authenticateToken, generalLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { name, phone, bio, cityId, latitude, longitude } = req.body;
    const userId = req.user!.id;

    const user = await userRepository.findOne({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Update fields if provided
    if (name !== undefined) user.name = name;
    if (phone !== undefined) user.phone = phone;
    if (bio !== undefined) user.bio = bio;
    if (cityId !== undefined) user.cityId = cityId;
    if (latitude !== undefined) user.latitude = latitude;
    if (longitude !== undefined) user.longitude = longitude;

    await userRepository.save(user);

    // Fetch updated user with relations
    const updatedUser = await userRepository.findOne({
      where: { id: userId },
      relations: ['city']
    });

    const { password: _, ...userWithoutPassword } = updatedUser!;

    res.json(userWithoutPassword);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT /api/users/me/avatar
router.put("/me/avatar", authenticateToken, uploadLimiter, uploadAvatar, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Avatar file is required" });
    }

    const userId = req.user!.id;
    const user = await userRepository.findOne({ where: { id: userId } });
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Delete old avatar from Cloudinary if exists
    if (user.avatar) {
      await deleteCloudinaryImage(user.avatar);
    }

    // Get Cloudinary URL from uploaded file
    const avatarUrl = (req.file as any).path; // Cloudinary returns the URL in the path property
    
    // Update user avatar
    user.avatar = avatarUrl;
    await userRepository.save(user);

    res.json({ avatar: avatarUrl });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE /api/users/me/avatar
router.delete("/me/avatar", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const user = await userRepository.findOne({ where: { id: userId } });
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (!user.avatar) {
      return res.status(400).json({ error: "No avatar to delete" });
    }

    // Delete avatar from Cloudinary
    await deleteCloudinaryImage(user.avatar);

    // Update user
    user.avatar = null;
    await userRepository.save(user);

    res.json({ message: "Avatar deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
