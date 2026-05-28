.PHONY: help build up down restart logs clean test local

help:
	@echo "Code Analytics Platform - Make Commands"
	@echo "========================================"
	@echo "build          - Build Docker images"
	@echo "up             - Start all services"
	@echo "down           - Stop all services"
	@echo "restart        - Restart all services"
	@echo "logs           - View logs from all services"
	@echo "logs-api       - View API logs"
	@echo "local          - Run the API locally with uvicorn reload"
	@echo "clean          - Remove containers and volumes"
	@echo "shell-api      - Open shell in API container"
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

local:
	uvicorn app.main:app --reload --host 0.0.0.0

clean:
	docker-compose down -v
	docker system prune -f

shell-api:
	docker-compose exec api /bin/bash

redis-cli:
	docker-compose exec redis redis-cli
