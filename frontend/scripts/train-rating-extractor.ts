import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

/**
 * This script assembles a supervised dataset of rating windows from your
 * evidence pipeline logs (v4.5). It expects you persisted windows to
 * data/evidence/*.jsonl (each line with {url, text}) — if not, it will
 * still create a seed dataset from embedded examples for initial training.
 */

const OUT = "data/rating_extraction.jsonl";
const SEED: Array<{text:string; expected:any}> = [
  {
    text: "Moody's assigns Ba1 rating to Nu Pagamentos S.A.; outlook stable.",
    expected: { agency: "Moody's", rating_raw: "Ba1", outlook: "Stable", scale: "MOODYS" }
  },
  {
    text: "S&P upgrades Petrobras to BBB-, outlook positive.",
    expected: { agency: "S&P Global", rating_raw: "BBB-", outlook: "Positive", scale: "SP_FITCH" }
  },
  {
    text: "Fitch affirms Banco Bradesco SA at 'AA(bra)'; Outlook Stable.",
    expected: { agency: "Fitch", rating_raw: "AA(bra)", outlook: "Stable", scale: "LOCAL" }
  },
  {
    text: "Moody's changes outlook on Company XYZ to negative; senior unsecured at Baa3.",
    expected: { agency: "Moody's", rating_raw: "Baa3", outlook: "Negative", scale: "MOODYS" }
  }
];

const Evidence = z.object({ url: z.string(), text: z.string() });

function* readJsonl(globDir: string) {
  if (!fs.existsSync(globDir)) return;
  for (const f of fs.readdirSync(globDir)) {
    if (!f.endsWith(".jsonl")) continue;
    const p = path.join(globDir, f);
    const lines = fs.readFileSync(p, "utf8").split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        const parsed = Evidence.safeParse(obj);
        if (parsed.success) yield parsed.data;
      } catch {}
    }
  }
}

function looksLikeRating(s: string) {
  return /(Aaa|Aa1|Aa2|Aa3|A1|A2|A3|Baa1|Baa2|Baa3|Ba1|Ba2|Ba3|B1|B2|B3|Caa1|Caa2|Caa3|Ca|C)\b/.test(s)
      || /\b(AAA|AA\+|AA-|AA|A\+|A-|A|BBB\+|BBB-|BBB|BB\+|BB-|BB|B\+|B-|B|CCC|CC|C|D)\b/.test(s)
      || /AA\(bra\)|A1\.mx|BBB\+\(col\)/i.test(s);
}

function inferAgency(url: string) {
  if (/spglobal\.com\/ratings/i.test(url)) return "S&P Global";
  if (/fitchratings\.com/i.test(url)) return "Fitch";
  if (/moodys\.com|ratings\.moodys\.com/i.test(url)) return "Moody's";
  return null;
}

function labelScale(rating: string) {
  if (/^(Aaa|Aa\d|A\d|Baa\d|Ba\d|B\d|Caa\d|Ca|C|WR)$/i.test(rating)) return "MOODYS";
  if (/^\b(AAA|AA(?:\+|-)?|A(?:\+|-)?|BBB(?:\+|-)?|BB(?:\+|-)?|B(?:\+|-)?|CCC|CC|C|D)\b/.test(rating)) return "SP_FITCH";
  if (/bra|\.mx|\(col\)/i.test(rating)) return "LOCAL";
  return null;
}

function buildPrompt(text: string) {
  return `Extract credit ratings from this snippet.\nReturn STRICT JSON: {"entries":[{"agency":"","rating_raw":"","outlook":"","as_of":"","scale":"","confidence":0.0}]}\nText: """${text}"""`;
}

function toLine(text: string, agency: string|null) {
  const labelAgency = agency ?? "Unknown";
  let rating = (text.match(/(Aaa|Aa1|Aa2|Aa3|A1|A2|A3|Baa1|Baa2|Baa3|Ba1|Ba2|Ba3|B1|B2|B3|Caa1|Caa2|Caa3|Ca|C)\b/)||[])[1]
            || (text.match(/\b(AAA|AA\+|AA-|AA|A\+|A-|A|BBB\+|BBB-|BBB|BB\+|BB-|BB|B\+|B-|B|CCC|CC|C|D)\b/)||[])[1]
            || (text.match(/(AA\(bra\)|A1\.mx|BBB\+\(col\))/i)||[])[1];
  const outlook = (text.match(/\b(Stable|Positive|Negative|Developing|Watch(?: Positive| Negative)?)\b/i)||[])[1] || null;
  const scale = rating ? labelScale(rating) : null;
  const completion = {
    entries: rating ? [{ agency: labelAgency, rating_raw: rating, outlook, as_of: null, scale, confidence: 0.9 }] : []
  };
  return JSON.stringify({ prompt: buildPrompt(text), completion: JSON.stringify(completion) });
}

function main() {
  fs.mkdirSync("data", { recursive: true });
  const lines: string[] = [];

  // 1) Seed examples (guarantee the dataset exists)
  for (const s of SEED) {
    const completion = { entries: [{ ...s.expected, as_of: null, confidence: 0.95 }] };
    lines.push(JSON.stringify({ prompt: buildPrompt(s.text), completion: JSON.stringify(completion) }));
  }

  // 2) Mine evidence windows (if present)
  let mined = 0;
  for (const ev of readJsonl("data/evidence")) {
    if (!looksLikeRating(ev.text)) continue;
    const ag = inferAgency(ev.url);
    lines.push(toLine(ev.text, ag));
    mined++;
    if (lines.length > 2000) break;
  }

  fs.writeFileSync(OUT, lines.join("\n") + "\n", "utf8");
  console.log(`[dataset] wrote ${lines.length} lines to ${OUT} (mined=${mined}, seed=${SEED.length})`);
}

if (require.main === module) main();
