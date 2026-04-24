from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "SQB Agent Copilot"
    frontend_origin: str = "http://localhost:5173"

    aisha_api_key: str = ""
    aisha_api_base_url: str = "https://back.aisha.group"
    aisha_stt_path: str = "/api/v2/stt/post/"
    aisha_stt_result_path: str = "/api/v2/stt/get/{id}/"
    aisha_tts_path: str = "/api/v1/tts/post/"
    aisha_tts_status_path: str = "/api/v1/tts/status/{id}/"
    aisha_language: str = "uz"
    aisha_tts_model: str = "gulnoza"
    aisha_stt_has_diarization: bool = True
    aisha_poll_attempts: int = 12
    aisha_poll_interval_seconds: float = 2.0

    wasabi_endpoint_url: str = "https://s3.eu-central-1.wasabisys.com"
    wasabi_region: str = "eu-central-1"
    wasabi_bucket: str = ""
    wasabi_access_key_id: str = ""
    wasabi_secret_access_key: str = ""
    wasabi_public_base_url: str = ""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @property
    def has_aisha(self) -> bool:
        return bool(self.aisha_api_key and self.aisha_api_base_url)

    @property
    def has_wasabi(self) -> bool:
        return bool(
            self.wasabi_bucket
            and self.wasabi_access_key_id
            and self.wasabi_secret_access_key
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
