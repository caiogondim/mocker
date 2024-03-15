# Recipes

## VI using mocker as a Samizdat proxy

0. Be sure to be logged in on vault

```bash
vault login -method=github
```

1. Start mocker as a proxy to Samizdat

```bash
yarn dev --origin https://samizdat-graphql.example.com --mode read-write --redactedHeaders "{ \"nyt-token\": \"$(vault read -field=token nytm/wf-user-secrets/secret/vi/samizdat-tokens-0.0.5/SAMIZDAT_TOKEN_0_0_5_PRD)\" }" --logging verbose --responsesDir './responses/samizdat' --workers 1 --cache false --mockKeys url,method,body.operationName,body.variables --port 8733 --retries 3 --overwriteResponseHeaders '{ "Access-Control-Allow-Origin": "http://localhost:3000", "Access-Control-Allow-Credentials": true, "Access-Control-Allow-Headers": "Origin, Content-Type, Accept, nyt-app-type, nyt-app-version, nyt-token", "Access-Control-Expose-Headers": "x-nyt-country, x-nyt-region, x-nyt-continent" }' --overwriteRequestHeaders '{ "host": null, "referer": null, "if-modified-since": null }'
```

2. Start VI

```bash
NODE_ENV=test NODE_OPTIONS='--max-http-header-size=1000000 --unhandled-rejections=strict' DISABLE_PERSISTED_QUERIES=true SAMIZDAT_TOKEN=$(vault read -field=token nytm/wf-user-secrets/secret/vi/samizdat-tokens-0.0.5/SAMIZDAT_TOKEN_0_0_5_PRD) GQL_HOST_SERVER=http://localhost:8733 GQL_HOST_CLIENT=http://localhost:8733 yarn dev
```

3. Run e2e tests

```bash
WDIO_BASE_URL="http://localhost:3000" yarn e2e-tabletlarge
```

## mocker as a proxy for a simple HTTP server for development

1. Start the `math-server`

```bash
node tools/mocker/tools/math-server 8889
```

2. Start mocker as a proxy for `math-server`

```bash
yarn dev --port 8890 --mode read-write --responsesDir responses/math-server --origin http://localhost:8889 --overwriteRequestHeaders '{ "user-agent": "lorem ipsum" }' --logging verbose --redactedHeaders '{"date": null, "cache-control": null}'
```

## Flagging a mock file as "locked"

For flagging a given mock as "locked" in order to avoid the `--update startup`
feature, set the file as "read-only".

```
chmod -w path/to/mock/1c03e3d0037dcc72b4c7bb4c8c053e9ed4b028a3b6757b6c74a5d64361951a54.json
```
