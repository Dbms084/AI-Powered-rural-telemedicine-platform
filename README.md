# ArogyaLink Realtime Telemedicine Prototype

![Node.js](https://img.shields.io/badge/NODE.JS-20.x-1f2937?style=for-the-badge&logo=nodedotjs&logoColor=3c873a)
![Express](https://img.shields.io/badge/EXPRESS-4.19-black?style=for-the-badge&logo=express&logoColor=white)
![Socket.IO](https://img.shields.io/badge/SOCKET.IO-4.7-111827?style=for-the-badge&logo=socketdotio&logoColor=white)
![Ollama](https://img.shields.io/badge/OLLAMA-phi3:mini-0f172a?style=for-the-badge&logo=ollama&logoColor=white)
![MongoDB](https://img.shields.io/badge/MONGODB-Optional-052e16?style=for-the-badge&logo=mongodb&logoColor=22c55e)
![Vanilla JS](https://img.shields.io/badge/VANILLA_JS-Frontend-facc15?style=for-the-badge&logo=javascript&logoColor=111827)
![PWA](https://img.shields.io/badge/PWA-Enabled-2563eb?style=for-the-badge&logo=pwa&logoColor=white)

ArogyaLink is a realtime telemedicine prototype built with **Node.js**, **Express**, **Socket.IO**, and a local **Ollama** model for AI-assisted triage.

It includes:
- Symptom checker
- Realtime patient chat with AI triage labels
- Emergency alert workflow
- Admin dashboard
- Responder dashboard with accept/arrived lifecycle
- Dispatch audit trail and auto-timeout escalation

## Tech Stack

- Backend: Node.js, Express, Socket.IO
- AI: Ollama (`phi3:mini` by default)
- Database: MongoDB (optional; app has in-memory fallback)
- Frontend: HTML, CSS, Vanilla JS

## Project Structure

```text
server/            # API routes, socket server, models, services
client/            # Login, patient, admin, responder pages and scripts
assets/            # PWA icons/screenshots
.env.example       # Environment template
```

## Prerequisites

- Node.js 18+
- npm
- Ollama installed
- (Optional) MongoDB running locally

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy environment template:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

3. Pull the default local model:

```bash
ollama pull phi3:mini
```

4. Ensure Ollama is running (if not already):

```bash
ollama serve
```

5. Start the app:

```bash
npm start
```

6. Open:

```text
http://localhost:5000
```

## Environment Variables

Key values in `.env`:

- `PORT=5000`
- `MONGO_URI=mongodb://127.0.0.1:27017/arogyalink`
- `ADMIN_KEY=admin123`
- `AI_ENABLED=true`
- `AI_API_BASE_URL=http://127.0.0.1:11434/v1`
- `AI_MODEL=phi3:mini`
- `AI_TIMEOUT_MS=60000`
- `INTERNET_CONTEXT_ENABLED=true`
- `DISPATCH_ARRIVAL_TIMEOUT_MINUTES=8`
- `CHAT_REPLY_TIMEOUT_MS=20000`

## Realtime Role Flows

- **Patient/User**: symptom checker, chat, emergency alerts
- **Doctor/Admin**: monitors chat, emergencies, responder presence
- **Responder**: receives dispatches, accepts, marks arrived

## Dispatch Lifecycle

- `urgent` -> `accepted` -> `arrived`
- Auto-escalates to `escalated` if accepted but not arrived before timeout
- Every action is stored in an audit trail with actor and timestamp

## Notes

- If MongoDB is offline, the app still works using in-memory storage.
- In-memory data resets on server restart.

## Troubleshooting

### `ollama serve` says port already in use

This usually means Ollama is already running. Verify with:

```powershell
powershell -Command "(Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:11434/api/tags' -TimeoutSec 8).StatusCode"
```

If you get `200`, Ollama is healthy.

### Chatbot not responding

- Confirm app server is running on port `5000`
- Confirm Ollama endpoint is reachable
- Check `.env` values for `AI_API_BASE_URL` and `AI_MODEL`

## License

This project is for prototype/hackathon use. Add your preferred license before publishing.
