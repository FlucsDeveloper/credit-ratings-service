/**
 * Entity Validation & Canonicalization
 *
 * Provides company name canonicalization and alias expansion including Brazilian issuers.
 * Integrates deterministic expansion with optional LLM enhancement.
 */

import { expandAliases, AliasPack } from "../entity/alias-expander";
import { expandCompanyAliasesLLM } from "../llm/deepseek";

/**
 * Canonicalize company name and generate comprehensive alias list
 * @param query Company name or ticker
 * @param llmAliases Optional LLM-generated aliases
 * @returns Canonicalized entity with all aliases
 */
export async function canonicalizeEntity(
  query: string,
  llmAliases: string[] = []
): Promise<AliasPack> {
  // Start with deterministic expansion
  const basePack = expandAliases(query);

  // Add Brazilian issuer patterns if applicable
  const brAliases = generateBrazilianAliases(query);

  // Combine all sources
  const allAliases = new Set([
    ...basePack.aliases,
    ...llmAliases,
    ...brAliases,
  ]);

  // Filter out very short aliases (likely noise)
  const filtered = Array.from(allAliases).filter(alias => alias.length >= 3);

  // De-duplicate case-insensitively but preserve original casing
  const uniqueAliases = deduplicateCaseInsensitive(filtered);

  return {
    legal_name: basePack.legal_name,
    aliases: uniqueAliases,
    hints: {
      ...basePack.hints,
      hasBrazilianPattern: brAliases.length > 0,
    },
  };
}

/**
 * Generate Brazilian-specific company name variations
 */
function generateBrazilianAliases(name: string): string[] {
  const aliases: string[] = [];

  // Common Brazilian legal suffixes
  const brSuffixes = ["S.A.", "SA", "LTDA", "Ltda.", "S/A"];

  // Check if name looks Brazilian (has Portuguese patterns)
  const hasBrPattern =
    /\b(Banco|Bradesco|Itaú|Itau|Nubank|Nu|Inter|BTG|XP|Magazine Luiza|Magalu|Petrobrás|Petrobras|Vale|Eletrobras|Ambev)\b/i.test(
      name
    );

  if (!hasBrPattern) {
    return aliases;
  }

  // Add with/without accents
  if (name.includes("á") || name.includes("é") || name.includes("ã")) {
    const normalized = name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    aliases.push(normalized);
  }

  // Add common variations
  if (/Itaú/i.test(name)) {
    aliases.push("Itau", "Itaú Unibanco", "Itau Unibanco");
  }

  if (/Nubank|Nu Holdings/i.test(name)) {
    aliases.push("Nubank", "Nu Holdings", "Nu", "Nu Pagamentos");
  }

  if (/Petrobrás|Petrobras/i.test(name)) {
    aliases.push("Petrobras", "Petrobrás", "Petróleo Brasileiro");
  }

  // Add legal suffix variations
  const baseName = name.replace(/\b(S\.A\.|SA|LTDA|Ltda\.|S\/A)\b/gi, "").trim();
  if (baseName !== name) {
    aliases.push(baseName);
    brSuffixes.forEach(suffix => {
      aliases.push(`${baseName} ${suffix}`);
    });
  }

  return aliases;
}

/**
 * De-duplicate aliases case-insensitively while preserving original casing
 */
function deduplicateCaseInsensitive(aliases: string[]): string[] {
  const seen = new Map<string, string>();

  aliases.forEach(alias => {
    const lower = alias.toLowerCase();
    if (!seen.has(lower)) {
      seen.set(lower, alias);
    }
  });

  return Array.from(seen.values());
}

/**
 * Full entity resolution: canonicalize + LLM expansion
 * @param query Company name or ticker
 * @returns Complete alias pack
 */
export async function resolveEntity(query: string): Promise<AliasPack> {
  // Get LLM aliases (will silently fail if no API key)
  const llmAliases = await expandCompanyAliasesLLM(query);

  // Canonicalize with all sources
  return canonicalizeEntity(query, llmAliases);
}

/**
 * Batch resolve multiple entities
 */
export async function resolveEntitiesBatch(
  queries: string[],
  concurrency = 3
): Promise<Map<string, AliasPack>> {
  const results = new Map<string, AliasPack>();

  for (let i = 0; i < queries.length; i += concurrency) {
    const batch = queries.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async q => {
        const pack = await resolveEntity(q);
        return { query: q, pack };
      })
    );

    batchResults.forEach(({ query, pack }) => {
      results.set(query, pack);
    });
  }

  return results;
}
