from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    confluence_base_url: str = ""
    confluence_email: str = ""
    confluence_api_token: str = ""

    registration_password: str = "M@dhuri8797"

    cors_origins: str = "http://localhost:4200"

    @property
    def configured(self) -> bool:
        return bool(
            self.confluence_base_url
            and self.confluence_email
            and self.confluence_api_token
        )

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
