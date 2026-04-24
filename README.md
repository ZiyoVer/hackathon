# SQB Agent Copilot

Bank call-markaz agentlari uchun real-time AI copilot. MVP text/audio simulation rejimida ishlaydi: mijoz intentini, e'tirozini, sentimentini aniqlaydi, agentga javob tavsiya qiladi, compliance checklist yuritadi va CRM uchun post-call summary tayyorlaydi.

## Stack

- Frontend: React + Vite + TypeScript
- Backend: FastAPI + Pydantic
- Audio: Aisha AI STT/TTS adapteri
- Storage: Wasabi S3-compatible upload adapteri
- Deploy: Railway, bitta service ichida frontend build + API

## Local ishga tushirish

Backend:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn backend.main:app --reload
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

URL:

- Frontend: `http://localhost:5173`
- API docs: `http://localhost:8000/docs`

## Deploy

Railway Dockerfile orqali build qiladi:

```bash
docker build -t sqb-agent-copilot .
docker run -p 8000:8000 --env-file .env sqb-agent-copilot
```

Railway env variables uchun `.env.example`dagi nomlardan foydalaning. Secret keylarni GitHubga commit qilmang.

## MVP endpointlar

- `GET /health`
- `GET /api/demo-scenarios`
- `POST /api/analyze-message`
- `POST /api/analyze-call`
- `POST /api/audio/transcribe`
- `POST /api/audio/synthesize`

## Aisha AI integratsiya

Aisha docs bo'yicha:

- Base URL: `https://back.aisha.group`
- STT upload: `POST /api/v2/stt/post/`
- STT result: `GET /api/v2/stt/get/{id}/`
- TTS: `POST /api/v1/tts/post/`
- TTS status: `GET /api/v1/tts/status/{id}/`
- Auth header: `x-api-key`
- STT form fields: `audio`, `language=uz`, `has_diarization=true`
- TTS form fields: `transcript`, `language=uz`, `model=gulnoza|jaxongir`

API key lokal `.env` yoki Railway Variables ichida `AISHA_API_KEY` sifatida beriladi.
