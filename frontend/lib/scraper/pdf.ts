import * as pdfParse from "pdf-parse";

export async function tryParsePdf(buf: Buffer) {
  try {
    const data = await pdfParse(buf);
    return { ok: true as const, text: data.text || "" };
  } catch (e: any) {
    return { ok: false as const, error: String(e) };
  }
}

// Stub exports for compatibility with retriever.ts
export async function findPdfLinks(html: string): Promise<string[]> {
  const pdfLinks: string[] = [];
  const regex = /href=["']([^"']+\.pdf[^"']*)["']/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    pdfLinks.push(match[1]);
  }
  return pdfLinks;
}

export async function fetchPdfText(url: string): Promise<string> {
  try {
    const response = await fetch(url);
    if (!response.ok) return "";
    const buffer = await response.arrayBuffer();
    const result = await tryParsePdf(Buffer.from(buffer));
    return result.ok ? result.text : "";
  } catch {
    return "";
  }
}
