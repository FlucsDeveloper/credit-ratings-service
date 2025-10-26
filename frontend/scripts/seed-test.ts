/**
 * Test Seed - Process first 10 companies only
 * Quick validation of the seed pipeline
 */

import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

interface Company {
  ticker: string;
  name: string;
  exchange: string;
  country: string;
  sector?: string;
  index?: string;
}

async function main() {
  console.log('🧪 Testing seed process with first 10 companies...\n');

  const dataDir = path.join(__dirname, '..', 'data');
  const companiesPath = path.join(dataDir, 'company_universe.json');
  const companies: Company[] = JSON.parse(fs.readFileSync(companiesPath, 'utf-8'));

  // Take only first 10 companies
  const testCompanies = companies.slice(0, 10);
  console.log(`Testing with: ${testCompanies.map(c => c.ticker).join(', ')}\n`);

  const outputPath = path.join(dataDir, 'ratings_seed_test.jsonl');
  if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath);
  }

  let successCount = 0;
  let errorCount = 0;

  for (const [idx, company] of testCompanies.entries()) {
    console.log(`[${idx + 1}/10] Fetching ratings for ${company.name} (${company.ticker})...`);

    try {
      const response = await axios.get('http://localhost:3000/api/ratings-v2', {
        params: { q: company.name },
        timeout: 15000,
      });

      if (response.status === 200) {
        const result = {
          ticker: company.ticker,
          name: company.name,
          status: response.data.status,
          sp_rating: response.data.sp_global?.rating,
          fitch_rating: response.data.fitch?.rating,
          moodys_rating: response.data.moodys?.rating,
          confidence: response.data.confidence,
          sources: response.data.diagnostics?.sources_attempted || [],
        };

        fs.appendFileSync(outputPath, JSON.stringify(result) + '\n');
        console.log(`   ✅ Status: ${result.status} | S&P: ${result.sp_rating || 'N/A'} | Fitch: ${result.fitch_rating || 'N/A'} | Moody's: ${result.moodys_rating || 'N/A'}`);
        successCount++;
      } else {
        console.log(`   ❌ HTTP ${response.status}`);
        errorCount++;
      }
    } catch (error: any) {
      console.log(`   ❌ Error: ${error.message}`);
      errorCount++;
    }

    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log(`\n✅ Test complete!`);
  console.log(`   Success: ${successCount}/10`);
  console.log(`   Errors: ${errorCount}/10`);
  console.log(`   Output: ${outputPath}`);
}

main().catch(console.error);
