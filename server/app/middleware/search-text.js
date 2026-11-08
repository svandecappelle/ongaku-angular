/**
 * Matching of the searches: every word typed must be found somewhere (in any field, in any
 * order), ignoring case, accents and punctuation: "beyonce" finds "Beyoncé", "acdc" and "ac/dc"
 * find "AC/DC", "guns n roses" finds "Guns N' Roses". The text typed is never a regular
 * expression: "C++" or "(live)" are searched as they are.
 */

/** Lower case, without accents */
function normalize(text) {
  return String(text === undefined || text === null ? '' : text)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

/** Letters and digits only: punctuation and spaces do not count */
function compact(text) {
  return normalize(text).replace(/[^\p{L}\p{N}]/gu, '');
}

/**
 * A search: its words, compacted. A search made only of punctuation ("!!!") keeps its
 * characters, so that it still finds the names made of them.
 */
function parse(query) {
  const raw = normalize(query).replace(/^~/, '').trim();
  const words = raw.split(/\s+/).map(compact).filter(Boolean);
  return { raw, words, literal: !words.length && raw ? raw.replace(/\s+/g, '') : null };
}

/** The text of the fields of an item, prepared once for the matching */
function prepare(fields) {
  return fields.map(({ value, weight }) => {
    const values = Array.isArray(value) ? value : [value];
    const text = values.filter((item) => item !== undefined && item !== null && typeof item !== 'object').join(' ');
    return { weight, compact: compact(text), plain: normalize(text).replace(/\s+/g, '') };
  }).filter((field) => field.compact || field.plain);
}

/**
 * The relevance of prepared fields for a search, 0 when a word is missing. Each word counts the
 * weight of the best field it is found in; a field that starts with the search, or is the
 * search, counts more.
 */
function score(prepared, search) {
  if (search.literal) {
    return prepared.some((field) => field.plain.includes(search.literal)) ? 1 : 0;
  }
  if (!search.words.length) {
    return 0;
  }
  let total = 0;
  for (const word of search.words) {
    let best = 0;
    for (const field of prepared) {
      if (field.weight > best && field.compact.includes(word)) {
        best = field.weight;
      }
    }
    if (!best) {
      return 0;
    }
    total += best;
  }
  const whole = search.words.join('');
  for (const field of prepared) {
    if (field.compact === whole) {
      total += field.weight * 2;
    } else if (field.compact.startsWith(whole)) {
      total += field.weight;
    }
  }
  return total;
}

/**
 * The items matching a search, the most relevant first; items of equal relevance keep their
 * order. `fieldsOf(item)` gives [{ value, weight }].
 */
function rank(items, query, fieldsOf) {
  const search = parse(query);
  return items
    .map((item, index) => ({ item, index, score: score(prepare(fieldsOf(item)), search) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.item);
}

/** The text of a search is not empty (once its leading "~" and spaces are removed) */
function isSearch(query) {
  const search = parse(query);
  return search.words.length > 0 || !!search.literal;
}

module.exports = { normalize, compact, parse, prepare, score, rank, isSearch };
