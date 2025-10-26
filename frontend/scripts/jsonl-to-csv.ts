/**
 * Convert JSONL to CSV
 * Generates ratings_seed.csv from ratings_seed.jsonl
 */

import * as fs from 'fs';
import * as path from 'path';

function jsonlToCsv(jsonlPath: string, csvPath: string) {
  const lines = fs.readFileSync(jsonlPath, 'utf-8').split('\n').filter(Boolean);

  if (lines.length === 0) {
    console.error('No data in JSONL file');
    return;
  }

  // Parse first line to get headers
  const firstRecord = JSON.parse(lines[0]);
  const headers = Object.keys(firstRecord);

  // CSV header
  let csv = headers.join(',') + '\n';

  // Convert each line
  for (const line of lines) {
    const record = JSON.parse(line);
    const values = headers.map(h => {
      const value = record[h];
      if (value === undefined || value === null) return '';
      if (Array.isArray(value)) return `"${value.join('; ')}"`;
      if (typeof value === 'object') return `"${JSON.stringify(value)}"`;
      if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    });
    csv += values.join(',') + '\n';
  }

  fs.writeFileSync(csvPath, csv);
  console.log(`✅ Generated ${csvPath} (${lines.length} rows)`);
}

const dataDir = path.join(__dirname, '..', 'data');
const jsonlPath = path.join(dataDir, 'ratings_seed.jsonl');
const csvPath = path.join(dataDir, 'ratings_seed.csv');

jsonlToCsv(jsonlPath, csvPath);
