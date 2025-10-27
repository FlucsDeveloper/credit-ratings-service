import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Bring v3 modules (assume you already have equivalents). Minimal imports shown:
import { fetchHtml } from "@/lib/scraper/fetch-v3";
import { fetchRenderedHtml } from "@/lib/scraper/headless-fetch-v3";
import { deepseekExtract } from "@/lib/ai/deepseek-extractor-v3";
import { buildSourceGraph, getTrustedUrls } from "@/lib/crawler/source-graph";
import { qualityScore, needsRescrape, checksum } from "@/lib/validator/quality-loop";

function toVisible(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 50000);
}

// Extremely small resolver for demo; replace with your real resolver:
function resolveEntity(q: string) {
  const map: Record<string, { name: string; ir?: string; country?: string }> = {
    "Microsoft": { name: "Microsoft Corporation", ir: "https://www.microsoft.com/en-us/Investor", country: "US" },
    "Petrobras": { name: "Petróleo Brasileiro S.A.", ir: "https://petrobras.com.br/ri", country: "BR" },
    "Nubank": { name: "Nu Holdings Ltd.", ir: "https://investors.nu", country: "BR" },
  };
  return map[q] ?? { name: q };
}

async function loadSmart(url: string) {
  try {
    let html = await fetchHtml(url, 6000);
    const looksJs = html.length < 3000 || /<script[^>]*>/.test(html);
    if (looksJs) {
      const rendered = await fetchRenderedHtml(url, 12000);
      if (rendered && rendered.length > html.length) html = rendered;
    }
    return html;
  } catch { return ""; }
}

export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const traceId = uuidv4();
  const url = new URL(req.url);
  const q = url.searchParams.get("q") || "";
  if (!q) {
    return NextResponse.json({ status: "error", diagnostics: { errors: ["missing_query"] }, meta: { traceId } }, { status: 200 });
  }

  try {
    const entity = resolveEntity(q);
    const seeds: string[] = [];
    if (entity.ir) seeds.push(entity.ir, `${entity.ir}/ratings`, `${entity.ir}/credit-ratings`, `${entity.ir}/investor-relations`);

    // Fetch seed pages
    const seedHtmls: {url: string; html: string}[] = [];
    for (const s of Array.from(new Set(seeds))) {
      const html = await loadSmart(s);
      if (html && html.length > 400) seedHtmls.push({ url: s, html });
    }

    // Build source graph and add trusted URLs
    const graph = await buildSourceGraph(seedHtmls, 1);
    const trusted = getTrustedUrls(graph, 0.7).slice(0, 10);

    // Retrieve trusted pages
    const pages: {url: string; text: string}[] = [];
    for (const u of trusted) {
      const html = await loadSmart(u);
      if (html && html.length > 400) pages.push({ url: u, text: toVisible(html) });
    }

    // Merge content
    const merged = pages.map(p => p.text).join(" ").slice(0, 50000);

    // Extraction (LLM)
    const llm = await deepseekExtract(entity.name, merged);
    const entries = (llm?.entries ?? []).map((e: any) => ({
      agency: e.agency,
      rating_raw: e.rating_raw,
      outlook: e.outlook ?? null,
      as_of: e.as_of ?? null,
      scale: e.scale ?? null,
      confidence: e.confidence ?? 0.5,
      source: e.source_hint ?? (pages[0]?.url ?? "")
    }));

    // Quality scoring (assume regex hit unknown here)
    const scored = entries.map(e => ({ ...e, score: qualityScore(e, /*hasRegexHit*/ false) }));
    const status = scored.length ? "ok" : "degraded";

    const resp = {
      query: q,
      status,
      entity: { legal_name: entity.name, country: (entity as any).country ?? null },
      ratings: scored.map(e => ({
        agency: e.agency,
        rating_raw: e.rating_raw,
        outlook: e.outlook,
        as_of: e.as_of,
        scale: e.scale,
        confidence: e.confidence,
        quality_score: e.score,
        checksum: checksum({ agency: e.agency, rating_raw: e.rating_raw, as_of: e.as_of })
      })),
      diagnostics: {
        urls_tried: [...new Set([...seeds, ...trusted])].slice(0, 12),
        sources_used: ["IR seeds", "source-graph", "LLM"],
        errors: []
      },
      meta: { traceId, elapsedMs: Date.now() - t0, ai_version: process.env.DEEPSEEK_MODEL_ID ?? "deepseek-chat" }
    };

    return NextResponse.json(resp, { status: 200 });
  } catch (err: any) {
    const resp = {
      query: q,
      status: "degraded",
      entity: { legal_name: q },
      ratings: [],
      diagnostics: { errors: ["unhandled"], message: String(err) },
      meta: { traceId, elapsedMs: Date.now() - t0 }
    };
    return NextResponse.json(resp, { status: 200 });
  }
}
