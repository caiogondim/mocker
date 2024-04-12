FROM node:20-alpine3.18
ARG username=node
ENV \
  APP_HOME=/home/${username}/mocker \
  NODE_OPTIONS='--max-http-header-size=1000000 --unhandled-rejections=strict'
WORKDIR ${APP_HOME}

COPY . ${APP_HOME}

USER $username

ENTRYPOINT ["./mocker"]
