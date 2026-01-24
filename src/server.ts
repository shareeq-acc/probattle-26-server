import "reflect-metadata";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { AppDataSource } from "./data-source";
import authRoutes from "./routes/auth";
import usersRoutes from "./routes/users";
import servicesRoutes from "./routes/services";
import bookingsRoutes from "./routes/bookings";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/services", servicesRoutes);
app.use("/api/bookings", bookingsRoutes);

app.get("/", (req: any, res: any) => {
  res.json({ message: "Neighbourly API is running" });
});

AppDataSource.initialize()
  .then(() => {
    console.log("Database connected successfully");
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch((error: any) => {
    console.error("Database connection failed:", error);
  });
