export type MatchCandidate = {
  alias: string;
  terms: string[];
};

function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Match outlet copy against journalist aliases / slug tokens. */
export function matchAlias(haystack: string, candidates: MatchCandidate[]): string | null {
  const text = normalize(haystack);
  if (!text) return null;

  for (const candidate of candidates) {
    const alias = normalize(candidate.alias);
    if (alias.length >= 3 && text.includes(alias)) return candidate.alias;

    for (const term of candidate.terms) {
      const t = normalize(term);
      if (t.length < 5) continue;
      if (text.includes(t)) return candidate.alias;
    }
  }
  return null;
}

/** Prefer VE/LatAm outlets for Spanish aliases when both match — caller already scopes per item. */
export function buildCandidates(
  rows: Array<{ public_alias: string; slugs?: string[] }>,
): MatchCandidate[] {
  return rows.map((row) => {
    const terms = new Set<string>();
    for (const slug of row.slugs || []) {
      for (const part of slug.split(/[-_]/g)) {
        if (part.length >= 5) terms.add(part);
      }
    }
    for (const part of row.public_alias.split(/\s+/g)) {
      if (part.length >= 5) terms.add(part);
    }
    return { alias: row.public_alias, terms: [...terms] };
  });
}
