#!/bin/bash

# Code Analytics Platform - Quick Start Script

set -e

echo "========================================="
echo "Code Analytics Platform - Quick Start"
echo "========================================="
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "Error: Docker is not installed"
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "Error: Docker Compose is not installed"
    exit 1
fi

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "Creating .env file from template..."
    cp .env.example .env
fi

# Create repositories directory for scanning
if [ ! -d repositories ]; then
    echo "Creating repositories directory..."
    mkdir -p repositories
fi

# Build and start services
echo "Building Docker images..."
docker-compose build

echo ""
echo "Starting services..."
docker-compose up -d

echo ""
echo "Waiting for services to be healthy..."
sleep 10

# Check service health
echo ""
echo "Checking service health..."
curl -f http://localhost:8000/api/v1/health || echo "Warning: API health check failed"

echo ""
echo "========================================="
echo "Services Started Successfully!"
echo "========================================="
echo ""
echo "API:              http://localhost:8000"
echo "API Documentation: http://localhost:8000/docs"
echo "Health Check:     http://localhost:8000/api/v1/health"
echo "Metrics:          http://localhost:8000/api/v1/metrics"
echo ""
echo "MongoDB:          localhost:27017"
echo "Redis:            localhost:6379"
echo ""
echo "View logs:        make logs"
echo "Stop services:    make down"
echo "Restart services: make restart"
echo ""
echo "To scan a repository:"
echo "1. Place your repository in ./repositories/"
echo "2. Use the API to create a scan:"
echo ""
echo "curl -X POST http://localhost:8000/api/v1/scans \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"repository_path\": \"/repositories/your-repo\"}'"
echo ""
echo "========================================="
