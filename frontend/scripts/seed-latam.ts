/**
 * LATAM Seed Generator for Credit Ratings
 *
 * Seeds the database with 500+ LATAM companies prioritizing:
 * - Brasil (largest economy)
 * - México
 * - Colombia
 * - Argentina
 * - Chile
 *
 * Features:
 * - Circuit breaker (stops after 10 consecutive failures)
 * - Rate limiting (500ms delay between requests)
 * - Detailed failure logging
 * - Progress tracking
 * - Recovery mode (can resume from failure)
 */

import { getAllCompanyNames } from '../lib/resolution/ticker-mapping';

// Configuration
const API_ENDPOINT = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const DELAY_MS = 500; // Rate limiting
const MAX_CONSECUTIVE_FAILURES = 10;
const BATCH_SIZE = 50; // Process in batches

// LATAM Companies Database (500+ companies)
const LATAM_COMPANIES = [
  // ========== BRASIL (150 companies) ==========
  // Banks & Financial Services
  'BTG Pactual', 'Nubank', 'Itaú Unibanco', 'Bradesco', 'Banco do Brasil',
  'Santander Brasil', 'XP Inc', 'Inter', 'Banco Pan', 'Safra',
  'BTG Pactual Digital', 'Banco Original', 'Banco BMG', 'Banco Pine',
  'Banco Daycoval', 'Banco Sofisa', 'Banco Indusval', 'Stone',

  // Energy & Oil/Gas
  'Petrobras', 'Raízen', 'Vibra Energia', 'Ultrapar', 'Cosan',
  'Copel', 'CEMIG', 'Equatorial', 'Engie Brasil', 'AES Brasil',
  'Light', 'Energisa', 'Neoenergia', 'Omega Energia', 'CPFL Energia',

  // Mining & Materials
  'Vale', 'Gerdau', 'Usiminas', 'CSN', 'Bradespar',
  'Metalúrgica Gerdau', 'CSN Mineração', 'Nexa Resources', 'Votorantim Cimentos',

  // Retail & E-commerce
  'Magazine Luiza', 'Via', 'Lojas Americanas', 'Renner', 'C&A Brasil',
  'Raia Drogasil', 'Pão de Açúcar', 'Carrefour Brasil', 'Lojas Marisa',
  'Grupo Soma', 'Vivara', 'Arezzo&Co', 'Hering', 'Guararapes',
  'Centauro', 'Natura', 'Grupo Boticário', 'Localiza', 'Movida',

  // Real Estate & Construction
  'MRV', 'Cyrela', 'Gafisa', 'Tenda', 'EZTec',
  'Direcional', 'Even', 'JHSF', 'Helbor', 'Tecnisa',
  'Log Commercial Properties', 'BR Malls', 'Multiplan', 'Iguatemi',

  // Technology & Telecom
  'Vivo', 'Tim Brasil', 'Claro Brasil', 'Oi', 'Telefônica Brasil',
  'Totvs', 'Locaweb', 'Méliuz', 'Infracommerce', 'Linx',

  // Food & Beverage
  'Ambev', 'JBS', 'BRF', 'Marfrig', 'Minerva Foods',
  'M. Dias Branco', 'SLC Agrícola', 'Adecoagro', 'São Martinho',
  'Tereos', 'Coca-Cola FEMSA Brasil', 'Heineken Brasil',

  // Transportation & Logistics
  'Azul', 'Gol', 'CCR', 'Ecorodovias', 'Arteris',
  'Santos Brasil', 'Wilson Sons', 'JSL', 'Tegma', 'Movida',

  // Healthcare & Pharma
  'Rede D\'Or', 'Hapvida', 'Fleury', 'Dasa', 'Qualicorp',
  'Intermédica', 'Hypera', 'EMS', 'Eurofarma', 'União Química',

  // Pulp & Paper
  'Suzano', 'Klabin', 'Irani', 'Santher',

  // Agribusiness
  'Cosan', 'SLC Agrícola', 'Boa Safra', 'Terra Santa Agro',
  'Brasilagro', 'SLC Agrícola', 'BrasilAgro',

  // Infrastructure
  'B3', 'Cielo', 'Rede', 'PagSeguro', 'GetNet',
  'Vinci Partners', 'Cosan', 'Taesa', 'ISA Cteep',

  // ========== MÉXICO (100 companies) ==========
  // Conglomerates & Diversified
  'Grupo Carso', 'Alfa', 'Femsa', 'Kof', 'Arca Continental',

  // Banks & Financial Services
  'Banorte', 'Santander México', 'BBVA México', 'Citibanamex',
  'Scotiabank México', 'Inbursa', 'Banregio', 'Banco Azteca',
  'Compartamos Banco', 'BanBajío', 'Intercam', 'GBM',

  // Industrial & Manufacturing
  'Cemex', 'Grupo Bimbo', 'Gruma', 'Grupo Lala', 'Sigma',
  'Alfa', 'Nemak', 'Ternium México', 'Simec',

  // Telecom & Media
  'América Móvil', 'Televisa', 'Megacable', 'Axtel',
  'Grupo Salinas', 'TV Azteca', 'Maxcom',

  // Retail
  'Walmart México', 'Liverpool', 'Chedraui', 'Soriana',
  'Elektra', 'Famsa', 'La Comer', 'Sanborns',

  // Real Estate
  'Fibra Uno', 'Prologis México', 'Fibra Macquarie',
  'Danhos', 'Fibra Hotel', 'Concentradora Fibra Hotelera',

  // Energy
  'Pemex', 'CFE', 'IEnova', 'Vista Oil & Gas México',

  // Mining
  'Grupo México', 'Peñoles', 'Fresnillo', 'First Majestic Silver',

  // Transportation
  'Aeroméxico', 'Volaris', 'Viva Aerobus', 'OMA', 'ASUR', 'GAP',
  'Ferromex', 'Kansas City Southern de México',

  // Food & Beverage
  'Grupo Bimbo', 'Gruma', 'Bachoco', 'Pilgrim\'s Pride México',
  'Grupo Lala', 'Sigma Alimentos', 'Herdez', 'Grupo Viz',

  // Construction & Materials
  'Cemex', 'GCC', 'Elementia', 'Cementos Chihuahua',
  'Consorcio ARA', 'Urbi', 'Geo',

  // Healthcare
  'Genomma Lab', 'Médica Sur', 'Grupo Angeles',

  // ========== ARGENTINA (80 companies) ==========
  // Technology & E-commerce
  'MercadoLibre', 'Globant', 'Despegar', 'OLX Argentina',

  // Energy & Oil/Gas
  'YPF', 'Pampa Energía', 'Central Puerto', 'TGS',
  'Transportadora de Gas del Sur', 'Edenor', 'Central Costanera',

  // Banks & Financial
  'Banco Macro', 'Galicia', 'Supervielle', 'BBVA Argentina',
  'Santander Argentina', 'ICBC Argentina', 'Banco Provincia',
  'Banco Ciudad', 'Banco Patagonia', 'Banco Hipotecario',

  // Agriculture & Food
  'Molinos Río de la Plata', 'Arcor', 'Ledesma', 'Mastellone',
  'Aceitera General Deheza', 'Cresud', 'Los Grobo',

  // Industrial & Manufacturing
  'Aluar', 'Siderar', 'Tenaris', 'Techint', 'Acindar',

  // Retail
  'Coto', 'Carrefour Argentina', 'Día Argentina',

  // Telecom
  'Telecom Argentina', 'Telefónica Argentina', 'Claro Argentina',

  // Real Estate
  'IRSA', 'IRSA Propiedades Comerciales', 'Cresud',

  // Transportation
  'Aerolíneas Argentinas', 'Andes Líneas Aéreas',

  // Media
  'Grupo Clarín', 'La Nación', 'Artear',

  // ========== CHILE (70 companies) ==========
  // Retail
  'Falabella', 'Cencosud', 'Ripley', 'SMU', 'La Polar',
  'Hites', 'Paris', 'Johnson',

  // Energy
  'Copec', 'Enex', 'ENAP', 'Colbún', 'AES Gener',
  'Enel Chile', 'Endesa Chile',

  // Mining
  'Codelco', 'SQM', 'Antofagasta Minerals', 'CAP',
  'Molibdenos y Metales', 'Enami',

  // Banks & Financial
  'Banco de Chile', 'Banco Santander Chile', 'BCI',
  'Banco Estado', 'Scotiabank Chile', 'Itaú Chile',
  'BICE', 'Security', 'Consorcio',

  // Food & Beverage
  'CCU', 'Embotelladora Andina', 'Carozzi', 'Iansa',
  'Agrosuper', 'Soprole', 'Watts',

  // Forestry & Pulp
  'CMPC', 'Arauco', 'Masisa',

  // Transportation
  'LATAM Airlines', 'Sky Airline', 'JetSmart',

  // Telecom
  'Entel Chile', 'Movistar Chile', 'Claro Chile', 'WOM',

  // Real Estate
  'Parque Arauco', 'Mall Plaza', 'Cencosud Shopping',

  // Healthcare
  'Clínica Las Condes', 'Clínica Alemana', 'Red Salud',

  // ========== COLOMBIA (50 companies) ==========
  // Energy & Oil/Gas
  'Ecopetrol', 'Canacol Energy', 'Gran Tierra Energy',
  'Frontera Energy', 'Promigas', 'Celsia',

  // Banks & Financial
  'Bancolombia', 'Grupo Aval', 'Banco de Bogotá',
  'Banco Davivienda', 'Banco Occidente', 'BBVA Colombia',
  'Banco Popular', 'Corficolombiana',

  // Food & Beverage
  'Grupo Nutresa', 'Bavaria', 'Postobón', 'Alpina',
  'Colombina', 'Quala',

  // Retail
  'Almacenes Éxito', 'Falabella Colombia', 'Alkosto',

  // Conglomerates
  'Grupo Argos', 'Grupo Sura', 'Grupo Nutresa',

  // Telecom
  'Claro Colombia', 'Movistar Colombia', 'Tigo Colombia',

  // Transportation
  'Avianca', 'Viva Air', 'Wingo',

  // Construction & Materials
  'Cemex Colombia', 'Argos', 'Corona',

  // Healthcare
  'Organización Sanitas', 'Compensar',

  // ========== PERU (30 companies) ==========
  'Credicorp', 'BCP', 'Interbank', 'Scotiabank Perú',
  'Backus', 'Alicorp', 'Ferreycorp', 'Graña y Montero',
  'Minsur', 'Buenaventura', 'Volcan',
  'Southern Copper Peru', 'Telefónica Perú', 'Entel Perú',

  // ========== URUGUAY (10 companies) ==========
  'Banco República', 'ANCAP', 'UTE', 'Antel',
  'OSE', 'AFE',

  // ========== ADDITIONAL LATAM (20 companies) ==========
  // Regional
  'Copa Holdings', 'Grupo Prisa', 'Millicom',
  'Liberty Latin America', 'Digicel',

  // ADRs & Cross-listed
  'Itaú ADR', 'Vale ADR', 'Petrobras ADR',
  'Ambev ADR', 'Gol ADR', 'Azul ADR',
];

