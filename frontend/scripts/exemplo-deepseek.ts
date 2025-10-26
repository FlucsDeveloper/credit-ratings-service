/**
 * 📚 EXEMPLO COMPLETO - DeepSeek Rating Extractor
 *
 * Este script demonstra como usar o DeepSeek para extrair ratings
 * de empresas LATAM em diferentes cenários reais.
 */

import { extractRatingWithDeepSeek } from '../lib/ai/extractRatingWithDeepSeek';
import { fetchHtml } from '../lib/scraper/fetch';
import { validateInstitutional } from '../lib/validation/institutional-validator';

console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║        EXEMPLO PRÁTICO - DeepSeek Rating Extractor      ║');
console.log('╚══════════════════════════════════════════════════════════╝\n');

// ============================================================================
// EXEMPLO 1: Extração de HTML Sintético (Mais Rápido)
// ============================================================================
async function exemplo1_HTMLSintetico() {
  console.log('📋 EXEMPLO 1: Extração de HTML Sintético');
  console.log('=' .repeat(60) + '\n');

  // HTML de exemplo (simulando uma página de IR)
  const htmlBrasileiro = `
    <div class="investor-relations">
      <h2>Classificação de Risco de Crédito</h2>
      <div class="rating-info">
        <p><strong>Agência:</strong> Fitch Ratings</p>
        <p><strong>Rating Nacional (Longo Prazo):</strong> AA(bra)</p>
        <p><strong>Perspectiva:</strong> Estável</p>
        <p><strong>Data da Atribuição:</strong> 15 de dezembro de 2024</p>
        <p>
          A Fitch Ratings atribuiu o rating nacional de longo prazo AA(bra)
          à BTG Pactual com perspectiva estável. O rating reflete a forte
          posição de mercado do banco no segmento de investment banking.
        </p>
      </div>
    </div>
  `;

  console.log('📄 HTML de Entrada:');
  console.log(htmlBrasileiro.slice(0, 200) + '...\n');

  console.log('🤖 Chamando DeepSeek...\n');

  const resultado = await extractRatingWithDeepSeek(
    htmlBrasileiro,
    'BTG Pactual',
    { agency: 'fitch' }
  );

  console.log('✅ RESULTADO DA EXTRAÇÃO:');
  console.log('─'.repeat(60));
  console.log(`Found: ${resultado.found}`);
  console.log(`Rating: ${resultado.rating || 'N/A'}`);
  console.log(`Agency: ${resultado.agency || 'N/A'}`);
  console.log(`Outlook: ${resultado.outlook || 'N/A'}`);
  console.log(`Confidence: ${((resultado.confidence || 0) * 100).toFixed(1)}%`);
  console.log(`Date: ${resultado.date || 'N/A'}`);
  console.log(`Tokens Used: ${resultado.tokens_used || 'N/A'}`);
  console.log(`Method: ${resultado.method}`);
  console.log('─'.repeat(60) + '\n');

  // Snippet do HTML que contém o rating
  if (resultado.source_snippet) {
    console.log('📝 Trecho Relevante do HTML:');
    console.log(resultado.source_snippet.slice(0, 150) + '...\n');
  }

  return resultado;
}

// ============================================================================
// EXEMPLO 2: Extração de Página Real (Requer Internet)
// ============================================================================
async function exemplo2_PaginaReal() {
  console.log('\n📋 EXEMPLO 2: Extração de Página Real');
  console.log('=' .repeat(60) + '\n');

  const url = 'https://ri.petrobras.com.br/en/debt-and-ratings/credit-ratings/';
  const company = 'Petrobras';

  console.log(`🌐 URL: ${url}`);
  console.log(`🏢 Empresa: ${company}\n`);

  console.log('⏳ Baixando página HTML...');

  const fetchResult = await fetchHtml(url, 8000, true);

  if (!fetchResult.html || fetchResult.html.length < 100) {
    console.log('❌ Erro: Não foi possível baixar a página\n');
    return null;
  }

  console.log(`✅ HTML baixado: ${fetchResult.html.length} caracteres\n`);

  console.log('🤖 Extraindo rating com DeepSeek...\n');

  const resultado = await extractRatingWithDeepSeek(
    fetchResult.html,
    company,
    { agency: 'sp' }  // Buscar especificamente S&P
  );

  console.log('✅ RESULTADO DA EXTRAÇÃO:');
  console.log('─'.repeat(60));
  console.log(`Found: ${resultado.found}`);
  console.log(`Rating: ${resultado.rating || 'N/A'}`);
  console.log(`Agency: ${resultado.agency || 'N/A'}`);
  console.log(`Outlook: ${resultado.outlook || 'N/A'}`);
  console.log(`Confidence: ${((resultado.confidence || 0) * 100).toFixed(1)}%`);
  console.log(`Date: ${resultado.date || 'N/A'}`);
  console.log(`Tokens Used: ${resultado.tokens_used || 'N/A'}`);
  console.log('─'.repeat(60) + '\n');

  return resultado;
}

