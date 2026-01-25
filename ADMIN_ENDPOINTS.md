# Admin Endpoints Documentation

This document describes the new admin endpoints for managing services.

## Prerequisites

- Admin authentication is required for all endpoints
- User must have `UserRole.ADMIN` role
- All endpoints use the existing `requireAdmin` middleware

## Endpoints

### 1. GET /api/admin/services

Get all services with average ratings and views, with sorting options. **Now includes all reviews for each service.**

**Authentication:** Admin only

**Query Parameters:**
- `page` (optional): Page number for pagination (default: 1)
- `limit` (optional): Number of services per page (default: 20, max: 100)
- `sortBy` (optional): Sorting option (default: 'lowest_rating')

**Available Sort Options:**
- `lowest_rating`: Services with lowest average ratings first (services with no ratings go to end)
- `highest_rating`: Services with highest average ratings first
- `most_views`: Services with most views first
- `least_views`: Services with least views first
- `newest`: Newest services first
- `oldest`: Oldest services first

**Response:**
```json
{
  "services": [
    {
      "id": "service-uuid",
      "title": "Service Title",
      "description": "Service description",
      "category": "tutoring",
      "price": 50.00,
      "priceType": "hourly",
      "isActive": true,
      "views": 25,
      "avgRating": 3.5,
      "reviewCount": 4,
      "reviews": [
        {
          "id": "rating-uuid",
          "score": 4,
          "review": "Great service!",
          "createdAt": "2024-01-01T00:00:00.000Z",
          "seeker": {
            "id": "seeker-uuid",
            "name": "John Doe",
            "avatar": "https://example.com/avatar.jpg"
          }
        }
      ],
      "provider": {
        "id": "provider-uuid",
        "name": "Provider Name",
        "email": "provider@example.com"
      },
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 50,
    "totalPages": 3
  },
  "sorting": {
    "sortBy": "lowest_rating",
    "availableSorts": ["lowest_rating", "highest_rating", "most_views", "least_views", "newest", "oldest"]
  }
}
```

### 2. PATCH /api/admin/services/:id/disable

Disable a specific service (admin only).

**Authentication:** Admin only

**Parameters:**
- `id`: Service UUID

**Response:**
```json
{
  "message": "Service disabled successfully",
  "service": {
    "id": "service-uuid",
    "title": "Service Title",
    "isActive": false,
    "provider": {
      "id": "provider-uuid",
      "name": "Provider Name",
      "email": "provider@example.com"
    }
  }
}
```

**Error Responses:**
- `404`: Service not found
- `400`: Service is already disabled

### 3. PATCH /api/admin/services/:id/enable

Enable a specific service (admin only).

**Authentication:** Admin only

**Parameters:**
- `id`: Service UUID

**Response:**
```json
{
  "message": "Service enabled successfully",
  "service": {
    "id": "service-uuid",
    "title": "Service Title",
    "isActive": true,
    "provider": {
      "id": "provider-uuid",
      "name": "Provider Name",
      "email": "provider@example.com"
    }
  }
}
```

**Error Responses:**
- `404`: Service not found
- `400`: Service is already enabled

## Database Changes

### Service Entity Updates

Added a new `views` field to track service view counts:

```typescript
@Column({ default: 0 })
views: number;
```

### View Tracking

The `GET /api/services/:id` endpoint now automatically increments the view count when a service is accessed.

## Usage Examples

### Get services sorted by lowest ratings
```bash
GET /api/admin/services?sortBy=lowest_rating&page=1&limit=10
```

### Get services with most views
```bash
GET /api/admin/services?sortBy=most_views
```

### Disable a service
```bash
PATCH /api/admin/services/service-uuid-here/disable
```

### Enable a service
```bash
PATCH /api/admin/services/service-uuid-here/enable
```

## Notes

- Services with no ratings are placed at the end when sorting by rating
- View counts are automatically incremented when users view service details
- Admin can both disable and enable services as needed
- All endpoints include proper error handling and validation
- Provider passwords are never included in responses