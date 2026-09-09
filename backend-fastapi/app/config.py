# app/config.py
"""
Application configuration using pydantic-settings.
Maps all environment variables from the Express .env file.
"""

import os
import dotenv
from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # ── Database ──────────────────────────────────────────────────
    DATABASE_URL: Optional[str] = None
    DB_HOST: Optional[str] = "127.0.0.1"
    DB_PORT: int = 5432
    DB_NAME: str = "postgres"
    DB_USER: str = "postgres"
    DB_PASSWORD: str = ""

    # Also support PG* env vars (higher priority in Express code)
    PGHOST: Optional[str] = None
    PGPORT: Optional[int] = None
    PGDATABASE: Optional[str] = None
    PGUSER: Optional[str] = None
    PGPASSWORD: Optional[str] = None

    # ── Environment ───────────────────────────────────────────────
    # Drives the production hardening checks in assert_production_ready(). Anything other than
    # development/dev/local/test is treated as a deployed environment.
    #
    # The default is "production" so that a MISSING variable fails safe. It used to default to
    # "development", which made every hardening check inert unless an operator remembered to set
    # this one variable: an App Service that had simply never had it configured would start
    # silently on the built-in JWT signing keys and with the OTP exemption list active, and
    # nothing anywhere would say so. Erring the other way is loud and immediately fixable - a
    # developer who has not set it gets a startup error naming exactly what to do.
    #
    # Local machines set ENVIRONMENT=development in backend-fastapi/.env (see .env.example).
    ENVIRONMENT: str = "production"

    # ── JWT ────────────────────────────────────────────────────────
    # These defaults exist so a fresh clone runs locally. They are rejected at
    # startup outside development - see assert_production_ready() - because a
    # secret committed to the repository can be used to forge a token for any
    # user id and any role.
    JWT_SECRET: str = "adani_flow_secret_key"
    REFRESH_TOKEN_SECRET: str = "adani_flow_refresh_secret_key"
    # The refresh token carries the long session; the frontend refreshes
    # transparently on 401 (see apiClient.ts). This is the window in which a
    # stolen access token remains usable, so it is deliberately short.
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ── API documentation ─────────────────────────────────────────
    # Swagger UI, ReDoc and the OpenAPI schema. Off unless explicitly enabled,
    # so a deployed environment does not publish its endpoint inventory.
    ENABLE_API_DOCS: bool = False

    # ── Security response headers ─────────────────────────────────
    SECURITY_HEADERS_ENABLED: bool = True
    CSP_ENABLED: bool = True
    # Ship a new or tightened policy as report-only for one cycle, read the
    # violations out of the browser console, then switch this back to false.
    CSP_REPORT_ONLY: bool = False
    # Origins the SPA must be allowed to reach, on top of 'self'. Needed when
    # the frontend and the API are separate App Services. Comma separated.
    CSP_EXTRA_ORIGINS: Optional[str] = None
    HSTS_MAX_AGE: int = 31536000

    # ── Query-parameter token fallback ────────────────────────────
    # A token in a URL is written to proxy access logs, browser history and the
    # Referer header. The fallback survives only for the P6 integration routes
    # that cannot set a header; everywhere else the header is required.
    QUERY_TOKEN_ALLOWED_PREFIXES: str = "/api/oracle-p6,/api/p6-token,/api/external"

    # ── Email-login password lifecycle ────────────────────────────
    # Applies ONLY to users with authentication_type = 'EMAIL'.
    # SSO users keep their Entra ID password policy and are never touched
    # by any of the settings below.
    PASSWORD_MIN_LENGTH: int = 12
    PASSWORD_EXPIRY_DAYS: int = 30
    PASSWORD_HISTORY_COUNT: int = 5
    # Days-remaining thresholds at which an expiry warning is raised.
    PASSWORD_EXPIRY_WARNING_DAYS: str = "7,3,1"
    # Both default on. They are the escape hatches if SMTP is unreachable:
    # turning them off degrades to password-only auth rather than locking
    # every email user out of the application.
    LOGIN_REQUIRE_OTP: bool = True
    PASSWORD_SETUP_REQUIRE_OTP: bool = True
    # The 'External' role is a machine account used by /api/external/token.
    # It cannot read an inbox, so it never receives an OTP; this flag also
    # lifts the expiry/forced-change requirement from it when set to true.
    EXTERNAL_ACCOUNT_PASSWORD_EXEMPT: bool = False
    
    # Comma-separated list of test emails that should bypass OTP during login.
    # Deliberately EMPTY by default: a committed list means those addresses skip
    # the second factor in every environment that does not override it, and the
    # addresses are guessable by anyone who can read this file. Populate it from
    # the environment for local development only.
    # An address listed here needs only its password: OTP is skipped for it at login, at login
    # verify, at password setup and at password change (four call sites in routers/auth_email.py).
    # assert_production_ready() refuses to start a deployed environment while this is non-empty.
    TEST_EMAILS_OTP_EXEMPT: str = ""

    @property
    def test_emails_otp_exempt_list(self) -> list[str]:
        """Returns a list of test emails that bypass OTP."""
        return [email.strip().lower() for email in (self.TEST_EMAILS_OTP_EXEMPT or "").split(",") if email.strip()]

    # ── OTP ───────────────────────────────────────────────────────
    OTP_LENGTH: int = 6
    OTP_EXPIRY_MINUTES: int = 5
    OTP_MAX_ATTEMPTS: int = 3
    OTP_RESEND_COOLDOWN_SECONDS: int = 60
    OTP_MAX_SENDS_PER_HOUR: int = 10

    # ── Account protection ────────────────────────────────────────
    LOGIN_MAX_FAILED_ATTEMPTS: int = 5
    LOGIN_LOCKOUT_MINUTES: int = 15
    # How long a user's password/account status is cached before the
    # enforcement dependency re-reads it from the database.
    AUTH_STATUS_CACHE_SECONDS: int = 60

    # ── Session / presence tracking ───────────────────────────────
    # A session counts as "online" while it has been seen inside this window.
    SESSION_ONLINE_WINDOW_MINUTES: int = 5
    # How often a session's last_seen_at is actually written. Every request
    # touching the database would be far more write traffic than presence
    # tracking is worth, so the write is throttled to this interval.
    SESSION_TOUCH_INTERVAL_SECONDS: int = 60
    # Sessions with no activity for this long are closed by the sweeper and
    # reported as timed out rather than sitting "online" forever.
    SESSION_IDLE_TIMEOUT_MINUTES: int = 720
    # Lifetime of the pre-authentication challenge token handed out when a
    # password setup / expiry change is required.
    CHALLENGE_TOKEN_EXPIRE_MINUTES: int = 15

    # ── Oracle P6 ─────────────────────────────────────────────────
    ORACLE_P6_OAUTH_TOKEN: Optional[str] = None
    ORACLE_P6_AUTH_TOKEN: Optional[str] = None
    ORACLE_P6_TOKEN_URL: Optional[str] = None
    ORACLE_P6_BASE_URL: Optional[str] = None
    P6_PASSWORD_LAST_RESET_DATE: Optional[str] = None

    # ── Azure AD SSO ──────────────────────────────────────────────
    AZURE_TENANT_ID: Optional[str] = None
    AZURE_CLIENT_ID: Optional[str] = None
    AZURE_CLIENT_SECRET: Optional[str] = None

    # ── Email / SMTP ──────────────────────────────────────────────
    SMTP_SERVER: Optional[str] = None
    SMTP_PORT: int = 25
    SMTP_USERNAME: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    EMAIL_FROM: Optional[str] = "no-reply-ai-agel@adani.com"
    SUPER_ADMIN_EMAIL: Optional[str] = None
    # DEVELOPMENT ONLY. When set to a directory path, every outgoing email is
    # also written there as an .html file. This exists so the OTP flows can be
    # exercised on a machine that cannot reach smtp.adani.com (an internal host
    # that does not resolve outside the corporate network).
    #
    # Leave EMPTY in production: the files contain live verification codes.
    # The application refuses to use it unless SMTP_DEV_OUTBOX_ENABLE is also
    # true, so a stray path in a config file cannot silently start writing
    # codes to disk.
    SMTP_DEV_OUTBOX: Optional[str] = None
    SMTP_DEV_OUTBOX_ENABLE: bool = False
    # ── Spectra Drone ─────────────────────────────────────────────
    SPECTRA_BASE_URL: str = "https://dpr.spectra-insights.com/api"
    SPECTRA_API_KEY: str = "dpr_live_vbsTqkLunC9Sa_Lwyr-WxlTHhkcF21BDxlmMI3Y0OaY"
    # ── Proxy ─────────────────────────────────────────────────────
    HTTPS_PROXY: Optional[str] = None
    HTTP_PROXY: Optional[str] = None
    NO_PROXY: Optional[str] = None

    # ── App ───────────────────────────────────────────────────────
    # Public URL of the FRONTEND (App Service az10lappdprp01 / custom domain).
    # Used for post-login redirects and links inside e-mails.
    APP_BASE_URL: str = "http://localhost:3316"
    # Public URL of the BACKEND itself (App Service az10lappdprp02).
    # Required in Azure because the frontend and the API live on different hosts:
    # the Azure AD redirect_uri must point at THIS service, not at the frontend.
    # Left empty for local/single-host runs, where the request host is correct.
    API_BASE_URL: Optional[str] = None
    # Extra allowed CORS origins (comma separated) on top of the built-in list.
    CORS_ORIGINS: Optional[str] = None
    SUPER_ADMIN_EMAIL: str = "rohit.sharma6@adani.com,praveen.gunja@adani.com"
    PORT: int = 3121
    FASTAPI_ROOT_PATH: str = ""

    # ── Redis (Caching) ───────────────────────────────────────────
    REDIS_URL: Optional[str] = None

    @property
    def super_admin_emails(self) -> list[str]:
        """Returns a list of Super Admin emails from the comma-separated string."""
        return [email.strip().lower() for email in self.SUPER_ADMIN_EMAIL.split(",") if email.strip()]

    @property
    def password_expiry_warning_days(self) -> list[int]:
        """Days-remaining thresholds that trigger an expiry warning, high to low."""
        days = []
        for part in (self.PASSWORD_EXPIRY_WARNING_DAYS or "").split(","):
            part = part.strip()
            if part.isdigit():
                days.append(int(part))
        return sorted(set(days), reverse=True)

    @property
    def extra_cors_origins(self) -> list[str]:
        """Additional allowed origins supplied through the CORS_ORIGINS env var."""
        if not self.CORS_ORIGINS:
            return []
        return [o.strip().rstrip("/") for o in self.CORS_ORIGINS.split(",") if o.strip()]

    # ── Pool ──────────────────────────────────────────────────────
    # Every PoolWrapper.fetch/execute call acquires-and-releases its own connection (see
    # database.py), so a request that runs many queries in a loop - a heavy save, a P6 sync -
    # only ever holds one connection at a time, but many such requests running concurrently
    # (autosave firing every 2s across open tabs, a background sync) can still exhaust a small
    # pool: 10 was the cap when a stale-fetch race caused a project's "Sync Project" run to
    # overlap with a normal GET /draft, and that GET failed with a connection-acquisition timeout
    # (str(exc) == '' is the signature of asyncio.TimeoutError). Postgres allows up to 100
    # connections here and typically has ~13 in use, so this has ample headroom without
    # approaching that ceiling.
    DB_POOL_MIN_SIZE: int = 5
    DB_POOL_MAX_SIZE: int = 30

    @property
    def effective_db_host(self) -> str:
        return self.PGHOST or self.DB_HOST or "127.0.0.1"

    @property
    def effective_db_port(self) -> int:
        return self.PGPORT or self.DB_PORT or 5432

    @property
    def effective_db_name(self) -> str:
        return self.PGDATABASE or self.DB_NAME or "postgres"

    @property
    def effective_db_user(self) -> str:
        return self.PGUSER or self.DB_USER or "postgres"

    @property
    def effective_db_password(self) -> str:
        return self.PGPASSWORD or self.DB_PASSWORD or ""

    @property
    def is_local_db(self) -> bool:
        host = self.effective_db_host
        return host in ("localhost", "127.0.0.1")

    @property
    def dsn(self) -> str:
        """Build asyncpg DSN string."""
        if self.DATABASE_URL:
            # Convert postgres:// to postgresql:// for asyncpg compatibility
            url = self.DATABASE_URL
            if url.startswith("postgres://"):
                url = url.replace("postgres://", "postgresql://", 1)
            return url
        return (
            f"postgresql://{self.effective_db_user}:{self.effective_db_password}"
            f"@{self.effective_db_host}:{self.effective_db_port}/{self.effective_db_name}"
        )

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"  # Ignore extra env vars


