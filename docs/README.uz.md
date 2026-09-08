# Bank AI Call Center

Hackathon MVP: bank call-center uchun ikki rejimli AI platforma.

- **Operator Copilot**: transcript, intent, next-best-offer, KYC/AML checklist, compliance guardrail.
- **AI Call Agent**: Twilio telefon qo'ng'irog'i orqali mijoz bilan o'zi gaplashadi va CRM status/ticket/lead yaratadi.
- **CRM layer**: demo in-memory CRM, optional Bitrix24 webhook sync.

## Stack

- Frontend: React + Vite + TypeScript
- Backend: Node.js + Express + TypeScript + WebSocket
- Voice: Gemini Live API + Twilio Media Streams
- CRM: demo CRM, Bitrix24 webhook adapter
- Deploy: Railway Dockerfile

## Local ishga tushirish

Cluely-style desktop overlay:

```bash
npm --prefix apps/desktop install
npm run dev:desktop
```

Overlay backenddan real tahlil olishi uchun alohida terminalda API ham ishlasin:

```bash
cp .env.example .env
npm --prefix backend install
npm run dev:api
```

Eski web CRM/demo sahifasi alohida:

```bash
npm --prefix frontend install
npm run dev:web
```

URL:

- Desktop overlay: `npm run dev:desktop`
- Web: `http://localhost:5173`
- API: `http://localhost:8080`
- Health: `http://localhost:8080/health`

## Telefon demo

Twilio telefon qo'ng'irog'i uchun backend public HTTPS/WSS URLda turishi kerak.
Localda eng tez yo'l:

```bash
ngrok http 8080
```

`.env`:

```env
PUBLIC_BASE_URL="https://YOUR-NGROK.ngrok-free.app"
PUBLIC_WS_BASE_URL="wss://YOUR-NGROK.ngrok-free.app"
GEMINI_API_KEY="..."
TWILIO_ACCOUNT_SID="..."
TWILIO_AUTH_TOKEN="..."
TWILIO_FROM_NUMBER="+1..."
VOICE_WEBHOOK_SECRET="random-demo-secret"
VOICE_STREAM_SECRET="another-random-demo-secret"
```

Twilio Console ichida telefon raqamining Voice webhook URLini shunday qo'ying:

```text
https://YOUR-NGROK.ngrok-free.app/api/voice/twilio?customerId=cust_001&secret=random-demo-secret
```

Keyin telefoningizdan Twilio raqamiga qo'ng'iroq qiling. Twilio audio streamni:

```text
wss://YOUR-NGROK.ngrok-free.app/api/voice/twilio/stream
```

endpointga yuboradi, backend esa Gemini Live bilan real-time agentni ulaydi.

## Muhim endpointlar

- `GET /api/demo-scenarios`
- `POST /api/analyze-message`
- `POST /api/analyze-call`
- `POST /api/agent/outbound-call`
- `POST /api/voice/twilio`
- `WS /api/voice/twilio/stream`
- `GET /api/crm/customers`
- `GET /api/crm/calls`
- `PATCH /api/crm/calls/:callId/status`
- `POST /api/crm/calls/:callId/tickets`
- `POST /api/crm/calls/:callId/summary`

## API keylar qayerdan olinadi

API keylarni kodga yozmang va GitHubga commit qilmang. `.env`, Railway Variables yoki secret manager ishlating.

### Gemini

1. `https://aistudio.google.com/app/apikey` ga kiring.
2. Google Cloud project tanlang yoki yangisini yarating.
3. API key yarating.
4. `.env` ichiga `GEMINI_API_KEY` sifatida yozing.

Production/privacy uchun Vertex AI tarafida billing, IAM va data governance bilan ishlatish kerak.

### Twilio

1. `https://console.twilio.com` da account oching.
2. Voice-capable raqam sotib oling.
3. Console dashboarddan `Account SID` va `Auth Token` oling.
4. Raqamni `.env`dagi `TWILIO_FROM_NUMBER`ga yozing.
5. Inbound webhook URL: `/api/voice/twilio`.

Trial accountda outbound call uchun chaqiriladigan telefon raqami verified bo'lishi mumkin.

### Bitrix24 optional

1. Bitrix24: `Applications -> Developer resources -> Other -> Incoming webhook`.
2. CRM va Tasks permission bering.
3. Webhook base URLni `.env`dagi `BITRIX24_WEBHOOK_URL`ga yozing.

Misol:

```env
BITRIX24_WEBHOOK_URL="https://yourcompany.bitrix24.com/rest/1/secret"
```

Backend ticket yaratganda `crm.lead.add`, status update bo'lganda `tasks.task.add` chaqiradi.

## Demo pitch

Bankka ko'rsatadigan asosiy ssenariy:

1. Mijoz kredit foizi qimmatligini aytadi.
2. Copilot 2 soniya ichida intent, e'tiroz, next-best-offer chiqaradi.
3. Operator noto'g'ri va'da bersa compliance guardrail ushlaydi.
4. KYC savoli qolib ketsa checklist alert beradi.
5. AI Call Agent telefon orqali shikoyatni qabul qiladi, CRM ticket ochadi va statusni `in_progress` qiladi.
