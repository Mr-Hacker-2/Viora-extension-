"""
Local settings storage for DeskViora.
Keeps the model connection and a couple of preferences in a small JSON file
next to the executable (or in the user's home folder if that's not writable).
"""

import json
import os
import sys

APP_NAME = "DeskViora"


def _config_dir() -> str:
    """Pick a writable place to store settings, next to the exe if possible."""
    if getattr(sys, "frozen", False):
        base = os.path.dirname(sys.executable)
    else:
        base = os.path.dirname(os.path.abspath(__file__))
    try:
        test_path = os.path.join(base, ".write_test")
        with open(test_path, "w") as f:
            f.write("ok")
        os.remove(test_path)
        return base
    except Exception:
        # Fall back to the user's home directory if the exe folder is
        # read-only (e.g. installed under Program Files).
        home = os.path.join(os.path.expanduser("~"), f".{APP_NAME.lower()}")
        os.makedirs(home, exist_ok=True)
        return home


CONFIG_PATH = os.path.join(_config_dir(), "settings.json")

DEFAULTS = {
    "api_key": "",
    "model": "wan2.2-animate-2-14b",
    "api_base": "http://localhost:8000/v1/chat/completions",
    "screenshot_scale": 1.0,   # downscale screenshots before sending, for cost/speed
    "confirm_before_typing_sensitive": True,
}


def load() -> dict:
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
            merged = dict(DEFAULTS)
            merged.update(data)
            if data.get("api_base") == "https://openrouter.ai/api/v1/chat/completions":
                merged["api_base"] = DEFAULTS["api_base"]
            if data.get("model") == "anthropic/claude-sonnet-4.5":
                merged["model"] = DEFAULTS["model"]
            return _apply_environment(merged)
        except Exception:
            pass
    return _apply_environment(dict(DEFAULTS))


def _apply_environment(cfg: dict) -> dict:
    """Allow a packaged app to select a different compatible server."""
    cfg["api_base"] = os.environ.get("VIORA_API_BASE", cfg["api_base"])
    cfg["model"] = os.environ.get("VIORA_MODEL", cfg["model"])
    cfg["api_key"] = os.environ.get("VIORA_API_KEY", cfg["api_key"])
    return cfg


def save(cfg: dict) -> None:
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2)
