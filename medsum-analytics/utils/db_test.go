package utils

import (
    "context"
    "os"
    "testing"
    "go.uber.org/zap"
)

func testLogger(t *testing.T) *zap.Logger {
    cfg := zap.NewProductionConfig()
    l, err := cfg.Build()
    if err != nil {
        t.Fatalf("logger: %v", err)
    }
    return l
}

func ensureDB(t *testing.T) {
    l := testLogger(t)
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
    if err := InitDB(l); err != nil {
        t.Skip("db not available")
    }
    if err := CreateSchema(l); err != nil {
        t.Fatalf("schema: %v", err)
    }
}

func TestPromptIDImmutability(t *testing.T) {
    ensureDB(t)
    ctx := context.Background()
    _, err := DB.ExecContext(ctx, `DELETE FROM correction_explanations`)
    if err != nil {
        t.Fatalf("cleanup explanations: %v", err)
    }
    _, err = DB.ExecContext(ctx, `DELETE FROM word_corrections`)
    if err != nil {
        t.Fatalf("cleanup words: %v", err)
    }
    _, err = DB.ExecContext(ctx, `DELETE FROM sentence_movements`)
    if err != nil {
        t.Fatalf("cleanup sentences: %v", err)
    }
    _, err = DB.ExecContext(ctx, `DELETE FROM correction_events`)
    if err != nil {
        t.Fatalf("cleanup events: %v", err)
    }

    _, err = DB.ExecContext(ctx, `INSERT INTO correction_events(job_id, model_id, prompt_id) VALUES($1,$2,$3)`, "job-a", "model-x", "prompt-1")
    if err != nil {
        t.Fatalf("insert: %v", err)
    }
    _, err = DB.ExecContext(ctx, `UPDATE correction_events SET prompt_id=$1 WHERE prompt_id=$2`, "prompt-2", "prompt-1")
    if err == nil {
        t.Fatalf("expected immutability error")
    }
}

func TestWordDuplicatePrevention(t *testing.T) {
    ensureDB(t)
    ctx := context.Background()
    _, _ = DB.ExecContext(ctx, `DELETE FROM word_corrections`)
    _, _ = DB.ExecContext(ctx, `DELETE FROM correction_events`)
    _, err := DB.ExecContext(ctx, `INSERT INTO correction_events(job_id, model_id, prompt_id) VALUES($1,$2,$3)`, "job-b", "model-y", "prompt-dup")
    if err != nil {
        t.Fatalf("insert event: %v", err)
    }
    var eid int
    if err := DB.QueryRowContext(ctx, `SELECT id FROM correction_events WHERE prompt_id=$1`, "prompt-dup").Scan(&eid); err != nil {
        t.Fatalf("select id: %v", err)
    }
    _, err = DB.ExecContext(ctx, `INSERT INTO word_corrections(event_id,before,after) VALUES($1,$2,$3)`, eid, "Kvardirps", "Quardirecps")
    if err != nil {
        t.Fatalf("insert word: %v", err)
    }
    _, err = DB.ExecContext(ctx, `INSERT INTO word_corrections(event_id,before,after) VALUES($1,$2,$3)`, eid, "Kvardirps", "Quardirecps")
    if err == nil {
        t.Fatalf("expected unique violation")
    }
}
