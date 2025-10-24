"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Code, Database, Globe, Shield, Zap } from "lucide-react";
import Link from "next/link";

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      {/* Header */}
      <header className="border-b bg-white shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary">
            <ArrowLeft className="h-4 w-4" />
            Back to search
          </Link>
          <h1 className="text-2xl font-bold text-primary mt-2">Documentation</h1>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="space-y-6">
          {/* Overview */}
          <Card>
            <CardHeader>
              <CardTitle>About This Service</CardTitle>
              <CardDescription>
                A microservice that aggregates public credit ratings from major agencies
              </CardDescription>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none">
              <p>
                This service fetches and normalizes credit ratings from three major rating agencies:
                Fitch Ratings, S&P Global, and Moody's. It provides a unified view of credit ratings
                with standardized scoring and caching for improved performance.
              </p>
            </CardContent>
          </Card>

          {/* Features */}
          <Card>
            <CardHeader>
              <CardTitle>Key Features</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex gap-3">
                  <Globe className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <h4 className="font-semibold">Entity Resolution</h4>
                    <p className="text-sm text-muted-foreground">
                      Intelligent company name disambiguation with confidence scoring
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Zap className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <h4 className="font-semibold">Real-time Scraping</h4>
                    <p className="text-sm text-muted-foreground">
                      Fetches latest public ratings from agency websites
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Code className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <h4 className="font-semibold">Normalized Ratings</h4>
                    <p className="text-sm text-muted-foreground">
                      Converts different scales to unified 1-21 scoring system
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Database className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <h4 className="font-semibold">Smart Caching</h4>
                    <p className="text-sm text-muted-foreground">
                      7-day cache to reduce load and improve response times
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Shield className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <h4 className="font-semibold">Rate Limiting</h4>
                    <p className="text-sm text-muted-foreground">
                      Built-in rate limiting and circuit breakers
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Shield className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <h4 className="font-semibold">Ethical Scraping</h4>
                    <p className="text-sm text-muted-foreground">
                      Respects robots.txt and agency terms of service
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Rating Scale */}
          <Card>
            <CardHeader>
              <CardTitle>Rating Scale</CardTitle>
              <CardDescription>Understanding the normalized scoring system</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Badge className="bg-green-100 text-green-700 mb-2">Investment Grade (1-10)</Badge>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <strong>Fitch/S&P:</strong> AAA, AA+, AA, AA-, A+, A, A-, BBB+, BBB, BBB-
                    </div>
                    <div>
                      <strong>Moody's:</strong> Aaa, Aa1, Aa2, Aa3, A1, A2, A3, Baa1, Baa2, Baa3
                    </div>
                  </div>
                </div>

                <div>
                  <Badge className="bg-orange-100 text-orange-700 mb-2">Speculative (11-19)</Badge>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <strong>Fitch/S&P:</strong> BB+, BB, BB-, B+, B, B-, CCC+, CCC, CC, C
                    </div>
                    <div>
                      <strong>Moody's:</strong> Ba1, Ba2, Ba3, B1, B2, B3, Caa1-3, Ca, C
                    </div>
                  </div>
                </div>

                <div>
                  <Badge className="bg-red-100 text-red-700 mb-2">Default (21)</Badge>
                  <div className="text-sm">
                    <strong>Fitch/S&P:</strong> D, SD, RD
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* API Info */}
          <Card>
            <CardHeader>
              <CardTitle>API Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold mb-2">Endpoint</h4>
                  <code className="block bg-muted p-3 rounded-md text-sm">
                    POST {process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/v1/ratings
                  </code>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Request Example</h4>
                  <pre className="bg-muted p-3 rounded-md text-xs overflow-x-auto">
{`{
  "company_name": "Apple Inc.",
  "country": "US",
  "prefer_exact_match": true
}`}
                  </pre>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Interactive Docs</h4>
                  <a
                    href={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/docs`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline text-sm"
                  >
                    View OpenAPI/Swagger documentation →
                  </a>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Limitations */}
          <Card className="border-orange-200">
            <CardHeader>
              <CardTitle>Limitations</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>• Ratings are sourced from public pages only (no paywall access)</li>
                <li>• Agency website changes may temporarily affect data availability</li>
                <li>• Rate limiting may occur for high-volume requests</li>
                <li>• Company name disambiguation requires exact or similar matches</li>
                <li>• Results are cached for 7 days (may not reflect very recent changes)</li>
              </ul>
            </CardContent>
          </Card>

          {/* Footer */}
          <div className="text-center text-sm text-muted-foreground pt-6">
            <p>
              For technical details, see the{" "}
              <a
                href="https://github.com/your-repo"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                GitHub repository
              </a>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
