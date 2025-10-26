/**
 * Quick API Health Check
 * Tests the /api/ratings-v2 endpoint with known companies
 */

const targets = ["Microsoft", "Apple", "Amazon", "Petrobras", "Toyota", "Santander"];
const base = "http://localhost:3000/api/ratings-v2?q=";

(async () => {
  console.log("🔍 Credit Ratings API Health Check\n");
  console.log("=" + "=".repeat(70));

  for (const company of targets) {
    try {
      const url = base + encodeURIComponent(company);
      const start = Date.now();
      const response = await fetch(url);
      const elapsed = Date.now() - start;
      const json = await response.json();

      const statusIcon = response.status === 200 ? "✅" : "❌";
      const dataStatus = json.status || "unknown";
      const agencies = json.ratings?.length ?? 0;
      const avgScore = json.summary?.averageScore ?? "N/A";

      console.log(`${statusIcon} ${company.padEnd(15)} | HTTP ${response.status} | status: ${dataStatus.padEnd(8)} | agencies: ${agencies}/3 | avg: ${avgScore} | ${elapsed}ms`);

      if (json.diagnostics?.errors?.length > 0) {
        console.log(`   ⚠️  Errors: ${json.diagnostics.errors.join(", ")}`);
      }

      if (json.diagnostics?.sources?.length > 0) {
        console.log(`   📊 Sources: ${json.diagnostics.sources.join(", ")}`);
      }

    } catch (error) {
      console.log(`❌ ${company.padEnd(15)} | ERROR: ${error.message}`);
    }
  }

  console.log("=" + "=".repeat(70));
})();
