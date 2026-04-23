# Docker

## Build image locally

```bash
docker build . -t mocker
```

## Run image locally

```bash
docker run -p 8273:8273 -t mocker --origin https://graphql.example.com --logging verbose --mocksDir ./responses/graphql-example-com
```
