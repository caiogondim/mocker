# Architecture

> 💡**Tip**
>
> It's recommended to read first the [Terminology](./terminology.md) docs before
> jumping into the architecture.

## Data flow

A response can either come from a previous mocked response or directly from
origin.

### Checking if there is a mocked response for a given request

HTTP is a pure text protocol over a TCP socket. A request comes to the server as
follows:

```
POST /test HTTP/1.1                             ━━━ HTTP method + URL + HTTP version
Host: foo.example                               ━┓
Content-Type: application/json                   ┃━ Headers
Connection: keep-alive                          ━┛
                                                ━━━ New line (CRLF) to separate Headers and Body
{                                               ━┓
  "foo": 1,                                      ┃
  "bar": 2,                                      ┃━ Body
}                                               ━┛
```

Based on the values of `--mockKeys` we pick different attributes from the
request to create a hash and then we check if a file with that name exists.

Let's say that we have `--mockKeys url,method,body`. For each request we would
get the URL, HTTP method and body to create a hash of those values. That gives
us an id that represents that request.

```
const filename = `${hash(`${url} ${method} ${body}`)}.json`
```

If a file with a filename equals to `filename` exists on `--mocksDir`, we use
that file as a mocked response.

### Has mocked response for the request

In case there is a mocked request there is no need to fetch from origin and a
response is created from the mocked response file saved on disk.

<img src="./img/architecture/has-mock.png" />

### No mocked response for the request

In case there is no mocked response for the request we fetch from origin and, if
`--mode` is equal to `read` or `read-write`, the response is saved on disk to be
used as a mocked response for future requests.

<img src="./img/architecture/no-mock.png" />

## Error handling

Mocker runs as a single process. It responds to termination signals (SIGHUP,
SIGINT, SIGTERM) and performs graceful shutdown.

## Automatic retries for improved network resilience

It's possible to start mocker with `--retries N` for it to work as a network
resilience layer. Especially useful in conjunction with `--mode pass`.

<img src="./img/architecture/automatic-retry.png" />

## Secrets hiding

It's possible to redact tokens and secrets from request and response headers
before saving them to mock files or logging them on screen using the param
`--redactedHeaders`. The redacted headers will be replaced by `'[REDACTED]'`;

## Folder structure

### `./mocker`

Entry point for CLI. It parses the args coming from the `argv` and uses it to
create a mocker instance.

### `src/`

All lib code lives here.

### `src/index`

Library entry point.

### `src/mock-manager`

`MockManager` is responsible for managing mocks saved on disk. It implements the
following API:

- `get`
- `set`
- `clear`
- `getAll`
- `size`

### `src/origin`

Logic related to fetching responses from origin.

### `src/args`

Parses args from argv.