// ============================================================================
// EXEMPLO 3: Validação Institucional do Resultado
// ============================================================================
async function exemplo3_ValidacaoInstitucional() {
  console.log('\n📋 EXEMPLO 3: Validação Institucional');
  console.log('=' .repeat(60) + '\n');

  // Primeiro extrai o rating
  const htmlEspanhol = `
    <section class="calificaciones-crediticias">
      <h3>Calificaciones de Riesgo</h3>
      <table>
        <tr>
          <td>Agencia Calificadora</td>
          <td>Calificación</td>
          <td>Perspectiva</td>
          <td>Fecha</td>
        </tr>
        <tr>
          <td>Moody's Investors Service</td>
          <td>A1.mx</td>
          <td>Estable</td>
          <td>10/01/2025</td>
        </tr>
      </table>
      <p>
        Moody's asignó la calificación A1.mx con perspectiva estable,
        reflejando la sólida posición financiera de la empresa.
      </p>
    </section>
  `;

  console.log('🤖 Extraindo rating...\n');

  const resultado = await extractRatingWithDeepSeek(
    htmlEspanhol,
    'Grupo Bimbo',
    { agency: 'moodys' }
  );

  console.log('✅ Rating Extraído:');
  console.log(`   Rating: ${resultado.rating}`);
  console.log(`   Agency: ${resultado.agency}`);
  console.log(`   Confidence: ${((resultado.confidence || 0) * 100).toFixed(1)}%\n`);

  // Agora valida com o institutional validator
  if (resultado.found) {
    console.log('🔍 Validando com Institutional Validator...\n');

    const validacao = validateInstitutional({
      agency: resultado.agency || 'Unknown',
      rating: resultado.rating!,
      outlook: resultado.outlook,
      date: resultado.date,
      source_ref: 'https://example.com/ratings',
      method: 'llm'
    });

    console.log('✅ RESULTADO DA VALIDAÇÃO:');
    console.log('─'.repeat(60));
    console.log(`Valid: ${validacao.isValid}`);
    console.log(`Confidence: ${validacao.confidence}`);
    console.log(`Errors: ${validacao.errors.length}`);
    console.log(`Warnings: ${validacao.warnings.length}`);
    console.log(`Checksum: ${validacao.checksum}`);
    console.log('─'.repeat(60) + '\n');

    if (validacao.warnings.length > 0) {
      console.log('⚠️  Avisos:');
      validacao.warnings.forEach(w => console.log(`   • ${w}`));
      console.log('');
    }

    if (validacao.errors.length > 0) {
      console.log('❌ Erros:');
      validacao.errors.forEach(e => console.log(`   • ${e}`));
      console.log('');
    }

    // Exibe audit trail
    console.log('📋 Audit Trail:');
    validacao.auditTrail.slice(0, 3).forEach(entry => {
      console.log(`   • ${entry.action}: ${entry.result}`);
    });
    console.log('');
  }
}

// ============================================================================
// EXEMPLO 4: Comparação de Múltiplas Agências
// ============================================================================
async function exemplo4_MultiplasAgencias() {
  console.log('\n📋 EXEMPLO 4: Múltiplas Agências (Batch)');
  console.log('=' .repeat(60) + '\n');

  // HTML com ratings de 3 agências
  const htmlCompleto = `
    <div class="credit-ratings-section">
      <h2>Credit Ratings</h2>

      <div class="rating-sp">
        <h3>S&P Global Ratings</h3>
        <p>Long-term issuer credit rating: <strong>BB-</strong></p>
        <p>Outlook: <strong>Stable</strong></p>
        <p>Date: January 15, 2025</p>
      </div>

      <div class="rating-fitch">
        <h3>Fitch Ratings</h3>
        <p>Long-term IDR: <strong>BB-</strong></p>
        <p>Rating Outlook: <strong>Stable</strong></p>
        <p>Last updated: January 10, 2025</p>
      </div>

      <div class="rating-moodys">
        <h3>Moody's Investors Service</h3>
        <p>Corporate Family Rating: <strong>Ba2</strong></p>
        <p>Outlook: <strong>Stable</strong></p>
        <p>Rating Date: December 20, 2024</p>
      </div>
    </div>
  `;

  const company = 'Petrobras';

  console.log(`🏢 Empresa: ${company}`);
  console.log('📊 Extraindo ratings de 3 agências...\n');

  // Extrai de cada agência sequencialmente
  const agencias: Array<'sp' | 'fitch' | 'moodys'> = ['sp', 'fitch', 'moodys'];
  const resultados = [];

  for (const agencia of agencias) {
    console.log(`   🔍 Extraindo ${agencia.toUpperCase()}...`);

    const resultado = await extractRatingWithDeepSeek(
      htmlCompleto,
      company,
      { agency: agencia }
    );

    resultados.push({
      agencia: agencia.toUpperCase(),
      ...resultado
    });
  }

  console.log('\n✅ COMPARAÇÃO DE RATINGS:');
  console.log('─'.repeat(60));
  console.log('Agência      | Rating | Outlook | Confidence | Tokens');
  console.log('─'.repeat(60));

  resultados.forEach(r => {
    if (r.found) {
      console.log(
        `${r.agencia.padEnd(12)} | ${(r.rating || 'N/A').padEnd(6)} | ` +
        `${(r.outlook || 'N/A').padEnd(7)} | ${((r.confidence || 0) * 100).toFixed(0)}%`.padEnd(10) +
        ` | ${r.tokens_used || 'N/A'}`
      );
    } else {
      console.log(`${r.agencia.padEnd(12)} | Not Found`);
    }
  });
  console.log('─'.repeat(60) + '\n');

  // Análise de consistência
  const ratingsEncontrados = resultados.filter(r => r.found);
  if (ratingsEncontrados.length >= 2) {
    console.log('📊 Análise de Consistência:');
    console.log(`   ✓ ${ratingsEncontrados.length}/3 agências encontradas`);

    const confiancaMedia = ratingsEncontrados.reduce(
      (sum, r) => sum + (r.confidence || 0), 0
    ) / ratingsEncontrados.length;

    console.log(`   ✓ Confiança média: ${(confiancaMedia * 100).toFixed(1)}%`);

    const tokensTotal = ratingsEncontrados.reduce(
      (sum, r) => sum + (r.tokens_used || 0), 0
    );
    console.log(`   ✓ Tokens totais: ${tokensTotal}`);
    console.log(`   ✓ Custo estimado: $${(tokensTotal * 0.00000014).toFixed(6)}\n`);
  }
}

