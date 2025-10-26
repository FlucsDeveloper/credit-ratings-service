/**
 * Seed Ratings Database - POC/Research Mode
 *
 * Fetches ratings for companies from local API (localhost:3000/api/ratings-v2)
 * Implements:
 * - Rate limiting (max 8 concurrent, 250-500ms backoff)
 * - Circuit breaker (3 consecutive failures → 10min pause)
 * - Incremental JSONL output for crash recovery
 * - Progress tracking
 * - Diagnostics logging
 *
 * Ethical guidelines:
 * - Respects robots.txt and ToS
 * - No proxy/evasion tactics
 * - Logs blocks/failures for transparency
 */

import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

const API_BASE_URL = 'http://localhost:3000';
const MAX_CONCURRENT = 8;
const BACKOFF_MS_MIN = 250;
const BACKOFF_MS_MAX = 500;
const CIRCUIT_BREAKER_THRESHOLD = 3;
const CIRCUIT_BREAKER_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

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

  sources_used: string[];
  confidence: number;
  status: 'ok' | 'partial' | 'error' | 'blocked';
  diagnostics?: string[];
  last_checked: string;
}

class CircuitBreaker {
  private consecutiveFailures = 0;
  private lastFailureTime = 0;
  private isOpen = false;

  recordSuccess() {
    this.consecutiveFailures = 0;
    this.isOpen = false;
  }

  recordFailure() {
    this.consecutiveFailures++;
    this.lastFailureTime = Date.now();

    if (this.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
      this.isOpen = true;
      console.log(`\n⚠️  CIRCUIT BREAKER OPEN: ${this.consecutiveFailures} consecutive failures`);
      console.log(`    Pausing for ${CIRCUIT_BREAKER_COOLDOWN_MS / 1000 / 60} minutes...`);
    }
  }

