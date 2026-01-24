import app from '../src/server';
import { VercelRequest, VercelResponse } from '@vercel/node';
import { AppDataSource } from '../src/data-source';

let isInitialized = false;

export default async (req: VercelRequest, res: VercelResponse) => {
  // Set CORS headers for all requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  // Initialize database connection if not already done
  if (!isInitialized) {
    try {
      if (!AppDataSource.isInitialized) {
        await AppDataSource.initialize();
        console.log("✅ Database connected successfully in serverless function");
      }
      isInitialized = true;
    } catch (error) {
      console.error("❌ Database connection failed in serverless function:", error);
      res.status(500).json({ error: 'Database connection failed' });
      return;
    }
  }
  
  app(req, res);
};