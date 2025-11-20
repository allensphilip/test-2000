package handlers

import (
    "context"
    "database/sql"
    "net/http"
    "transcript-analysis-api/utils"
    
    "github.com/gin-gonic/gin"
    "go.uber.org/zap"
)

type CorrectionExplanationInput struct {
    Explanation        string  `json:"explanation" binding:"required"`
    ExplanationVersion int     `json:"explanationVersion"`
}

type WordCorrectionInput struct {
    Before     string   `json:"before" binding:"required"`
    After      string   `json:"after" binding:"required"`
    Position   *int     `json:"position"`
    Confidence *float64 `json:"confidence"`
}

type SentenceMovementInput struct {
    OriginalLocation string `json:"originalLocation" binding:"required"`
    NewLocation      string `json:"newLocation" binding:"required"`
    Transformation   string `json:"transformation" binding:"required"`
}

type CorrectionEventRequest struct {
    JobId        string                   `json:"jobId" binding:"required"`
    ModelId      string                   `json:"modelId" binding:"required"`
    PromptId     string                   `json:"promptId" binding:"required"`
    Source       string                   `json:"source"`
    Version      int                      `json:"version"`
    Explanations []CorrectionExplanationInput `json:"explanations"`
    Words        []WordCorrectionInput    `json:"words"`
    Sentences    []SentenceMovementInput  `json:"sentences"`
}

func IngestCorrectionEvent(ctx context.Context, logger *zap.Logger, req CorrectionEventRequest) (int, error) {
    tx, err := utils.DB.BeginTx(ctx, nil)
    if err != nil {
        return 0, err
    }
    res, err := tx.ExecContext(ctx, `
        INSERT INTO correction_events (job_id, model_id, prompt_id, source, version)
        VALUES ($1, $2, $3, $4, COALESCE($5, 1))
        ON CONFLICT (prompt_id) DO NOTHING
    `, req.JobId, req.ModelId, req.PromptId, req.Source, req.Version)
    if err != nil {
        utils.CorrectionsFailures.Add(1)
        tx.Rollback()
        return 0, err
    }
    if rows, _ := res.RowsAffected(); rows == 0 {
        utils.CorrectionsDedupEvents.Add(1)
    } else {
        utils.CorrectionsIngestTotal.Add(1)
    }
    var eventID int
    if err := tx.QueryRowContext(ctx, `SELECT id FROM correction_events WHERE prompt_id=$1`, req.PromptId).Scan(&eventID); err != nil {
        tx.Rollback()
        return 0, err
    }
    for _, e := range req.Explanations {
        _, err = tx.ExecContext(ctx, `
            INSERT INTO correction_explanations (event_id, explanation, explanation_version)
            VALUES ($1, $2, COALESCE($3, 1))
        `, eventID, e.Explanation, e.ExplanationVersion)
        if err != nil {
            tx.Rollback()
            return 0, err
        }
    }
    for _, w := range req.Words {
        rw, err := tx.ExecContext(ctx, `
            INSERT INTO word_corrections (event_id, before, after, position, confidence)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (event_id, before, after) DO NOTHING
        `, eventID, w.Before, w.After, w.Position, w.Confidence)
        if err != nil {
            utils.CorrectionsFailures.Add(1)
            tx.Rollback()
            return 0, err
        }
        if r, _ := rw.RowsAffected(); r == 0 {
            utils.CorrectionsDedupWords.Add(1)
        }
    }
    for _, s := range req.Sentences {
        _, err := tx.ExecContext(ctx, `
            INSERT INTO sentence_movements (event_id, original_location, new_location, transformation)
            VALUES ($1, $2, $3, $4)
        `, eventID, s.OriginalLocation, s.NewLocation, s.Transformation)
        if err != nil {
            utils.CorrectionsFailures.Add(1)
            tx.Rollback()
            return 0, err
        }
    }
    if err := tx.Commit(); err != nil {
        return 0, err
    }
    return eventID, nil
}

func HandleCreateCorrectionEvent(logger *zap.Logger) gin.HandlerFunc {
    return func(c *gin.Context) {
        var req CorrectionEventRequest
        if err := c.ShouldBindJSON(&req); err != nil {
            c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
            return
        }
        eventID, err := IngestCorrectionEvent(c.Request.Context(), logger, req)
        if err != nil {
            c.JSON(http.StatusInternalServerError, gin.H{"error": "server error"})
            return
        }
        c.JSON(http.StatusOK, gin.H{"eventId": eventID})
    }
}

