package handlers

import (
    "bytes"
    "encoding/json"
    "net/http"
    "net/http/httptest"
    "os"
    "testing"
    "transcript-analysis-api/utils"

    "github.com/gin-gonic/gin"
    "go.uber.org/zap"
)

func tl(t *testing.T) *zap.Logger {
    cfg := zap.NewProductionConfig()
    l, err := cfg.Build()
    if err != nil {
        t.Fatalf("logger: %v", err)
    }
    return l
}

func ensureDBReady(t *testing.T) {
    l := tl(t)
    if os.Getenv("POSTGRES_HOST") == "" {
        _ = os.Setenv("POSTGRES_HOST", "localhost")
    }
    if os.Getenv("POSTGRES_PORT") == "" {
        _ = os.Setenv("POSTGRES_PORT", "5432")
    }
    if os.Getenv("POSTGRES_USER") == "" {
        _ = os.Setenv("POSTGRES_USER", "postgres")
    }
    if os.Getenv("POSTGRES_PASSWORD") == "" {
        _ = os.Setenv("POSTGRES_PASSWORD", "postgres")
    }
    if os.Getenv("POSTGRES_DB") == "" {
        _ = os.Setenv("POSTGRES_DB", "transcript_analysis")
    }
    if err := utils.InitDB(l); err != nil {
        t.Skip("db not available")
    }
    if err := utils.CreateSchema(l); err != nil {
        t.Fatalf("schema: %v", err)
    }
}

func TestCreateAndGetCorrectionEvent(t *testing.T) {
    ensureDBReady(t)
    gin.SetMode(gin.TestMode)
    r := gin.New()
    l := tl(t)
    r.POST("/corrections/events", HandleCreateCorrectionEvent(l))
    r.GET("/corrections/events/:promptId", HandleGetCorrectionEvent(l))

    payload := map[string]interface{}{
        "jobId": "job-123",
        "modelId": "model-abc",
        "promptId": "prompt-evt-1",
        "explanations": []map[string]interface{}{{"explanation": "Fixed spelling"}},
        "words": []map[string]interface{}{{"before": "Kvardirps", "after": "Quardirecps"}},
        "sentences": []map[string]interface{}{{"originalLocation": "section1:sent3", "newLocation": "section2:sent1", "transformation": "moved"}},
    }
    b, _ := json.Marshal(payload)
    w := httptest.NewRecorder()
    req, _ := http.NewRequest("POST", "/corrections/events", bytes.NewReader(b))
    req.Header.Set("Content-Type", "application/json")
    r.ServeHTTP(w, req)
    if w.Code != http.StatusOK {
        t.Fatalf("ingest status: %d", w.Code)
    }

    w2 := httptest.NewRecorder()
    req2, _ := http.NewRequest("GET", "/corrections/events/prompt-evt-1", nil)
    r.ServeHTTP(w2, req2)
    if w2.Code != http.StatusOK {
        t.Fatalf("get status: %d", w2.Code)
    }
}

func TestListFiltered(t *testing.T) {
    ensureDBReady(t)
    gin.SetMode(gin.TestMode)
    r := gin.New()
    l := tl(t)
    r.GET("/corrections/events", HandleListCorrectionEvents(l))

    w := httptest.NewRecorder()
    req, _ := http.NewRequest("GET", "/corrections/events?jobId=job-123&modelId=model-abc", nil)
    r.ServeHTTP(w, req)
    if w.Code != http.StatusOK {
        t.Fatalf("list status: %d", w.Code)
    }
}
