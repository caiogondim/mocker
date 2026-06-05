FROM oven/bun:1.3.14-slim

ARG username=bun
ENV APP_HOME=/home/${username}/mocker

WORKDIR ${APP_HOME}

COPY --chown=${username}:${username} mocker package.json ./
COPY --chown=${username}:${username} src/ ./src/

USER ${username}

ENTRYPOINT ["bun", "--max-http-header-size=1000000", "mocker"]
