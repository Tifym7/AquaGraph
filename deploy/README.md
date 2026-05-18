# AquaGraph — Cloud Deploy Guide

This sets up **continuous deployment** of AquaGraph to a single small Azure
VM, with the site served at **https://aquagraph.org** via Cloudflare.

```
 push to `deploy` branch
        │
        ▼
 GitHub Actions ──build──▶ GHCR (private image ghcr.io/tifym7/aquagraph)
        │
        └──ssh──▶ Azure VM ── docker compose ─┬─ app         (gunicorn, Flask API + built React)
                                              ├─ db          (postgres:16, private volume)
                                              └─ cloudflared (outbound tunnel)
                                                     │ outbound only
 Cloudflare edge ◀───────────────────────────────────┘
        ▲
 visitors ──HTTPS──▶ aquagraph.org ──▶ Cloudflare ──tunnel──▶ app:5000
```

**Why this shape:** the ~420 MB of precomputed tiles are committed to git and
baked into the image, so the app is fully self-contained — one VM, no blob
storage, no managed DB. TLS is handled by Cloudflare so there's no certbot to
maintain. **The VM exposes no public web port at all** — `cloudflared` dials
*out* to Cloudflare, so the origin can't be reached directly by IP; the only
way in is `https://aquagraph.org`. Only SSH (22) is open on the VM.

Do these steps **once**, in order. After that, every push to the `deploy`
branch auto-ships.

---

## 0. Prerequisites

