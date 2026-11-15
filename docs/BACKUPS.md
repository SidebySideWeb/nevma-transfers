# Backups

Weekly encrypted exports of Sanity content and the Postgres `public` schema, uploaded to Cloudflare R2. Workflow: [`.github/workflows/backup.yml`](../.github/workflows/backup.yml). Related: [ARCHITECTURE §9](./ARCHITECTURE.md), [DEPLOY](./DEPLOY.md), restore drill notes in [`packages/db/README.md`](../packages/db/README.md).

## What, when, where, retention

| Item | Detail |
| --- | --- |
| Sanity | Full dataset export (assets + drafts) → `sanity-YYYYMMDD.tar.gz.age` |
| Postgres | `pg_dump --format=custom --no-owner --no-acl --schema=public` → `postgres-YYYYMMDD.dump.age` |
| Supabase Storage | **Unused** in this app — not backed up |
| Supabase Auth users | **Not** in the `public` dump. A restore into a fresh project means re-creating Auth users and re-inserting `public.staff` (admin staff logins) |
| Schedule | Sundays `02:00` UTC (`cron: 0 2 * * 0`) plus manual `workflow_dispatch` |
| Encryption | [`age`](https://age-encryption.org/) to `AGE_RECIPIENT` (public key). Private key stays in the owner’s password manager |
| Destination | Cloudflare R2 via AWS CLI (`BACKUP_S3_ENDPOINT`) |
| Layout | `s3://$BACKUP_S3_BUCKET/$BACKUP_PREFIX/weekly/YYYY-Www/` and, on day-of-month 1–7, also `…/monthly/YYYY-MM/` |
| Prefix | Repository variable `BACKUP_PREFIX` = `transfers` |
| Retention | Newest **8** weekly folders and **12** monthly folders; older folders deleted best-effort (`\|\| true` on delete only, in case of object lock) |

## Secrets and variables

Never put values in the repo. Configure in GitHub → Settings → Secrets and variables → Actions.

| Name | Kind | Meaning |
| --- | --- | --- |
| `SANITY_AUTH_TOKEN` | secret | Sanity token that can export the dataset (Viewer is enough for export) |
| `SANITY_PROJECT_ID` | secret | Sanity project id |
| `SANITY_DATASET` | secret | Dataset name (usually `production`) |
| `DATABASE_URL` | secret | Supabase **session pooler** connection string (IPv4). Do **not** use the direct DB host — GitHub runners are IPv4-only |
| `AGE_RECIPIENT` | secret | `age` public key used to encrypt backups |
| `BACKUP_S3_BUCKET` | secret | R2 bucket name |
| `BACKUP_S3_ENDPOINT` | secret | R2 S3 API endpoint, `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `BACKUP_AWS_ACCESS_KEY_ID` | secret | R2 API token access key id |
| `BACKUP_AWS_SECRET_ACCESS_KEY` | secret | R2 API token secret access key |
| `HEALTHCHECK_URL` | secret | Success ping URL (failure posts to `$HEALTHCHECK_URL/fail`) |
| `BACKUP_PREFIX` | variable | Folder prefix inside the bucket (`transfers`) |

## Run by hand

1. GitHub → **Actions** → **Backups**.
2. **Run workflow** → choose branch (usually `main`) → Run.
3. Open the run log. Confirm Export, Upload (object sizes &gt; 0), and Healthcheck success.
4. In R2, confirm objects under `transfers/weekly/<ISO-week>/`.

## Restore

The **age private key** lives in the owner’s password manager (never in GitHub).

```bash
# Decrypt
age -d -i backup.key -o sanity-YYYYMMDD.tar.gz sanity-YYYYMMDD.tar.gz.age
age -d -i backup.key -o postgres-YYYYMMDD.dump postgres-YYYYMMDD.dump.age

# Postgres → throwaway database URL
pg_restore --no-owner --no-acl -d "<target DATABASE_URL>" postgres-YYYYMMDD.dump

# Sanity → throwaway dataset first (safer than overwriting production)
npx --yes sanity@6.21.0 dataset import sanity-YYYYMMDD.tar.gz <scratch-dataset> \
  --project <SANITY_PROJECT_ID>
```

After a Postgres restore into a **new** Supabase project: create staff Auth users again and insert matching rows into `public.staff` (see [`packages/db/README.md`](../packages/db/README.md) § Staff).

## Restore-test checklist

Use a throwaway Supabase project and a throwaway Sanity dataset. Never restore over production for a drill.

- [ ] Download the latest `.age` files from R2 (`transfers/weekly/…`)
- [ ] Decrypt with the private key from the password manager
- [ ] `pg_restore` into scratch Postgres; compare `count(*)` on `zones`, `vehicle_classes`, `bookings` (or a known DEMO-free production snapshot)
- [ ] Import Sanity archive into a scratch dataset; compare document counts and open a few images
- [ ] Confirm staff cannot sign in to admin until Auth users + `staff` rows are re-created (expected)
- [ ] Drop / delete the scratch project and dataset when finished
- [ ] Record the test date below

**Last restore test:** _not yet run — fill in after the first drill (YYYY-MM-DD)._
