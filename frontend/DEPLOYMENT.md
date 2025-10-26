# Credit Ratings Service - Deployment Guide

## Prerequisites

- Node.js 18+ installed
- Vercel account (recommended for Next.js deployments)
- All required API keys

## Environment Variables Required

### AI Models (Required)
```bash
GOOGLE_GENERATIVE_AI_API_KEY=     # Gemini 2.0 for entity resolution
GROQ_API_KEY=                      # Fast inference for fallback operations
DEEPSEEK_API_KEY=                  # LLM rating extraction fallback
```

### Financial Data APIs (Optional but Recommended)
```bash
FINANCIAL_MODELING_PREP_API_KEY=  # FMP API for company data
ALPHA_VANTAGE_API_KEY=            # Market data
OPENFIGI_API_KEY=                 # Security identifier mapping
EOD_HISTORICAL_DATA_API_KEY=      # Historical market data
FINNHUB_API_KEY=                  # Stock market data
POLYGON_API_KEY=                  # Polygon.io market data
TWELVE_DATA_API_KEY=              # Additional market data
```

### Application Settings
```bash
NEXT_PUBLIC_API_URL=              # Leave empty for production (uses relative URLs)
LLM_PROVIDER=groq                 # Default LLM provider (groq recommended)
```

## Deployment Steps

### Option 1: Deploy to Vercel (Recommended)

1. **Install Vercel CLI** (if not already installed):
   ```bash
   npm install -g vercel
   ```

2. **Login to Vercel**:
   ```bash
   vercel login
   ```

3. **Deploy from the frontend directory**:
   ```bash
   cd /Users/felipec/credit-ratings-service/frontend
   vercel
   ```

4. **Follow the prompts**:
   - Set up and deploy: `Y`
   - Scope: Select your account/team
   - Link to existing project: `N` (first time) or `Y` (subsequent deploys)
   - Project name: `credit-ratings-service` (or your preferred name)
   - Directory: `./` (current directory)
   - Build settings: Use detected settings (Next.js)

5. **Set environment variables in Vercel Dashboard**:
   - Go to: https://vercel.com/[your-username]/[project-name]/settings/environment-variables
   - Add all required environment variables from `.env.local`
   - **IMPORTANT**: Do NOT set `NEXT_PUBLIC_API_URL` in production (uses relative paths)

6. **Trigger a new deployment** (after setting env vars):
   ```bash
   vercel --prod
   ```

### Option 2: Deploy to Vercel via GitHub

1. **Push code to GitHub**:
   ```bash
   git init  # if not already initialized
   git add .
   git commit -m "Ready for production deployment"
   git remote add origin [your-github-repo-url]
   git push -u origin main
   ```

2. **Connect to Vercel**:
   - Go to https://vercel.com/new
   - Import your GitHub repository
   - Configure project:
     - Framework Preset: Next.js
     - Root Directory: `frontend`
     - Build Command: `npm run build`
     - Output Directory: `.next`

3. **Add environment variables** in Vercel dashboard before deploying

4. **Deploy**: Click "Deploy"

### Option 3: Self-Hosted (Docker/VPS)

1. **Build the production bundle**:
   ```bash
   npm run build
   ```

2. **Start the production server**:
   ```bash
   npm start
   ```
   The app will run on http://localhost:3000

3. **For Docker deployment**, create a `Dockerfile`:
   ```dockerfile
   FROM node:18-alpine
   WORKDIR /app
   COPY package*.json ./
   RUN npm ci --only=production
   COPY . .
   RUN npm run build
   EXPOSE 3000
   CMD ["npm", "start"]
   ```

4. **Build and run Docker container**:
   ```bash
   docker build -t credit-ratings-service .
   docker run -p 3000:3000 --env-file .env.local credit-ratings-service
   ```

## Post-Deployment Checklist

- [ ] Verify all environment variables are set correctly
- [ ] Test the main API endpoint: `GET /api/ratings-v2?q=Microsoft`
- [ ] Check that AI providers are working (entity resolution, rating extraction)
- [ ] Verify financial data APIs are returning data
- [ ] Test the web scraper functionality
- [ ] Monitor logs for any errors
- [ ] Check cache functionality
- [ ] Test with various company names/tickers
- [ ] Verify response times are under 10 seconds
- [ ] Check that all 3 agencies (S&P, Fitch, Moody's) are being queried

## API Endpoints

### Main Rating Endpoint
```
GET /api/ratings-v2?q=<company_name_or_ticker>
```

Example:
```bash
curl https://your-domain.vercel.app/api/ratings-v2?q=Microsoft
```

### Cache Stats
```
OPTIONS /api/ratings-v2
```

## Monitoring

Monitor these metrics after deployment:

1. **Response Time**: Should be ≤10 seconds per request
2. **Success Rate**: Percentage of requests returning at least 1 rating
3. **API Errors**: Watch for API key quota issues
4. **Cache Hit Rate**: Check OPTIONS endpoint for cache statistics
5. **LLM Fallback Usage**: Monitor how often LLM extraction is triggered

## Troubleshooting

### Issue: No ratings found
- Check API keys are set correctly
- Verify company name/ticker is valid
- Check logs for specific agency errors

### Issue: Slow response times
- Check if all 3 agencies are timing out
- Verify network connectivity to external APIs
- Consider increasing timeout values if needed

### Issue: LLM extraction failing
- Verify DEEPSEEK_API_KEY is set
- Check GOOGLE_GENERATIVE_AI_API_KEY for entity resolution
- Monitor API quotas

### Issue: Build fails
- Run `npm run build` locally first
- Check for TypeScript errors
- Verify all dependencies are installed

## Performance Optimization

The service uses several optimization strategies:

1. **Parallel Fetching**: All 3 agencies queried simultaneously
2. **Multi-Source Fallback**:
   - Public Data (fastest, most reliable)
   - UniversalScraper (web scraping)
   - Heuristic Fallback (includes LLM)
3. **Caching**: 6-hour TTL on successful responses
4. **Timeouts**: Strict 10-second budget enforced
5. **Rate Limiting**: Built-in via Bottleneck

## Security Notes

- Never commit `.env.local` to version control
- Rotate API keys regularly
- Use environment variables for all secrets
- Monitor API usage to detect anomalies
- Set up Vercel's automatic HTTPS

## Support

For issues or questions:
- Check logs in Vercel dashboard
- Review API endpoint diagnostics in response
- Monitor trace IDs for debugging

## Version

- Next.js: 14.2.0
- Node.js: 18+
- Build: Production-ready as of deployment
