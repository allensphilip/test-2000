FROM golang:1.24 AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o transcript-analysis-api ./main.go

FROM alpine:3.21
WORKDIR /app/
COPY --from=builder /app/transcript-analysis-api .
RUN apk update && apk upgrade && apk add curl ca-certificates && \
    addgroup -S app && adduser -S app -G app && \
    chown -R app:app . && chmod +x /app/transcript-analysis-api
USER app

ENV GIN_MODE=release

CMD ["./transcript-analysis-api"]
