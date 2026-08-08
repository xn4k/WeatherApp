package openmeteo

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"isobar/internal/weather"
)

func TestQuantile(t *testing.T) {
	values := []float64{10, 20, 30, 40, 50}
	for _, test := range []struct {
		probability float64
		expected    float64
	}{{0, 10}, {.1, 14}, {.5, 30}, {.9, 46}, {1, 50}} {
		if actual := quantile(values, test.probability); actual != test.expected {
			t.Fatalf("quantile(%v) = %v, want %v", test.probability, actual, test.expected)
		}
	}
}

func TestDecodeMembers(t *testing.T) {
	daily := map[string]json.RawMessage{
		"temperature_2m_mean":          json.RawMessage(`[20]`),
		"temperature_2m_mean_member01": json.RawMessage(`[18]`),
		"temperature_2m_mean_member02": json.RawMessage(`[22]`),
	}
	series, err := decodeMembers(daily, "temperature_2m_mean")
	if err != nil {
		t.Fatal(err)
	}
	if len(series) != 3 || len(memberValuesAt(series, 0)) != 3 {
		t.Fatalf("unexpected member data: %#v", series)
	}
}

func TestFetchEnsembleKeepsRawMembersForBusinessLogic(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		query := request.URL.Query()
		if query.Get("models") != "test_model" ||
			query.Get("forecast_days") != "2" ||
			query.Get("temporal_resolution") != "native" {
			http.Error(writer, "unexpected query: "+request.URL.RawQuery, http.StatusBadRequest)
			return
		}
		writer.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(writer).Encode(map[string]interface{}{
			"daily": map[string]interface{}{
				"time":                         []string{"2026-08-08"},
				"temperature_2m_mean":          []float64{10},
				"temperature_2m_mean_member01": []float64{12},
				"precipitation_sum":            []float64{0},
				"precipitation_sum_member01":   []float64{2},
			},
		})
	}))
	defer server.Close()

	client := &Client{httpClient: server.Client()}
	model, err := client.fetchEnsemble(context.Background(), weather.Coordinates{Latitude: 50, Longitude: 7}, ensembleDefinition{
		endpoint: server.URL, model: "test_model", id: "test", name: "Test Ensemble",
		short: "TEST", forecastDays: 2, excludeFromFusion: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if model.MemberCount != 2 || len(model.Daily) != 1 {
		t.Fatalf("unexpected normalized model: %#v", model)
	}
	if !model.ExcludeFromFusion {
		t.Fatal("excludeFromFusion was not propagated")
	}
	day := model.Daily[0]
	if len(day.TemperatureMembers) != 2 || len(day.PrecipitationMembers) != 2 {
		t.Fatalf("raw members were not retained: %#v", day)
	}
}

func TestEnsembleDefinitionsCoverFusionSourcesAndEC46(t *testing.T) {
	expected := map[string]int{
		"dwd_icon_eu_eps":              5,
		"ecmwf_ifs025_ensemble":        15,
		"ecmwf_aifs025_ensemble":       15,
		"ncep_gefs05":                  30,
		"google_weathernext2_ensemble": 15,
		"ecmwf_ec46":                   30,
	}
	if len(ensembleDefinitions) != len(expected) {
		t.Fatalf("definition count = %d, want %d", len(ensembleDefinitions), len(expected))
	}
	for _, definition := range ensembleDefinitions {
		forecastDays, ok := expected[definition.model]
		if !ok {
			t.Fatalf("unexpected model identifier %q", definition.model)
		}
		if definition.forecastDays != forecastDays {
			t.Fatalf("%s forecast days = %d, want %d", definition.model, definition.forecastDays, forecastDays)
		}
		if definition.excludeFromFusion != (definition.model == "ecmwf_ec46") {
			t.Fatalf("%s excludeFromFusion = %v", definition.model, definition.excludeFromFusion)
		}
	}
}
