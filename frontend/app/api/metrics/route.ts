/**
 * Metrics API Endpoint
 *
 * Returns cache and performance metrics from SQLite cache.
 * Used for monitoring and debugging.
 *
 * GET /api/metrics
 */

import { NextRequest, NextResponse } from "next/server";
import { getCache } from "@/lib/cache/sqlite-cache";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const cache = getCache();
    const metrics = cache.getMetrics();

    // Calculate derived metrics
    const totalRequests = metrics.cache_hits + metrics.cache_misses;
    const cacheHitRate = totalRequests > 0 ? metrics.cache_hits / totalRequests : 0;

    const response = {
      metrics: {
        ...metrics,
        cache_hit_rate: parseFloat((cacheHitRate * 100).toFixed(2)), // Percentage
      },
      timestamp: new Date().toISOString(),
      status: "ok",
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("[metrics] Error fetching metrics:", error);
    return NextResponse.json({ error: "Failed to fetch metrics" }, { status: 500 });
  }
}