// ============================================================================
// EXEMPLO 5: Detecção de Notações Locais LATAM
// ============================================================================
async function exemplo5_NotacoesLocais() {
  console.log('\n📋 EXEMPLO 5: Notações Locais LATAM');
  console.log('=' .repeat(60) + '\n');

  const exemplos = [
    {
      pais: '🇧🇷 Brasil',
      empresa: 'Raízen',
      html: `
        <div>
          <h2>Classificação de Risco</h2>
          <p>A Fitch atribuiu rating nacional de longo prazo <b>AA(bra)</b>
          com perspectiva estável.</p>
        </div>
      `,
      esperado: 'AA(bra)'
    },
    {
      pais: '🇲🇽 México',
      empresa: 'Cemex',
      html: `
        <div>
          <h3>Calificaciones</h3>
          <p>Moody's: <strong>A1.mx</strong> con perspectiva positiva (2025)</p>
        </div>
      `,
      esperado: 'A1.mx'
    },
    {
      pais: '🇨🇴 Colombia',
      empresa: 'Ecopetrol',
      html: `
        <section>
          <p>S&P Global asignó calificación <b>BBB+(col)</b> - Perspectiva Estable</p>
        </section>
      `,
      esperado: 'BBB+(col)'
    }
  ];

  for (const ex of exemplos) {
    console.log(`${ex.pais} - ${ex.empresa}`);
    console.log(`   Rating esperado: ${ex.esperado}`);

    const resultado = await extractRatingWithDeepSeek(ex.html, ex.empresa);

    if (resultado.found) {
      const match = resultado.rating === ex.esperado ? '✅' : '⚠️';
      console.log(`   ${match} Rating detectado: ${resultado.rating}`);
      console.log(`   📊 Confiança: ${((resultado.confidence || 0) * 100).toFixed(1)}%`);
    } else {
      console.log(`   ❌ Rating não encontrado`);
    }
    console.log('');
  }
}

// ============================================================================
// MENU PRINCIPAL
// ============================================================================
async function main() {
  const args = process.argv.slice(2);
  const exemplo = args[0] || '1';

  try {
    switch (exemplo) {
      case '1':
        await exemplo1_HTMLSintetico();
        break;

      case '2':
        await exemplo2_PaginaReal();
        break;

      case '3':
        await exemplo3_ValidacaoInstitucional();
        break;

      case '4':
        await exemplo4_MultiplasAgencias();
        break;

      case '5':
        await exemplo5_NotacoesLocais();
        break;

      case 'all':
        await exemplo1_HTMLSintetico();
        await exemplo2_PaginaReal();
        await exemplo3_ValidacaoInstitucional();
        await exemplo4_MultiplasAgencias();
        await exemplo5_NotacoesLocais();
        break;

      default:
        console.log('Uso: npx tsx scripts/exemplo-deepseek.ts [1|2|3|4|5|all]\n');
        console.log('Exemplos disponíveis:');
        console.log('  1 - Extração de HTML Sintético (rápido)');
        console.log('  2 - Extração de Página Real (requer internet)');
        console.log('  3 - Validação Institucional');
        console.log('  4 - Múltiplas Agências (batch)');
        console.log('  5 - Notações Locais LATAM');
        console.log('  all - Executar todos os exemplos');
        return;
    }

    console.log('\n✅ Exemplo concluído com sucesso!\n');
  } catch (error) {
    console.error('\n❌ Erro durante execução:', error);
    process.exit(1);
  }
}

// Executa
main();
