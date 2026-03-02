# JetLLM VPS Auto Deploy (GitLab CI)

This setup uses GitLab CI to:
- build/push a Docker image to the GitLab Container Registry
- deploy to your VPS over SSH

Pipeline file: `.gitlab-ci.yml`

## 1) Prerequisites

- Project is hosted on GitLab.
- GitLab Container Registry is enabled for the project.
- VPS has Docker Engine + Docker Compose plugin installed.
- VPS has a clone of this repo at `/opt/jetllm` (or your custom path).

On the VPS (first time):

```bash
sudo systemctl enable --now docker
git clone <your-gitlab-repo-url> /opt/jetllm
cd /opt/jetllm
cp .env.deploy.example .env.deploy
```

Set `JETLLM_PORT` in `.env.deploy` if needed.

## 2) Create deploy SSH key

On your local machine:

```bash
ssh-keygen -t ed25519 -C "jetllm-gitlab-deploy" -f ~/.ssh/jetllm-gitlab-deploy -N ""
cat ~/.ssh/jetllm-gitlab-deploy.pub
cat ~/.ssh/jetllm-gitlab-deploy
```

- Add the public key to `~/.ssh/authorized_keys` for your VPS deploy user.
- Add the private key content as a protected GitLab CI variable (see below).

## 3) Set GitLab CI/CD variables

In GitLab: `Project -> Settings -> CI/CD -> Variables`

Required:
- `VPS_HOST`: VPS hostname/IP
- `VPS_USER`: SSH user on VPS
- `VPS_SSH_PRIVATE_KEY`: private SSH key (multiline)

Optional:
- `VPS_PORT`: SSH port (default `22`)
- `VPS_APP_PATH`: app path on VPS (default `/opt/jetllm`)
- `VPS_KNOWN_HOSTS`: pinned host key line(s) from `ssh-keyscan -H <host>`

Optional for private registry pulls on VPS:
- `VPS_REGISTRY_USER`: GitLab deploy token username (or other read-only registry user)
- `VPS_REGISTRY_PASSWORD`: matching password/token

Recommended flags:
- Mark secrets as `Protected` (`VPS_SSH_PRIVATE_KEY`, `VPS_REGISTRY_PASSWORD`).
- Mark deploy host/user values as `Protected` as well.
- `VPS_SSH_PRIVATE_KEY` may not be maskable in GitLab if value validation fails; protected/unmasked is acceptable if your project access is restricted.

## 4) How the pipeline behaves

On default branch push:
- builds image: `${CI_REGISTRY_IMAGE}:sha-${CI_COMMIT_SHORT_SHA}`
- pushes `latest` as well
- deploy job SSHes to VPS and runs with `JETLLM_IMAGE=${CI_REGISTRY_IMAGE}:latest`:
  - `docker compose ... pull`
  - `docker compose ... up -d`
- deploy job does not run `git pull` on the VPS; it only refreshes containers from the latest image.

On Git tag:
- builds/pushes the sha tag and release tag (`$CI_COMMIT_TAG`)

## 5) Manual deployment

You can run `deploy_vps` manually from `CI/CD -> Pipelines` (default branch only). It redeploys `latest`.
In a non-push pipeline (for example manual/API-triggered pipeline), `deploy_vps` appears as a manual job by design.

## 6) Rollback

On the VPS:

```bash
cd /opt/jetllm
sed -i 's|^JETLLM_IMAGE=.*|JETLLM_IMAGE=registry.gitlab.com/<group>/<project>:sha-<oldsha>|' .env.deploy
docker compose -f docker-compose.deploy.yml --env-file .env.deploy up -d
```

## Notes

- Persistent SQLite data remains in Docker volume `jetllm-data` mounted at `/app/data`.
- If you use Cloudflare + reverse proxy, keep proxy timeout/buffering settings suitable for streaming responses.
- If you change deploy files (`docker-compose.deploy.yml`, `.env.deploy`, scripts), sync those to VPS manually once; the CI deploy job is image-only.

## Troubleshooting

- Error: `Identity verification is required in order to run CI jobs`
  - Complete GitLab identity verification in the web UI, then rerun the pipeline.
- Error during `deploy_vps`: `error from registry: access forbidden`
  - Set `VPS_REGISTRY_USER` and `VPS_REGISTRY_PASSWORD` so the VPS can `docker login` to `registry.gitlab.com` before pull.
- Pipeline has no jobs
  - Check branch/rule conditions and verify pipeline was created on the default branch.
