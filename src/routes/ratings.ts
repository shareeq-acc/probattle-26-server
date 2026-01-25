import { Router, Response } from "express";
import { AppDataSource } from "../data-source";
import { Rating } from "../entities/Rating";
import { Booking } from "../entities/Booking";
import { User } from "../entities/User";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { createRateLimiter } from "../middleware/rateLimiter";
import { 
  validateRatingSubmission, 
  sanitizeReviewText, 
  CreateRatingDto 
} from "../utils/ratingValidation";

const router = Router();
const ratingRepository = AppDataSource.getRepository(Rating);
const bookingRepository = AppDataSource.getRepository(Booking);
const userRepository = AppDataSource.getRepository(User);

// Rate limiting for rating endpoints (increased limit)
const ratingLimiter = createRateLimiter(15 * 60 * 1000, 100); // 100 rating operations per 15 minutes (increased from 20)

// POST /api/ratings
router.post("/", ratingLimiter, authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { bookingId, score, review }: CreateRatingDto = req.body;
    const userId = req.user!.id;

    // Validate required fields
    if (!bookingId) {
      return res.status(400).json({ 
        success: false,
        error: {
          message: "Booking ID is required",
          code: "MISSING_BOOKING_ID"
        }
      });
    }

    if (score === undefined || score === null) {
      return res.status(400).json({ 
        success: false,
        error: {
          message: "Rating score is required",
          code: "MISSING_RATING_SCORE"
        }
      });
    }

    // Get the booking with relations
    const booking = await bookingRepository.findOne({
      where: { id: bookingId },
      relations: ["service", "seeker", "provider"]
    });

    if (!booking) {
      return res.status(404).json({ 
        success: false,
        error: {
          message: "Booking not found",
          code: "BOOKING_NOT_FOUND"
        }
      });
    }

    // Get the user making the request
    const user = await userRepository.findOne({
      where: { id: userId }
    });

    if (!user) {
      return res.status(401).json({ 
        success: false,
        error: {
          message: "User not found",
          code: "USER_NOT_FOUND"
        }
      });
    }

    // Validate the rating submission
    const validation = validateRatingSubmission({ bookingId, score, review }, user, booking);
    
    if (!validation.isValid) {
      return res.status(400).json({ 
        success: false,
        error: {
          message: "Validation failed",
          code: "VALIDATION_ERROR",
          details: validation.errors
        }
      });
    }

    // Check if rating already exists for this booking
    const existingRating = await ratingRepository.findOne({
      where: { bookingId }
    });

    if (existingRating) {
      return res.status(409).json({ 
        success: false,
        error: {
          message: "Rating already exists for this booking",
          code: "DUPLICATE_RATING"
        }
      });
    }

    // Sanitize review text
    const sanitizedReview = sanitizeReviewText(review);

    // Create and save the rating
    const rating = ratingRepository.create({
      bookingId,
      seekerId: userId,
      providerId: booking.providerId,
      score,
      review: sanitizedReview
    });

    await ratingRepository.save(rating);

    // Return success response with rating ID
    res.status(201).json({
      success: true,
      data: {
        ratingId: rating.id,
        message: "Rating submitted successfully"
      }
    });

  } catch (error) {
    console.error("Error creating rating:", error);
    
    // Handle specific database errors
    if (error instanceof Error) {
      if (error.message.includes('duplicate key')) {
        return res.status(409).json({ 
          success: false,
          error: {
            message: "Rating already exists for this booking",
            code: "DUPLICATE_RATING"
          }
        });
      }
      
      if (error.message.includes('foreign key')) {
        return res.status(400).json({ 
          success: false,
          error: {
            message: "Invalid booking or user reference",
            code: "INVALID_REFERENCE"
          }
        });
      }
    }
    
    res.status(500).json({ 
      success: false,
      error: {
        message: "An unexpected error occurred while creating the rating. Please try again later.",
        code: "INTERNAL_SERVER_ERROR"
      }
    });
  }
});

// GET /api/ratings/provider/:providerId/summary
router.get("/provider/:providerId/summary", ratingLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { providerId } = req.params;

    // Validate providerId
    if (!providerId) {
      return res.status(400).json({ 
        success: false,
        error: {
          message: "Provider ID is required",
          code: "MISSING_PROVIDER_ID"
        }
      });
    }

    // Check if provider exists
    const provider = await userRepository.findOne({
      where: { id: providerId }
    });

    if (!provider) {
      return res.status(404).json({ 
        success: false,
        error: {
          message: "Provider not found",
          code: "PROVIDER_NOT_FOUND"
        }
      });
    }

    // Get all ratings for the provider
    const ratings = await ratingRepository.find({
      where: { providerId },
      relations: ["seeker"],
      order: { createdAt: "DESC" }
    });

    // Calculate summary statistics
    const totalRatings = ratings.length;
    
    let averageRating = 0;
    const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    if (totalRatings > 0) {
      // Calculate average rating
      const totalScore = ratings.reduce((sum, rating) => sum + rating.score, 0);
      averageRating = Math.round((totalScore / totalRatings) * 100) / 100; // Round to 2 decimal places

      // Calculate rating distribution
      ratings.forEach(rating => {
        ratingDistribution[rating.score as keyof typeof ratingDistribution]++;
      });
    }

    // Get recent ratings (limit to 5 most recent)
    const recentRatings = ratings.slice(0, 5).map(rating => ({
      id: rating.id,
      bookingId: rating.bookingId,
      score: rating.score,
      review: rating.review,
      createdAt: rating.createdAt,
      seeker: {
        id: rating.seeker.id,
        name: rating.seeker.name
      }
    }));

    const summary = {
      success: true,
      data: {
        averageRating,
        totalRatings,
        ratingDistribution,
        recentRatings
      }
    };

    res.json(summary);

  } catch (error) {
    console.error("Error fetching provider rating summary:", error);
    
    // Handle specific database errors
    if (error instanceof Error) {
      if (error.message.includes('connection')) {
        return res.status(503).json({ 
          success: false,
          error: {
            message: "Database connection error. Please try again later.",
            code: "DATABASE_CONNECTION_ERROR"
          }
        });
      }
    }
    
    res.status(500).json({ 
      success: false,
      error: {
        message: "An unexpected error occurred while fetching rating summary. Please try again later.",
        code: "INTERNAL_SERVER_ERROR"
      }
    });
  }
});

