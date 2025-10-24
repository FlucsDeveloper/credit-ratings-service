export interface RatingRequest {
  company_name: string;
  country?: string;
  prefer_exact_match?: boolean;
}

export interface NormalizedRating {
  scale: string;
  score: number;
  bucket: string;
}

export interface AgencyRating {
  raw: string | null;
  outlook: string | null;
  normalized: NormalizedRating | null;
  last_updated: string | null;
  source_url: string | null;
  blocked: boolean;
  error: string | null;
}

export interface ResolvedEntity {
  name: string;
  country: string | null;
  canonical_url: string | null;
  confidence: number;
  ambiguous_candidates: Array<{
    name: string;
    url: string;
    confidence: number;
  }>;
}

export interface RatingsResponse {
  query: string;
  resolved: ResolvedEntity | null;
  ratings: {
    fitch?: AgencyRating;
    sp?: AgencyRating;
    moodys?: AgencyRating;
  };
  notes: string[];
  timestamp: string;
  cached: boolean;
}

export interface RecentSearch {
  company_name: string;
  country?: string;
  timestamp: string;
}
