# ReelScribe - Product Requirements Document (PRD)

**Version:** 1.2
**Date:** April 19 2026
**Status:** Final
**Goal:** Build a beautiful, fast, and free TurboScribe alternative + Remix Studio for content creators that works reliably in production.

---

## 1. Product Overview

**Product Name:** ReelScribe
**Tagline:** Transcribe YouTube videos, Reels & audio files in seconds with Whisper.

**Mission:**
Create the best-looking, easiest-to-use, completely free transcription tool that supports YouTube, Facebook/Instagram Reels, and local files. Now with Remix Studio to turn old transcripts into fresh scripts.

**Core Value Proposition:**
One URL or file → beautiful, accurate English transcript with timestamps. Free for all users, no signup required. Then remix into new content while keeping original emotion/knowledge/ideology.

---

## 2. Target Users

- Content creators
- Researchers & students
- Podcasters & journalists
- YouTubers who need quick clips/transcripts
- Anyone who consumes long-form video content

---

## 3. Key Features

### 3.1 Input Methods
- Paste YouTube, Facebook Reel, or Instagram Reel link
- Drag & drop + click to upload local audio/video files (mp3, mp4, wav, m4a, etc.)

### 3.2 Video Info Preview (for URLs)
- Auto-fetch and display:
  - Thumbnail
  - Title
  - Channel name
  - Duration
  - View count (when available)

### 3.3 Transcription Options
- **Model Selector** with "Recommended" badge:
  - large-v3, **large-v3-turbo (default)**
- Toggle: **Include Timestamps**
- Force English only

### 3.4 Processing Experience
- Horizontal progress bar with percentage
- Live status messages
- Cancel button: frontend abort only (backend may finish → Groq quota burned, known cost leak)
- Length warnings:
  - > 2 hours → soft warning
  - > 4 hours → strong warning + proceed/cancel option

### 3.5 Results Page
- Clean readable transcript (editable)
- Copy & Download options (.txt, .srt, .md)
- Auto-save current transcript to library
- **Two tabs at top of results:** `TRANSCRIPT` | `REMIX STUDIO`
- `TRANSCRIPT` tab = original unchanged view
- Remix button anywhere switches to `REMIX STUDIO` tab (same page, no reload)

### 3.6 Remix Studio (dedicated pane)
- Full pane, current transcript pre-loaded
- Library import via chips / multi-select
- Inner tabs: Current Only | Library + Current
- **My Voice Profile** (IndexedDB):
  - Created on first visit: simple form "Describe your content style in 1-3 sentences" (max 500 chars)
  - Example: "Minecraft venting style, short sentences, curse words OK, brutal honesty, strong hooks"
  - Default: empty (no auto-apply until set)
  - Edit anytime
- Controls:
  - Emotion pills + draft textarea + length selector (30s/60s/90s/long) + blend slider (0 = pure sources only, 1 = heavy user prompt influence)
  - Textarea: 1-2 phrases or draft hook
  - Advanced (collapsible): timestamp cues, platform target, hook strength
- Generate → output card:
  - Editable title + script
  - Side-by-side diff vs original transcript (highlight added/removed)
  - "Remix This Variant" (reuses sources + My Voice + prompt)
  - Save to Library as variant
- Back arrow to return to TRANSCRIPT tab instantly

### 3.7 Library
- Persistent via IndexedDB (`reelscribeLibrary`)
- Auto-saves every finished transcript + all remixed variants
- Stores: id, title, full text, source, date, tags
- View: grid/list, search, filter by date/source/tags
- Click item → preview modal + "Import to Remix"
- Multi-select + bulk import to Remix Studio
- "Pick Folder" (File System Access API) → import .txt/.md/.srt from user dir
- Buttons: Delete, Export selected as zip, Clear All
- Survives browser restart/tab close
- Data only lost if user deletes or clears browser data

**Cloud Backup Option (opt-in)**
- "Backup to Google Drive" / "Restore from Drive"
- Uses user’s own Google account (OAuth2)
- Creates `ReelScribe Library` folder
- One-click full or selected backup
- Auto-backup toggle
- All ops client-side. No server storage.

