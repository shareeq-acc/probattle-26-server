# Neighbourly - Neighborhood Marketplace Backend

A Node.js + Express + TypeORM backend API for a neighborhood marketplace where users can offer and book local services.

## Features

- User authentication with JWT
- Service listings with categories
- Booking system with status management
- Self-booking prevention
- Time slot conflict detection
- Role-based access (provider, seeker, both)

## Tech Stack

- Node.js & Express
- TypeScript
- TypeORM with SQLite
- JWT authentication
- bcryptjs for password hashing

## Setup Instructions

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables:
Edit `.env` file and update `JWT_SECRET` with a secure random string.

3. Run the development server:
```bash
npm run dev
```

The server will start on `http://localhost:3000`

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user

### Users
- `GET /api/users/me` - Get current user (protected)

### Services
- `POST /api/services` - Create service (protected)
- `GET /api/services` - List all services (with filters)
- `GET /api/services/:id` - Get single service

### Bookings
- `POST /api/bookings` - Create booking (protected)
- `GET /api/bookings/my-bookings` - Get user's bookings (protected)
- `GET /api/bookings/:id` - Get single booking (protected)
- `PUT /api/bookings/:id/accept` - Accept booking (provider only)
- `PUT /api/bookings/:id/reject` - Reject booking (provider only)
- `PUT /api/bookings/:id/complete` - Complete booking (provider only)
- `PUT /api/bookings/:id/cancel` - Cancel booking (seeker only)

## Database

SQLite database file (`database.sqlite`) will be created automatically on first run.

## Build for Production

```bash
npm run build
npm start
```
