# JetLLM VPS Deploy (GHCR)

This flow deploys JetLLM from a prebuilt image such as `ghcr.io/<owner>/jetllm:latest`.

## 1) Publish images to GHCR

This repository now includes `.github/workflows/docker-publish.yml`.

It publishes on:

- pushes to `master`
- tags like `v*`
- manual run via `workflow_dispatch`

Published tags include:

- `latest` (default branch)
- `sha-<short-commit>`
- release tags (for example `v1.2.0`)

If packages are private, your VPS must log in to GHCR with a token that has `read:packages`.

## 2) Prepare the VPS

Install Docker Engine + Docker Compose plugin, then clone the repo.

```bash
sudo systemctl enable --now docker
git clone <your-repo-url> /opt/jetllm
cd /opt/jetllm
```

## 3) Configure deploy values

```bash
cp .env.deploy.example .env.deploy
```

Edit `.env.deploy` and set:

- `JETLLM_IMAGE` to your GHCR image (for example `ghcr.io/your-user/jetllm:latest`)
- `JETLLM_PORT` if you do not want host port `3000`

If needed (private package):

```bash
docker login ghcr.io
```

## 4) First deploy

```bash
docker compose -f docker-compose.deploy.yml --env-file .env.deploy pull
docker compose -f docker-compose.deploy.yml --env-file .env.deploy up -d
docker compose -f docker-compose.deploy.yml --env-file .env.deploy ps
```

## 5) Enable auto deploy (recommended)

This repository includes `.github/workflows/vps-auto-deploy.yml`.

It deploys automatically when `Publish Docker Image` succeeds for a push to `master`.
You can also run it manually with `workflow_dispatch`.

### Required GitHub repository secrets

- `VPS_HOST` - server hostname or IP
- `VPS_USER` - SSH username
- `VPS_SSH_KEY` - private key content (no passphrase)

### Optional GitHub repository secrets

- `VPS_PORT` - SSH port (defaults to `22`)
- `VPS_KNOWN_HOSTS` - pinned known-hosts line (recommended)

### Optional GitHub repository variable

- `VPS_APP_PATH` - app path on server (defaults to `/opt/jetllm`)

### Suggested SSH key setup for GitHub Actions

On your local machine:

```bash
ssh-keygen -t ed25519 -C "jetllm-gha-deploy" -f ~/.ssh/jetllm-gha-deploy -N ""
cat ~/.ssh/jetllm-gha-deploy
cat ~/.ssh/jetllm-gha-deploy.pub
```

- Put the private key into `VPS_SSH_KEY`.
- Add the public key to `~/.ssh/authorized_keys` for `VPS_USER` on your VPS.

If you want strict host verification, add `VPS_KNOWN_HOSTS`:

```bash
ssh-keyscan -H <your-vps-host>
```

## 6) Day-to-day flow after this setup

1. Make code changes locally.
2. Push/merge to `master`.
3. GitHub publishes a new `latest` image.
4. Auto-deploy workflow SSHes into the VPS and runs:
   - `docker compose ... pull`
   - `docker compose ... up -d`

```bash
# Manual fallback if needed
cd /opt/jetllm
docker compose -f docker-compose.deploy.yml --env-file .env.deploy pull
docker compose -f docker-compose.deploy.yml --env-file .env.deploy up -d
docker image prune -f
```

## 7) Rollback

Set `JETLLM_IMAGE` in `.env.deploy` to a prior immutable tag (for example `v1.2.0` or `sha-xxxxxxx`) and redeploy:

```bash
docker compose -f docker-compose.deploy.yml --env-file .env.deploy up -d
```

## Notes

- Data persists in Docker volume `jetllm-data` mounted to `/app/data`.
- Container DB path remains `DB_PATH=/app/data/jetllm.db`.
- If host port `3000` is already used, set `JETLLM_PORT` to another value.
- `VPS_USER` should be able to run Docker commands without interactive sudo prompts.
