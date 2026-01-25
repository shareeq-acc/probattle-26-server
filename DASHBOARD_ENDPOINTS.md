# Dashboard Endpoints Documentation

This document describes the dashboard endpoints for different user roles (seekers, providers, and both).

## Prerequisites

- User authentication is required for all endpoints
- Endpoints automatically adapt based on user role
- All endpoints use rate limiting

## Endpoints

### 1. GET /api/dashboard/seeker

Dashboard data specifically for users with `SEEKER` role.

**Authentication:** Required (Seeker role)

**Response:**
```json
{
  "stats": {
    "totalBookings": 5,
    "activeBookings": 2,
    "pendingRequests": 1,
    "reviewsGiven": 3
  },
  "upcomingAppointments": [
    {
      "id": "booking-uuid",
      "serviceId": "service-uuid",
      "requestedDate": "2024-01-15",
      "requestedTime": "10:00",
      "duration": 2,
      "totalPrice": 50.00,
      "status": "accepted",
      "service": {
        "id": "service-uuid",
        "title": "Math Tutoring",
        "category": "tutoring"
      },
      "provider": {
        "id": "provider-uuid",
        "name": "John Doe",
        "email": "john@example.com",
        "avatar": "avatar-url",
        "phone": "+1234567890"
      }
    }
  ],
  "pendingRequests": [
    {
      "id": "booking-uuid",
      "serviceId": "service-uuid",
      "requestedDate": "2024-01-20",
      "requestedTime": "14:00",
      "status": "pending",
      "service": {
        "title": "House Cleaning"
      },
      "provider": {
        "name": "Jane Smith"
      }
    }
  ]
}
```

### 2. GET /api/dashboard/provider

Dashboard data specifically for users with `PROVIDER` role.

**Authentication:** Required (Provider role)

**Response:**
```json
{
  "stats": {
    "activeServices": 3,
    "pendingRequests": 2,
    "completionRate": 95,
    "avgRating": 4.7
  },
  "activeServices": [
    {
      "id": "service-uuid",
      "title": "Math Tutoring",
      "category": "tutoring",
      "price": 25.00,
      "priceType": "hourly",
      "isActive": true,
      "views": 45,
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "incomingRequests": [
    {
      "id": "booking-uuid",
      "serviceId": "service-uuid",
      "requestedDate": "2024-01-15",
      "requestedTime": "10:00",
      "duration": 2,
      "totalPrice": 50.00,
      "status": "pending",
      "createdAt": "2024-01-10T00:00:00.000Z",
      "service": {
        "title": "Math Tutoring"
      },
      "seeker": {
        "id": "seeker-uuid",
        "name": "Alice Johnson",
        "email": "alice@example.com",
        "avatar": "avatar-url",
        "phone": "+1234567890"
      }
    }
  ]
}
```

### 3. GET /api/dashboard/both

Dashboard data for users with `BOTH` role (both seeker and provider).

**Authentication:** Required (Both role)

**Response:**
```json
{
  "stats": {
    "servicesOffered": 2,
    "servicesBooked": 3,
    "completionRate": 90,
    "totalActivities": 5
  },
  "myServices": [
    {
      "id": "service-uuid",
      "title": "Guitar Lessons",
      "category": "tutoring",
      "price": 30.00,
      "priceType": "hourly",
      "isActive": true,
      "views": 25
    }
  ],
  "incomingRequests": [
    {
      "id": "booking-uuid",
      "requestedDate": "2024-01-15",
      "requestedTime": "16:00",
      "status": "pending",
      "service": {
        "title": "Guitar Lessons"
      },
      "seeker": {
        "name": "Bob Wilson",
        "avatar": "avatar-url"
      }
    }
  ]
}
```

### 4. GET /api/dashboard/stats

General dashboard statistics that work for any user role. Automatically adapts based on user's role.

**Authentication:** Required (Any role)

**Response for SEEKER:**
```json
{
  "userRole": "seeker",
  "stats": {
    "asSeeker": {
      "totalBookings": 5,
      "activeBookings": 2,
      "pendingRequests": 1,
      "reviewsGiven": 3
    }
  }
}
```

**Response for PROVIDER:**
```json
{
  "userRole": "provider",
  "stats": {
    "asProvider": {
      "activeServices": 3,
      "pendingRequests": 2,
      "completionRate": 95,
      "avgRating": 4.7
    }
  }
}
```

**Response for BOTH:**
```json
{
  "userRole": "both",
  "stats": {
    "asSeeker": {
      "totalBookings": 3,
      "activeBookings": 1,
      "pendingRequests": 0,
      "reviewsGiven": 2
    },
    "asProvider": {
      "activeServices": 2,
      "pendingRequests": 1,
      "completionRate": 90,
      "avgRating": 4.5
    }
  }
}
```

## Data Definitions

### Stats Explanations

**For Seekers:**
- `totalBookings`: Total number of bookings made by the user
- `activeBookings`: Bookings that are accepted or completed
- `pendingRequests`: Bookings waiting for provider response
- `reviewsGiven`: Number of reviews the seeker has written

**For Providers:**
- `activeServices`: Number of active and approved services
- `pendingRequests`: Number of booking requests waiting for response
- `completionRate`: Percentage of accepted bookings that were completed
- `avgRating`: Average rating received from customers

**For Both Role:**
- `servicesOffered`: Number of active services as provider
- `servicesBooked`: Total bookings made as seeker
- `totalActivities`: Combined count of services offered and booked

### Upcoming Appointments

- Only shows future appointments (accepted bookings)
- Sorted by date and time (earliest first)
- Limited to 5 most recent items
- Includes full service and provider details

### Incoming Requests

- Shows pending booking requests for providers
- Sorted by creation date (newest first)
- Limited to 5 most recent items
- Includes seeker contact information

## Usage Examples

### Get seeker dashboard
```bash
GET /api/dashboard/seeker
Authorization: Bearer <seeker-jwt-token>
```

### Get provider dashboard
```bash
GET /api/dashboard/provider
Authorization: Bearer <provider-jwt-token>
```

### Get both role dashboard
```bash
GET /api/dashboard/both
Authorization: Bearer <both-jwt-token>
```

### Get adaptive stats
```bash
GET /api/dashboard/stats
Authorization: Bearer <any-jwt-token>
```

## Notes

- All endpoints automatically filter data based on the authenticated user
- Provider passwords are never included in responses
- Completion rate is calculated as: (completed bookings / total accepted bookings) * 100
- Average ratings are rounded to 1 decimal place
- Future appointments are filtered to only show dates >= today
- All monetary values are returned as numbers with 2 decimal precision