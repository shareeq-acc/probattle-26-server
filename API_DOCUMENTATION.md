# Neighbourly API Stage 2 Documentation

## Overview
Enhanced neighbourhood marketplace API with multi-city support, geospatial search, image uploads, and advanced moderation features.

## Base URL
```
http://localhost:5000/api
```

## Authentication
The API uses JWT tokens with access/refresh token mechanism:
- **Access Token**: Short-lived (15 minutes), used for API requests
- **Refresh Token**: Long-lived (7 days), used to get new access tokens

### Headers
```
Authorization: Bearer <access_token>
```

## Rate Limiting
- General endpoints: 100 requests per 15 minutes
- Auth endpoints: 5 requests per 15 minutes  
- Upload endpoints: 10 requests per hour

## File Uploads
- **Max file size**: 5MB
- **Allowed types**: JPEG, PNG, WebP
- **Avatar uploads**: Single file
- **Service images**: Up to 5 files

---

## Authentication Endpoints

### POST /auth/register
Register a new user account.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "name": "John Doe",
  "phone": "+1234567890",
  "role": "seeker",
  "bio": "Looking for local services",
  "cityId": "city-uuid",
  "latitude": 40.7128,
  "longitude": -74.0060
}
```

**Response:**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "seeker",
    "avatar": null,
    "verified": false
  },
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc..."
}
```

### POST /auth/login
Login with email and password.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:** Same as register

### POST /auth/refresh
Get new access token using refresh token.

**Request:**
```json
{
  "refreshToken": "eyJhbGc..."
}
```

**Response:**
```json
{
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc..."
}
```

### POST /auth/logout
Logout and revoke refresh token.

**Request:**
```json
{
  "refreshToken": "eyJhbGc..."
}
```

---

## User Endpoints

### GET /users/me
Get current user profile. **[Protected]**