- An SSH keypair for the VM (don't reuse a personal key):
  ```bash
  ssh-keygen -t ed25519 -f ~/.ssh/aquagraph_vm -C aquagraph-deploy -N ''
  ```
  `~/.ssh/aquagraph_vm` (private) goes into a GitHub secret later;
  `~/.ssh/aquagraph_vm.pub` goes on the VM.
- Azure CLI logged in (`az login`) — or use the Azure Portal equivalents.
- Admin on the GitHub repo (to add secrets) and on the Cloudflare zone
  `aquagraph.org`.

---

## 1. Provision the Azure VM

`B1s` = 1 vCPU / 1 GB RAM, the cheapest size that runs this stack (with a
swapfile, added in step 2). Pick a region close to your users.

```bash
RG=aquagraph-rg
LOC=westeurope
VM=aquagraph-vm

az group create -n $RG -l $LOC

az vm create \
  --resource-group $RG \
  --name $VM \
  --image Canonical:0001-com-ubuntu-server-jammy:22_04-lts-gen2:latest \
  --size Standard_B1s \
  --admin-username azureuser \
  --ssh-key-values ~/.ssh/aquagraph_vm.pub \
  --public-ip-sku Standard \
  --os-disk-size-gb 30 \
  --storage-sku StandardSSD_LRS

# Open ONLY SSH (22). No web port is opened — ingress is the Cloudflare
# tunnel (outbound), so the origin has no public HTTP/HTTPS port to hit.
az vm open-port -g $RG -n $VM --port 22 --priority 1000

# The public IP is only used for SSH access now (not for Cloudflare).
az vm show -d -g $RG -n $VM --query publicIps -o tsv
```

> **Cheaper still:** with the tunnel, the site no longer depends on the VM's
> IP at all (Cloudflare reaches it via the outbound tunnel). So you can drop
> `--public-ip-sku Standard` for a dynamic IP (saves ~$3.6/mo) — the only
> cost is having to look up the new IP for your own SSH after a VM
> stop/deallocate. The site stays up regardless.

> **Cost guardrail:** in the Portal, set a **Budget alert** on the
> subscription (Cost Management → Budgets) at e.g. $20/mo so you're warned
> before the credit drains unexpectedly.

---

## 2. One-time VM setup

SSH in:

```bash
ssh -i ~/.ssh/aquagraph_vm azureuser@<VM_PUBLIC_IP>
```

Then on the VM:

```bash
# --- Docker engine + compose plugin ---
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# log out and back in so the group takes effect
exit
```

Reconnect, then:

```bash
# --- 2 GB swap (B1s only has 1 GB RAM; Postgres + gunicorn need headroom) ---
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# --- Clone the repo (compose + db init scripts are read from here) ---
git clone https://github.com/Tifym7/AquaGraph.git ~/AquaGraph
cd ~/AquaGraph
git checkout deploy

# --- Production env file (NOT committed) ---
cp .env.example .env
nano .env   # set DB_PASSWORD and SECRET_KEY to long random strings:
            #   python3 -c "import secrets; print(secrets.token_urlsafe(48))"
            # CF_TUNNEL_TOKEN is filled in step 5 (create it there first).
```

Leave `IMAGE=ghcr.io/tifym7/aquagraph:latest` in `.env` for now; CI overrides
it per-deploy with the exact commit SHA. You'll come back and paste
`CF_TUNNEL_TOKEN` after step 5.

> The repo on the VM stays on the `deploy` branch. CI runs
> `git reset --hard origin/deploy` on every deploy, so **don't make local
> commits in `~/AquaGraph` on the VM** — they'll be discarded.

---

## 3. Create the GHCR pull token

The image is **private**. The VM authenticates with a GitHub Personal Access
Token scoped to read packages.

1. GitHub → **Settings → Developer settings → Personal access tokens →
   Fine-grained tokens → Generate new token**.
2. **Resource owner:** `Tifym7`. **Repository access:** only `AquaGraph`.
3. **Permissions:** Repository permissions → **Contents: Read-only** is *not*
   needed for the pull; the only required one is account/registry read. For a
   fine-grained token, set **Packages: Read**. (If fine-grained packages
   scope is unavailable for the org, fall back to a *classic* token with the
   single `read:packages` scope.)
4. Set an **expiry** (e.g. 90 days) and put a calendar reminder to rotate it.
5. Copy the token — you'll paste it into a GitHub secret (`GHCR_PAT`) next.

> The CI **build/push** side does *not* use this token — it uses the
> built-in `GITHUB_TOKEN`. `GHCR_PAT` is only for the VM's `docker pull`.

---

## 4. Add GitHub repository secrets

Repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
|---|---|
| `VM_HOST` | VM public IP from step 1 |
| `VM_USER` | `azureuser` |
| `VM_SSH_KEY` | **contents** of `~/.ssh/aquagraph_vm` (the private key, full file incl. BEGIN/END lines) |
| `VM_PORT` | `22` (optional; defaults to 22) |
| `GHCR_PAT` | the token from step 3 |
| `VM_GHCR_USER` | the GitHub username that owns `GHCR_PAT` |

That's all the workflow ([`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)) needs.

---

## 5. Create the Cloudflare Tunnel

The tunnel is what makes the site reachable. The `cloudflared` container
opens an **outbound** connection to Cloudflare and forwards traffic to the
`app` container — there is no public web port on the VM, so the origin can't
be hit by IP. (No A records, no origin certificate, no `Full`/`Flexible`
setting — the tunnel replaces all of that.)

1. Go to **Cloudflare dashboard → Zero Trust → Networks → Tunnels →
   Create a tunnel**.
2. Connector type: **Cloudflared**. Name it e.g. `aquagraph`.
3. On the "Install connector" screen, **copy the tunnel token** (the long
   string in the `--token …` command — you only need the token itself, not
   the install commands). Cloudflare keeps the token; you can re-copy it
   later from the tunnel's **Configure** page.
4. Put it in the VM's `.env`:
   ```bash
   cd ~/AquaGraph
   nano .env        # set CF_TUNNEL_TOKEN=<the token>
   ```
5. In the tunnel's **Public Hostnames** tab, add a hostname:
   - **Subdomain:** *(blank)* **Domain:** `aquagraph.org`
   - **Service:** `HTTP`  →  `app:5000`
   - Add a second public hostname for **Subdomain:** `www`, same service, if
     you want `www.aquagraph.org` too.
6. Cloudflare auto-creates the DNS (a proxied `CNAME` to the tunnel) — you
   don't touch the DNS tab manually.

`app:5000` works because `cloudflared` and `app` share the private compose
network; the service name `app` resolves there. HTTPS is terminated at
Cloudflare's edge as before.

> Keep `CF_TUNNEL_TOKEN` secret — anyone with it can run a connector for
> your tunnel. Rotate it from the tunnel's Configure page if leaked.

---

## 6. First deploy

The pipeline runs on push to `deploy`. To kick off the first one:

```bash
# from your local clone, once the cloud-deploy work is merged into `deploy`
git push origin deploy
```

or trigger it manually: repo → **Actions → Build & Deploy → Run workflow**.

Watch the run in the **Actions** tab. The first build is slow (large image
with the baked tiles + cold buildx cache); later builds reuse the GitHub
Actions cache and the changed layers only.

When it's green, open **https://aquagraph.org**.

---

## Operations

All commands run on the VM in `~/AquaGraph` unless noted.

**Logs**
```bash
docker compose -f docker-compose.prod.yml logs -f app
docker compose -f docker-compose.prod.yml logs -f db
```

**Status / restart**
```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml restart app
```

**Redeploy without a code change:** Actions → Build & Deploy → Run workflow.

**Roll back to a previous build:** every CI run pushes
`ghcr.io/tifym7/aquagraph:<git-sha>`. On the VM:
```bash
# pick a known-good commit SHA from GitHub
echo 'IMAGE=ghcr.io/tifym7/aquagraph:<good-sha>' >> .env   # or edit the line
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```
(The next pipeline run will reset `.env`'s `IMAGE`? No — CI exports `IMAGE`
inline for its own `up`, it does not rewrite `.env`. To make a rollback
stick, also revert the code on the `deploy` branch.)

**Postgres backup** (data lives in the `aquagraph-pgdata` Docker volume,
which survives redeploys but **not** `down -v`):
```bash
docker compose -f docker-compose.prod.yml exec -T db \
  pg_dump -U "$(grep DB_USER .env | cut -d= -f2)" aquagraph \
  > ~/aquagraph-backup-$(date +%F).sql
```
Consider a weekly cron of the above + copy off-box.

**Reset the database from `backend/db.sql`** (destroys all data):
```bash
docker compose -f docker-compose.prod.yml down -v
docker compose -f docker-compose.prod.yml up -d
```

---

## Cost & longevity notes

| Item | ~Monthly |
|---|---|
| VM `Standard_B1s` | ~$7.6 |
| 30 GB StandardSSD disk | ~$2.4 |
| Static public IP | ~$3.6 (skip for dynamic → ~$0) |
| Egress | ≈ $0 (Cloudflare caches the static tiles) |
| **Total** | **~$11–15** → ~20 months on $300 |

If the app gets OOM-killed under load on `B1s` (check
`docker compose ... logs app` for worker restarts / `dmesg` for OOM), resize:
```bash
az vm deallocate -g aquagraph-rg -n aquagraph-vm
az vm resize -g aquagraph-rg -n aquagraph-vm --size Standard_B1ms   # 2 GB, ~$15/mo
az vm start -g aquagraph-rg -n aquagraph-vm
```
and bump `GUNICORN_WORKERS=2` in `.env`.

---

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Actions deploy step fails at `docker login` | `GHCR_PAT` expired or `VM_GHCR_USER` wrong / token lacks `read:packages` |
| `denied` / `manifest unknown` on `docker compose pull` | Image is private and the VM isn't logged in — re-run step 3/4; `docker login ghcr.io` manually to test |
| Site shows Cloudflare "tunnel is down" / 1033 | `cloudflared` container not running or `CF_TUNNEL_TOKEN` wrong — `docker compose -f docker-compose.prod.yml logs -f cloudflared`; re-copy the token from the tunnel's Configure page |
| Tunnel connected but 502/error reaching app | Public Hostname service must be `http://app:5000` (not `localhost`); check `logs app` is up |
| Site loads but API 5xx | check `logs app`; usually DB env (`DB_USER`/`DB_PASSWORD` in `.env`) mismatched between `db` and `app` |
| Can't SSH after VM restart (dynamic IP) | look up the new IP: `az vm show -d -g aquagraph-rg -n aquagraph-vm --query publicIps -o tsv` (site is unaffected — it's on the tunnel) |
| `502` right after deploy | gunicorn still booting / waiting on Postgres healthcheck — give it ~30 s |
| Out of disk on the VM | `docker image prune -af` (CI prunes dangling images each deploy, but old tagged SHAs accumulate) |
