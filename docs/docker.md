# Docker

## Build image locally

```bash
docker build . -t mocker
```

## Run image locally

```bash
docker run -p 8273:8273 -t mocker --origin https://samizdat-graphql.nytimes.com --logging verbose --responsesDir ./responses/samizdat
```
