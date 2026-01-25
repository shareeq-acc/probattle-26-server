# Scaling Architecture Guide

## Current Setup Overview

Your application is **already configured for horizontal scaling** with the following architecture:

```
                    ┌─────────────────────┐
                    │   Nginx (Port 80)   │
                    │   Load Balancer     │
                    └──────────┬──────────┘
                               │
            ┌──────────────────┼──────────────────┐
            │                  │                  │
            ▼                  ▼                  ▼
    ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
    │   App 1      │   │   App 2      │   │   App 3      │
    │  (Port 5000) │   │  (Port 5000) │   │  (Port 5000) │
    └──────┬───────┘   └──────┬───────┘   └──────┬───────┘
           │                  │                  │
           └──────────────────┼──────────────────┘
                              │
            ┌─────────────────┴─────────────────┐
            │                                   │
            ▼                                   ▼
    ┌──────────────┐                   ┌──────────────┐
    │  PostgreSQL  │                   │    Redis     │
    │  (Port 5432) │                   │  (Port 6379) │
    └──────────────┘                   └──────────────┘
```

## Nginx Configuration ✅

**Location:** `server/nginx.conf`

### Key Features:

1. **Load Balancing**
   - Algorithm: `least_conn` (sends requests to server with fewest connections)
   - 3 backend servers configured
   - Health checks with automatic failover

2. **WebSocket Support**
   - Separate upstream with `ip_hash` for sticky sessions
   - Ensures WebSocket connections stay on same server
   - 24-hour timeout for long-lived connections

3. **Rate Limiting**
   - API endpoints: 100 requests/second
   - Auth endpoints: 10 requests/second (stricter)
   - Connection limit: 50 per IP

4. **Caching**
   - GET requests cached for 5 minutes
   - 1GB cache size
   - Cache headers included in responses

5. **Security**
   - Security headers (X-Frame-Options, X-XSS-Protection)
   - 10MB file upload limit
   - Gzip compression enabled

6. **Performance**
   - 4096 worker connections
   - epoll for efficient I/O
   - Optimized timeouts

## Docker Compose Setup ✅

**Location:** `server/docker-compose.yml`

### Current Configuration:

- **3 Application Instances** (app1, app2, app3)
- **1 Nginx Load Balancer**
- **1 PostgreSQL Database**
- **1 Redis Instance**

### How to Run:

```bash
# Start all services
docker-compose up -d

# Scale to more instances
docker-compose up -d --scale app1=2 --scale app2=2 --scale app3=2

# View logs
docker-compose logs -f

# Stop all services
docker-compose down
```

## Deployment Scenarios

### Scenario 1: Local Development (Single Instance)

**Use Case:** Development and testing

```bash
# Run single instance without Docker
cd server
npm run dev
```

**Resources:**
- 1 Node.js process
- Local PostgreSQL
- Local Redis

**Pros:** Simple, fast iteration
**Cons:** No load balancing, single point of failure

---

### Scenario 2: Docker Compose (3 Instances) ✅ CURRENT

**Use Case:** Small to medium production, staging environments

```bash
# Start with current configuration
docker-compose up -d
```

**Resources:**
- 3 Node.js instances
- 1 Nginx load balancer
- 1 PostgreSQL container
- 1 Redis container

**Pros:** 
- Load balancing
- High availability
- Easy to manage
- Cost-effective

**Cons:** 
- Single server limitation
- Shared resources

**Scaling:**
```bash
# Scale to 5 instances
docker-compose up -d --scale app1=2 --scale app2=2 --scale app3=1

# Scale to 10 instances
docker-compose up -d --scale app1=4 --scale app2=3 --scale app3=3
```

---

### Scenario 3: Render.com (Managed Platform)

**Use Case:** Production with minimal DevOps

**Architecture:**
```
Render Load Balancer (Automatic)
    ↓
Multiple Web Service Instances (Auto-scaling)
    ↓
External PostgreSQL + Redis
```

