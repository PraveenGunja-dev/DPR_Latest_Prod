# Deployment — Email Login Authentication & Activity Tracking

Artifacts built by `.\build-deploy-zips.ps1` from the repository root:

| Artifact | Target App Service | Contents |
|---|---|---|
| `deploy/backend.zip` | `az10lappdprp02` | FastAPI app (`app/`, `run.py`, `requirements.txt`) |
| `deploy/frontend.zip` | `az10lappdprp01` | Built SPA + `server.js` / `package.json` / `web.config` |

`.env`, `tests/`, `venv/`, `scratch/` and `__pycache__` are excluded from the backend
artifact. Production configuration comes from Azure App Settings only.

---

## READ THIS FIRST — two things will surprise you

**1. All 22 email-login users must set a new password at their next sign-in.**
This was a deliberate decision, not a side effect. On first startup the migration
sets `must_change_password = true` for every `authentication_type = 'EMAIL'`
account. They sign in with their current password and are routed straight to
*Create New Password*. The 67 SSO users are untouched.

**2. OTP is required on every email login, so SMTP becomes a hard dependency.**
If `smtp.adani.com` is unreachable at cut-over, no email user can complete a
login. Verify mail flow *before* deploying (see the pre-flight check below), and
keep the escape hatch in this document to hand.

The `External` service account (`user_id 18`, used by `/api/external/token`) is
also flagged for a password change. It cannot receive an OTP, so it keeps
password-only authentication — but it **is** subject to the 30-day expiry, which
means its credential needs rotating on schedule. Set
`EXTERNAL_ACCOUNT_PASSWORD_EXEMPT=true` if you would rather it never expired.

---

## 1. Pre-flight

- [ ] Take a database backup. The migration adds columns and backfills every
      row in `users`; it is additive and re-runnable, but a restore point costs
      nothing.
- [ ] Confirm at least one **SSO Super Admin** can sign in. There are 3, and
      they are your way back in if email login has any trouble.
- [ ] Confirm the API host can reach SMTP:
      ```bash
      # from the backend App Service SSH console
      python -c "import socket; socket.create_connection(('smtp.adani.com', 25), 5); print('SMTP reachable')"
      ```
      If this fails, deploy with `LOGIN_REQUIRE_OTP=false` (see §5) until it is fixed.

---

## 2. App Settings (backend — `az10lappdprp02`)

Everything below has a working default in code; set them explicitly so the
policy is visible in the portal rather than implied.

```
PASSWORD_MIN_LENGTH=9
PASSWORD_EXPIRY_DAYS=30
PASSWORD_HISTORY_COUNT=5
PASSWORD_EXPIRY_WARNING_DAYS=7,3,1

LOGIN_REQUIRE_OTP=true
PASSWORD_SETUP_REQUIRE_OTP=true
EXTERNAL_ACCOUNT_PASSWORD_EXEMPT=false

OTP_LENGTH=6
OTP_EXPIRY_MINUTES=5
OTP_MAX_ATTEMPTS=3
OTP_RESEND_COOLDOWN_SECONDS=60
OTP_MAX_SENDS_PER_HOUR=10

LOGIN_MAX_FAILED_ATTEMPTS=5
LOGIN_LOCKOUT_MINUTES=15
AUTH_STATUS_CACHE_SECONDS=60
CHALLENGE_TOKEN_EXPIRE_MINUTES=15

SESSION_ONLINE_WINDOW_MINUTES=5
SESSION_TOUCH_INTERVAL_SECONDS=60
SESSION_IDLE_TIMEOUT_MINUTES=720
```

**Must NOT be set in production:**
```
SMTP_DEV_OUTBOX_ENABLE     # writes live verification codes to disk
SMTP_DEV_OUTBOX
```

