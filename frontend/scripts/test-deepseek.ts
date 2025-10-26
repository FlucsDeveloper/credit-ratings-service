/**
 * Script de teste para DeepSeek Rating Extractor
 *
 * Testa a extração de ratings para empresas LATAM usando:
 * - Páginas reais de Investor Relations
 * - Validação institucional
 * - Logs detalhados
 */

import { extractRatingWithDeepSeek, extractRatingsBatch } from '../lib/ai/extractRatingWithDeepSeek';
import { fetchHtml } from '../lib/scraper/fetch';

// Casos de teste LATAM
const TEST_CASES = [
  {
    company: 'BTG Pactual',
    url: 'https://ri.btgpactual.com/en/esg/credit-ratings',
    agency: 'fitch' as const,
    expectedRating: 'AA(bra)'
  },
  {
    company: 'Raízen',
    url: 'https://ri.raizen.com.br/governanca-corporativa/classificacao-de-risco/',
    agency: 'fitch' as const,
    expectedRating: 'AA(bra)'
  },
  {
    company: 'Petrobras',
    url: 'https://ri.petrobras.com.br/en/debt-and-ratings/credit-ratings/',
    agency: 'sp' as const,
    expectedRating: 'BB-'
  }
];

/**
 * Teste individual
 */
async function testSingle() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║   DeepSeek Rating Extractor - Teste Individual          ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const testCase = TEST_CASES[0]; // BTG Pactual

  console.log(`🏢 Empresa: ${testCase.company}`);
  console.log(`🔗 URL: ${testCase.url}`);
  console.log(`🏦 Agência: ${testCase.agency}`);
  console.log(`📊 Rating Esperado: ${testCase.expectedRating}\n`);

  console.log('⏳ Baixando HTML...');
  const fetchResult = await fetchHtml(testCase.url, 8000, true);

  if (!fetchResult.html || fetchResult.html.length < 100) {
    console.error('❌ Erro: HTML muito curto ou vazio');
    return;
  }

  console.log(`✅ HTML baixado: ${fetchResult.html.length} caracteres\n`);

  console.log('🤖 Extraindo rating com DeepSeek...');
  const result = await extractRatingWithDeepSeek(
    fetchResult.html,
    testCase.company,
    { agency: testCase.agency }
  );

  console.log('\n' + '='.repeat(60));
  console.log('📋 RESULTADO DA EXTRAÇÃO');
  console.log('='.repeat(60));
  console.log(JSON.stringify(result, null, 2));
  console.log('='.repeat(60));

  // Validação
  if (result.found) {
    console.log('\n✅ Rating encontrado!');
    console.log(`   Rating: ${result.rating}`);
    console.log(`   Agência: ${result.agency}`);
    console.log(`   Outlook: ${result.outlook || 'N/A'}`);
    console.log(`   Confiança: ${((result.confidence || 0) * 100).toFixed(1)}%`);
    console.log(`   Data: ${result.date || 'N/A'}`);

    if (result.rating === testCase.expectedRating) {
      console.log('\n🎯 MATCH! Rating corresponde ao esperado.');
    } else {
      console.log(`\n⚠️  Rating diferente do esperado (${testCase.expectedRating})`);
    }
  } else {
    console.log('\n❌ Rating não encontrado');
    console.log(`   Confiança: ${((result.confidence || 0) * 100).toFixed(1)}%`);
    if (result.error) {
      console.log(`   Erro: ${result.error}`);
    }
  }
}

/**
 * Teste em batch (múltiplas empresas)
 */
