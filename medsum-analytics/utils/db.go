package utils

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	_ "github.com/lib/pq"
	"go.uber.org/zap"
)

var DB *sql.DB

// InitDB initializes the PostgreSQL database connection
func InitDB(logger *zap.Logger) error {
	host := MustGetEnv("POSTGRES_HOST")
	port := GetEnvOrDefault("POSTGRES_PORT", "5432")
	user := MustGetEnv("POSTGRES_USER")
	password := MustGetEnv("POSTGRES_PASSWORD")
	dbname := MustGetEnv("POSTGRES_DB")
	sslmode := GetEnvOrDefault("POSTGRES_SSLMODE", "disable")

	connStr := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
		host, port, user, password, dbname, sslmode)

	var err error
	DB, err = sql.Open("postgres", connStr)
	if err != nil {
		return fmt.Errorf("failed to open database connection: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := DB.PingContext(ctx); err != nil {
		return fmt.Errorf("failed to ping database: %w", err)
	}

	logger.Info("Database connection established successfully")

	return nil
}

// CreateSchema creates the necessary database tables if they don't exist
func CreateSchema(logger *zap.Logger) error {
    if DB == nil {
        return fmt.Errorf("database connection is nil; call InitDB first")
    }

    ctx := context.Background()

    // Create analysis_results table
    _, err := DB.ExecContext(ctx, `
        CREATE TABLE IF NOT EXISTS analysis_results (
            id SERIAL PRIMARY KEY,
            file_name VARCHAR(255) NOT NULL,
            wer DOUBLE PRECISION NOT NULL,
            cer DOUBLE PRECISION NOT NULL,
            bleu DOUBLE PRECISION NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(file_name)
        )
    `)
    if err != nil {
        return fmt.Errorf("failed to create analysis_results table: %w", err)
    }

    // Create summary analysis table
    _, err = DB.ExecContext(ctx, `
        CREATE TABLE IF NOT EXISTS summary_analysis_results (
            id SERIAL PRIMARY KEY,
            file_name VARCHAR(255) NOT NULL,
            wer DOUBLE PRECISION NOT NULL,
            cer DOUBLE PRECISION NOT NULL,
            bleu DOUBLE PRECISION NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(file_name)
        )
    `)
    if err != nil {
        return fmt.Errorf("failed to create summary_analysis_results table: %w", err)
    }

    // Create indexes
    _, err = DB.ExecContext(ctx, `
        CREATE INDEX IF NOT EXISTS idx_analysis_file_name ON analysis_results(file_name);
        CREATE INDEX IF NOT EXISTS idx_analysis_created_at ON analysis_results(created_at);
        CREATE INDEX IF NOT EXISTS idx_summary_file_name ON summary_analysis_results(file_name);
        CREATE INDEX IF NOT EXISTS idx_summary_created_at ON summary_analysis_results(created_at);
    `)
    if err != nil {
        return fmt.Errorf("failed to create indexes: %w", err)
    }

    _, err = DB.ExecContext(ctx, `
        CREATE TABLE IF NOT EXISTS correction_events (
            id SERIAL PRIMARY KEY,
            job_id TEXT NOT NULL,
            model_id TEXT NOT NULL,
            prompt_id TEXT NOT NULL UNIQUE,
            occurred_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            source TEXT,
            version INT DEFAULT 1
        )
    `)
    if err != nil {
        return fmt.Errorf("failed to create correction_events table: %w", err)
    }

    _, err = DB.ExecContext(ctx, `
        CREATE TABLE IF NOT EXISTS correction_explanations (
            id SERIAL PRIMARY KEY,
            event_id INT NOT NULL REFERENCES correction_events(id) ON DELETE CASCADE,
            explanation TEXT NOT NULL,
            explanation_version INT DEFAULT 1,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
    `)
    if err != nil {
        return fmt.Errorf("failed to create correction_explanations table: %w", err)
    }

    _, err = DB.ExecContext(ctx, `
        CREATE TABLE IF NOT EXISTS word_corrections (
            id SERIAL PRIMARY KEY,
            event_id INT NOT NULL REFERENCES correction_events(id) ON DELETE CASCADE,
            before TEXT NOT NULL,
            after TEXT NOT NULL,
            position INT,
            confidence NUMERIC,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(event_id, before, after)
        )
    `)
    if err != nil {
        return fmt.Errorf("failed to create word_corrections table: %w", err)
    }

    _, err = DB.ExecContext(ctx, `
        CREATE TABLE IF NOT EXISTS sentence_movements (
            id SERIAL PRIMARY KEY,
            event_id INT NOT NULL REFERENCES correction_events(id) ON DELETE CASCADE,
            original_location TEXT,
            new_location TEXT,
            transformation TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
    `)
    if err != nil {
        return fmt.Errorf("failed to create sentence_movements table: %w", err)
    }

    _, err = DB.ExecContext(ctx, `
        CREATE INDEX IF NOT EXISTS idx_correction_events_prompt_id ON correction_events(prompt_id);
        CREATE INDEX IF NOT EXISTS idx_correction_events_job_model ON correction_events(job_id, model_id);
        CREATE INDEX IF NOT EXISTS idx_explanations_event ON correction_explanations(event_id);
        CREATE INDEX IF NOT EXISTS idx_words_event ON word_corrections(event_id);
        CREATE INDEX IF NOT EXISTS idx_sentences_event ON sentence_movements(event_id);
    `)
    if err != nil {
        return fmt.Errorf("failed to create correction indexes: %w", err)
    }

    _, err = DB.ExecContext(ctx, `
        CREATE OR REPLACE FUNCTION prevent_prompt_id_update() RETURNS trigger AS $$
        BEGIN
            IF NEW.prompt_id <> OLD.prompt_id THEN
                RAISE EXCEPTION 'prompt_id is immutable';
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    `)
    if err != nil {
        return fmt.Errorf("failed to create immutability function: %w", err)
    }

    _, err = DB.ExecContext(ctx, `
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_prevent_prompt_id_update') THEN
                CREATE TRIGGER trg_prevent_prompt_id_update
                BEFORE UPDATE ON correction_events
                FOR EACH ROW EXECUTE FUNCTION prevent_prompt_id_update();
            END IF;
        END $$;
    `)
    if err != nil {
        return fmt.Errorf("failed to create immutability trigger: %w", err)
    }

    logger.Info("Database schema created successfully")
    return nil
}

// CloseDB closes the database connection
func CloseDB(logger *zap.Logger) error {
	if DB != nil {
		logger.Info("Closing database connection")
		return DB.Close()
	}
	return nil
}