**Already required, unchanged** — confirm they are still present:
`SMTP_SERVER`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `EMAIL_FROM`,
`JWT_SECRET`, `REFRESH_TOKEN_SECRET`, `APP_BASE_URL`, `API_BASE_URL`,
`AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, database settings.

Keep `WORKERS=1` if it is already set — the scheduled jobs (expiry warnings,
session sweep, P6 checks) should run in one process. All rate limits and OTP
state live in the database, so they stay correct at any worker count.

---

## 3. Deploy

```bash
az webapp deploy -g <RG> -n az10lappdprp02 --src-path deploy/backend.zip  --type zip
az webapp deploy -g <RG> -n az10lappdprp01 --src-path deploy/frontend.zip --type zip
```

Deploy the **backend first**. The new frontend calls endpoints that only exist
in the new backend; the reverse order leaves the SPA calling routes that 404.

The database migration runs automatically on backend startup. Watch the log for:

```
OK Migrations completed successfully
OK Email auth lifecycle seeded: sso=67 email=22 (forced password change on all EMAIL accounts)
```

The second line appears **once**, on the first startup. It is recorded in
`applied_data_migrations` as `email_auth_lifecycle_v1` and never repeats.

---

## 4. Post-deploy verification

```bash
curl https://az10lappdprp02.azurewebsites.net/health
curl https://az10lappdprp02.azurewebsites.net/api/auth/email/policy
```

Then, in the browser:

- [ ] **SSO login still works** — this is the critical regression check.
      An SSO user should reach their dashboard exactly as before, with no
      password prompt and no OTP.
- [ ] **Email login** — password accepted → 6-digit code arrives → dashboard.
- [ ] **Forced change** — an existing email user is routed to *Create New
      Password*, the strength meter responds as they type, and the button stays
      disabled until the policy is met.
- [ ] **Super Admin → Users** — Auth Type, Status, Password expiry, Last Login
      and Recovery Email columns are populated.
- [ ] **Super Admin → Activity** — *Online Now* lists you; *Login History* shows
      your sign-in; *Audit Log* shows `LOGIN_SUCCESS`.

Quick database check:

```sql
SELECT authentication_type, COUNT(*),
       COUNT(*) FILTER (WHERE must_change_password) AS must_change,
       COUNT(*) FILTER (WHERE password_expires_at IS NOT NULL) AS with_expiry
FROM users GROUP BY 1;
```

Expected immediately after deployment:

| authentication_type | count | must_change | with_expiry |
|---|---|---|---|
| EMAIL | 22 | 22 | 0 |
| SSO | 67 | **0** | **0** |

SSO must read zero in both of the last two columns. If it does not, stop and
investigate before letting users in.

---

## 5. If something goes wrong

**SMTP is down and email users cannot sign in**

Set on the backend App Service and restart — no redeploy needed:
```
LOGIN_REQUIRE_OTP=false
PASSWORD_SETUP_REQUIRE_OTP=false
```
Login and password setup fall back to password-only. The 9-character policy,
30-day expiry, history, lockout, audit and session tracking all keep working;
only the emailed code is skipped. Forgot-password still needs mail. Set both
back to `true` once SMTP is healthy.

**A user is locked out**
Super Admin → Users → row menu → *Unlock account*. Locks are temporary and
clear themselves after `LOGIN_LOCKOUT_MINUTES` (15) anyway.

**A user cannot receive their OTP**
Super Admin → Users → *Reset password* sets a temporary password (never
emailed — hand it over out of band). The user still has to replace it at next
login.

**Full rollback**
Redeploy the previous `backend.zip` and `frontend.zip`. The new columns and the
`user_sessions` / `auth_otps` tables are additive and are simply ignored by the
old code. To also clear the forced password change:
```sql
UPDATE users SET must_change_password = FALSE WHERE authentication_type = 'EMAIL';
DELETE FROM applied_data_migrations WHERE name = 'email_auth_lifecycle_v1';
```
Deleting that row lets the migration run again on a future deployment.

---

## 6. What changes for people

**SSO users — nothing.** Same button, same Microsoft sign-in, same authenticator.
The DPR application never sets, expires or asks for their password.

**Email users:**
- Sign in with email + password, then a 6-digit code from
  `no-reply-ai-agel@adani.com` (valid 5 minutes, 3 attempts).
- On the first sign-in after this release, they create a new password:
  9+ characters with upper, lower, number and symbol, and not one of their last 5.
- Passwords expire every 30 days, with in-app and email warnings at 7, 3 and 1 days.
- New self-service: *Profile → Security* for changing the password and adding a
  verified recovery email, and *Forgot Password?* on the login screen.
- Five wrong passwords locks the account for 15 minutes.

**Administrators** get password status, account status, last login and recovery
email in User Management, per-user security actions and audit timeline, and a
new **Activity** tab showing who is online, login history and a filterable
audit log.
