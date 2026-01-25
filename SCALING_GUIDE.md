# Neighbourly Backend - National Scale Architecture

## Overview
This backend is designed to support thousands of concurrent operations with real-time messaging, caching, load balancing, and horizontal scaling capabilities.

## Architecture Components

### 1. **Load Balancer (Nginx)**
- Distributes traffic across multiple application instances
- Handles SSL termination
- Implements rate limiting at the edge
- Caches static responses
- Sticky sessions for WebSocket connections

### 2. **Application Instances (Node.js/Express)**
- Multiple instances running behind Nginx
- Stateless design for horizontal scaling
- WebSocket support for real-time messaging
- Connection pooling for database

### 3. **Redis Cache & Pub/Sub**
- Caches frequently accessed data (services, categories, neighborhoods)
- Pub/Sub for real-time events and messaging
- Session storage
- Rate limiting counters
- TTL-based cache invalidation
- **Replaces RabbitMQ** for message queuing

### 4. **PostgreSQL Database**
- Connection pooling (5-20 connections per instance)
- Indexed queries for performance
- Geospatial indexing with H3
- Read replicas (recommended for production)

### 6. **WebSocket Server (Socket.IO)**
- Real-time bidirectional communication
- Authentication middleware
- Room-based messaging
- Automatic reconnection
- Fallback to polling

## Features

### Real-Time Messaging
- Instant message delivery
- Typing indicators
- Read receipts
- Online/offline status
- Message persistence via Redis Pub/Sub

### Caching Strategy
- **Service Listings**: 5 minutes TTL
- **Service Details**: 10 minutes TTL
- **User Profiles**: 10 minutes TTL
- **Categories**: 1 hour TTL
- **Neighborhood Data**: 5 minutes TTL

### Load Balancing
- Round-robin distribution
- Health checks
- Automatic failover
- Session affinity for WebSockets

## Deployment

### Local Development
```bash
# Install dependencies
npm install

# Start services with Docker Compose
docker-compose up

# Run in development mode
npm run dev
```

### Production Deployment

#### Option 1: Docker Compose (Recommended)
```bash
# Build and start all services
docker-compose up -d

# Scale application instances
docker-compose up -d --scale app1=3 --scale app2=3 --scale app3=3

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

#### Option 2: Kubernetes (Advanced)
See `k8s/` directory for Kubernetes manifests (to be created).

### Environment Variables
Copy `.env.example` to `.env` and configure:
- Database connection
- Redis URL
- RabbitMQ URL
- JWT secrets
- Cloudinary credentials
- API keys

## Performance Optimization

### Database
- Use connection pooling (configured in `data-source.ts`)
- Create indexes on frequently queried fields
- Use read replicas for read-heavy operations
- Implement database sharding for extreme scale

### Caching
- Cache frequently accessed data
- Invalidate cache on updates
- Use cache-aside pattern
- Monitor cache hit rates

### Message Queue
- Process messages asynchronously via Redis Pub/Sub
- Store offline messages in Redis lists
- Monitor channel subscriptions
- Scale subscribers based on message volume

### Load Balancing
- Use least connections algorithm
- Implement health checks
- Configure timeouts appropriately
- Use sticky sessions for WebSockets

## Monitoring

### Key Metrics
- Request rate and latency
- Error rates
- Cache hit/miss ratio
- Redis Pub/Sub channel activity
- Database connection pool usage
- WebSocket connections
- Memory and CPU usage

### Recommended Tools
- **Prometheus**: Metrics collection
- **Grafana**: Visualization
- **ELK Stack**: Log aggregation
- **New Relic/DataDog**: APM

## Scaling Guidelines

### Horizontal Scaling
```bash
# Add more application instances
docker-compose up -d --scale app1=5 --scale app2=5 --scale app3=5
```

### Vertical Scaling
- Increase container resources in `docker-compose.yml`
- Adjust database connection pool size
- Increase Redis memory limit

### Database Scaling
- Add read replicas
- Implement connection pooling
- Use database sharding
- Consider managed database services (AWS RDS, Google Cloud SQL)

### Cache Scaling
- Use Redis Cluster for distributed caching
- Implement cache warming strategies
- Monitor and adjust TTL values

## API Endpoints

### Messaging
- `GET /api/messages/conversations` - Get all conversations
- `GET /api/messages/conversation/:userId` - Get conversation with user
- `POST /api/messages/read/:messageId` - Mark message as read
- `GET /api/messages/unread-count` - Get unread message count

### WebSocket Events
- `send_message` - Send a message
- `new_message` - Receive a message
- `typing` - Typing indicator
- `user_typing` - Receive typing indicator
- `message_read` - Message read receipt

## Security

### Rate Limiting
- API endpoints: 100 req/s per IP
- Auth endpoints: 10 req/s per IP
- Configurable in `nginx.conf`

### Authentication
- JWT-based authentication
- Refresh token rotation
- WebSocket authentication middleware

### Data Protection
- HTTPS/TLS encryption
- Secure headers
- Input validation
- SQL injection prevention

## Troubleshooting

### High Latency
1. Check database query performance
2. Monitor cache hit rates
3. Review Nginx logs
4. Check network latency

### Message Delivery Issues
1. Verify Redis is running and connected
2. Check Redis Pub/Sub subscriptions
3. Review subscriber logs
4. Verify WebSocket connections
5. Check offline message storage in Redis

### Cache Issues
1. Check Redis connectivity
2. Monitor memory usage
3. Review TTL settings
4. Check cache invalidation logic

## Best Practices

1. **Stateless Design**: Keep application instances stateless
2. **Graceful Shutdown**: Handle SIGTERM signals properly
3. **Health Checks**: Implement comprehensive health checks
4. **Logging**: Use structured logging
5. **Monitoring**: Monitor all critical metrics
6. **Testing**: Load test before production deployment
7. **Backups**: Regular database and Redis backups
8. **Documentation**: Keep API documentation updated

## Future Enhancements

- [ ] Kubernetes deployment manifests
- [ ] Auto-scaling based on metrics
- [ ] Multi-region deployment
- [ ] CDN integration
- [ ] Advanced analytics
- [ ] Push notifications (FCM/APNs)
- [ ] Video/voice calling
- [ ] File sharing in messages
- [ ] Message encryption

## Support

For issues or questions, please refer to:
- API Documentation: `/api/docs`
- GitHub Issues: [repository-url]
- Team Contact: [contact-info]
