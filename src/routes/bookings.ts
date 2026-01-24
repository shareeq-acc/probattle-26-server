import { Router, Response } from "express";
import { AppDataSource } from "../data-source";
import { Booking, BookingStatus } from "../entities/Booking";
import { Service } from "../entities/Service";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { Between, MoreThanOrEqual } from "typeorm";

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

// GET /api/bookings/statistics
router.get("/statistics", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    // Provider statistics using individual queries
    const providerTotalBookings = await bookingRepository.count({
      where: { providerId: userId }
    });

    const providerPendingRequests = await bookingRepository.count({
      where: { providerId: userId, status: BookingStatus.PENDING }
    });

    const providerUpcomingBookings = await bookingRepository.count({
      where: { providerId: userId, status: BookingStatus.ACCEPTED }
    });

    const providerCompletedBookings = await bookingRepository.count({
      where: { providerId: userId, status: BookingStatus.COMPLETED }
    });

    const providerCancelledBookings = await bookingRepository.count({
      where: { providerId: userId, status: BookingStatus.CANCELLED }
    });

    // Get provider earnings from completed bookings
    const providerCompletedList = await bookingRepository.find({
      where: { providerId: userId, status: BookingStatus.COMPLETED },
      select: ['totalPrice']
    });

    const providerTotalEarnings = providerCompletedList.reduce((sum, booking) => sum + parseFloat(booking.totalPrice.toString()), 0);
    const providerAvgBookingValue = providerCompletedBookings > 0 ? providerTotalEarnings / providerCompletedBookings : 0;

    // Seeker statistics using individual queries
    const seekerTotalBookings = await bookingRepository.count({
      where: { seekerId: userId }
    });

    const seekerPendingBookings = await bookingRepository.count({
      where: { seekerId: userId, status: BookingStatus.PENDING }
    });

    const seekerUpcomingBookings = await bookingRepository.count({
      where: { seekerId: userId, status: BookingStatus.ACCEPTED }
    });

    const seekerCompletedBookings = await bookingRepository.count({
      where: { seekerId: userId, status: BookingStatus.COMPLETED }
    });

    const seekerCancelledBookings = await bookingRepository.count({
      where: { seekerId: userId, status: BookingStatus.CANCELLED }
    });

    // Get seeker spending from all bookings
    const seekerAllBookings = await bookingRepository.find({
      where: { seekerId: userId },
      select: ['totalPrice']
    });

    const seekerTotalSpent = seekerAllBookings.reduce((sum, booking) => sum + parseFloat(booking.totalPrice.toString()), 0);
    const seekerAvgBookingValue = seekerTotalBookings > 0 ? seekerTotalSpent / seekerTotalBookings : 0;

    // Get monthly booking trends for provider (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const providerMonthlyTrends = await bookingRepository
      .createQueryBuilder("booking")
      .select([
        "DATE_TRUNC('month', booking.createdAt) as month",
        "COUNT(*)::int as bookingCount",
        "COALESCE(SUM(CASE WHEN booking.status = 'completed' THEN booking.totalPrice ELSE 0 END), 0)::decimal as earnings"
      ])
      .where("booking.providerId = :userId", { userId })
      .andWhere("booking.createdAt >= :sixMonthsAgo", { sixMonthsAgo })
      .groupBy("DATE_TRUNC('month', booking.createdAt)")
      .orderBy("month", "ASC")
      .getRawMany();

    // Get recent bookings (last 5)
    const recentBookings = await bookingRepository.find({
      where: [
        { providerId: userId },
        { seekerId: userId }
      ],
      relations: ["service", "seeker", "provider"],
      order: { createdAt: "DESC" },
      take: 5
    });

    // Clean up password fields
    recentBookings.forEach((booking: any) => {
      if (booking.seeker) {
        const { password: _, ...seekerWithoutPassword } = booking.seeker;
        booking.seeker = seekerWithoutPassword;
      }
      if (booking.provider) {
        const { password: _, ...providerWithoutPassword } = booking.provider;
        booking.provider = providerWithoutPassword;
      }
    });

    // Calculate completion rate for provider
    const totalNonCancelled = providerTotalBookings - providerCancelledBookings;
    const providerCompletionRate = totalNonCancelled > 0 ? ((providerCompletedBookings / totalNonCancelled) * 100) : 0;

    res.json({
      provider: {
        totalBookings: providerTotalBookings,
        pendingRequests: providerPendingRequests,
        upcomingBookings: providerUpcomingBookings,
        completedBookings: providerCompletedBookings,
        cancelledBookings: providerCancelledBookings,
        totalEarnings: Math.round(providerTotalEarnings * 100) / 100,
        avgBookingValue: Math.round(providerAvgBookingValue * 100) / 100,
        completionRate: Math.round(providerCompletionRate * 10) / 10,
        monthlyTrends: providerMonthlyTrends.map(trend => ({
          month: trend.month,
          bookingCount: trend.bookingCount || 0,
          earnings: parseFloat(trend.earnings || 0)
        }))
      },
      seeker: {
        totalBookings: seekerTotalBookings,
        pendingBookings: seekerPendingBookings,
        upcomingBookings: seekerUpcomingBookings,
        completedBookings: seekerCompletedBookings,
        cancelledBookings: seekerCancelledBookings,
        totalSpent: Math.round(seekerTotalSpent * 100) / 100,
        avgBookingValue: Math.round(seekerAvgBookingValue * 100) / 100
      },
      recentBookings
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/bookings/provider-statistics
router.get("/provider-statistics", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    // First check if user has any bookings at all
    const hasBookings = await bookingRepository.count({
      where: { providerId: userId }
    });

    if (hasBookings === 0) {
      // No bookings found, return zeros
      const activeServicesCount = await serviceRepository.count({
        where: { providerId: userId, isActive: true }
      });

      return res.json({
        totalBookings: 0,
        pendingRequests: 0,
        upcomingBookings: 0,
        completedBookings: 0,
        cancelledBookings: 0,
        totalEarnings: 0,
        thisMonthEarnings: 0,
        avgBookingValue: 0,
        totalHoursWorked: 0,
        activeServices: activeServicesCount,
        completionRate: 0,
        topServices: []
      });
    }

    // Get detailed provider statistics using individual queries for accuracy
    const totalBookings = await bookingRepository.count({
      where: { providerId: userId }
    });

    const pendingRequests = await bookingRepository.count({
      where: { providerId: userId, status: BookingStatus.PENDING }
    });

    const upcomingBookings = await bookingRepository.count({
      where: { providerId: userId, status: BookingStatus.ACCEPTED }
    });

    const completedBookings = await bookingRepository.count({
      where: { providerId: userId, status: BookingStatus.COMPLETED }
    });

    const cancelledBookings = await bookingRepository.count({
      where: { providerId: userId, status: BookingStatus.CANCELLED }
    });

    // Get earnings from completed bookings
    const completedBookingsList = await bookingRepository.find({
      where: { providerId: userId, status: BookingStatus.COMPLETED },
      select: ['totalPrice', 'duration']
    });

    const totalEarnings = completedBookingsList.reduce((sum, booking) => sum + parseFloat(booking.totalPrice.toString()), 0);
    const totalHoursWorked = completedBookingsList.reduce((sum, booking) => sum + parseFloat(booking.duration.toString()), 0);
    const avgBookingValue = completedBookings > 0 ? totalEarnings / completedBookings : 0;

    // Get this month's earnings
    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);

    const thisMonthBookings = await bookingRepository.find({
      where: { 
        providerId: userId, 
        status: BookingStatus.COMPLETED,
        createdAt: Between(thisMonth, new Date())
      },
      select: ['totalPrice']
    });

    const thisMonthEarnings = thisMonthBookings.reduce((sum, booking) => sum + parseFloat(booking.totalPrice.toString()), 0);

    // Get active services count
    const activeServicesCount = await serviceRepository.count({
      where: { providerId: userId, isActive: true }
    });

    // Calculate completion rate
    const totalNonCancelled = totalBookings - cancelledBookings;
    const completionRate = totalNonCancelled > 0 ? ((completedBookings / totalNonCancelled) * 100) : 0;

    // Get top performing services
    const topServices = await bookingRepository
      .createQueryBuilder("booking")
      .leftJoinAndSelect("booking.service", "service")
      .select([
        "service.id",
        "service.title",
        "COUNT(booking.id)::int as bookingCount",
        "COALESCE(SUM(CASE WHEN booking.status = 'completed' THEN booking.totalPrice ELSE 0 END), 0)::decimal as earnings"
      ])
      .where("booking.providerId = :userId", { userId })
      .groupBy("service.id, service.title")
      .orderBy("earnings", "DESC")
      .limit(5)
      .getRawMany();

    res.json({
      totalBookings,
      pendingRequests,
      upcomingBookings,
      completedBookings,
      cancelledBookings,
      totalEarnings: Math.round(totalEarnings * 100) / 100, // Round to 2 decimal places
      thisMonthEarnings: Math.round(thisMonthEarnings * 100) / 100,
      avgBookingValue: Math.round(avgBookingValue * 100) / 100,
      totalHoursWorked: Math.round(totalHoursWorked * 100) / 100,
      activeServices: activeServicesCount,
      completionRate: Math.round(completionRate * 10) / 10, // Round to 1 decimal place
      topServices: topServices.map(service => ({
        id: service.service_id,
        title: service.service_title,
        bookingCount: service.bookingCount || 0,
        earnings: parseFloat(service.earnings || 0)
      }))
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/bookings/seeker-statistics
router.get("/seeker-statistics", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    // Seeker statistics using individual queries
    const totalBookings = await bookingRepository.count({
      where: { seekerId: userId }
    });

    const pendingBookings = await bookingRepository.count({
      where: { seekerId: userId, status: BookingStatus.PENDING }
    });

    const upcomingBookings = await bookingRepository.count({
      where: { seekerId: userId, status: BookingStatus.ACCEPTED }
    });

    const completedBookings = await bookingRepository.count({
      where: { seekerId: userId, status: BookingStatus.COMPLETED }
    });

    const cancelledBookings = await bookingRepository.count({
      where: { seekerId: userId, status: BookingStatus.CANCELLED }
    });

    // Get all bookings for spending calculations
    const allBookings = await bookingRepository.find({
      where: { seekerId: userId },
      select: ['totalPrice', 'duration']
    });

    const totalSpent = allBookings.reduce((sum, booking) => sum + parseFloat(booking.totalPrice.toString()), 0);
    const totalHoursBooked = allBookings.reduce((sum, booking) => sum + parseFloat(booking.duration.toString()), 0);
    const avgBookingValue = totalBookings > 0 ? totalSpent / totalBookings : 0;

    // Get this month's spending
    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);

    const thisMonthBookings = await bookingRepository.find({
      where: { 
        seekerId: userId,
        createdAt: MoreThanOrEqual(thisMonth)
      },
      select: ['totalPrice']
    });

    const thisMonthSpending = thisMonthBookings.reduce((sum, booking) => sum + parseFloat(booking.totalPrice.toString()), 0);

    // Get favorite categories (most booked service categories) - using individual queries
    const categoriesWithBookings = await bookingRepository
      .createQueryBuilder("booking")
      .leftJoin("booking.service", "service")
      .select("service.category")
      .where("booking.seekerId = :userId", { userId })
      .groupBy("service.category")
      .getRawMany();

    const favoriteCategories = [];
    for (const cat of categoriesWithBookings) {
      const bookingCount = await bookingRepository
        .createQueryBuilder("booking")
        .leftJoin("booking.service", "service")
        .where("booking.seekerId = :userId", { userId })
        .andWhere("service.category = :category", { category: cat.service_category })
        .getCount();
      
      favoriteCategories.push({
        category: cat.service_category,
        bookingCount
      });
    }

    // Sort by booking count
    favoriteCategories.sort((a, b) => b.bookingCount - a.bookingCount);

    // Get favorite providers (most used providers) - using individual queries
    const providersWithBookings = await bookingRepository
      .createQueryBuilder("booking")
      .leftJoin("booking.provider", "provider")
      .select(["provider.id", "provider.name"])
      .where("booking.seekerId = :userId", { userId })
      .groupBy("provider.id, provider.name")
      .getRawMany();

    const favoriteProviders = [];
    for (const prov of providersWithBookings) {
      const bookingCount = await bookingRepository.count({
        where: { seekerId: userId, providerId: prov.provider_id }
      });

      const providerBookings = await bookingRepository.find({
        where: { seekerId: userId, providerId: prov.provider_id },
        select: ['totalPrice']
      });

      const totalSpentOnProvider = providerBookings.reduce((sum, booking) => sum + parseFloat(booking.totalPrice.toString()), 0);

      favoriteProviders.push({
        id: prov.provider_id,
        name: prov.provider_name,
        bookingCount,
        totalSpent: totalSpentOnProvider
      });
    }

    // Sort by booking count
    favoriteProviders.sort((a, b) => b.bookingCount - a.bookingCount);

    res.json({
      totalBookings,
      pendingBookings,
      upcomingBookings,
      completedBookings,
      cancelledBookings,
      totalSpent: Math.round(totalSpent * 100) / 100,
      thisMonthSpending: Math.round(thisMonthSpending * 100) / 100,
      avgBookingValue: Math.round(avgBookingValue * 100) / 100,
      totalHoursBooked: Math.round(totalHoursBooked * 100) / 100,
      favoriteCategories: favoriteCategories.slice(0, 5), // Top 5
      favoriteProviders: favoriteProviders.slice(0, 5) // Top 5
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

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
