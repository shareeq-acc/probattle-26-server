#!/bin/bash

# Neighbourly Backend - Setup Script
# This script sets up the development environment

set -e

echo "🚀 Setting up Neighbourly Backend - National Scale"
echo "=================================================="

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file from .env.example..."
    cp .env.example .env
    echo "⚠️  Please edit .env file with your configuration"
else
    echo "✅ .env file already exists"
fi

# Install Node.js dependencies
echo "📦 Installing Node.js dependencies..."
npm install

# Build Docker images
echo "🐳 Building Docker images..."
docker-compose build

# Start services
echo "🚀 Starting services..."
docker-compose up -d

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 10

# Check service health
echo "🏥 Checking service health..."

# Check PostgreSQL
if docker-compose exec -T postgres pg_isready -U postgres > /dev/null 2>&1; then
    echo "✅ PostgreSQL is ready"
else
    echo "❌ PostgreSQL is not ready"
fi

# Check Redis
if docker-compose exec -T redis redis-cli ping > /dev/null 2>&1; then
    echo "✅ Redis is ready"
else
    echo "❌ Redis is not ready"
fi

# Check RabbitMQ
if docker-compose exec -T rabbitmq rabbitmqctl status > /dev/null 2>&1; then
    echo "✅ RabbitMQ is ready"
else
    echo "❌ RabbitMQ is not ready"
fi

# Check Nginx
if curl -s http://localhost/health > /dev/null 2>&1; then
    echo "✅ Nginx is ready"
else
    echo "❌ Nginx is not ready"
fi

echo ""
echo "=================================================="
echo "✅ Setup complete!"
echo ""
echo "📊 Service URLs:"
echo "  - API: http://localhost"
echo "  - Health Check: http://localhost/health"
echo "  - RabbitMQ Management: http://localhost:15672 (admin/admin)"
echo ""
echo "📝 Next steps:"
echo "  1. Edit .env file with your configuration"
echo "  2. Run database migrations: npm run migrate"
echo "  3. Seed database (optional): npm run seed"
echo "  4. View logs: docker-compose logs -f"
echo ""
echo "🛑 To stop services: docker-compose down"
echo "🔄 To restart services: docker-compose restart"
echo "=================================================="
