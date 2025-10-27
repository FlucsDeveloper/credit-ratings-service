import { NextRequest, NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { expandAliases } from "@/lib/entity/alias-expander";
import { collectAgencyEvidence, summarizeEvidence } from "@/lib/evidence/agency-orchestrator";
import { deepseekExtractFromWindows } from "@/lib/ai/deepseek-extractor-v5";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    const aliasData = expandAliases(q);
    const aliases = aliasData.aliases.slice(0, 6);
    const evidence = await collectAgencyEvidence(aliases, 12000);
    const diag = summarizeEvidence(evidence);

    // Build windows with source tracking
    const windowsWithSources: Array<{ window: string; url: string }> = [];
    for (const e of evidence) {
      const parts = e.text.split(/\n+--+\n+/g).filter(Boolean);
      for (const part of parts) {
        windowsWithSources.push({ window: part, url: e.url });
      }
    }
    const limitedWindows = windowsWithSources.slice(0, 12);
    const windows = limitedWindows.map(w => w.window);
    const sources = limitedWindows.map(w => ({ url: w.url }));

    const out = await deepseekExtractFromWindows(q, aliases, windows, sources);

    const entries = (out?.entries ?? []).map((e: any) => ({
      agency: e.agency,
      rating_raw: e.rating_raw,
      outlook: e.outlook ?? null,
      as_of: e.as_of ?? null,
      scale: e.scale ?? null,
      confidence: e.confidence ?? 0.7,
      source_ref: e.source_ref ?? null
    }));

    const status = entries.length ? "ok" : "degraded";

    return NextResponse.json({
      query: q,
      status,
      ratings: entries,
      diagnostics: {
        sources_used: ["agency-search", "press/ir", "llm-evidence", "regex-prefilter", "truth-constraints"],
        evidence_count: evidence.length,
        domains: diag.domains,
        filtered_out_count: out?.filtered_out ?? 0,
        accepted_count: entries.length
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
      ratings: [],
      diagnostics: { errors: ["unhandled"], message: String(err) },
      meta: { traceId, elapsedMs: Date.now() - t0 }
    }, { status: 200 });
  }
}
