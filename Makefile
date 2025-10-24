.PHONY: help install install-playwright run test test-cov lint format docker-build docker-up docker-down docker-logs clean

help:
	@echo "Credit Ratings Service - Available Commands"
	@echo ""
	@echo "Development:"
	@echo "  make install           - Install dependencies with Poetry"
	@echo "  make install-playwright - Install Playwright browsers"
	@echo "  make run              - Run the service locally"
	@echo "  make test             - Run unit tests"
	@echo "  make test-cov         - Run tests with coverage"
	@echo "  make lint             - Run linting (ruff + mypy)"
	@echo "  make format           - Format code (black + ruff)"
	@echo ""
	@echo "Docker:"
	@echo "  make docker-build     - Build Docker image"
	@echo "  make docker-up        - Start service with docker-compose"
	@echo "  make docker-down      - Stop service"
	@echo "  make docker-logs      - View service logs"
	@echo ""
	@echo "Maintenance:"
	@echo "  make clean            - Clean cache, logs, and build artifacts"

install:
	poetry install

install-playwright:
	poetry run playwright install chromium

run:
	poetry run python -m app.main

test:
	poetry run pytest -v

test-cov:
	poetry run pytest --cov=app --cov-report=html --cov-report=term

lint:
	poetry run ruff check app tests
	poetry run mypy app

format:
	poetry run black app tests
	poetry run ruff check --fix app tests

docker-build:
	docker-compose build

docker-up:
	docker-compose up -d
	@echo ""
	@echo "Service started! Access at:"
	@echo "  - API Docs: http://localhost:8000/docs"
	@echo "  - Health:   http://localhost:8000/api/v1/health"
	@echo ""
	@echo "View logs with: make docker-logs"

docker-down:
	docker-compose down

docker-logs:
	docker-compose logs -f api

clean:
	rm -rf __pycache__
	rm -rf .pytest_cache
	rm -rf .coverage
	rm -rf htmlcov
	rm -rf dist
	rm -rf build
	rm -rf *.egg-info
	rm -rf data/*.db
	rm -rf logs/*.log
	find . -type d -name "__pycache__" -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete
