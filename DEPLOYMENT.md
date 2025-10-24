# Deployment Guide

This guide covers different deployment strategies for the Credit Ratings Service.

## Table of Contents

1. [Local Development](#local-development)
2. [Docker Deployment](#docker-deployment)
3. [Production Deployment](#production-deployment)
4. [Monitoring](#monitoring)
5. [Maintenance](#maintenance)

---

## Local Development

### Setup

```bash
# Install dependencies
make install

# Install Playwright browsers
make install-playwright

# Copy environment file
cp .env.example .env

# Edit configuration
nano .env
```

### Run

```bash
# Start the service
make run

# Or with Poetry directly
poetry run python -m app.main
```

### Testing

```bash
# Run tests
make test

# With coverage
make test-cov

# Linting
make lint

# Format code
make format
```

---

## Docker Deployment

### Quick Start

```bash
# Build and start
make docker-up

# View logs
make docker-logs

# Stop
make docker-down
```

### Custom Configuration

Edit `docker-compose.yml` environment variables:

```yaml
environment:
  - LOG_LEVEL=DEBUG  # Change log level
  - CACHE_TTL_DAYS=14  # Longer cache
  - RATE_LIMIT_PER_DOMAIN=5  # More conservative
```

### Persist Data

The cache database is persisted in a Docker volume:

```bash
# View volume
docker volume ls | grep credit-ratings

# Backup cache
docker cp credit-ratings-api:/app/data/cache.db ./backup-cache.db

# Restore cache
docker cp ./backup-cache.db credit-ratings-api:/app/data/cache.db
```

---

## Production Deployment

### Prerequisites

- Linux server (Ubuntu 20.04+ recommended)
- Docker & Docker Compose
- Reverse proxy (nginx/Traefik)
- SSL certificate (Let's Encrypt)

### 1. Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo apt install docker-compose-plugin

# Create application directory
sudo mkdir -p /opt/credit-ratings
cd /opt/credit-ratings
```

### 2. Deploy Application

```bash
# Clone repository
git clone <repository-url> .

# Configure environment
cp .env.example .env
nano .env  # Edit for production

# Set production values
# - HEADLESS=true
# - LOG_LEVEL=WARNING
# - RATE_LIMIT_PER_DOMAIN=5
# - CIRCUIT_BREAKER_THRESHOLD=3
```

### 3. Configure Reverse Proxy (nginx)

```nginx
# /etc/nginx/sites-available/credit-ratings

server {
    listen 80;
    server_name ratings.yourdomain.com;

    location / {
        return 301 https://$server_name$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name ratings.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/ratings.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ratings.yourdomain.com/privkey.pem;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    location / {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts for scraping
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Health check endpoint (no auth)
    location /api/v1/health {
        proxy_pass http://localhost:8000;
        access_log off;
    }
}
```

Enable site:
```bash
sudo ln -s /etc/nginx/sites-available/credit-ratings /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 4. SSL Certificate (Let's Encrypt)

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d ratings.yourdomain.com
```

### 5. Start Service

```bash
cd /opt/credit-ratings
docker-compose up -d

# Check status
docker-compose ps
docker-compose logs -f
```

### 6. Set Up Systemd Service (Optional)

```ini
# /etc/systemd/system/credit-ratings.service

[Unit]
Description=Credit Ratings Service
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/credit-ratings
ExecStart=/usr/bin/docker-compose up -d
ExecStop=/usr/bin/docker-compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
```

Enable:
```bash
sudo systemctl enable credit-ratings
sudo systemctl start credit-ratings
```

---

## Monitoring

### Health Checks

```bash
# Manual check
curl http://localhost:8000/api/v1/health

# Automated monitoring (cron)
*/5 * * * * curl -f http://localhost:8000/api/v1/health || echo "Service down!" | mail -s "Alert" admin@example.com
```

### Logs

```bash
# View real-time logs
docker-compose logs -f api

# Last 100 lines
docker-compose logs --tail=100 api

# Filter by level
docker-compose logs api | grep ERROR

# Export logs
docker-compose logs --since 24h api > logs-24h.txt
```

### Metrics to Monitor

1. **Response Time**: API endpoint latency
2. **Cache Hit Rate**: Check logs for "cache_hit" vs "cache_miss"
3. **Scraping Success Rate**: Count "scrape_success" vs "scrape_error"
4. **Circuit Breaker State**: Watch for "circuit_opened" events
5. **Error Rate**: Count ERROR level logs

### Log Analysis

```bash
# Cache hit rate (last hour)
docker-compose logs --since 1h api | grep -c "cache_hit"
docker-compose logs --since 1h api | grep -c "cache_miss"

# Scraping errors by agency
docker-compose logs api | grep "scrape_error" | grep -oP 'agency=\K\w+' | sort | uniq -c

# Circuit breaker events
docker-compose logs api | grep "circuit_"
```

---

## Maintenance

### Database Cleanup

```bash
# Clean expired cache entries (manual)
docker-compose exec api python -c "
import asyncio
from app.services.cache import get_cache_service

async def cleanup():
    cache = get_cache_service()
    await cache.initialize()
    deleted = await cache.cleanup_expired()
    print(f'Deleted {deleted} expired entries')

asyncio.run(cleanup())
"
```

### Updates

```bash
# Pull latest code
cd /opt/credit-ratings
git pull

# Rebuild and restart
docker-compose down
docker-compose build --no-cache
docker-compose up -d

# Verify
docker-compose logs --tail=50 api
```

### Backup

```bash
# Backup cache database
docker cp credit-ratings-api:/app/data/cache.db ./backups/cache-$(date +%Y%m%d).db

# Automated backup (cron)
0 2 * * * docker cp credit-ratings-api:/app/data/cache.db /backups/credit-ratings/cache-$(date +\%Y\%m\%d).db
```

### Performance Tuning

If experiencing slow responses:

1. **Increase cache TTL**:
   ```bash
   CACHE_TTL_DAYS=30  # Cache for 30 days
   ```

2. **Reduce scraping load**:
   ```bash
   MAX_CONCURRENCY=1  # One agency at a time
   RATE_LIMIT_PER_DOMAIN=5  # More conservative
   ```

3. **Optimize circuit breaker**:
   ```bash
   CIRCUIT_BREAKER_THRESHOLD=3  # Open faster
   CIRCUIT_BREAKER_TIMEOUT_SECONDS=600  # Longer timeout
   ```

### Troubleshooting

#### Service won't start

```bash
# Check Docker logs
docker-compose logs api

# Verify port availability
sudo netstat -tulpn | grep 8000

# Check environment
docker-compose config
```

#### High memory usage

```bash
# Check container stats
docker stats credit-ratings-api

# Restart with memory limit
docker-compose down
# Edit docker-compose.yml, add:
#   deploy:
#     resources:
#       limits:
#         memory: 1G
docker-compose up -d
```

#### Playwright issues

```bash
# Reinstall browsers in container
docker-compose exec api playwright install chromium

# Or rebuild image
docker-compose build --no-cache
```

---

## Security Considerations

1. **Restrict API access**: Use nginx `allow`/`deny` directives
2. **Rate limiting**: Add nginx rate limiting
3. **API authentication**: Implement API keys for production
4. **Firewall**: Only expose ports 80/443
5. **Regular updates**: Keep dependencies updated
6. **Log rotation**: Configure logrotate for docker logs

### Example nginx rate limiting:

```nginx
# In nginx.conf http block
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/m;

# In server block
location /api/v1/ratings {
    limit_req zone=api_limit burst=5 nodelay;
    proxy_pass http://localhost:8000;
}
```

---

## Support

For production issues:
- Check logs first: `make docker-logs`
- Review health endpoint: `/api/v1/health`
- Consult README.md troubleshooting section
- Open GitHub issue with logs and configuration