**Setup:**
1. Deploy using Dockerfile
2. Configure external PostgreSQL and Redis
3. Enable auto-scaling in Render dashboard

**Scaling Configuration:**
- Min instances: 1
- Max instances: 10
- Auto-scale triggers:
  - CPU > 70%
  - Memory > 80%
  - Request queue depth

**Pros:**
- Automatic scaling
- Zero-downtime deploys
- Built-in SSL
- Managed infrastructure

**Cons:**
- Platform lock-in
- Higher cost at scale

**See:** `RENDER_DEPLOYMENT.md` for detailed guide

---

### Scenario 4: Kubernetes (Enterprise Scale)

**Use Case:** Large-scale production, multi-region

**Architecture:**
```
Ingress Controller (Nginx/Traefik)
    ↓
Kubernetes Service (Load Balancer)
    ↓
Multiple Pods (Auto-scaling)
    ↓
External PostgreSQL + Redis Cluster
```

**Setup:**
```bash
# Create Kubernetes deployment
kubectl apply -f k8s/deployment.yml
kubectl apply -f k8s/service.yml
kubectl apply -f k8s/ingress.yml

# Enable horizontal pod autoscaling
kubectl autoscale deployment neighbourly-api \
  --cpu-percent=70 \
  --min=3 \
  --max=50
```

**Scaling:**
- Horizontal Pod Autoscaler (HPA)
- Vertical Pod Autoscaler (VPA)
- Cluster Autoscaler

**Pros:**
- Unlimited scaling
- Multi-region support
- Advanced orchestration
- Self-healing

**Cons:**
- Complex setup
- Requires Kubernetes expertise
- Higher operational overhead

---

### Scenario 5: AWS ECS/Fargate

**Use Case:** AWS-native deployment

**Architecture:**
```
Application Load Balancer
    ↓
ECS Service (Fargate Tasks)
    ↓
RDS PostgreSQL + ElastiCache Redis
```

**Setup:**
1. Push Docker image to ECR
2. Create ECS task definition
3. Create ECS service with ALB
4. Configure auto-scaling

**Scaling:**
- Target tracking (CPU/Memory)
- Step scaling
- Scheduled scaling

**Pros:**
- Serverless containers
- AWS integration
- Pay-per-use

**Cons:**
- AWS lock-in
- Cold start delays

---

## Scaling Strategies

### Horizontal Scaling (Add More Instances) ✅ IMPLEMENTED

**Current Implementation:**
- Nginx load balances across 3 instances
- Redis Pub/Sub synchronizes WebSocket messages
- Stateless application design

**How to Scale:**

**Docker Compose:**
```bash
# Scale to 5 instances
docker-compose up -d --scale app1=2 --scale app2=2 --scale app3=1

# Update nginx.conf to add more upstreams
upstream backend {
    least_conn;
    server app1:5000;
    server app2:5000;
    server app3:5000;
    server app4:5000;  # Add new instances
    server app5:5000;
}
```

**Render:**
- Dashboard → Service → Scaling
- Set min/max instances
- Enable auto-scaling

**Kubernetes:**
```bash
kubectl scale deployment neighbourly-api --replicas=10
```

**Benefits:**
- Linear performance improvement
- High availability
- No downtime during scaling

**Limitations:**
- Database becomes bottleneck
- Redis memory limits

---

### Vertical Scaling (Bigger Instances)

**When to Use:**
- Database queries are slow
- Memory-intensive operations
- CPU-bound tasks

**How to Scale:**

**Docker:**
```yaml
# docker-compose.yml
services:
  app1:
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 4G
        reservations:
          cpus: '1.0'
          memory: 2G
```

**Render:**
- Upgrade instance type (Starter → Standard → Pro)

**AWS:**
- Change instance type (t3.small → t3.large → t3.xlarge)

**Benefits:**
- Simple to implement
- Better for single-threaded workloads

