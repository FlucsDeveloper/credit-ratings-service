import { NextRequest, NextResponse } from 'next/server';
import { generateCompanyVariations } from '@/lib/ai/entity-resolver';
import { extractRating } from '@/lib/ai/rating-extractor';
import { searchFitch, searchMoodys, searchSP } from '@/lib/scrapers/agencies';
import { normalizeRating, getRatingCategory } from '@/lib/rating-normalizer';
import { getCachedRating, setCachedRating } from '@/lib/cache/memory-cache';
import { globalCompanySearch } from '@/lib/data-sources/global-company-search';
import { getKnownRating, searchRatingsInFinancialAPIs } from '@/lib/data-sources/real-time-ratings';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const company = searchParams.get('company');
  const skipCache = searchParams.get('skipCache') === 'true';

  if (!company) {
    return NextResponse.json({ error: 'Company name required' }, { status: 400 });
  }

  console.log('\n' + '='.repeat(80));
  console.log(`🔍 REAL-TIME CREDIT RATINGS SEARCH: ${company}`);
  console.log('='.repeat(80) + '\n');

  const startTime = Date.now();

  // Check cache
  if (!skipCache) {
    const cached = getCachedRating(company);
    if (cached) {
      console.log('💾 Cache HIT - Returning cached result\n');
      return NextResponse.json({
        ...cached,
        cached: true,
        processingTime: `${Date.now() - startTime}ms`,
      });
    }
  }

  try {
    // === STEP 1: Global Search for Company Info ===
    console.log('🌍 STEP 1: Identifying company...');
    const globalData = await globalCompanySearch(company);

    if (!globalData.found) {
      return NextResponse.json({
        success: false,
        error: 'Company not found in financial databases',
        company,
        searchedSources: ['FMP', 'Alpha Vantage', 'Yahoo Finance', 'Wikipedia'],
      }, { status: 404 });
    }

    console.log(`✅ Company identified: ${globalData.name}`);
    console.log(`   Ticker: ${globalData.ticker || 'N/A'}`);
    console.log(`   Country: ${globalData.country || 'Unknown'}`);
    console.log(`   Sources: ${globalData.sources.join(', ')}\n`);

    const ticker = globalData.ticker || '';

    // === STEP 2: Check Known Ratings Database ===
    console.log('📚 STEP 2: Checking known ratings database...');

    let ratings: any = {
      fitch: { found: false },
      sp: { found: false },
      moodys: { found: false },
    };

    // First try known database for major companies
    if (ticker) {
      const knownRatings = getKnownRating(ticker);
      if (knownRatings) {
        console.log(`✅ Found in database: ${ticker} has official ratings\n`);

        if (knownRatings.fitch) {
          ratings.fitch = {
            found: true,
            rating: knownRatings.fitch.rating,
            normalized: normalizeRating(knownRatings.fitch.rating),
            outlook: knownRatings.fitch.outlook,
            confidence: knownRatings.fitch.confidence,
            resolvedName: globalData.name,
            source: 'database',
            date: knownRatings.fitch.date,
          };
        }

        if (knownRatings.sp) {
          ratings.sp = {
            found: true,
            rating: knownRatings.sp.rating,
            normalized: normalizeRating(knownRatings.sp.rating),
            outlook: knownRatings.sp.outlook,
            confidence: knownRatings.sp.confidence,
            resolvedName: globalData.name,
            source: 'database',
            date: knownRatings.sp.date,
          };
        }

        if (knownRatings.moodys) {
          ratings.moodys = {
            found: true,
            rating: knownRatings.moodys.rating,
            normalized: normalizeRating(knownRatings.moodys.rating),
            outlook: knownRatings.moodys.outlook,
            confidence: knownRatings.moodys.confidence,
            resolvedName: globalData.name,
            source: 'database',
            date: knownRatings.moodys.date,
          };
        }
      }
    }

    // === STEP 3: Search Financial APIs for Ratings ===
    if (Object.values(ratings).filter((r: any) => r.found).length === 0) {
      console.log('🔍 STEP 3: Searching financial APIs for rating data...');

      if (ticker) {
        const apiRatings = await searchRatingsInFinancialAPIs(ticker);

        // Merge any found ratings
        if (apiRatings.fitch && !ratings.fitch.found) {
          ratings.fitch = {
            found: true,
            rating: apiRatings.fitch.rating,
            normalized: normalizeRating(apiRatings.fitch.rating),
            outlook: apiRatings.fitch.outlook,
            confidence: apiRatings.fitch.confidence,
            resolvedName: globalData.name,
            source: apiRatings.fitch.source || 'api',
          };
        }

        if (apiRatings.sp && !ratings.sp.found) {
          ratings.sp = {
            found: true,
            rating: apiRatings.sp.rating,
            normalized: normalizeRating(apiRatings.sp.rating),
            outlook: apiRatings.sp.outlook,
            confidence: apiRatings.sp.confidence,
            resolvedName: globalData.name,
            source: apiRatings.sp.source || 'api',
          };
        }

        if (apiRatings.moodys && !ratings.moodys.found) {
          ratings.moodys = {
            found: true,
            rating: apiRatings.moodys.rating,
            normalized: normalizeRating(apiRatings.moodys.rating),
            outlook: apiRatings.moodys.outlook,
            confidence: apiRatings.moodys.confidence,
            resolvedName: globalData.name,
            source: apiRatings.moodys.source || 'api',
          };
        }
      }
    }

    // === STEP 4: Web Scraping from Agencies ===
    const foundRatings = Object.values(ratings).filter((r: any) => r.found).length;

    if (foundRatings < 3) {
      console.log('\n🌐 STEP 4: Attempting web scraping from rating agencies...\n');

      // Generate search variations
      const variations = await generateCompanyVariations(
        globalData.name || company,
        ticker,
        globalData.country
      );
      console.log(`Generated ${variations.length} search variations\n`);

      const agencies = [
        { name: 'fitch', fn: searchFitch },
        { name: 'sp', fn: searchSP },
        { name: 'moodys', fn: searchMoodys },
      ] as const;

      // Only scrape agencies we don't have data for
      const agenciesToScrape = agencies.filter(a => !ratings[a.name].found);

      if (agenciesToScrape.length > 0) {
        const scrapingResults = await Promise.allSettled(
          agenciesToScrape.map(({ name, fn }) =>
            searchAgency(name, variations, fn, ticker)
          )
        );

        scrapingResults.forEach((result, idx) => {
          const agencyName = agenciesToScrape[idx].name;
          if (result.status === 'fulfilled' && result.value.found) {
            ratings[agencyName] = result.value;
          }
        });
      }
    }

    // === STEP 5: Financial Inference as Last Resort ===
    const finalFoundRatings = Object.values(ratings).filter((r: any) => r.found).length;

    if (finalFoundRatings === 0) {
      console.log('\n💡 STEP 5: No official ratings found. Applying financial inference...\n');

      // Fetch financial metrics from all APIs
      const financialPromises = [];
      const apiNames: string[] = [];

      if (ticker && !ticker.includes('<')) {
        // Import data sources dynamically
        financialPromises.push(
          import('@/lib/data-sources/eod-historical').then(m =>
            m.getEODFundamentals(ticker, 'US')
          ).catch(() => ({ found: false }))
        );
        apiNames.push('EOD Historical');

        financialPromises.push(
          import('@/lib/data-sources/finnhub').then(async m => {
            const profile = await m.getFinnhubProfile(ticker);
            const metrics = await m.getFinnhubMetrics(ticker);
            return { ...profile, ...metrics };
          }).catch(() => ({ found: false }))
        );
        apiNames.push('Finnhub');

        financialPromises.push(
          import('@/lib/data-sources/polygon').then(async m => {
            const details = await m.getPolygonTickerDetails(ticker);
            const financials = await m.getPolygonFinancials(ticker);
            return { ...details, financialData: financials };
          }).catch(() => ({ found: false }))
        );
        apiNames.push('Polygon.io');
      }

      const financialResults = await Promise.allSettled(financialPromises);
      const allMetrics: any[] = financialResults
        .filter((result): result is PromiseFulfilledResult<any> =>
          result.status === 'fulfilled' && result.value?.found)
        .map(result => result.value);

      if (allMetrics.length > 0) {
        const { aggregateFinancialMetrics, inferCreditScore, convertScoreToRating } =
          await import('@/lib/inference/enhanced-credit-inference');

        const aggregatedMetrics = aggregateFinancialMetrics(allMetrics);
        const inference = inferCreditScore(aggregatedMetrics, globalData.name || company);

        if (inference.dataPoints >= 2 && inference.confidence >= 0.3) {
          console.log(`   ✅ Inference successful with ${inference.dataPoints} data points`);
          console.log(`   📊 Inferred score: ${inference.score}/21`);
          console.log(`   🎯 Confidence: ${(inference.confidence * 100).toFixed(0)}%`);

          // Apply inferred ratings to all agencies
          ['fitch', 'sp', 'moodys'].forEach((agency: any) => {
            if (!ratings[agency].found) {
              ratings[agency] = {
                found: true,
                rating: convertScoreToRating(inference.score, agency),
                normalized: inference.score,
                outlook: 'N/A',
                confidence: inference.confidence,
                resolvedName: globalData.name,
                source: 'inferred',
                methodology: 'Financial Metrics Analysis',
                dataPoints: inference.dataPoints,
                reasoning: inference.reasoning,
                category: inference.category,
              };
            }
          });
        }
      }
    }

    // === Calculate Summary ===
    const allFoundRatings = Object.values(ratings).filter((r: any) => r.found);
    const avgNormalized = allFoundRatings.length > 0
      ? allFoundRatings.reduce((sum: number, r: any) => sum + (r.normalized || 0), 0) / allFoundRatings.length
      : 0;

    const hasOfficialRatings = allFoundRatings.some((r: any) =>
      r.source === 'database' || r.source === 'scraped' || r.source === 'api');
    const hasInferredRatings = allFoundRatings.some((r: any) => r.source === 'inferred');

    let dataQuality = 'Not Available';
    if (hasOfficialRatings) dataQuality = 'Official (Verified Data)';
    else if (hasInferredRatings) dataQuality = 'Estimated (Financial Analysis)';

    const response = {
      success: true,
      company: globalData.name || company,
      enrichedData: {
        ...globalData,
        dataSources: [...new Set(globalData.sources)],
      },
      searchedAt: new Date().toISOString(),
      processingTime: `${((Date.now() - startTime) / 1000).toFixed(2)}s`,
      ratings,
      summary: {
        agenciesFound: allFoundRatings.length,
        averageNormalized: Math.round(avgNormalized * 10) / 10,
        category: getRatingCategory(Math.round(avgNormalized)),
        dataQuality,
        methodology: hasOfficialRatings ? 'Official Sources' :
                     hasInferredRatings ? 'Financial Metrics Inference' : 'None',
        lastUpdated: hasOfficialRatings ? '2024' : new Date().toISOString().split('T')[0],
      },
      cached: false,
    };

    // Cache the result if we have data
    if (allFoundRatings.length > 0) {
      setCachedRating(company, response);
    }

    console.log('\n' + '='.repeat(80));
    console.log('✅ SEARCH COMPLETE');
    console.log(`   Agencies: ${allFoundRatings.length}/3`);
    console.log(`   Average score: ${response.summary.averageNormalized}/21`);
    console.log(`   Data quality: ${dataQuality}`);
    console.log(`   Processing time: ${response.processingTime}`);
    console.log('='.repeat(80) + '\n');

    return NextResponse.json(response);

  } catch (error) {
    console.error('\n❌ FATAL ERROR:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      company,
    }, { status: 500 });
  }
}

