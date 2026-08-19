# 🎙️ ReelScribe

**ReelScribe** is a high-performance, open-source transcription tool designed to extract text from YouTube videos, Instagram Reels, TikToks, and local audio files in seconds.

Built with a stunning **Glassmorphism UI** and powered by the latest AI models, it offers a fast transcription experience complete with **User Authentication**, **smart rate limiting**, an **AI Remix Studio**, and local **Library** management.

![ReelScribe UI](frontend/reelscribe_logo.svg)

## ✨ Key Features

### 🎧 Core Transcription
-   **High-Speed Transcription:** Powered by **Groq (Whisper large-v3-turbo)** for near-instant results.
-   **Smart Fallback:** Automatically switches to **Deepgram (Nova-2)** if Groq hits rate limits or is unavailable.
-   **Universal URL Support:** Transcribe directly from YouTube, Instagram Reels, and TikTok via `yt-dlp`.
-   **Local File Uploads:** Supports MP3, MP4, WAV, M4A, WEBM, and MOV files.
-   **Advanced Settings:**
    -   *Include Timestamps* to generate verbose JSON transcription.
    -   *Force English* to translate and transcribe non-English audio directly into English.

### 🔐 User Authentication & Rate Limiting
-   **Sign Up / Sign In:** Secure email-based accounts using PBKDF2-HMAC-SHA256 password hashing and HMAC-SHA256 signed tokens (no third-party auth dependencies).
-   **Disposable Email Blocking:** Sign-up validates email providers against a blocklist and keyword heuristics — no temp-mail abuse.
-   **Smart Transcription Limits:** Enforced in a rolling 24-hour window:
    -   **Anonymous users:** 3 transcriptions / 24h
    -   **Authenticated users:** 8 transcriptions / 24h (+5 bonus)
-   **Incognito-Resistant Tracking:** Anonymous users are fingerprinted using a composite of `IP address + browser fingerprint` (screen resolution, user agent, language, timezone, plugins) — limits persist even across incognito tabs and sessions.
-   **Live Usage UI:** A limit badge in the header and an info banner show real-time usage (e.g. `2/8`) and prompt anonymous users to create an account.

### 🪄 AI Remix Studio
-   **Content Repurposing:** Turn any transcript into a fresh script tailored for TikTok, Instagram Reels, or YouTube Shorts.
-   **Granular Controls:** Choose your target platform, desired length (30s, 60s, 90s, long), hook strength (subtle to viral), and emotional tone (raw, energetic, thoughtful, aggressive).
-   **Voice Profiling:** Save your custom "Voice Profile" to ensure all generated scripts sound authentically like you.
-   **Iterative Generation:** Use the *Remix This Variant* button to feed generated scripts back into the AI as the source material.
-   **Side-by-Side Diff:** Instantly see what changed from the original transcript with line-by-line diff tracking.

### 📚 Local Library Management
-   **Privacy First:** All transcripts and remixed scripts are saved automatically to your local browser storage via **IndexedDB**.
-   **Bulk Actions:** Check multiple library items to import them all into the Remix Studio simultaneously, or export them as a single `.zip` file.
-   **Folder Import:** Instantly ingest an entire directory of `.txt` and `.json` files directly into your library using the modern File System Access API.
-   **Rich Exports:** Export your work as **TXT**, **SRT** (Subtitles), **VTT** (WebVTT), or **Markdown**.

## 🛠️ Tech Stack

