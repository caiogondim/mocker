/** @typedef {import('../args/types.js').Args} Args */

/**
 * Rewrite the request URL's path using the first matching `--rewritePath`
 * rule. Matching is on the path portion only, anchored at path-segment
 * boundaries (the prefix must be followed by `/` or end the path), so `/api`
 * matches `/api` and `/api/x` but not `/apiv2`. The query string is preserved.
 *
 * @param {string} url
 * @param {Args['rewritePath']} rules
 * @returns {string}
 */
function applyRewritePath(url, rules) {
  if (rules.length === 0) {
    return url
  }

  // Split on the first `?` to separate path from query. We forward the request
  // target verbatim (no URL re-encoding), so a raw slice is intentional here
  // rather than `new URL`, which would re-encode the path and drop fragments.
  const queryIndex = url.indexOf('?')
  const requestPath = queryIndex === -1 ? url : url.slice(0, queryIndex)
  const query = queryIndex === -1 ? '' : url.slice(queryIndex)

  for (const { prefix, replacement } of rules) {
    if (isPrefixMatch(requestPath, prefix)) {
      return replacement + requestPath.slice(prefix.length) + query
    }
  }

  return url
}

/**
 * Whether `prefix` matches `requestPath` at a segment boundary: the prefix
 * must be followed by `/` or be the entire path. Prevents `/api` from matching
 * `/apiv2`.
 *
 * @param {string} requestPath
 * @param {string} prefix
 * @returns {boolean}
 */
function isPrefixMatch(requestPath, prefix) {
  if (!requestPath.startsWith(prefix)) {
    return false
  }
  const nextChar = requestPath.charAt(prefix.length)
  return nextChar === '' || nextChar === '/'
}

export { applyRewritePath }
