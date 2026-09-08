# AI Call Center Prototype

**A hackathon prototype combining an operator copilot, a voice agent, and a demo CRM.**

The project explores how call-center software can connect conversation analysis, live audio, and follow-up workflows in one interface.

[Original Uzbek setup guide](docs/README.uz.md) · [Backend](backend/src) · [Web frontend](frontend) · [Desktop application](apps/desktop)

## Two interaction modes

- **Operator copilot:** transcript analysis, intent and objection detection, suggested next steps, and checklist-style prompts.
- **Voice agent:** a Twilio Media Streams connection to Gemini Live, with CRM ticket and status workflows.

The application includes an in-memory demo CRM and an optional Bitrix24 integration.

## Architecture

```text
Web / desktop interface → Express API → analysis + demo CRM
                               ↕
                    Twilio audio ↔ Gemini Live
                               ↓
                     Optional Bitrix24 sync
```

## Stack

**TypeScript · React · Vite · Node.js · Express · WebSockets · Gemini Live · Twilio**

## Run the web prototype

```bash
git clone https://github.com/ZiyoVer/hackathon.git
cd hackathon
cp .env.example .env
npm --prefix backend ci
npm --prefix frontend ci
```

Start the API and frontend in separate terminals:

```bash
npm run dev:api
```

```bash
npm run dev:web
```

- Web: `http://localhost:5173`
- API: `http://localhost:8080`
- Health: `http://localhost:8080/health`

For the optional desktop interface:

```bash
npm --prefix apps/desktop install
npm run dev:desktop
```

Real phone calls require your own Gemini/Twilio credentials and a public HTTPS/WSS backend. See the [original setup guide](docs/README.uz.md) for webhook details.

## Prototype boundaries

The transcript analyzer in [analyzer.ts](backend/src/services/analyzer.ts) uses **rule-based matching**, not a trained sentiment or compliance model. Its labels and scores are demo heuristics. The voice path uses the separate Gemini Live integration.

This is a hackathon MVP, not a validated banking decision system. Demo CRM data is stored in memory. Authentication defaults, data persistence, and deployment controls need review before any production use.

**Author:** [O'ktam Ziyodullayev](https://github.com/ZiyoVer)