// GET /api/ratings/booking/:bookingId
router.get("/booking/:bookingId", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { bookingId } = req.params;
    const userId = req.user!.id;

    // Validate bookingId
    if (!bookingId) {
      return res.status(400).json({ 
        success: false,
        error: {
          message: "Booking ID is required",
          code: "MISSING_BOOKING_ID"
        }
      });
    }

    // Get the booking to verify user authorization
    const booking = await bookingRepository.findOne({
      where: { id: bookingId },
      relations: ["seeker", "provider"]
    });

    if (!booking) {
      return res.status(404).json({ 
        success: false,
        error: {
          message: "Booking not found",
          code: "BOOKING_NOT_FOUND"
        }
      });
    }

    // Verify user authorization - user must be either the seeker or provider of the booking
    if (booking.seekerId !== userId && booking.providerId !== userId) {
      return res.status(403).json({ 
        success: false,
        error: {
          message: "Not authorized to view this booking's rating",
          code: "UNAUTHORIZED_ACCESS"
        }
      });
    }

    // Get rating for the booking
    const rating = await ratingRepository.findOne({
      where: { bookingId },
      relations: ["seeker"]
    });

    if (!rating) {
      return res.json({
        success: true,
        data: null
      });
    }

    // Format response excluding sensitive user data
    const formattedRating = {
      id: rating.id,
      bookingId: rating.bookingId,
      score: rating.score,
      review: rating.review,
      createdAt: rating.createdAt,
      seeker: {
        id: rating.seeker.id,
        name: rating.seeker.name
      }
    };

    res.json({
      success: true,
      data: formattedRating
    });

  } catch (error) {
    console.error("Error fetching booking rating:", error);
    
    // Handle specific database errors
    if (error instanceof Error) {
      if (error.message.includes('connection')) {
        return res.status(503).json({ 
          success: false,
          error: {
            message: "Database connection error. Please try again later.",
            code: "DATABASE_CONNECTION_ERROR"
          }
        });
      }
    }
    
    res.status(500).json({ 
      success: false,
      error: {
        message: "An unexpected error occurred while fetching booking rating. Please try again later.",
        code: "INTERNAL_SERVER_ERROR"
      }
    });
  }
});

// GET /api/ratings/provider/:providerId
router.get("/provider/:providerId", async (req: AuthRequest, res: Response) => {
  try {
    const { providerId } = req.params;

    // Validate providerId
    if (!providerId) {
      return res.status(400).json({ 
        success: false,
        error: {
          message: "Provider ID is required",
          code: "MISSING_PROVIDER_ID"
        }
      });
    }

    // Check if provider exists
    const provider = await userRepository.findOne({
      where: { id: providerId }
    });

    if (!provider) {
      return res.status(404).json({ 
        success: false,
        error: {
          message: "Provider not found",
          code: "PROVIDER_NOT_FOUND"
        }
      });
    }

    // Get all ratings for the provider with seeker info, sorted by creation date descending
    const ratings = await ratingRepository.find({
      where: { providerId },
      relations: ["seeker"],
      order: { createdAt: "DESC" }
    });

    // Format response excluding sensitive user data
    const formattedRatings = ratings.map(rating => ({
      id: rating.id,
      bookingId: rating.bookingId,
      score: rating.score,
      review: rating.review,
      createdAt: rating.createdAt,
      seeker: {
        id: rating.seeker.id,
        name: rating.seeker.name
      }
    }));

    res.json({
      success: true,
      data: formattedRatings
    });

  } catch (error) {
    console.error("Error fetching provider ratings:", error);
    
    // Handle specific database errors
    if (error instanceof Error) {
      if (error.message.includes('connection')) {
        return res.status(503).json({ 
          success: false,
          error: {
            message: "Database connection error. Please try again later.",
            code: "DATABASE_CONNECTION_ERROR"
          }
        });
      }
    }
    
    res.status(500).json({ 
      success: false,
      error: {
        message: "An unexpected error occurred while fetching provider ratings. Please try again later.",
        code: "INTERNAL_SERVER_ERROR"
      }
    });
  }
});

export default router;