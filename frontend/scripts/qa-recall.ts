/**
 * QA Recall Test Harness
 *
 * Tests the /api/ratings endpoint against a known dataset of companies.
 * Reports recall (% found) and precision (% correct) metrics.
 *
 * Usage:
 *   npm run qa:recall
 */

interface QATestCase {
  company: string;
  ticker?: string;
  expected: {
    moodys?: string | null;
    sp?: string | null;
    fitch?: string | null;
  };
}

// QA Dataset: 10 well-known companies with public ratings
const QA_DATASET: QATestCase[] = [
  {
    company: "Apple Inc",
    ticker: "AAPL",
    expected: { moodys: "Aaa", sp: "AA+", fitch: "AA+" },
  },
  {
    company: "Microsoft Corporation",
    ticker: "MSFT",
    expected: { moodys: "Aaa", sp: "AAA", fitch: "AAA" },
  },
  {
    company: "Amazon.com Inc",
    ticker: "AMZN",
    expected: { moodys: "Aa2", sp: "AA", fitch: "AA" },
  },
  {
    company: "JPMorgan Chase",
    ticker: "JPM",
    expected: { moodys: "Aa2", sp: "A+", fitch: "AA" },
  },
  {
    company: "Walmart Inc",
    ticker: "WMT",
    expected: { moodys: "Aa2", sp: "AA", fitch: "AA" },
  },
  {
    company: "Coca-Cola Company",
    ticker: "KO",
    expected: { moodys: "A1", sp: "A+", fitch: "A+" },
  },
  {
    company: "Johnson & Johnson",
    ticker: "JNJ",
    expected: { moodys: "Aaa", sp: "AAA", fitch: "AAA" },
  },
  {
    company: "Verizon Communications",
    ticker: "VZ",
    expected: { moodys: "Baa1", sp: "BBB+", fitch: "BBB+" },
  },
  {
    company: "Petrobras",
    ticker: "PBR",
    expected: { moodys: "Ba1", sp: "BB-", fitch: "BB-" },
  },
  {
    company: "Vale SA",
    ticker: "VALE",
    expected: { moodys: "Baa3", sp: "BBB-", fitch: "BBB" },
  },
];

interface AgencyResult {
  status: "found" | "not_found" | "blocked";
  rating: string | null;
  confidence: number;
}

interface APIResponse {
  agencies: {
    moodys: AgencyResult;
    sp: AgencyResult;
    fitch: AgencyResult;
  };
  metadata: {
    query: string;
    latency_ms: number;
    cached: boolean;
  };
}

type AgencyName = "moodys" | "sp" | "fitch";

async function testCase(testCase: QATestCase) {
  const query = testCase.ticker || testCase.company;
  console.log(`\n  Testing: ${query}...`);

  try {
    const response = await fetch(`http://localhost:3000/api/ratings?q=${encodeURIComponent(query)}&nocache=1`);

    if (!response.ok) {
      console.log(`    ❌ API error: ${response.status}`);
      return { company: testCase.company, passed: false, details: {}, failureStage: "api_error", latency: 0 };
    }

    const data: APIResponse = await response.json();
    const agencies: AgencyName[] = ["moodys", "sp", "fitch"];
    const details: any = {};
    let allMatch = true;

    agencies.forEach(agency => {
      const expected = testCase.expected[agency] || null;
      const actual = data.agencies[agency].rating;
      const status = data.agencies[agency].status;

      const normalizeRating = (r: string | null) =>
        r ? r.toUpperCase().replace(/\s+/g, "").replace(/[+-]/g, "") : null;

      const expectedNorm = normalizeRating(expected);
      const actualNorm = normalizeRating(actual);

      const match =
        (expected === null && (status === "not_found" || actual === null)) ||
        (expected !== null && actualNorm === expectedNorm);

      details[agency] = { expected, actual, match, status };
      if (!match) allMatch = false;
    });

    const latency = data.metadata.latency_ms;
    const cached = data.metadata.cached;

    console.log(`    Latency: ${latency}ms ${cached ? "(cached)" : ""}`);
    agencies.forEach(agency => {
      const d = details[agency];
      const icon = d.match ? "✅" : "❌";
      console.log(`    ${icon} ${agency}: expected=${d.expected || "none"}, actual=${d.actual || "none"}, status=${d.status}`);
    });

    return { company: testCase.company, passed: allMatch, details, latency };
  } catch (error) {
    console.log(`    ❌ Error: ${error}`);
    return { company: testCase.company, passed: false, details: {}, failureStage: "exception", latency: 0 };
  }
}

async function runQARecall() {
  console.log("=".repeat(60));
  console.log("QA Recall Test - Credit Ratings Service v1.1");
  console.log("=".repeat(60));

  if (!process.env.SERPAPI_API_KEY || process.env.SERPAPI_API_KEY === "REPLACE") {
    console.error("\n❌ SERPAPI_API_KEY not configured. Set it in .env.local");
    process.exit(1);
  }

  console.log(`\nDataset: ${QA_DATASET.length} test cases`);
  console.log("Target: ≥80% recall, ≥90% precision\n");

  const results: any[] = [];
  const concurrency = 3;

  for (let i = 0; i < QA_DATASET.length; i += concurrency) {
    const batch = QA_DATASET.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(tc => testCase(tc)));
    results.push(...batchResults);

    if (i + concurrency < QA_DATASET.length) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  const totalTests = results.length;
  const totalAgencyTests = totalTests * 3;
  const agencyResults = results.flatMap(r => [r.details.moodys, r.details.sp, r.details.fitch]);
  const correctMatches = agencyResults.filter(a => a?.match).length;
  const found = agencyResults.filter(a => a?.status === "found" && a?.actual !== null).length;
  const expectedToFind = agencyResults.filter(a => a?.expected !== null).length;

  const recall = expectedToFind > 0 ? (found / expectedToFind) * 100 : 0;
  const precision = found > 0 ? (correctMatches / found) * 100 : 0;
  const avgLatency = results.reduce((sum, r) => sum + r.latency, 0) / totalTests;

  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  console.log(`Total Tests: ${totalTests}`);
  console.log(`Total Agency Checks: ${totalAgencyTests}`);
  console.log(`Expected to Find: ${expectedToFind}`);
  console.log(`Actually Found: ${found}`);
  console.log(`Correct Matches: ${correctMatches}`);
  console.log();
  console.log(`Recall: ${recall.toFixed(1)}% ${recall >= 80 ? "✅" : "❌"} (target: ≥80%)`);
  console.log(`Precision: ${precision.toFixed(1)}% ${precision >= 90 ? "✅" : "❌"} (target: ≥90%)`);
  console.log(`Avg Latency: ${avgLatency.toFixed(0)}ms`);
  console.log("=".repeat(60));

  const passed = recall >= 80 && precision >= 90;
  process.exit(passed ? 0 : 1);
}

runQARecall().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
