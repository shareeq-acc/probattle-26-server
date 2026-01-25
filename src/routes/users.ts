import { Router, Response } from "express";
import { AppDataSource } from "../data-source";
import { User } from "../entities/User";
import { Booking, BookingStatus } from "../entities/Booking";
import { Service } from "../entities/Service";
import { Rating } from "../entities/Rating";
import { authenticateToken, AuthRequest } from "../middleware/auth";
import { uploadAvatar, deleteCloudinaryImage } from "../middleware/cloudinaryUpload";
import { generalLimiter, uploadLimiter } from "../middleware/rateLimiter";
import { Between, MoreThanOrEqual } from "typeorm";

const router = Router();
const userRepository = AppDataSource.getRepository(User);
const bookingRepository = AppDataSource.getRepository(Booking);
const serviceRepository = AppDataSource.getRepository(Service);
const ratingRepository = AppDataSource.getRepository(Rating);

// GET /api/users/me
router.get("/me", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const user = await userRepository.findOne({ 
      where: { id: req.user!.id }
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

// PUT /api/users/me
router.put("/me", authenticateToken, generalLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { name, phone, bio, latitude, longitude } = req.body;
    const userId = req.user!.id;

    const user = await userRepository.findOne({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Update fields if provided
    if (name !== undefined) user.name = name;
    if (phone !== undefined) user.phone = phone;
    if (bio !== undefined) user.bio = bio;
    if (latitude !== undefined) user.latitude = parseFloat(latitude);
    if (longitude !== undefined) user.longitude = parseFloat(longitude);

    await userRepository.save(user);

    // Fetch updated user
    const updatedUser = await userRepository.findOne({
      where: { id: userId }
    });

    const { password: _, ...userWithoutPassword } = updatedUser!;

    res.json(userWithoutPassword);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT /api/users/me/avatar
router.put("/me/avatar", authenticateToken, uploadLimiter, uploadAvatar, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Avatar file is required" });
    }

    const userId = req.user!.id;
    const user = await userRepository.findOne({ where: { id: userId } });
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Delete old avatar from Cloudinary if exists
    if (user.avatar) {
      await deleteCloudinaryImage(user.avatar);
    }

    // Get Cloudinary URL from uploaded file
    const avatarUrl = (req.file as any).path; // Cloudinary returns the URL in the path property
    
    // Update user avatar
    user.avatar = avatarUrl;
    await userRepository.save(user);

    res.json({ avatar: avatarUrl });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE /api/users/me/avatar
router.delete("/me/avatar", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const user = await userRepository.findOne({ where: { id: userId } });
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (!user.avatar) {
      return res.status(400).json({ error: "No avatar to delete" });
    }

    // Delete avatar from Cloudinary
    await deleteCloudinaryImage(user.avatar);

    // Update user
    user.avatar = null;
    await userRepository.save(user);

    res.json({ message: "Avatar deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/users/dashboard/seeker - Dashboard data for seekers
router.get("/dashboard/seeker", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    // Get seeker booking statistics
    const totalBookings = await bookingRepository.count({
      where: { seekerId: userId }
    });

    const activeBookings = await bookingRepository.count({
      where: { seekerId: userId, status: BookingStatus.ACCEPTED }
    });

    const pendingRequests = await bookingRepository.count({
      where: { seekerId: userId, status: BookingStatus.PENDING }
    });

    const completedBookings = await bookingRepository.count({
      where: { seekerId: userId, status: BookingStatus.COMPLETED }
    });

    const cancelledBookings = await bookingRepository.count({
      where: { seekerId: userId, status: BookingStatus.CANCELLED }
    });

    // Get reviews given by this seeker
    const reviewsGiven = await ratingRepository.count({
      where: { seekerId: userId }
    });

    // Get total spending
    const allBookings = await bookingRepository.find({
      where: { seekerId: userId },
      select: ['totalPrice']
    });
    const totalSpent = allBookings.reduce((sum, booking) => sum + parseFloat(booking.totalPrice.toString()), 0);

    // Get upcoming appointments (accepted bookings with future dates)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const upcomingAppointments = await bookingRepository.find({
      where: { 
        seekerId: userId, 
        status: BookingStatus.ACCEPTED,
        requestedDate: MoreThanOrEqual(today.toISOString().split('T')[0])
      },
      relations: ["service", "provider"],
      order: { requestedDate: "ASC", requestedTime: "ASC" },
      take: 5
    });

    // Clean up password fields
    upcomingAppointments.forEach((booking: any) => {
      if (booking.provider) {
        const { password: _, ...providerWithoutPassword } = booking.provider;
        booking.provider = providerWithoutPassword;
      }
    });

    // Get recent bookings
    const recentBookings = await bookingRepository.find({
      where: { seekerId: userId },
      relations: ["service", "provider"],
      order: { createdAt: "DESC" },
      take: 5
    });

    // Clean up password fields
    recentBookings.forEach((booking: any) => {
      if (booking.provider) {
        const { password: _, ...providerWithoutPassword } = booking.provider;
        booking.provider = providerWithoutPassword;
      }
    });

    res.json({
      statistics: {
        totalBookings,
        activeBookings,
        pendingRequests,
        completedBookings,
        cancelledBookings,
        reviewsGiven,
        totalSpent: Math.round(totalSpent * 100) / 100
      },
      upcomingAppointments,
      recentBookings
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/users/dashboard/provider - Dashboard data for providers
router.get("/dashboard/provider", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    // Get provider statistics
    const totalBookings = await bookingRepository.count({
      where: { providerId: userId }
    });

    const activeServices = await serviceRepository.count({
      where: { providerId: userId, isActive: true }
    });

    const pendingRequests = await bookingRepository.count({
      where: { providerId: userId, status: BookingStatus.PENDING }
    });

    const completedBookings = await bookingRepository.count({
      where: { providerId: userId, status: BookingStatus.COMPLETED }
    });

    const upcomingBookings = await bookingRepository.count({
      where: { providerId: userId, status: BookingStatus.ACCEPTED }
    });

    // Get earnings from completed bookings
    const completedBookingsList = await bookingRepository.find({
      where: { providerId: userId, status: BookingStatus.COMPLETED },
      select: ['totalPrice']
    });
    const totalEarnings = completedBookingsList.reduce((sum, booking) => sum + parseFloat(booking.totalPrice.toString()), 0);

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

    // Calculate average rating
    const ratings = await ratingRepository.find({
      where: { providerId: userId },
      select: ['score']
    });
    const avgRating = ratings.length > 0 ? ratings.reduce((sum, rating) => sum + rating.score, 0) / ratings.length : 0;

    // Calculate completion rate
    const totalNonCancelled = totalBookings - await bookingRepository.count({
      where: { providerId: userId, status: BookingStatus.CANCELLED }
    });
    const completionRate = totalNonCancelled > 0 ? ((completedBookings / totalNonCancelled) * 100) : 0;

    // Get recent booking requests
    const recentRequests = await bookingRepository.find({
      where: { providerId: userId, status: BookingStatus.PENDING },
      relations: ["service", "seeker"],
      order: { createdAt: "DESC" },
      take: 5
    });

    // Clean up password fields
    recentRequests.forEach((booking: any) => {
      if (booking.seeker) {
        const { password: _, ...seekerWithoutPassword } = booking.seeker;
        booking.seeker = seekerWithoutPassword;
      }
    });

    // Get active services
    const myActiveServices = await serviceRepository.find({
      where: { providerId: userId, isActive: true },
      order: { createdAt: "DESC" },
      take: 5
    });

    res.json({
      statistics: {
        totalBookings,
        activeServices,
        pendingRequests,
        completedBookings,
        upcomingBookings,
        totalEarnings: Math.round(totalEarnings * 100) / 100,
        thisMonthEarnings: Math.round(thisMonthEarnings * 100) / 100,
        avgRating: Math.round(avgRating * 10) / 10,
        completionRate: Math.round(completionRate * 10) / 10
      },
      recentRequests,
      activeServices: myActiveServices
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/users/dashboard/both - Dashboard data for users with "both" role
router.get("/dashboard/both", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    // Seeker Statistics
    const seekerTotalBookings = await bookingRepository.count({
      where: { seekerId: userId }
    });

    const seekerActiveBookings = await bookingRepository.count({
      where: { seekerId: userId, status: BookingStatus.ACCEPTED }
    });

    const seekerPendingRequests = await bookingRepository.count({
      where: { seekerId: userId, status: BookingStatus.PENDING }
    });

    const seekerCompletedBookings = await bookingRepository.count({
      where: { seekerId: userId, status: BookingStatus.COMPLETED }
    });

    // Provider Statistics
    const providerTotalBookings = await bookingRepository.count({
      where: { providerId: userId }
    });

    const providerActiveServices = await serviceRepository.count({
      where: { providerId: userId, isActive: true }
    });

    const providerPendingRequests = await bookingRepository.count({
      where: { providerId: userId, status: BookingStatus.PENDING }
    });

    const providerCompletedBookings = await bookingRepository.count({
      where: { providerId: userId, status: BookingStatus.COMPLETED }
    });

    // Financial data
    const seekerBookings = await bookingRepository.find({
      where: { seekerId: userId },
      select: ['totalPrice']
    });
    const totalSpent = seekerBookings.reduce((sum, booking) => sum + parseFloat(booking.totalPrice.toString()), 0);

    const providerCompletedList = await bookingRepository.find({
      where: { providerId: userId, status: BookingStatus.COMPLETED },
      select: ['totalPrice']
    });
    const totalEarned = providerCompletedList.reduce((sum, booking) => sum + parseFloat(booking.totalPrice.toString()), 0);

    // Average rating as provider
    const ratings = await ratingRepository.find({
      where: { providerId: userId },
      select: ['score']
    });
    const avgRating = ratings.length > 0 ? ratings.reduce((sum, rating) => sum + rating.score, 0) / ratings.length : 0;

    // Reviews given as seeker
    const reviewsGiven = await ratingRepository.count({
      where: { seekerId: userId }
    });

    // Recent activity - mix of seeker and provider activities
    const recentSeekerBookings = await bookingRepository.find({
      where: { seekerId: userId },
      relations: ["service", "provider"],
      order: { createdAt: "DESC" },
      take: 3
    });

    const recentProviderBookings = await bookingRepository.find({
      where: { providerId: userId },
      relations: ["service", "seeker"],
      order: { createdAt: "DESC" },
      take: 3
    });

    // Clean up password fields
    [...recentSeekerBookings, ...recentProviderBookings].forEach((booking: any) => {
      if (booking.provider) {
        const { password: _, ...providerWithoutPassword } = booking.provider;
        booking.provider = providerWithoutPassword;
      }
      if (booking.seeker) {
        const { password: _, ...seekerWithoutPassword } = booking.seeker;
        booking.seeker = seekerWithoutPassword;
      }
    });

    // Upcoming appointments as seeker
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const upcomingAppointments = await bookingRepository.find({
      where: { 
        seekerId: userId, 
        status: BookingStatus.ACCEPTED,
        requestedDate: MoreThanOrEqual(today.toISOString().split('T')[0])
      },
      relations: ["service", "provider"],
      order: { requestedDate: "ASC", requestedTime: "ASC" },
      take: 3
    });

    // Pending requests as provider
    const pendingProviderRequests = await bookingRepository.find({
      where: { providerId: userId, status: BookingStatus.PENDING },
      relations: ["service", "seeker"],
      order: { createdAt: "DESC" },
      take: 3
    });

    // Clean up password fields
    [...upcomingAppointments, ...pendingProviderRequests].forEach((booking: any) => {
      if (booking.provider) {
        const { password: _, ...providerWithoutPassword } = booking.provider;
        booking.provider = providerWithoutPassword;
      }
      if (booking.seeker) {
        const { password: _, ...seekerWithoutPassword } = booking.seeker;
        booking.seeker = seekerWithoutPassword;
      }
    });

    res.json({
      seekerStats: {
        totalBookings: seekerTotalBookings,
        activeBookings: seekerActiveBookings,
        pendingRequests: seekerPendingRequests,
        completedBookings: seekerCompletedBookings,
        totalSpent: Math.round(totalSpent * 100) / 100,
        reviewsGiven
      },
      providerStats: {
        totalBookings: providerTotalBookings,
        activeServices: providerActiveServices,
        pendingRequests: providerPendingRequests,
        completedBookings: providerCompletedBookings,
        totalEarned: Math.round(totalEarned * 100) / 100,
        avgRating: Math.round(avgRating * 10) / 10
      },
      recentActivity: {
        asSeeker: recentSeekerBookings,
        asProvider: recentProviderBookings
      },
      upcomingAppointments,
      pendingProviderRequests
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
