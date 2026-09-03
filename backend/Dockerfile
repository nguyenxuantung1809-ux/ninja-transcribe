FROM brainicism/bgutil-ytdlp-pot-provider:1.3.2 AS pot-provider

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates libstdc++6 \
    && rm -rf /var/lib/apt/lists/*

# YouTube increasingly requires per-video Proof-of-Origin tokens for playback,
# captions, and audio URLs. Bundle the official bgutil provider in the same
# container so no browser cookie or user download is required.
COPY --from=pot-provider /usr/local/bin/node /usr/local/bin/node
COPY --from=pot-provider /app /opt/bgutil-pot-provider

WORKDIR /service
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app

RUN useradd --create-home --uid 10001 appuser \
    && chown -R appuser:appuser /service
USER appuser

CMD ["sh", "-c", "node /opt/bgutil-pot-provider/build/main.js & exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
