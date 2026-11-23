ARG BASE_IMAGE
FROM ${BASE_IMAGE}
WORKDIR /app/account-models
COPY . /app/account-models
USER node
ENV HOST=0.0.0.0 PORT=3192 NAUMI_ACCOUNT_MODEL_DATA=/data NAUMI_ACCOUNT_MODEL_ASSETS=/app/account-models
CMD ["node","server.mjs"]
