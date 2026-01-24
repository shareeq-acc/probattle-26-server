import "reflect-metadata";
import { AppDataSource } from "./data-source";
import { City } from "./entities/City";
import { User, UserRole } from "./entities/User";
import bcrypt from "bcryptjs";

async function seed() {
  try {
    await AppDataSource.initialize();
    console.log("Database connected for seeding");

    const cityRepository = AppDataSource.getRepository(City);
    const userRepository = AppDataSource.getRepository(User);

    // Create cities
    const cities: Array<{
      name: string;
      state?: string;
      country: string;
      latitude: number;
      longitude: number;
    }> = [
      // Pakistani Cities
      {
        name: "Karachi",
        state: "Sindh",
        country: "Pakistan",
        latitude: 24.8607,
        longitude: 67.0011
      },
      {
        name: "Lahore",
        state: "Punjab",
        country: "Pakistan",
        latitude: 31.5204,
        longitude: 74.3587
      },
      {
        name: "Islamabad",
        state: "Islamabad Capital Territory",
        country: "Pakistan",
        latitude: 33.6844,
        longitude: 73.0479
      },
      {
        name: "Rawalpindi",
        state: "Punjab",
        country: "Pakistan",
        latitude: 33.5651,
        longitude: 73.0169
      },
      // International Cities
      {
        name: "New York",
        state: "NY",
        country: "USA",
        latitude: 40.7128,
        longitude: -74.0060
      },
      {
        name: "Los Angeles",
        state: "CA",
        country: "USA",
        latitude: 34.0522,
        longitude: -118.2437
      },
      {
        name: "Toronto",
        state: "ON",
        country: "Canada",
        latitude: 43.6532,
        longitude: -79.3832
      },
      {
        name: "London",
        // state is optional for cities that don't have states
        country: "UK",
        latitude: 51.5074,
        longitude: -0.1278
      }
    ];

    console.log("Creating cities...");
    for (const cityData of cities) {
      const existingCity = await cityRepository.findOne({ where: { name: cityData.name } });
      if (!existingCity) {
        const city = cityRepository.create(cityData);
        await cityRepository.save(city);
        console.log(`✅ Created city: ${cityData.name}`);
      } else {
        console.log(`⏭️  City already exists: ${cityData.name}`);
      }
    }

    // Create admin user
    const adminEmail = "admin@neighbourly.com";
    const existingAdmin = await userRepository.findOne({ where: { email: adminEmail } });
    
    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash("admin123", 10);
      const karachiCity = await cityRepository.findOne({ where: { name: "Karachi" } });
      
      const admin = userRepository.create({
        email: adminEmail,
        password: hashedPassword,
        name: "System Administrator",
        phone: "+923001234567",
        role: UserRole.ADMIN,
        bio: "System administrator for Neighbourly platform",
        cityId: karachiCity?.id,
        latitude: 24.8607,
        longitude: 67.0011,
        verified: true
      });

      await userRepository.save(admin);
      console.log("✅ Created admin user: admin@neighbourly.com / admin123");
    } else {
      console.log("⏭️  Admin user already exists");
    }

    // Create moderator user
    const moderatorEmail = "moderator@neighbourly.com";
    const existingModerator = await userRepository.findOne({ where: { email: moderatorEmail } });
    
    if (!existingModerator) {
      const hashedPassword = await bcrypt.hash("moderator123", 10);
      const lahoreCity = await cityRepository.findOne({ where: { name: "Lahore" } });
      
      const moderator = userRepository.create({
        email: moderatorEmail,
        password: hashedPassword,
        name: "Content Moderator",
        phone: "+923009876543",
        role: UserRole.MODERATOR,
        bio: "Content moderator for Neighbourly platform",
        cityId: lahoreCity?.id,
        latitude: 31.5204,
        longitude: 74.3587,
        verified: true
      });

      await userRepository.save(moderator);
      console.log("✅ Created moderator user: moderator@neighbourly.com / moderator123");
    } else {
      console.log("⏭️  Moderator user already exists");
    }

    console.log("\n🌟 Seeding completed successfully!");
    console.log("\n📋 Test Accounts:");
    console.log("Admin: admin@neighbourly.com / admin123");
    console.log("Moderator: moderator@neighbourly.com / moderator123");
    
    await AppDataSource.destroy();
  } catch (error) {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  }
}

seed();