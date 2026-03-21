FROM node:24-alpine
ARG username=node
ENV \
  APP_HOME=/home/${username}/mocker \
  NODE_OPTIONS='--max-http-header-size=1000000'
WORKDIR ${APP_HOME}

COPY . ${APP_HOME}

USER $username

ENTRYPOINT ["./mocker"]
