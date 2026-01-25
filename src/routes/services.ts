import { Router, Request, Response } from "express";
import { AppDataSource } from "../data-source";
import { Service, ApprovalStatus } from "../entities/Service";
import { Booking, BookingStatus } from "../entities/Booking";
import { Rating } from "../entities/Rating";
import { authenticateToken, AuthRequest, requireProvider } from "../middleware/auth";
import { uploadServiceImages, deleteCloudinaryImage } from "../middleware/cloudinaryUpload";
import { generalLimiter, uploadLimiter } from "../middleware/rateLimiter";
import { calculateH3Index, getH3CellsInRadius, calculateDistance } from "../utils/spatial";
import { reverseGeocode } from "../utils/geocoding";
import { Like, In } from "typeorm";
import { cacheMiddleware, CacheManager, invalidateCache } from "../middleware/cache";

const router = Router();
const serviceRepository = AppDataSource.getRepository(Service);
const bookingRepository = AppDataSource.getRepository(Booking);
const ratingRepository = AppDataSource.getRepository(Rating);

// GET /api/services/my-services (Get services for logged-in provider)
router.get("/my-services", authenticateToken, generalLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { status, page = 1, limit = 20, includeInactive = 'false' } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = Math.min(parseInt(limit as string), 100);
    const offset = (pageNum - 1) * limitNum;

    let where: any = { 
      providerId: req.user!.id
    };

    // Include inactive services only if explicitly requested
    if (includeInactive !== 'true') {
      where.isActive = true;
    }

    // Filter by approval status if provided
    if (status && Object.values(ApprovalStatus).includes(status as ApprovalStatus)) {
      where.approvalStatus = status as ApprovalStatus;
    }

    const [services, total] = await serviceRepository.findAndCount({
      where,
      relations: [],
      order: { createdAt: "DESC" },
      skip: offset,
      take: limitNum
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

// GET /api/services (ENHANCED with geospatial search, sorting, and caching)
router.get("/", generalLimiter, cacheMiddleware({ ttl: 300, keyPrefix: 'services' }), async (req: Request, res: Response) => {
  try {
    const { 
      lat, lng, radius, city, category, search, 
      minPrice, maxPrice, priceType, page = 1, limit = 20,
      sortBy = 'newest' // Options: 'newest', 'nearest', 'rating', 'price_low', 'price_high'
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = Math.min(parseInt(limit as string), 100);
    const offset = (pageNum - 1) * limitNum;

    let where: any = { 
      isActive: true, 
      approvalStatus: ApprovalStatus.APPROVED 
    };

    // Apply filters
    if (city) where.city = Like(`%${city}%`);
    if (category) where.category = category;
    if (priceType) where.priceType = priceType;
    if (minPrice) where.price = { ...where.price, $gte: parseFloat(minPrice as string) };
    if (maxPrice) where.price = { ...where.price, $lte: parseFloat(maxPrice as string) };

    let services: any[];
    let total: number;
    const userLat = lat ? parseFloat(lat as string) : null;
    const userLng = lng ? parseFloat(lng as string) : null;
    const radiusKm = radius ? parseFloat(radius as string) : null;

    // Geospatial search with H3 (if location provided)
    if (userLat && userLng && radiusKm) {
      // Get H3 cells within radius
      const h3Cells = getH3CellsInRadius(userLat, userLng, radiusKm);
      where.h3Index = In(h3Cells);

      services = await serviceRepository.find({
        where,
        relations: ["provider"]
      });

      // Filter by exact distance and calculate distance for each service
      services = services
        .map((service: any) => {
          const distance = calculateDistance(userLat, userLng, service.latitude, service.longitude);
          return { ...service, distance };
        })
        .filter((service: any) => service.distance <= radiusKm);

      total = services.length;
    } else {
      // Regular search without geospatial filtering
      services = await serviceRepository.find({
        where,
        relations: ["provider"]
      });

      // Add distance calculation if user location is provided (for sorting)
      if (userLat && userLng) {
        services = services.map((service: any) => {
          const distance = calculateDistance(userLat, userLng, service.latitude, service.longitude);
          return { ...service, distance };
        });
      }

      total = services.length;
    }

    // Apply text search if provided
    if (search) {
      const searchLower = (search as string).toLowerCase();
      services = services.filter((service: any) =>
        service.title.toLowerCase().includes(searchLower) ||
        service.description.toLowerCase().includes(searchLower)
      );
      total = services.length;
    }

    // Get ratings for all services to enable rating-based sorting
    const serviceIds = services.map(service => service.id);
    let serviceRatings: { [key: string]: { avgRating: number; reviewCount: number } } = {};

    if (serviceIds.length > 0) {
      const ratingsData = await ratingRepository
        .createQueryBuilder("rating")
        .leftJoin("rating.booking", "booking")
        .leftJoin("booking.service", "service")
        .select([
          "service.id as serviceId",
          "AVG(rating.score)::decimal as avgRating",
          "COUNT(rating.id)::int as reviewCount"
        ])
        .where("service.id IN (:...serviceIds)", { serviceIds })
        .groupBy("service.id")
        .getRawMany();

      // Convert to lookup object
      ratingsData.forEach(rating => {
        serviceRatings[rating.serviceId] = {
          avgRating: parseFloat(rating.avgRating || 0),
          reviewCount: rating.reviewCount || 0
        };
      });
    }

    // Add rating data to services
    services = services.map((service: any) => {
      const ratingData = serviceRatings[service.id] || { avgRating: 0, reviewCount: 0 };
      return {
        ...service,
        avgRating: ratingData.avgRating,
        reviewCount: ratingData.reviewCount
      };
    });

    // Apply sorting
    switch (sortBy) {
      case 'nearest':
        if (userLat && userLng) {
          services.sort((a: any, b: any) => (a.distance || 0) - (b.distance || 0));
        } else {
          // If no location provided, sort by newest as fallback
          services.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        }
        break;
      
      case 'rating':
        services.sort((a: any, b: any) => {
          // First sort by average rating (descending)
          if (b.avgRating !== a.avgRating) {
            return b.avgRating - a.avgRating;
          }
          // If ratings are equal, sort by review count (descending)
          return b.reviewCount - a.reviewCount;
        });
        break;
      
      case 'price_low':
        services.sort((a: any, b: any) => parseFloat(a.price) - parseFloat(b.price));
        break;
      
      case 'price_high':
        services.sort((a: any, b: any) => parseFloat(b.price) - parseFloat(a.price));
        break;
      
      case 'newest':
      default:
        services.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
    }

    // Apply pagination after sorting
    const paginatedServices = services.slice(offset, offset + limitNum);

    // Clean up provider data and format response
    paginatedServices.forEach((service: any) => {
      if (service.provider) {
        const { password: _, ...providerWithoutPassword } = service.provider;
        service.provider = providerWithoutPassword;
      }
      
      // Round rating to 1 decimal place
      if (service.avgRating) {
        service.avgRating = Math.round(service.avgRating * 10) / 10;
      }
      
      // Round distance to 2 decimal places if present
      if (service.distance !== undefined) {
        service.distance = Math.round(service.distance * 100) / 100;
      }
    });

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
        availableSorts: ['newest', 'nearest', 'rating', 'price_low', 'price_high']
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/services (ENHANCED with reverse geocoding)
router.post("/", authenticateToken, requireProvider, uploadLimiter, uploadServiceImages, async (req: AuthRequest, res: Response) => {
  try {
    const { title, description, category, price, priceType, availability, latitude, longitude } = req.body;

    if (!title || !description || !category || !price || !priceType || !availability || !latitude || !longitude) {
      return res.status(400).json({ error: "All fields including latitude and longitude are required" });
    }

    if (price <= 0) {
      return res.status(400).json({ error: "Price must be greater than 0" });
    }

    const availabilityArray = typeof availability === 'string' ? JSON.parse(availability) : availability;
    if (!Array.isArray(availabilityArray)) {
      return res.status(400).json({ error: "Availability must be an array" });
    }

    const validDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const invalidDays = availabilityArray.filter(day => !validDays.includes(day));
    if (invalidDays.length > 0) {
      return res.status(400).json({ error: "Invalid days in availability" });
    }

    // Parse coordinates
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    // Reverse geocode to get city and location
    console.log(`Reverse geocoding coordinates: ${lat}, ${lng}`);
    const locationData = await reverseGeocode(lat, lng);
    console.log('Geocoding result:', locationData);

    // Calculate H3 index
    const h3Index = calculateH3Index(lat, lng);

    // Process uploaded images from Cloudinary
    const images = req.files ? (req.files as Express.Multer.File[]).map(file => 
      (file as any).path // Cloudinary returns the URL in the path property
    ) : [];

    const service = serviceRepository.create({
      providerId: req.user!.id,
      title,
      description,
      category,
      price: parseFloat(price),
      priceType,
      availability: availabilityArray,
      location: locationData.location, // neighbourhood from reverse geocoding
      city: locationData.city, // city name from reverse geocoding
      latitude: lat,
      longitude: lng,
      h3Index,
      images,
      approvalStatus: ApprovalStatus.PENDING,
      isActive: true
    });

    await serviceRepository.save(service);

    // Invalidate caches
    await CacheManager.invalidateAllServices();
    await invalidateCache('services:*');

    const savedService = await serviceRepository.findOne({
      where: { id: service.id },
      relations: ["provider"]
    });

    if (savedService && savedService.provider) {
      const { password: _, ...providerWithoutPassword } = savedService.provider;
      savedService.provider = providerWithoutPassword as any;
    }

    res.status(201).json(savedService);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT /api/services/:id (ENHANCED)
router.put("/:id", authenticateToken, uploadLimiter, uploadServiceImages, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { title, description, category, price, priceType, availability, latitude, longitude } = req.body;

    const service = await serviceRepository.findOne({
      where: { id },
      relations: ["provider"]
    });

    if (!service) {
      return res.status(404).json({ error: "Service not found" });
    }

    if (service.providerId !== req.user!.id) {
      return res.status(403).json({ error: "Not authorized to update this service" });
    }

    // Update fields if provided
    if (title !== undefined) service.title = title;
    if (description !== undefined) service.description = description;
    if (category !== undefined) service.category = category;
    if (price !== undefined) service.price = parseFloat(price);
    if (priceType !== undefined) service.priceType = priceType;

    if (availability !== undefined) {
      const availabilityArray = typeof availability === 'string' ? JSON.parse(availability) : availability;
      service.availability = availabilityArray;
    }

    // Update coordinates and recalculate location if changed
    if (latitude !== undefined && longitude !== undefined) {
      const lat = parseFloat(latitude);
      const lng = parseFloat(longitude);
      
      // Reverse geocode new location
      const locationData = await reverseGeocode(lat, lng);
      
      service.latitude = lat;
      service.longitude = lng;
      service.location = locationData.location;
      service.city = locationData.city;
      service.h3Index = calculateH3Index(lat, lng);
    }

    // Add new images if uploaded
    if (req.files && (req.files as Express.Multer.File[]).length > 0) {
      const newImages = (req.files as Express.Multer.File[]).map(file => 
        (file as any).path // Cloudinary returns the URL in the path property
      );
      service.images = [...service.images, ...newImages];
    }

    // Reset approval status if content changed
    if (title !== undefined || description !== undefined || category !== undefined) {
      service.approvalStatus = ApprovalStatus.PENDING;
      service.approvedBy = null;
      service.approvedAt = null;
    }

    await serviceRepository.save(service);

    // Invalidate caches
    await CacheManager.invalidateService(parseInt(id));
    await CacheManager.invalidateAllServices();
    await invalidateCache('services:*');

    const updatedService = await serviceRepository.findOne({
      where: { id },
      relations: ["provider"]
    });

    if (updatedService && updatedService.provider) {
      const { password: _, ...providerWithoutPassword } = updatedService.provider;
      updatedService.provider = providerWithoutPassword as any;
    }

    res.json(updatedService);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE /api/services/:id/images (NEW)
router.delete("/:id/images", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { imageUrl } = req.body;

    if (!imageUrl) {
      return res.status(400).json({ error: "Image URL is required" });
    }

    const service = await serviceRepository.findOne({ where: { id } });
    if (!service) {
      return res.status(404).json({ error: "Service not found" });
    }

    if (service.providerId !== req.user!.id) {
      return res.status(403).json({ error: "Not authorized to modify this service" });
    }

    if (!service.images.includes(imageUrl)) {
      return res.status(400).json({ error: "Image not found in service" });
    }

    // Delete image from Cloudinary
    await deleteCloudinaryImage(imageUrl);

    // Remove from images array
    service.images = service.images.filter(img => img !== imageUrl);
    await serviceRepository.save(service);

    res.json({ 
      message: "Image deleted successfully",
      images: service.images
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/services/:id (with caching)
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const serviceId = parseInt(req.params.id);

    // Check cache first
    let service = await CacheManager.getCachedService(serviceId);

    if (!service) {
      service = await serviceRepository.findOne({
        where: { id: req.params.id },
        relations: ["provider"]
      });

      if (!service) {
        return res.status(404).json({ error: "Service not found" });
      }

      // Cache the service
      await CacheManager.cacheService(serviceId, service);
    }

    // Increment view count (async, don't wait)
    serviceRepository.increment({ id: req.params.id }, 'views', 1).catch(err => 
      console.error('Error incrementing views:', err)
    );

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

// PATCH /api/services/:id/toggle-active
router.patch("/:id/toggle-active", authenticateToken, generalLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const service = await serviceRepository.findOne({ where: { id } });
    if (!service) {
      return res.status(404).json({ error: "Service not found" });
    }

    if (service.providerId !== req.user!.id) {
      return res.status(403).json({ error: "Not authorized to modify this service" });
    }

    // Toggle the isActive status
    service.isActive = !service.isActive;
    await serviceRepository.save(service);

    res.json({ 
      message: `Service ${service.isActive ? 'activated' : 'deactivated'} successfully`,
      isActive: service.isActive,
      service: {
        id: service.id,
        title: service.title,
        isActive: service.isActive
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// PATCH /api/services/:id/activate
router.patch("/:id/activate", authenticateToken, generalLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const service = await serviceRepository.findOne({ where: { id } });
    if (!service) {
      return res.status(404).json({ error: "Service not found" });
    }

    if (service.providerId !== req.user!.id) {
      return res.status(403).json({ error: "Not authorized to modify this service" });
    }

    if (service.isActive) {
      return res.status(400).json({ error: "Service is already active" });
    }

    service.isActive = true;
    await serviceRepository.save(service);

    res.json({ 
      message: "Service activated successfully",
      isActive: service.isActive,
      service: {
        id: service.id,
        title: service.title,
        isActive: service.isActive
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// PATCH /api/services/:id/deactivate
router.patch("/:id/deactivate", authenticateToken, generalLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const service = await serviceRepository.findOne({ where: { id } });
    if (!service) {
      return res.status(404).json({ error: "Service not found" });
    }

    if (service.providerId !== req.user!.id) {
      return res.status(403).json({ error: "Not authorized to modify this service" });
    }

    if (!service.isActive) {
      return res.status(400).json({ error: "Service is already inactive" });
    }

    service.isActive = false;
    await serviceRepository.save(service);

    res.json({ 
      message: "Service deactivated successfully",
      isActive: service.isActive,
      service: {
        id: service.id,
        title: service.title,
        isActive: service.isActive
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE /api/services/:id
router.delete("/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const service = await serviceRepository.findOne({ where: { id } });
    if (!service) {
      return res.status(404).json({ error: "Service not found" });
    }

    if (service.providerId !== req.user!.id) {
      return res.status(403).json({ error: "Not authorized to delete this service" });
    }

    // Delete associated images from Cloudinary
    for (const imageUrl of service.images) {
      await deleteCloudinaryImage(imageUrl);
    }

    await serviceRepository.remove(service);

    res.json({ message: "Service deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;

// GET /api/services/statistics
router.get("/statistics", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    // Get service statistics
    const serviceStats = await serviceRepository
      .createQueryBuilder("service")
      .select([
        "COUNT(*)::int as totalServices",
        "SUM(CASE WHEN service.isActive = true THEN 1 ELSE 0 END)::int as activeServices",
        "SUM(CASE WHEN service.approvalStatus = 'pending' THEN 1 ELSE 0 END)::int as pendingApproval",
        "SUM(CASE WHEN service.approvalStatus = 'approved' THEN 1 ELSE 0 END)::int as approvedServices",
        "SUM(CASE WHEN service.approvalStatus = 'rejected' THEN 1 ELSE 0 END)::int as rejectedServices",
        "COALESCE(AVG(service.price), 0)::decimal as avgPrice"
      ])
      .where("service.providerId = :userId", { userId })
      .getRawOne();

    // Get booking statistics for user's services
    const bookingStats = await bookingRepository
      .createQueryBuilder("booking")
      .leftJoin("booking.service", "service")
      .select([
        "COUNT(*)::int as totalBookings",
        "SUM(CASE WHEN booking.status = 'pending' THEN 1 ELSE 0 END)::int as pendingBookings",
        "SUM(CASE WHEN booking.status = 'accepted' THEN 1 ELSE 0 END)::int as acceptedBookings",
        "SUM(CASE WHEN booking.status = 'completed' THEN 1 ELSE 0 END)::int as completedBookings",
        "SUM(CASE WHEN booking.status = 'cancelled' THEN 1 ELSE 0 END)::int as cancelledBookings",
        "COALESCE(SUM(CASE WHEN booking.status = 'completed' THEN booking.totalPrice ELSE 0 END), 0)::decimal as totalEarnings"
      ])
      .where("service.providerId = :userId", { userId })
      .getRawOne();

    // Get service performance (services with most bookings)
    const servicePerformance = await bookingRepository
      .createQueryBuilder("booking")
      .leftJoinAndSelect("booking.service", "service")
      .select([
        "service.id",
        "service.title",
        "service.category",
        "COUNT(booking.id)::int as bookingCount",
        "COALESCE(SUM(CASE WHEN booking.status = 'completed' THEN booking.totalPrice ELSE 0 END), 0)::decimal as earnings",
        "COALESCE(AVG(booking.totalPrice), 0)::decimal as avgBookingValue"
      ])
      .where("service.providerId = :userId", { userId })
      .groupBy("service.id, service.title, service.category")
      .orderBy("bookingCount", "DESC")
      .limit(10)
      .getRawMany();

    // Get category breakdown
    const categoryStats = await serviceRepository
      .createQueryBuilder("service")
      .select([
        "service.category",
        "COUNT(*)::int as serviceCount",
        "COALESCE(AVG(service.price), 0)::decimal as avgPrice"
      ])
      .where("service.providerId = :userId", { userId })
      .groupBy("service.category")
      .orderBy("serviceCount", "DESC")
      .getRawMany();

    res.json({
      services: {
        total: serviceStats.totalServices || 0,
        active: serviceStats.activeServices || 0,
        pendingApproval: serviceStats.pendingApproval || 0,
        approved: serviceStats.approvedServices || 0,
        rejected: serviceStats.rejectedServices || 0,
        avgPrice: parseFloat(serviceStats.avgPrice || 0)
      },
      bookings: {
        total: bookingStats.totalBookings || 0,
        pending: bookingStats.pendingBookings || 0,
        accepted: bookingStats.acceptedBookings || 0,
        completed: bookingStats.completedBookings || 0,
        cancelled: bookingStats.cancelledBookings || 0,
        totalEarnings: parseFloat(bookingStats.totalEarnings || 0)
      },
      servicePerformance: servicePerformance.map(service => ({
        id: service.service_id,
        title: service.service_title,
        category: service.service_category,
        bookingCount: service.bookingCount || 0,
        earnings: parseFloat(service.earnings || 0),
        avgBookingValue: parseFloat(service.avgBookingValue || 0)
      })),
      categoryBreakdown: categoryStats.map(cat => ({
        category: cat.service_category,
        serviceCount: cat.serviceCount || 0,
        avgPrice: parseFloat(cat.avgPrice || 0)
      }))
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/services/dashboard-stats
router.get("/dashboard-stats", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    // Get basic service counts
    const activeServices = await serviceRepository.count({
      where: { providerId: userId, isActive: true, approvalStatus: ApprovalStatus.APPROVED }
    });

    // Get pending requests (bookings)
    const pendingRequests = await bookingRepository.count({
      where: { providerId: userId, status: BookingStatus.PENDING }
    });

    // Get total earnings (completed bookings)
    const earningsResult = await bookingRepository
      .createQueryBuilder("booking")
      .select("COALESCE(SUM(booking.totalPrice), 0)::decimal as totalEarnings")
      .where("booking.providerId = :userId", { userId })
      .andWhere("booking.status = :status", { status: BookingStatus.COMPLETED })
      .getRawOne();

    // Get completion rate
    const completionStats = await bookingRepository
      .createQueryBuilder("booking")
      .select([
        "COUNT(*)::int as totalBookings",
        "SUM(CASE WHEN booking.status = 'completed' THEN 1 ELSE 0 END)::int as completedBookings"
      ])
      .where("booking.providerId = :userId", { userId })
      .andWhere("booking.status != :cancelled", { cancelled: BookingStatus.CANCELLED })
      .getRawOne();

    const totalNonCancelled = completionStats.totalBookings || 0;
    const completionRate = totalNonCancelled > 0 
      ? (((completionStats.completedBookings || 0) / totalNonCancelled) * 100).toFixed(1)
      : "0";

    // Get average rating (placeholder - you might want to add a rating system)
    const avgRating = "4.8"; // Placeholder

    res.json({
      activeServices,
      pendingRequests,
      completionRate: parseFloat(completionRate),
      avgRating: parseFloat(avgRating),
      totalEarnings: parseFloat(earningsResult.totalEarnings || 0)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});
