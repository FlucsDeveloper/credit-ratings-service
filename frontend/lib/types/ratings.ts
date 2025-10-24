/**
 * Core data types for the Credit Ratings Terminal
 */

export type RatingAgency = "Fitch" | "S&P Global" | "Moody's";
export type RatingScale = "S&P/Fitch" | "Moody's";

export interface AgencyRating {
  agency: RatingAgency;
  rating: string;          // e.g., "AA+", "Aa1"
  outlook?: string;        // e.g., "Stable", "Negative", "Positive"
  date: string;           // ISO 8601 of latest action
  scale: RatingScale;
  source_ref: string;     // API reference or URL
}

export interface CompanyIdentifiers {
  name: string;
  ticker?: string;
  isin?: string;
  lei?: string;
  cusip?: string;
  cik?: string;
  country?: string;
  sector?: string;
  exchange?: string;
  exchCode?: string;
  entityType?: 'corporate' | 'sovereign' | 'financial' | 'subsidiary' | 'municipality';
  parentCompany?: string;
  aliases?: string[];
}

export interface RatingsResponse {
  success: boolean;
  company: string;
  identifiers: CompanyIdentifiers;
  ratings: {
    fitch?: AgencyRating | { error: string; reason: string };
    sp?: AgencyRating | { error: string; reason: string };
    moodys?: AgencyRating | { error: string; reason: string };
  };
  summary: {
    agenciesFound: number;
    averageScore?: number;
    category?: string;
    lastUpdated: string;
  };
  logs: string[];
}