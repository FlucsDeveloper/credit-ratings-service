/**
 * Production Harvester Script
 *
 * Batch processes companies from data/company_universe.csv
 * Runs for ~60 minutes, processing 6 companies concurrently
 * Outputs: data/extractions.jsonl, data/extractions.csv, data/harvest_checkpoint.json
 *
 * Usage:
 *   npm run harvest:1h          - Start fresh 60-min harvest
 *   npm run harvest:resume      - Resume from checkpoint
 */

import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { deepseekExtract, RatingExtraction } from '../lib/ai/deepseek-extractor';
import { fetchHtml } from '../lib/scraper/fetch';
import { fetchRenderedHtml, appearsJavaScriptRendered } from '../lib/scraper/headless-fetch';
import { validateInstitutional, generateChecksum } from '../lib/validation/institutional-validator';
import { normalizeRating } from '../services/normalize';

interface CompanyRecord {
  name: string;
  country: string;
  ir_url?: string;
  ticker?: string;
  processed?: boolean;
}

interface HarvestCheckpoint {
  lastProcessedIndex: number;
  startTime: string;
  totalProcessed: number;
  successCount: number;
  failCount: number;
}

interface ExtractionRecord {
  id: string;
  timestamp: string;
  company: string;
  country: string;
  ticker?: string;
  status: 'ok' | 'partial' | 'not_found';
  agency?: string;
  rating?: string;
  outlook?: string;
  as_of?: string;
  scale?: string;
  source_confidence: number;
  extraction_confidence: number;
  validation_confidence?: string;
  checksum?: string;
  elapsedMs: number;
  method: 'static' | 'playwright' | 'fallback';
  url: string;
  notes?: string;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const COMPANY_UNIVERSE_PATH = path.join(DATA_DIR, 'company_universe.csv');
const CHECKPOINT_PATH = path.join(DATA_DIR, 'harvest_checkpoint.json');
const JSONL_OUTPUT = path.join(DATA_DIR, 'extractions.jsonl');
const CSV_OUTPUT = path.join(DATA_DIR, 'extractions.csv');

const HARVEST_DURATION_MS = 60 * 60 * 1000; // 60 minutes
const CONCURRENT_COMPANIES = 6;
const BATCH_DELAY_MS = 400;

/**
 * Load company universe from CSV
 */
function loadCompanyUniverse(): CompanyRecord[] {
  if (!fs.existsSync(COMPANY_UNIVERSE_PATH)) {
    console.error(`❌ Company universe not found at: ${COMPANY_UNIVERSE_PATH}`);
    console.log('Create data/company_universe.csv with format: name,country,ir_url,ticker');
    process.exit(1);
  }

  const csv = fs.readFileSync(COMPANY_UNIVERSE_PATH, 'utf-8');
  const lines = csv.split('\n').filter(l => l.trim());
  const header = lines[0].split(',');

  const companies: CompanyRecord[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    if (values.length >= 2) {
      companies.push({
        name: values[0].trim(),
        country: values[1].trim(),
        ir_url: values[2]?.trim() || undefined,
        ticker: values[3]?.trim() || undefined,
      });
    }
  }

  console.log(`✅ Loaded ${companies.length} companies from universe`);
  return companies;
}

/**
 * Load checkpoint or create new one
 */
function loadCheckpoint(resume: boolean): HarvestCheckpoint {
  if (resume && fs.existsSync(CHECKPOINT_PATH)) {
    const checkpoint = JSON.parse(fs.readFileSync(CHECKPOINT_PATH, 'utf-8'));
    console.log(`📂 Resuming from checkpoint (index: ${checkpoint.lastProcessedIndex})`);
    return checkpoint;
  }

  return {
    lastProcessedIndex: -1,
    startTime: new Date().toISOString(),
    totalProcessed: 0,
    successCount: 0,
    failCount: 0,
  };
}

/**
 * Save checkpoint
 */
function saveCheckpoint(checkpoint: HarvestCheckpoint) {
  fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify(checkpoint, null, 2));
}

/**
 * Append extraction to JSONL
 */
function appendToJsonl(extraction: ExtractionRecord) {
  fs.appendFileSync(JSONL_OUTPUT, JSON.stringify(extraction) + '\n');
}

/**
 * Append extraction to CSV
 */
