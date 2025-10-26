/**
 * Test DeepSeek Ratings Service (AI SDK Integration)
 *
 * Tests the new primary rating extraction service using:
 * - AI SDK with structured output
 * - DeepSeek as provider
 * - Institutional-grade extraction
 */

import {
  extractRatingWithDeepSeek,
  fetchAndExtractRating,
  extractAllAgencies
} from '../lib/ai/deepseek-ratings-service';

console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║   DeepSeek Ratings Service - AI SDK Test                ║');
console.log('╚══════════════════════════════════════════════════════════╝\n');

// ============================================================================
// TEST 1: Extract from Synthetic HTML
// ============================================================================
async function test1_SyntheticHTML() {
  console.log('📋 TEST 1: Synthetic HTML Extraction');
  console.log('='.repeat(60) + '\n');

  const htmlBrasil = `
    <div class="investor-relations">
      <h1>Relações com Investidores - BTG Pactual</h1>

      <section class="credit-ratings">
        <h2>Classificações de Risco de Crédito</h2>

        <div class="rating-card">
          <h3>Fitch Ratings</h3>
          <p><strong>Rating Nacional de Longo Prazo:</strong> AA(bra)</p>
          <p><strong>Perspectiva:</strong> Estável</p>
          <p><strong>Data da Atribuição:</strong> 15 de dezembro de 2024</p>
          <p>
            A Fitch Ratings atribuiu o rating nacional de longo prazo AA(bra)
            ao Banco BTG Pactual S.A. com perspectiva estável. O rating reflete
            a sólida posição de mercado do banco no segmento de investment banking
            e gestão de patrimônio no Brasil.
          </p>
        </div>
      </section>
    </div>
  `;

  console.log('🏢 Company: BTG Pactual');
  console.log('🎯 Agency: Fitch');
  console.log('📄 HTML Length:', htmlBrasil.length, 'chars\n');

  console.log('🤖 Calling DeepSeek with AI SDK...\n');

  const result = await extractRatingWithDeepSeek(htmlBrasil, 'BTG Pactual', 'fitch');

  console.log('✅ EXTRACTION RESULT:');
  console.log('─'.repeat(60));
  console.log(JSON.stringify(result, null, 2));
  console.log('─'.repeat(60) + '\n');

  if (result.found) {
    console.log('✅ SUCCESS!');
    console.log(`   Rating: ${result.rating}`);
    console.log(`   Agency: ${result.agency}`);
    console.log(`   Outlook: ${result.outlook}`);
    console.log(`   Confidence: ${(result.confidence * 100).toFixed(1)}%`);
    console.log(`   Date: ${result.date}`);
    console.log(`   Reasoning: ${result.reasoning}\n`);
  } else {
    console.log('❌ No rating found');
    console.log(`   Reasoning: ${result.reasoning}\n`);
  }
}

// ============================================================================
// TEST 2: Real IR Page Extraction (BTG Pactual)
// ============================================================================
async function test2_RealPage() {
  console.log('\n📋 TEST 2: Real IR Page Extraction');
  console.log('='.repeat(60) + '\n');

  const company = 'BTG Pactual';
  const irUrl = 'https://ri.btgpactual.com/en/esg/credit-ratings';

  console.log(`🏢 Company: ${company}`);
  console.log(`🔗 URL: ${irUrl}`);
  console.log(`🎯 Agency: Fitch\n`);

  console.log('⏳ Fetching IR page and extracting...\n');

  const result = await fetchAndExtractRating(company, irUrl, 'fitch');

  console.log('✅ EXTRACTION RESULT:');
  console.log('─'.repeat(60));
  console.log(JSON.stringify(result, null, 2));
  console.log('─'.repeat(60) + '\n');

  if (result.found) {
    console.log('✅ SUCCESS!');
    console.log(`   Rating: ${result.rating}`);
    console.log(`   Agency: ${result.agency}`);
    console.log(`   Outlook: ${result.outlook}`);
    console.log(`   Confidence: ${(result.confidence * 100).toFixed(1)}%`);
    console.log(`   Date: ${result.date}\n`);
  } else {
    console.log('❌ No rating found');
    console.log(`   Reasoning: ${result.reasoning}\n`);
  }
}

