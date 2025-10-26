/**
 * Type definitions for Credit Ratings Service V2
 * Matches the API spec exactly
 */

export type RatingAgency = "S&P Global" | "Fitch" | "Moody's";
export type RatingScale = "S&P/Fitch" | "Moody's";
export type Outlook = "Stable" | "Positive" | "Negative" | "Developing" | "Watch Positive" | "Watch Negative";
export type Action = "Affirmed" | "Upgraded" | "Downgraded" | "Placed on Watch" | "Withdrawn";
export type Category = "Investment Grade" | "Speculative" | "Not Rated";

export interface AgencyRating {
  agency: RatingAgency;
  rating: string;           // e.g., "AA+", "BBB-", "Aa1"
  rating_norm?: number;     // Normalized score 1-21 (AAA/Aaa=21, D/C=1)
  outlook?: Outlook;
  action?: Action;
  date?: string;            // ISO8601; required for vendor API, optional for heuristic
  scale: RatingScale;
  source_ref: string;       // URL or vendor reference (always present)
}

export interface RatingsSummary {
  agenciesFound: number;                  // 0..3
  averageScore?: number | null;           // mean of ordinals, if any
  category: Category;
}

export interface EntityInfo {
  legal_name?: string;
  ticker?: string;
  isin?: string;
  lei?: string;
  country?: string;
}

export interface RatingsResponse {
  query: string;
  status: "ok" | "error" | "partial";
  entity: EntityInfo;
  ratings: AgencyRating[];
  summary: RatingsSummary;
  diagnostics?: {
    sources: string[];
    errors: string[];
  };
  meta: {
    lastUpdated: string;
    sourcePriority: string[];
    traceId: string;
  };
}

// Internal types for processing
export interface CompanyIdentifiers extends EntityInfo {
  name: string;
  cusip?: string;
  cik?: string;
  sector?: string;
  exchange?: string;
  exchCode?: string;
  entityType?: 'corporate' | 'sovereign' | 'financial' | 'subsidiary' | 'municipality';
  parentCompany?: string;
  aliases?: string[];
}

// Error codes
export type ErrorCode =
  | "AUTH"
  | "RATE_LIMIT"
  | "NOT_FOUND"
  | "NOT_RATED"
  | "PARSING"
  | "BAD_MATCH"
  | "STALE"
  | "TIMEOUT"
  | "CIRCUIT_BREAKER_OPEN"
  | "UNKNOWN";

export class RatingsError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public context?: any
  ) {
    super(message);
    this.name = 'RatingsError';
  }
}
