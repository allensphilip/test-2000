package analyzer

// AnalysisRequest represents a request for analysis
type AnalysisRequest struct {
	Job string `json:"Job"`  // Using the same field name as in the code
	Type  string `json:"type"` // Can be "transcription" or "summary"
}