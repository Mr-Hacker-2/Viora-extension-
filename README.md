<div align="center">

<img src="https://img.shields.io/badge/Viora-AI%20Extension-blueviolet?style=for-the-badge&logo=microsoftedge&logoColor=white" alt="Viora Extension"/>

# 🌐 Viora Extension

> **An AI-powered browser extension for Microsoft Edge**

[![GitHub stars](https://img.shields.io/github/stars/Mr-A-Hacker/Viora-extension-?style=flat-square&color=gold)](https://github.com/Mr-A-Hacker/Viora-extension-)
[![Follow me](https://img.shields.io/badge/Follow-%40Mr--A--Hacker-blue?style=flat-square&logo=github)](https://github.com/Mr-A-Hacker)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

</div>

---

## 🎯 Target Package

The final release build is:

- `viora-extension-6-1-😎-Best-VR.zip`

This build is intended to package a premium AI browser automation experience with:

- Integrated AI suite with free-access and premium-ready model routing
- Multi-provider model support for reasoning, code generation, image generation, and multimodal automation
- Refined UI/UX with polished sidepanel, settings, and model-selection flows
- Production-ready packaging and deployment flow for direct GitHub repository publishing

---

## ⭐ Support the Project

If you find Viora useful, please consider **starring ⭐ this repo** and **following me** on GitHub — it really helps!

👉 **[Follow @Mr-A-Hacker on GitHub](https://github.com/Mr-A-Hacker)**

---

## 📦 Installation Guide

Follow these steps carefully to install the Viora Extension manually in Microsoft Edge.

---

### Step 1 — Choose Your Model Pack & Download

1. Go to the **[Releases Page](https://github.com/Mr-A-Hacker/Viora-extension-/releases)**
2. Pick the model package that suits your needs
3. Click the `.zip` file to download it

> 💡 **Tip:** For most users, the recommended choice is the most complete release in the list below.

---

### Step 2 — Unzip the File

Once downloaded, extract the `.zip` file:

- **Windows:** Right-click the `.zip` → **Extract All...** → Choose a folder → Click **Extract**
- **Mac:** Double-click the `.zip` file — it extracts automatically
- **Linux:** Run `unzip viora-extension.zip -d viora-extension`

> ⚠️ **Important:** Remember where you extracted it — you'll need this folder in Step 4.

---

### Step 3 — Enable Developer Mode in Edge

1. Open Microsoft Edge
2. In the address bar, type:

   ```
   edge://extensions/
   ```

   and press **Enter**

3. In the top-right corner of the Extensions page, toggle **Developer mode** to **ON**

   ![Developer Mode Toggle](https://img.shields.io/badge/Developer%20Mode-ON-brightgreen?style=flat-square)

---

### Step 4 — Load the Extension

1. Click the **"Load unpacked"** button that appears after enabling Developer mode
2. A file browser will open — navigate to the folder you extracted in Step 2
3. Select the **model package folder** (the root folder of the extracted extension)
4. Click **Select Folder**

---

### ✅ Done!

Viora should now appear in your Edge extensions list and toolbar.

```
edge://extensions/  →  You should see Viora listed and active ✓
```

## Local NIM Brain

The `viora-extension-6-1-😎-Best-VR.zip` build is configured to use a local
OpenAI-compatible NIM server by default:

```bash
export LOCAL_NIM_CACHE=~/.cache/nim
mkdir -p "$LOCAL_NIM_CACHE"
chmod 777 "$LOCAL_NIM_CACHE"
docker run -it --rm --name=nim-server \
   --runtime=nvidia --gpus all -p 8000:8000 \
   -v "$LOCAL_NIM_CACHE:/opt/nim/.cache/" \
   nvcr.io/nim/wan-ai/wan2.2-animate-2-14b:latest
```

Load the ZIP in Edge after starting the container. The server must provide
`/v1/chat/completions` and accept the screenshot image sent by Viora.

### One-click startup

- **Windows:** double-click `start-viora-nim.bat`.
- **Linux:** double-click `start-viora-nim.sh` or run `./start-viora-nim.sh`.

The launcher runs NIM in the background and reuses the `nim-server` container
if it already exists. Docker Desktop must be running on Windows, with NVIDIA
GPU support enabled.

---

## 📦 Model Pack Overview

Each ZIP file in this repository is a packaged Viora extension build. They are organized by release stage so you can choose the one that fits your setup best.

| Model package | What it is | Best for |
|--------|---------|----------|
| Viora-Model-01-Legacy.zip | The earliest release with the original structure. | Testing the first experience or using an older build. |
| Viora-Model-02-Improved.zip | A small step forward with a cleaner layout and better packaging. | Users who want a simple upgrade from the old build. |
| Viora-Model-03-Expanded.zip | A more feature-rich build with broader script coverage. | People who want more functionality without moving to the newer 4.x line. |
| Viora-Model-04.0-Core.zip | The first major 4.x release with stronger sidepanel and content logic. | Users wanting a more capable foundation. |
| Viora-Model-04.2-Polished.zip | A refined 4.x build with updated UI and settings structure. | Best balance of stability and polish. |
| Viora-Model-04.3-Complete.zip | The most complete and latest general-purpose release in the main line. | Recommended choice for most users. |
| Viora-Model-04.4-Styled.zip | A styled variant of the newer 4.x family with visual refinements. | Users who want a more polished presentation. |
| Viora-Model-04.5-Styled.zip | A later styled release with continued cleanup and presentation updates. | Those who prefer the newest visual styling. |
| Viora-Model-04.6-Styled.zip | The newest styled package in the lineup. | Users who want the latest packaged appearance and layout. |

✅ Recommended download: Viora-Model-04.3-Complete.zip

> If you want a slightly older but still reliable option, choose Viora-Model-04.2-Polished.zip.

### Quick recommendations
- Want the original experience: Viora-Model-01-Legacy.zip
- Want a simple upgrade: Viora-Model-02-Improved.zip
- Want more features: Viora-Model-03-Expanded.zip
- Want the best all-around choice: Viora-Model-04.3-Complete.zip

---

## 🔧 Troubleshooting

| Problem | Solution |
|--------|----------|
| Extension not showing up | Make sure you selected the correct inner folder |
| "Load unpacked" button missing | Ensure Developer Mode is toggled **ON** |
| Extension shows errors | Try re-downloading and re-extracting the zip |
| Edge asks for permissions | Click **Allow** to grant necessary permissions |

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!
Feel free to check the [Issues page](https://github.com/Mr-A-Hacker/Viora-extension-/issues).

---

## 💬 Stay Connected

<div align="center">

Made with ❤️ by **[Mr-A-Hacker](https://github.com/Mr-A-Hacker)**

[![Follow on GitHub](https://img.shields.io/badge/Follow%20me%20on-GitHub-black?style=for-the-badge&logo=github)](https://github.com/Mr-A-Hacker)

*If this project helped you, don't forget to drop a ⭐ star — it means the world!*

</div>
