/**
 * Partial Seed - Process first 50 companies for validation
 * Creates production-ready dataset for QA and documentation
 */

import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

const API_BASE_URL = 'http://localhost:3000';
const COMPANIES_TO_PROCESS = 50;
const BACKOFF_MS = 500;

interface Company {
  ticker: string;
  name: string;
  exchange: string;
  country: string;
  sector?: string;
  index?: string;
}

interface RatingResult {
  legal_name: string;
  ticker: string;
  isin?: string;
  lei?: string;
  country: string;
  sector?: string;
  index?: string;

  sp_rating?: string;
  sp_outlook?: string;
  sp_date?: string;
  sp_url?: string;

  fitch_rating?: string;
  fitch_outlook?: string;
  fitch_date?: string;
  fitch_url?: string;

  moodys_rating?: string;
  moodys_outlook?: string;
  moodys_date?: string;
  moodys_url?: string;

  ir_url?: string;

  rating_norm_1_21_avg?: number;
  rating_norm_0_100_avg?: number;

  sources_used: string[];
  confidence: number;
  status: 'ok' | 'partial' | 'error';
  diagnostics?: string[];
  last_checked: string;
}

async function fetchRatingsForCompany(company: Company): Promise<RatingResult> {
  try {
    const response = await axios.get(`${API_BASE_URL}/api/ratings-v2`, {
      params: { q: company.name },
      timeout: 15000,
    });

    if (response.status === 200 && response.data) {
      const data = response.data;

      // Calculate normalized averages
      const ratings = data.ratings || [];
      const normScores = ratings.map((r: any) => r.rating_norm).filter((n: any) => n != null);
      const avgNorm1_21 = normScores.length > 0
        ? normScores.reduce((a: number, b: number) => a + b, 0) / normScores.length
        : undefined;
      const avgNorm0_100 = avgNorm1_21 ? ((avgNorm1_21 - 1) / 20) * 100 : undefined;

      return {
        legal_name: data.entity?.legal_name || company.name,
        ticker: company.ticker,
        isin: data.entity?.isin || undefined,
        lei: data.entity?.lei || undefined,
        country: company.country,
        sector: company.sector,
        index: company.index,

        sp_rating: data.ratings?.find((r: any) => r.agency === 'S&P Global')?.rating || undefined,
        sp_outlook: data.ratings?.find((r: any) => r.agency === 'S&P Global')?.outlook || undefined,
        sp_date: data.ratings?.find((r: any) => r.agency === 'S&P Global')?.date || undefined,
        sp_url: data.ratings?.find((r: any) => r.agency === 'S&P Global')?.source_ref || undefined,

        fitch_rating: data.ratings?.find((r: any) => r.agency === 'Fitch')?.rating || undefined,
        fitch_outlook: data.ratings?.find((r: any) => r.agency === 'Fitch')?.outlook || undefined,
        fitch_date: data.ratings?.find((r: any) => r.agency === 'Fitch')?.date || undefined,
        fitch_url: data.ratings?.find((r: any) => r.agency === 'Fitch')?.source_ref || undefined,

        moodys_rating: data.ratings?.find((r: any) => r.agency === "Moody's")?.rating || undefined,
        moodys_outlook: data.ratings?.find((r: any) => r.agency === "Moody's")?.outlook || undefined,
        moodys_date: data.ratings?.find((r: any) => r.agency === "Moody's")?.date || undefined,
        moodys_url: data.ratings?.find((r: any) => r.agency === "Moody's")?.source_ref || undefined,

        rating_norm_1_21_avg: avgNorm1_21,
        rating_norm_0_100_avg: avgNorm0_100,

        sources_used: data.diagnostics?.sources || [],
        confidence: data.summary?.agenciesFound ? data.summary.agenciesFound / 3 : 0,
        status: data.status || 'ok',
        diagnostics: data.diagnostics?.errors || undefined,
        last_checked: new Date().toISOString(),
      };
    } else {
      return createErrorResult(company, `API returned status ${response.status}`);
    }
  } catch (error: any) {
    return createErrorResult(company, error.message);
  }
}

function createErrorResult(company: Company, message: string): RatingResult {
  return {
    legal_name: company.name,
    ticker: company.ticker,
    country: company.country,
    sector: company.sector,
    index: company.index,
    sources_used: [],
    confidence: 0,
    status: 'error',
    diagnostics: [message],
    last_checked: new Date().toISOString(),
  };
}

async function main() {
  console.log(`🚀 Partial seed: Processing first ${COMPANIES_TO_PROCESS} companies...\n`);

  const dataDir = path.join(__dirname, '..', 'data');
  const companiesPath = path.join(dataDir, 'company_universe.json');
  const companies: Company[] = JSON.parse(fs.readFileSync(companiesPath, 'utf-8'));

  const subset = companies.slice(0, COMPANIES_TO_PROCESS);
  console.log(`Companies: ${subset.map(c => c.ticker).slice(0, 10).join(', ')}, ...\n`);

  const outputPath = path.join(dataDir, 'ratings_seed.jsonl');
  const indexPath = path.join(dataDir, 'index.json');

  // Clear previous partial runs
  if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
  if (fs.existsSync(indexPath)) fs.unlinkSync(indexPath);

  const startTime = Date.now();
  let successCount = 0;
  let partialCount = 0;
  let errorCount = 0;

  const index: Record<string, any> = {};

  for (const [idx, company] of subset.entries()) {
    const progress = ((idx + 1) / subset.length * 100).toFixed(1);
    process.stdout.write(`\r[${progress}%] ${company.ticker.padEnd(8)} ${company.name.substring(0, 40).padEnd(40)}...`);

    const result = await fetchRatingsForCompany(company);

    // Write to JSONL
    fs.appendFileSync(outputPath, JSON.stringify(result) + '\n');

    // Track stats
    if (result.status === 'ok') successCount++;
    else if (result.status === 'partial') partialCount++;
    else errorCount++;

    // Build index
    const key = result.ticker;
    index[key] = {
      sp: result.sp_url,
      fitch: result.fitch_url,
      moodys: result.moodys_url,
      ir: result.ir_url,
    };

    await new Promise(resolve => setTimeout(resolve, BACKOFF_MS));
  }

  console.log('\n\n✅ Partial seed complete!\n');
  console.log(`Summary:`);
  console.log(`  - Processed: ${COMPANIES_TO_PROCESS}`);
  console.log(`  - Success (ok): ${successCount} (${(successCount/COMPANIES_TO_PROCESS*100).toFixed(1)}%)`);
  console.log(`  - Partial: ${partialCount}`);
  console.log(`  - Errors: ${errorCount}`);
  console.log(`  - Elapsed: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

  // Write index
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));

  console.log(`\n📁 Output files:`);
  console.log(`  - ${outputPath}`);
  console.log(`  - ${indexPath}`);
}

main().catch(console.error);
