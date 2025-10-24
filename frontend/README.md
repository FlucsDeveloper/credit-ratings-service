# Credit Ratings Service - Frontend

Modern web interface for the Credit Ratings Service API, built with Next.js 14, TypeScript, and Tailwind CSS.

## Features

- 🔍 **Interactive Search** - Search credit ratings by company name and country
- 📊 **Visual Comparisons** - Compare ratings across agencies with charts
- 💾 **Recent Searches** - Quick access to your search history (localStorage)
- ⚡ **Real-time Updates** - Loading states and error handling
- 📱 **Responsive Design** - Works on desktop, tablet, and mobile
- 🎨 **Modern UI** - Clean interface with shadcn/ui components
- 📈 **Rating Normalization** - Unified view across different rating scales

## Tech Stack

| Technology | Purpose |
|------------|---------|
| **Next.js 14** | React framework with App Router |
| **TypeScript** | Type-safe development |
| **Tailwind CSS** | Utility-first styling |
| **Recharts** | Data visualization |
| **Lucide React** | Icon library |
| **date-fns** | Date formatting |

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- Backend API running (see parent directory)

### Installation

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.local.example .env.local

# Edit .env.local with your API URL
# NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Development

```bash
# Start development server
npm run dev

# Open http://localhost:3000
```

### Production Build

```bash
# Build for production
npm run build

# Start production server
npm start
```

## Project Structure

```
frontend/
├── app/
│   ├── page.tsx           # Home page
│   ├── docs/page.tsx      # Documentation page
│   ├── layout.tsx         # Root layout
│   └── globals.css        # Global styles
├── components/
│   ├── ui/                # Base UI components
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── input.tsx
│   │   └── badge.tsx
│   ├── search-form.tsx    # Search form component
│   ├── rating-card.tsx    # Individual rating display
│   └── ratings-results.tsx # Results with charts
├── lib/
│   ├── api.ts             # API client
│   ├── types.ts           # TypeScript interfaces
│   └── utils.ts           # Utility functions
└── public/                # Static assets
```

## Usage

### 1. Search for Ratings

1. Enter a company name (e.g., "Apple Inc.", "Petrobras S.A.")
2. Optionally add a 2-letter country code (e.g., "US", "BR")
3. Click "Search Ratings"

### 2. View Results

The results page shows:

- **Resolved Entity** - Confirmed company name with confidence score
- **Rating Comparison Chart** - Visual comparison across agencies
- **Individual Rating Cards** - Detailed info from each agency
  - Raw rating (e.g., "AA-", "Baa2")
  - Outlook (Positive/Stable/Negative)
  - Normalized score (1-21 scale)
  - Rating bucket (Investment Grade/Speculative/Default)
  - Last updated date
  - Source link
- **Notes** - Warnings or additional information

### 3. Recent Searches

Click any recent search to quickly re-run it. Stored locally (up to 5).

## API Integration

The frontend communicates with the backend API:

```typescript
// lib/api.ts
const API_URL = process.env.NEXT_PUBLIC_API_URL;

export async function fetchRatings(request: RatingRequest): Promise<RatingsResponse> {
  const response = await fetch(`${API_URL}/api/v1/ratings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  return response.json();
}
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_API_URL` | Backend API URL | `http://localhost:8000` |

## Docker Deployment

```bash
# Build image
docker build -t credit-ratings-frontend .

# Run container
docker run -p 3000:3000 \
  -e NEXT_PUBLIC_API_URL=http://api:8000 \
  credit-ratings-frontend
```

## Development Tips

### Adding New Components

```bash
# Create a new component
touch components/my-component.tsx
```

### Styling with Tailwind

The project uses a custom color system:

```tsx
<div className="bg-primary text-primary-foreground">
  {/* Primary colors from theme */}
</div>
```

### Type Safety

All API responses are typed:

```typescript
import { RatingsResponse } from "@/lib/types";

const [results, setResults] = useState<RatingsResponse | null>(null);
```

## Customization

### Change Theme Colors

Edit `tailwind.config.ts` and `app/globals.css`:

```css
:root {
  --primary: 221.2 83.2% 53.3%; /* HSL color */
}
```

### Add New Rating Agency

1. Update types in `lib/types.ts`
2. Add logo/name in `components/rating-card.tsx`
3. Update chart in `components/ratings-results.tsx`

## Performance

- ⚡ Server-side rendering with Next.js
- 📦 Automatic code splitting
- 🗜️ CSS optimization with Tailwind
- 💾 LocalStorage for recent searches (no backend calls)
- 🔄 API response caching (handled by backend)

## Accessibility

- ✅ Semantic HTML
- ✅ ARIA labels where needed
- ✅ Keyboard navigation
- ✅ Color contrast (WCAG AA)
- ✅ Responsive font sizes

## Browser Support

- ✅ Chrome/Edge (latest 2 versions)
- ✅ Firefox (latest 2 versions)
- ✅ Safari (latest 2 versions)
- ✅ Mobile browsers (iOS Safari, Chrome Android)

## Troubleshooting

### API Connection Error

```
Error: Failed to fetch
```

**Solution**: Check that:
1. Backend is running (default: http://localhost:8000)
2. `NEXT_PUBLIC_API_URL` is set correctly
3. CORS is enabled on backend

### Build Errors

```
Module not found: Can't resolve '@/...'
```

**Solution**: Check `tsconfig.json` has correct path mapping:
```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```

### Hydration Errors

```
Warning: Text content did not match
```

**Solution**: Ensure no server/client mismatches. Use `"use client"` directive when needed.

## Contributing

1. Create a feature branch
2. Make your changes
3. Run linting: `npm run lint`
4. Test locally: `npm run dev`
5. Build: `npm run build`
6. Submit PR

## License

MIT

## Links

- [Backend API Documentation](../README.md)
- [API Swagger Docs](http://localhost:8000/docs)
- [Next.js Documentation](https://nextjs.org/docs)
- [Tailwind CSS](https://tailwindcss.com)

---

**Note**: This frontend requires the backend API to be running. See the parent directory for backend setup instructions.