async function testBatch() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   DeepSeek Rating Extractor - Teste Batch               ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  console.log(`📦 Testando ${TEST_CASES.length} empresas LATAM...\n`);

  // Baixa HTMLs em paralelo
  console.log('⏳ Baixando páginas...');
  const fetchPromises = TEST_CASES.map(async (tc) => {
    const result = await fetchHtml(tc.url, 8000, true);
    return {
      html: result.html,
      url: tc.url,
      agency: tc.agency,
      company: tc.company,
      expected: tc.expectedRating
    };
  });

  const pages = await Promise.all(fetchPromises);
  console.log(`✅ ${pages.length} páginas baixadas\n`);

  // Extrai ratings em batch por empresa
  for (const page of pages) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`🏢 ${page.company}`);
    console.log(`${'─'.repeat(60)}`);

    const result = await extractRatingWithDeepSeek(
      page.html,
      page.company,
      { agency: page.agency }
    );

    if (result.found) {
      const match = result.rating === page.expected ? '✅' : '⚠️';
      console.log(`${match} Rating: ${result.rating} (esperado: ${page.expected})`);
      console.log(`   Agência: ${result.agency}`);
      console.log(`   Confiança: ${((result.confidence || 0) * 100).toFixed(1)}%`);
      console.log(`   Tokens: ${result.tokens_used || 'N/A'}`);
    } else {
      console.log(`❌ Rating não encontrado`);
      console.log(`   Confiança: ${((result.confidence || 0) * 100).toFixed(1)}%`);
    }
  }
}

/**
 * Teste de notações locais
 */
async function testLocalNotations() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   Teste de Notações Locais LATAM                        ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const htmlSamples = [
    {
      company: 'Test Brasil',
      html: `
        <div class="rating-section">
          <h2>Classificação de Risco</h2>
          <p>A Fitch Ratings atribuiu à empresa rating nacional de longo prazo <strong>AA(bra)</strong>
          com perspectiva estável em dezembro de 2024.</p>
          <p>O rating reflete a forte posição de mercado e qualidade dos ativos.</p>
        </div>
      `,
      expected: 'AA(bra)'
    },
    {
      company: 'Test México',
      html: `
        <div class="calificaciones">
          <h3>Calificación Crediticia</h3>
          <p>Moody's asignó calificación <strong>A1.mx</strong> con perspectiva positiva.</p>
          <p>Fecha: 15 de enero de 2025</p>
        </div>
      `,
      expected: 'A1.mx'
    },
    {
      company: 'Test Colombia',
      html: `
        <section>
          <h2>Credit Ratings</h2>
          <ul>
            <li>S&P Global: BBB+(col) - Outlook Stable</li>
            <li>Fitch: BBB+(col) - Stable</li>
          </ul>
        </section>
      `,
      expected: 'BBB+(col)'
    }
  ];

  for (const sample of htmlSamples) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`🧪 Testando: ${sample.company}`);
    console.log(`${'─'.repeat(60)}`);

    const result = await extractRatingWithDeepSeek(sample.html, sample.company);

    if (result.found && result.rating === sample.expected) {
      console.log(`✅ SUCESSO! Detectou notação local: ${result.rating}`);
      console.log(`   Agência: ${result.agency}`);
      console.log(`   Confiança: ${((result.confidence || 0) * 100).toFixed(1)}%`);
    } else if (result.found) {
      console.log(`⚠️  Detectou rating: ${result.rating} (esperado: ${sample.expected})`);
    } else {
      console.log(`❌ FALHOU - Não detectou rating`);
    }
  }
}

/**
 * Menu principal
 */
async function main() {
  const args = process.argv.slice(2);
  const mode = args[0] || 'single';

  try {
    switch (mode) {
      case 'single':
        await testSingle();
        break;
      case 'batch':
        await testBatch();
        break;
      case 'local':
        await testLocalNotations();
        break;
      case 'all':
        await testSingle();
        await testBatch();
        await testLocalNotations();
        break;
      default:
        console.log('Uso: npx tsx scripts/test-deepseek.ts [single|batch|local|all]');
        console.log('');
        console.log('Modos:');
        console.log('  single - Testa extração individual (BTG Pactual)');
        console.log('  batch  - Testa múltiplas empresas LATAM');
        console.log('  local  - Testa detecção de notações locais');
        console.log('  all    - Executa todos os testes');
        return;
    }

    console.log('\n\n✅ Testes concluídos com sucesso!');
  } catch (error) {
    console.error('\n❌ Erro durante os testes:', error);
    process.exit(1);
  }
}

// Executa
main();
