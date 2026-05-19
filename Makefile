.PHONY: help build up down restart logs clean test

help:
	@echo "Code Analytics Platform - Make Commands"
	@echo "========================================"
	@echo "build          - Build Docker images"
	@echo "up             - Start all services"
	@echo "down           - Stop all services"
	@echo "restart        - Restart all services"
	@echo "logs           - View logs from all services"
	@echo "logs-api       - View API logs"
	@echo "logs-worker    - View worker logs"
	@echo "clean          - Remove containers and volumes"
	@echo "scale-workers  - Scale workers to N replicas (make scale-workers N=5)"
	@echo "shell-api      - Open shell in API container"
	@echo "shell-worker   - Open shell in worker container"
	@echo "db-shell       - Open MongoDB shell"
	@echo "redis-cli      - Open Redis CLI"

build:
	docker-compose build

up:
	docker-compose up -d
	@echo "Services started. API available at http://localhost:8000"
	@echo "API docs at http://localhost:8000/docs"

down:
	docker-compose down

restart:
	docker-compose restart

logs:
	docker-compose logs -f

logs-api:
	docker-compose logs -f api

logs-worker:
	docker-compose logs -f worker

clean:
	docker-compose down -v
	docker system prune -f

scale-workers:
	docker-compose up -d --scale worker=$(N)

shell-api:
	docker-compose exec api /bin/bash

shell-worker:
	docker-compose exec worker /bin/bash

db-shell:
	docker-compose exec mongodb mongosh

redis-cli:
	docker-compose exec redis redis-cli

monitoring:
	docker-compose --profile monitoring up -d prometheus grafana
	@echo "Prometheus: http://localhost:9090"
	@echo "Grafana: http://localhost:3000 (admin/admin)"
