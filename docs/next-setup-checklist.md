# Keyingi Setup Checklist

## Muhim security qoida

API key kodga yozilmaydi va GitHubga commit qilinmaydi. Key faqat:

- local `.env`
- Railway Variables
- boshqa secret manager

orqali beriladi. Kod `process.env.GEMINI_API_KEY`dan o'qiydi.

## Hozir kerak bo'ladigan narsalar

1. Gemini API key
   - `.env`: `GEMINI_API_KEY=...`
   - Keyni brauzer/frontend kodga bermang.

2. Public URL
   - Local demo: `ngrok http 8080`
   - `.env`:
     - `PUBLIC_BASE_URL=https://...ngrok-free.app`
     - `PUBLIC_WS_BASE_URL=wss://...ngrok-free.app`

3. Twilio telefon demo
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
   - `TWILIO_FROM_NUMBER`
   - `VOICE_WEBHOOK_SECRET`
   - `VOICE_STREAM_SECRET`
   - Trial account bo'lsa, sizning telefon raqamingiz Verified Caller ID bo'lishi mumkin.

4. CRM demo
   - Hozir in-memory CRM ishlaydi.
   - Bitrix24 ulash uchun `BITRIX24_WEBHOOK_URL` kerak.

5. Production PBX uchun bankdan olinadigan ma'lumot
   - PBX turi: Asterisk, FreeSWITCH, 3CX, Cisco, Avaya, Yeastar yoki Bitrix24 telephony.
   - SIP trunk yoki extension credential.
   - RTP codec: PCMU/PCMA/Opus, sample rate.
   - Firewall/IP allowlist.
   - Call start/end webhook imkoniyati.
   - Audio recording policy va rozilik matni.
   - CRM/ABS/skoring sandbox API.

## Preflight endpoint

Backend ishga tushgach:

```bash
curl http://localhost:8080/api/integrations/status
```

Bu endpoint qaysi integratsiya tayyorligini va telefon demo uchun nima yetishmayotganini ko'rsatadi.
