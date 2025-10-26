/**
 * Rating Validation Service
 * Enforces rating domain, outlook domain, and freshness checks
 */

import { AgencyRating, RatingsError } from './types';

const SP_FITCH_RATINGS = [
  'AAA', 'AA+', 'AA', 'AA-', 'A+', 'A', 'A-',
  'BBB+', 'BBB', 'BBB-', 'BB+', 'BB', 'BB-',
  'B+', 'B', 'B-', 'CCC+', 'CCC', 'CCC-',
  'CC', 'C', 'D'
];

const MOODYS_RATINGS = [
  'Aaa', 'Aa1', 'Aa2', 'Aa3', 'A1', 'A2', 'A3',
  'Baa1', 'Baa2', 'Baa3', 'Ba1', 'Ba2', 'Ba3',
  'B1', 'B2', 'B3', 'Caa1', 'Caa2', 'Caa3',
  'Ca', 'C'
];

const VALID_OUTLOOKS = [
  'Stable',
  'Positive',
  'Negative',
  'Developing',
  'Watch Positive',
  'Watch Negative',
];

const MAX_RATING_AGE_DAYS = 365; // 1 year

/**
 * Validate a single rating
 */
export function validateRating(rating: AgencyRating, requireDate: boolean = false): void {
  const errors: string[] = [];

  // 1. Validate rating value belongs to known set
  if (rating.scale === 'S&P/Fitch') {
    if (!SP_FITCH_RATINGS.includes(rating.rating)) {
      errors.push(`Invalid S&P/Fitch rating: ${rating.rating}`);
    }
  } else if (rating.scale === "Moody's") {
    if (!MOODYS_RATINGS.includes(rating.rating)) {
      errors.push(`Invalid Moody's rating: ${rating.rating}`);
    }
  } else {
    errors.push(`Invalid scale: ${rating.scale}`);
  }

  // 2. Validate outlook if present
  if (rating.outlook && !VALID_OUTLOOKS.includes(rating.outlook)) {
    errors.push(`Invalid outlook: ${rating.outlook}`);
  }

  // 3. Validate date presence (required for vendor APIs, optional for heuristic)
  if (requireDate && !rating.date) {
    errors.push(`Missing date for ${rating.agency} rating`);
  }

  // 4. Validate freshness if date is present
  if (rating.date) {
    try {
      const ratingDate = new Date(rating.date);
      const now = Date.now();
      const ageDays = (now - ratingDate.getTime()) / (1000 * 60 * 60 * 24);

      // Check if date is in the future
      if (ageDays < 0) {
        errors.push(`Future date not allowed: ${rating.date}`);
      }

      // Check if rating is stale (> 450 days)
      if (ageDays > MAX_RATING_AGE_DAYS) {
        throw new RatingsError(
          'STALE',
          `Rating is ${Math.round(ageDays)} days old (max ${MAX_RATING_AGE_DAYS})`,
          { agency: rating.agency, date: rating.date, ageDays: Math.round(ageDays) }
        );
      }
    } catch (e) {
      if (e instanceof RatingsError) throw e;
      errors.push(`Invalid date format: ${rating.date}`);
    }
  }

  // 5. Validate source_ref is present
  if (!rating.source_ref || rating.source_ref.trim().length === 0) {
    errors.push(`Missing source_ref for ${rating.agency} rating`);
  }

  if (errors.length > 0) {
    throw new RatingsError(
      'PARSING',
      `Validation failed for ${rating.agency}: ${errors.join(', ')}`,
      { errors }
    );
  }
}

/**
 * Validate multiple ratings
 */
export function validateRatings(ratings: AgencyRating[], requireDate: boolean = false): void {
  for (const rating of ratings) {
    validateRating(rating, requireDate);
  }
}

/**
 * Check if rating is valid (without throwing)
 */
export function isValidRating(rating: string, scale: 'S&P/Fitch' | "Moody's"): boolean {
  if (scale === 'S&P/Fitch') {
    return SP_FITCH_RATINGS.includes(rating);
  } else {
    return MOODYS_RATINGS.includes(rating);
  }
}

/**
 * Normalize outlook value
 */
export function normalizeOutlook(outlook?: string): string | undefined {
  if (!outlook) return undefined;

  const normalized = outlook.trim();

  // Map common variations
  const mapping: Record<string, string> = {
    'stable': 'Stable',
    'positive': 'Positive',
    'negative': 'Negative',
    'developing': 'Developing',
    'watch positive': 'Watch Positive',
    'watch negative': 'Watch Negative',
    'creditwatch positive': 'Watch Positive',
    'creditwatch negative': 'Watch Negative',
    'under review': 'Developing',
  };

  const lower = normalized.toLowerCase();
  return mapping[lower] || normalized;
}