// ============================================================================
// TEST 3: Multi-Agency Parallel Extraction
// ============================================================================
async function test3_MultiAgency() {
  console.log('\n📋 TEST 3: Multi-Agency Parallel Extraction');
  console.log('='.repeat(60) + '\n');

  const company = 'Petrobras';
  const irUrls = {
    sp: 'https://ri.petrobras.com.br/en/debt-and-ratings/credit-ratings/',
    fitch: 'https://ri.petrobras.com.br/en/debt-and-ratings/credit-ratings/',
    moodys: 'https://ri.petrobras.com.br/en/debt-and-ratings/credit-ratings/'
  };

  console.log(`🏢 Company: ${company}`);
  console.log(`📊 Extracting from 3 agencies in parallel...\n`);

  const startTime = Date.now();
  const results = await extractAllAgencies(company, irUrls);
  const elapsed = Date.now() - startTime;

  console.log('✅ BATCH EXTRACTION COMPLETE');
  console.log('─'.repeat(60));
  console.log(`⏱️  Total Time: ${(elapsed / 1000).toFixed(2)}s\n`);

  // S&P
  console.log('📊 S&P Global:');
  if (results.sp) {
    console.log(`   ✅ ${results.sp.rating} - ${results.sp.outlook || 'N/A'}`);
    console.log(`   Confidence: ${((results.sp.confidence_score || 0) * 100).toFixed(1)}%`);
  } else {
    console.log('   ❌ Not found');
  }

  // Fitch
  console.log('\n📊 Fitch Ratings:');
  if (results.fitch) {
    console.log(`   ✅ ${results.fitch.rating} - ${results.fitch.outlook || 'N/A'}`);
    console.log(`   Confidence: ${((results.fitch.confidence_score || 0) * 100).toFixed(1)}%`);
  } else {
    console.log('   ❌ Not found');
  }

  // Moody's
  console.log('\n📊 Moody\'s:');
  if (results.moodys) {
    console.log(`   ✅ ${results.moodys.rating} - ${results.moodys.outlook || 'N/A'}`);
    console.log(`   Confidence: ${((results.moodys.confidence_score || 0) * 100).toFixed(1)}%`);
  } else {
    console.log('   ❌ Not found');
  }

  const foundCount = [results.sp, results.fitch, results.moodys].filter(Boolean).length;
  console.log(`\n📈 Summary: ${foundCount}/3 agencies found\n`);
}

// ============================================================================
// TEST 4: LATAM Local Notations
// ============================================================================
async function test4_LocalNotations() {
  console.log('\n📋 TEST 4: LATAM Local Scale Notations');
  console.log('='.repeat(60) + '\n');

  const testCases = [
    {
      country: '🇧🇷 Brasil',
      company: 'Raízen',
      html: `
        <div class="ratings">
          <h2>Classificação de Risco</h2>
          <p>A Fitch Ratings atribuiu rating nacional de longo prazo
          <strong>AA(bra)</strong> com perspectiva estável em dezembro de 2024.</p>
        </div>
      `,
      expected: 'AA(bra)'
    },
    {
      country: '🇲🇽 México',
      company: 'Cemex',
      html: `
        <div class="calificaciones">
          <h3>Moody's Investors Service</h3>
          <p>Calificación Nacional: <strong>A1.mx</strong></p>
          <p>Perspectiva: Positiva (2025)</p>
        </div>
      `,
      expected: 'A1.mx'
    },
    {
      country: '🇨🇴 Colombia',
      company: 'Ecopetrol',
      html: `
        <section>
          <h2>Credit Ratings</h2>
          <p>S&P Global asignó <b>BBB+(col)</b> - Outlook Stable</p>
          <p>Date: January 2025</p>
        </section>
      `,
      expected: 'BBB+(col)'
    }
  ];

  for (const tc of testCases) {
    console.log(`${tc.country} - ${tc.company}`);
    console.log(`   Expected: ${tc.expected}`);

    const result = await extractRatingWithDeepSeek(tc.html, tc.company);

    if (result.found && result.rating === tc.expected) {
      console.log(`   ✅ MATCH! ${result.rating} (${(result.confidence * 100).toFixed(0)}% confidence)`);
    } else if (result.found) {
      console.log(`   ⚠️  Found: ${result.rating} (expected: ${tc.expected})`);
    } else {
      console.log(`   ❌ Not found: ${result.reasoning}`);
    }
    console.log('');
  }
}

// ============================================================================
// Main Menu
// ============================================================================
async function main() {
  const args = process.argv.slice(2);
  const test = args[0] || '1';

  try {
    switch (test) {
      case '1':
        await test1_SyntheticHTML();
        break;
      case '2':
        await test2_RealPage();
        break;
      case '3':
        await test3_MultiAgency();
        break;
      case '4':
        await test4_LocalNotations();
        break;
      case 'all':
        await test1_SyntheticHTML();
        await test2_RealPage();
        await test3_MultiAgency();
        await test4_LocalNotations();
        break;
      default:
        console.log('Usage: npx tsx scripts/test-deepseek-service.ts [1|2|3|4|all]\n');
        console.log('Tests:');
        console.log('  1 - Synthetic HTML extraction');
        console.log('  2 - Real IR page (BTG Pactual)');
        console.log('  3 - Multi-agency parallel extraction (Petrobras)');
        console.log('  4 - LATAM local scale notations');
        console.log('  all - Run all tests');
        return;
    }

    console.log('✅ Test completed successfully!\n');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

main();
