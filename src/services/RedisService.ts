import Redis from 'ioredis';

class RedisService {
  private client: Redis;
  private pubClient: Redis;
  private subClient: Redis;

  constructor() {
    // Check if using URL or individual parameters
    const redisUrl = process.env.REDIS_URL;
    const redisHost = process.env.REDIS_HOST;
    const redisPort = process.env.REDIS_PORT;
    const redisUsername = process.env.REDIS_USERNAME;
    const redisPassword = process.env.REDIS_PASSWORD;

    let redisConfig: any;

    // If individual parameters are provided, use them (for Redis Cloud, etc.)
    if (redisHost && redisPort) {
      const useTLS = process.env.REDIS_TLS === 'true';
      
      redisConfig = {
        host: redisHost,
        port: parseInt(redisPort),
        username: redisUsername || 'default',
        password: redisPassword,
        retryStrategy: (times: number) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: false,
        // Enable TLS for cloud Redis providers with proper configuration
        tls: useTLS ? {
          rejectUnauthorized: false, // Accept self-signed certificates
        } : undefined,
      };
      console.log(`🔗 Connecting to Redis at ${redisHost}:${redisPort} (TLS: ${useTLS})`);
    } 
    // Otherwise use URL
    else {
      const url = redisUrl || 'redis://localhost:6379';
      redisConfig = url;
      
      const redisOptions = {
        retryStrategy: (times: number) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: false,
        // Support for TLS (rediss://)
        tls: url.startsWith('rediss://') ? {} : undefined,
      };

      this.client = new Redis(url, redisOptions);
      this.pubClient = new Redis(url, redisOptions);
      this.subClient = new Redis(url, redisOptions);
      
      console.log(`🔗 Connecting to Redis via URL: ${url.replace(/:[^:@]+@/, ':****@')}`);
      
      this.setupEventListeners();
      return;
    }

    // Create clients with config object
    this.client = new Redis(redisConfig);
    this.pubClient = new Redis(redisConfig);
    this.subClient = new Redis(redisConfig);

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.client.on('connect', () => {
      console.log('✅ Redis connected');
    });

    this.client.on('ready', () => {
      console.log('✅ Redis ready');
    });

    this.client.on('error', (err) => {
      console.error('❌ Redis error:', err.message);
    });

    this.client.on('reconnecting', () => {
      console.log('🔄 Redis reconnecting...');
    });
  }

  // Cache operations
  async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(key);
    } catch (error) {
      console.error('Redis GET error:', error);
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    try {
      if (ttlSeconds) {
        await this.client.setex(key, ttlSeconds, value);
      } else {
        await this.client.set(key, value);
      }
    } catch (error) {
      console.error('Redis SET error:', error);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (error) {
      console.error('Redis DEL error:', error);
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      console.error('Redis EXISTS error:', error);
      return false;
    }
  }

  // Cache with JSON serialization
  async getJSON<T>(key: string): Promise<T | null> {
    try {
      const data = await this.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Redis GET JSON error:', error);
      return null;
    }
  }

  async setJSON(key: string, value: any, ttlSeconds?: number): Promise<void> {
    try {
      await this.set(key, JSON.stringify(value), ttlSeconds);
    } catch (error) {
      console.error('Redis SET JSON error:', error);
    }
  }

  // Pattern-based deletion (e.g., clear all services cache)
  async deletePattern(pattern: string): Promise<void> {
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } catch (error) {
      console.error('Redis DELETE PATTERN error:', error);
    }
  }

  // Pub/Sub operations
  async publish(channel: string, message: string): Promise<void> {
    try {
      await this.pubClient.publish(channel, message);
    } catch (error) {
      console.error('Redis PUBLISH error:', error);
    }
  }

  async subscribe(channel: string, callback: (message: string) => void): Promise<void> {
    try {
      await this.subClient.subscribe(channel);
      this.subClient.on('message', (ch, msg) => {
        if (ch === channel) {
          callback(msg);
        }
      });
    } catch (error) {
      console.error('Redis SUBSCRIBE error:', error);
    }
  }

  // List operations (for message queues)
  async lpush(key: string, value: string): Promise<void> {
    try {
      await this.client.lpush(key, value);
    } catch (error) {
      console.error('Redis LPUSH error:', error);
    }
  }

  async rpop(key: string): Promise<string | null> {
    try {
      return await this.client.rpop(key);
    } catch (error) {
      console.error('Redis RPOP error:', error);
      return null;
    }
  }

  // Increment operations (for counters)
  async incr(key: string): Promise<number> {
    try {
      return await this.client.incr(key);
    } catch (error) {
      console.error('Redis INCR error:', error);
      return 0;
    }
  }

  async expire(key: string, seconds: number): Promise<void> {
    try {
      await this.client.expire(key, seconds);
    } catch (error) {
      console.error('Redis EXPIRE error:', error);
    }
  }

  // Disconnect
  async disconnect(): Promise<void> {
    await this.client.quit();
    await this.pubClient.quit();
    await this.subClient.quit();
  }

  getClient(): Redis {
    return this.client;
  }

  getPubClient(): Redis {
    return this.pubClient;
  }

  getSubClient(): Redis {
    return this.subClient;
  }
}

export default new RedisService();
