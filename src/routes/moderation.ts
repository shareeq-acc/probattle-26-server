import { Router, Request, Response } from "express";
import { AppDataSource } from "../data-source";
import { Service, ApprovalStatus } from "../entities/Service";
import { authenticateToken, AuthRequest, requireModerator } from "../middleware/auth";
import { generalLimiter } from "../middleware/rateLimiter";

const router = Router();
const serviceRepository = AppDataSource.getRepository(Service);

// GET /api/moderation/services/pending (Moderator/Admin only)
router.get("/services/pending", authenticateToken, requireModerator, generalLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = Math.min(parseInt(limit as string), 100);
    const offset = (pageNum - 1) * limitNum;

    const [services, total] = await serviceRepository.findAndCount({
      where: { approvalStatus: ApprovalStatus.PENDING },
      relations: ["provider", "city"],
      order: { createdAt: "ASC" }, // Oldest first for review queue
      skip: offset,
      take: limitNum
    });

    // Clean up provider data
    services.forEach((service: any) => {
      if (service.provider) {
        const { password: _, ...providerWithoutPassword } = service.provider;
        service.provider = providerWithoutPassword;
      }
    });

    const totalPages = Math.ceil(total / limitNum);

    res.json({
      services,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT /api/moderation/services/:id/approve (Moderator/Admin only)
router.put("/services/:id/approve", authenticateToken, requireModerator, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const service = await serviceRepository.findOne({
      where: { id },
      relations: ["provider", "city"]
    });

    if (!service) {
      return res.status(404).json({ error: "Service not found" });
    }

    if (service.approvalStatus !== ApprovalStatus.PENDING) {
      return res.status(400).json({ error: "Service is not pending approval" });
    }

    service.approvalStatus = ApprovalStatus.APPROVED;
    service.approvedBy = req.user!.id;
    service.approvedAt = new Date();

    await serviceRepository.save(service);

    // Clean up provider data
    if (service.provider) {
      const { password: _, ...providerWithoutPassword } = service.provider;
      service.provider = providerWithoutPassword as any;
    }

    res.json(service);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT /api/moderation/services/:id/reject (Moderator/Admin only)
router.put("/services/:id/reject", authenticateToken, requireModerator, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const service = await serviceRepository.findOne({
      where: { id },
      relations: ["provider", "city"]
    });

    if (!service) {
      return res.status(404).json({ error: "Service not found" });
    }

    if (service.approvalStatus !== ApprovalStatus.PENDING) {
      return res.status(400).json({ error: "Service is not pending approval" });
    }

    service.approvalStatus = ApprovalStatus.REJECTED;
    service.approvedBy = req.user!.id;
    service.approvedAt = new Date();

    await serviceRepository.save(service);

    // Clean up provider data
    if (service.provider) {
      const { password: _, ...providerWithoutPassword } = service.provider;
      service.provider = providerWithoutPassword as any;
    }

    res.json(service);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/moderation/services (All services for moderation - Moderator/Admin only)
router.get("/services", authenticateToken, requireModerator, generalLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = Math.min(parseInt(limit as string), 100);
    const offset = (pageNum - 1) * limitNum;

    let where: any = {};
    if (status && Object.values(ApprovalStatus).includes(status as ApprovalStatus)) {
      where.approvalStatus = status;
    }

    const [services, total] = await serviceRepository.findAndCount({
      where,
      relations: ["provider", "city"],
      order: { createdAt: "DESC" },
      skip: offset,
      take: limitNum
    });

    // Clean up provider data
    services.forEach((service: any) => {
      if (service.provider) {
        const { password: _, ...providerWithoutPassword } = service.provider;
        service.provider = providerWithoutPassword;
      }
    });

    const totalPages = Math.ceil(total / limitNum);

    res.json({
      services,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;