-   **Backend:** [FastAPI](https://fastapi.tiangolo.com/) (Python)
-   **Database:** SQLite (via `sqlite3` stdlib — zero extra dependencies)
-   **Auth:** Custom HMAC-SHA256 tokens + PBKDF2 password hashing (no JWT library needed)
-   **AI Providers:** [Groq Cloud](https://groq.com/) or [Deepgram](https://deepgram.com/)
-   **Web Extraction:** [yt-dlp](https://github.com/yt-dlp/yt-dlp)
-   **Frontend:** Vanilla HTML/JS/CSS + [Tailwind CSS](https://tailwindcss.com/)
-   **Browser APIs:** IndexedDB, File System Access API, JSZip, JSDiff
-   **Deployment:** [Vercel](https://vercel.com/) (frontend) + [Render](https://render.com/) (backend)

## 🚀 Getting Started

### Prerequisites

-   **Python 3.11+**
-   **FFmpeg** (Required for audio extraction)
    -   *Linux:* `sudo apt update && sudo apt install ffmpeg`
    -   *macOS:* `brew install ffmpeg`
    -   *Windows:* `choco install ffmpeg`

### Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/yourusername/reelscribe.git
    cd reelscribe
    ```

2.  **Set up Virtual Environment:**
    ```bash
    python3 -m venv .venv
    source .venv/bin/activate  # Windows: .venv\Scripts\activate
    ```

3.  **Install Dependencies:**
    ```bash
    pip install -r backend/requirements.txt
    ```

4.  **Configure Environment Variables:**
    Create a `.env` file in the `backend/` directory (copy from `.env.example`):
    ```env
    GROQ_API_KEY=your_groq_key
    DEEPGRAM_API_KEY=your_deepgram_key
    JWT_SECRET_KEY=a_long_random_secret_string   # used to sign auth tokens
    ALLOWED_ORIGIN=http://localhost:8000          # set to your frontend domain in production
    GOOGLE_CLIENT_ID=your_google_client_id        # optional, for Google Drive backup
    MAX_UPLOAD_MB=50
    ```

### Running Locally

```bash
cd backend
python3 -m uvicorn main:app --reload --port 8000
```
Open **[http://127.0.0.1:8000](http://127.0.0.1:8000)** in your browser.

## ☁️ Deployment

ReelScribe is designed for a split-deployment model:

| Layer | Platform | Config File |
|---|---|---|
| Frontend (static) | [Vercel](https://vercel.com/) | `vercel.json` |
| Backend (Python API) | [Render](https://render.com/) | `backend/Procfile` |

### Frontend → Vercel

1. Connect your GitHub repo to Vercel.
2. Vercel will auto-detect `vercel.json` and serve the `frontend/` directory as a static site.
3. No build step required.

### Backend → Render

1. Create a new **Web Service** on Render pointed at this repo.
2. Set the **Root Directory** to `/` (repo root) and **Start Command** to:
   ```
   uvicorn backend.main:app --host 0.0.0.0 --port $PORT
   ```
   (This is already defined in `backend/Procfile`.)
3. Add the following **Environment Variables** in the Render dashboard:

   | Variable | Value |
   |---|---|
   | `GROQ_API_KEY` | Your Groq API key |
   | `DEEPGRAM_API_KEY` | Your Deepgram API key |
   | `JWT_SECRET_KEY` | A long, random secret string |
   | `ALLOWED_ORIGIN` | Your Vercel frontend URL (e.g. `https://reelscribe.vercel.app`) |
   | `MAX_UPLOAD_MB` | `50` |

### Connecting Frontend to Backend

In `frontend/script.js`, update the `backendUrl` to point at your Render service URL:

```js
// line ~23
backendUrl: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:8000'
    : 'https://your-render-service.onrender.com',  // ← your Render URL
```

## 📁 Project Structure

```text
reelscribe/
├── backend/                # FastAPI Backend
│   ├── main.py             # App entry, routing, auth & limit endpoints
│   ├── database.py         # SQLite helpers: users, transcription logs
│   ├── auth_utils.py       # Token signing/verification, email validation
│   ├── services.py         # AI & audio extraction logic
│   ├── prompts/            # System prompts for Remix Studio
│   │   ├── remix.py
│   │   └── remix_fallback.py
│   ├── Procfile            # Render start command
│   ├── requirements.txt
│   └── .env.example        # Environment variable template
├── frontend/               # Vanilla JS Frontend
│   ├── errors/             # Custom error pages (404, 429, 500)
│   ├── index.html          # Main app shell + auth modal
│   ├── script.js           # App logic, auth flow, fingerprinting
│   └── style.css           # Custom Glassmorphism styles
├── vercel.json             # Vercel static deployment config
├── PRD.md                  # Product Requirement Document
└── README.md
```

## 🔒 Security Notes

-   Passwords are hashed with **PBKDF2-HMAC-SHA256** (100,000 iterations + random salt).
-   Auth tokens are signed with **HMAC-SHA256** and expire after 30 days.
-   Password comparison uses `secrets.compare_digest` to prevent timing attacks.
-   Login errors return generic messages (`"Invalid email or password"`) to prevent user enumeration.
-   Rate limiting is enforced server-side (not just in the frontend) — it cannot be bypassed by modifying JS.

## 📜 License

Distributed under the MIT License. See `LICENSE` for more information.

## 🙌 Credits

-   **Whisper AI** by OpenAI
-   **FFmpeg** for audio processing
-   **Groq Cloud** for inference speed
-   **Deepgram** for reliable fallback transcription
