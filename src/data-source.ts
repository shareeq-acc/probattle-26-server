import { DataSource } from "typeorm";
import * as dotenv from "dotenv";
import { User } from "./entities/User";
import { Service } from "./entities/Service";
import { Booking } from "./entities/Booking";
import { RefreshToken } from "./entities/RefreshToken";
import { Report } from "./entities/Report";
import { Rating } from "./entities/Rating";
import { Message } from "./entities/Message";

dotenv.config();

export const AppDataSource = new DataSource({
  type: "postgres",
  url: process.env.DATABASE_URL,
  synchronize: process.env.NODE_ENV === "development",
  logging: process.env.NODE_ENV === "development",
  entities: [User, Service, Booking, RefreshToken, Report, Rating, Message],
  migrations: ["src/migrations/**/*.ts"],
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  extra: {
    max: 20, // Maximum pool size
    min: 5,  // Minimum pool size
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  },
});
