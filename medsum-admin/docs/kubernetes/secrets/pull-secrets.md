## How to create a image pull secret

For a more detailed documentation [Carasent Confluence](https://evimeria.atlassian.net/wiki/spaces/WT/pages/200507445/How+to+create+harbor+robot+accounts)

Prerequisites:

* Create robot account in harbor
  * harbor.dev.carasent-ck8s.com
  * harbor.prod.carasent-ck8s.com

Run the following command:  

```bash
kubectl create secret docker-registry harbor-read --docker-username=$HARBOR_USER --docker-password=$HARBOR_PASSWORD --docker-server=$HARBOR_URL -n medsum-admin
```
