FROM debian:bookworm-slim@sha256:7c7b2c966bc9ee8cedfeef67e0e279108992c77681fa595db4a9d65c06ccc587
RUN apt-get update && apt-get install -y --no-install-recommends \
    gramps=5.1.5-1 libgmp10 libpcre2-8-0 ca-certificates curl unzip \
    && apt-get clean
RUN curl --fail --location --retry 3 --output /tmp/geneweb.zip \
    https://github.com/geneweb/geneweb/releases/download/v7.1.0-beta2/geneweb-7.1.0-beta2-linux.zip \
    && echo '84b29e6fd1370cae81ea5f812d7fefe127396f294a949692a958556531905734  /tmp/geneweb.zip' | sha256sum --check \
    && unzip -q /tmp/geneweb.zip -d /opt/geneweb
ENV LANG=C.UTF-8 LC_ALL=C.UTF-8 GRAMPSHOME=/work/gramps-profile
WORKDIR /work