func HandleGetCorrectionEvent(logger *zap.Logger) gin.HandlerFunc {
    return func(c *gin.Context) {
        promptId := c.Param("promptId")
        if promptId == "" {
            c.JSON(http.StatusBadRequest, gin.H{"error": "promptId is required"})
            return
        }

        var event struct {
            ID        int
            JobId     string
            ModelId   string
            PromptId  string
            Occurred  string
            Source    sql.NullString
            Version   int
        }

        err := utils.DB.QueryRow(`
            SELECT id, job_id, model_id, prompt_id, occurred_at, source, version
            FROM correction_events
            WHERE prompt_id = $1
        `, promptId).Scan(&event.ID, &event.JobId, &event.ModelId, &event.PromptId, &event.Occurred, &event.Source, &event.Version)
        if err != nil {
            if err == sql.ErrNoRows {
                c.JSON(http.StatusNotFound, gin.H{"error": "event not found"})
                return
            }
            c.JSON(http.StatusInternalServerError, gin.H{"error": "server error"})
            return
        }

        exRows, err := utils.DB.Query(`
            SELECT explanation, explanation_version, created_at
            FROM correction_explanations
            WHERE event_id = $1
            ORDER BY created_at ASC
        `, event.ID)
        if err != nil {
            c.JSON(http.StatusInternalServerError, gin.H{"error": "server error"})
            return
        }
        defer exRows.Close()
        explanations := make([]gin.H, 0)
        for exRows.Next() {
            var explanation string
            var ver int
            var created string
            if err := exRows.Scan(&explanation, &ver, &created); err == nil {
                explanations = append(explanations, gin.H{"explanation": explanation, "version": ver, "created_at": created})
            }
        }

        wRows, err := utils.DB.Query(`
            SELECT before, after, position, confidence, created_at
            FROM word_corrections
            WHERE event_id = $1
            ORDER BY created_at ASC
        `, event.ID)
        if err != nil {
            c.JSON(http.StatusInternalServerError, gin.H{"error": "server error"})
            return
        }
        defer wRows.Close()
        words := make([]gin.H, 0)
        for wRows.Next() {
            var before, after string
            var position sql.NullInt64
            var confidence sql.NullFloat64
            var created string
            if err := wRows.Scan(&before, &after, &position, &confidence, &created); err == nil {
                var pos interface{} = nil
                var conf interface{} = nil
                if position.Valid {
                    pos = position.Int64
                }
                if confidence.Valid {
                    conf = confidence.Float64
                }
                words = append(words, gin.H{"before": before, "after": after, "position": pos, "confidence": conf, "created_at": created})
            }
        }

        sRows, err := utils.DB.Query(`
            SELECT original_location, new_location, transformation, created_at
            FROM sentence_movements
            WHERE event_id = $1
            ORDER BY created_at ASC
        `, event.ID)
        if err != nil {
            c.JSON(http.StatusInternalServerError, gin.H{"error": "server error"})
            return
        }
        defer sRows.Close()
        sentences := make([]gin.H, 0)
        for sRows.Next() {
            var orig, newloc, trans, created string
            if err := sRows.Scan(&orig, &newloc, &trans, &created); err == nil {
                sentences = append(sentences, gin.H{"originalLocation": orig, "newLocation": newloc, "transformation": trans, "created_at": created})
            }
        }

        c.JSON(http.StatusOK, gin.H{
            "event": gin.H{
                "id": event.ID,
                "jobId": event.JobId,
                "modelId": event.ModelId,
                "promptId": event.PromptId,
                "occurred_at": event.Occurred,
                "source": event.Source.String,
                "version": event.Version,
            },
            "explanations": explanations,
            "words": words,
            "sentences": sentences,
        })
    }
}

func HandleListCorrectionEvents(logger *zap.Logger) gin.HandlerFunc {
    return func(c *gin.Context) {
        jobId := c.Query("jobId")
        modelId := c.Query("modelId")
        query := `SELECT id, job_id, model_id, prompt_id, occurred_at FROM correction_events`
        args := []interface{}{}
        if jobId != "" && modelId != "" {
            query += ` WHERE job_id=$1 AND model_id=$2`
            args = append(args, jobId, modelId)
        } else if jobId != "" {
            query += ` WHERE job_id=$1`
            args = append(args, jobId)
        } else if modelId != "" {
            query += ` WHERE model_id=$1`
            args = append(args, modelId)
        }
        query += ` ORDER BY occurred_at DESC LIMIT 200`
        rows, err := utils.DB.Query(query, args...)
        if err != nil {
            c.JSON(http.StatusInternalServerError, gin.H{"error": "server error"})
            return
        }
        defer rows.Close()
        out := make([]gin.H, 0)
        for rows.Next() {
            var id int
            var j, m, p, t string
            if err := rows.Scan(&id, &j, &m, &p, &t); err == nil {
                out = append(out, gin.H{"id": id, "jobId": j, "modelId": m, "promptId": p, "occurred_at": t})
            }
        }
        c.JSON(http.StatusOK, out)
    }
}