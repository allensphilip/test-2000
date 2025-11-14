package valkeystore

import (
	"context"
	"fmt"
	"os"
	"strings"
	"transcript-analysis-api/utils"

	"github.com/valkey-io/valkey-go"
	"github.com/valkey-io/valkey-go/valkeycompat"
	"go.uber.org/zap"
)

var Ctx = context.Background()
var Client valkeycompat.Cmdable
var RawClient valkey.Client

func InitValkey(logger *zap.Logger) {
	sugar := logger.Sugar()
	host := utils.MustGetEnv("VALKEY_HOST")
	port := utils.MustGetEnv("VALKEY_PORT")

	useSentinel := os.Getenv("VALKEY_USE_SENTINEL") == "true"

	var vk valkey.Client
	var err error

	if useSentinel {
		sentinelCSV := os.Getenv("VALKEY_SENTINEL_ADDRESS")
		if sentinelCSV == "" {
			panic("VALKEY_USE_SENTINEL is true but VALKEY_SENTINEL_ADDRESS is not set")
		}
		sentinels := utils.SplitCSV(sentinelCSV)
		masterName := os.Getenv("VALKEY_SENTINEL_MASTER_NAME")
		if masterName == "" {
			masterName = "mymaster"
		}

		sugar.Info("Initializing distributed cache service with sentinel configuration")

		vk, err = valkey.NewClient(valkey.ClientOption{
			InitAddress: sentinels,
			Sentinel: valkey.SentinelOption{
				MasterSet: masterName,
			},
		})
	} else {
		sugar.Info("Initializing cache service")

		vk, err = valkey.NewClient(valkey.ClientOption{
			InitAddress: []string{fmt.Sprintf("%s:%s", host, port)},
		})
	}

	if err != nil {
		panic(err)
	}

	RawClient = vk
	Client = valkeycompat.NewAdapter(vk)
	sugar.Info("Cache service initialized successfully")
}