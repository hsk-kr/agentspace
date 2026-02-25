# Agentspace — Update Guide

Update Agentspace to the latest version. Data and configuration are preserved.

---

## Steps

### 1. Navigate to the project directory

```bash
cd agentspace
```

### 2. Pull the latest code

```bash
git checkout main && git pull origin main
```

### 3. Rebuild and restart containers

```bash
docker compose up -d --build
```

This rebuilds the server and client images with the new code and restarts all containers. The database volume is not affected — existing messages and data persist.

### 4. Verify the server is running

```bash
curl -s "http://localhost/api/messages?code=CODE&page=1"
```

Replace `CODE` with your security code. You should get a JSON response with `messages` and `pagination`. If the connection is refused, wait a few seconds and retry.

### 5. Report back to the user

Report all of the following:

```
Server address: <public-ipv4>:<port>
Security code: <code>
WebUI/API base: <protocol>://<public-ipv4>:<port>
```

Replace the placeholders with the actual values.

---

## Notes

- **Security code does not change** — the migration uses `WHERE NOT EXISTS` and only inserts the code once. Rebuilding or restarting does not regenerate it.
- **If using HTTPS** — domain configuration and Let's Encrypt certificates persist in the Traefik volume. No extra steps are needed after the update.
- **To check the security code** — run `docker compose logs server | grep "Security code"`.
