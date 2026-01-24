import jwt from 'jsonwebtoken';
import { AppDataSource } from '../data-source';
import { RefreshToken } from '../entities/RefreshToken';
import { User } from '../entities/User';

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
}

export const generateAccessToken = (payload: JwtPayload): string => {
  return jwt.sign(payload, process.env.JWT_ACCESS_SECRET!, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m'
  });
};

export const generateRefreshToken = (payload: JwtPayload): string => {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET!, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d'
  });
};

export const verifyAccessToken = (token: string): JwtPayload => {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET!) as JwtPayload;
};

export const verifyRefreshToken = (token: string): JwtPayload => {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET!) as JwtPayload;
};

export const storeRefreshToken = async (userId: string, token: string): Promise<RefreshToken> => {
  const refreshTokenRepo = AppDataSource.getRepository(RefreshToken);
  
  // Calculate expiration date
  const expiresAt = new Date();
  const expiresInDays = parseInt(process.env.JWT_REFRESH_EXPIRES_IN?.replace('d', '') || '7');
  expiresAt.setDate(expiresAt.getDate() + expiresInDays);

  const refreshToken = refreshTokenRepo.create({
    userId,
    token,
    expiresAt
  });

  return await refreshTokenRepo.save(refreshToken);
};

export const revokeRefreshToken = async (token: string): Promise<void> => {
  const refreshTokenRepo = AppDataSource.getRepository(RefreshToken);
  await refreshTokenRepo.update({ token }, { isRevoked: true });
};

export const findValidRefreshToken = async (token: string): Promise<RefreshToken | null> => {
  const refreshTokenRepo = AppDataSource.getRepository(RefreshToken);
  return await refreshTokenRepo.findOne({
    where: {
      token,
      isRevoked: false
    },
    relations: ['user']
  });
};

export const generateTokenPair = async (user: User) => {
  const payload: JwtPayload = {
    userId: user.id,
    email: user.email,
    role: user.role
  };

  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  // Store refresh token in database
  await storeRefreshToken(user.id, refreshToken);

  return { accessToken, refreshToken };
};