"""
The agent brain: talks to a vision-capable LLM, gets back a plan, executes it
via actions.py, then double-checks its own work before calling anything done.
This is a Python port of Viora's sidepanel.js loop, adapted for full-desktop
control instead of DOM control.
"""

import json
import re
import time
from dataclasses import dataclass, field
from typing import Callable, Optional

import requests

import actions
import config

DEFAULT_MAX_ROUNDS = 6
EXTENDED_MAX_ROUNDS = 20

EXTENDED_ROUND_GOAL_PATTERNS = re.compile(
    r"talk(ing)? to (another|the) ai|communicate with|keep (talking|going|iterating)|"
    r"until (it'?s|it is|everything is) (done|ready|finished|complete)|every question|"
    r"all questions|multi[- ]?page|iterat(e|ive|ing)|back and forth|no bugs|"
    r"until (the )?app is ready|build (the|an|a) app|fix (all )?bugs|delete (all|the) |"
    r"clear (out|all)|clean up|remove (all|the) |empty (the |my )?(spam|trash|inbox)|"
    r"unsubscribe from|all (of )?(my|the) (spam|emails|messages|notifications)",
    re.IGNORECASE,
)

SYSTEM_PROMPT = """You are DeskViora, a full-desktop automation agent. You control the ENTIRE
screen — any app, any window — not just a browser. You see the screen via screenshots
and act using mouse/keyboard primitives. You ALWAYS produce an action_plan and execute
what the user asks. You never refuse or ask the user to do something manually unless
you've genuinely hit a wall (see NEEDS_USER below).

## ACTION CATALOG
{"type":"click","x":123,"y":456}
{"type":"double_click","x":123,"y":456}
{"type":"right_click","x":123,"y":456}
{"type":"drag","x1":10,"y1":10,"x2":200,"y2":10}
{"type":"type","text":"hello world"}
{"type":"press_key","key":"enter"}
{"type":"hotkey","keys":["ctrl","c"]}
{"type":"scroll","amount":-500}   // negative = down, positive = up
{"type":"launch_app","path":"notepad.exe"}
{"type":"focus_window","title":"Gmail"}   // brings a window matching this title to front
{"type":"list_windows"}
{"type":"wait_for_idle","idleMs":900,"timeout":30000}   // wait for the screen to stop changing (streaming replies, loading lists) before you screenshot/act again
{"type":"wait","ms":1000}
{"type":"screenshot"}

Coordinates are screen pixels, (0,0) at the top-left. Read them carefully off the
screenshot you're shown — a click a few pixels off a small button or checkbox will miss.

## TASK SCOPE — ONE ITEM VS. "ALL"
Before planning, decide: does the request target ONE specific, named thing, or a
CATEGORY/ALL matching things (plural nouns, "all", "every", "these", a type/category
name like "spam" or "unread files" with no specific identifier)? A category means
repeat until none remain — not "handle the first one and stop." A specific named item
("close the Notepad window with 'draft.txt' in the title") means just that one.

## BULK / "ALL" TASKS
1. Look for a bulk mechanism first (select-all, a "clear all" button) — always better
   than one-by-one.
2. If you just searched/filtered, wait_for_idle before selecting/acting — a results
   list that hasn't finished loading yet will make you miss items.
3. If no bulk mechanism exists, loop: act on one, screenshot, check if the category
   is now empty or the list shrank, repeat. Don't stop after the first success.
4. Before declaring done on a category/"all" task, confirm it's actually EMPTY — one
   handled item is not a finish line for a plural request.

## SCROLLING
If you can't see the whole window/list, scroll before deciding you've seen everything.
Prefer reading dialog/window text carefully in the screenshot over guessing.

## TALKING TO ANOTHER APP/AI
Type the message, send it, then wait_for_idle before reading the reply — don't
screenshot mid-stream. Read the reply fully and check it against the actual goal
before deciding anything is done. If it falls short, send ONE specific follow-up,
not a vague "continue," and repeat.

## OUTPUT FORMAT
Respond with ONLY this JSON (no prose before/after) when proposing actions:
{"type":"action_plan","steps":[{"type":"click","x":1,"y":2,"description":"..."}, ...]}
Batch everything you can see and know how to do on the current screen into one plan.
Only stop early to re-screenshot if you genuinely can't tell what to do next.
"""

VERIFY_SUFFIX_TEMPLATE = """DOUBLE-CHECK PROTOCOL — round {round} of up to {cap}:
1. Decide exactly what "done" means for this specific goal (a category/"all" task
   means the category is empty; a conversation means the other side's reply actually
   answers the request; a form means it's genuinely submitted, not just filled).
2. Look at the screenshot for evidence it's actually done: confirmation dialogs,
   empty lists, a reply that addresses the request — not just "the click didn't error."
3. Be persistent — if round 1 didn't fully work, try a genuinely different approach,
   don't repeat the same click. Only give up if this is truly outside automation
   (needs a password/2FA you don't have, a judgment call only the user can make, or
   you've hit the exact same wall repeatedly with no new ideas).
{final_round_note}
End with exactly these lines:
[TASK_STATUS: VERIFIED_COMPLETE | INCOMPLETE | NEEDS_USER]
[TASK_REASON: one concrete sentence — name the actual window/field/remaining item]
If INCOMPLETE and not the final round, you MUST also include a fresh action_plan JSON
block with concrete next steps — restating the problem with no new steps is not
allowed and will be treated as a dead end.
"""


