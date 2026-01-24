import { Router, Response } from "express";
import { AppDataSource } from "../data-source";
import { Booking, BookingStatus } from "../entities/Booking";
import { Service } from "../entities/Service";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { LessThan, MoreThan, Between } from "typeorm";

const router = Router();
const bookingRepository = AppDataSource.getRepository(Booking);
const serviceRepository = AppDataSource.getRepository(Service);

// POST /api/bookings
router.post("/", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { serviceId, requestedDate, requestedTime, duration } = req.body;

    if (!serviceId || !requestedDate || !requestedTime || !duration) {
      return res.status(400).json({ error: "All fields are required" });
    }

    if (duration <= 0) {
      return res.status(400).json({ error: "Duration must be positive" });
    }

    const requestedDateObj = new Date(requestedDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (requestedDateObj < today) {
      return res.status(400).json({ error: "Requested date cannot be in the past" });
    }

    const service = await serviceRepository.findOne({ where: { id: serviceId } });
    if (!service) {
      return res.status(404).json({ error: "Service not found" });
    }

    if (req.user!.id === service.providerId) {
      return res.status(400).json({ error: "Cannot book your own service" });
    }

    const totalPrice = service.price * duration;

    const existingBookings = await bookingRepository.find({
      where: {
        serviceId,
        requestedDate,
        status: Between(BookingStatus.PENDING, BookingStatus.ACCEPTED) as any
      }
    });

    const [reqHour, reqMin] = requestedTime.split(':').map(Number);
    const reqStartMinutes = reqHour * 60 + reqMin;
    const reqEndMinutes = reqStartMinutes + duration * 60;

    for (const booking of existingBookings as any[]) {
      const [bookHour, bookMin] = booking.requestedTime.split(':').map(Number);
      const bookStartMinutes = bookHour * 60 + bookMin;
      const bookEndMinutes = bookStartMinutes + booking.duration * 60;

      if (
        (reqStartMinutes >= bookStartMinutes && reqStartMinutes < bookEndMinutes) ||
        (reqEndMinutes > bookStartMinutes && reqEndMinutes <= bookEndMinutes) ||
        (reqStartMinutes <= bookStartMinutes && reqEndMinutes >= bookEndMinutes)
      ) {
        return res.status(409).json({ error: "Time slot conflict" });
      }
    }

    const booking = bookingRepository.create({
      serviceId,
      seekerId: req.user!.id,
      providerId: service.providerId,
      requestedDate,
      requestedTime,
      duration,
      totalPrice,
      status: BookingStatus.PENDING
    });

    await bookingRepository.save(booking);

    const savedBooking = await bookingRepository.findOne({
      where: { id: booking.id },
      relations: ["service", "service.provider", "seeker"]
    });

    if (savedBooking) {
      if (savedBooking.service?.provider) {
        const { password: _, ...providerWithoutPassword } = savedBooking.service.provider;
        savedBooking.service.provider = providerWithoutPassword as any;
      }
      if (savedBooking.seeker) {
        const { password: _, ...seekerWithoutPassword } = savedBooking.seeker;
        savedBooking.seeker = seekerWithoutPassword as any;
      }
    }

    res.status(201).json(savedBooking);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;

// GET /api/bookings/my-bookings
router.get("/my-bookings", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const bookings = await bookingRepository
      .createQueryBuilder("booking")
      .leftJoinAndSelect("booking.service", "service")
      .leftJoinAndSelect("service.provider", "serviceProvider")
      .leftJoinAndSelect("booking.seeker", "seeker")
      .leftJoinAndSelect("booking.provider", "provider")
      .where("booking.seekerId = :userId OR booking.providerId = :userId", { userId: req.user!.id })
      .orderBy("booking.requestedDate", "DESC")
      .addOrderBy("booking.requestedTime", "DESC")
      .getMany();

    bookings.forEach((booking: any) => {
      if (booking.service?.provider) {
        const { password: _, ...providerWithoutPassword } = booking.service.provider;
        booking.service.provider = providerWithoutPassword as any;
      }
      if (booking.seeker) {
        const { password: _, ...seekerWithoutPassword } = booking.seeker;
        booking.seeker = seekerWithoutPassword as any;
      }
      if (booking.provider) {
        const { password: _, ...providerWithoutPassword } = booking.provider;
        booking.provider = providerWithoutPassword as any;
      }
    });

    res.json({ bookings });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/bookings/:id
router.get("/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const booking = await bookingRepository.findOne({
      where: { id: req.params.id },
      relations: ["service", "service.provider", "seeker", "provider"]
    });

    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    if (booking.seekerId !== req.user!.id && booking.providerId !== req.user!.id) {
      return res.status(403).json({ error: "Not authorized to view this booking" });
    }

    if (booking.service?.provider) {
      const { password: _, ...providerWithoutPassword } = booking.service.provider;
      booking.service.provider = providerWithoutPassword as any;
    }
    if (booking.seeker) {
      const { password: _, ...seekerWithoutPassword } = booking.seeker;
      booking.seeker = seekerWithoutPassword as any;
    }
    if (booking.provider) {
      const { password: _, ...providerWithoutPassword } = booking.provider;
      booking.provider = providerWithoutPassword as any;
    }

    res.json(booking);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT /api/bookings/:id/accept
router.put("/:id/accept", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const booking = await bookingRepository.findOne({
      where: { id: req.params.id },
      relations: ["service", "seeker", "provider"]
    });

    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    if (booking.providerId !== req.user!.id) {
      return res.status(403).json({ error: "Only the provider can accept this booking" });
    }

    if (booking.status !== BookingStatus.PENDING) {
      return res.status(400).json({ error: "Only pending bookings can be accepted" });
    }

    booking.status = BookingStatus.ACCEPTED;
    await bookingRepository.save(booking);

    if (booking.service?.provider) {
      const { password: _, ...providerWithoutPassword } = booking.service.provider;
      booking.service.provider = providerWithoutPassword as any;
    }
    if (booking.seeker) {
      const { password: _, ...seekerWithoutPassword } = booking.seeker;
      booking.seeker = seekerWithoutPassword as any;
    }
    if (booking.provider) {
      const { password: _, ...providerWithoutPassword } = booking.provider;
      booking.provider = providerWithoutPassword as any;
    }

    res.json(booking);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT /api/bookings/:id/reject
router.put("/:id/reject", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const booking = await bookingRepository.findOne({
      where: { id: req.params.id },
      relations: ["service", "seeker", "provider"]
    });

    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    if (booking.providerId !== req.user!.id) {
      return res.status(403).json({ error: "Only the provider can reject this booking" });
    }

    if (booking.status !== BookingStatus.PENDING) {
      return res.status(400).json({ error: "Only pending bookings can be rejected" });
    }

    booking.status = BookingStatus.CANCELLED;
    await bookingRepository.save(booking);

    if (booking.service?.provider) {
      const { password: _, ...providerWithoutPassword } = booking.service.provider;
      booking.service.provider = providerWithoutPassword as any;
    }
    if (booking.seeker) {
      const { password: _, ...seekerWithoutPassword } = booking.seeker;
      booking.seeker = seekerWithoutPassword as any;
    }
    if (booking.provider) {
      const { password: _, ...providerWithoutPassword } = booking.provider;
      booking.provider = providerWithoutPassword as any;
    }

    res.json(booking);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT /api/bookings/:id/complete
router.put("/:id/complete", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const booking = await bookingRepository.findOne({
      where: { id: req.params.id },
      relations: ["service", "seeker", "provider"]
    });

    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    if (booking.providerId !== req.user!.id) {
      return res.status(403).json({ error: "Only the provider can complete this booking" });
    }

    if (booking.status !== BookingStatus.ACCEPTED) {
      return res.status(400).json({ error: "Only accepted bookings can be completed" });
    }

    booking.status = BookingStatus.COMPLETED;
    await bookingRepository.save(booking);

    if (booking.service?.provider) {
      const { password: _, ...providerWithoutPassword } = booking.service.provider;
      booking.service.provider = providerWithoutPassword as any;
    }
    if (booking.seeker) {
      const { password: _, ...seekerWithoutPassword } = booking.seeker;
      booking.seeker = seekerWithoutPassword as any;
    }
    if (booking.provider) {
      const { password: _, ...providerWithoutPassword } = booking.provider;
      booking.provider = providerWithoutPassword as any;
    }

    res.json(booking);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT /api/bookings/:id/cancel
router.put("/:id/cancel", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const booking = await bookingRepository.findOne({
      where: { id: req.params.id },
      relations: ["service", "seeker", "provider"]
    });

    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    if (booking.seekerId !== req.user!.id) {
      return res.status(403).json({ error: "Only the seeker can cancel this booking" });
    }

    if (booking.status !== BookingStatus.PENDING) {
      return res.status(400).json({ error: "Only pending bookings can be cancelled" });
    }

    booking.status = BookingStatus.CANCELLED;
    await bookingRepository.save(booking);

    if (booking.service?.provider) {
      const { password: _, ...providerWithoutPassword } = booking.service.provider;
      booking.service.provider = providerWithoutPassword as any;
    }
    if (booking.seeker) {
      const { password: _, ...seekerWithoutPassword } = booking.seeker;
      booking.seeker = seekerWithoutPassword as any;
    }
    if (booking.provider) {
      const { password: _, ...providerWithoutPassword } = booking.provider;
      booking.provider = providerWithoutPassword as any;
    }

    res.json(booking);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});
