from __future__ import annotations

import httpx

from backend.config import Settings


class AishaClient:
    def __init__(self, settings: Settings):
        self.settings = settings

    async def transcribe(self, audio: bytes, filename: str, content_type: str) -> tuple[str, float, str]:
        if not self.settings.has_aisha:
            return (
                "Audio qabul qilindi. Aisha API key va base URL kiritilgach real transcript qaytadi.",
                0.5,
                "mock",
            )

        url = self._url(self.settings.aisha_stt_path)
        headers = {"Authorization": f"Bearer {self.settings.aisha_api_key}"}
        files = {"file": (filename, audio, content_type)}

        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(url, headers=headers, files=files)
            response.raise_for_status()
            data = response.json()

        transcript = str(data.get("transcript") or data.get("text") or "")
        confidence = float(data.get("confidence") or 0.9)
        return transcript, confidence, "aisha"

    async def synthesize(self, text: str, voice: str) -> tuple[bytes | None, str | None, str]:
        if not self.settings.has_aisha:
            return None, None, "Aisha TTS API key va base URL kiritilgach audio yaratiladi."

        url = self._url(self.settings.aisha_tts_path)
        headers = {"Authorization": f"Bearer {self.settings.aisha_api_key}"}
        payload = {"text": text, "voice": voice}

        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()

            content_type = response.headers.get("content-type", "")
            if "application/json" in content_type:
                data = response.json()
                return None, data.get("audio_url"), "Aisha TTS audio URL qaytardi."

            return response.content, None, "Aisha TTS audio fayl yaratdi."

    def _url(self, path: str) -> str:
        base = self.settings.aisha_api_base_url.rstrip("/")
        cleaned_path = path if path.startswith("/") else f"/{path}"
        return f"{base}{cleaned_path}"
