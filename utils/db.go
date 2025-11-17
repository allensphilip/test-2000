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
