import { NextRequest, NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { expandAliases } from "@/lib/entity/alias-expander";
import { collectAgencyEvidence, summarizeEvidence } from "@/lib/evidence/agency-orchestrator";
import { deepseekExtractFromWindows } from "@/lib/ai/deepseek-extractor-v3";
import { decideNotRated } from "@/lib/evidence/not-rated";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Simple resolver - can be replaced with your full entity resolver
function resolveEntity(q: string) {
  const map: Record<string, { legal_name: string; country?: string }> = {
    "Microsoft": { legal_name: "Microsoft Corporation", country: "US" },
    "Petrobras": { legal_name: "Petróleo Brasileiro S.A.", country: "BR" },
    "Nubank": { legal_name: "Nu Holdings Ltd.", country: "BR" },
  };
  return map[q] ?? { legal_name: q, country: null };
}

export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const traceId = uuid();
  const q = new URL(req.url).searchParams.get("q") || "";

  if (!q) {
    return NextResponse.json(
      { status: "error", diagnostics: { errors: ["missing_query"] }, meta: { traceId } },
      { status: 200 }
    );
  }

  try {
    const entity = resolveEntity(q);
    const aliases = expandAliases(entity.legal_name).aliases;

    // Check if search connector is available
    const searchKey = process.env.SERPAPI_API_KEY;
    if (!searchKey || searchKey === "REPLACE") {
      return NextResponse.json({
        query: q,
        status: "degraded",
        entity: { legal_name: entity.legal_name, country: entity.country },
        ratings: [],
        diagnostics: {
          message: "Search connector unavailable (SERPAPI_API_KEY not configured)",
          sources_used: [],
          evidence_count: 0,
          domains: []
        },
        meta: { traceId, elapsedMs: Date.now() - t0 }
      }, { status: 200 });
    }

    // 1) Collect agency/press evidence windows (HTML excerpts near needles)
    const evidence = await collectAgencyEvidence(aliases, 12000);
    const triedSummary = summarizeEvidence(evidence);

    if (!evidence.length) {
      const nr = decideNotRated(0, []);
      return NextResponse.json({
        query: q,
        status: "degraded",
        entity: { legal_name: entity.legal_name, country: entity.country },
        ratings: [],
        diagnostics: {
          message: nr.rationale,
          sources_used: ["agency-search", "press/ir"],
          evidence_count: 0,
          domains: triedSummary.domains
        },
        meta: { traceId, elapsedMs: Date.now() - t0 }
      }, { status: 200 });
    }

    // 2) LLM extraction on evidence windows
    const windows = evidence.map(e => e.text);
    const out = await deepseekExtractFromWindows(entity.legal_name, windows);
    const entries = (out?.entries ?? []).filter((e: any) => e.rating_raw).map((e: any) => ({
      agency: e.agency,
      rating_raw: e.rating_raw,
      outlook: e.outlook ?? null,
      as_of: e.as_of ?? null,
      scale: e.scale ?? null,
      confidence: e.confidence ?? 0.6,
      source: e.source_hint ?? null
    }));

    const status = entries.length ? "ok" : "degraded";

    return NextResponse.json({
      query: q,
      status,
      entity: { legal_name: entity.legal_name, country: entity.country },
      ratings: entries,
      diagnostics: {
        sources_used: ["agency-search", "press/ir", "llm-evidence"],
        evidence_count: evidence.length,
        domains: triedSummary.domains
      },
      meta: {
        traceId,
        elapsedMs: Date.now() - t0,
        ai_version: process.env.DEEPSEEK_MODEL_ID ?? "deepseek-chat"
      }
    }, { status: 200 });

  } catch (err: any) {
    return NextResponse.json({
      query: q,
      status: "degraded",
      entity: { legal_name: q },
      ratings: [],
      diagnostics: { errors: ["unhandled"], message: String(err) },
      meta: { traceId, elapsedMs: Date.now() - t0 }
    }, { status: 200 });
  }
}
