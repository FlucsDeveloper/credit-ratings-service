const RATING_SCALE: Record<string, number> = {
  'AAA': 1, 'Aaa': 1,
  'AA+': 2, 'Aa1': 2,
  'AA': 3, 'Aa2': 3,
  'AA-': 4, 'Aa3': 4,
  'A+': 5, 'A1': 5,
  'A': 6, 'A2': 6,
  'A-': 7, 'A3': 7,
  'BBB+': 8, 'Baa1': 8,
  'BBB': 9, 'Baa2': 9,
  'BBB-': 10, 'Baa3': 10,
  'BB+': 11, 'Ba1': 11,
  'BB': 12, 'Ba2': 12,
  'BB-': 13, 'Ba3': 13,
  'B+': 14, 'B1': 14,
  'B': 15, 'B2': 15,
  'B-': 16, 'B3': 16,
  'CCC+': 17, 'Caa1': 17,
  'CCC': 18, 'Caa2': 18,
  'CCC-': 19, 'Caa3': 19,
  'CC': 20, 'Ca': 20,
  'C': 21, 'D': 21, 'SD': 21, 'NR': 0,
};

export function normalizeRating(rating: string | undefined): number {
  if (!rating) return 0;
  const normalized = RATING_SCALE[rating.trim()];
  return normalized !== undefined ? normalized : 0;
}

export function getRatingCategory(normalized: number): string {
  if (normalized === 0) return 'Not Rated';
  if (normalized <= 10) return 'Investment Grade';
  if (normalized <= 16) return 'High Yield (Speculative)';
  return 'Very High Risk';
}