**Response:**
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "name": "John Doe",
  "phone": "+1234567890",
  "bio": "Looking for local services",
  "avatar": "http://localhost:5000/uploads/avatars/avatar-123.jpg",
  "role": "seeker",
  "cityId": "city-uuid",
  "city": {
    "id": "uuid",
    "name": "New York"
  },
  "latitude": 40.7128,
  "longitude": -74.0060,
  "verified": false,
  "createdAt": "2024-01-01T00:00:00Z"
}
```

### PUT /users/me
Update user profile. **[Protected]**

**Request:**
```json
{
  "name": "John Updated",
  "phone": "+9876543210",
  "bio": "New bio",
  "cityId": "city-uuid",
  "latitude": 40.7128,
  "longitude": -74.0060
}
```

### PUT /users/me/avatar
Upload user avatar. **[Protected]**

**Request:** Multipart form-data
- Field: `avatar` (file)

**Response:**
```json
{
  "avatar": "http://localhost:5000/uploads/avatars/avatar-1234567890.jpg"
}
```

### DELETE /users/me/avatar
Delete user avatar. **[Protected]**

---

## Cities Endpoints

### GET /cities
Get all active cities.

**Response:**
```json
{
  "cities": [
    {
      "id": "uuid",
      "name": "New York",
      "state": "NY",
      "country": "USA",
      "latitude": 40.7128,
      "longitude": -74.0060,
      "isActive": true
    }
  ]
}
```

### GET /cities/:id
Get city details with service count.

### POST /cities
Create new city. **[Admin only]**

---

## Services Endpoints

### GET /services
Search services with geospatial and filters.

**Query Parameters:**
- `lat` (number) - User's latitude for radius search
- `lng` (number) - User's longitude for radius search  
- `radius` (number: 5,10,25,50) - Search radius in km
- `cityId` (string) - Filter by city
- `category` (string) - Filter by category
- `search` (string) - Search in title/description
- `minPrice` (number) - Minimum price
- `maxPrice` (number) - Maximum price
- `priceType` (string) - hourly/fixed/daily
- `page` (number, default: 1)
- `limit` (number, default: 20, max: 100)

**Example:**
```
GET /services?lat=40.7128&lng=-74.0060&radius=10&category=tutoring&page=1&limit=20
```

**Response:**
```json
{
  "services": [
    {
      "id": "uuid",
      "title": "Math Tutoring",
      "description": "Expert math tutoring...",
      "category": "tutoring",
      "price": 35.00,
      "priceType": "hourly",
      "latitude": 40.7500,
      "longitude": -73.9800,
      "distance": 2.5,
      "images": [
        "http://localhost:5000/uploads/services/service-123.jpg"
      ],
      "approvalStatus": "approved",
      "provider": {
        "id": "uuid",
        "name": "Sarah Johnson",
        "avatar": "...",
        "verified": true
      },
      "city": {
        "id": "uuid",
        "name": "New York"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

### POST /services
Create new service. **[Provider/Both role required]**

**Request:** Multipart form-data
- `title` (string, required)
- `description` (string, required)
- `category` (string, required)
- `price` (number, required)
- `priceType` (string, required)
- `availability` (JSON string: ["Monday", "Tuesday"])
- `location` (string, required)
- `latitude` (number, required)
- `longitude` (number, required)
- `cityId` (string, required)
- `images` (files, optional, max 5)

### PUT /services/:id
Update service. **[Protected - Owner only]**

### DELETE /services/:id/images
Delete specific service image. **[Protected - Owner only]**

**Request:**
```json
{
  "imageUrl": "http://localhost:5000/uploads/services/service-123.jpg"
}
```

---

## Moderation Endpoints

### GET /moderation/services/pending
Get pending services for review. **[Moderator/Admin only]**

### PUT /moderation/services/:id/approve
Approve pending service. **[Moderator/Admin only]**

### PUT /moderation/services/:id/reject  
Reject pending service. **[Moderator/Admin only]**

---

## Reports Endpoints

### POST /reports
Report a service or user. **[Protected]**

**Request:**
```json
{
  "reportedEntityType": "service",
  "reportedEntityId": "service-uuid",
  "reason": "spam",
  "description": "This service is fake"
}
```

### GET /reports
Get all reports. **[Moderator/Admin only]**

### PUT /reports/:id/review
Review a report. **[Moderator/Admin only]**

---

## Admin Endpoints

### GET /admin/users
Get all users with filters. **[Admin only]**

### PUT /admin/users/:id/role
Change user role. **[Admin only]**

### GET /admin/analytics
Get platform analytics. **[Admin only]**

**Response:**
```json
{
  "totalUsers": 5432,
  "usersByRole": {
    "seeker": 3000,
    "provider": 1500,
    "both": 900,
    "moderator": 30,
    "admin": 2
  },
  "totalServices": 3210,
  "servicesByStatus": {
    "pending": 45,
    "approved": 3000,
    "rejected": 165
  },
  "servicesByCategory": {
    "tutoring": 450,
    "repair": 320,
    "cleaning": 280
  },
  "totalBookings": 8765,
  "bookingsByStatus": {
    "pending": 120,
    "accepted": 300,
    "completed": 8200,
    "cancelled": 145
  },
  "usersByCity": {
    "New York": 2000,
    "Los Angeles": 1500,
    "Chicago": 1200
  }
}
```

---

## Error Responses

All endpoints return errors in this format:
```json
{
  "error": "Error message description"
}
```

**Common HTTP Status Codes:**
- `400` - Bad Request (validation errors)
- `401` - Unauthorized (missing/invalid token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `429` - Too Many Requests (rate limit exceeded)
- `500` - Internal Server Error

---

## User Roles

- **SEEKER**: Default role, can book services
- **PROVIDER**: Can create services
- **BOTH**: Can both seek and provide services
- **MODERATOR**: Can review and approve content
- **ADMIN**: Full system access

---

## Service Categories

- tutoring
- repair  
- cleaning
- gardening
- tech-support
- pet-care
- delivery
- handyman
- cooking
- fitness
- other

---

## Getting Started

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up PostgreSQL database and update .env:**
   ```env
   DATABASE_URL=postgresql://username:password@localhost:5432/neighbourly
   ```

3. **Run database migrations:**
   ```bash
   npm run seed
   ```

4. **Start development server:**
   ```bash
   npm run dev
   ```

5. **Test with provided accounts:**
   - Admin: `admin@neighbourly.com` / `admin123`
   - Moderator: `moderator@neighbourly.com` / `moderator123`