**Limitations:**
- Upper limit on instance size
- More expensive
- Single point of failure

---

### Database Scaling

**Current Setup:**
- Single PostgreSQL instance
- Connection pooling (5-20 connections)

**Scaling Options:**

1. **Read Replicas**
   ```typescript
   // TypeORM configuration
   {
     replication: {
       master: { url: process.env.DATABASE_URL },
       slaves: [
         { url: process.env.DATABASE_READ_REPLICA_1 },
         { url: process.env.DATABASE_READ_REPLICA_2 }
       ]
     }
   }
   ```

2. **Connection Pooling**
   - Already implemented (5-20 connections)
   - Use PgBouncer for external pooling

3. **Sharding**
   - Partition by user ID or region
   - Requires application changes

4. **Managed Services**
   - AWS RDS with Multi-AZ
   - Google Cloud SQL
   - Azure Database for PostgreSQL

---

### Redis Scaling

**Current Setup:**
- Single Redis instance
- 512MB memory limit
- LRU eviction policy

**Scaling Options:**

1. **Increase Memory**
   ```yaml
   redis:
     command: redis-server --maxmemory 2gb
   ```

2. **Redis Cluster**
   - Multiple Redis nodes
   - Automatic sharding
   - High availability

3. **Redis Sentinel**
   - Master-slave replication
   - Automatic failover

4. **Managed Services**
   - Redis Cloud (recommended)
   - AWS ElastiCache
   - Azure Cache for Redis

---

## Performance Optimization

### 1. Caching Strategy ✅ IMPLEMENTED

**Current Implementation:**
- Redis caching for services, users, conversations
- Nginx caching for GET requests (5 minutes)
- Cache invalidation on updates

**Optimization:**
```typescript
// Increase cache TTL for static data
await RedisService.setJSON('services:all', services, 3600); // 1 hour

// Add cache warming
async function warmCache() {
  await loadPopularServices();
  await loadActiveUsers();
}
```

### 2. Database Optimization

**Add Indexes:**
```sql
-- Already implemented
CREATE INDEX idx_services_category ON services(category);
CREATE INDEX idx_services_location ON services USING GIST(location);
CREATE INDEX idx_messages_conversation ON messages(conversation_id);

-- Additional indexes
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_services_provider ON services(provider_id);
```

**Query Optimization:**
```typescript
// Use select specific fields
const users = await userRepo.find({
  select: ['id', 'name', 'email'], // Don't load all fields
  where: { role: 'provider' }
});

// Use pagination
const services = await serviceRepo.find({
  skip: (page - 1) * limit,
  take: limit
});
```

### 3. WebSocket Optimization ✅ IMPLEMENTED

**Current Implementation:**
- Redis Pub/Sub for cross-instance messaging
- IP hash for sticky sessions
- Connection pooling

**Optimization:**
- Implement heartbeat/ping-pong
- Compress messages
- Batch notifications

### 4. CDN for Static Assets ✅ IMPLEMENTED

**Current Implementation:**
- Cloudinary for images
- Automatic optimization
- Global CDN

**Additional:**
- Use Cloudinary transformations
- Lazy loading images
- WebP format

---

## Monitoring & Metrics

### Key Metrics to Monitor:

1. **Application Metrics**
   - Request rate (requests/second)
   - Response time (p50, p95, p99)
   - Error rate (%)
   - Active connections

2. **System Metrics**
   - CPU usage (%)
   - Memory usage (%)
   - Disk I/O
   - Network I/O

3. **Database Metrics**
   - Query time
   - Connection pool usage
   - Slow queries
   - Deadlocks

4. **Redis Metrics**
   - Memory usage
   - Hit rate
   - Evictions
   - Pub/Sub messages

### Monitoring Tools:

**Free/Open Source:**
- Prometheus + Grafana
- ELK Stack (Elasticsearch, Logstash, Kibana)
- Netdata

**Managed Services:**
- Datadog
- New Relic
- Sentry (error tracking)
- LogRocket

