import { Router, Response } from "express";
import { AppDataSource } from "../data-source";
import { User, UserRole } from "../entities/User";
import { Service, ApprovalStatus } from "../entities/Service";
import { Booking, BookingStatus } from "../entities/Booking";
import { Rating } from "../entities/Rating";
import { authenticateToken, AuthRequest } from "../middleware/auth";
import { generalLimiter } from "../middleware/rateLimiter";

const router = Router();
const userRepository = AppDataSource.getRepository(User);
const serviceRepository = AppDataSource.getRepository(Service);
const bookingRepository = AppDataSource.getRepository(Booking);
const ratingRepository = AppDataSource.getRepository(Rating);

// GET /api/dashboard/seeker - Dashboard data for seekers
router.get("/seeker", authenticateToken, generalLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    // Get seeker booking statistics (bookings where user is the seeker/customer)
    const bookingStats = await bookingRepository
      .createQueryBuilder("booking")
      .select([
        "COUNT(*)::int as totalBookings",
        "SUM(CASE WHEN booking.status = 'accepted' OR booking.status = 'completed' THEN 1 ELSE 0 END)::int as activeBookings",
        "SUM(CASE WHEN booking.status = 'pending' THEN 1 ELSE 0 END)::int as pendingRequests",
        "SUM(CASE WHEN booking.status = 'completed' THEN 1 ELSE 0 END)::int as completedBookings"
      ])
      .where("booking.seekerId = :userId", { userId })
      .getRawOne();

    // Get reviews given by this seeker
    const reviewsGiven = await ratingRepository.count({
      where: { seekerId: userId }
    });

    // Get upcoming appointments (accepted bookings with future dates where user is seeker)
    const today = new Date().toISOString().split('T')[0];
    const upcomingAppointments = await bookingRepository.find({
      where: {
        seekerId: userId,
        status: BookingStatus.ACCEPTED,
      },
      relations: ["service", "provider"],
      order: { requestedDate: "ASC", requestedTime: "ASC" },
      take: 5
    });

    // Filter for future appointments
    const futureAppointments = upcomingAppointments.filter(booking => 
      booking.requestedDate >= today
    );

    // Get pending requests with service details (bookings initiated by this seeker)
    const pendingRequests = await bookingRepository.find({
      where: {
        seekerId: userId,
        status: BookingStatus.PENDING
      },
      relations: ["service", "provider"],
      order: { createdAt: "DESC" },
      take: 5
    });

    // Clean up provider data (remove passwords)
    const cleanUpcomingAppointments = futureAppointments.map(booking => ({
      ...booking,
      provider: booking.provider ? {
        id: booking.provider.id,
        name: booking.provider.name,
        email: booking.provider.email,
        avatar: booking.provider.avatar,
        phone: booking.provider.phone
      } : null
    }));

    const cleanPendingRequests = pendingRequests.map(booking => ({
      ...booking,
      provider: booking.provider ? {
        id: booking.provider.id,
        name: booking.provider.name,
        email: booking.provider.email,
        avatar: booking.provider.avatar,
        phone: booking.provider.phone
      } : null
    }));

    res.json({
      stats: {
        totalBookings: bookingStats.totalBookings || 0,
        activeBookings: bookingStats.activeBookings || 0,
        pendingRequests: bookingStats.pendingRequests || 0,
        reviewsGiven: reviewsGiven || 0
      },
      upcomingAppointments: cleanUpcomingAppointments,
      pendingRequests: cleanPendingRequests
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/dashboard/provider - Dashboard data for providers
router.get("/provider", authenticateToken, generalLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    // Get active services first
    const activeServices = await serviceRepository.find({
      where: {
        providerId: userId,
        isActive: true,
        approvalStatus: ApprovalStatus.APPROVED
      },
      order: { createdAt: "DESC" },
      take: 5
    });

    // Get provider booking statistics
    const bookingStats = await bookingRepository
      .createQueryBuilder("booking")
      .select([
        "COUNT(*)::int as totalBookings",
        "SUM(CASE WHEN booking.status = 'pending' THEN 1 ELSE 0 END)::int as pendingRequests",
        "SUM(CASE WHEN booking.status = 'completed' THEN 1 ELSE 0 END)::int as completedBookings",
        "SUM(CASE WHEN booking.status = 'accepted' OR booking.status = 'completed' THEN 1 ELSE 0 END)::int as totalAccepted"
      ])
      .where("booking.providerId = :userId", { userId })
      .getRawOne();

    // Calculate completion rate
    const totalAccepted = bookingStats.totalAccepted || 0;
    const completionRate = totalAccepted > 0 
      ? Math.round(((bookingStats.completedBookings || 0) / totalAccepted) * 100)
      : 100;

    // Get average rating for this provider
    const ratingStats = await ratingRepository
      .createQueryBuilder("rating")
      .select("AVG(rating.score)::decimal as avgRating")
      .where("rating.providerId = :userId", { userId })
      .getRawOne();

    const avgRating = ratingStats.avgRating ? parseFloat(ratingStats.avgRating) : 0;

    // Get incoming requests (pending bookings)
    const incomingRequests = await bookingRepository.find({
      where: {
        providerId: userId,
        status: BookingStatus.PENDING
      },
      relations: ["service", "seeker"],
      order: { createdAt: "DESC" },
      take: 5
    });

    // Clean up seeker data
    const cleanIncomingRequests = incomingRequests.map(booking => ({
      ...booking,
      seeker: booking.seeker ? {
        id: booking.seeker.id,
        name: booking.seeker.name,
        email: booking.seeker.email,
        avatar: booking.seeker.avatar,
        phone: booking.seeker.phone
      } : null
    }));

    res.json({
      stats: {
        activeServices: activeServices.length, // Use actual count of active services
        pendingRequests: bookingStats.pendingRequests || 0,
        completionRate,
        avgRating: Math.round(avgRating * 10) / 10
      },
      activeServices,
      incomingRequests: cleanIncomingRequests
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/dashboard/both - Dashboard data for users with both roles
router.get("/both", authenticateToken, generalLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    // Get services offered (as provider)
    const myServices = await serviceRepository.find({
      where: {
        providerId: userId,
        isActive: true,
        approvalStatus: ApprovalStatus.APPROVED
      },
      order: { createdAt: "DESC" },
      take: 3
    });

    // Get seeker statistics (bookings made as seeker)
    const seekerStats = await bookingRepository
      .createQueryBuilder("booking")
      .select("COUNT(*)::int as servicesBooked")
      .where("booking.seekerId = :userId", { userId })
      .getRawOne();

    // Get provider booking statistics (bookings received as provider)
    const providerBookingStats = await bookingRepository
      .createQueryBuilder("booking")
      .select([
        "SUM(CASE WHEN booking.status = 'pending' THEN 1 ELSE 0 END)::int as pendingAsProvider",
        "SUM(CASE WHEN booking.status = 'completed' THEN 1 ELSE 0 END)::int as completedAsProvider",
        "SUM(CASE WHEN booking.status = 'accepted' OR booking.status = 'completed' THEN 1 ELSE 0 END)::int as totalAcceptedAsProvider"
      ])
      .where("booking.providerId = :userId", { userId })
      .getRawOne();

    // Calculate completion rate as provider
    const totalAcceptedAsProvider = providerBookingStats.totalAcceptedAsProvider || 0;
    const completionRate = totalAcceptedAsProvider > 0 
      ? Math.round(((providerBookingStats.completedAsProvider || 0) / totalAcceptedAsProvider) * 100)
      : 100;

    // Calculate total activities
    const servicesOffered = myServices.length; // Use actual count
    const servicesBooked = seekerStats.servicesBooked || 0;
    const totalActivities = servicesOffered + servicesBooked;

    // Get incoming requests as provider
    const incomingRequests = await bookingRepository.find({
      where: {
        providerId: userId,
        status: BookingStatus.PENDING
      },
      relations: ["service", "seeker"],
      order: { createdAt: "DESC" },
      take: 5
    });

    // Clean up seeker data
    const cleanIncomingRequests = incomingRequests.map(booking => ({
      ...booking,
      seeker: booking.seeker ? {
        id: booking.seeker.id,
        name: booking.seeker.name,
        email: booking.seeker.email,
        avatar: booking.seeker.avatar,
        phone: booking.seeker.phone
      } : null
    }));

    res.json({
      stats: {
        servicesOffered,
        servicesBooked,
        completionRate,
        totalActivities
      },
      myServices,
      incomingRequests: cleanIncomingRequests
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/dashboard/stats - General dashboard stats (works for any role)
router.get("/stats", authenticateToken, generalLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const userRole = req.user!.role;

    let stats: any = {};

    // Common stats for all roles
    if (userRole === UserRole.SEEKER || userRole === UserRole.BOTH) {
      // Seeker stats
      const seekerBookingStats = await bookingRepository
        .createQueryBuilder("booking")
        .select([
          "COUNT(*)::int as totalBookings",
          "SUM(CASE WHEN booking.status = 'accepted' OR booking.status = 'completed' THEN 1 ELSE 0 END)::int as activeBookings",
          "SUM(CASE WHEN booking.status = 'pending' THEN 1 ELSE 0 END)::int as pendingRequests"
        ])
        .where("booking.seekerId = :userId", { userId })
        .getRawOne();

      const reviewsGiven = await ratingRepository.count({
        where: { seekerId: userId }
      });

      stats.asSeeker = {
        totalBookings: seekerBookingStats.totalBookings || 0,
        activeBookings: seekerBookingStats.activeBookings || 0,
        pendingRequests: seekerBookingStats.pendingRequests || 0,
        reviewsGiven: reviewsGiven || 0
      };
    }

    if (userRole === UserRole.PROVIDER || userRole === UserRole.BOTH) {
      // Provider stats
      const providerServiceStats = await serviceRepository
        .createQueryBuilder("service")
        .select("COUNT(*)::int as activeServices")
        .where("service.providerId = :userId AND service.isActive = true AND service.approvalStatus = 'approved'", { userId })
        .getRawOne();

      const providerBookingStats = await bookingRepository
        .createQueryBuilder("booking")
        .select([
          "SUM(CASE WHEN booking.status = 'pending' THEN 1 ELSE 0 END)::int as pendingRequests",
          "SUM(CASE WHEN booking.status = 'completed' THEN 1 ELSE 0 END)::int as completedBookings",
          "SUM(CASE WHEN booking.status = 'accepted' OR booking.status = 'completed' THEN 1 ELSE 0 END)::int as totalAccepted"
        ])
        .where("booking.providerId = :userId", { userId })
        .getRawOne();

      const ratingStats = await ratingRepository
        .createQueryBuilder("rating")
        .select("AVG(rating.score)::decimal as avgRating")
        .where("rating.providerId = :userId", { userId })
        .getRawOne();

      const totalAccepted = providerBookingStats.totalAccepted || 0;
      const completionRate = totalAccepted > 0 
        ? Math.round(((providerBookingStats.completedBookings || 0) / totalAccepted) * 100)
        : 100;

      const avgRating = ratingStats.avgRating ? parseFloat(ratingStats.avgRating) : 0;

      stats.asProvider = {
        activeServices: providerServiceStats.activeServices || 0,
        pendingRequests: providerBookingStats.pendingRequests || 0,
        completionRate,
        avgRating: Math.round(avgRating * 10) / 10
      };
    }

    res.json({
      userRole,
      stats
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/dashboard/debug - Debug endpoint to check user's bookings
router.get("/debug", authenticateToken, generalLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const userRole = req.user!.role;

    // Get all bookings where user is seeker
    const bookingsAsSeeker = await bookingRepository.find({
      where: { seekerId: userId },
      relations: ["service", "provider"],
      order: { createdAt: "DESC" }
    });

    // Get all bookings where user is provider
    const bookingsAsProvider = await bookingRepository.find({
      where: { providerId: userId },
      relations: ["service", "seeker"],
      order: { createdAt: "DESC" }
    });

    // Get all ratings by this user
    const ratingsGiven = await ratingRepository.find({
      where: { seekerId: userId },
      relations: ["booking", "booking.service"]
    });

    // Get all ratings received by this user
    const ratingsReceived = await ratingRepository.find({
      where: { providerId: userId },
      relations: ["booking", "booking.service", "seeker"]
    });

    res.json({
      userId,
      userRole,
      bookingsAsSeeker: {
        count: bookingsAsSeeker.length,
        bookings: bookingsAsSeeker.map(b => ({
          id: b.id,
          status: b.status,
          requestedDate: b.requestedDate,
          service: b.service?.title,
          provider: b.provider?.name
        }))
      },
      bookingsAsProvider: {
        count: bookingsAsProvider.length,
        bookings: bookingsAsProvider.map(b => ({
          id: b.id,
          status: b.status,
          requestedDate: b.requestedDate,
          service: b.service?.title,
          seeker: b.seeker?.name
        }))
      },
      ratingsGiven: {
        count: ratingsGiven.length,
        ratings: ratingsGiven.map(r => ({
          id: r.id,
          score: r.score,
          service: r.booking?.service?.title
        }))
      },
      ratingsReceived: {
        count: ratingsReceived.length,
        ratings: ratingsReceived.map(r => ({
          id: r.id,
          score: r.score,
          service: r.booking?.service?.title,
          from: r.seeker?.name
        }))
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;