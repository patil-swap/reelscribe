# 🎙️ ReelScribe

**ReelScribe** is a high-performance, open-source transcription tool designed to extract text from YouTube videos, Instagram Reels, TikToks, and local audio files in seconds.

Built with a stunning **Glassmorphism UI** and powered by the latest AI models, it offers a fast, free, and account-free experience, complete with an **AI Remix Studio** and local **Library** management.

![ReelScribe UI](frontend/reelscribe_logo.svg)

## ✨ Key Features

### 🎧 Core Transcription
-   **High-Speed Transcription:** Powered by **Groq (Whisper large-v3-turbo)** for near-instant results.
-   **Smart Fallback:** Automatically switches to **Deepgram (Nova-2)** if Groq hits rate limits or is unavailable.
-   **Universal URL Support:** Transcribe directly from YouTube, Instagram Reels, and TikTok via `yt-dlp`.
-   **Local File Uploads:** Supports MP3, MP4, WAV, M4A, WEBM, and MOV files.
-   **Advanced Settings:**
    -   *Include Timestamps* to generate verbose JSON transcription.
    -   *Force English* to force Whisper to translate and transcribe non-English audio directly into English.

### 🪄 AI Remix Studio
-   **Content Repurposing:** Turn any transcript into a fresh script tailored for TikTok, Instagram Reels, or YouTube Shorts.
-   **Granular Controls:** Choose your target platform, desired length (30s, 60s, 90s, long), hook strength (subtle to viral), and emotional tone (raw, energetic, thoughtful, aggressive).
-   **Voice Profiling:** Save your custom "Voice Profile" to ensure all generated scripts sound authentically like you.
-   **Iterative Generation:** Use the *Remix This Variant* button to feed generated scripts back into the AI as the source material.
-   **Side-by-Side Diff:** Instantly see what was changed from the original transcript with line-by-line diff tracking.

### 📚 Local Library Management
-   **Privacy First:** All transcripts and remixed scripts are saved automatically to your local browser storage via **IndexedDB**.
-   **Bulk Actions:** Check multiple library items to import them all into the Remix Studio simultaneously, or export them as a single `.zip` file.
-   **Folder Import:** Instantly ingest an entire directory of `.txt` and `.json` files directly into your library using the modern File System Access API.
-   **Rich Exports:** Export your work as **TXT**, **SRT** (Subtitles), **VTT** (WebVTT), or **Markdown**.

## 🛠️ Tech Stack

-   **Backend:** [FastAPI](https://fastapi.tiangolo.com/) (Python)
-   **AI Providers:** [Groq Cloud](https://groq.com/) or [Deepgram](https://deepgram.com/)
-   **Web Extraction:** [yt-dlp](https://github.com/yt-dlp/yt-dlp)
-   **Frontend:** Vanilla HTML/JS/CSS + [Tailwind CSS](https://tailwindcss.com/)
-   **Styling:** Custom Glassmorphism CSS
-   **Browser APIs:** IndexedDB, File System Access API, JSZip, JSDiff

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
    Create a `.env` file in the `backend/` directory:
    ```env
    GROQ_API_KEY=your_groq_key
    DEEPGRAM_API_KEY=your_deepgram_key
    ALLOWED_ORIGIN=http://localhost:8000 or http://<your-domain>
    RATELIMIT_ENABLED=True or False
    GOOGLE_CLIENT_ID=your_google_client_id
    MAX_UPLOAD_MB=your_max_upload_mb (in MB)
    ```

### Running Locally

```bash
cd backend
python3 -m uvicorn main:app --reload --port 8000
```
Open **[http://127.0.0.1:8000](http://127.0.0.1:8000)** in your browser.

## 📁 Project Structure

```text
reelscribe/
├── backend/            # FastAPI Backend
│   ├── main.py         # App entry & Routing
│   ├── prompts         # System prompts for Remix Studio
│   │   ├── remix_fallback.py
│   │   └── remix.py
│   ├── requirements.txt
│   ├── services.py     # AI & Extraction logic
├── frontend/           # Vanilla JS Frontend
│   ├── errors/         # Custom error pages
│   │   ├── 404.html
│   │   ├── 429.html
│   │   ├── 500.html
│   │   └── error_style.css
│   ├── index.html      # Main app
│   ├── reelscribe_logo.svg
│   ├── script.js       # Main application logic
│   └── style.css       # Custom Glassmorphism styles
├── PRD.md              # Product Requirement Document
└── README.md           # Project documentation
```

## 📜 License

Distributed under the MIT License. See `LICENSE` for more information.

## 🙌 Credits

-   **Whisper AI** by OpenAI
-   **FFmpeg** for audio processing
-   **Groq Cloud** for inference speed
