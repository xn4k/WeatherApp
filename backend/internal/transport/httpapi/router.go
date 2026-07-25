package httpapi

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"isobar/internal/location"
	"isobar/internal/weather"
)

type weatherService interface {
	Get(context.Context, string, weather.Coordinates) (weather.Forecast, error)
}

type locationService interface {
	Search(context.Context, string) ([]location.Result, error)
}

type outlookService interface {
	Get(context.Context, weather.Coordinates, string) (weather.Outlook, error)
}

type API struct {
	weather  weatherService
	location locationService
	outlook  outlookService
}

func New(weather weatherService, location locationService, outlook outlookService) http.Handler {
	api := &API{weather: weather, location: location, outlook: outlook}
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/health", api.health)
	mux.HandleFunc("/api/v1/weather", api.forecast)
	mux.HandleFunc("/api/v1/weather/outlook", api.weatherOutlook)
	mux.HandleFunc("/api/v1/locations", api.locations)
	return api.middleware(mux)
}

func (api *API) health(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		methodNotAllowed(writer)
		return
	}
	writeJSON(writer, http.StatusOK, map[string]string{"status": "ok"})
}

func (api *API) forecast(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		methodNotAllowed(writer)
		return
	}
	latitude, err := numberParam(request, "lat", 50.9991)
	if err != nil || latitude < -90 || latitude > 90 {
		writeError(writer, http.StatusBadRequest, "invalid_coordinates", "Der Breitengrad ist ungültig.")
		return
	}
	longitude, err := numberParam(request, "lon", 7.0387)
	if err != nil || longitude < -180 || longitude > 180 {
		writeError(writer, http.StatusBadRequest, "invalid_coordinates", "Der Längengrad ist ungültig.")
		return
	}
	name := strings.TrimSpace(request.URL.Query().Get("name"))
	if name == "" {
		name = "Köln"
	}
	ctx, cancel := context.WithTimeout(request.Context(), 14*time.Second)
	defer cancel()
	result, err := api.weather.Get(ctx, name, weather.Coordinates{Latitude: latitude, Longitude: longitude})
	if err != nil {
		log.Printf("weather request failed: %v", err)
		writeError(writer, http.StatusBadGateway, "weather_unavailable", "Die Wetterdaten sind momentan nicht erreichbar.")
		return
	}
	writeJSON(writer, http.StatusOK, result)
}

func (api *API) weatherOutlook(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		methodNotAllowed(writer)
		return
	}
	latitude, err := numberParam(request, "lat", 50.9991)
	if err != nil || latitude < -90 || latitude > 90 {
		writeError(writer, http.StatusBadRequest, "invalid_coordinates", "Der Breitengrad ist ungültig.")
		return
	}
	longitude, err := numberParam(request, "lon", 7.0387)
	if err != nil || longitude < -180 || longitude > 180 {
		writeError(writer, http.StatusBadRequest, "invalid_coordinates", "Der Längengrad ist ungültig.")
		return
	}
	view := request.URL.Query().Get("view")
	if view == "" {
		view = "16"
	}
	if view != "16" && view != "30" {
		writeError(writer, http.StatusBadRequest, "invalid_view", "Erlaubt sind 16 oder 30 Tage.")
		return
	}
	ctx, cancel := context.WithTimeout(request.Context(), 30*time.Second)
	defer cancel()
	result, err := api.outlook.Get(ctx, weather.Coordinates{Latitude: latitude, Longitude: longitude}, view)
	if err != nil {
		log.Printf("outlook request failed: %v", err)
		writeError(writer, http.StatusBadGateway, "outlook_unavailable", "Die Langfristmodelle sind momentan nicht erreichbar.")
		return
	}
	writeJSON(writer, http.StatusOK, result)
}

func (api *API) locations(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		methodNotAllowed(writer)
		return
	}
	ctx, cancel := context.WithTimeout(request.Context(), 8*time.Second)
	defer cancel()
	results, err := api.location.Search(ctx, request.URL.Query().Get("q"))
	if err != nil {
		writeError(writer, http.StatusBadRequest, "location_search_failed", "Bitte mindestens zwei Zeichen eingeben.")
		return
	}
	writeJSON(writer, http.StatusOK, map[string]interface{}{"results": results})
}

func (api *API) middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Access-Control-Allow-Origin", "*")
		writer.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		writer.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		writer.Header().Set("X-Content-Type-Options", "nosniff")
		if request.Method == http.MethodOptions {
			writer.WriteHeader(http.StatusNoContent)
			return
		}
		start := time.Now()
		next.ServeHTTP(writer, request)
		log.Printf("%s %s %s", request.Method, request.URL.Path, time.Since(start).Round(time.Millisecond))
	})
}

func numberParam(request *http.Request, key string, fallback float64) (float64, error) {
	raw := request.URL.Query().Get(key)
	if raw == "" {
		return fallback, nil
	}
	return strconv.ParseFloat(raw, 64)
}

func methodNotAllowed(writer http.ResponseWriter) {
	writeError(writer, http.StatusMethodNotAllowed, "method_not_allowed", "Diese Methode wird nicht unterstützt.")
}

func writeError(writer http.ResponseWriter, status int, code, message string) {
	writeJSON(writer, status, map[string]interface{}{
		"error": map[string]string{"code": code, "message": message},
	})
}

func writeJSON(writer http.ResponseWriter, status int, value interface{}) {
	writer.Header().Set("Content-Type", "application/json; charset=utf-8")
	writer.WriteHeader(status)
	if err := json.NewEncoder(writer).Encode(value); err != nil {
		log.Printf("encode response: %v", err)
	}
}
