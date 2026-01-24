import { Router, Request, Response } from "express";
import { AppDataSource } from "../data-source";
import { User, UserRole } from "../entities/User";
import { Service, ApprovalStatus } from "../entities/Service";
import { Booking, BookingStatus } from "../entities/Booking";
import { authenticateToken, AuthRequest, requireAdmin } from "../middleware/auth";
import { generalLimiter } from "../middleware/rateLimiter";

const router = Router();
const userRepository = AppDataSource.getRepository(User);
const serviceRepository = AppDataSource.getRepository(Service);
const bookingRepository = AppDataSource.getRepository(Booking);

// GET /api/admin/users (Admin only)
router.get("/users", authenticateToken, requireAdmin, generalLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { role, cityId, verified, page = 1, limit = 20 } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = Math.min(parseInt(limit as string), 100);
    const offset = (pageNum - 1) * limitNum;

    let where: any = {};
    
    if (role && Object.values(UserRole).includes(role as UserRole)) {
      where.role = role;
    }
    
    if (cityId) {
      where.cityId = cityId;
    }
    
    if (verified !== undefined) {
      where.verified = verified === 'true';
    }

    const [users, total] = await userRepository.findAndCount({
      where,
      relations: ["city"],
      order: { createdAt: "DESC" },
      skip: offset,
      take: limitNum
    });

    // Remove passwords from response
    const usersWithoutPasswords = users.map(user => {
      const { password: _, ...userWithoutPassword } = user;
      return userWithoutPassword;
    });

    const totalPages = Math.ceil(total / limitNum);

    res.json({
      users: usersWithoutPasswords,
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

// PUT /api/admin/users/:id/role (Admin only)
router.put("/users/:id/role", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!role || !Object.values(UserRole).includes(role)) {
      return res.status(400).json({ error: "Valid role is required" });
    }

    const user = await userRepository.findOne({ where: { id } });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Prevent admin from changing their own role
    if (user.id === req.user!.id) {
      return res.status(400).json({ error: "Cannot change your own role" });
    }

    user.role = role;
    await userRepository.save(user);

    const { password: _, ...userWithoutPassword } = user;

    res.json({
      user: userWithoutPassword
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT /api/admin/users/:id/verified (Admin only)
router.put("/users/:id/verified", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { verified } = req.body;

    if (typeof verified !== 'boolean') {
      return res.status(400).json({ error: "Verified must be a boolean" });
    }

    const user = await userRepository.findOne({ where: { id } });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    user.verified = verified;
    await userRepository.save(user);

    const { password: _, ...userWithoutPassword } = user;

    res.json({
      user: userWithoutPassword
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/admin/analytics (Admin only)
router.get("/analytics", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    // Get total users
    const totalUsers = await userRepository.count();

    // Get users by role
    const usersByRole = await userRepository
      .createQueryBuilder("user")
      .select("user.role", "role")
      .addSelect("COUNT(*)", "count")
      .groupBy("user.role")
      .getRawMany();

    const usersByRoleObj = usersByRole.reduce((acc, item) => {
      acc[item.role] = parseInt(item.count);
      return acc;
    }, {} as Record<string, number>);

    // Get total services
    const totalServices = await serviceRepository.count();

    // Get services by status
    const servicesByStatus = await serviceRepository
      .createQueryBuilder("service")
      .select("service.approvalStatus", "status")
      .addSelect("COUNT(*)", "count")
      .groupBy("service.approvalStatus")
      .getRawMany();

    const servicesByStatusObj = servicesByStatus.reduce((acc, item) => {
      acc[item.status] = parseInt(item.count);
      return acc;
    }, {} as Record<string, number>);

    // Get services by category
    const servicesByCategory = await serviceRepository
      .createQueryBuilder("service")
      .select("service.category", "category")
      .addSelect("COUNT(*)", "count")
      .where("service.approvalStatus = :status", { status: ApprovalStatus.APPROVED })
      .groupBy("service.category")
      .getRawMany();

    const servicesByCategoryObj = servicesByCategory.reduce((acc, item) => {
      acc[item.category] = parseInt(item.count);
      return acc;
    }, {} as Record<string, number>);

    // Get total bookings
    const totalBookings = await bookingRepository.count();

    // Get bookings by status
    const bookingsByStatus = await bookingRepository
      .createQueryBuilder("booking")
      .select("booking.status", "status")
      .addSelect("COUNT(*)", "count")
      .groupBy("booking.status")
      .getRawMany();

    const bookingsByStatusObj = bookingsByStatus.reduce((acc, item) => {
      acc[item.status] = parseInt(item.count);
      return acc;
    }, {} as Record<string, number>);

    // Get users by city
    const usersByCity = await userRepository
      .createQueryBuilder("user")
      .leftJoin("user.city", "city")
      .select("city.name", "cityName")
      .addSelect("COUNT(*)", "count")
      .where("city.name IS NOT NULL")
      .groupBy("city.name")
      .getRawMany();

    const usersByCityObj = usersByCity.reduce((acc, item) => {
      acc[item.cityName] = parseInt(item.count);
      return acc;
    }, {} as Record<string, number>);

    res.json({
      totalUsers,
      usersByRole: usersByRoleObj,
      totalServices,
      servicesByStatus: servicesByStatusObj,
      servicesByCategory: servicesByCategoryObj,
      totalBookings,
      bookingsByStatus: bookingsByStatusObj,
      usersByCity: usersByCityObj
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/admin/users/:id (Admin only)
router.get("/users/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const user = await userRepository.findOne({
      where: { id },
      relations: ["city", "services", "bookingsAsSeeker", "bookingsAsProvider"]
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

export default router;