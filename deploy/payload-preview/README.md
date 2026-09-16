# Private Payload development preview

This is a disposable development preview, not a production deployment. The production/Vercel guard remains enabled. The existing public site, its Notion sources, and its credentials are not deployment targets.

Use an isolated source copy at `/opt/mstefan-payload-preview`. Exclude local environment files, SQLite databases, uploaded media, dependencies, and build output during transfer. Install nothing into an existing production site directory. The repository root is the Docker build context.

Provision `deploy/payload-preview/.env` as a mode-0600 file containing only `PAYLOAD_SECRET`, obtained through the agreed 1Password credential workflow. Never commit it or print rendered Compose configuration containing it. The Compose environment explicitly clears existing Notion/GitHub integration variables; Projects and Stack show their unconfigured state. Do not copy a production environment file.

After verifying the service registry and host listener allocation:

```sh
docker compose -f deploy/payload-preview/compose.yaml up -d --build
```

The app runs as the image's unprivileged `node` user. Its container port 3000 is published only on the VPS loopback address, port 3101. Access it with an SSH tunnel whose local port has also been checked against the registry/listeners. Do not add DNS, a public proxy, firewall exposure, or an open bind address.

Open `/admin` through that tunnel and register the first administrator before sharing access. Payload also exposes its native `/api/users/first-register` bootstrap endpoint; it is intended only while no user exists. Use a protected credential transfer for scripted bootstrap, then prove a second unauthenticated registration is rejected. Other user operations require authentication.

The dedicated named volume `mstefan-payload-preview-data` stores SQLite and uploaded media under `/data`; the image initializes that mount point with the runtime user's ownership. Recreating the container preserves this volume. A fresh volume seeds English/Italian Home/About copy and does not import the original prototype's users, edits, or uploads. Uploaded images and published pages are readable to anyone who can reach this private service; drafts and admin operations require CMS login.

Before considering the preview verified, test login, bilingual rendering, authenticated draft preview, denied unauthenticated draft access, publish behavior, image upload, and persistence after container recreation. Confirm no public listener was introduced. Development compilation can make the first request slow.

Pause with:

```sh
docker compose -f deploy/payload-preview/compose.yaml stop
```

Resume with `start`. For a source update, rebuild with `up -d --build`. The restart policy retries crashes three times and does not deliberately enable an always-on operator across host restarts. Inspect service status and bounded logs for failures. Do not run `down --volumes`, delete the data volume, or copy the live SQLite file without a separately agreed backup/recovery step.
