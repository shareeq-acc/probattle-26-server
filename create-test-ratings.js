// Script to create test ratings for testing admin endpoints
// Run with: node create-test-ratings.js

const { AppDataSource } = require('./dist/data-source');

async function createTestRatings() {
  try {
    console.log('🎯 Creating test ratings...\n');
    
    await AppDataSource.initialize();
    
    const ratingRepository = AppDataSource.getRepository('Rating');
    const bookingRepository = AppDataSource.getRepository('Booking');
    const serviceRepository = AppDataSource.getRepository('Service');
    const userRepository = AppDataSource.getRepository('User');
    
    // Get some services and users
    const services = await serviceRepository.find({ take: 3 });
    const users = await userRepository.find({ take: 5 });
    
    if (services.length === 0 || users.length === 0) {
      console.log('❌ No services or users found. Please create some first.');
      await AppDataSource.destroy();
      return;
    }
    
    console.log(`Found ${services.length} services and ${users.length} users`);
    
    // Check if ratings already exist
    const existingRatings = await ratingRepository.count();
    if (existingRatings > 0) {
      console.log(`⚠️  ${existingRatings} ratings already exist. Skipping creation.`);
      await AppDataSource.destroy();
      return;
    }
    
    // Create some test bookings and ratings
    const testRatings = [
      { score: 5, review: "Excellent service! Highly recommended." },
      { score: 4, review: "Good work, very professional." },
      { score: 3, review: "Average service, could be better." },
      { score: 2, review: "Not satisfied with the quality." },
      { score: 1, review: "Poor service, would not recommend." },
      { score: 5, review: "Amazing work! Will hire again." },
      { score: 4, review: "Great communication and timely delivery." },
      { score: 3, review: "Decent service but room for improvement." }
    ];
    
    let createdCount = 0;
    
    for (let i = 0; i < Math.min(testRatings.length, services.length * 3); i++) {
      const service = services[i % services.length];
      const seeker = users[i % users.length];
      const provider = await userRepository.findOne({ where: { id: service.providerId } });
      
      if (!provider || seeker.id === provider.id) continue;
      
      try {
        // Create a completed booking first
        const booking = await bookingRepository.save({
          serviceId: service.id,
          seekerId: seeker.id,
          providerId: provider.id,
          requestedDate: new Date().toISOString().split('T')[0],
          requestedTime: '10:00',
          duration: 2,
          status: 'completed',
          totalPrice: parseFloat(service.price) * 2
        });
        
        // Create rating for this booking
        const ratingData = testRatings[i];
        await ratingRepository.save({
          bookingId: booking.id,
          seekerId: seeker.id,
          providerId: provider.id,
          score: ratingData.score,
          review: ratingData.review
        });
        
        createdCount++;
        console.log(`✅ Created rating ${ratingData.score}/5 for "${service.title}" by ${seeker.name}`);
        
      } catch (error) {
        console.log(`❌ Failed to create rating for ${service.title}: ${error.message}`);
      }
    }
    
    console.log(`\n🎉 Created ${createdCount} test ratings!`);
    
    // Show summary
    const totalRatings = await ratingRepository.count();
    console.log(`📊 Total ratings in database: ${totalRatings}`);
    
    await AppDataSource.destroy();
    console.log('\n✅ Test data creation completed!');
    console.log('💡 Now try the GET /api/admin/services endpoint to see the ratings!');
    
  } catch (error) {
    console.error('❌ Error:', error);
    console.error('Stack:', error.stack);
  }
}

createTestRatings();