  async checkAndWait(): Promise<boolean> {
    if (!this.isOpen) return true;

    const elapsed = Date.now() - this.lastFailureTime;
    if (elapsed >= CIRCUIT_BREAKER_COOLDOWN_MS) {
      console.log(`\n✅ CIRCUIT BREAKER CLOSED: Cooldown period complete`);
      this.isOpen = false;
      this.consecutiveFailures = 0;
      return true;
    }

    const remaining = CIRCUIT_BREAKER_COOLDOWN_MS - elapsed;
    console.log(`Circuit breaker still open. ${Math.ceil(remaining / 1000)}s remaining...`);
    await this.sleep(10000); // Check every 10 seconds
    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

class RateLimiter {
  private activeRequests = 0;
  private queue: Array<() => void> = [];

  async acquire(): Promise<void> {
    if (this.activeRequests < MAX_CONCURRENT) {
      this.activeRequests++;
      return;
    }

    return new Promise(resolve => {
      this.queue.push(resolve);
    });
  }

  release() {
    this.activeRequests--;
    const next = this.queue.shift();
    if (next) {
      this.activeRequests++;
      next();
    }
  }

  async backoff() {
    const delay = BACKOFF_MS_MIN + Math.random() * (BACKOFF_MS_MAX - BACKOFF_MS_MIN);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}

async function fetchRatingsForCompany(
  company: Company,
  circuitBreaker: CircuitBreaker
): Promise<RatingResult> {
  try {
    const response = await axios.get(`${API_BASE_URL}/api/ratings-v2`, {
      params: { q: company.name },
      timeout: 12000, // 12s timeout per company
    });

    if (response.status === 200 && response.data) {
      const data = response.data;
      circuitBreaker.recordSuccess();

      return {
        legal_name: data.entity?.canonical_name || company.name,
        ticker: company.ticker,
        country: company.country,
        sector: company.sector,
        index: company.index,

        sp_rating: data.sp_global?.rating || undefined,
        sp_outlook: data.sp_global?.outlook || undefined,
        sp_date: data.sp_global?.date || undefined,
        sp_url: data.sp_global?.source_ref || undefined,

        fitch_rating: data.fitch?.rating || undefined,
        fitch_outlook: data.fitch?.outlook || undefined,
        fitch_date: data.fitch?.date || undefined,
        fitch_url: data.fitch?.source_ref || undefined,

        moodys_rating: data.moodys?.rating || undefined,
        moodys_outlook: data.moodys?.outlook || undefined,
        moodys_date: data.moodys?.date || undefined,
        moodys_url: data.moodys?.source_ref || undefined,

        sources_used: data.diagnostics?.sources_attempted || [],
        confidence: data.confidence || 0,
        status: data.status || 'ok',
        diagnostics: data.diagnostics?.errors || undefined,
        last_checked: new Date().toISOString(),
      };
    } else {
      circuitBreaker.recordFailure();
      return createErrorResult(company, 'API returned non-200 status');
    }
  } catch (error: any) {
    circuitBreaker.recordFailure();

    let diagnostics = [error.message];
    if (error.response?.status === 403 || error.response?.status === 429) {
      diagnostics.push('Blocked by rate limiting or access denied');
    }

    return createErrorResult(company, error.message, diagnostics);
  }
}

function createErrorResult(
  company: Company,
  message: string,
  diagnostics: string[] = []
): RatingResult {
  return {
    legal_name: company.name,
    ticker: company.ticker,
    country: company.country,
    sector: company.sector,
    index: company.index,
    sources_used: [],
    confidence: 0,
    status: 'error',
    diagnostics: [message, ...diagnostics],
    last_checked: new Date().toISOString(),
  };
}

async function main() {
  console.log('🚀 Starting ratings seed process...\n');

  // Load company universe
  const dataDir = path.join(__dirname, '..', 'data');
  const companiesPath = path.join(dataDir, 'company_universe.json');

  if (!fs.existsSync(companiesPath)) {
    console.error('❌ Company universe not found. Run generate-universe.ts first.');
    process.exit(1);
  }

  const companies: Company[] = JSON.parse(fs.readFileSync(companiesPath, 'utf-8'));
  console.log(`📊 Loaded ${companies.length} companies from universe\n`);

  // Setup output file (JSONL format)
  const outputPath = path.join(dataDir, 'ratings_seed.jsonl');
  const indexPath = path.join(dataDir, 'index.json');

  // Check if resuming from previous run
  let processed = 0;
  let skipped = 0;
  const processedTickers = new Set<string>();

  if (fs.existsSync(outputPath)) {
    const existingLines = fs.readFileSync(outputPath, 'utf-8').split('\n').filter(Boolean);
    existingLines.forEach(line => {
      try {
        const result = JSON.parse(line);
        processedTickers.add(result.ticker);
        processed++;
      } catch (e) {
        // Skip malformed lines
      }
    });
    console.log(`📂 Resuming from previous run: ${processed} already processed\n`);
  }

  // Initialize rate limiter and circuit breaker
  const rateLimiter = new RateLimiter();
  const circuitBreaker = new CircuitBreaker();

  // Process companies
  const startTime = Date.now();
  let successCount = 0;
  let partialCount = 0;
  let errorCount = 0;

  const index: Record<string, any> = {};

  for (const [idx, company] of companies.entries()) {
    // Skip already processed
    if (processedTickers.has(company.ticker)) {
      skipped++;
      continue;
    }

    // Wait for circuit breaker if open
    while (!(await circuitBreaker.checkAndWait())) {
      // Keep waiting
    }

    // Acquire rate limit slot
    await rateLimiter.acquire();
    await rateLimiter.backoff();

    // Progress update
    const progress = ((idx + 1) / companies.length * 100).toFixed(1);
    process.stdout.write(`\r[${progress}%] Processing ${company.name} (${company.ticker})...`.padEnd(100));

    try {
      const result = await fetchRatingsForCompany(company, circuitBreaker);

      // Append to JSONL (crash-safe incremental write)
      fs.appendFileSync(outputPath, JSON.stringify(result) + '\n');

      // Track stats
      if (result.status === 'ok') successCount++;
      else if (result.status === 'partial') partialCount++;
      else errorCount++;

      // Build index
      const key = result.ticker || result.legal_name.toLowerCase().replace(/[^a-z0-9]/g, '-');
      index[key] = {
        sp: result.sp_url,
        fitch: result.fitch_url,
        moodys: result.moodys_url,
        ir: result.ir_url,
      };

      processed++;
    } finally {
      rateLimiter.release();
    }

    // Periodic checkpoint (every 50 companies)
    if (processed % 50 === 0) {
      fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
    }
  }

  console.log('\n\n✅ Seed complete!\n');
  console.log(`Summary:`);
  console.log(`  - Total companies: ${companies.length}`);
  console.log(`  - Processed: ${processed}`);
  console.log(`  - Skipped (already done): ${skipped}`);
  console.log(`  - Success (ok): ${successCount}`);
  console.log(`  - Partial: ${partialCount}`);
  console.log(`  - Errors: ${errorCount}`);
  console.log(`  - Success rate: ${((successCount / processed) * 100).toFixed(1)}%`);
  console.log(`  - Elapsed: ${((Date.now() - startTime) / 1000 / 60).toFixed(1)} minutes`);

  // Write final index
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
  console.log(`\n📁 Output files:`);
  console.log(`  - ${outputPath}`);
  console.log(`  - ${indexPath}`);
}

main().catch(console.error);
