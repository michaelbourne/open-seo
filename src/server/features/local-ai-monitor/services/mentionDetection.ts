import { extractCitations } from "@/server/features/ai-search/services/promptExplorer";
import type { LlmResponseResult } from "@/server/lib/dataforseoLlmSchemas";
import { normalizeDomain } from "@/types/schemas/domain";

function extractText(response: LlmResponseResult): string {
  const textParts: string[] = [];
  for (const item of response.items ?? []) {
    if (item.type !== "message") continue;
    for (const section of item.sections ?? []) {
      if (typeof section.text === "string" && section.text.length > 0) {
        textParts.push(section.text);
      }
    }
  }
  return textParts.join("\n\n").trim();
}

function mentionRegex(brand: string): RegExp {
  const escaped = brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const firstEscaped = brand[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const lastEscaped = brand[brand.length - 1].replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
  const leading = /^\w/.test(brand) ? "\\b" : `(?<!${firstEscaped})`;
  const trailing = /\w$/.test(brand) ? "\\b" : `(?!${lastEscaped})`;
  return new RegExp(`${leading}${escaped}${trailing}`, "i");
}

function matchesBrand(
  url: string,
  title: string | null | undefined,
  highlightBrand: string,
): boolean {
  const needle = highlightBrand.toLowerCase();
  const haystack = `${url} ${title ?? ""}`.toLowerCase();
  return haystack.includes(needle);
}

function buildExcerpt(text: string, needle: string, radius = 120): string {
  const match = mentionRegex(needle).exec(text);
  if (!match || match.index == null) {
    return text.slice(0, radius * 2).trim();
  }
  const start = Math.max(0, match.index - radius);
  const end = Math.min(text.length, match.index + needle.length + radius);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}

function collectNeedles(target: {
  businessName: string;
  domain?: string | null;
}): string[] {
  const needles = new Set<string>();
  const businessName = target.businessName.trim();
  if (businessName) needles.add(businessName);

  const rawDomain = target.domain?.trim();
  if (rawDomain) {
    needles.add(rawDomain);
    try {
      needles.add(normalizeDomain(rawDomain));
    } catch {
      // Keep the raw domain only.
    }
  }

  return [...needles];
}

export function detectBusinessMention(
  response: LlmResponseResult,
  target: { businessName: string; domain?: string | null },
): { mentioned: boolean; excerpt: string | null } {
  const text = extractText(response);
  const citations = extractCitations(response);
  const needles = collectNeedles(target);

  for (const needle of needles) {
    if (citations.some((citation) => matchesBrand(citation.url, citation.title, needle))) {
      return {
        mentioned: true,
        excerpt: text ? buildExcerpt(text, needle) : null,
      };
    }
    if (text && mentionRegex(needle).test(text)) {
      return { mentioned: true, excerpt: buildExcerpt(text, needle) };
    }
  }

  return { mentioned: false, excerpt: null };
}
