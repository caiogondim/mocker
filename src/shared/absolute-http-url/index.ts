import { isHttpUrl } from '../http-url/index.js'
import type { AbsoluteHttpUrl, Result } from '../types.js'

function parse(url: string): Result<AbsoluteHttpUrl> {
  if (!isHttpUrl(url)) {
    return {
      ok: false,
      error: new TypeError(
        `Expected an absolute HTTP or HTTPS URL, got: "${url}"`,
      ),
    }
  }

  return { ok: true, value: url as AbsoluteHttpUrl }
}

export { parse }
