import "reflect-metadata";
import { AppDataSource } from "./data-source";
import { User, UserRole } from "./entities/User";
import bcrypt from "bcryptjs";

async function seed() {
  try {
    await AppDataSource.initialize();
    console.log("Database connected for seeding");

    const userRepository = AppDataSource.getRepository(User);

    // Create admin user
    const adminEmail = "admin@neighbourly.com";
    const existingAdmin = await userRepository.findOne({ where: { email: adminEmail } });
    
    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash("admin123", 10);
      
      const admin = userRepository.create({
        email: adminEmail,
        password: hashedPassword,
        name: "System Administrator",
        phone: "+923001234567",
        role: UserRole.ADMIN,
        bio: "System administrator for Neighbourly platform",
        latitude: 24.8607, // Karachi coordinates
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
      
      const moderator = userRepository.create({
        email: moderatorEmail,
        password: hashedPassword,
        name: "Content Moderator",
        phone: "+923009876543",
        role: UserRole.MODERATOR,
        bio: "Content moderator for Neighbourly platform",
        latitude: 31.5204, // Lahore coordinates
        longitude: 74.3587,
        verified: true
      });

      await userRepository.save(moderator);
      console.log("✅ Created moderator user: moderator@neighbourly.com / moderator123");
    } else {
      console.log("⏭️  Moderator user already exists");
    }

    // Create test provider user
    const providerEmail = "provider@neighbourly.com";
    const existingProvider = await userRepository.findOne({ where: { email: providerEmail } });
    
    if (!existingProvider) {
      const hashedPassword = await bcrypt.hash("provider123", 10);
      
      const provider = userRepository.create({
        email: providerEmail,
        password: hashedPassword,
        name: "Test Provider",
        phone: "+923001111111",
        role: UserRole.PROVIDER,
        bio: "Test provider for creating services",
        latitude: 24.8607, // Karachi coordinates
        longitude: 67.0011,
        verified: true
      });

      await userRepository.save(provider);
      console.log("✅ Created provider user: provider@neighbourly.com / provider123");
    } else {
      console.log("⏭️  Provider user already exists");
    }

    console.log("\n🌟 Seeding completed successfully!");
    console.log("\n📋 Test Accounts:");
    console.log("Admin: admin@neighbourly.com / admin123");
    console.log("Moderator: moderator@neighbourly.com / moderator123");
    console.log("Provider: provider@neighbourly.com / provider123");
    
    await AppDataSource.destroy();
  } catch (error) {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  }
}

seed();