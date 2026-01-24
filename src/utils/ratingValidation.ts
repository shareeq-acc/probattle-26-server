import { User, UserRole } from "../entities/User";
import { Booking, BookingStatus } from "../entities/Booking";

export interface CreateRatingDto {
  bookingId: string;
  score: number;
  review?: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Validates that a rating score is within the valid range (1-5 inclusive)
 * @param score - The rating score to validate
 * @returns true if score is valid, false otherwise
 */
export function validateRatingScore(score: number): boolean {
  return Number.isInteger(score) && score >= 1 && score <= 5;
}

/**
 * Validates that review text does not exceed maximum length
 * @param review - The review text to validate
 * @returns true if review is valid, false otherwise
 */
export function validateReviewText(review: string | undefined): boolean {
  if (review === undefined || review === null) {
    return true; // Review is optional
  }
  
  if (typeof review !== 'string') {
    return false;
  }
  
  return review.length <= 500;
}

/**
 * Validates that a user has the correct role to submit ratings
 * Only users with "seeker" or "both" roles can submit ratings
 * @param user - The user attempting to submit a rating
 * @returns true if user role is valid, false otherwise
 */
export function validateUserRole(user: User): boolean {
  return user.role === UserRole.SEEKER || user.role === UserRole.BOTH;
}

/**
 * Validates that a booking is eligible for rating
 * Booking must be completed or cancelled, and user must be the seeker
 * @param booking - The booking to validate
 * @param userId - The ID of the user attempting to rate
 * @returns true if booking is eligible, false otherwise
 */
export function validateBookingEligibility(booking: Booking, userId: string): boolean {
  // User must be the seeker of the booking
  if (booking.seekerId !== userId) {
    return false;
  }
  
  // Booking must be completed or cancelled to be eligible for rating
  return booking.status === BookingStatus.COMPLETED || booking.status === BookingStatus.CANCELLED;
}

/**
 * Comprehensive validation for rating submission
 * @param ratingData - The rating data to validate
 * @param user - The user submitting the rating
 * @param booking - The booking being rated
 * @returns ValidationResult with isValid flag and error messages
 */
export function validateRatingSubmission(
  ratingData: CreateRatingDto,
  user: User,
  booking: Booking
): ValidationResult {
  const errors: string[] = [];

  // Validate user role
  if (!validateUserRole(user)) {
    errors.push("Only users with 'seeker' or 'both' roles can submit ratings");
  }

  // Validate booking eligibility
  if (!validateBookingEligibility(booking, user.id)) {
    if (booking.seekerId !== user.id) {
      errors.push("You can only rate bookings you created");
    } else if (booking.status !== BookingStatus.COMPLETED && booking.status !== BookingStatus.CANCELLED) {
      errors.push("You can only rate completed or cancelled bookings");
    }
  }

  // Validate rating score
  if (!validateRatingScore(ratingData.score)) {
    errors.push("Rating score must be an integer between 1 and 5");
  }

  // Validate review text
  if (!validateReviewText(ratingData.review)) {
    errors.push("Review text must not exceed 500 characters");
  }

  // Validate required fields
  if (!ratingData.bookingId) {
    errors.push("Booking ID is required");
  }

  if (ratingData.score === undefined || ratingData.score === null) {
    errors.push("Rating score is required");
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Sanitizes review text to prevent XSS attacks while preserving legitimate content
 * @param review - The review text to sanitize
 * @returns Sanitized review text
 */
export function sanitizeReviewText(review: string | undefined): string | null {
  if (!review) {
    return null;
  }

  // Basic HTML/script tag removal to prevent XSS
  // Remove script tags and their content
  let sanitized = review.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  
  // Remove HTML tags but preserve content
  sanitized = sanitized.replace(/<[^>]*>/g, '');
  
  // Remove potentially dangerous characters and sequences
  sanitized = sanitized.replace(/javascript:/gi, '');
  sanitized = sanitized.replace(/on\w+\s*=/gi, '');
  
  // Trim whitespace
  sanitized = sanitized.trim();
  
  return sanitized || null;
}