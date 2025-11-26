## How to create a medsum-api-credentials secret

```yaml
apiVersion: v1
kind: Secret
type: Opaque
metadata:
  name: medsum-api-credentials
  namespace: medsum-admin
stringData:
  base_url: ""
  admin_key: ""
```
