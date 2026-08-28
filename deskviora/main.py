"""
DeskViora — a minimal desktop shell around agent.py.
Run with: python main.py
Build into an .exe with: pyinstaller build.spec  (see README.md)
"""

import queue
import threading
import tkinter as tk
from tkinter import scrolledtext, simpledialog, messagebox

import agent
import config

UPDATE_QUEUE: "queue.Queue[str]" = queue.Queue()
stop_event = threading.Event()
worker_thread = None


def on_update(text: str):
    UPDATE_QUEUE.put(text)


def stop_flag() -> bool:
    return stop_event.is_set()


def run_agent_thread(goal: str):
    try:
        agent.run_task(goal, on_update, stop_flag)
    except Exception as e:
        on_update(f"✗ Error: {e}")
    finally:
        UPDATE_QUEUE.put("__DONE__")


class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("DeskViora — full-desktop automation")
        self.geometry("640x560")
        self.configure(bg="#1e1e24")

        top = tk.Frame(self, bg="#1e1e24")
        top.pack(fill="x", padx=10, pady=8)

        self.entry = tk.Entry(top, font=("Segoe UI", 11))
        self.entry.pack(side="left", fill="x", expand=True, ipady=6)
        self.entry.bind("<Return>", lambda e: self.start_task())

        self.run_btn = tk.Button(top, text="Run", command=self.start_task, bg="#4f7cff", fg="white")
        self.run_btn.pack(side="left", padx=(6, 0))

        self.stop_btn = tk.Button(top, text="Stop", command=self.stop_task, bg="#ff5c5c", fg="white")
        self.stop_btn.pack(side="left", padx=(6, 0))

        settings_btn = tk.Button(top, text="⚙", command=self.open_settings)
        settings_btn.pack(side="left", padx=(6, 0))

        self.log = scrolledtext.ScrolledText(self, bg="#12121a", fg="#e6e6f0", wrap="word", font=("Consolas", 10))
        self.log.pack(fill="both", expand=True, padx=10, pady=(0, 10))
        self.log.insert("end", "Type a goal below and press Run. DeskViora will screenshot your "
                                "whole screen and control mouse/keyboard/windows to do it.\n\n"
                                "Move your mouse to a screen corner at any time to abort (PyAutoGUI failsafe).\n\n")
        self.log.config(state="disabled")

        self.after(150, self.poll_queue)

        cfg = config.load()
        if cfg.get("api_base", "").startswith("http://localhost") and not cfg.get("api_key"):
            self.append_log("Using local NIM server without an API key.")

    def append_log(self, text: str):
        self.log.config(state="normal")
        self.log.insert("end", text + "\n")
        self.log.see("end")
        self.log.config(state="disabled")

    def poll_queue(self):
        try:
            while True:
                item = UPDATE_QUEUE.get_nowait()
                if item == "__DONE__":
                    self.run_btn.config(state="normal")
                else:
                    self.append_log(item)
        except queue.Empty:
            pass
        self.after(150, self.poll_queue)

    def start_task(self):
        goal = self.entry.get().strip()
        if not goal:
            return
        cfg = config.load()
        self.append_log(f"\n> {goal}")
        self.entry.delete(0, "end")
        stop_event.clear()
        self.run_btn.config(state="disabled")
        global worker_thread
        worker_thread = threading.Thread(target=run_agent_thread, args=(goal,), daemon=True)
        worker_thread.start()

    def stop_task(self):
        stop_event.set()
        self.append_log("(stop requested)")

    def open_settings(self):
        cfg = config.load()
        key = simpledialog.askstring(
            "Settings", "API key (leave blank for local NIM):",
            initialvalue=cfg.get("api_key", ""), show="*"
        )
        if key is not None:
            cfg["api_key"] = key.strip()
            config.save(cfg)
            self.append_log("Settings saved.")


if __name__ == "__main__":
    App().mainloop()
