# app/config.py
"""
Application configuration using pydantic-settings.
Maps all environment variables from the Express .env file.
"""

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

    # ── JWT ────────────────────────────────────────────────────────
    JWT_SECRET: str = "adani_flow_secret_key"
    REFRESH_TOKEN_SECRET: str = "adani_flow_refresh_secret_key"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ── Oracle P6 ─────────────────────────────────────────────────
    ORACLE_P6_OAUTH_TOKEN: Optional[str] = None
    ORACLE_P6_AUTH_TOKEN: Optional[str] = None
    ORACLE_P6_TOKEN_URL: Optional[str] = None
    ORACLE_P6_BASE_URL: Optional[str] = None

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
    # ── Spectra Drone ─────────────────────────────────────────────
    SPECTRA_BASE_URL: str = "https://dpr.spectra-insights.com/api"
    SPECTRA_API_KEY: str = "dpr_live_vbsTqkLunC9Sa_Lwyr-WxlTHhkcF21BDxlmMI3Y0OaY"
    # ── Proxy ─────────────────────────────────────────────────────
    HTTPS_PROXY: Optional[str] = None
    HTTP_PROXY: Optional[str] = None
    NO_PROXY: Optional[str] = None

    # ── App ───────────────────────────────────────────────────────
    APP_BASE_URL: str = "http://localhost:3316"
    SUPER_ADMIN_EMAIL: str = "rohit.sharma6@adani.com,praveen.gunja@adani.com"
    PORT: int = 3121
    FASTAPI_ROOT_PATH: str = ""

    @property
    def super_admin_emails(self) -> list[str]:
        """Returns a list of Super Admin emails from the comma-separated string."""
        return [email.strip().lower() for email in self.SUPER_ADMIN_EMAIL.split(",") if email.strip()]

    # ── Pool ──────────────────────────────────────────────────────
    DB_POOL_MIN_SIZE: int = 3
    DB_POOL_MAX_SIZE: int = 10

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
