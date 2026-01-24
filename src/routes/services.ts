import { Router, Request, Response } from "express";
import { AppDataSource } from "../data-source";
import { Service, ApprovalStatus } from "../entities/Service";
import { authenticateToken, AuthRequest, requireProvider } from "../middleware/auth";
import { uploadServiceImages, deleteCloudinaryImage } from "../middleware/cloudinaryUpload";
import { generalLimiter, uploadLimiter } from "../middleware/rateLimiter";
import { calculateH3Index, getH3CellsInRadius, calculateDistance } from "../utils/spatial";
import { reverseGeocode } from "../utils/geocoding";
import { Like, In } from "typeorm";

const router = Router();
const serviceRepository = AppDataSource.getRepository(Service);

// GET /api/services/my-services (Get services for logged-in provider)
router.get("/my-services", authenticateToken, generalLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = Math.min(parseInt(limit as string), 100);
    const offset = (pageNum - 1) * limitNum;

    let where: any = { 
      providerId: req.user!.id,
      isActive: true
    };

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

// GET /api/services (ENHANCED with geospatial search)
router.get("/", generalLimiter, async (req: Request, res: Response) => {
  try {
    const { 
      lat, lng, radius, city, category, search, 
      minPrice, maxPrice, priceType, page = 1, limit = 20 
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

    // Geospatial search with H3
    if (lat && lng && radius) {
      const latitude = parseFloat(lat as string);
      const longitude = parseFloat(lng as string);
      const radiusKm = parseFloat(radius as string);

      // Get H3 cells within radius
      const h3Cells = getH3CellsInRadius(latitude, longitude, radiusKm);
      
      where.h3Index = In(h3Cells);

      services = await serviceRepository.find({
        where,
        relations: ["provider"],
        order: { createdAt: "DESC" }
      });

      // Filter by exact distance and calculate distance for each service
      services = services
        .map((service: any) => {
          const distance = calculateDistance(latitude, longitude, service.latitude, service.longitude);
          return { ...service, distance };
        })
        .filter((service: any) => service.distance <= radiusKm)
        .sort((a: any, b: any) => a.distance - b.distance);

      total = services.length;

      // Apply pagination after distance filtering
      services = services.slice(offset, offset + limitNum);
    } else {
      // Regular search without geospatial
      [services, total] = await serviceRepository.findAndCount({
        where,
        relations: ["provider"],
        order: { createdAt: "DESC" },
        skip: offset,
        take: limitNum
      });
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

// GET /api/services/:id
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const service = await serviceRepository.findOne({
      where: { id: req.params.id },
      relations: ["provider"]
    });

    if (!service) {
      return res.status(404).json({ error: "Service not found" });
    }

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
