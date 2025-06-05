FROM python:3.12-alpine3.21 AS builder

RUN apk add --no-cache build-base

WORKDIR /build

COPY drawing/ ./drawing/
COPY *.py ./
COPY *.html ./
COPY *.css ./

RUN pip install --no-cache-dir pyinstaller

RUN pyinstaller --onefile app.py

# --------------------------------------------------------
FROM alpine:3.21

WORKDIR /app

COPY --from=builder /build/dist/app /app/app

COPY drawing/ ./drawing/
COPY *.html ./
COPY *.css ./

RUN chmod +x /app/app

CMD ["./app"]
