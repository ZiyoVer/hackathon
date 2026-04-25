from __future__ import annotations

import asyncio

import httpx

from backend.config import Settings


class AishaError(RuntimeError):
    pass


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
        files = {"audio": (filename, audio, content_type)}
        data = {
            "language": self.settings.aisha_language,
            "has_diarization": str(self.settings.aisha_stt_has_diarization).lower(),
        }

        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(url, headers=self._headers(), files=files, data=data)
            self._raise_for_status(response, "Aisha STT upload")
            data = response.json()

            transcript = str(data.get("transcript") or data.get("text") or "")
            if not transcript and data.get("id") is not None:
                transcript = await self._poll_stt_result(client, int(data["id"]))

        confidence = float(data.get("confidence") or 0.9)
        return transcript, confidence, "aisha"

    async def synthesize(self, text: str, voice: str) -> tuple[bytes | None, str | None, str]:
        if not self.settings.has_aisha:
            return None, None, "Aisha TTS API key va base URL kiritilgach audio yaratiladi."

        url = self._url(self.settings.aisha_tts_path)
        data = {
            "transcript": text,
            "language": self.settings.aisha_language,
            "model": self._resolve_tts_model(voice),
        }

        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(url, headers=self._headers(), data=data)
            self._raise_for_status(response, "Aisha TTS")

            content_type = response.headers.get("content-type", "")
            if "application/json" in content_type:
                payload = response.json()
                audio_url = payload.get("audio_path") or payload.get("audio_url")
                if audio_url:
                    return None, str(audio_url), "Aisha TTS audio URL qaytardi."
                if payload.get("id") is not None:
                    audio_url = await self._poll_tts_result(client, int(payload["id"]))
                    return None, audio_url, "Aisha TTS async audio URL qaytardi."
                return None, None, "Aisha TTS javobida audio URL topilmadi."

            return response.content, None, "Aisha TTS audio fayl yaratdi."

    def _url(self, path: str) -> str:
        base = self.settings.aisha_api_base_url.rstrip("/")
        cleaned_path = path if path.startswith("/") else f"/{path}"
        return f"{base}{cleaned_path}"

    def _headers(self) -> dict[str, str]:
        return {"x-api-key": self.settings.aisha_api_key}

    def _resolve_tts_model(self, voice: str) -> str:
        allowed_models = {"gulnoza", "jaxongir"}
        if voice in allowed_models:
            return voice
        if self.settings.aisha_tts_model in allowed_models:
            return self.settings.aisha_tts_model
        return "gulnoza"

    async def _poll_stt_result(self, client: httpx.AsyncClient, result_id: int) -> str:
        url = self._url(self.settings.aisha_stt_result_path.format(id=result_id))
        for _ in range(self.settings.aisha_poll_attempts):
            response = await client.get(url, headers=self._headers())
            self._raise_for_status(response, "Aisha STT result")
            payload = response.json()
            status = str(payload.get("status") or "").upper()
            transcript = str(payload.get("transcript") or payload.get("text") or "")
            if status == "SUCCESS" and transcript:
                return transcript
            if status in {"FAILED", "FAILURE", "ERROR"}:
                raise AishaError("Aisha STT audio processing failed.")
            await asyncio.sleep(self.settings.aisha_poll_interval_seconds)

        raise AishaError("Aisha STT result timeout.")

    async def _poll_tts_result(self, client: httpx.AsyncClient, result_id: int) -> str | None:
        url = self._url(self.settings.aisha_tts_status_path.format(id=result_id))
        for _ in range(self.settings.aisha_poll_attempts):
            response = await client.get(url, headers=self._headers())
            self._raise_for_status(response, "Aisha TTS status")
            payload = response.json()
            status = str(payload.get("status") or "").upper()
            audio_url = payload.get("audio_path") or payload.get("audio_url")
            if status == "SUCCESS" and audio_url:
                return str(audio_url)
            if status in {"FAILED", "FAILURE", "ERROR"}:
                raise AishaError("Aisha TTS generation failed.")
            await asyncio.sleep(self.settings.aisha_poll_interval_seconds)

        raise AishaError("Aisha TTS result timeout.")

    def _raise_for_status(self, response: httpx.Response, label: str) -> None:
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            detail = response.text[:500]
            raise AishaError(f"{label} failed: {response.status_code} {detail}") from exc
