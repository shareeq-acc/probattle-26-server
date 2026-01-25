# Neighbourly Backend - National Scale Deployment

## Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js 20+ (for local development)
- PostgreSQL 15+ (if not using Docker)
- Redis 7+ (if not using Docker)
- RabbitMQ 3+ (if not using Docker)

### Installation

1. **Clone and Install Dependencies**
```bash
cd server
npm install
```

2. **Configure Environment**
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Start with Docker Compose (Recommended)**
```bash
# Start all services (Nginx, 3 app instances, PostgreSQL, Redis, RabbitMQ)
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

4. **Or Run Locally for Development**
```bash
# Make sure PostgreSQL, Redis, and RabbitMQ are running
npm run dev
```

## Architecture

```
                    ┌─────────────┐
                    │   Nginx     │
                    │Load Balancer│
                    └──────┬──────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
   ┌────▼────┐       ┌────▼────┐       ┌────▼────┐
   │  App 1  │       │  App 2  │       │  App 3  │
   │ Node.js │       │ Node.js │       │ Node.js │
   └────┬────┘       └────┬────┘       └────┬────┘
        │                  │                  │
        └──────────────────┼──────────────────┘
                           │
        ┌──────────────────┴──────────────────┐
        │                                     │
   ┌────▼────┐                          ┌────▼────┐
   │PostgreSQL│                         │  Redis  │
   │Database │                          │Cache+Pub│
   └─────────┘                          │  /Sub   │
                                        └─────────┘
```

## Key Features

### 🚀 High Performance
- **Load Balancing**: Nginx distributes traffic across 3+ instances
- **Caching**: Redis caches frequently accessed data
- **Connection Pooling**: Optimized database connections (5-20 per instance)
- **Horizontal Scaling**: Add more instances as needed

### 💬 Real-Time Messaging
- **WebSocket**: Instant bidirectional communication
- **Redis Pub/Sub**: Message broadcasting and offline storage
- **Persistence**: Messages stored in PostgreSQL
- **Notifications**: Push notifications for offline users

### 📊 Monitoring & Health
- Health check endpoint: `GET /health`
- Redis status monitoring
- WebSocket connection tracking
- Request rate limiting

## API Endpoints

### Core Services
- `GET /api/services` - List services (cached)
- `GET /api/services/:id` - Get service details (cached)
- `POST /api/services` - Create service (invalidates cache)
- `PUT /api/services/:id` - Update service (invalidates cache)

### Real-Time Messaging
- `GET /api/messages/conversations` - Get all conversations
- `GET /api/messages/conversation/:userId` - Get messages with user
- `POST /api/messages/read/:messageId` - Mark as read
- `GET /api/messages/unread-count` - Unread count

### WebSocket Events
```javascript
// Connect with authentication
const socket = io('http://localhost', {
  auth: { token: 'your-jwt-token' }
});

// Send message
socket.emit('send_message', {
  receiverId: 123,
  message: 'Hello!',
  conversationId: 'conv-123'
});

// Receive message
socket.on('new_message', (data) => {
  console.log('New message:', data);
});

// Typing indicator
socket.emit('typing', { receiverId: 123, isTyping: true });
socket.on('user_typing', (data) => {
  console.log('User typing:', data);
});

// Read receipt
socket.emit('message_read', { messageId: 456, senderId: 123 });
socket.on('message_read', (data) => {
  console.log('Message read:', data);
});
```

## Scaling

### Add More Instances
```bash
# Scale to 5 instances each
docker-compose up -d --scale app1=5 --scale app2=5 --scale app3=5
```

### Adjust Resources
Edit `docker-compose.yml`:
```yaml
services:
  app1:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
```

### Database Optimization
- Add indexes on frequently queried fields
- Use read replicas for read-heavy operations
- Consider connection pooling adjustments

### Cache Tuning
- Adjust TTL values in `middleware/cache.ts`
- Monitor cache hit rates
- Increase Redis memory if needed

## Performance Benchmarks

### Expected Performance (3 instances)
- **Concurrent Users**: 10,000+
- **Requests/Second**: 5,000+
- **WebSocket Connections**: 15,000+
- **Message Latency**: <50ms
- **API Response Time**: <100ms (cached), <500ms (uncached)

### Load Testing
```bash
# Install Apache Bench
apt-get install apache2-utils

# Test API endpoint
ab -n 10000 -c 100 http://localhost/api/services

# Test with authentication
ab -n 10000 -c 100 -H "Authorization: Bearer YOUR_TOKEN" http://localhost/api/services
```

## Monitoring

### Check Service Health
```bash
# Overall health
curl http://localhost/health

# Redis status
docker-compose exec redis redis-cli ping

# View logs
docker-compose logs -f app1
docker-compose logs -f nginx
docker-compose logs -f redis
```

### Metrics to Monitor
- Request rate and latency
- Error rates (4xx, 5xx)
- Cache hit/miss ratio
- Database connection pool usage
- Queue depth
- WebSocket connections
- Memory and CPU usage

## Troubleshooting

### Services Won't Start
```bash
# Check logs
docker-compose logs

# Restart services
docker-compose restart

# Rebuild images
docker-compose build --no-cache
docker-compose up -d
```

### Database Connection Issues
```bash
# Check PostgreSQL is running
docker-compose ps postgres

# Check connection
docker-compose exec postgres psql -U postgres -d neighbourly

# Reset database
docker-compose down -v
docker-compose up -d
```

### Redis Connection Issues
```bash
# Check Redis is running
docker-compose ps redis

# Test connection
docker-compose exec redis redis-cli ping

# Clear cache
docker-compose exec redis redis-cli FLUSHALL
```

### WebSocket Not Connecting
1. Check Nginx configuration for WebSocket upgrade headers
2. Verify JWT token is valid
3. Check CORS settings
4. Review browser console for errors

## Production Deployment

### AWS Deployment
1. Use ECS/EKS for container orchestration
2. RDS for PostgreSQL
3. ElastiCache for Redis
4. Amazon MQ for RabbitMQ
5. ALB for load balancing
6. CloudWatch for monitoring

### Google Cloud Deployment
1. Use GKE for Kubernetes
2. Cloud SQL for PostgreSQL
3. Memorystore for Redis
4. Cloud Pub/Sub (alternative to RabbitMQ)
5. Cloud Load Balancing
6. Cloud Monitoring

### Security Checklist
- [ ] Use HTTPS/TLS
- [ ] Secure environment variables
- [ ] Enable firewall rules
- [ ] Implement rate limiting
- [ ] Regular security updates
- [ ] Database backups
- [ ] Monitor for suspicious activity

## Development

### Run Tests
```bash
npm test
```

### Build for Production
```bash
npm run build
npm start
```

### Database Migrations
```bash
# Run migrations
npm run migrate

# Seed database
npm run seed
```

## Support

For detailed documentation, see:
- [SCALING_GUIDE.md](./SCALING_GUIDE.md) - Comprehensive scaling guide
- [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) - API reference

## License
MIT
