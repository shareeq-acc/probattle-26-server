import { Router, Request, Response } from "express";
import { AppDataSource } from "../data-source";
import { City } from "../entities/City";
import { Service, ApprovalStatus } from "../entities/Service";
import { authenticateToken, requireAdmin } from "../middleware/auth";
import { generalLimiter } from "../middleware/rateLimiter";

const router = Router();
const cityRepository = AppDataSource.getRepository(City);
const serviceRepository = AppDataSource.getRepository(Service);

// GET /api/cities
router.get("/", generalLimiter, async (req: Request, res: Response) => {
  try {
    const cities = await cityRepository.find({
      where: { isActive: true },
      order: { name: 'ASC' }
    });

    res.json({ cities });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/cities/:id
router.get("/:id", generalLimiter, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const city = await cityRepository.findOne({
      where: { id, isActive: true }
    });

    if (!city) {
      return res.status(404).json({ error: "City not found" });
    }

    // Get service count for this city
    const serviceCount = await serviceRepository.count({
      where: { 
        cityId: id,
        isActive: true,
        approvalStatus: ApprovalStatus.APPROVED
      }
    });

    res.json({ ...city, serviceCount });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/cities (Admin only)
router.post("/", authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { name, state, country, latitude, longitude } = req.body;

    if (!name || !country || !latitude || !longitude) {
      return res.status(400).json({ 
        error: "Name, country, latitude, and longitude are required" 
      });
    }

    // Check if city already exists
    const existingCity = await cityRepository.findOne({ where: { name } });
    if (existingCity) {
      return res.status(400).json({ error: "City already exists" });
    }

    const city = cityRepository.create({
      name,
      state,
      country,
      latitude,
      longitude
    });

    await cityRepository.save(city);

    res.status(201).json(city);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT /api/cities/:id (Admin only)
router.put("/:id", authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, state, country, latitude, longitude, isActive } = req.body;

    const city = await cityRepository.findOne({ where: { id } });
    if (!city) {
      return res.status(404).json({ error: "City not found" });
    }

    // Update fields if provided
    if (name !== undefined) city.name = name;
    if (state !== undefined) city.state = state;
    if (country !== undefined) city.country = country;
    if (latitude !== undefined) city.latitude = latitude;
    if (longitude !== undefined) city.longitude = longitude;
    if (isActive !== undefined) city.isActive = isActive;

    await cityRepository.save(city);

    res.json(city);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;