### 3.8 UI/UX Features
- Dark mode by default + Light mode toggle (persisted in localStorage)
- Fully responsive (mobile-first)
- Beautiful toast notifications
- Keyboard shortcuts:
  - Ctrl/Cmd + K → Focus URL input
  - Ctrl/Cmd + Enter → Start transcription
  - Esc → Cancel current job
- Premium modern design (glassmorphism, smooth animations, purple/blue accents)

### 3.9 Footer
- Made with ❤️

---

## 4. Technical Stack

### Frontend
- HTML + Tailwind CSS + Vanilla JavaScript
- Single index.html + style.css + script.js
- Fully static, deployed on Vercel (free tier)

### Backend
- **Framework:** FastAPI (Python 3.11+)
- **Hosting:** Railway hobby plan (~$5/month)
- **Responsibilities:**
  - Receive URL or file upload
  - Run yt-dlp to extract audio from URLs
  - Forward audio to Groq API for transcription
  - Return structured JSON response to frontend
  - Clean up /tmp files after every request

### Transcription
- **Primary:** Groq API — Whisper large-v3
  - $0.02 per hour of audio
  - No server management, no cold starts, no idle cost
- **Fallback:** Deepgram Nova-2 or AssemblyAI
  - Used if Groq is rate-limited or unavailable
  - Similar pricing, simple REST API

### Remix Studio
- **Primary:** Groq API — llama-3.1-8b-instant (chat completion)
  - $0.02 per hour of token
  - No server management, no cold starts, no idle cost
- **Fallback:** Ollama (local) — gemma4:31b-cloud (chat completion)
  - Used if Groq is rate-limited or unavailable
  - Free pricing, simple REST API

---

## 5. Backend Specification

### API Endpoints

POST /transcribe
- Accepts: multipart/form-data
- Fields: file (audio/video, max 50MB) OR url (YouTube/Reel link), model (string), timestamps (bool)
- Returns: JSON { transcript, segments[], duration, model_used }
- Timeout: 300s (set explicitly in Railway config)

GET /video-info
- Accepts: ?url=
- Returns: JSON { title, channel, thumbnail_url, duration, view_count }
- Uses yt-dlp

GET /health
- Returns: { status: "ok" }

**New Endpoint**
POST /generate-script
Body:
```json
{
  "sources": ["transcript text 1", "transcript text 2"],
  "userPrompt": "emotion: numb empty + draft: why does it feel off",
  "length": "60s",
  "blend": 0.7
}
```
Returns: `{ title, script, tags }`
System prompt (exact):
```
You are script remixer. Take ALL source texts. Keep 100% emotion/knowledge/ideology/tone.
Blend with userPrompt. Output fresh spoken reel script.
JSON only: {"title":"...","script":"...","tags":[...]}
Strong hook first 3s. Raw feel. No fluff. Match length.
```

**Notes**
- System prompt lives in code (backend/prompts/remix.py) — PRD illustrative only.
- Fallback prompt in code (backend/prompts/remix_fallback.py).

### Transcription Flow

1. Request hits /transcribe
2. If URL: yt-dlp extracts audio → saves to /tmp as .mp3
3. If file upload: saved directly to /tmp
4. Audio forwarded to Groq API (Whisper large-v3)
5. If Groq fails: retry once, then fall back to Deepgram or AssemblyAI
6. Response parsed → returned to frontend as JSON
7. /tmp file deleted in try/finally block (always, even on failure)

### File Handling

- Max upload size: 50MB (enforced at FastAPI middleware level)
- Accepted MIME types: audio/mpeg, audio/wav, audio/mp4, audio/x-m4a, video/mp4
- Reject anything else with a 415 error
- /tmp cleanup: always in try/finally

### Rate Limiting

- Library: slowapi (FastAPI middleware)
- Limit: 5 requests per 15 minutes per IP (for /transcribe and /video-info endpoints)
- Limit: 20 requests per 15 minutes per IP (for /generate-script endpoint)
- Response on breach: 429 with message "Too many requests. Please wait before transcribing again."

