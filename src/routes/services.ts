import { Router, Request, Response } from "express";
import { AppDataSource } from "../data-source";
import { Service } from "../entities/Service";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { Like } from "typeorm";

const router = Router();
const serviceRepository = AppDataSource.getRepository(Service);

// POST /api/services
router.post("/", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { title, description, category, price, priceType, availability, location } = req.body;

    if (!title || !description || !category || !price || !priceType || !availability || !location) {
      return res.status(400).json({ error: "All fields are required" });
    }

    if (price <= 0) {
      return res.status(400).json({ error: "Price must be greater than 0" });
    }

    if (!Array.isArray(availability)) {
      return res.status(400).json({ error: "Availability must be an array" });
    }

    const validDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const invalidDays = availability.filter(day => !validDays.includes(day));
    if (invalidDays.length > 0) {
      return res.status(400).json({ error: "Invalid days in availability" });
    }

    const service = serviceRepository.create({
      providerId: req.user!.id,
      title,
      description,
      category,
      price,
      priceType,
      availability,
      location,
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

// GET /api/services
router.get("/", async (req: Request, res: Response) => {
  try {
    const { category, search, location } = req.query;

    const where: any = { isActive: true };

    if (category) {
      where.category = category;
    }

    if (location) {
      where.location = Like(`%${location}%`);
    }

    let services = await serviceRepository.find({
      where,
      relations: ["provider"],
      order: { createdAt: "DESC" }
    });

    if (search) {
      const searchLower = (search as string).toLowerCase();
      services = services.filter((service: any) =>
        service.title.toLowerCase().includes(searchLower) ||
        service.description.toLowerCase().includes(searchLower)
      );
    }

    services.forEach((service: any) => {
      if (service.provider) {
        const { password: _, ...providerWithoutPassword } = service.provider;
        service.provider = providerWithoutPassword as any;
      }
    });

    res.json({ services });
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

export default router;