function appendToCsv(extraction: ExtractionRecord, isFirst: boolean) {
  if (isFirst) {
    const header = 'id,timestamp,company,country,ticker,status,agency,rating,outlook,as_of,scale,source_confidence,extraction_confidence,validation_confidence,checksum,elapsedMs,method,url,notes\n';
    fs.writeFileSync(CSV_OUTPUT, header);
  }

  const row = [
    extraction.id,
    extraction.timestamp,
    `"${extraction.company}"`,
    extraction.country,
    extraction.ticker || '',
    extraction.status,
    extraction.agency || '',
    extraction.rating || '',
    extraction.outlook || '',
    extraction.as_of || '',
    extraction.scale || '',
    extraction.source_confidence,
    extraction.extraction_confidence,
    extraction.validation_confidence || '',
    extraction.checksum || '',
    extraction.elapsedMs,
    extraction.method,
    `"${extraction.url}"`,
    `"${extraction.notes || ''}"`,
  ].join(',') + '\n';

  fs.appendFileSync(CSV_OUTPUT, row);
}

/**
 * Process a single company
 */
async function processCompany(company: CompanyRecord): Promise<ExtractionRecord> {
  const startTime = Date.now();
  const id = uuidv4();

  console.log(`\n🔍 Processing: ${company.name} (${company.country})`);

  // Determine URL to scrape
  let targetUrl = company.ir_url;
  if (!targetUrl) {
    console.log(`⚠️  No IR URL provided for ${company.name}, using fallback`);
    targetUrl = `https://www.google.com/search?q=${encodeURIComponent(company.name + ' credit rating')}`;
  }

  console.log(`📥 Fetching: ${targetUrl}`);

  try {
    // Step 1: Try static fetch
    const { html, status } = await fetchHtml(targetUrl, 8000, true);

    if (html.length < 500) {
      console.log(`⚠️  HTML too short (${html.length} chars), may need JavaScript rendering`);

      // Step 2: Check if JavaScript-rendered
      if (appearsJavaScriptRendered(html)) {
        console.log(`🎭 Using Playwright to render JavaScript...`);

        const rendered = await fetchRenderedHtml(targetUrl, 15000);
        const visibleText = rendered.html.substring(0, 8000); // Limit to 8KB

        // Extract with DeepSeek
        const extraction = await deepseekExtract(company.name, visibleText);

        const elapsedMs = Date.now() - startTime;

        if (extraction.found && extraction.rating_raw) {
          // Validate
          const validation = validateInstitutional({
            agency: extraction.agency || 'Other',
            rating: extraction.rating_raw,
            outlook: extraction.outlook || undefined,
            date: extraction.as_of || undefined,
            source_ref: targetUrl,
            method: 'llm',
          }, { requireDate: false });

          console.log(`✅ Found: ${extraction.agency} ${extraction.rating_raw} (Playwright, ${elapsedMs}ms)`);

          return {
            id,
            timestamp: new Date().toISOString(),
            company: company.name,
            country: company.country,
            ticker: company.ticker,
            status: 'ok',
            agency: extraction.agency || undefined,
            rating: extraction.rating_raw || undefined,
            outlook: extraction.outlook || undefined,
            as_of: extraction.as_of || undefined,
            scale: extraction.scale || undefined,
            source_confidence: extraction.source_confidence,
            extraction_confidence: extraction.extraction_confidence,
            validation_confidence: validation.confidence,
            checksum: validation.checksum,
            elapsedMs,
            method: 'playwright',
            url: targetUrl,
            notes: extraction.notes || undefined,
          };
        } else {
          console.log(`❌ No rating found with Playwright (${elapsedMs}ms)`);

          return {
            id,
            timestamp: new Date().toISOString(),
            company: company.name,
            country: company.country,
            ticker: company.ticker,
            status: 'not_found',
            source_confidence: 0,
            extraction_confidence: 0,
            elapsedMs,
            method: 'playwright',
            url: targetUrl,
            notes: extraction.notes || 'No rating found after JavaScript rendering',
          };
        }
      }
    }

    // Step 3: Extract with DeepSeek from static HTML
    const visibleText = html.substring(0, 8000); // Limit to 8KB
    const extraction = await deepseekExtract(company.name, visibleText);

    const elapsedMs = Date.now() - startTime;

    if (extraction.found && extraction.rating_raw) {
      // Validate
      const validation = validateInstitutional({
        agency: extraction.agency || 'Other',
        rating: extraction.rating_raw,
        outlook: extraction.outlook || undefined,
        date: extraction.as_of || undefined,
        source_ref: targetUrl,
        method: 'llm',
      }, { requireDate: false });

      console.log(`✅ Found: ${extraction.agency} ${extraction.rating_raw} (Static, ${elapsedMs}ms)`);

      return {
        id,
        timestamp: new Date().toISOString(),
        company: company.name,
        country: company.country,
        ticker: company.ticker,
        status: 'ok',
        agency: extraction.agency || undefined,
        rating: extraction.rating_raw || undefined,
        outlook: extraction.outlook || undefined,
        as_of: extraction.as_of || undefined,
        scale: extraction.scale || undefined,
        source_confidence: extraction.source_confidence,
        extraction_confidence: extraction.extraction_confidence,
        validation_confidence: validation.confidence,
        checksum: validation.checksum,
        elapsedMs,
        method: 'static',
        url: targetUrl,
        notes: extraction.notes || undefined,
      };
    } else {
      console.log(`❌ No rating found (${elapsedMs}ms)`);

      return {
        id,
        timestamp: new Date().toISOString(),
        company: company.name,
        country: company.country,
        ticker: company.ticker,
        status: 'not_found',
        source_confidence: 0,
        extraction_confidence: 0,
        elapsedMs,
        method: 'static',
        url: targetUrl,
        notes: extraction.notes || 'No rating found in static HTML',
      };
    }

  } catch (error: any) {
    const elapsedMs = Date.now() - startTime;
    console.log(`❌ Error: ${error.message} (${elapsedMs}ms)`);

    return {
      id,
      timestamp: new Date().toISOString(),
      company: company.name,
      country: company.country,
      ticker: company.ticker,
      status: 'not_found',
      source_confidence: 0,
      extraction_confidence: 0,
      elapsedMs,
      method: 'fallback',
      url: targetUrl,
      notes: `Error: ${error.message}`,
    };
  }
}

