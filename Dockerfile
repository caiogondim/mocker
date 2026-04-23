FROM node:25.8-alpine

ARG username=node
ENV APP_HOME=/home/${username}/mocker \
    NODE_OPTIONS='--max-http-header-size=1000000' \
    NODE_COMPILE_CACHE=/home/${username}/.cache/nodejs

WORKDIR ${APP_HOME}

COPY --chown=${username}:${username} mocker package.json ./
COPY --chown=${username}:${username} src/ ./src/

# Pre-warm V8 compile cache, then fix ownership for runtime user
RUN mkdir -p ${NODE_COMPILE_CACHE} && \
    (node -e "import('./src/index.js').catch(() => {})" 2>/dev/null || true) && \
    chown -R ${username}:${username} ${NODE_COMPILE_CACHE}

USER ${username}

ENTRYPOINT ["node", "mocker"]
