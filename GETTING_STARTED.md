# 🚀 Getting Started - Credit Ratings Service

Quick guide to get the full stack application running in **5 minutes**.

---

## ✅ Prerequisites

Before starting, ensure you have:

- ✅ **Docker** & **Docker Compose** installed
  - [Install Docker](https://docs.docker.com/get-docker/)
  - [Install Docker Compose](https://docs.docker.com/compose/install/)

**OR** for local development:

- ✅ **Python 3.11+** & **Poetry**
- ✅ **Node.js 18+** & **npm**

---

## 🎯 Option 1: Docker (Easiest)

### 1. Navigate to Project

```bash
cd /Users/felipec/credit-ratings-service
```

### 2. Start Everything

```bash
docker-compose -f docker-compose.fullstack.yml up --build -d
```

This will:
- ✅ Build backend Docker image (~5 min first time)
- ✅ Build frontend Docker image (~3 min first time)
- ✅ Start both services
- ✅ Create network and volumes

### 3. Wait for Services

```bash
# Watch logs until both services are ready
docker-compose -f docker-compose.fullstack.yml logs -f
```

Look for:
```
frontend  | ✓ Ready in 2.3s
api       | INFO:     Application startup complete
```

Press `Ctrl+C` to stop following logs (services keep running).

### 4. Open Application

🌐 **Frontend**: http://localhost:3000
📡 **Backend API**: http://localhost:8000
📚 **API Docs**: http://localhost:8000/docs

### 5. Test It Out

1. Go to http://localhost:3000
2. Enter "Apple Inc." in the company name field
3. Enter "US" in the country field
4. Click "Search Ratings"
5. Wait 20-30 seconds (scraping 3 agencies)
6. View results with charts!

### 6. Stop Services

```bash
docker-compose -f docker-compose.fullstack.yml down
```

---

## 🛠️ Option 2: Local Development

### Backend Setup

```bash
# 1. Navigate to project root
cd /Users/felipec/credit-ratings-service

# 2. Install dependencies
poetry install

# 3. Install Playwright browser
poetry run playwright install chromium

# 4. Configure environment
cp .env.example .env

# 5. Start backend
poetry run python -m app.main
```

Backend will start on http://localhost:8000

Keep this terminal open!

### Frontend Setup (New Terminal)

```bash
# 1. Navigate to frontend
cd /Users/felipec/credit-ratings-service/frontend

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.local.example .env.local

# 4. Start frontend
npm run dev
```

Frontend will start on http://localhost:3000

### Test Application

Open http://localhost:3000 and try searching!

---

## 📊 What You'll See

### 1. Home Page

- Search form with company name and country inputs
- Recent searches sidebar
- "How it works" info card

### 2. Results Page (after search)

- **Resolved Entity Card**
  - Company name with confidence score
  - Alternative matches (if ambiguous)

- **Rating Comparison Chart**
  - Bar chart showing scores across agencies
  - Lower score = better rating

- **Individual Rating Cards** (one per agency)
  - Fitch Ratings 🏢
  - S&P Global 📊
  - Moody's 📈

  Each showing:
  - Raw rating (e.g., "AA+")
  - Outlook (Positive/Stable/Negative)
  - Normalized score (1-21)
  - Rating bucket (Investment Grade/Speculative)
  - Last updated date
  - Link to source

- **Notes** (if any issues)
  - Blocked agencies
  - Missing ratings
  - Warnings

### 3. Documentation Page

Click "API Docs" badge to see:
- Service features
- Rating scale explanation
- API information
- Limitations

---

## 🧪 Quick Test Scenarios

### Scenario 1: High-Rated Company

```
Company: Apple Inc.
Country: US
Expected: All agencies return AA+ or Aa1 (score 2)
```

### Scenario 2: Brazilian Company

```
Company: Petrobras S.A.
Country: BR
Expected: Mixed ratings, some speculative grade
```

### Scenario 3: Ambiguous Name

```
Company: National Bank
Country: (leave empty)
Expected: Multiple candidates, lower confidence
```

### Scenario 4: Cache Hit

```
Search same company twice
Expected: Second search returns instantly (<1s) with "Cached" badge
```

---

## 🔍 Troubleshooting

### Problem: Docker Build Fails

**Error**: `failed to solve with frontend dockerfile.v0`

**Solution**:
```bash
# Clean Docker cache
docker system prune -a

# Rebuild
docker-compose -f docker-compose.fullstack.yml up --build
```

### Problem: Backend Health Check Fails

**Error**: `credit-ratings-api exited with code 1`

**Check logs**:
```bash
docker-compose -f docker-compose.fullstack.yml logs api
```

**Common fixes**:
1. Playwright browser not installed
2. Port 8000 already in use
3. Missing environment variables

### Problem: Frontend Can't Connect

**Error**: `Failed to fetch` or CORS error

**Solutions**:
1. Check backend is running: `curl http://localhost:8000/api/v1/health`
2. Verify `NEXT_PUBLIC_API_URL` matches backend URL
3. Wait for backend to fully start (check logs)

### Problem: Slow Scraping

**Normal**: First request takes 20-45s (scraping 3 agencies in parallel)
**If slower**: Check internet connection, may be rate limited

---

## 📝 Next Steps

Once everything is running:

### 1. Explore the API

```bash
# Health check
curl http://localhost:8000/api/v1/health

# Manual API call
curl -X POST http://localhost:8000/api/v1/ratings \
  -H "Content-Type: application/json" \
  -d '{"company_name": "Microsoft Corporation", "country": "US"}'
```

### 2. View API Documentation

Open http://localhost:8000/docs

- Try the interactive API explorer
- See all request/response schemas
- Test different companies

### 3. Customize Frontend

```bash
cd frontend

# Edit colors in tailwind.config.ts
# Edit components in components/
# Add new features

npm run dev  # See changes immediately
```

### 4. Run Tests

**Backend**:
```bash
poetry run pytest --cov=app
```

**Frontend**:
```bash
cd frontend
npm run build  # Ensure no build errors
```

### 5. Check Performance

```bash
# Backend stats
docker stats credit-ratings-api

# Cache contents
docker exec credit-ratings-api ls -lh /app/data/
```

---

## 🎓 Understanding the Code

### Backend Entry Point

```python
# app/main.py
app = FastAPI(title="Credit Ratings Service")
app.include_router(router, prefix="/api/v1")
```

### Frontend Entry Point

```typescript
// app/page.tsx
export default function Home() {
  const [results, setResults] = useState<RatingsResponse | null>(null);
  // ...
}
```

### API Call

```typescript
// lib/api.ts
export async function fetchRatings(request: RatingRequest) {
  const response = await fetch(`${API_URL}/api/v1/ratings`, {
    method: "POST",
    body: JSON.stringify(request),
  });
  return response.json();
}
```

---

## 📚 Further Reading

- [Full Stack README](FULLSTACK_README.md) - Complete documentation
- [Backend Details](README.md) - API implementation
- [Frontend Details](frontend/README.md) - UI components
- [Architecture](ARCHITECTURE.md) - Technical design
- [Deployment](DEPLOYMENT.md) - Production setup

---

## 🆘 Getting Help

If you're stuck:

1. **Check logs**:
   ```bash
   docker-compose -f docker-compose.fullstack.yml logs --tail=100
   ```

2. **Verify services are up**:
   ```bash
   docker-compose -f docker-compose.fullstack.yml ps
   ```

3. **Test connectivity**:
   ```bash
   curl http://localhost:8000/api/v1/health  # Backend
   curl http://localhost:3000                 # Frontend
   ```

4. **Restart services**:
   ```bash
   docker-compose -f docker-compose.fullstack.yml restart
   ```

5. **Full reset**:
   ```bash
   docker-compose -f docker-compose.fullstack.yml down -v
   docker-compose -f docker-compose.fullstack.yml up --build
   ```

---

## ✨ You're All Set!

You should now have:

- ✅ Backend API running on port 8000
- ✅ Frontend web app on port 3000
- ✅ Ability to search credit ratings
- ✅ Visual comparisons with charts
- ✅ Recent searches saved

**Enjoy exploring credit ratings!** 🎉

---

*For production deployment, see [DEPLOYMENT.md](DEPLOYMENT.md)*