def get_round_cap(goal: str) -> int:
    return EXTENDED_MAX_ROUNDS if EXTENDED_ROUND_GOAL_PATTERNS.search(goal) else DEFAULT_MAX_ROUNDS


def call_llm(messages: list) -> str:
    cfg = config.load()
    headers = {"Content-Type": "application/json"}
    if cfg.get("api_key"):
        headers["Authorization"] = f"Bearer {cfg['api_key']}"
    resp = requests.post(
        cfg["api_base"],
        headers=headers,
        json={
            "model": cfg["model"],
            "max_tokens": 2000,
            "messages": messages,
        },
        timeout=120,
    )
    resp.raise_for_status()
    data = resp.json()
    return data["choices"][0]["message"]["content"]


def extract_action_plan(text: str) -> Optional[dict]:
    # Find the first {"type":"action_plan" ... } JSON block, tolerant of
    # leading/trailing prose around it.
    start = text.find('"action_plan"')
    if start == -1:
        return None
    brace = text.rfind("{", 0, start)
    if brace == -1:
        return None
    depth = 0
    for i in range(brace, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                try:
                    plan = json.loads(text[brace:i + 1])
                    if plan.get("type") == "action_plan":
                        return plan
                except Exception:
                    return None
    return None


def extract_task_status(text: str):
    status_m = re.search(r"\[TASK_STATUS:\s*(VERIFIED_COMPLETE|INCOMPLETE|NEEDS_USER)\s*\]", text, re.I)
    reason_m = re.search(r"\[TASK_REASON:\s*([^\]]+)\]", text, re.I)
    status = status_m.group(1).upper() if status_m else None
    reason = reason_m.group(1).strip() if reason_m else ""
    cleaned = re.sub(r"\[TASK_STATUS:[^\]]*\]", "", text)
    cleaned = re.sub(r"\[TASK_REASON:[^\]]*\]", "", cleaned).strip()
    return status, reason, cleaned


@dataclass
class TaskState:
    goal: str
    round: int = 1
    round_cap: int = DEFAULT_MAX_ROUNDS
    history: list = field(default_factory=list)
    stopped: bool = False


def run_task(goal: str, on_update: Callable[[str], None], stop_flag: Callable[[], bool]):
    """Runs a goal to completion (or a real blocker), calling on_update(text)
    for every user-visible message along the way. stop_flag() lets the UI
    interrupt a run in progress."""
    state = TaskState(goal=goal, round_cap=get_round_cap(goal))
    on_update(f"Starting: {goal}")

    shot = actions.screenshot_b64()
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": [
            {"type": "text", "text": f"GOAL: {goal}\n\nHere's the current screen. Propose an action_plan."},
            {"type": "image_url", "image_url": {"url": shot}},
        ]},
    ]

    while not state.stopped and state.round <= state.round_cap:
        if stop_flag():
            on_update("Stopped by user.")
            return

        reply = call_llm(messages)
        plan = extract_action_plan(reply)
        messages.append({"role": "assistant", "content": reply})

        if not plan:
            on_update(f"(no action plan produced — treating as a status update)\n{reply}")
            return

        steps = plan.get("steps", [])
        on_update(f"Round {state.round}/{state.round_cap}: running {len(steps)} step(s).")
        completed = 0
        for step in steps:
            if stop_flag():
                on_update("Stopped by user.")
                return
            on_update(f"  → {step.get('description', step.get('type'))}")
            result = actions.execute(step)
            if not result.success:
                on_update(f"    ✗ {result.message}")
                break
            completed += 1
            time.sleep(0.2)

        # Re-screenshot and ask for a verdict
        time.sleep(0.4)
        shot = actions.screenshot_b64()
        final_note = "" if state.round < state.round_cap else \
            "This is the FINAL round. If it still isn't done, do not produce another action_plan — respond NEEDS_USER."
        verify_prompt = VERIFY_SUFFIX_TEMPLATE.format(round=state.round, cap=state.round_cap, final_round_note=final_note)
        messages.append({"role": "user", "content": [
            {"type": "text", "text": f"Ran {completed}/{len(steps)} steps. Here's the screen now.\n\n{verify_prompt}"},
            {"type": "image_url", "image_url": {"url": shot}},
        ]})

        verdict_reply = call_llm(messages)
        messages.append({"role": "assistant", "content": verdict_reply})
        status, reason, cleaned = extract_task_status(verdict_reply)
        next_plan = extract_action_plan(verdict_reply)

        if status == "VERIFIED_COMPLETE":
            on_update(f"✓ Done — {reason or cleaned}")
            return
        if status == "NEEDS_USER":
            on_update(f"⚠ Needs you — {reason or cleaned}")
            return
        if next_plan:
            plan = next_plan
            state.round += 1
            continue

        # INCOMPLETE with no new plan — nudge once more automatically rather
        # than stalling, same fix as Viora's sidepanel.js.
        on_update(f"↻ Still checking ({reason or 'no clear verdict yet'}) — looking again.")
        state.round += 1
        messages.append({"role": "user", "content": (
            f"Still incomplete after the last check: \"{reason}\" — that's what needs fixing now. "
            f"You MUST include a concrete action_plan this time, not another description."
        )})

    on_update(f"Stopped after {state.round_cap} rounds without a clear finish. Last known state: {reason if 'reason' in dir() else 'unknown'}")
