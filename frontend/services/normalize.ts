/**
 * Rating Normalization Service
 * Maps S&P/Fitch and Moody's ratings to ordinal scale 1-21
 * Calculates averageScore and category
 */

import { AgencyRating, RatingsSummary, Category } from './types';

// S&P/Fitch scale to ordinal (AAA=21, D=1)
const SP_FITCH_SCALE: Record<string, number> = {
  'AAA': 21,
  'AA+': 20,
  'AA': 19,
  'AA-': 18,
  'A+': 17,
  'A': 16,
  'A-': 15,
  'BBB+': 14,
  'BBB': 13,
  'BBB-': 12,
  'BB+': 11,
  'BB': 10,
  'BB-': 9,
  'B+': 8,
  'B': 7,
  'B-': 6,
  'CCC+': 5,
  'CCC': 4,
  'CCC-': 3,
  'CC': 2,
  'C': 1,
  'D': 1,
};

// Moody's scale to ordinal (Aaa=21, C=1)
const MOODYS_SCALE: Record<string, number> = {
  'Aaa': 21,
  'Aa1': 20,
  'Aa2': 19,
  'Aa3': 18,
  'A1': 17,
  'A2': 16,
  'A3': 15,
  'Baa1': 14,
  'Baa2': 13,
  'Baa3': 12,
  'Ba1': 11,
  'Ba2': 10,
  'Ba3': 9,
  'B1': 8,
  'B2': 7,
  'B3': 6,
  'Caa1': 5,
  'Caa2': 4,
  'Caa3': 3,
  'Ca': 2,
  'C': 1,
};

/**
 * Convert rating to ordinal score (1-21)
 */
export function normalizeRating(rating: string, scale: 'S&P/Fitch' | "Moody's"): number {
  if (scale === 'S&P/Fitch') {
    return SP_FITCH_SCALE[rating] || 0;
  } else {
    return MOODYS_SCALE[rating] || 0;
  }
}

/**
 * Calculate average score from multiple ratings
 */
export function calculateAverageScore(ratings: AgencyRating[]): number | null {
  if (ratings.length === 0) return null;

  const scores: number[] = [];

  for (const rating of ratings) {
    const score = normalizeRating(rating.rating, rating.scale);
    if (score > 0) {
      scores.push(score);
    }
  }

  if (scores.length === 0) return null;

  const sum = scores.reduce((a, b) => a + b, 0);
  const avg = sum / scores.length;

  // Round to 1 decimal place
  return Math.round(avg * 10) / 10;
}

/**
 * Determine rating category based on average score
 */
export function getRatingCategory(averageScore: number | null): Category {
  if (averageScore === null) return 'Not Rated';

  // Investment Grade: BBB-/Baa3 and above (12-21)
  if (averageScore >= 12) return 'Investment Grade';

  // Speculative: Below BBB-/Baa3 (1-11)
  if (averageScore > 0) return 'Speculative';

  return 'Not Rated';
}

/**
 * Create ratings summary from ratings array
 */
export function createSummary(ratings: AgencyRating[]): RatingsSummary {
  const agenciesFound = ratings.length;
  const averageScore = calculateAverageScore(ratings);
  const category = getRatingCategory(averageScore);

  return {
    agenciesFound,
    averageScore,
    category,
  };
}

/**
 * Check if rating is investment grade
 */
export function isInvestmentGrade(rating: string, scale: 'S&P/Fitch' | "Moody's"): boolean {
  const score = normalizeRating(rating, scale);
  return score >= 12; // BBB-/Baa3 or higher
}

/**
 * Get investment grade threshold
 */
export function getInvestmentGradeThreshold(scale: 'S&P/Fitch' | "Moody's"): string {
  return scale === 'S&P/Fitch' ? 'BBB-' : 'Baa3';
}
