/**
 * FormPilot AI — Fuzzy Matching & Spell Correction
 * Levenshtein distance + trigram similarity + alias expansion
 */

(function() {
  'use strict';

  // ─── Levenshtein Distance ──────────────────────────────────────────────────
  function levenshtein(a, b) {
    a = a.toLowerCase(); b = b.toLowerCase();
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        dp[i][j] = a[i-1] === b[j-1]
          ? dp[i-1][j-1]
          : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
      }
    }
    return dp[a.length][b.length];
  }

  // ─── Trigram Similarity ────────────────────────────────────────────────────
  function trigrams(str) {
    const s = (' ' + str.toLowerCase() + ' ');
    const set = new Set();
    for (let i = 0; i < s.length - 2; i++) set.add(s.slice(i, i + 3));
    return set;
  }

  function trigramSimilarity(a, b) {
    const ta = trigrams(a), tb = trigrams(b);
    if (!ta.size && !tb.size) return 1;
    if (!ta.size || !tb.size) return 0;
    let common = 0;
    ta.forEach(t => { if (tb.has(t)) common++; });
    return (2 * common) / (ta.size + tb.size);
  }

  // ─── Normalise label ──────────────────────────────────────────────────────
  function normalise(str) {
    return String(str || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // ─── Token overlap ─────────────────────────────────────────────────────────
  function tokenOverlap(a, b) {
    const ta = new Set(normalise(a).split(' ').filter(Boolean));
    const tb = new Set(normalise(b).split(' ').filter(Boolean));
    if (!ta.size || !tb.size) return 0;
    let common = 0;
    ta.forEach(t => { if (tb.has(t)) common++; });
    return (2 * common) / (ta.size + tb.size);
  }

  // ─── Combined Score ────────────────────────────────────────────────────────
  function matchScore(fieldLabel, profileKey) {
    const a = normalise(fieldLabel);
    const b = normalise(profileKey);
    if (!a || !b) return 0;
    if (a === b) return 1;
    if (a.includes(b) || b.includes(a)) return 0.92;
    const trig = trigramSimilarity(a, b);
    const tok  = tokenOverlap(a, b);
    const lev  = levenshtein(a, b);
    const levScore = 1 - (lev / Math.max(a.length, b.length, 1));
    return Math.max(trig * 0.5 + tok * 0.3 + levScore * 0.2, 0);
  }

  // ─── Find Best Match ───────────────────────────────────────────────────────
  // profileKV: Array<{ key, value, aliases: string[] }>
  function findBestMatch(fieldLabel, profileKV, threshold) {
    threshold = threshold == null ? 0.45 : threshold;
    let best = null, bestScore = 0;

    for (const item of profileKV) {
      // Score against key
      let score = matchScore(fieldLabel, item.key);

      // Score against each alias — take max
      if (item.aliases && item.aliases.length) {
        for (const alias of item.aliases) {
          const s = matchScore(fieldLabel, alias);
          if (s > score) score = s;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        best = item;
      }
    }

    if (bestScore >= threshold) return { item: best, score: bestScore };
    return null;
  }

  // ─── Spell-correct a label against known keys ──────────────────────────────
  function spellCorrect(label, knownKeys) {
    let best = label, bestScore = 0;
    for (const k of knownKeys) {
      const s = matchScore(label, k);
      if (s > bestScore) { bestScore = s; best = k; }
    }
    return bestScore > 0.55 ? best : label;
  }

  const FPFuzzy = { matchScore, findBestMatch, spellCorrect, normalise };

  if (typeof module !== 'undefined') module.exports = FPFuzzy;
  else window.FPFuzzy = FPFuzzy;
})();
