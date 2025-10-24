// Test script for LLM API integration
async function testLLMAPI() {
  console.log('🚀 Testing LLM Credit Ratings API...\n');

  const companies = [
    { name: 'Apple Inc.', country: 'US' },
    { name: 'Petrobras S.A.', country: 'BR' },
    { name: 'Toyota Motor Corporation', country: 'JP' },
    { name: 'Microsoft Corporation', country: 'US' },
    { name: 'Vale S.A.', country: 'BR' }
  ];

  for (const company of companies) {
    console.log(`\n📊 Fetching ratings for: ${company.name}`);
    console.log('━'.repeat(50));

    try {
      const response = await fetch('http://localhost:3002/api/ratings/extract-llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: company.name,
          country: company.country,
          use_llm: true,
          provider: 'groq'
        })
      });

      if (!response.ok) {
        console.error(`❌ HTTP Error: ${response.status} ${response.statusText}`);
        continue;
      }

      const data = await response.json();

      if (data.error) {
        console.error(`❌ API Error: ${data.error}`);
        continue;
      }

      // Display results
      console.log(`✅ Company: ${data.company}`);
      console.log(`🌍 Country: ${data.country}`);
      console.log(`📈 Average Score: ${data.averageScore}/21`);
      console.log(`🤖 Extraction Method: ${data.extractionMethod}`);

      if (data.ratings.fitch) {
        console.log(`\n  Fitch: ${data.ratings.fitch.rating} (${data.ratings.fitch.outlook})`);
        console.log(`    Score: ${data.ratings.fitch.normalized}/21`);
        console.log(`    Confidence: ${(data.ratings.fitch.confidence * 100).toFixed(0)}%`);
      }

      if (data.ratings.sp) {
        console.log(`\n  S&P: ${data.ratings.sp.rating} (${data.ratings.sp.outlook})`);
        console.log(`    Score: ${data.ratings.sp.normalized}/21`);
        console.log(`    Confidence: ${(data.ratings.sp.confidence * 100).toFixed(0)}%`);
      }

      if (data.ratings.moodys) {
        console.log(`\n  Moody's: ${data.ratings.moodys.rating} (${data.ratings.moodys.outlook})`);
        console.log(`    Score: ${data.ratings.moodys.normalized}/21`);
        console.log(`    Confidence: ${(data.ratings.moodys.confidence * 100).toFixed(0)}%`);
      }

      if (data.analysis) {
        console.log(`\n💡 Analysis: ${data.analysis}`);
      }

    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
    }
  }

  console.log('\n\n✨ Test completed!');
}

// Run the test
testLLMAPI().catch(console.error);