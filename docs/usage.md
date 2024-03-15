## Usage

```bash
yarn start --origin http://the-server-to-be-mocked --responsesDir ./responses/samizdat --mode read-write
```

## Options

`--origin`

- Required: `true`
- e.g.: `--origin https://samizdat-graphql.example.com`

`--responsesDir`

- Required: `true`
- e.g.: `--responsesDir ~/Desktop`

Path to read/write mocked responses.

`--mockKeys`

- Required: `false`
- Default: `url,method`
- Valid values: A subset of `url`, `method`, `headers`, `body`
- e.g.: `--mockKeys url,method`, `--mockKeys url,method,body`

It's also possible to select a slice of the body request, if it's formmatted as
JSON, using a dot notation: `--mockKeys url,method,body.prop1.prop2`

`--port`

- Required: `false`
- Default: `8273`

`--redactedHeaders`

- Required: `false`
- Default: `{}`
- Example: `{ "nyt-token": null }`

Header names to be considered secret and be removed before saving the mock file
or logging.

Header names present on key values will be redacted. Values are used to unredact
secrets before updating mocks with `--update startup`.

`--retries`

- Required: `false`
- Default: `0`

Max number of requests to origin while response is not 200. Be careful about
enabling retries for idempotent endpoints (HTTP POST, HTTP PATCH, ...).

`--delay`

- Required: `false`
- Default: `0`

Adds a synthetic delay to each request. Value in miliseconds.

`--throttle`

- Required: `false`
- Default: `Infinity`

Adds a synthetic throttling to each request. Value in kB/s.

`--update`

- Required: `false`
- Default: `off`
- Valid values:
  - `startup`: updates all mocks in `--responsesDir` at startup time.
  - `off`
  - `only`: updates all mocks in `--responsesDir` and terminates process

`--mode`

- Required: `false`
- Default: `pass`
- Valid values:
  - `pass`: gets response for every request from origin
  - `read`: if a mocked response exists for the request, use it, otherwise
    returns a 404
  - `write`: gets response for request from origin and save it, rewriting if one
    already exists
  - `read-write`: if a mocked response exists for the request, use it, otherwise
    get a response from origin, save it and send it to the user agent
  - `read-pass`: if a mocked response exists for the request, use it, otherwise
    returns from origin
  - `pass-read`: if origin is available and returns a not-500, use it, otherwise
    tries to use a mocked response

`--workers`

- Required: `false`
- Default: `1`

The total number of spawned process is `workers + 1` since there is also a load
balancer on top of all workers.

`--logging`

- Required: `false`
- Default: `verbose`
- Valid values:
  - `silent`: no logging
  - `error`: only `logger.error`
  - `warn`: `logger.error` + `logger.warn`
  - `verbose`: enable all logging

`--overwriteResponseHeaders`

- Required: `false`
- Default: `{}`

JSON of HTTP response headers to be overwritten with passed values.

`--overwriteRequestHeaders`

- Required: `false`
- Default: `{}`

JSON of HTTP request headers to be overwritten with passed values. The new
headers will be used on the request to origin.

`--cors`

- Required: `false`
- Default: `false`

Send CORS headers between client and proxy. Helpful in case origin is also
sending CORS headers.