settings = Settings()

# ── Production hardening guard ────────────────────────────────────
# A deployment that is missing its secrets must fail loudly at startup rather
# than come up quietly signing forgeable tokens.
_INSECURE_SECRETS = {
    "adani_flow_secret_key",
    "adani_flow_refresh_secret_key",
    "generate_a_secure_random_string_here",
    "generate_another_secure_random_string_here",
    "",
}


def assert_production_ready() -> None:
    """Refuse to start a deployed environment on development defaults.

    ENVIRONMENT defaults to "production", so this runs unless a machine has explicitly declared
    itself a development box. A developer who has not done that gets the message below, which
    names the one line to add; an operator who forgot to configure the App Service gets the same
    message instead of a silently insecure deployment.
    """
    if settings.ENVIRONMENT.strip().lower() in ("development", "dev", "local", "test"):
        return

    problems = []
    if settings.JWT_SECRET in _INSECURE_SECRETS:
        problems.append("JWT_SECRET is unset or still the built-in default")
    if settings.REFRESH_TOKEN_SECRET in _INSECURE_SECRETS:
        problems.append("REFRESH_TOKEN_SECRET is unset or still the built-in default")
    if settings.JWT_SECRET == settings.REFRESH_TOKEN_SECRET:
        problems.append("JWT_SECRET and REFRESH_TOKEN_SECRET must differ")

    # An OTP exemption is a single-factor account. It is a local-development convenience and must
    # never reach a deployed environment, so the list is refused outright rather than trimmed to
    # something that looks safe - there is no such thing as a safe entry here.
    exempt = settings.test_emails_otp_exempt_list
    if exempt:
        problems.append(
            "TEST_EMAILS_OTP_EXEMPT must be empty outside development - "
            "%d address(es) would sign in with a password alone: %s"
            % (len(exempt), ", ".join(exempt))
        )

    if problems:
        raise RuntimeError(
            "Refusing to start in ENVIRONMENT=%s:\n  - %s\n\n"
            "Generate each secret with: python -c \"import secrets; print(secrets.token_urlsafe(48))\"\n"
            "If this is your local machine, add ENVIRONMENT=development to backend-fastapi/.env."
            % (settings.ENVIRONMENT, "\n  - ".join(problems))
        )


_ENV_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")


def get_p6_password_last_reset_date() -> Optional[str]:
    """Read P6_PASSWORD_LAST_RESET_DATE straight from .env on every call, instead of the
    cached Settings singleton (which is loaded once per process at startup). Without this,
    a password update in one worker process - or before a restart - never becomes visible
    to any other process reading the stale in-memory value, so the "expired" check keeps
    firing even after a successful update."""
    if os.path.exists(_ENV_PATH):
        value = dotenv.get_key(_ENV_PATH, "P6_PASSWORD_LAST_RESET_DATE")
        if value:
            return value
    return settings.P6_PASSWORD_LAST_RESET_DATE
