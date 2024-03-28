## Terminology

A few definitions of terms used throughout the project.

### URI

We respect the same nomenclature used by
[IETF RFC 3986](https://tools.ietf.org/html/rfc3986#section-3.3).

```
           host     port
             |        |
        /‾‾‾‾‾‾‾‾‾\ /‾‾\
  foo://example.com:8042/over/there?name=ferret#nose
  \_/   \______________/\_________/ \_________/ \__/
   |           |            |            |        |
scheme     authority       path        query   fragment
```

### Mock keys

Mock keys are a group of attributes of an HTTP request used to create a hash sum
for a mocked response. It's used on mocker to check if, for a given request,
there is a mocked response.

The valid values for mock keys are:

- method
- url
- headers
- body

### Request

A request is the first part of an HTTP connection. It consists of:

- Start line: HTTP method + URL + HTTP version
- Headers (optional)
- Body (optional)

HTTP is a pure text protocol. A request comes to the server as follows:

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

By using the `--mockKeys` flag, it's possible to specify which attributes of an
HTTP request will be used to create a hash to check for a mocked response. E.g.:
if `--mockKeys` is equal to `method,url,body`, those 3 values will be used to
create a hash for a mocked response file name `hash(`${method} ${url}
\${body}`)`.

A request is a part of a [Connection](#connection), along with
[Response](#response).

### Response

On a response, data flows server -> client.

```
HTTP/1.1 200 OK                                ━━━ Status line
Date: Sun, 18 Oct 2009 08:56:53 GMT            ━┓
Last-Modified: Mon, 8 Jun 2020 07:16:26 GMT     ┃
Content-Length: 44                              ┃━ Headers
Connection: close                               ┃
Content-Type: text/html                        ━┛
                                               ━━━ New line (CRLF) to separate Headers and Body
<html>                                         ━┓
  <body><h1>It works!</h1></body>               ┃━ Body
</html>                                        ━┛
```

Mocker will either create a response from a mocked response or by piping the
response from origin to the client.

### Connection

An [HTTP request](#request) plus an [HTTP response](#response) forms a
Connection.

### Origin

The server that mocker acts as a proxy.

### Client

The client initiates an HTTP connection to mocker by sending an HTTP request.

### MockManager

Implements:

- `get`
- `has`
- `set`
- `delete`

### Streams

It's used for I/O through out the project since it's the more idiomatic and
performatic way of doing I/O in Node.js.

More info on
[Node.js docs](https://nodejs.org/dist/latest-v14.x/docs/api/stream.html).