async function searchAgency(
  agency: 'fitch' | 'sp' | 'moodys',
  variations: string[],
  searchFn: (name: string) => Promise<string>,
  ticker?: string
) {
  console.log(`🏢 ${agency.toUpperCase()}: Starting search`);
  console.log(`   Variations to try: ${Math.min(variations.length, 5)}`);

  const maxAttempts = Math.min(variations.length, 5); // Reduced attempts for speed

  for (let i = 0; i < maxAttempts; i++) {
    const variant = variations[i];
    console.log(`   Attempt ${i + 1}: "${variant}"`);

    try {
      const html = await searchFn(variant);

      if (!html || html.length < 200) {
        continue;
      }

      // Try extraction
      const result = await extractRating(html, variant, agency);

      if (result.found && result.confidence >= 0.70 && result.rating) {
        console.log(`   ✅ Found rating: ${result.rating}\n`);
        return {
          found: true,
          rating: result.rating,
          normalized: normalizeRating(result.rating),
          outlook: result.outlook || 'N/A',
          confidence: result.confidence,
          resolvedName: result.companyName || variant,
          searchVariant: variant,
          source: 'scraped',
        };
      }
    } catch (error) {
      console.log(`   ❌ Error: ${error}`);
    }

    if (i < maxAttempts - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  console.log(`   ⚠️ No rating found for ${agency.toUpperCase()}\n`);

  return {
    found: false,
    error: 'Rating not found or not publicly available',
    attemptedVariations: variations.slice(0, maxAttempts),
  };
}