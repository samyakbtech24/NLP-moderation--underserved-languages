# FairMod web UI

Next.js App Router frontend for the FairMod FastAPI backend.

## Prerequisites

1. Python backend running with a model checkpoint (see repo root README).
2. Node.js 20+.

## Setup

```powershell
cd web
npm install
```

`.env.local` (already created):

```
FAIRMOD_API_URL=http://127.0.0.1:7860
```

## Run

**Terminal A — API (repo root):**

```powershell
.\.venv\Scripts\Activate.ps1
python app.py
```

**Terminal B — UI:**

```powershell
cd web
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

- Analyze: `POST /api/classify` → FastAPI `/classify` (with IG highlights)
- Bulk CSV: `POST /api/bulk` → FastAPI `/bulk` (probability ranking)
- Health: `GET /api/health`

Gradio remains at [http://localhost:7860](http://localhost:7860) for Spaces / paper screenshots.
