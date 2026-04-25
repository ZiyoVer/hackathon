# API Keylar Va Telefon Demo

## Minimal keylar

| Kerak | Qayerdan olinadi | `.env` nomi |
| --- | --- | --- |
| Gemini Live | Google AI Studio API keys | `GEMINI_API_KEY` |
| Twilio Voice | Twilio Console dashboard | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` |
| Twilio raqam | Twilio Console > Phone Numbers | `TWILIO_FROM_NUMBER` |
| Public URL | ngrok, Cloudflare Tunnel yoki Railway | `PUBLIC_BASE_URL`, `PUBLIC_WS_BASE_URL` |
| Bitrix24 optional | Bitrix24 incoming webhook | `BITRIX24_WEBHOOK_URL` |

## Inbound call demo

1. Backendni ishga tushiring: `npm run dev:api`.
2. Public tunnel oching: `ngrok http 8080`.
3. `.env`ga ngrok URLni yozing.
4. Twilio Phone Number > Voice Configuration:
   - Webhook method: `POST`
   - URL: `https://YOUR-NGROK.ngrok-free.app/api/voice/twilio?customerId=cust_001`
5. Telefoningizdan Twilio raqamiga qo'ng'iroq qiling.

## Outbound call demo

1. Web UIda telefon raqamini `+998...` formatida kiriting.
2. `AI qo'ng'iroq` tugmasini bosing.
3. Backend `POST /api/agent/outbound-call` orqali Twilio call yaratadi.
4. Twilio ulangach `/api/voice/twilio` TwiML oladi va audio streamni WebSocketga yuboradi.

## CRM status logikasi

- `new`: qo'ng'iroq boshlandi.
- `in_progress`: muammo/ticket ochildi.
- `pending_customer`: mijozdan hujjat yoki javob kutilmoqda.
- `resolved`: muammo hal bo'ldi.
- `not_bank_issue`: bank muammosi emas, lekin mijozga yo'l-yo'riq berildi.
- `escalated`: mas'ul departament yoki supervisor kerak.
