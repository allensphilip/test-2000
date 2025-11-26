## How to create auth-credentials secret

```yaml
apiVersion: v1
kind: Secret
type: Opaque
metadata:
  name: auth-credentials
  namespace: medsum-admin
stringData:
  secret: ""
```
