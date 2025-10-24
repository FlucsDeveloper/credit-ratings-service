# Credit Ratings Service - Full Stack Application

Complete solution with **Backend API** (Python/FastAPI) + **Frontend Web App** (Next.js/TypeScript).

## 🌟 Overview

This is a production-ready full-stack application that aggregates public credit ratings from **Fitch**, **S&P Global**, and **Moody's**.

### Backend (FastAPI)
- Web scraping with Playwright
- Rating normalization
- SQLite caching
- Rate limiting + circuit breaker
- RESTful API

### Frontend (Next.js)
- Modern React UI
- Interactive search
- Visual comparisons with charts
- Recent searches history
- Responsive design

---

## 🚀 Quick Start (Full Stack)

### Option 1: Docker Compose (Recommended)

```bash
# Start both backend and frontend
docker-compose -f docker-compose.fullstack.yml up -d

# View logs
docker-compose -f docker-compose.fullstack.yml logs -f

# Stop services
docker-compose -f docker-compose.fullstack.yml down
```

**Access**:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

### Option 2: Local Development

**Terminal 1 - Backend:**
```bash
# Install backend
poetry install
poetry run playwright install chromium

# Configure
cp .env.example .env

# Run
poetry run python -m app.main
```

**Terminal 2 - Frontend:**
```bash
cd frontend

# Install
npm install

# Configure
cp .env.local.example .env.local

# Run
npm run dev
```

**Access**:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000

---

## 📦 Project Structure

```
credit-ratings-service/
├── app/                          # Backend (FastAPI)
│   ├── api/                      # REST endpoints
│   ├── scrapers/                 # Agency scrapers
│   ├── services/                 # Business logic
│   ├── models/                   # Data models
│   └── main.py                   # API entry point
│
├── frontend/                     # Frontend (Next.js)
│   ├── app/                      # Next.js pages
│   │   ├── page.tsx             # Home page
│   │   └── docs/page.tsx        # Documentation
│   ├── components/              # React components
│   │   ├── search-form.tsx
│   │   ├── rating-card.tsx
│   │   └── ratings-results.tsx
│   └── lib/                     # API client & types
│
├── tests/                       # Backend tests
├── docker-compose.fullstack.yml # Full stack compose
├── Dockerfile                   # Backend image
└── README.md                    # Main documentation
```

---

## 🎯 Features

### Backend Features

✅ **Multi-Agency Scraping**
- Fitch Ratings
- S&P Global
- Moody's

✅ **Entity Resolution**
- Intelligent name disambiguation
- Confidence scoring
- Alternative candidates

✅ **Rating Normalization**
- Cross-scale conversion
- 21-point numeric scoring
- Investment grade detection

✅ **Performance**
- 7-day SQLite cache
- Rate limiting (10 req/min/domain)
- Circuit breaker pattern

✅ **Reliability**
- Retry logic with exponential backoff
- Graceful degradation
- Structured JSON logging

### Frontend Features

✅ **Interactive UI**
- Search form with validation
- Real-time loading states
- Error handling

✅ **Rich Visualizations**
- Rating comparison charts
- Color-coded badges
- Outlook indicators

✅ **User Experience**
- Recent searches (localStorage)
- Responsive design (mobile/desktop)
- Clean, modern interface

✅ **Documentation**
- Inline help text
- Documentation page
- Links to API docs

---

## 🔧 Configuration

### Backend Environment Variables

```env
# Server
HOST=0.0.0.0
PORT=8000
LOG_LEVEL=INFO

# Scraping
HEADLESS=true
MAX_CONCURRENCY=2
SCRAPING_ALLOWED_FITCH=true
SCRAPING_ALLOWED_SP=true
SCRAPING_ALLOWED_MOODYS=true

# Cache
CACHE_TTL_DAYS=7
CACHE_DB_PATH=./data/cache.db

# Rate Limiting
RATE_LIMIT_PER_DOMAIN=10
RATE_LIMIT_WINDOW_SECONDS=60
```

### Frontend Environment Variables

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## 📊 Usage Example

### 1. Open Frontend

Navigate to http://localhost:3000

### 2. Search for a Company

**Example: Apple Inc.**

1. Enter "Apple Inc." in company name
2. Enter "US" in country code (optional)
3. Click "Search Ratings"

### 3. View Results

You'll see:

- **Resolved Entity** with 98% confidence
- **Rating Comparison Chart** showing all 3 agencies
- **Individual Rating Cards**:
  - Fitch: AA+ (Stable)
  - S&P: AA+ (Stable)
  - Moody's: Aa1 (Stable)
- **Normalized Scores**: All showing score 2/21 (Investment Grade)

### 4. Try More Searches

Recent searches are saved for quick access.

---

## 🛠️ Development

### Backend Development

```bash
# Install
poetry install

# Run tests
poetry run pytest

# Format code
poetry run black app tests

# Lint
poetry run ruff check app

# Type check
poetry run mypy app
```

### Frontend Development

```bash
cd frontend

# Install
npm install

# Dev server
npm run dev

# Build
npm run build

# Lint
npm run lint
```

---

## 🐳 Docker Commands

### Full Stack