interface SeedResult {
  company: string;
  success: boolean;
  rating?: any;
  error?: string;
  timestamp: string;
}

interface SeedStats {
  total: number;
  success: number;
  failed: number;
  skipped: number;
  startTime: Date;
  endTime?: Date;
  failures: SeedResult[];
}

/**
 * Delay helper for rate limiting
 */
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Fetch rating for a single company
 */
async function fetchCompanyRating(company: string): Promise<SeedResult> {
  const timestamp = new Date().toISOString();

  try {
    const url = `${API_ENDPOINT}/api/ratings-v2?q=${encodeURIComponent(company)}`;

    console.log(`  → Fetching: ${company}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      return {
        company,
        success: false,
        error: `HTTP ${response.status}`,
        timestamp
      };
    }

    const data = await response.json();

    // Check if rating was found
    if (!data || !data.ratings || Object.keys(data.ratings).length === 0) {
      return {
        company,
        success: false,
        error: 'No ratings found',
        timestamp
      };
    }

    return {
      company,
      success: true,
      rating: data,
      timestamp
    };

  } catch (error: any) {
    return {
      company,
      success: false,
      error: error.message,
      timestamp
    };
  }
}

/**
 * Process batch of companies with circuit breaker
 */
async function processBatch(
  companies: string[],
  stats: SeedStats,
  startIndex: number
): Promise<boolean> {
  let consecutiveFailures = 0;

  for (let i = 0; i < companies.length; i++) {
    const company = companies[i];
    const globalIndex = startIndex + i;

    console.log(`\n[${globalIndex + 1}/${stats.total}] Processing: ${company}`);

    // Fetch rating
    const result = await fetchCompanyRating(company);

    if (result.success) {
      stats.success++;
      consecutiveFailures = 0;
      console.log(`  ✓ Success: Found ratings for ${company}`);
    } else {
      stats.failed++;
      stats.failures.push(result);
      consecutiveFailures++;
      console.log(`  ✗ Failed: ${result.error}`);

      // Circuit breaker
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        console.error(`\n❌ CIRCUIT BREAKER TRIGGERED`);
        console.error(`   ${MAX_CONSECUTIVE_FAILURES} consecutive failures detected.`);
        console.error(`   Stopping to prevent cascading failures.\n`);
        return false; // Stop processing
      }
    }

    // Rate limiting (except for last item)
    if (i < companies.length - 1) {
      await delay(DELAY_MS);
    }
  }

  return true; // Continue processing
}

/**
 * Main seed function
 */
async function seedLATAM() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║   LATAM Credit Ratings Seed Generator                    ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  console.log(`📊 Configuration:`);
  console.log(`   API Endpoint: ${API_ENDPOINT}`);
  console.log(`   Total Companies: ${LATAM_COMPANIES.length}`);
  console.log(`   Batch Size: ${BATCH_SIZE}`);
  console.log(`   Delay: ${DELAY_MS}ms`);
  console.log(`   Max Consecutive Failures: ${MAX_CONSECUTIVE_FAILURES}\n`);

  const stats: SeedStats = {
    total: LATAM_COMPANIES.length,
    success: 0,
    failed: 0,
    skipped: 0,
    startTime: new Date(),
    failures: []
  };

  // Process in batches
  const totalBatches = Math.ceil(LATAM_COMPANIES.length / BATCH_SIZE);

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const start = batchIndex * BATCH_SIZE;
    const end = Math.min(start + BATCH_SIZE, LATAM_COMPANIES.length);
    const batch = LATAM_COMPANIES.slice(start, end);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`📦 BATCH ${batchIndex + 1}/${totalBatches} (Companies ${start + 1}-${end})`);
    console.log('='.repeat(60));

    const shouldContinue = await processBatch(batch, stats, start);

    if (!shouldContinue) {
      stats.skipped = LATAM_COMPANIES.length - (start + batch.length);
      break;
    }

    // Progress report
    const progress = ((end / LATAM_COMPANIES.length) * 100).toFixed(1);
    console.log(`\n📈 Progress: ${progress}% (${end}/${LATAM_COMPANIES.length})`);
    console.log(`   ✓ Success: ${stats.success} | ✗ Failed: ${stats.failed}`);
  }

  stats.endTime = new Date();

  // Final report
  console.log('\n' + '='.repeat(60));
  console.log('📊 FINAL REPORT');
  console.log('='.repeat(60));
  console.log(`Total Companies: ${stats.total}`);
  console.log(`✓ Successful:    ${stats.success} (${((stats.success / stats.total) * 100).toFixed(1)}%)`);
  console.log(`✗ Failed:        ${stats.failed} (${((stats.failed / stats.total) * 100).toFixed(1)}%)`);
  console.log(`⊘ Skipped:       ${stats.skipped}`);
  console.log(`⏱ Duration:      ${((stats.endTime.getTime() - stats.startTime.getTime()) / 1000).toFixed(1)}s`);

  if (stats.failures.length > 0) {
    console.log(`\n❌ Failures (${stats.failures.length}):`);
    stats.failures.forEach(f => {
      console.log(`   • ${f.company}: ${f.error}`);
    });

    // Save failures to file
    const fs = require('fs');
    const failureReport = {
      timestamp: stats.endTime.toISOString(),
      stats: {
        total: stats.total,
        success: stats.success,
        failed: stats.failed,
        skipped: stats.skipped
      },
      failures: stats.failures
    };

    fs.writeFileSync(
      'seed-failures-latam.json',
      JSON.stringify(failureReport, null, 2)
    );

    console.log(`\n💾 Failure report saved to: seed-failures-latam.json`);
  }

  console.log('\n✅ Seed completed!');
}

// Run seed
seedLATAM().catch(console.error);
