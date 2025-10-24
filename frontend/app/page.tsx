"use client";

import { useState, useEffect } from "react";
import { SearchForm } from "@/components/search-form";
import { RatingsResults } from "@/components/ratings-results";
import { fetchRatings } from "@/lib/api";
import { RatingsResponse, RecentSearch } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, TrendingUp, History, ExternalLink } from "lucide-react";
import Link from "next/link";

export default function Home() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<RatingsResponse | null>(null);
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);

  // Load recent searches from localStorage
  useEffect(() => {
    const stored = localStorage.getItem("recentSearches");
    if (stored) {
      setRecentSearches(JSON.parse(stored));
    }
  }, []);

  const handleSearch = async (companyName: string, country?: string) => {
    setIsLoading(true);
    setError(null);
    setResults(null);

    try {
      const data = await fetchRatings({
        company_name: companyName,
        country,
        prefer_exact_match: true,
      });

      setResults(data);

      // Save to recent searches
      const newSearch: RecentSearch = {
        company_name: companyName,
        country,
        timestamp: new Date().toISOString(),
      };

      const updated = [newSearch, ...recentSearches.filter(
        s => !(s.company_name === companyName && s.country === country)
      )].slice(0, 5);

      setRecentSearches(updated);
      localStorage.setItem("recentSearches", JSON.stringify(updated));
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRecentSearch = (search: RecentSearch) => {
    handleSearch(search.company_name, search.country);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      {/* Header */}
      <header className="border-b bg-white shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-primary">Credit Ratings Service</h1>
              <p className="text-sm text-muted-foreground">
                Aggregate ratings from Fitch, S&P Global, and Moody's
              </p>
            </div>
            <div className="flex gap-2">
              <Link href="/docs">
                <Badge variant="outline" className="cursor-pointer hover:bg-accent">
                  <ExternalLink className="h-3 w-3 mr-1" />
                  API Docs
                </Badge>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left Column - Search */}
          <div className="lg:col-span-1 space-y-6">
            <SearchForm onSearch={handleSearch} isLoading={isLoading} />

            {/* Recent Searches */}
            {recentSearches.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <History className="h-4 w-4" />
                    Recent Searches
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {recentSearches.map((search, idx) => (
                      <li key={idx}>
                        <button
                          onClick={() => handleRecentSearch(search)}
                          className="w-full text-left px-3 py-2 rounded-md hover:bg-accent transition-colors text-sm"
                          disabled={isLoading}
                        >
                          <div className="font-medium">{search.company_name}</div>
                          {search.country && (
                            <div className="text-xs text-muted-foreground">{search.country}</div>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Info Card */}
            <Card className="bg-blue-50 border-blue-200">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2 text-blue-900">
                  <TrendingUp className="h-4 w-4" />
                  How it works
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-blue-800 space-y-2">
                <p>1. Enter a company name (optionally with country code)</p>
                <p>2. We search and scrape public ratings from all 3 agencies</p>
                <p>3. Ratings are normalized to a common scale (1-21)</p>
                <p>4. Results are cached for 7 days</p>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Results */}
          <div className="lg:col-span-2">
            {error && (
              <Card className="border-red-200 bg-red-50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-red-900">
                    <AlertCircle className="h-5 w-5" />
                    Error
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-red-800">{error}</p>
                </CardContent>
              </Card>
            )}

            {results && <RatingsResults data={results} />}

            {!results && !error && !isLoading && (
              <Card className="border-dashed">
                <CardHeader>
                  <CardTitle>No results yet</CardTitle>
                  <CardDescription>
                    Enter a company name to start searching for credit ratings
                  </CardDescription>
                </CardHeader>
              </Card>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t bg-white mt-12">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <p>
              Credit Ratings Service • Built with Next.js & FastAPI
            </p>
            <p>
              Data sources: Fitch Ratings, S&P Global, Moody's
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
