import { Router, Request, Response } from "express";
import { AppDataSource } from "../data-source";
import { User, UserRole } from "../entities/User";
import { Service, ApprovalStatus } from "../entities/Service";
import { Booking, BookingStatus } from "../entities/Booking";
import { Rating } from "../entities/Rating";
import { authenticateToken, AuthRequest, requireAdmin } from "../middleware/auth";
import { generalLimiter } from "../middleware/rateLimiter";

const router = Router();
const userRepository = AppDataSource.getRepository(User);
const serviceRepository = AppDataSource.getRepository(Service);
const bookingRepository = AppDataSource.getRepository(Booking);
const ratingRepository = AppDataSource.getRepository(Rating);

// GET /api/admin/users (Admin only)
router.get("/users", authenticateToken, requireAdmin, generalLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { role, verified, page = 1, limit = 20 } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = Math.min(parseInt(limit as string), 100);
    const offset = (pageNum - 1) * limitNum;

    let where: any = {};
    
    if (role && Object.values(UserRole).includes(role as UserRole)) {
      where.role = role;
    }
    
    if (verified !== undefined) {
      where.verified = verified === 'true';
    }

    const [users, total] = await userRepository.findAndCount({
      where,
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

    // Get users by location (using latitude/longitude presence as proxy for location data)
    const usersWithLocation = await userRepository
      .createQueryBuilder("user")
      .select([
        "CASE WHEN user.latitude IS NOT NULL AND user.longitude IS NOT NULL THEN 'Has Location' ELSE 'No Location' END as locationStatus",
        "COUNT(*) as count"
      ])
      .groupBy("CASE WHEN user.latitude IS NOT NULL AND user.longitude IS NOT NULL THEN 'Has Location' ELSE 'No Location' END")
      .getRawMany();

    const usersByLocationObj = usersWithLocation.reduce((acc, item) => {
      acc[item.locationStatus] = parseInt(item.count);
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
      usersByLocation: usersByLocationObj
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
      relations: ["services", "bookingsAsSeeker", "bookingsAsProvider"]
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

// GET /api/admin/services (Admin only) - Get all services with ratings and views
router.get("/services", authenticateToken, requireAdmin, generalLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20, sortBy = 'lowest_rating' } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = Math.min(parseInt(limit as string), 100);
    const offset = (pageNum - 1) * limitNum;

    // Start with ratings and get all related data in one query
    const ratingsWithServices = await ratingRepository
      .createQueryBuilder("rating")
      .leftJoinAndSelect("rating.booking", "booking")
      .leftJoinAndSelect("booking.service", "service")
      .leftJoinAndSelect("service.provider", "provider")
      .leftJoinAndSelect("rating.seeker", "seeker")
      .where("service.id IS NOT NULL") // Ensure we have valid services
      .orderBy("rating.createdAt", "DESC")
      .getMany();

    // Group ratings by service
    const serviceMap = new Map();
    
    ratingsWithServices.forEach(rating => {
      const service = rating.booking.service;
      const serviceId = service.id;
      
      if (!serviceMap.has(serviceId)) {
        // Remove password from provider
        const { password: _, ...providerWithoutPassword } = service.provider;
        
        serviceMap.set(serviceId, {
          ...service,
          provider: providerWithoutPassword,
          ratings: [],
          totalScore: 0,
          reviewCount: 0
        });
      }
      
      const serviceData = serviceMap.get(serviceId);
      
      // Add this rating to the service
      serviceData.ratings.push({
        id: rating.id,
        score: rating.score,
        review: rating.review,
        createdAt: rating.createdAt,
        seeker: {
          id: rating.seeker.id,
          name: rating.seeker.name,
          avatar: rating.seeker.avatar
        }
      });
      
      serviceData.totalScore += rating.score;
      serviceData.reviewCount += 1;
    });

    // Convert map to array and calculate averages
    let servicesWithStats = Array.from(serviceMap.values()).map((service: any) => {
      // Remove the intermediate ratings array and totalScore, keep only the clean data
      const { ratings, totalScore, ...cleanService } = service;
      
      return {
        ...cleanService,
        avgRating: service.reviewCount > 0 ? Math.round((service.totalScore / service.reviewCount) * 10) / 10 : 0,
        reviews: service.ratings, // Use the ratings array as reviews
        views: cleanService.views || 0
      };
    });

    // Also get services without ratings to include in the list
    const servicesWithRatings = Array.from(serviceMap.keys());
    let servicesWithoutRatings = [];
    
    if (servicesWithRatings.length > 0) {
      servicesWithoutRatings = await serviceRepository
        .createQueryBuilder("service")
        .leftJoinAndSelect("service.provider", "provider")
        .where("service.id NOT IN (:...serviceIds)", { serviceIds: servicesWithRatings })
        .getMany();
    } else {
      // If no services have ratings, get all services
      servicesWithoutRatings = await serviceRepository.find({
        relations: ["provider"]
      });
    }

    // Add services without ratings
    servicesWithoutRatings.forEach(service => {
      // Remove password from provider
      const { password: _, ...providerWithoutPassword } = service.provider;
      
      servicesWithStats.push({
        ...service,
        provider: providerWithoutPassword,
        avgRating: 0,
        reviewCount: 0,
        reviews: [],
        views: service.views || 0
      });
    });

    // Apply sorting
    switch (sortBy) {
      case 'lowest_rating':
        servicesWithStats.sort((a: any, b: any) => {
          // Services with no ratings go to the end
          if (a.reviewCount === 0 && b.reviewCount === 0) return 0;
          if (a.reviewCount === 0) return 1;
          if (b.reviewCount === 0) return -1;
          
          // Sort by average rating (ascending - lowest first)
          if (a.avgRating !== b.avgRating) {
            return a.avgRating - b.avgRating;
          }
          
          // If ratings are equal, sort by review count (ascending)
          return a.reviewCount - b.reviewCount;
        });
        break;
      
      case 'highest_rating':
        servicesWithStats.sort((a: any, b: any) => {
          // Services with no ratings go to the end
          if (a.reviewCount === 0 && b.reviewCount === 0) return 0;
          if (a.reviewCount === 0) return 1;
          if (b.reviewCount === 0) return -1;
          
          // Sort by average rating (descending - highest first)
          if (b.avgRating !== a.avgRating) {
            return b.avgRating - a.avgRating;
          }
          
          // If ratings are equal, sort by review count (descending)
          return b.reviewCount - a.reviewCount;
        });
        break;
      
      case 'most_views':
        servicesWithStats.sort((a: any, b: any) => b.views - a.views);
        break;
      
      case 'least_views':
        servicesWithStats.sort((a: any, b: any) => a.views - b.views);
        break;
      
      case 'newest':
        servicesWithStats.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
      
      case 'oldest':
        servicesWithStats.sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        break;
      
      default:
        // Default to lowest rating
        servicesWithStats.sort((a: any, b: any) => {
          if (a.reviewCount === 0 && b.reviewCount === 0) return 0;
          if (a.reviewCount === 0) return 1;
          if (b.reviewCount === 0) return -1;
          return a.avgRating - b.avgRating;
        });
    }

    // Apply pagination
    const total = servicesWithStats.length;
    const paginatedServices = servicesWithStats.slice(offset, offset + limitNum);
    const totalPages = Math.ceil(total / limitNum);

    res.json({
      services: paginatedServices,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages
      },
      sorting: {
        sortBy,
        availableSorts: ['lowest_rating', 'highest_rating', 'most_views', 'least_views', 'newest', 'oldest']
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// PATCH /api/admin/services/:id/disable (Admin only) - Disable a service
router.patch("/services/:id/disable", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const service = await serviceRepository.findOne({
      where: { id },
      relations: ["provider"]
    });

    if (!service) {
      return res.status(404).json({ error: "Service not found" });
    }

    if (!service.isActive) {
      return res.status(400).json({ error: "Service is already disabled" });
    }

    // Disable the service
    service.isActive = false;
    await serviceRepository.save(service);

    // Remove password from provider in response
    if (service.provider) {
      const { password: _, ...providerWithoutPassword } = service.provider;
      service.provider = providerWithoutPassword as any;
    }

    res.json({
      message: "Service disabled successfully",
      service: {
        id: service.id,
        title: service.title,
        isActive: service.isActive,
        provider: service.provider
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// PATCH /api/admin/services/:id/enable (Admin only) - Enable a service
router.patch("/services/:id/enable", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const service = await serviceRepository.findOne({
      where: { id },
      relations: ["provider"]
    });

    if (!service) {
      return res.status(404).json({ error: "Service not found" });
    }

    if (service.isActive) {
      return res.status(400).json({ error: "Service is already enabled" });
    }

    // Enable the service
    service.isActive = true;
    await serviceRepository.save(service);

    // Remove password from provider in response
    if (service.provider) {
      const { password: _, ...providerWithoutPassword } = service.provider;
      service.provider = providerWithoutPassword as any;
    }

    res.json({
      message: "Service enabled successfully",
      service: {
        id: service.id,
        title: service.title,
        isActive: service.isActive,
        provider: service.provider
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;