import rateLimit from 'express-rate-limit';

export const createRateLimiter = (windowMs?: number, max?: number) => {
  return rateLimit({
    windowMs: windowMs || parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
    max: max || parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '1000'), // 1000 requests per window (increased from 100)
    message: {
      error: 'Too many requests from this IP, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
};

// Specific rate limiters for different endpoints (all increased)
export const authLimiter = createRateLimiter(15 * 60 * 1000, 50); // 50 attempts per 15 minutes (increased from 5)
export const uploadLimiter = createRateLimiter(60 * 60 * 1000, 100); // 100 uploads per hour (increased from 10)
export const generalLimiter = createRateLimiter(); // Default limits (now 1000 per 15 minutes)