### Error Handling

| Scenario | HTTP Code | User-facing message |
|---|---|---|
| File too large | 413 | "File exceeds 50MB limit. Try compressing it first." |
| Unsupported format | 415 | "Format not supported. Use mp3, mp4, wav, or m4a." |
| yt-dlp extraction fails | 422 | "Couldn't extract audio. The link may be private or unsupported." |
| Groq API timeout | 504 | "Transcription timed out. Try a shorter file or the base model." |
| Groq rate limited | 429 | "Too many requests. Wait a moment and try again." |
| All transcription services down | 503 | "Transcription is temporarily unavailable. Try again shortly." |
| IP rate limit hit | 429 | "Too many requests. Please wait before transcribing again." |
| Groq malformed JSON | 502 | "Remix failed. Retrying with simplified prompt..." (retry once with minimal system prompt that forces clean JSON) |
| Invalid sources | 400 | "No valid text provided." |

### Cancellation

No true server-side cancel — Groq API does not support it. Strategy:
- Frontend cancels the fetch() request immediately
- Backend finishes the Groq call but discards the result → quota cost. Known limitation.
- /tmp file cleaned up via try/finally regardless
- Frontend shows "Cancelled" state without waiting for backend confirmation
- This limitation must be documented in code comments

### CORS

- Production: allow only the Vercel frontend domain
- Local dev: allow *

### Environment Variables

HF_API_TOKEN — kept for reference, not used in primary flow
GROQ_API_KEY — Groq API key
DEEPGRAM_API_KEY — fallback transcription
ASSEMBLYAI_API_KEY — fallback transcription
ALLOWED_ORIGIN — Vercel frontend URL
MAX_UPLOAD_MB — 50

---

## 6. Cost Model

| Service | Cost |
|---|---|
| Vercel | $0 |
| Railway | ~$5 |
| Groq Whisper | ~$2 |
| Groq Llama remix | ~$0.05 |
| **Total** | **~$7.05/month** |

---

## 7. Non-Functional Requirements

- Library: IndexedDB primary. Google Drive backup optional (drive.file scope). No server storage.
- User can delete anytime
- Zero accounts for core use
- Privacy first. No server storage of user transcripts
- My Voice Profile: optional, max 500 chars, persists in IndexedDB.
- File System Access API: Chrome/Edge only, graceful fallback.
- Side-by-side diff: always vs original transcript.
- All new features additive. Core transcription flow untouched.
- Success metrics: Lighthouse >90, 10-min video transcript <90s end-to-end, remix <8s.
---

## 8. Out of Scope (for MVP)

- User accounts / history beyond local library
- Multi-language
- Speaker diarization
- Video subtitle burn-in
- Payment / pro version
- Anything that touches core transcription flow

---

## 9. Success Metrics

- Users complete transcription in <3 clicks
- Beautiful UI
- Library + Remix flow feels seamless
- Cost under $15/month
- Lighthouse score >90
- 10-min video transcript end-to-end <90s (large-v3-turbo)
- Remix generation <8s

---

## 10. Design & Branding

