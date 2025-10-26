/**
 * Quality Assurance Script
 *
 * Analyzes the last 50 extractions from data/extractions.jsonl
 * Provides summary statistics and quality metrics
 *
 * Usage:
 *   npm run qa:sample
 */

import * as fs from 'fs';
import * as path from 'path';

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
const JSONL_PATH = path.join(DATA_DIR, 'extractions.jsonl');

/**
 * Load last N extractions from JSONL
 */
function loadLastExtractions(n: number): ExtractionRecord[] {
  if (!fs.existsSync(JSONL_PATH)) {
    console.error(`❌ Extractions file not found: ${JSONL_PATH}`);
    return [];
  }

  const lines = fs.readFileSync(JSONL_PATH, 'utf-8')
    .split('\n')
    .filter(l => l.trim());

  const extractions: ExtractionRecord[] = [];
  const startIndex = Math.max(0, lines.length - n);

  for (let i = startIndex; i < lines.length; i++) {
    try {
      const extraction = JSON.parse(lines[i]);
      extractions.push(extraction);
    } catch (error) {
      console.warn(`⚠️  Failed to parse line ${i + 1}`);
    }
  }

  return extractions;
}

/**
 * Calculate statistics
 */
function calculateStats(extractions: ExtractionRecord[]) {
  const total = extractions.length;
  const ok = extractions.filter(e => e.status === 'ok').length;
  const partial = extractions.filter(e => e.status === 'partial').length;
  const notFound = extractions.filter(e => e.status === 'not_found').length;

  const staticMethod = extractions.filter(e => e.method === 'static').length;
  const playwrightMethod = extractions.filter(e => e.method === 'playwright').length;
  const fallbackMethod = extractions.filter(e => e.method === 'fallback').length;

  const avgElapsed = extractions.reduce((sum, e) => sum + e.elapsedMs, 0) / total;
  const avgSourceConf = extractions.reduce((sum, e) => sum + e.source_confidence, 0) / total;
  const avgExtractConf = extractions.reduce((sum, e) => sum + e.extraction_confidence, 0) / total;

  // Agency breakdown
  const agencies = extractions
    .filter(e => e.agency)
    .reduce((acc, e) => {
      acc[e.agency!] = (acc[e.agency!] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

  // Validation confidence breakdown
  const validationConf = extractions
    .filter(e => e.validation_confidence)
    .reduce((acc, e) => {
      acc[e.validation_confidence!] = (acc[e.validation_confidence!] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

  // Country breakdown
  const countries = extractions.reduce((acc, e) => {
    acc[e.country] = (acc[e.country] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Scale breakdown
  const scales = extractions
    .filter(e => e.scale)
    .reduce((acc, e) => {
      acc[e.scale!] = (acc[e.scale!] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

  return {
    total,
    ok,
    partial,
    notFound,
    staticMethod,
    playwrightMethod,
    fallbackMethod,
    avgElapsed: Math.round(avgElapsed),
    avgSourceConf: avgSourceConf.toFixed(2),
    avgExtractConf: avgExtractConf.toFixed(2),
    agencies,
    validationConf,
    countries,
    scales,
  };
}

/**
 * Display top companies
 */
function displayTopCompanies(extractions: ExtractionRecord[], limit: number = 10) {
  console.log(`\n📋 Top ${limit} Recent Extractions:\n`);

  const recent = extractions.slice(-limit).reverse();

  for (const ext of recent) {
    const statusEmoji = ext.status === 'ok' ? '✅' : ext.status === 'partial' ? '⚠️' : '❌';
    const ratingInfo = ext.rating
      ? `${ext.agency} ${ext.rating}${ext.outlook ? ' (' + ext.outlook + ')' : ''}`
      : 'No rating';

    console.log(`${statusEmoji} ${ext.company} (${ext.country})`);
    console.log(`   Rating: ${ratingInfo}`);
    console.log(`   Method: ${ext.method} | Elapsed: ${ext.elapsedMs}ms | Confidence: ${ext.extraction_confidence.toFixed(2)}`);
    if (ext.notes) {
      console.log(`   Notes: ${ext.notes.substring(0, 80)}`);
    }
    console.log('');
  }
}

/**
 * Main QA function
 */
function runQA() {
  console.log('🔍 DeepSeek Harvester - Quality Assurance Report\n');

  // Load last 50 extractions
  const extractions = loadLastExtractions(50);

  if (extractions.length === 0) {
    console.log('❌ No extractions found. Run harvester first: npm run harvest:1h');
    return;
  }

  console.log(`📊 Analyzing ${extractions.length} most recent extractions...\n`);

  // Calculate stats
  const stats = calculateStats(extractions);

  // Display summary
  console.log('📈 Summary Statistics:\n');
  console.log(`Total Extractions:     ${stats.total}`);
  console.log(`✅ Success (ok):        ${stats.ok} (${((stats.ok / stats.total) * 100).toFixed(1)}%)`);
  console.log(`⚠️  Partial:            ${stats.partial} (${((stats.partial / stats.total) * 100).toFixed(1)}%)`);
  console.log(`❌ Not Found:          ${stats.notFound} (${((stats.notFound / stats.total) * 100).toFixed(1)}%)`);
  console.log('');

  console.log('⚡ Method Breakdown:\n');
  console.log(`Static Fetch:          ${stats.staticMethod} (${((stats.staticMethod / stats.total) * 100).toFixed(1)}%)`);
  console.log(`Playwright Render:     ${stats.playwrightMethod} (${((stats.playwrightMethod / stats.total) * 100).toFixed(1)}%)`);
  console.log(`Fallback:              ${stats.fallbackMethod} (${((stats.fallbackMethod / stats.total) * 100).toFixed(1)}%)`);
  console.log('');

  console.log('⏱️  Performance:\n');
  console.log(`Avg Elapsed Time:      ${stats.avgElapsed}ms`);
  console.log(`Avg Source Conf:       ${stats.avgSourceConf}`);
  console.log(`Avg Extraction Conf:   ${stats.avgExtractConf}`);
  console.log('');

  // Agency breakdown
  if (Object.keys(stats.agencies).length > 0) {
    console.log('🏛️  Agency Breakdown:\n');
    for (const [agency, count] of Object.entries(stats.agencies)) {
      console.log(`${agency}: ${count}`);
    }
    console.log('');
  }

  // Validation confidence
  if (Object.keys(stats.validationConf).length > 0) {
    console.log('✓ Validation Confidence:\n');
    for (const [conf, count] of Object.entries(stats.validationConf)) {
      console.log(`${conf}: ${count}`);
    }
    console.log('');
  }

  // Country breakdown
  console.log('🌎 Country Breakdown:\n');
  const sortedCountries = Object.entries(stats.countries)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  for (const [country, count] of sortedCountries) {
    console.log(`${country}: ${count}`);
  }
  console.log('');

  // Scale breakdown
  if (Object.keys(stats.scales).length > 0) {
    console.log('📊 Scale Breakdown:\n');
    for (const [scale, count] of Object.entries(stats.scales)) {
      console.log(`${scale}: ${count}`);
    }
    console.log('');
  }

  // Display top companies
  displayTopCompanies(extractions, 10);

  // Quality warnings
  console.log('⚠️  Quality Warnings:\n');

  const lowConfExtractions = extractions.filter(e => e.extraction_confidence < 0.5);
  if (lowConfExtractions.length > 0) {
    console.log(`⚠️  ${lowConfExtractions.length} extractions with low confidence (<0.5)`);
  }

  const slowExtractions = extractions.filter(e => e.elapsedMs > 10000);
  if (slowExtractions.length > 0) {
    console.log(`⚠️  ${slowExtractions.length} extractions took >10s`);
  }

  const validationRejected = extractions.filter(e => e.validation_confidence === 'rejected');
  if (validationRejected.length > 0) {
    console.log(`⚠️  ${validationRejected.length} extractions rejected by validation`);
  }

  if (lowConfExtractions.length === 0 && slowExtractions.length === 0 && validationRejected.length === 0) {
    console.log('✅ No quality issues detected');
  }

  console.log('');
  console.log('✅ QA Report Complete');
}

// Run QA
runQA();
