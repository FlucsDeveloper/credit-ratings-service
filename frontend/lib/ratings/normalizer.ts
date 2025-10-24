/**
 * Rating Normalizer - Convert ratings to common ordinal scale
 */

import { AgencyRating } from '@/lib/types/ratings';

// Rating scales mapping to ordinal values (1 = best, 21 = worst)
const SP_FITCH_SCALE: Record<string, number> = {
  'AAA': 1,
  'AA+': 2,
  'AA': 3,
  'AA-': 4,
  'A+': 5,
  'A': 6,
  'A-': 7,
  'BBB+': 8,
  'BBB': 9,
  'BBB-': 10,
  'BB+': 11,
  'BB': 12,
  'BB-': 13,
  'B+': 14,
  'B': 15,
  'B-': 16,
  'CCC+': 17,
  'CCC': 18,
  'CCC-': 19,
  'CC': 20,
  'C': 21,
  'D': 22,
};

const MOODYS_SCALE: Record<string, number> = {
  'Aaa': 1,
  'Aa1': 2,
  'Aa2': 3,
  'Aa3': 4,
  'A1': 5,
  'A2': 6,
  'A3': 7,
  'Baa1': 8,
  'Baa2': 9,
  'Baa3': 10,
  'Ba1': 11,
  'Ba2': 12,
  'Ba3': 13,
  'B1': 14,
  'B2': 15,
  'B3': 16,
  'Caa1': 17,
  'Caa2': 18,
  'Caa3': 19,
  'Ca': 20,
  'C': 21,
};

/**
 * Normalize rating to ordinal value
 */
export function normalizeRating(rating: string, scale: 'S&P/Fitch' | "Moody's"): number {
  const scaleMap = scale === "Moody's" ? MOODYS_SCALE : SP_FITCH_SCALE;
  return scaleMap[rating] || 99; // 99 = unrecognized
}

/**
 * Calculate average score from agency ratings
 */
export function calculateAverageScore(ratings: {
  fitch?: AgencyRating | { error: string };
  sp?: AgencyRating | { error: string };
  moodys?: AgencyRating | { error: string };
}): number | undefined {
  const scores: number[] = [];

  if (ratings.fitch && 'rating' in ratings.fitch) {
    const score = normalizeRating(ratings.fitch.rating, ratings.fitch.scale);
    if (score !== 99) scores.push(score);
  }

  if (ratings.sp && 'rating' in ratings.sp) {
    const score = normalizeRating(ratings.sp.rating, ratings.sp.scale);
    if (score !== 99) scores.push(score);
  }

  if (ratings.moodys && 'rating' in ratings.moodys) {
    const score = normalizeRating(ratings.moodys.rating, ratings.moodys.scale);
    if (score !== 99) scores.push(score);
  }

  if (scores.length === 0) return undefined;

  const average = scores.reduce((a, b) => a + b, 0) / scores.length;
  return Math.round(average * 10) / 10; // Round to 1 decimal
}

/**
 * Get rating category from average score
 */
export function getRatingCategory(averageScore: number | undefined): string {
  if (!averageScore) return 'Not Rated';

  if (averageScore <= 7) {
    return 'Prime (AAA to A)';
  } else if (averageScore <= 10) {
    return 'Investment Grade (BBB)';
  } else if (averageScore <= 13) {
    return 'Non-Investment Grade (BB)';
  } else if (averageScore <= 16) {
    return 'Speculative (B)';
  } else if (averageScore <= 19) {
    return 'Highly Speculative (CCC)';
  } else {
    return 'Default/Distressed';
  }
}

/**
 * Format outlook for display
 */
export function formatOutlook(outlook?: string): string {
  if (!outlook || outlook === 'N/A') return '';

  const outlookMap: Record<string, string> = {
    'Stable': '→',
    'Positive': '↑',
    'Negative': '↓',
    'Watch': '⚠',
    'Developing': '?',
  };

  return outlookMap[outlook] || outlook;
}