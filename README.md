# Neighbourly API - Stage 2: Urban Expansion

Enhanced neighbourhood marketplace API with multi-city support, geospatial search, image uploads, and advanced moderation features.

## 🚀 New Features in Stage 2

- **Multi-city Support**: Services organized by cities with geospatial coordinates
- **H3 Geospatial Search**: Fast radius-based service discovery using Uber's H3 library
- **Image Uploads**: Avatar and service image support with local storage
- **Enhanced Authentication**: JWT access/refresh token mechanism
- **Role-Based Access Control**: Seeker, Provider, Moderator, Admin roles
- **Service Moderation**: Approval workflow for new services
- **Rate Limiting**: API throttling for security
- **Reports System**: User reporting for content moderation
- **Admin Dashboard**: Analytics and user management

## 📋 Prerequisites

- Node.js 16+ 
- PostgreSQL database
- npm or yarn

## 🛠️ Installation

1. **Clone and navigate to server directory:**
   ```bash
   cd server
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up PostgreSQL database:**
   - Create a new PostgreSQL database named `neighbourly`
   - Update the `DATABASE_URL` in `.env` file

4. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```
   
   Update `.env` with your settings:
   ```env
   DATABASE_URL=postgresql://username:password@localhost:5432/neighbourly
   JWT_ACCESS_SECRET=your_access_token_secret_here
   JWT_REFRESH_SECRET=your_refresh_token_secret_here
   ```

5. **Seed the database:**
   ```bash
   npm run seed
   ```

6. **Start the development server:**
   ```bash
   npm run dev
   ```

The API will be available at `http://localhost:5000`

## 🧪 Testing

1. **Open the test interface:**
   - Navigate to `http://localhost:5000/test-api-stage2.html`
   - Or use the API documentation at `/API_DOCUMENTATION.md`

2. **Test accounts (created by seed script):**
   - **Admin**: `admin@neighbourly.com` / `admin123`
   - **Moderator**: `moderator@neighbourly.com` / `moderator123`

## 📚 API Documentation

See [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) for complete endpoint documentation.

## 🏗️ Architecture Changes from Stage 1

### Database Migration
- **FROM**: SQLite with local file
- **TO**: PostgreSQL with connection URL
- **New Tables**: City, Report, RefreshToken
- **Enhanced Tables**: User (avatar, location, role), Service (images, geospatial, approval)

### Authentication Enhancement
- **Access Tokens**: Short-lived (15 minutes)
- **Refresh Tokens**: Long-lived (7 days), stored in database
- **Role-based permissions**: Different access levels

### File Upload System
- **Local Storage**: Images stored in `uploads/` directory
- **Avatar Support**: User profile pictures
- **Service Images**: Up to 5 images per service
- **File Validation**: Type and size restrictions

### Geospatial Features
- **H3 Spatial Indexing**: Fast geospatial queries
- **Radius Search**: Find services within specified distance
- **Distance Calculation**: Haversine formula for accurate distances

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `JWT_ACCESS_SECRET` | Secret for access tokens | Required |
| `JWT_REFRESH_SECRET` | Secret for refresh tokens | Required |
| `JWT_ACCESS_EXPIRES_IN` | Access token expiry | 15m |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token expiry | 7d |
| `UPLOAD_DIR` | Upload directory | uploads |
| `MAX_FILE_SIZE` | Max file size in bytes | 5242880 (5MB) |
| `H3_RESOLUTION` | H3 spatial resolution | 9 |
| `RATE_LIMIT_MAX_REQUESTS` | Rate limit per window | 100 |

### File Upload Limits
- **Max file size**: 5MB
- **Allowed types**: JPEG, PNG, WebP
- **Avatar**: 1 file per user
- **Service images**: Up to 5 files per service

## 🛡️ Security Features

- **Rate Limiting**: Prevents API abuse
- **JWT Tokens**: Secure authentication
- **File Validation**: Prevents malicious uploads
- **Role-based Access**: Granular permissions
- **Input Validation**: Prevents injection attacks

## 📊 User Roles

| Role | Permissions |
|------|-------------|
| **Seeker** | Book services, report content |
| **Provider** | Create services, manage bookings |
| **Both** | All seeker + provider permissions |
| **Moderator** | Review services, manage reports |
| **Admin** | Full system access, user management |

## 🗂️ Project Structure

```
server/
├── src/
│   ├── entities/          # TypeORM entities
│   │   ├── User.ts
│   │   ├── Service.ts
│   │   ├── Booking.ts
│   │   ├── City.ts
│   │   ├── RefreshToken.ts
│   │   └── Report.ts
│   ├── routes/            # API routes
│   │   ├── auth.ts
│   │   ├── users.ts
│   │   ├── services.ts
│   │   ├── cities.ts
│   │   ├── moderation.ts
│   │   ├── reports.ts
│   │   └── admin.ts
│   ├── middleware/        # Express middleware
│   │   ├── auth.ts
│   │   ├── upload.ts
│   │   └── rateLimiter.ts
│   ├── utils/             # Utility functions
│   │   ├── jwt.ts
│   │   └── spatial.ts
│   ├── data-source.ts     # Database configuration
│   ├── server.ts          # Main server file
│   └── seed.ts            # Database seeding
├── uploads/               # File upload directory
├── .env                   # Environment variables
├── package.json
└── README.md
```

## 🚀 Deployment

### Production Checklist

1. **Environment Variables:**
   - Set strong JWT secrets
   - Configure production database URL
   - Set `NODE_ENV=production`

2. **Database:**
   - Run migrations in production
   - Set up database backups

3. **File Storage:**
   - Consider cloud storage (AWS S3, Cloudinary) for production
   - Set up CDN for image delivery

4. **Security:**
   - Enable SSL/HTTPS
   - Configure CORS for your domain
   - Set up monitoring and logging

## 🔄 Migration from Stage 1

If you have an existing Stage 1 installation:

1. **Backup your SQLite data** (if needed)
2. **Set up PostgreSQL database**
3. **Update dependencies** with `npm install`
4. **Run the seed script** to populate initial data
5. **Update your frontend** to use new API endpoints

## 🐛 Troubleshooting

### Common Issues

1. **Database Connection Failed:**
   - Check PostgreSQL is running
   - Verify DATABASE_URL format
   - Ensure database exists

2. **File Upload Errors:**
   - Check upload directory permissions
   - Verify file size limits
   - Ensure allowed file types

3. **JWT Token Issues:**
   - Check JWT secrets are set
   - Verify token expiry settings
   - Clear browser localStorage

### Debug Mode

Enable detailed logging:
```env
NODE_ENV=development
```

## 📈 Performance

### Optimizations Included

- **H3 Spatial Indexing**: Fast geospatial queries
- **Database Indexes**: Optimized query performance
- **Rate Limiting**: Prevents abuse
- **Pagination**: Efficient data loading
- **File Size Limits**: Prevents storage issues

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the ISC License.

## 🆘 Support

For issues and questions:
1. Check the troubleshooting section
2. Review the API documentation
3. Create an issue in the repository

---

**Stage 2 Complete!** 🎉 Your neighbourhood marketplace now supports multi-city operations with advanced features.