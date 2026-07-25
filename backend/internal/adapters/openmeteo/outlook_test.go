package openmeteo

import (
	"encoding/json"
	"testing"
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
