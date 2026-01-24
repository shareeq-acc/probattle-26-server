import { Router, Request, Response } from "express";
import { AppDataSource } from "../data-source";
import { Report, ReportEntityType, ReportReason, ReportStatus } from "../entities/Report";
import { Service } from "../entities/Service";
import { User } from "../entities/User";
import { authenticateToken, AuthRequest, requireModerator } from "../middleware/auth";
import { generalLimiter } from "../middleware/rateLimiter";

const router = Router();
const reportRepository = AppDataSource.getRepository(Report);
const serviceRepository = AppDataSource.getRepository(Service);
const userRepository = AppDataSource.getRepository(User);

// POST /api/reports (Protected)
router.post("/", authenticateToken, generalLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { reportedEntityType, reportedEntityId, reason, description } = req.body;

    if (!reportedEntityType || !reportedEntityId || !reason) {
      return res.status(400).json({ 
        error: "reportedEntityType, reportedEntityId, and reason are required" 
      });
    }

    // Validate entity type
    if (!Object.values(ReportEntityType).includes(reportedEntityType)) {
      return res.status(400).json({ error: "Invalid entity type" });
    }

    // Validate reason
    if (!Object.values(ReportReason).includes(reason)) {
      return res.status(400).json({ error: "Invalid reason" });
    }

    // Verify that the reported entity exists
    if (reportedEntityType === ReportEntityType.SERVICE) {
      const service = await serviceRepository.findOne({ where: { id: reportedEntityId } });
      if (!service) {
        return res.status(404).json({ error: "Service not found" });
      }
    } else if (reportedEntityType === ReportEntityType.USER) {
      const user = await userRepository.findOne({ where: { id: reportedEntityId } });
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
    }

    // Check if user already reported this entity
    const existingReport = await reportRepository.findOne({
      where: {
        reporterId: req.user!.id,
        reportedEntityType,
        reportedEntityId
      }
    });

    if (existingReport) {
      return res.status(400).json({ error: "You have already reported this entity" });
    }

    const report = reportRepository.create({
      reporterId: req.user!.id,
      reportedEntityType,
      reportedEntityId,
      reason,
      description,
      status: ReportStatus.PENDING
    });

    await reportRepository.save(report);

    res.status(201).json({
      report: {
        id: report.id,
        status: report.status,
        createdAt: report.createdAt
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/reports (Moderator/Admin only)
router.get("/", authenticateToken, requireModerator, generalLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { status, entityType, page = 1, limit = 20 } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = Math.min(parseInt(limit as string), 100);
    const offset = (pageNum - 1) * limitNum;

    let where: any = {};
    
    if (status && Object.values(ReportStatus).includes(status as ReportStatus)) {
      where.status = status;
    }
    
    if (entityType && Object.values(ReportEntityType).includes(entityType as ReportEntityType)) {
      where.reportedEntityType = entityType;
    }

    const [reports, total] = await reportRepository.findAndCount({
      where,
      relations: ["reporter"],
      order: { createdAt: "DESC" },
      skip: offset,
      take: limitNum
    });

    // Clean up reporter data
    reports.forEach((report: any) => {
      if (report.reporter) {
        const { password: _, ...reporterWithoutPassword } = report.reporter;
        report.reporter = reporterWithoutPassword;
      }
    });

    const totalPages = Math.ceil(total / limitNum);

    res.json({
      reports,
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

// PUT /api/reports/:id/review (Moderator/Admin only)
router.put("/:id/review", authenticateToken, requireModerator, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !Object.values(ReportStatus).includes(status)) {
      return res.status(400).json({ error: "Valid status is required" });
    }

    const report = await reportRepository.findOne({
      where: { id },
      relations: ["reporter"]
    });

    if (!report) {
      return res.status(404).json({ error: "Report not found" });
    }

    report.status = status;
    report.reviewedBy = req.user!.id;
    report.reviewedAt = new Date();

    await reportRepository.save(report);

    // Clean up reporter data
    if (report.reporter) {
      const { password: _, ...reporterWithoutPassword } = report.reporter;
      report.reporter = reporterWithoutPassword as any;
    }

    res.json(report);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/reports/:id (Moderator/Admin only)
router.get("/:id", authenticateToken, requireModerator, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const report = await reportRepository.findOne({
      where: { id },
      relations: ["reporter"]
    });

    if (!report) {
      return res.status(404).json({ error: "Report not found" });
    }

    // Clean up reporter data
    if (report.reporter) {
      const { password: _, ...reporterWithoutPassword } = report.reporter;
      report.reporter = reporterWithoutPassword as any;
    }

    res.json(report);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;