"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Search } from "lucide-react";

interface SearchFormProps {
  onSearch: (companyName: string, country?: string) => void;
  isLoading: boolean;
}

export function SearchForm({ onSearch, isLoading }: SearchFormProps) {
  const [companyName, setCompanyName] = useState("");
  const [country, setCountry] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (companyName.trim()) {
      onSearch(companyName.trim(), country.trim() || undefined);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Search Credit Ratings</CardTitle>
        <CardDescription>
          Enter a company name to fetch ratings from Fitch, S&P, and Moody's
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="company" className="text-sm font-medium">
              Company Name *
            </label>
            <Input
              id="company"
              type="text"
              placeholder="e.g., Apple Inc., Petrobras S.A."
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              disabled={isLoading}
              required
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="country" className="text-sm font-medium">
              Country Code (optional)
            </label>
            <Input
              id="country"
              type="text"
              placeholder="e.g., US, BR, JP"
              value={country}
              onChange={(e) => setCountry(e.target.value.toUpperCase())}
              maxLength={2}
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              ISO 3166-1 alpha-2 code (2 letters)
            </p>
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={isLoading || !companyName.trim()}
          >
            {isLoading ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Searching...
              </>
            ) : (
              <>
                <Search className="mr-2 h-4 w-4" />
                Search Ratings
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
