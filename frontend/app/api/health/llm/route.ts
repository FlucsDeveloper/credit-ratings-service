/**
 * LLM Provider Health Check
 * Returns information about which LLM provider is active
 */

import { NextResponse } from 'next/server';
import { getLLMProviderInfo } from '@/lib/ai/rating-extractor';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const providerInfo = getLLMProviderInfo();

    return NextResponse.json({
      llm: {
        active: providerInfo.active,
        available: providerInfo.available,
        forced: providerInfo.forced,
        status: providerInfo.active ? 'enabled' : 'regex-only',
        mode: providerInfo.active
          ? `LLM Fallback (${providerInfo.available.find(p => p.name === providerInfo.active)?.label})`
          : 'Regex-only (No LLM)',
      },
      capabilities: {
        regex: true, // Always available
        llmFallback: !!providerInfo.active,
        institutionalValidation: true,
        multiAgencySupport: true,
      },
      timestamp: new Date().toISOString(),
    }, {
      status: 200,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-LLM-Provider': providerInfo.active || 'none',
      }
    });

  } catch (error: any) {
    return NextResponse.json({
      llm: {
        active: null,
        available: [],
        forced: null,
        status: 'error',
        mode: 'Unknown',
        error: error.message,
      },
      capabilities: {
        regex: true,
        llmFallback: false,
        institutionalValidation: true,
        multiAgencySupport: true,
      },
      timestamp: new Date().toISOString(),
    }, {
      status: 200,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-LLM-Provider': 'error',
      }
    });
  }
}
