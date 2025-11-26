## How to create a entra-credentials secret

You can find the credentials in the following vaults with name (Medsum Entra ID - [env]):

* k8s-medsum-dev
* k8s-medsum-prod

```yaml
apiVersion: v1
kind: Secret
type: Opaque
metadata:
  name: entra-credentials
  namespace: medsum-admin
stringData:
  id: ""
  secret: ""
  tenant: ""
```
