// Debug script to check ratings and bookings data
// Run with: node debug-ratings.js

const { AppDataSource } = require('./dist/data-source');

async function debugRatings() {
  try {
    console.log('🔍 Debugging ratings and bookings...\n');
    
    await AppDataSource.initialize();
    
    const ratingRepository = AppDataSource.getRepository('Rating');
    const bookingRepository = AppDataSource.getRepository('Booking');
    const serviceRepository = AppDataSource.getRepository('Service');
    
    // Check total counts
    const totalRatings = await ratingRepository.count();
    const totalBookings = await bookingRepository.count();
    const totalServices = await serviceRepository.count();
    
    console.log('📊 Database Counts:');
    console.log(`   Services: ${totalServices}`);
    console.log(`   Bookings: ${totalBookings}`);
    console.log(`   Ratings: ${totalRatings}\n`);
    
    if (totalRatings === 0) {
      console.log('⚠️  No ratings found in database!');
      console.log('💡 Run "node create-test-ratings.js" to create some test data.\n');
    }
    
    if (totalBookings > 0) {
      // Check booking statuses
      const bookingsByStatus = await bookingRepository
        .createQueryBuilder('booking')
        .select('booking.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .groupBy('booking.status')
        .getRawMany();
      
      console.log('📋 Bookings by Status:');
      bookingsByStatus.forEach(item => {
        console.log(`   ${item.status}: ${item.count}`);
      });
      console.log();
    }
    
    if (totalRatings > 0) {
      // Test the actual query used in admin endpoint
      console.log('🧪 Testing Admin Query...');
      const services = await serviceRepository.find({ take: 3 });
      const serviceIds = services.map(s => s.id);
      
      if (serviceIds.length > 0) {
        console.log(`Testing with service IDs: ${serviceIds.join(', ')}\n`);
        
        // Test rating statistics query
        const ratingsData = await ratingRepository
          .createQueryBuilder("rating")
          .leftJoin("rating.booking", "booking")
          .select([
            "booking.serviceId as serviceId",
            "AVG(rating.score)::decimal as avgRating",
            "COUNT(rating.id)::int as reviewCount"
          ])
          .where("booking.serviceId IN (:...serviceIds)", { serviceIds })
          .groupBy("booking.serviceId")
          .getRawMany();
        
        console.log('📊 Rating Statistics:');
        if (ratingsData.length === 0) {
          console.log('   No rating statistics found for these services');
        } else {
          ratingsData.forEach(result => {
            const service = services.find(s => s.id === result.serviceId);
            console.log(`   "${service?.title}": ${result.reviewCount} ratings, avg ${parseFloat(result.avgRating || 0).toFixed(1)}/5`);
          });
        }
        
        // Test reviews query
        const reviewsData = await ratingRepository
          .createQueryBuilder("rating")
          .leftJoin("rating.booking", "booking")
          .leftJoin("rating.seeker", "seeker")
          .select([
            "rating.id as ratingId",
            "rating.score as score",
            "rating.review as reviewText",
            "rating.createdAt as createdAt",
            "booking.serviceId as serviceId",
            "seeker.name as seekerName"
          ])
          .where("booking.serviceId IN (:...serviceIds)", { serviceIds })
          .orderBy("rating.createdAt", "DESC")
          .getRawMany();
        
        console.log('\n📝 Reviews Data:');
        if (reviewsData.length === 0) {
          console.log('   No reviews found for these services');
        } else {
          reviewsData.forEach(review => {
            const service = services.find(s => s.id === review.serviceId);
            console.log(`   "${service?.title}": ${review.score}/5 by ${review.seekerName} - "${review.reviewText}"`);
          });
        }
      }
    }
    
    await AppDataSource.destroy();
    console.log('\n✅ Debug completed!');
    
  } catch (error) {
    console.error('❌ Error:', error);
    console.error('Stack:', error.stack);
  }
}

debugRatings();