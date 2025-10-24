/**
 * Rating Payload Validator - Blocks incorrect data before sending to frontend
 */

import { AgencyRating, CompanyIdentifiers } from '@/lib/types/ratings';

interface ValidationError {
  code: string;
  message: string;
  context?: any;
}

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
  'N/A'
];

const MAX_RATING_AGE_DAYS = 450; // ~15 months

export interface RatingsPayload {
  entity: CompanyIdentifiers;
  ratings: {
    fitch?: AgencyRating | { error: string; reason: string };
    sp?: AgencyRating | { error: string; reason: string };
    moodys?: AgencyRating | { error: string; reason: string };
  };
  summary: {
    agenciesFound: number;
    averageScore?: number;
    category?: string;
  };
}

/**
 * Validate entire ratings payload before sending to frontend
 * Throws ValidationError if any check fails
 */
export function validatePayload(payload: RatingsPayload): void {
  const errors: ValidationError[] = [];

  // 1. Validate entity has at least one identifier
  if (!payload.entity.name) {
    errors.push({
      code: 'MISSING_ENTITY_NAME',
      message: 'Entity must have a name',
    });
  }

  // Extract valid ratings
  const validRatings: AgencyRating[] = [];
  if (payload.ratings.fitch && 'rating' in payload.ratings.fitch) {
    validRatings.push(payload.ratings.fitch);
  }
  if (payload.ratings.sp && 'rating' in payload.ratings.sp) {
    validRatings.push(payload.ratings.sp);
  }
  if (payload.ratings.moodys && 'rating' in payload.ratings.moodys) {
    validRatings.push(payload.ratings.moodys);
  }

  // 2. Validate rating values belong to known sets
  for (const rating of validRatings) {
    if (rating.scale === 'S&P/Fitch') {
      if (!SP_FITCH_RATINGS.includes(rating.rating)) {
        errors.push({
          code: 'INVALID_RATING_VALUE',
          message: `Invalid S&P/Fitch rating: ${rating.rating}`,
          context: { agency: rating.agency, rating: rating.rating },
        });
      }
    } else if (rating.scale === "Moody's") {
      if (!MOODYS_RATINGS.includes(rating.rating)) {
        errors.push({
          code: 'INVALID_RATING_VALUE',
          message: `Invalid Moody's rating: ${rating.rating}`,
          context: { agency: rating.agency, rating: rating.rating },
        });
      }
    }
  }

  // 3. Validate outlook normalization
  for (const rating of validRatings) {
    if (rating.outlook && !VALID_OUTLOOKS.includes(rating.outlook)) {
      errors.push({
        code: 'INVALID_OUTLOOK',
        message: `Invalid outlook: ${rating.outlook}`,
        context: { agency: rating.agency, outlook: rating.outlook },
      });
    }
  }

  // 4. Validate freshness (max age)
  for (const rating of validRatings) {
    if (!rating.date) {
      errors.push({
        code: 'MISSING_DATE',
        message: `Rating missing date`,
        context: { agency: rating.agency },
      });
      continue;
    }

    try {
      const ratingDate = new Date(rating.date);
      const ageDays = (Date.now() - ratingDate.getTime()) / (1000 * 60 * 60 * 24);

      if (ageDays > MAX_RATING_AGE_DAYS) {
        errors.push({
          code: 'STALE_RATING',
          message: `Rating is ${Math.round(ageDays)} days old (max ${MAX_RATING_AGE_DAYS})`,
          context: { agency: rating.agency, date: rating.date, ageDays: Math.round(ageDays) },
        });
      }

      // Reject future dates
      if (ageDays < 0) {
        errors.push({
          code: 'FUTURE_DATE',
          message: `Rating date is in the future`,
          context: { agency: rating.agency, date: rating.date },
        });
      }
    } catch (e) {
      errors.push({
        code: 'INVALID_DATE_FORMAT',
        message: `Invalid date format: ${rating.date}`,
        context: { agency: rating.agency, date: rating.date },
      });
    }
  }

  // 5. Validate source_ref is present
  for (const rating of validRatings) {
    if (!rating.source_ref || rating.source_ref.trim().length === 0) {
      errors.push({
        code: 'MISSING_SOURCE_REF',
        message: `Rating missing source reference`,
        context: { agency: rating.agency },
      });
    }
  }

  // 6. Validate summary consistency
  if (payload.summary.agenciesFound !== validRatings.length) {
    errors.push({
      code: 'SUMMARY_MISMATCH',
      message: `Summary reports ${payload.summary.agenciesFound} agencies but found ${validRatings.length} valid ratings`,
      context: { reported: payload.summary.agenciesFound, actual: validRatings.length },
    });
  }

  // 7. Validate average score calculation
  if (validRatings.length > 0 && !payload.summary.averageScore) {
    errors.push({
      code: 'MISSING_AVERAGE_SCORE',
      message: `Average score missing despite having ${validRatings.length} valid ratings`,
    });
  }

  if (validRatings.length === 0 && payload.summary.averageScore) {
    errors.push({
      code: 'INVALID_AVERAGE_SCORE',
      message: `Average score present but no valid ratings found`,
    });
  }

  // If there are any errors, throw them
  if (errors.length > 0) {
    const error = new Error('Payload validation failed') as any;
    error.code = 'VALIDATION_FAILED';
    error.errors = errors;
    error.context = { validRatingsCount: validRatings.length };
    throw error;
  }
}

/**
 * Normalize outlook values to standard set
 */
export function normalizeOutlook(outlook?: string): string {
  if (!outlook) return 'N/A';

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
    'n/a': 'N/A',
    'na': 'N/A',
    '': 'N/A',
  };

  const lower = normalized.toLowerCase();
  return mapping[lower] || normalized;
}

/**
 * Check if rating is investment grade
 */
export function isInvestmentGrade(rating: string, scale: 'S&P/Fitch' | "Moody's"): boolean {
  if (scale === 'S&P/Fitch') {
    const investmentGrade = ['AAA', 'AA+', 'AA', 'AA-', 'A+', 'A', 'A-', 'BBB+', 'BBB', 'BBB-'];
    return investmentGrade.includes(rating);
  } else {
    const investmentGrade = ['Aaa', 'Aa1', 'Aa2', 'Aa3', 'A1', 'A2', 'A3', 'Baa1', 'Baa2', 'Baa3'];
    return investmentGrade.includes(rating);
  }
}