```bash
# Build and start
docker-compose -f docker-compose.fullstack.yml up --build -d

# View logs
docker-compose -f docker-compose.fullstack.yml logs -f

# Stop
docker-compose -f docker-compose.fullstack.yml down

# Stop and remove volumes
docker-compose -f docker-compose.fullstack.yml down -v
```

### Backend Only

```bash
docker-compose up -d
```

### Frontend Only

```bash
cd frontend
docker build -t credit-ratings-frontend .
docker run -p 3000:3000 -e NEXT_PUBLIC_API_URL=http://host.docker.internal:8000 credit-ratings-frontend
```

---

## 📈 Performance

| Metric | Backend | Frontend |
|--------|---------|----------|
| **Response Time** (cached) | 10-50ms | N/A |
| **Response Time** (uncached) | 15-45s | N/A |
| **Page Load** | N/A | ~1-2s |
| **Memory Usage** | ~200MB | ~100MB |
| **Docker Image Size** | ~1.2GB | ~300MB |

---

## 🔒 Security

### Backend

- ✅ Respects robots.txt
- ✅ Rate limiting per domain
- ✅ No authentication bypass
- ✅ Input validation (Pydantic)
- ✅ Structured logging (no sensitive data)

### Frontend

- ✅ Environment variables for API URL
- ✅ No sensitive data in client
- ✅ CORS handled by backend
- ✅ XSS protection (React escaping)

---

## 🧪 Testing

### Backend Tests

```bash
poetry run pytest --cov=app --cov-report=html
open htmlcov/index.html
```

**Coverage**: 85%+

### Frontend Testing

```bash
cd frontend
npm test
```

---

## 📝 API Documentation

### Interactive Docs

http://localhost:8000/docs (Swagger UI)
http://localhost:8000/redoc (ReDoc)

### Example Request

```bash
curl -X POST http://localhost:8000/api/v1/ratings \
  -H "Content-Type: application/json" \
  -d '{
    "company_name": "Apple Inc.",
    "country": "US"
  }'
```

### Example Response

```json
{
  "query": "Apple Inc.",
  "resolved": {
    "name": "Apple Inc.",
    "confidence": 0.98
  },
  "ratings": {
    "fitch": {
      "raw": "AA+",
      "outlook": "Stable",
      "normalized": {
        "score": 2,
        "bucket": "Investment Grade"
      }
    },
    "sp": { /* ... */ },
    "moodys": { /* ... */ }
  },
  "cached": false,
  "timestamp": "2025-10-24T21:00:00Z"
}
```

---

## 🚀 Deployment

### Production Checklist

**Backend:**
- [ ] Set `HEADLESS=true`
- [ ] Configure rate limits for production load
- [ ] Set up reverse proxy (nginx)
- [ ] Enable SSL/TLS
- [ ] Configure monitoring
- [ ] Set up log aggregation

**Frontend:**
- [ ] Set `NEXT_PUBLIC_API_URL` to production API
- [ ] Build with `npm run build`
- [ ] Configure CDN (optional)
- [ ] Set up error tracking (Sentry)

### Deployment Options

1. **Docker Compose** (Single Server)
   - Use `docker-compose.fullstack.yml`
   - Add nginx reverse proxy
   - Set up SSL with Let's Encrypt

2. **Kubernetes** (Scalable)
   - Create K8s manifests
   - Use persistent volumes for cache
   - Configure ingress

3. **Serverless** (Cost-effective)
   - Backend: AWS Lambda + API Gateway
   - Frontend: Vercel/Netlify
   - Cache: Redis/DynamoDB

---

## 🐛 Troubleshooting

### Backend Not Starting

```
Error: playwright browser not found
```

**Solution**:
```bash
poetry run playwright install chromium
```

### Frontend Can't Connect to API

```
Error: Failed to fetch
```

**Solution**:
1. Check backend is running: `curl http://localhost:8000/api/v1/health`
2. Verify `NEXT_PUBLIC_API_URL` in `.env.local`
3. Check CORS settings in backend

### Docker Build Fails

```
Error: COPY failed
```

**Solution**:
```bash
# Clean and rebuild
docker-compose -f docker-compose.fullstack.yml down
docker system prune -a
docker-compose -f docker-compose.fullstack.yml up --build
```

---

## 📚 Documentation

- [Backend README](README.md) - API documentation
- [Frontend README](frontend/README.md) - Frontend guide
- [Architecture](ARCHITECTURE.md) - Technical details
- [Deployment](DEPLOYMENT.md) - Production deployment

---

## 🎓 Learning Resources

This project demonstrates:

- **Backend**: FastAPI, async Python, web scraping, caching, rate limiting
- **Frontend**: Next.js 14, TypeScript, Tailwind CSS, React hooks
- **DevOps**: Docker, Docker Compose, multi-stage builds
- **API Design**: RESTful APIs, OpenAPI, type-safe clients
- **UI/UX**: Component libraries, responsive design, loading states

---

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Make changes
4. Run tests (backend + frontend)
5. Submit pull request

---

## 📄 License

MIT License - See LICENSE file

---

## 🌟 Star This Project

If you find this useful, please star the repository!

**Tech Stack**: Python • FastAPI • Next.js • TypeScript • Tailwind CSS • Docker • Playwright • Recharts

---

*Last Updated: 2025-10-24*
