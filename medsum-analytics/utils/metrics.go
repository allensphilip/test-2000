package utils

import (
	"expvar"
)

var CorrectionsIngestTotal = expvar.NewInt("corrections_ingest_total")
var CorrectionsDedupEvents = expvar.NewInt("corrections_dedup_events")
var CorrectionsDedupWords = expvar.NewInt("corrections_dedup_words")
var CorrectionsFailures = expvar.NewInt("corrections_failures_total")
