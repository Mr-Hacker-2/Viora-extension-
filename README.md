<div align="center">

![Viora Extension banner](docs/viora-banner.svg)

# Viora Extension

### Your AI workspace, right in your browser.

Get AI assistance for everyday questions, coding, math, research, and creative tasks—all from a browser extension.

[**Download the latest package**](https://github.com/Mr-Hacker-2/Viora-extension-/blob/main/viora-extension-7_22_0.zip) · [Roadmap](docs/ROADMAP.md) · [Report a bug](https://github.com/Mr-Hacker-2/Viora-extension-/issues)

![Project feature overview](docs/viora-features.svg)

</div>

> **Project note:** Viora is actively evolving. Features depend on the package version, provider availability, and your configuration. The roadmap and project notes describe goals, not a guarantee that every feature is already implemented.

## Contents

- [What is Viora?](#what-is-viora)
- [Highlights](#highlights)
- [Get started](#get-started)
- [Configure AI providers](#configure-ai-providers)
- [Privacy and security](#privacy-and-security)
- [Troubleshooting](#troubleshooting)
- [Project files](#project-files)
- [Roadmap and contributions](#roadmap-and-contributions)

## What is Viora?

Viora Extension is a browser-based AI assistant project designed to make helpful tools accessible without leaving your current browsing workflow. Depending on the installed build, you may be able to use it for explanations, programming help, math, web research, and creative tasks.

The goal is a clean, practical AI workspace that can grow over time—with clear source links where supported and optional integrations for more advanced capabilities.

## Highlights

- **AI assistance** — ask questions and get help understanding unfamiliar topics.
- **Coding support** — use AI help to explain code, investigate errors, and work through programming tasks.
- **Math and learning** — get step-by-step explanations when the installed model and interface support them.
- **Web research** — review source links and citations when they are provided by the build.
- **Creative tools** — image-generation and other model integrations may be available when implemented and configured.
- **An evolving project** — check the [roadmap](docs/ROADMAP.md) for planned improvements.

These are project use cases, not a promise that every feature is present in every downloadable package.

## Get started

### 1. Download and extract

Download the latest package currently listed in the repository:

**[Download Viora Extension 7.22.0 (ZIP)](https://github.com/Mr-Hacker-2/Viora-extension-/blob/main/viora-extension-7_22_0.zip)**

Extract the ZIP file into a folder. Browsers load the extracted extension folder, not the ZIP itself.

### 2. Open your browser's extensions page

- **Google Chrome:** enter `chrome://extensions` in the address bar.
- **Microsoft Edge:** enter `edge://extensions` in the address bar.

### 3. Load the extension

1. Enable **Developer mode**.
2. Select **Load unpacked**.
3. Choose the extracted folder that directly contains `manifest.json`.
4. If the browser displays an error, check the message on the extensions page before continuing.

### 4. Open Viora

Find Viora in the browser's extensions menu and pin it to your toolbar if you want quick access. Open the extension and follow any setup instructions displayed by your installed version.

**Tip:** If the selected folder does not contain `manifest.json`, you may have selected the wrong folder level. Open the extracted folder and look for the directory containing that file.

## Configure AI providers

Some capabilities may require a supported AI provider, model selection, or API key. The project notes mention integrations such as DeepSeek, FLUX, and NVIDIA Nemotron; actual availability depends on the code and configuration in your installed package.

1. Open Viora's settings, if available in your build.
2. Follow the provider's official setup instructions.
3. Select a supported model and save the configuration.
4. Try a simple prompt to confirm the setup works.

### Keep API keys private

- Get credentials directly from the provider's official website.
- Enter keys only through a supported settings interface or a documented local configuration method.
- **Never publish API keys** in this README, source files, screenshots, issues, or commits.
- If a key was committed or exposed, revoke it with the provider and create a replacement. Removing it from the latest files alone does not remove it from Git history.
- Check provider pricing, rate limits, data policies, and terms before use. A tool or extension being free does not mean every API request is free.

Any example or redacted credential in project notes should be treated as a placeholder—not as a usable key.

## Privacy and security

AI extensions may send prompts, files, or other content to external services depending on how they are implemented and configured. Before using Viora:

- Review the browser permissions requested by the extension.
- Read the privacy policy and terms of any AI provider you connect.
- Avoid sending passwords, private keys, personal records, or confidential work to AI services.
- Only install packages you trust, and keep downloaded copies from sources you can verify.

This README does not claim that prompts or files stay on your device; data handling depends on the implementation and connected providers.

## Troubleshooting

<details>
<summary><strong>“Manifest file is missing or unreadable”</strong></summary>

Extract the ZIP first, then choose the folder that directly contains `manifest.json`. Do not select the ZIP file itself.
</details>

<details>
<summary><strong>Viora does not appear in the toolbar</strong></summary>

Open the browser's extensions page, make sure Viora is enabled, and pin it from the extensions menu if desired.
</details>

<details>
<summary><strong>The AI does not respond</strong></summary>

Check your internet connection, selected provider and model, and any required configuration. Verify that your API key is valid and permitted to use the selected model, and check provider usage limits or service status.
</details>

<details>
<summary><strong>A feature, citation, or image tool is missing</strong></summary>

The feature may not exist in your installed package, may require configuration, or may depend on a provider response. Compare your package with the roadmap and project notes before assuming it is available.
</details>

<details>
<summary><strong>The browser reports an extension error</strong></summary>

Open the extensions page and select **Errors** or **Details** for Viora, if available. When reporting the issue, include your browser and version, package version, steps to reproduce, and the error message. Remove all API keys and other secrets from the report.
</details>

## Project files

| Path | Purpose |
| --- | --- |
| `viora-extension-7_22_0.zip` | Latest package currently listed in the repository root |
| `Extentions/` | Older extension package archive(s) |
| `docs/` | Project visuals and documentation, including the roadmap |
| `Idea.txt` | Planning notes and ideas; not a definitive feature specification |
| `README.md` | Setup instructions and project overview |

## Roadmap and contributions

See the [Viora project roadmap](docs/ROADMAP.md) for planned work.

Want to help improve Viora? Contributions and clear bug reports are welcome. Before opening an issue or submitting a change:

1. Describe the problem or improvement clearly.
2. Include reproducible steps and relevant error messages.
3. Test installation in a clean browser profile when possible.
4. Keep documentation aligned with the actual code.
5. Never commit secrets, API keys, or private user data.

[Browse the repository](https://github.com/Mr-Hacker-2/Viora-extension-) · [Open an issue](https://github.com/Mr-Hacker-2/Viora-extension-/issues)

---

<div align="center">

**Viora Extension** · Built to make AI tools easier to reach from your browser.

</div>