/**
 * Main harvester loop
 */
async function runHarvester(resume: boolean) {
  console.log('🚀 DeepSeek Credit Ratings Harvester');
  console.log(`⏱️  Duration: 60 minutes`);
  console.log(`⚡ Concurrency: ${CONCURRENT_COMPANIES} companies`);
  console.log('');

  // Create data directory if needed
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Load universe and checkpoint
  const companies = loadCompanyUniverse();
  const checkpoint = loadCheckpoint(resume);

  const harvestStartTime = Date.now();
  const endTime = harvestStartTime + HARVEST_DURATION_MS;

  let processedCount = 0;
  let currentIndex = checkpoint.lastProcessedIndex + 1;
  let isFirstExtraction = !resume || !fs.existsSync(JSONL_OUTPUT);

  while (currentIndex < companies.length && Date.now() < endTime) {
    // Process batch of companies concurrently
    const batch = companies.slice(currentIndex, currentIndex + CONCURRENT_COMPANIES);

    console.log(`\n📦 Batch ${Math.floor(currentIndex / CONCURRENT_COMPANIES) + 1} (companies ${currentIndex + 1}-${currentIndex + batch.length})`);

    const results = await Promise.allSettled(
      batch.map(company => processCompany(company))
    );

    // Save results
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'fulfilled') {
        const extraction = result.value;

        // Append to JSONL and CSV
        appendToJsonl(extraction);
        appendToCsv(extraction, isFirstExtraction && i === 0);
        isFirstExtraction = false;

        // Update stats
        processedCount++;
        if (extraction.status === 'ok' || extraction.status === 'partial') {
          checkpoint.successCount++;
        } else {
          checkpoint.failCount++;
        }
      }
    }

    // Update checkpoint
    currentIndex += batch.length;
    checkpoint.lastProcessedIndex = currentIndex - 1;
    checkpoint.totalProcessed = processedCount;
    saveCheckpoint(checkpoint);

    // Status update
    const elapsed = Date.now() - harvestStartTime;
    const remaining = endTime - Date.now();
    console.log(`\n📊 Progress: ${processedCount} processed | ${checkpoint.successCount} success | ${checkpoint.failCount} failed`);
    console.log(`⏱️  Elapsed: ${Math.floor(elapsed / 1000)}s | Remaining: ${Math.floor(remaining / 1000)}s`);

    // Delay between batches
    if (currentIndex < companies.length && Date.now() < endTime) {
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  // Final summary
  console.log('\n');
  console.log('✅ Harvest complete!');
  console.log(`📊 Total processed: ${processedCount}`);
  console.log(`✅ Success: ${checkpoint.successCount}`);
  console.log(`❌ Failed: ${checkpoint.failCount}`);
  console.log(`📁 Output: ${JSONL_OUTPUT}`);
  console.log(`📁 Output: ${CSV_OUTPUT}`);
  console.log(`📁 Checkpoint: ${CHECKPOINT_PATH}`);
}

// Run harvester
const resume = process.argv.includes('--resume');
runHarvester(resume).catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
