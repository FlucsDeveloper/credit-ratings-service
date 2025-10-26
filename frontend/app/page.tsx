"use client";

import { useState } from "react";
import { SearchBar } from "@/components/search-bar";
import { RatingChart } from "@/components/rating-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Download,
  FileText,
  TrendingUp,
  Building2,
  Shield,
  AlertCircle,
  CheckCircle2,
  TrendingDown,
  Minus,
  BarChart3,
  Activity
} from "lucide-react";
import { motion } from "framer-motion";
import { getRatingBadgeColor, getRatingColor } from "@/lib/utils";

export default function Home() {
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Transformar array de ratings em objeto {sp, fitch, moodys}
  const transformRatings = (data: any) => {
    if (!data || !data.ratings) return data;

    const ratingsObj: any = { sp: null, fitch: null, moodys: null };

    data.ratings.forEach((rating: any) => {
      if (rating.agency === "S&P Global" || rating.agency === "S&P") {
        ratingsObj.sp = rating;
      } else if (rating.agency === "Fitch") {
        ratingsObj.fitch = rating;
      } else if (rating.agency === "Moody's") {
        ratingsObj.moodys = rating;
      }
    });

    return { ...data, ratings: ratingsObj };
  };

  const handleSearch = async (company: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/ratings-v2?q=${encodeURIComponent(company)}`);
      const data = await res.json();

      // API sempre retorna 200 com status: "ok" ou "degraded"
      if (data.status === "ok" || data.status === "degraded") {
        // Transformar ratings array em objeto
        const transformedData = transformRatings(data);
        setResults(transformedData);

        // Mostrar aviso se degraded
        if (data.status === "degraded" && data.ratings.length === 0) {
          setError(`No ratings found for "${company}". ${data.diagnostics?.errors?.join(', ') || 'Try another company.'}`);
        }
      } else {
        setError(data.error || "Failed to fetch ratings");
      }
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const foundRatings = results?.summary?.agenciesFound || 0;

  const handleExportPDF = async () => {
    if (!results) return;

    try {
      const response = await fetch('/api/export/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(results),
      });

      if (!response.ok) throw new Error('Failed to generate PDF');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const companyName = results.entity?.legal_name || results.query || 'company';
      a.download = `${companyName.replace(/[^a-z0-9]/gi, '_')}_credit_ratings.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('PDF export failed:', error);
      setError('Failed to export PDF');
    }
  };

  const handleExportExcel = async () => {
    if (!results) return;

    try {
      const response = await fetch('/api/export/excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(results),
      });

      if (!response.ok) throw new Error('Failed to generate Excel');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const companyName = results.entity?.legal_name || results.query || 'company';
      a.download = `${companyName.replace(/[^a-z0-9]/gi, '_')}_credit_ratings.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Excel export failed:', error);
      setError('Failed to export Excel');
    }
  };

  const getOutlookIcon = (outlook?: string) => {
    if (!outlook) return <Minus className="w-4 h-4" />;
    if (outlook === "Positive") return <TrendingUp className="w-4 h-4 text-green-500" />;
    if (outlook === "Negative") return <TrendingDown className="w-4 h-4 text-red-500" />;
    return <Minus className="w-4 h-4" />;
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-8 h-8 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Credit Ratings Terminal</h1>
              <p className="text-sm text-muted-foreground">Enterprise Credit Analysis Platform</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm">
              <FileText className="w-4 h-4 mr-2" />
              Documentation
            </Button>
            <Button variant="ghost" size="sm">
              API
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 space-y-8">
        {/* Search Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <div className="text-center space-y-2 mb-8">
            <h2 className="text-4xl font-bold tracking-tight">
              Enterprise Credit Rating Analysis
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Real-time credit ratings from Fitch, S&P Global, and Moody's.
              Powered by AI-driven entity resolution.
            </p>
          </div>

          <SearchBar onSearch={handleSearch} isLoading={isLoading} />

          {/* Quick Actions */}
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <span>Quick search:</span>
            {["Apple Inc.", "Microsoft", "Amazon", "Petrobras"].map((company) => (
              <Button
                key={company}
                variant="ghost"
                size="sm"
                onClick={() => handleSearch(company)}
                disabled={isLoading}
                className="h-7"
              >
                {company}
              </Button>
            ))}
          </div>
        </motion.div>

        {/* Error State */}
        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <Card className="border-destructive">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-destructive" />
                  <p className="text-destructive">{error}</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Results */}
        {results && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="space-y-6"
          >
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Company</p>
                      <p className="text-2xl font-bold">{results.entity?.legal_name || results.query}</p>
                      {results.entity?.ticker && (
                        <p className="text-xs text-muted-foreground mt-1">{results.entity.ticker}</p>
                      )}
                    </div>
                    <Building2 className="w-8 h-8 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Agencies Found</p>
                      <p className="text-2xl font-bold">{foundRatings}/3</p>
                    </div>
                    <Activity className="w-8 h-8 text-green-500" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Avg. Score</p>
                      <p className="text-2xl font-bold">
                        {results.summary?.averageScore?.toFixed(1) || "N/A"}
                      </p>
                    </div>
                    <BarChart3 className="w-8 h-8 text-blue-500" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Category</p>
                      <p className="text-lg font-bold">
                        {results.summary?.category || "N/A"}
                      </p>
                    </div>
                    <Shield className="w-8 h-8 text-primary" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Rating Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Fitch */}
              <Card className={results.ratings.fitch?.rating ? "hover:shadow-lg transition-all hover:border-primary/50" : ""}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center justify-between">
                    <span>Fitch Ratings</span>
                    {results.ratings.fitch?.rating ? (
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-muted-foreground" />
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {results.ratings.fitch?.rating ? (
                    <>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground mb-1">Rating</p>
                          <p className="text-3xl font-bold text-primary">
                            {results.ratings.fitch.rating}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Updated</p>
                          <p className="text-xs font-mono">{results.ratings.fitch.date}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t">
                        <span className="text-sm text-muted-foreground">Outlook</span>
                        <div className="flex items-center gap-2">
                          {getOutlookIcon(results.ratings.fitch.outlook)}
                          <span className="text-sm font-medium">{results.ratings.fitch.outlook || "N/A"}</span>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground pt-2 border-t">
                        Source: {results.ratings.fitch.source_ref}
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                      <p className="text-sm">{results.ratings.fitch?.reason || "No rating found"}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* S&P */}
              <Card className={results.ratings.sp?.rating ? "hover:shadow-lg transition-all hover:border-primary/50" : ""}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center justify-between">
                    <span>S&P Global</span>
                    {results.ratings.sp?.rating ? (
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-muted-foreground" />
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {results.ratings.sp?.rating ? (
                    <>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground mb-1">Rating</p>
                          <p className="text-3xl font-bold text-primary">
                            {results.ratings.sp.rating}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Updated</p>
                          <p className="text-xs font-mono">{results.ratings.sp.date}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t">
                        <span className="text-sm text-muted-foreground">Outlook</span>
                        <div className="flex items-center gap-2">
                          {getOutlookIcon(results.ratings.sp.outlook)}
                          <span className="text-sm font-medium">{results.ratings.sp.outlook || "N/A"}</span>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground pt-2 border-t">
                        Source: {results.ratings.sp.source_ref}
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                      <p className="text-sm">{results.ratings.sp?.reason || "No rating found"}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Moody's */}
              <Card className={results.ratings.moodys?.rating ? "hover:shadow-lg transition-all hover:border-primary/50" : ""}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center justify-between">
                    <span>Moody's</span>
                    {results.ratings.moodys?.rating ? (
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-muted-foreground" />
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {results.ratings.moodys?.rating ? (
                    <>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground mb-1">Rating</p>
                          <p className="text-3xl font-bold text-primary">
                            {results.ratings.moodys.rating}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Updated</p>
                          <p className="text-xs font-mono">{results.ratings.moodys.date}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t">
                        <span className="text-sm text-muted-foreground">Outlook</span>
                        <div className="flex items-center gap-2">
                          {getOutlookIcon(results.ratings.moodys.outlook)}
                          <span className="text-sm font-medium">{results.ratings.moodys.outlook || "N/A"}</span>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground pt-2 border-t">
                        Source: {results.ratings.moodys.source_ref}
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                      <p className="text-sm">{results.ratings.moodys?.reason || "No rating found"}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Chart */}
            {foundRatings > 0 && (
              <RatingChart ratings={results.ratings} />
            )}

            {/* Export Options */}
            <Card>
              <CardHeader>
                <CardTitle>Export & Actions</CardTitle>
              </CardHeader>
              <CardContent className="flex gap-4">
                <Button onClick={handleExportPDF}>
                  <Download className="w-4 h-4 mr-2" />
                  Export to PDF
                </Button>
                <Button variant="outline" onClick={handleExportExcel}>
                  <FileText className="w-4 h-4 mr-2" />
                  Export to Excel
                </Button>
                <Button variant="outline">
                  Compare Companies
                </Button>
              </CardContent>
            </Card>

            {/* Metadata */}
            <Card className="bg-muted/30">
              <CardContent className="pt-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Company</p>
                    <p className="font-mono">
                      {results.identifiers?.ticker || "N/A"}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Last Updated</p>
                    <p className="font-mono">{new Date(results.summary.lastUpdated).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Data Sources</p>
                    <p className="font-mono">Fitch, S&P, Moody's</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Status</p>
                    <p className="font-mono text-green-600">Live Data</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Empty State */}
        {!results && !isLoading && !error && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Building2 className="w-16 h-16 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold mb-2">Ready to analyze</h3>
              <p className="text-muted-foreground max-w-md">
                Enter a company name above to fetch real-time credit ratings from
                major rating agencies.
              </p>
            </CardContent>
          </Card>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t mt-16 py-8 bg-card/50">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>© 2025 Credit Ratings Terminal. Enterprise-grade credit analysis platform.</p>
          <p className="mt-2">Data provided by Fitch Ratings, S&P Global, and Moody's Investors Service.</p>
        </div>
      </footer>
    </div>
  );
}