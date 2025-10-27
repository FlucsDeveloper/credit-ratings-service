/**
 * Rating Normalizer for v3
 * Converts ratings to 0-100 scale
 */

import { RatingEntry } from '@/lib/ai/deepseek-extractor-v3';

const SP_FITCH_SCALE: Record<string, number> = {
  'AAA': 22, 'AA+': 21, 'AA': 20, 'AA-': 19,
  'A+': 18, 'A': 17, 'A-': 16,
  'BBB+': 15, 'BBB': 14, 'BBB-': 13,
  'BB+': 12, 'BB': 11, 'BB-': 10,
  'B+': 9, 'B': 8, 'B-': 7,
  'CCC+': 6, 'CCC': 5, 'CCC-': 4,
  'CC': 3, 'C': 2, 'D': 1,
};

const MOODYS_SCALE: Record<string, number> = {
  'Aaa': 22, 'Aa1': 21, 'Aa2': 20, 'Aa3': 19,
  'A1': 18, 'A2': 17, 'A3': 16,
  'Baa1': 15, 'Baa2': 14, 'Baa3': 13,
  'Ba1': 12, 'Ba2': 11, 'Ba3': 10,
  'B1': 9, 'B2': 8, 'B3': 7,
  'Caa1': 6, 'Caa2': 5, 'Caa3': 4,
  'Ca': 3, 'C': 2,
};

export function ratingTo100(rating_raw: string | null, scale: string | null): number | null {
  if (!rating_raw || !scale) return null;

  const normalized = rating_raw.toUpperCase().trim();

  if (scale === 'SP_FITCH') {
    return SP_FITCH_SCALE[normalized] ?? null;
  }

  if (scale === 'MOODYS') {
    // Try exact match first
    for (const [key, value] of Object.entries(MOODYS_SCALE)) {
      if (key.toLowerCase() === rating_raw.toLowerCase()) {
        return value;
      }
    }
  }

  if (scale === 'LOCAL') {
    // Local scales don't normalize to global 0-100
    return null;
  }

  return null;
}

export interface NormalizedEntry extends RatingEntry {
  normalized_score: number | null;
  isLocal: boolean;
}

export function normalizeEntries(entries: RatingEntry[]): NormalizedEntry[] {
  return entries.map((entry) => ({
    ...entry,
    normalized_score: ratingTo100(entry.rating_raw, entry.scale),
    isLocal: entry.scale === 'LOCAL',
  }));
}