### 10.1 Visual Style
- **Theme:** Dark mode by default. Light mode toggle persisted in localStorage.
- **Primary Colors:** Deep dark background (#0F0F13 or similar), vibrant purple (#7C3AED), cyan accents (#06B6D4)
- **Font:** Inter (system sans fallback)
- **Style:** Glassmorphism cards (frosted glass effect with subtle border and backdrop blur), smooth micro-animations on hover and state transitions, subtle purple/cyan gradients on key UI elements

### 10.2 Page Layout (Top to Bottom)

The layout is a single-page app. All sections stack vertically in this order:

1. Header — App name "ReelScribe" centered, tagline below it
2. URL input row — Full-width text input with a purple "Transcribe" button on the right
3. File upload zone — Dashed border card, drag & drop target, file icon centered, supported formats listed as pills (MP3, MP4, WAV, MOV, WEBM, M4A)
4. Options row — AI Model dropdown on the left (with "Recommended" badge on default selection), Include Timestamps toggle on the right
5. Video info + progress card — Appears after URL is submitted. Shows video thumbnail (left), title, channel, view count (right of thumbnail), and a horizontal progress bar below with percentage and cancel (X) button
6. Transcript result section — "Transcript Result" heading on the left, "Transcribe Another" button on the right. Below: editable transcript text area (monospace, readable line height). Below that: copy buttons (Copy Text, Copy with Timestamps, Copy JSON) on the left, download buttons (TXT, SRT, VTT) on the right.
7. Footer — "Built on Whisper AI" on the left, "Completely free · No signup required" on the right

### 10.3 Remix Studio & Library specifics
- Tab bar: glass, purple active
- Library: glass cards grid
- Emotion pills: cyan glow
- Google Drive button: purple outline
- All matches existing dark/light mode

### 10.4 Component Details

URL input: Large, full-width, dark glassmorphism background, purple-bordered on focus, placeholder text "Paste YouTube, Instagram Reel, or TikTok URL here..."

File upload zone: Dashed border, subtle glassmorphism card, file icon centered, format pills below the label. Highlights purple on drag-over.

Model dropdown: Styled select with dark background. Default option shows "Whisper Large v3" with a yellow/amber "Recommended" badge inline.

Timestamps toggle: Cyan toggle switch, label "Include Timestamps" to the left.

Progress bar: Horizontal, full-width within the video card. Purple-to-cyan gradient fill, animated stripes while processing. Percentage shown on the right. Cancel button (X) at the far right.

Blend slider labels clear: 0 = pure sources, 1 = heavy prompt

Transcript area: Dark background, slightly lighter than page background, monospace font, generous padding, editable. Timestamps shown inline if enabled (e.g. [00:00:07]).

Copy buttons: Outlined style, left-aligned group. Download buttons: filled or outlined, right-aligned group.

Toast notifications: Bottom-right corner, glassmorphism card, purple for success, red for errors, auto-dismiss after 4 seconds.

### 10.5 Responsive Behaviour
- Mobile: All rows stack vertically. Buttons go full-width. Transcript area scrollable.
- Tablet and above: Layout as described above.

### 10.6 Dark Mode (Default)

- Page background: #0F0F13
- Card/surface background: #1A1A24 with white border at 10% opacity and backdrop blur
- Primary text: #F1F1F3
- Secondary text: #9090A8
- Input fields: #12121A background, #7C3AED border on focus
- Buttons (primary): #7C3AED background, white text
- Buttons (outline): transparent background, #7C3AED border, #7C3AED text
- Progress bar: #7C3AED to #06B6D4 gradient fill
- Transcript area: #12121A background, #F1F1F3 text
- Toggle switch (active): #06B6D4
- Toast (success): #1A1A24 background, #06B6D4 left border
- Toast (error): #1A1A24 background, #EF4444 left border
- Footer text: #9090A8

### 10.7 Light Mode

- Page background: #F5F5FA
- Card/surface background: #FFFFFF with #E2E2EE border and no backdrop blur
- Primary text: #0F0F13
- Secondary text: #5A5A72
- Input fields: #FFFFFF background, #7C3AED border on focus
- Buttons (primary): #7C3AED background, white text
- Buttons (outline): transparent background, #7C3AED border, #7C3AED text
- Progress bar: #7C3AED to #06B6D4 gradient fill (unchanged)
- Transcript area: #F9F9FC background, #0F0F13 text
- Toggle switch (active): #06B6D4
- Toast (success): #FFFFFF background, #06B6D4 left border
- Toast (error): #FFFFFF background, #EF4444 left border
- Footer text: #5A5A72

---

Purple and cyan stay consistent across both modes. Only the backgrounds, surfaces, and text colors flip.

---

## 11. Future Roadmap (Post-MVP)

- Pro tier at $4-5/month (priority processing, history, bulk upload, API access)
- Local Whisper via WebGPU once browser support matures
- One-click "Summarize with AI"
- Notion / Google Docs export
- Shareable transcript links
- Batch processing

---

**Approved by:** You (the builder)
**Ready for Development**

---