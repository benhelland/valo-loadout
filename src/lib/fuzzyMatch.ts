// Shared by the search bar's predictive dropdown (src/actions/search.ts) and
// the main gallery grid's own search filter (src/queries/gallery.ts), so
// typing "vct" (or a typo/skip like "eldervndl") finds the same things
// whether it's the dropdown suggesting one skin or the grid filtering to
// all matches.

// Fuzzy subsequence match: every character of `query` must appear in
// `target`, in order, but not necessarily contiguous - so "vct" matches
// "VCT 2026 Sigil" and typos/partial words still find things. Returns null
// for no match, otherwise a score where higher is a better match (bigger
// reward for consecutive characters and for the match starting early).
export function fuzzyScore(query: string, target: string): number | null {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let qi = 0;
  let score = 0;
  let lastMatchIndex = -1;
  let firstMatchIndex = -1;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      if (firstMatchIndex === -1) firstMatchIndex = ti;
      score += lastMatchIndex === ti - 1 ? 3 : 1; // consecutive matches score higher
      lastMatchIndex = ti;
      qi++;
    }
  }
  if (qi < q.length) return null; // not every query character was found in order

  score += Math.max(0, 8 - firstMatchIndex); // earlier match start scores higher
  return score;
}
