package main

import (
	"log"
	"net/http"
	"os"
	"time"

	"isobar/internal/adapters/openmeteo"
	"isobar/internal/location"
	"isobar/internal/transport/httpapi"
	"isobar/internal/weather"
)

func main() {
	provider := openmeteo.NewClient()
	weatherService := weather.NewService(provider)
	locationService := location.NewService(provider)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8081"
	}
	server := &http.Server{
		Addr:              ":" + port,
		Handler:           httpapi.New(weatherService, locationService),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       20 * time.Second,
		WriteTimeout:      20 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	log.Printf("ISOBAR API listening on %s", server.Addr)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}
