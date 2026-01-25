import { Request, Response, NextFunction } from 'express';
import RedisService from '../services/RedisService';

interface CacheOptions {
  ttl?: number; // Time to live in seconds
  keyPrefix?: string;
  excludeQuery?: boolean;
}

/**
 * Cache middleware for GET requests
 * Usage: router.get('/endpoint', cacheMiddleware({ ttl: 300 }), handler)
 */
export const cacheMiddleware = (options: CacheOptions = {}) => {
  const { ttl = 300, keyPrefix = 'cache', excludeQuery = false } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    try {
      // Generate cache key
      const baseKey = excludeQuery ? req.path : req.originalUrl;
      const cacheKey = `${keyPrefix}:${baseKey}`;

      // Try to get from cache
      const cachedData = await RedisService.get(cacheKey);

      if (cachedData) {
        console.log(`Cache HIT: ${cacheKey}`);
        return res.json(JSON.parse(cachedData));
      }

      console.log(`Cache MISS: ${cacheKey}`);

      // Store original res.json
      const originalJson = res.json.bind(res);

      // Override res.json to cache the response
      res.json = function (data: any) {
        // Cache the response
        RedisService.set(cacheKey, JSON.stringify(data), ttl).catch((err) => {
          console.error('Error caching response:', err);
        });

        // Call original json method
        return originalJson(data);
      };

      next();
    } catch (error) {
      console.error('Cache middleware error:', error);
      next();
    }
  };
};

/**
 * Invalidate cache by pattern
 */
export const invalidateCache = async (pattern: string): Promise<void> => {
  try {
    await RedisService.deletePattern(pattern);
    console.log(`Cache invalidated: ${pattern}`);
  } catch (error) {
    console.error('Error invalidating cache:', error);
  }
};

/**
 * Cache frequently accessed data
 */
export class CacheManager {
  // Cache service categories
  static async cacheServiceCategories(categories: any[]): Promise<void> {
    await RedisService.setJSON('categories:all', categories, 3600); // 1 hour
  }

  static async getCachedServiceCategories(): Promise<any[] | null> {
    return await RedisService.getJSON('categories:all');
  }

  // Cache neighborhood listings
  static async cacheNeighborhoodServices(h3Index: string, services: any[]): Promise<void> {
    await RedisService.setJSON(`neighborhood:${h3Index}`, services, 300); // 5 minutes
  }

  static async getCachedNeighborhoodServices(h3Index: string): Promise<any[] | null> {
    return await RedisService.getJSON(`neighborhood:${h3Index}`);
  }

  // Cache user profile
  static async cacheUserProfile(userId: number, profile: any): Promise<void> {
    await RedisService.setJSON(`user:${userId}:profile`, profile, 600); // 10 minutes
  }

  static async getCachedUserProfile(userId: number): Promise<any | null> {
    return await RedisService.getJSON(`user:${userId}:profile`);
  }

  static async invalidateUserProfile(userId: number): Promise<void> {
    await RedisService.del(`user:${userId}:profile`);
  }

  // Cache service details
  static async cacheService(serviceId: number, service: any): Promise<void> {
    await RedisService.setJSON(`service:${serviceId}`, service, 600); // 10 minutes
  }

  static async getCachedService(serviceId: number): Promise<any | null> {
    return await RedisService.getJSON(`service:${serviceId}`);
  }

  static async invalidateService(serviceId: number): Promise<void> {
    await RedisService.del(`service:${serviceId}`);
  }

  // Invalidate all services cache
  static async invalidateAllServices(): Promise<void> {
    await RedisService.deletePattern('service:*');
    await RedisService.deletePattern('neighborhood:*');
  }
}
