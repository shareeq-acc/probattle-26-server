import { AppDataSource } from "../data-source";
import { Rating } from "../entities/Rating";

export interface RatingDistribution {
  1: number;
  2: number;
  3: number;
  4: number;
  5: number;
}

export interface ProviderRatingSummary {
  averageRating: number;
  totalRatings: number;
  ratingDistribution: RatingDistribution;
}

export enum RatingSortOrder {
  NEWEST_FIRST = "DESC",
  OLDEST_FIRST = "ASC"
}

export interface RatingSortOptions {
  sortBy?: "createdAt" | "score";
  order?: RatingSortOrder;
}

/**
 * Calculates the average rating for a provider
 * @param providerId - The ID of the provider
 * @returns Promise<number> - The average rating (0 if no ratings)
 */
export async function calculateAverageRating(providerId: string): Promise<number> {
  const ratingRepository = AppDataSource.getRepository(Rating);
  
  const result = await ratingRepository
    .createQueryBuilder("rating")
    .select("AVG(rating.score)", "average")
    .where("rating.providerId = :providerId", { providerId })
    .getRawOne();
  
  const average = result?.average ? parseFloat(result.average) : 0;
  
  // Round to 2 decimal places
  return Math.round(average * 100) / 100;
}

/**
 * Counts the total number of ratings for a provider
 * @param providerId - The ID of the provider
 * @returns Promise<number> - The total count of ratings
 */
export async function getTotalRatingCount(providerId: string): Promise<number> {
  const ratingRepository = AppDataSource.getRepository(Rating);
  
  return await ratingRepository.count({
    where: { providerId }
  });
}

/**
 * Generates rating distribution statistics for a provider
 * Shows how many ratings of each score (1-5) the provider has received
 * @param providerId - The ID of the provider
 * @returns Promise<RatingDistribution> - Distribution of ratings by score
 */
export async function getRatingDistribution(providerId: string): Promise<RatingDistribution> {
  const ratingRepository = AppDataSource.getRepository(Rating);
  
  const results = await ratingRepository
    .createQueryBuilder("rating")
    .select("rating.score", "score")
    .addSelect("COUNT(*)", "count")
    .where("rating.providerId = :providerId", { providerId })
    .groupBy("rating.score")
    .getRawMany();
  
  // Initialize distribution with zeros
  const distribution: RatingDistribution = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0
  };
  
  // Fill in actual counts
  results.forEach(result => {
    const score = parseInt(result.score) as keyof RatingDistribution;
    const count = parseInt(result.count);
    if (score >= 1 && score <= 5) {
      distribution[score] = count;
    }
  });
  
  return distribution;
}

/**
 * Gets recent ratings for a provider, sorted by creation date descending
 * @param providerId - The ID of the provider
 * @param limit - Maximum number of ratings to return (default: 10)
 * @param sortOptions - Optional sorting configuration
 * @returns Promise<Rating[]> - Array of recent ratings with seeker information
 */
export async function getRecentRatings(
  providerId: string, 
  limit: number = 10,
  sortOptions: RatingSortOptions = {}
): Promise<Rating[]> {
  const ratingRepository = AppDataSource.getRepository(Rating);
  
  const { sortBy = "createdAt", order = RatingSortOrder.NEWEST_FIRST } = sortOptions;
  
  // Handle empty rating lists gracefully by using proper error handling
  try {
    const ratings = await ratingRepository.find({
      where: { providerId },
      relations: ["seeker"],
      order: { [sortBy]: order },
      take: limit
    });
    
    // Return empty array if no ratings found (graceful handling)
    return ratings || [];
  } catch (error) {
    console.error("Error fetching recent ratings:", error);
    // Return empty array on error to handle gracefully
    return [];
  }
}

/**
 * Gets all ratings for a provider with consistent sorting
 * Handles empty rating lists gracefully and ensures consistent sort order
 * @param providerId - The ID of the provider
 * @param sortOptions - Optional sorting configuration
 * @returns Promise<Rating[]> - Array of all ratings with seeker information
 */
export async function getAllProviderRatings(
  providerId: string,
  sortOptions: RatingSortOptions = {}
): Promise<Rating[]> {
  const ratingRepository = AppDataSource.getRepository(Rating);
  
  const { sortBy = "createdAt", order = RatingSortOrder.NEWEST_FIRST } = sortOptions;
  
  try {
    const ratings = await ratingRepository.find({
      where: { providerId },
      relations: ["seeker"],
      order: { [sortBy]: order }
    });
    
    // Return empty array if no ratings found (graceful handling)
    return ratings || [];
  } catch (error) {
    console.error("Error fetching provider ratings:", error);
    // Return empty array on error to handle gracefully
    return [];
  }
}

/**
 * Sorts an array of ratings by creation date in descending order (most recent first)
 * Handles edge cases like null/undefined arrays and missing timestamps
 * @param ratings - Array of ratings to sort
 * @returns Rating[] - Sorted array of ratings
 */
export function sortRatingsByDate(ratings: Rating[]): Rating[] {
  // Handle empty or null arrays gracefully
  if (!ratings || !Array.isArray(ratings) || ratings.length === 0) {
    return [];
  }
  
  return ratings.sort((a, b) => {
    // Handle missing createdAt timestamps gracefully
    const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    
    // Sort in descending order (most recent first)
    return dateB - dateA;
  });
}

/**
 * Gets a comprehensive rating summary for a provider
 * Combines average rating, total count, distribution, and recent ratings
 * @param providerId - The ID of the provider
 * @param recentLimit - Number of recent ratings to include (default: 5)
 * @returns Promise<ProviderRatingSummary & { recentRatings: Rating[] }>
 */
export async function getProviderRatingSummary(
  providerId: string, 
  recentLimit: number = 5
): Promise<ProviderRatingSummary & { recentRatings: Rating[] }> {
  // Execute all queries in parallel for better performance
  const [averageRating, totalRatings, ratingDistribution, recentRatings] = await Promise.all([
    calculateAverageRating(providerId),
    getTotalRatingCount(providerId),
    getRatingDistribution(providerId),
    getRecentRatings(providerId, recentLimit)
  ]);
  
  return {
    averageRating,
    totalRatings,
    ratingDistribution,
    recentRatings
  };
}