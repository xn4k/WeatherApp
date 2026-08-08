package weather

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
)

func TestWeightedQuantileUsesEmpiricalWeights(t *testing.T) {
	values := []weightedValue{
		{value: 20, weight: .25},
		{value: 10, weight: .75},
		{value: 999, weight: 0},
	}
	for _, test := range []struct {
		probability float64
		expected    float64
	}{
		{probability: -1, expected: 10},
		{probability: .75, expected: 10},
		{probability: .751, expected: 20},
		{probability: 2, expected: 20},
	} {
		if actual := weightedQuantile(values, test.probability); actual != test.expected {
			t.Fatalf("weightedQuantile(%v) = %v, want %v", test.probability, actual, test.expected)
		}
	}
}

func TestFuseEnsemblesBalancesModelsRatherThanMembers(t *testing.T) {
	manyTemperatures := repeated(100, 0)
	manyPrecipitation := repeated(100, 0)
	models := []EnsembleModel{
		{
			ID: "many-members",
			Daily: []EnsembleDay{
				{Date: "2026-08-08", TemperatureMembers: manyTemperatures, PrecipitationMembers: manyPrecipitation},
				{Date: "2026-08-09", TemperatureMembers: []float64{10}, PrecipitationMembers: []float64{2}},
			},
		},
		{
			ID: "one-member",
			Daily: []EnsembleDay{
				{Date: "2026-08-08", TemperatureMembers: []float64{100}, PrecipitationMembers: []float64{20}},
			},
		},
		{
			ID:                "ec46",
			ExcludeFromFusion: true,
			Daily: []EnsembleDay{
				{Date: "2026-08-08", TemperatureMembers: []float64{-999}, PrecipitationMembers: []float64{999}},
			},
		},
	}

	fusion := fuseEnsembles(models)
	if fusion == nil {
		t.Fatal("fuseEnsembles() returned nil")
	}
	if fusion.Method != "equal-model-weighted-empirical" {
		t.Fatalf("method = %q", fusion.Method)
	}
	if !strings.Contains(fusion.Notice, "ohne historische Kalibrierung") {
		t.Fatalf("notice does not identify raw fusion: %q", fusion.Notice)
	}
	if len(fusion.Daily) != 2 {
		t.Fatalf("daily count = %d, want 2", len(fusion.Daily))
	}

	first := fusion.Daily[0]
	if first.Date != "2026-08-08" || first.ModelCount != 2 || first.MemberCount != 101 {
		t.Fatalf("first day availability = %#v", first)
	}
	if first.TemperatureP75 != 100 {
		t.Fatalf("temperature P75 = %v, want 100; a member-pooled result would be 0", first.TemperatureP75)
	}
	if first.RainProbability1mm != 50 || first.RainProbability10mm != 50 {
		t.Fatalf("rain probabilities = %v/%v, want 50/50", first.RainProbability1mm, first.RainProbability10mm)
	}

	second := fusion.Daily[1]
	if second.Date != "2026-08-09" || second.ModelCount != 1 || second.MemberCount != 1 {
		t.Fatalf("second day availability = %#v", second)
	}
}

func TestRawMembersAreNotSerialized(t *testing.T) {
	payload, err := json.Marshal(Outlook{
		Ensembles: []EnsembleModel{{
			ID: "test",
			Daily: []EnsembleDay{{
				Date: "2026-08-08", TemperatureMembers: []float64{1, 2}, PrecipitationMembers: []float64{3, 4},
			}},
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	serialized := string(payload)
	if strings.Contains(serialized, "Members") || strings.Contains(serialized, "members") {
		t.Fatalf("raw members leaked into JSON: %s", serialized)
	}
	if strings.Contains(serialized, "\"fusion\"") {
		t.Fatalf("nil fusion should be omitted: %s", serialized)
	}
}

func repeated(count int, value float64) []float64 {
	values := make([]float64, count)
	for index := range values {
		values[index] = value
	}
	return values
}

type fusionProviderStub struct {
	models []EnsembleModel
}

func (stub fusionProviderStub) ModelOutlook(context.Context, Coordinates) ([]OutlookModel, []string, error) {
	return nil, nil, nil
}

func (stub fusionProviderStub) EnsembleOutlook(context.Context, Coordinates) ([]EnsembleModel, []string, error) {
	return stub.models, nil, nil
}

func TestOutlookServiceAddsFusionContractToThirtyDayView(t *testing.T) {
	service := NewOutlookService(fusionProviderStub{models: []EnsembleModel{{
		ID: "gefs",
		Daily: []EnsembleDay{{
			Date: "2026-08-08", TemperatureMembers: []float64{10, 12}, PrecipitationMembers: []float64{0, 4},
		}},
	}}})
	result, err := service.Get(context.Background(), Coordinates{Latitude: 50, Longitude: 7}, "30")
	if err != nil {
		t.Fatal(err)
	}
	if result.Fusion == nil || result.Fusion.Method != "equal-model-weighted-empirical" || len(result.Fusion.Daily) != 1 {
		t.Fatalf("fusion contract missing from outlook: %#v", result.Fusion)
	}
	payload, err := json.Marshal(result)
	if err != nil {
		t.Fatal(err)
	}
	for _, field := range []string{
		"\"method\":\"equal-model-weighted-empirical\"",
		"\"temperatureP25\"",
		"\"rainProbability10mm\"",
		"\"modelCount\"",
		"\"memberCount\"",
	} {
		if !strings.Contains(string(payload), field) {
			t.Fatalf("fusion JSON missing %s: %s", field, payload)
		}
	}
}
