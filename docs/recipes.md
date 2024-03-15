# Recipes

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
