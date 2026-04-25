# Twilio Checklist

Telefon orqali AI agent bilan gaplashish uchun Twilio'dan quyidagilar kerak.

## Twilio Console'dan olinadi

1. `Account SID`
2. `Auth Token`
3. Voice-enabled phone number
4. Trial bo'lsa: telefon qilinadigan raqamni `Verified Caller ID` qilish

`.env`:

```env
TWILIO_ACCOUNT_SID=""
TWILIO_AUTH_TOKEN=""
TWILIO_FROM_NUMBER="+1..."
```

## Public URL

Local demo:

```bash
ngrok http 8080
```

`.env`:

```env
PUBLIC_BASE_URL="https://your-ngrok.ngrok-free.app"
PUBLIC_WS_BASE_URL="wss://your-ngrok.ngrok-free.app"
VOICE_WEBHOOK_SECRET="random-secret"
VOICE_STREAM_SECRET="another-random-secret"
```

## Inbound: siz agentga telefon qilasiz

Twilio Phone Number > Voice webhook:

```text
https://your-ngrok.ngrok-free.app/api/voice/twilio?customerId=cust_001&secret=random-secret
```

Flow:

```text
Siz -> Twilio raqam -> backend TwiML -> WebSocket stream -> Gemini Live -> agent javobi
```

## Outbound: agent sizga telefon qiladi

Backend endpoint:

```http
POST /api/agent/outbound-call
```

Body:

```json
{
  "to": "+998901112233",
  "customerId": "cust_001"
}
```

Trial Twilio accountda `to` raqam verified bo'lishi kerak.

## Tez tekshiruv

```bash
curl http://localhost:8080/api/integrations/status
```

`ready_for_phone_demo: true` bo'lishi uchun:

- `GEMINI_API_KEY`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER`
- `PUBLIC_BASE_URL`
- `PUBLIC_WS_BASE_URL`

to'ldirilgan bo'lishi kerak.
