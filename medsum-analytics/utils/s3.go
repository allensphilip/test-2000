package utils

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/url"
	"os"
	"strconv"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"go.uber.org/zap"
)

var S3Client *s3.Client

func InitS3(logger *zap.Logger) error {
	endpoint := os.Getenv("S3_ENDPOINT_URL")
	accessKeyID := MustGetEnv("S3_ACCESS_KEY_ID")
	secretAccessKey := MustGetEnv("S3_SECRET_ACCESS_KEY")
	region := GetEnvOrDefault("S3_REGION", "us-east-1")

	sugar := logger.Sugar()
	sugar.Info("Initializing cloud storage service")

	cfg, err := config.LoadDefaultConfig(context.Background(),
		config.WithRegion(region),
		config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(accessKeyID, secretAccessKey, "")),
	)
	if err != nil {
		return fmt.Errorf("failed to load AWS configuration: %w", err)
	}

	s3Options := []func(*s3.Options){
		func(o *s3.Options) {
			o.UsePathStyle = true
		},
	}

	if endpoint != "" {
		s3Options = append(s3Options, func(o *s3.Options) {
			o.BaseEndpoint = aws.String(endpoint)
		})
		sugar.Info("Using custom storage endpoint configuration")
	} else {
		sugar.Info("Using default cloud storage configuration")
	}

	S3Client = s3.NewFromConfig(cfg, s3Options...)

	buckets, err := S3Client.ListBuckets(context.Background(), &s3.ListBucketsInput{})
	if err == nil {
		sugar.Info("Cloud storage service initialized successfully", "bucket_count", len(buckets.Buckets))
	}
	return err
}

// DownloadS3Object downloads an object from S3 and returns the data
func DownloadS3Object(ctx context.Context, bucket, key string) ([]byte, error) {
	if S3Client == nil {
		return nil, errors.New("s3 client is nil; call InitS3 first")
	}

	maxAttempts := getRetryMaxAttempts()
	retryDelay := getRetryDelaySeconds()
	var lastErr error

	for attempt := 1; attempt <= maxAttempts; attempt++ {
		result, err := S3Client.GetObject(ctx, &s3.GetObjectInput{
			Bucket: aws.String(bucket),
			Key:    aws.String(key),
		})
		if err != nil {
			lastErr = err
			if attempt < maxAttempts {
				time.Sleep(time.Duration(retryDelay) * time.Second)
			}
			continue
		}
		defer result.Body.Close()

		data, err := io.ReadAll(result.Body)
		if err != nil {
			lastErr = err
			if attempt < maxAttempts {
				time.Sleep(time.Duration(retryDelay) * time.Second)
			}
			continue
		}

		return data, nil
	}

	return nil, fmt.Errorf("failed to download object after %d attempts: %w", maxAttempts, lastErr)
}

// getRetryMaxAttempts returns the maximum number of retry attempts from env, default 3
func getRetryMaxAttempts() int {
	maxAttemptsStr := GetEnvOrDefault("S3_RETRY_MAX_ATTEMPTS", "3")
	maxAttempts, err := strconv.Atoi(maxAttemptsStr)
	if err != nil || maxAttempts < 1 {
		return 3
	}
	return maxAttempts
}

// getRetryDelaySeconds returns the retry delay in seconds from env, default 20
func getRetryDelaySeconds() int {
	delayStr := GetEnvOrDefault("S3_RETRY_DELAY_SECONDS", "20")
	delay, err := strconv.Atoi(delayStr)
	if err != nil || delay < 0 {
		return 20
	}
	return delay
}

// ParseS3URI parses "s3://bucket/key" into bucket + key.
func ParseS3URI(u string) (bucket, key string, _ error) {
	parsed, err := url.Parse(u)
	if err != nil {
		return "", "", fmt.Errorf("parse s3 uri: %w", err)
	}
	if parsed.Scheme != "s3" {
		return "", "", fmt.Errorf("not an s3 uri: %s", u)
	}
	return parsed.Host, parsed.Path[1:], nil // trim leading '/'
}

func UploadFile(ctx context.Context, src io.Reader, key string) error {
	if S3Client == nil {
		return errors.New("s3Client is nil; call InitS3 first")
	}
	bucket := MustGetEnv("AWS_BUCKET")
	_, err := S3Client.PutObject(ctx, &s3.PutObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
		Body:   src,
	})
	if err != nil {
		return fmt.Errorf("put object failed: %w", err)
	}
	return nil
}