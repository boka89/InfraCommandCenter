# SPDX-License-Identifier: Apache-2.0
# Infra Command Center (ICC) — one small image: static web UI (nginx) + Python API.
FROM python:3.13-alpine

ARG ICC_VERSION=0.1.0-alpha
LABEL org.opencontainers.image.title="Infra Command Center" \
      org.opencontainers.image.description="AI-first, Git-backed command center for small-business infrastructure (bring your own servers, network, Kubernetes)" \
      org.opencontainers.image.source="https://github.com/boka89/InfraCommandCenter" \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.version="${ICC_VERSION}"

RUN apk add --no-cache nginx git openssh-client tini \
 && pip install --no-cache-dir pyyaml==6.0.2 ldap3==2.9.1 markdown==3.11.3 pymdown-extensions==13.1.2 \
 && adduser -D -H -u 10001 -s /sbin/nologin icc \
 && mkdir -p /data /etc/icc && chown icc:icc /data

COPY app/web /app/web
COPY app/api /app/api
COPY example/config /app/example/config
COPY docker /app/docker
RUN chmod 0755 /app/docker/entrypoint.sh \
 && python3 -m py_compile /app/api/icc_api.py /app/api/icc_docs.py /app/docker/render_nginx.py \
 && rm -rf /app/api/__pycache__ /app/docker/__pycache__

ENV ICC_VERSION=${ICC_VERSION} \
    ICC_DATA_DIR=/data \
    HOME=/data \
    PYTHONDONTWRITEBYTECODE=1

USER 10001
VOLUME ["/data"]
EXPOSE 8080 8081
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
ENTRYPOINT ["/sbin/tini", "--", "/app/docker/entrypoint.sh"]
