import { Router, Response } from "express";
import { AppDataSource } from "../data-source";
import { User } from "../entities/User";
import { authMiddleware, AuthRequest } from "../middleware/auth";

const router = Router();
const userRepository = AppDataSource.getRepository(User);

// GET /api/users/me
router.get("/me", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const user = await userRepository.findOne({ where: { id: req.user!.id } });

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

export default router;
