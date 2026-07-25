FROM golang:1.23-alpine AS build
WORKDIR /src
COPY go.mod ./
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /isobar-api ./cmd/api

FROM alpine:3.21
RUN adduser -D -H -u 10001 app
USER app
COPY --from=build /isobar-api /isobar-api
EXPOSE 8081
ENTRYPOINT ["/isobar-api"]

