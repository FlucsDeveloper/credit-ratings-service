const SAMPLE = ["Microsoft", "Petrobras", "Nubank", "Bradesco", "Santander Brasil", "MercadoLibre", "Vale"];

async function hit(name: string) {
  const url = `http://localhost:3000/api/ratings-v5?q=${encodeURIComponent(name)}`;
  const res = await fetch(url);
  const json: any = await res.json();
  const ok = Array.isArray(json?.ratings) && json.ratings.length > 0;
  console.log(name, ok ? "OK" : "MISS", JSON.stringify(json?.ratings?.[0] ?? {}, null, 0));
  return ok ? 1 : 0;
}

(async () => {
  let got = 0;
  for (const s of SAMPLE) {
    got += await hit(s);
  }
  console.log(`\nprecision(sample) ~ ${got}/${SAMPLE.length}`);
})();