**Render Built-in:**
- CPU/Memory graphs
- Request logs
- Error tracking

---

## Load Testing

### Test Current Setup:

```bash
# Install Apache Bench
sudo apt-get install apache2-utils

# Test API endpoint
ab -n 10000 -c 100 http://localhost/api/services

# Test with authentication
ab -n 1000 -c 50 -H "Authorization: Bearer TOKEN" http://localhost/api/dashboard
```

### Expected Results (3 instances):

- **Throughput:** 1000-2000 requests/second
- **Response Time:** 50-200ms (p95)
- **Concurrent Users:** 5000-10000
- **WebSocket Connections:** 10000-30000

### Load Testing Tools:

- **Apache Bench (ab):** Simple HTTP testing
- **wrk:** Modern HTTP benchmarking
- **k6:** Scriptable load testing
- **Artillery:** Complex scenarios
- **Locust:** Python-based, distributed

---

## Cost Analysis

### Docker Compose (Self-Hosted)

**Server Requirements:**
- 4 CPU cores
- 8GB RAM
- 50GB SSD

**Monthly Cost:**
- DigitalOcean Droplet: $48/month
- AWS EC2 t3.large: $60/month
- Hetzner Cloud: $25/month

**Total:** $25-$60/month

---

### Render.com

**Configuration:**
- 3 Starter instances: $21/month
- PostgreSQL: $7/month
- Redis Cloud: Free

**Total:** $28/month (small scale)

**Scaling:**
- 10 Standard instances: $250/month
- PostgreSQL Pro: $95/month
- Redis Cloud: $10/month

**Total:** $355/month (medium scale)

---

### AWS (ECS + RDS + ElastiCache)

**Small Scale:**
- 3 Fargate tasks (0.5 vCPU, 1GB): $30/month
- RDS db.t3.small: $30/month
- ElastiCache t3.micro: $15/month

**Total:** $75/month

**Medium Scale:**
- 10 Fargate tasks (1 vCPU, 2GB): $200/month
- RDS db.t3.large: $150/month
- ElastiCache t3.small: $50/month

**Total:** $400/month

---

## Recommendations

### For Development:
✅ **Use:** Single instance (`npm run dev`)
- Fast iteration
- Easy debugging

### For Staging:
✅ **Use:** Docker Compose (3 instances)
- Test load balancing
- Verify scaling behavior
- Cost-effective

### For Small Production (<10k users):
✅ **Use:** Render.com (1-3 instances)
- Automatic scaling
- Managed infrastructure
- Low maintenance

### For Medium Production (10k-100k users):
✅ **Use:** Render.com (3-10 instances) or AWS ECS
- Auto-scaling
- High availability
- Better performance

### For Large Production (>100k users):
✅ **Use:** Kubernetes on AWS/GCP/Azure
- Unlimited scaling
- Multi-region
- Advanced features

---

## Quick Start Commands

### Local Development
```bash
npm run dev
```

### Docker Compose (3 instances)
```bash
docker-compose up -d
docker-compose logs -f
docker-compose down
```

### Scale to 5 instances
```bash
docker-compose up -d --scale app1=2 --scale app2=2 --scale app3=1
```

### Deploy to Render
```bash
# See RENDER_DEPLOYMENT.md
```

### Monitor
```bash
# View Nginx logs
docker-compose logs -f nginx

# View app logs
docker-compose logs -f app1 app2 app3

# Check Redis
docker-compose exec redis redis-cli INFO
```

---

## Summary

✅ **Nginx is configured** with load balancing, WebSocket support, and caching
✅ **Docker Compose is set up** with 3 application instances
✅ **Redis Pub/Sub** enables cross-instance communication
✅ **Horizontal scaling** is ready - just add more instances
✅ **Multiple deployment options** available (Docker, Render, AWS, K8s)

**Your application is production-ready and can scale from 1 to 1000+ instances!**
