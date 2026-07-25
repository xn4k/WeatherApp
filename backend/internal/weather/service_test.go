package weather

import "testing"

func TestMedian(t *testing.T) {
	if got := median([]float64{27.2, 24.8, 25.9}); got != 25.9 {
		t.Fatalf("median() = %v, want 25.9", got)
	}
	if got := median([]float64{1, 3, 5, 7}); got != 4 {
		t.Fatalf("median() = %v, want 4", got)
	}
}

func TestConsensusAgreement(t *testing.T) {
	got := consensus([]ModelSummary{{TodayMax: 24}, {TodayMax: 25.5}, {TodayMax: 25}})
	if got.Agreement != "hoch" || got.MaxSpread != 1.5 {
		t.Fatalf("consensus() = %#v", got)
	}
}
