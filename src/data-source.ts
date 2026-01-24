import { DataSource } from "typeorm";
import { User } from "./entities/User";
import { Service } from "./entities/Service";
import { Booking } from "./entities/Booking";

export const AppDataSource = new DataSource({
  type: "sqlite",
  database: "database.sqlite",
  synchronize: true,
  logging: false,
  entities: [User, Service, Booking],
});
