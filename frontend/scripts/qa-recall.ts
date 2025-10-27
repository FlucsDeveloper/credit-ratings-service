const SAMPLE = [
  "Microsoft", "Apple", "Amazon", "Petrobras", "Bradesco", 
  "Santander Brasil", "MercadoLibre", "Vale", "Itaú Unibanco", "Telefonica Brasil"
];

(async () => {
  let ok = 0, n = 0;
  for (const name of SAMPLE) {
    const url = "http://localhost:3000/api/ratings-v5?q=" + encodeURIComponent(name);
    try {
      const res = await fetch(url);
      const json: any = await res.json();
      const got = Array.isArray(json?.ratings) && json.ratings.length > 0;
      console.log(name, got ? "OK" : "MISS", got ? JSON.stringify(json.ratings[0]) : JSON.stringify(json.diagnostics));
      ok += got ? 1 : 0;
    } catch (err) {
      console.log(name, "ERROR", String(err));
    }
    n++;
  }
  console.log("\nrecall(sample) ~ " + ok + "/" + n);
})();
