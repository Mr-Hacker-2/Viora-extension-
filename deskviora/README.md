# DeskViora

A desktop port of Viora's agent loop — instead of controlling a browser tab
through a Chrome extension, this controls your *whole screen*: any app, any
window, via real mouse/keyboard input and screenshots.

## What's here

- `actions.py` — the action layer (click, type, drag, scroll, launch apps,
  focus windows, wait_for_idle via screen-diff). Desktop equivalent of
  Viora's `content.js`.
- `agent.py` — the LLM loop: system prompt, planning, execution, and the
  double-check-until-actually-done verification loop with the same dynamic
  round caps and bulk/"all"-task handling as Viora. Desktop equivalent of
  `sidepanel.js`.
- `main.py` — a minimal Tkinter GUI (goal box, run/stop, settings). You can
  swap this for something fancier later without touching the agent logic.
- `config.py` — stores your API key locally.
- `build.spec` — PyInstaller spec to produce a single `deskviora-source.exe`.

## Setup

```
pip install -r requirements.txt
python main.py
```

By default, DeskViora connects to a local OpenAI-compatible NIM server at
`http://localhost:8000/v1/chat/completions`, with model
`wan2.2-animate-2-14b`. No API key is required for local NIM.

Start the NIM server on the host first:

```bash
export LOCAL_NIM_CACHE=~/.cache/nim
mkdir -p "$LOCAL_NIM_CACHE"
chmod 777 "$LOCAL_NIM_CACHE"
docker run -it --rm --name=nim-server \
  --runtime=nvidia --gpus all \
  -p 8000:8000 \
  -v "$LOCAL_NIM_CACHE:/opt/nim/.cache/" \
  nvcr.io/nim/wan-ai/wan2.2-animate-2-14b:latest
```

The container must expose an OpenAI-compatible `/v1/chat/completions`
endpoint and return a chat response containing `choices[0].message.content`.
The selected model must accept the screenshot image sent by the agent. Verify
the model identifier with `http://localhost:8000/v1/models` if the container
uses a different name.

For a compatible remote provider, enter its key in Settings and override the
connection with environment variables before starting the app:

```bash
export VIORA_API_BASE=https://example.invalid/v1/chat/completions
export VIORA_MODEL=your-vision-model
export VIORA_API_KEY=your-key
python main.py
```

## Building the .exe

**Important: PyInstaller builds for the OS it runs on.** I wrote and
syntax-checked all of this code here, but I can't produce a real Windows
`.exe` binary from this Linux environment — PyInstaller has to actually run
on Windows to produce a Windows executable.

### Option A — no Windows machine needed (recommended)
This repo includes `.github/workflows/build-exe.yml`, which builds the
`.exe` for you on GitHub's free Windows runner:
1. Create a new GitHub repo and push this folder to it (or use GitHub's
   "upload files" web UI if you don't want to use git directly).
2. Go to the repo's **Actions** tab. The workflow runs automatically on
   push — or click **Run workflow** to trigger it manually.
3. When it finishes (a couple of minutes), open the completed run and
   download the **deskviora-source.exe** artifact — that's your `.exe`, built
   on a real Windows machine, ready to run.

### Option B — you have access to a Windows machine/VM
1. Copy this folder over.
2. `pip install -r requirements.txt`
3. `pyinstaller build.spec`
4. Your executable is at `dist/deskviora-source.exe` — a single file, no install
   needed, no console window behind the GUI.

## Safety notes — read this before running it unattended

This app can genuinely do anything you could do with your mouse and
keyboard — click through any app, type into anything, close windows, launch
programs. A few things worth knowing:

- **PyAutoGUI's failsafe is on** — slam your mouse to any screen corner and
  it aborts immediately mid-action. Good habit to know before you let it run
  a long task.
- **It has no concept of "this app is dangerous, this one isn't."** It'll
  click Delete/Send/Submit in whatever's on screen, including things that
  aren't the browser. Don't leave sensitive windows (banking, admin panels)
  open on screen during a run unless the task genuinely needs them.
- **Unlike the browser extension, there's no DOM to read** — it's working
  purely from pixels, so it's more error-prone on cluttered screens or tiny
  UI elements. Bigger, cleaner target windows work better.
- Consider running it in a **separate Windows user account or VM** if
  you're going to give it long, unattended, multi-round tasks — same logic
  as not giving a new employee your admin password on day one.

## What's simplified vs. the full Viora feature set

To keep this a working first version rather than a half-finished giant one,
I left out a few things from the browser extension that don't have a clean
desktop equivalent yet — happy to add any of these if you want them:

- Undo (the extension can revert a step; there's no generic "undo a click"
  on the desktop)
- The 100+ selector-fallback strategy engine (there's no selector to fall
  back on — desktop clicking is coordinate-based)
- OCR-based text reading (right now it relies on the vision model reading
  the screenshot directly, which works but is slower/costlier than
  extracting real text where possible — I can wire in an OCR pass for
  faster/cheaper text-heavy tasks)
- The finish-alarm/notification toggle from Viora v4.3
