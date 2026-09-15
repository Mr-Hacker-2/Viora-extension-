// Viora Side Panel — Main Logic
// Chat, AI integration, task execution

const SYSTEM_PROMPT = `You are Viora, a browser automation AI. You can see the user's screen, click any element, fill forms, navigate pages, and complete multi-step tasks on any website.

Every user message includes [Current page: URL] and optionally [Page text excerpt] so you always know what site they're on.

RESPOND IN ONE OF TWO WAYS:

── CHAT MODE ──
Use when: a screenshot is attached (describe what you see and offer to help), OR the user is asking a general knowledge question unrelated to their browser.
For general-knowledge / factual questions, prefer an action_plan with a web_search step (see ACTION MODE) so the answer is sourced from the internet. If you truly cannot search, reply in plain text.

── ACTION MODE ──
Use when: the user wants you to do ANYTHING on a website — click, fill, search, navigate, extract, automate, finish a task, etc.
Reply ONLY with this JSON (no text before or after, no code fences):

{"type":"action_plan","title":"Task title","emoji":"🖱️","steps":[
  {"type":"screenshot","description":"See the page"},
  {"type":"navigate","url":"https://...","description":"Go to ..."},
  {"type":"click","selector":"CSS_SELECTOR","text":"visible button text","description":"what you're clicking"},
  {"type":"fill","selector":"CSS_SELECTOR","value":"text to type","description":"what you're filling"},
  {"type":"extract","selector":"CSS_SELECTOR","description":"get data"},
  {"type":"scroll","toBottom":true,"description":"scroll down"},
  {"type":"wait_for","selector":"CSS_SELECTOR","description":"wait for element"}
]}

SELECTOR STRATEGY — in order of preference:
1. Use [Current page URL] to know what site you're on and write accurate selectors
2. Use [Page text excerpt] to identify real element text for the "text" fallback
3. For Google: search input is "textarea[name='q']" or "input[name='q']", search button text is "Google Search"
4. For forms: use input[name=], input[type=], textarea, select selectors
5. Always include both selector AND text so there are two ways to find the element
6. NEVER prefix an attribute selector with a tag name — use [id='NextButton'] NOT div[id='NextButton']. The element might be a <button>, not a <div>.
7. For survey Next/Submit buttons, ALWAYS use: selector="#NextButton" text="Next" — this covers Qualtrics, SurveyMonkey, and most platforms
8. When using click_at with coordinates from a screenshot, set x and y to the CENTER of the button as seen in the screenshot image
9. NEVER use a bare tag as the selector (e.g. "button", "a", "div", "input"). On real pages like Google Docs there are MANY buttons — a bare tag matches the wrong one. Instead give a SPECIFIC selector (#id, .class, [aria-label=...], [title=...]) whenever possible, and ALWAYS pair it with the exact "text" of the control you mean (e.g. text="Blank document"). If you only know the control by its label, OMIT the selector entirely and just provide the "text" — the click engine will find it by text.

RULES:
- Plans run automatically — make them correct and complete
- If you need to see the page first, start with a screenshot step
- After seeing a screenshot in conversation, use what you observe for precise selectors
- For homework / forms on screen: screenshot → read content → fill in answers step by step
- Chain as many steps as needed to fully complete the task
- When the user asks you to WRITE, TYPE, DRAFT, or CREATE content (e.g. "write about cyber security", "type a summary", "fill in the document"), the plan MUST include a fill step that actually types the content into the target element (the document body div[contenteditable='true'], a textarea, or input). Do NOT stop after just opening the editor — the task is ONLY complete once the requested text is written. Include the real content (a few sentences) in the fill step's "value".
- If [Current page] URL is chrome://, chrome-extension://, about:, or devtools://, do NOT produce an action plan with click/fill steps — those pages are browser-internal and cannot be automated. Instead tell the user in CHAT MODE to navigate to a real website first.
- NEVER say you can't see or interact with a regular website.
- For survey navigation: ALWAYS use {"type":"click","selector":"#NextButton","text":"Next","description":"Click Next"} — never use div[id=...] or coordinate-only steps for navigation buttons.

**EMOJI SUPPORT:**
- Use appropriate emojis to enhance your responses when communicating with users. Common emojis include: 🌐 (global/web), 💻 (computer), 🔍 (search), 💡 (idea), ✅ (done), ❌ (error), ⏳ (waiting), 📸 (screenshot), 🎯 (click), 📝 (fill), 📋 (extract), 🔗 (navigation), ⚙️ (settings), 🌙 (dark mode), ☀️ (light mode), 🎨 (emoji)
- When suggesting actions or confirming completion, use relevant emojis to make your messages more engaging: "Shall I click the 💾 save button?", "I found the 🔍 search box", "Let me extract the 📋 data", "Great! ✅ Task completed"
- For emotional context, use emojis: 😊 (happy/friendly), 😕 (concerned), 😅 (laughing), 💪 (encouraging), ⭐ (important)
- When you need user attention or confirmation: "❓ Would you like me to proceed?", "❓ Need clarification on what you'd like me to do?"

Available step types: navigate, click, click_at, fill, clear, select, check, scroll, extract, extract_links, extract_table, wait_for, hover, press_key, get_page_info, screenshot, web_search
click_at takes {x, y} pixel coordinates from the screenshot and clicks whatever element is at that position.
web_search takes {"type":"web_search","query":"your search terms","engine":"google"} — use this (instead of navigating manually) whenever the user asks a factual/general-knowledge question, asks "what/who/when/why/how" about the real world, or needs up-to-date info from the internet. Viora will open a search results page and collect the result links as Sources that get shown to the user. After a web_search step, answer the user's question using those sources and mention the sources.
CRITICAL: ONLY use the step types listed above. NEVER invent step types like "analyze", "think", "inspect", "read", "observe", "verify", or anything not in the list above. Every step MUST have a "type" field set to one of the listed values. If you want to examine the page, use {"type":"screenshot","description":"See the page"} — there is no separate analyze step.

AUTOMATION OPERATING CONTRACT:
- Decompose complex requests into short, observable steps. Start with screenshot or get_page_info when the page state is unknown.
- After navigation, major clicks, submissions, or dynamic UI changes, verify the result with a screenshot, wait_for, or extraction before continuing.
- If a selector fails, recover using visible text, aria-label, nearby stable attributes, or a fresh screenshot. Do not repeat an identical failed action more than once.
- Never guess destructive actions, purchases, account changes, messages, or submissions. Pause in CHAT MODE immediately before the final irreversible step unless the user explicitly asked for that exact action.
- Keep passwords, payment data, and API keys out of chat replies and extracted results. Ask the user to take over when a secret must be entered.
- Use extract or extract_table for structured results and preserve source links for web_search answers.
- In CHAT MODE, use a small number of natural emojis to convey tone or emotion: celebrate success with ✅ or 🎉, show care with 🙂 or 💡, and signal problems with ⚠️ or 😕. Keep emojis purposeful and never replace important words with them.
- Never claim an action succeeded without evidence; report the exact blocked step and safest next action when recovery fails.`;

// ─── State ────────────────────────────────────────────────────────────────
let apiKey = '';
let model = 'local/wan2.2-animate-2-14b';

const AUTO_MODEL = 'openrouter/auto';
const DEFAULT_LOCAL_MODEL = 'local/wan2.2-animate-2-14b';

const PROVIDER_API_ENDPOINTS = {
  local: 'http://localhost:8000/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  openai: 'https://api.openai.com/v1/chat/completions',
  deepseek: 'https://api.deepseek.com/v1/chat/completions',
  mistralai: 'https://api.mistral.ai/v1/chat/completions',
  nvidia: 'https://integrate.api.nvidia.com/v1/chat/completions',
  huggingface: 'https://router.huggingface.co/v1/chat/completions',
};

const PROVIDER_SUPPORTS_MULTIMODAL = {
  local: true,
  openrouter: true,
  groq: true,
  openai: true,
  deepseek: true,
  mistralai: true,
  nvidia: false,
};

function routingProviderOf(id) {
  if (!id || id === AUTO_MODEL || !id.includes('/')) return 'openrouter';
  const prefix = id.split('/')[0];
  if (prefix === 'local') return 'local';
  if (prefix === 'groq' || prefix === 'nvidia') return prefix;
  if (prefix === 'huggingface') return 'huggingface';
  if (prefix === 'openai-direct') return 'openai';
  if (prefix === 'deepseek-direct') return 'deepseek';
  if (prefix === 'mistralai-direct') return 'mistralai';
  return 'openrouter';
}

function resolveApiKey(stored) {
  const prov = routingProviderOf(model);
  return (stored && (stored['apiKey_' + prov] || stored.apiKey)) || '';
}

let conversationHistory = [];
let currentSessionId = null;
let pendingScreenshot = null;
let activeTask = null;
let stopRequested = false;
let abortController = null;
let autoConfirmSensitive = false;
let lastFailedRequestText = '';
let lastErrorElement = null;
let autoScreenshot = false;
let stepScreenshots = true;
let targetTabId = null;
let targetTabTitle = '';
let targetTabFavicon = '';
let currentGoal = '';

let userPrefs = {
  responseDetail: 'balanced',
  tone: 'friendly',
  responseLanguage: 'auto',
  autoWebSearch: true,
  persistMemory: true,
  retryOnFailure: true,
  maxSteps: 25,
};

// ─── DOM refs ─────────────────────────────────────────────────────────────
const messagesEl = document.getElementById('messages');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const stopInputBtn = document.getElementById('stopInputBtn');
const welcomeEl = document.getElementById('welcome');
const typingIndicator = document.getElementById('typingIndicator');
const typingText = document.getElementById('typingText');
const screenshotBar = document.getElementById('screenshotBar');
const screenshotPreview = document.getElementById('screenshotPreview');
const noKeyNotice = document.getElementById('noKeyNotice');
const onboardingOverlay = document.getElementById('onboardingOverlay');
const onboardingSkip = document.getElementById('onboardingSkip');
const modeBadge = document.getElementById('modeBadge');
const tabPicker = document.getElementById('tabPicker');
const tabPickerList = document.getElementById('tabPickerList');
const tabPickerSearch = document.getElementById('tabPickerSearch');
const tabBadge = document.getElementById('tabBadge');
const tabBadgeFavicon = document.getElementById('tabBadgeFavicon');
const tabBadgeTitle = document.getElementById('tabBadgeTitle');
const tabBadgeClear = document.getElementById('tabBadgeClear');
const workspaceStatus = document.getElementById('workspaceStatus');
const workspaceTarget = document.getElementById('workspaceTarget');

function updateWorkspaceStrip(status = 'Ready for a task') {
  if (workspaceStatus) workspaceStatus.textContent = status;
  if (workspaceTarget) {
    workspaceTarget.textContent = targetTabTitle
      ? `Target: ${targetTabTitle}`
      : 'Active tab · type @ to target another';
    workspaceTarget.title = targetTabTitle || 'The active browser tab will be used';
  }
}

// ─── Run mode (Action / Plan) ──────────────────────────────────────────────
let runMode = 'action'; // 'action' or 'plan'

function applyRunModeUI() {
  const actionBtn = document.getElementById('runModeAction');
  const planBtn = document.getElementById('runModePlan');
  const isPlan = runMode === 'plan';
  if (actionBtn) {
    actionBtn.classList.toggle('active', !isPlan);
    actionBtn.setAttribute('aria-checked', String(!isPlan));
  }
  if (planBtn) {
    planBtn.classList.toggle('active', isPlan);
    planBtn.setAttribute('aria-checked', String(isPlan));
  }
  // Keep the header badge in sync ('actions' == Action mode, 'chat' == Plan mode)
  setBadge(isPlan ? 'chat' : 'actions');
  if (chatInput) {
    chatInput.placeholder = isPlan
      ? "I'll show my reasoning and talk through the plan (type @ to target a tab)"
      : "Tell me what to do on this page… (type @ to target a tab)";
  }
}

function setRunMode(mode) {
  runMode = mode === 'plan' ? 'plan' : 'action';
  applyRunModeUI();
  refreshCardsForMode();
  updateWorkspaceStrip(runMode === 'plan' ? 'Plan mode · review before running' : 'Action mode · ready to execute');
  try { chrome.storage.local.set({ runMode }); } catch (_) {}
}

function refreshCardsForMode() {
  const cards = document.querySelectorAll('.task-card');
  cards.forEach(card => {
    const runBtn = card.querySelector('.btn-run');
    if (!runBtn) return;
    const note = card.querySelector('.plan-only-note');
    if (runMode === 'plan') {
      runBtn.disabled = true;
      runBtn.textContent = 'Run (Action mode)';
      runBtn.title = 'Switch to Action mode to execute';
      if (!note) {
        const n = document.createElement('div');
        n.className = 'plan-only-note';
        n.textContent = 'Plan only — nothing will be opened or controlled. Switch to Action mode to run.';
        card.appendChild(n);
      }
    } else {
      runBtn.disabled = false;
      if (runBtn.dataset.originalHTML) runBtn.innerHTML = runBtn.dataset.originalHTML;
      runBtn.title = '';
      if (note) note.remove();
    }
  });
}

// ─── Theme toggle ──────────────────────────────────────────────────────────
function toggleTheme() {
  const root = document.documentElement;
  const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  root.setAttribute('data-theme', next);
  try { localStorage.setItem('viora-theme', next); } catch (_) {}
}

// ─── History sidebar (open/close only; persistence handled by settings) ─────
function toggleSidebar() {
  const sidebar = document.getElementById('historySidebar');
  if (!sidebar) return;
  sidebar.classList.toggle('open');
}

// ─── Init ──────────────────────────────────────────────────────────────────
async function init() {
  const stored = await chrome.storage.local.get([
    'apiKey', 'model', 'autoScreenshot', 'stepScreenshots', 'runMode',
    'apiKey_openrouter', 'apiKey_groq', 'apiKey_openai', 'apiKey_deepseek', 'apiKey_mistralai', 'apiKey_nvidia', 'apiKey_huggingface',
    'autoConfirmSensitive',
    'responseDetail', 'tone', 'responseLanguage', 'autoWebSearch', 'persistMemory', 'retryOnFailure', 'maxSteps'
  ]);
  model = stored.model || DEFAULT_LOCAL_MODEL;
  apiKey = resolveApiKey(stored);
  autoScreenshot = stored.autoScreenshot === true;
  stepScreenshots = stored.stepScreenshots !== false; // default true
  autoConfirmSensitive = stored.autoConfirmSensitive === true;
  runMode = stored.runMode === 'plan' ? 'plan' : 'action';
  applyUserPrefs(stored);

  if (!apiKey && routingProviderOf(model) !== 'local') {
    noKeyNotice.style.display = 'block';
  } else {
    noKeyNotice.style.display = 'none';
  }

  const { onboardingSeen } = await chrome.storage.local.get(['onboardingSeen']);
  if (!apiKey && routingProviderOf(model) !== 'local' && !onboardingSeen) {
    showOnboarding();
  } else if (!onboardingSeen) {
    // Already has a key (e.g. imported settings) — no need to ever show onboarding.
    chrome.storage.local.set({ onboardingSeen: true });
  }

  setupEventListeners();
  setupOnboardingListeners();
  applyRunModeUI();
  updateWorkspaceStrip(runMode === 'plan' ? 'Plan mode · review before running' : 'Action mode · ready to execute');
  renderHistorySidebar();
}

// ─── First-run onboarding: connect a provider ───────────────────────────────
function showOnboarding() {
  if (onboardingOverlay) onboardingOverlay.style.display = 'flex';
}

function hideOnboarding() {
  if (onboardingOverlay) onboardingOverlay.style.display = 'none';
}

function dismissOnboarding() {
  chrome.storage.local.set({ onboardingSeen: true });
  hideOnboarding();
}

function setupOnboardingListeners() {
  if (onboardingSkip) {
    onboardingSkip.addEventListener('click', dismissOnboarding);
  }
  document.querySelectorAll('.onboarding-provider').forEach(btn => {
    btn.addEventListener('click', () => {
      const provider = btn.dataset.provider;
      chrome.storage.local.set({ onboardingSeen: true });
      chrome.tabs.create({ url: chrome.runtime.getURL(`settings.html?provider=${encodeURIComponent(provider)}`) });
      hideOnboarding();
    });
  });
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type !== 'SENSITIVE_FIELD_DETECTED') return;
  const category = message.fieldCategory || 'sensitive';
  const detail = message.description ? `\n\n${message.description}` : '';
  const allowed = autoConfirmSensitive || window.confirm(`Viora wants to interact with a ${category} field.${detail}\n\nAllow this action?`);
  chrome.runtime.sendMessage({ type: 'SECURITY_CONFIRM', tabId: message.tabId, allowed });
});

// Apply the AI Behavior preferences from storage into the live userPrefs object.
function applyUserPrefs(stored) {
  if (!stored) return;
  if (stored.responseDetail) userPrefs.responseDetail = stored.responseDetail;
  if (stored.tone) userPrefs.tone = stored.tone;
  if (stored.responseLanguage) userPrefs.responseLanguage = stored.responseLanguage;
  if (typeof stored.autoWebSearch === 'boolean') userPrefs.autoWebSearch = stored.autoWebSearch;
  if (typeof stored.persistMemory === 'boolean') userPrefs.persistMemory = stored.persistMemory;
  if (typeof stored.retryOnFailure === 'boolean') userPrefs.retryOnFailure = stored.retryOnFailure;
  if (stored.maxSteps) userPrefs.maxSteps = parseInt(stored.maxSteps) || 25;
}

// Build the user-preference instruction block appended to the system prompt.
function userPrefsPrompt() {
  const langMap = { auto: 'Respond in the same language the user writes in.', en: 'Respond in English.', es: 'Respond in Spanish (Español).', fr: 'Respond in French (Français).', de: 'Respond in German (Deutsch).', pt: 'Respond in Portuguese (Português).', hi: 'Respond in Hindi (हिन्दी).', zh: 'Respond in Chinese (中文).', ja: 'Respond in Japanese (日本語).', ar: 'Respond in Arabic (العربية).' };
  const detailMap = { concise: 'Be CONCISE — short answers, minimal preamble.', balanced: 'Be BALANCED — helpful detail without over-explaining.', detailed: 'Be DETAILED — thorough explanations and context.' };
  const toneMap = { friendly: 'Tone: friendly and approachable.', professional: 'Tone: professional and formal.', casual: 'Tone: casual and relaxed.', concise: 'Tone: concise and clinical.' };
  const search = userPrefs.autoWebSearch
    ? 'For factual / real-world questions, prefer a web_search step so answers are sourced from the internet.'
    : 'Do NOT use web_search unless the user explicitly asks to search the web.';
  return `\n\nUSER PREFERENCES (follow these):\n- ${detailMap[userPrefs.responseDetail] || detailMap.balanced}\n- ${toneMap[userPrefs.tone] || toneMap.friendly}\n- ${langMap[userPrefs.responseLanguage] || langMap.auto}\n- ${search}`;
}

// Live-reload settings when saved from the settings page
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  const PROVIDER_KEY_SLOTS = ['apiKey_openrouter', 'apiKey_groq', 'apiKey_openai', 'apiKey_deepseek', 'apiKey_mistralai', 'apiKey_nvidia', 'apiKey_huggingface'];
  const keyChanged = changes.apiKey || PROVIDER_KEY_SLOTS.some(s => changes[s]);
  if (keyChanged || changes.model) {
    if (changes.model) model = changes.model.newValue || AUTO_MODEL;
    // Re-read all key slots so per-provider keys are picked up
    chrome.storage.local.get(['apiKey', ...PROVIDER_KEY_SLOTS]).then(stored => {
      apiKey = resolveApiKey(stored);
      noKeyNotice.style.display = apiKey ? 'none' : 'block';
      updateWorkspaceStrip(apiKey ? 'Ready for a task' : 'Add a provider key to begin');
      if (apiKey) dismissOnboarding();
    });
  }
  const PREF_KEYS = ['responseDetail', 'tone', 'responseLanguage', 'autoWebSearch', 'persistMemory', 'retryOnFailure', 'maxSteps'];
  if (PREF_KEYS.some(k => changes[k])) {
    chrome.storage.local.get(PREF_KEYS).then(applyUserPrefs);
  }
  if (changes.autoScreenshot)  autoScreenshot  = changes.autoScreenshot.newValue  === true;
  if (changes.stepScreenshots) stepScreenshots = changes.stepScreenshots.newValue !== false;
  if (changes.autoConfirmSensitive) autoConfirmSensitive = changes.autoConfirmSensitive.newValue === true;
  if (changes.chatSessions) renderHistorySidebar();
});

function setupEventListeners() {
  // Send on button click
  sendBtn.addEventListener('click', handleSend);

  // Send on Enter (not Shift+Enter) — but not while the @ tab picker is open
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !isPickerOpen()) {
      e.preventDefault();
      handleSend();
    }
  });

  // Auto-resize textarea
  chatInput.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
    sendBtn.disabled = chatInput.value.trim() === '';
    const counter = document.getElementById('charCounter');
    if (counter) counter.textContent = `${chatInput.value.length} / 4000`;
  });

  // Quick chips
  document.querySelectorAll('.quick-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      chatInput.value = chip.dataset.prompt;
      chatInput.dispatchEvent(new Event('input'));
      handleSend();
    });
  });

  // Screenshot button (header)
  document.getElementById('screenshotBtn').addEventListener('click', captureAndAttach);

  // Attach screen button (input)
  document.getElementById('attachScreenBtn').addEventListener('click', captureAndAttach);

  // Remove screenshot
  document.getElementById('removeScreenshot').addEventListener('click', () => {
    pendingScreenshot = null;
    screenshotBar.style.display = 'none';
    document.getElementById('attachScreenBtn').classList.remove('active');
  });

  // Clear conversation
  document.getElementById('clearBtn').addEventListener('click', clearConversation);

  // Run-mode toggle (Action / Plan)
  const runModeActionBtn = document.getElementById('runModeAction');
  const runModePlanBtn = document.getElementById('runModePlan');
  if (runModeActionBtn) runModeActionBtn.addEventListener('click', () => setRunMode('action'));
  if (runModePlanBtn) runModePlanBtn.addEventListener('click', () => setRunMode('plan'));
  const runModeToggleEl = document.getElementById('runModeToggle');
  if (runModeToggleEl) {
    runModeToggleEl.addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      const next = (e.key === 'ArrowLeft' || e.key === 'Home') ? 'action' : 'plan';
      setRunMode(next);
      const target = document.getElementById(next === 'plan' ? 'runModePlan' : 'runModeAction');
      if (target) target.focus();
    });
  }

  // Theme toggle
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  if (themeToggleBtn) themeToggleBtn.addEventListener('click', toggleTheme);

  // History sidebar toggle / close
  const historyToggleBtn = document.getElementById('historyToggleBtn');
  if (historyToggleBtn) historyToggleBtn.addEventListener('click', toggleSidebar);
  const sidebarCloseBtn = document.getElementById('sidebarCloseBtn');
  if (sidebarCloseBtn) sidebarCloseBtn.addEventListener('click', toggleSidebar);
  const sidebarBackdrop = document.getElementById('sidebarBackdrop');
  if (sidebarBackdrop) sidebarBackdrop.addEventListener('click', toggleSidebar);

  // Pick-element button: the bundled content script does not implement element
  // picking, so disable it to avoid a dead control.
  const pickElementBtn = document.getElementById('pickElementBtn');
  if (pickElementBtn) { pickElementBtn.disabled = true; pickElementBtn.title = 'Element picker unavailable in this build'; pickElementBtn.style.opacity = '0.4'; }

  // ─── @ Tab Picker ────────────────────────────────────────────────────────
  chatInput.addEventListener('input', handleAtMention);
  chatInput.addEventListener('keydown', (e) => {
    if (isPickerOpen()) {
      const items = tabPickerList.querySelectorAll('.tab-picker-item');
      const sel = tabPickerList.querySelector('.tab-picker-item.selected');
      let idx = [...items].indexOf(sel);
      if (e.key === 'ArrowDown') { e.preventDefault(); selectPickerItem(items, Math.min(idx + 1, items.length - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); selectPickerItem(items, Math.max(idx - 1, 0)); }
      else if (e.key === 'Enter' && sel) { e.preventDefault(); sel.click(); }
      else if (e.key === 'Escape') { closeTabPicker(); }
    }
  });

  tabPickerSearch.addEventListener('input', () => renderTabPickerItems(tabPickerSearch.value));

  // Stop button (in input area — cancels AI generation or running task)
  stopInputBtn.addEventListener('click', () => {
    if (abortController) { abortController.abort(); abortController = null; }
    stopRequested = true;
    hideTyping();
  });

  // Clear tab target badge
  tabBadgeClear.addEventListener('click', () => {
    targetTabId = null; targetTabTitle = ''; targetTabFavicon = '';
    tabBadge.style.display = 'none';
    updateWorkspaceStrip();
  });

  // Close picker on outside click
  document.addEventListener('click', (e) => {
    if (!tabPicker.contains(e.target) && e.target !== chatInput) closeTabPicker();
  });
}

// ─── @ Tab Picker Logic ───────────────────────────────────────────────────
let _allTabs = [];

function handleAtMention(e) {
  const val = chatInput.value;
  const cursor = chatInput.selectionStart;
  // Find the last @ before cursor
  const before = val.slice(0, cursor);
  const atIdx = before.lastIndexOf('@');
  if (atIdx !== -1 && !before.slice(atIdx + 1).includes(' ')) {
    const query = before.slice(atIdx + 1);
    openTabPicker(query);
  } else {
    closeTabPicker();
  }
}

function openTabPicker(query) {
  chrome.runtime.sendMessage({ type: 'LIST_TABS' }, (res) => {
    if (!res?.tabs) return;
    _allTabs = res.tabs.filter(t => t.url && !t.url.startsWith('chrome://') && !t.url.startsWith('chrome-extension://'));
    tabPickerSearch.value = query;
    renderTabPickerItems(query);
    tabPicker.style.display = 'flex';
    tabPickerSearch.focus();
  });
}

function renderTabPickerItems(query) {
  const q = (query || '').toLowerCase();
  const filtered = _allTabs.filter(t =>
    !q || t.title?.toLowerCase().includes(q) || t.url?.toLowerCase().includes(q)
  ).slice(0, 10);

  tabPickerList.innerHTML = filtered.length ? '' : '<div style="padding:12px;font-size:12px;color:var(--text-3);text-align:center">No tabs found</div>';

  filtered.forEach((tab, i) => {
    const item = document.createElement('div');
    item.className = 'tab-picker-item' + (i === 0 ? ' selected' : '');
    const domain = (() => { try { return new URL(tab.url).hostname.replace('www.', ''); } catch (_) { return tab.url; } })();
    item.innerHTML = `
      <div class="tab-picker-favicon-wrap">
        ${tab.favIconUrl
          ? `<img class="tab-picker-favicon" src="${tab.favIconUrl}" width="16" height="16">`
          : '<div class="tab-favicon-placeholder"></div>'}
      </div>
      <div class="tab-picker-item-text">
        <div class="tab-picker-item-title">${escapeHtml(tab.title || 'Untitled')}</div>
        <div class="tab-picker-item-url">${escapeHtml(domain)}</div>
      </div>`;
    // BUG FIX: inline onerror="..." on the favicon <img> is blocked by the
    // extension page's CSP (script-src 'self' — no unsafe-inline), so a
    // broken favicon never fell back to the placeholder. Attach in JS instead.
    const favImg = item.querySelector('img.tab-picker-favicon');
    if (favImg) {
      favImg.addEventListener('error', () => {
        const placeholder = document.createElement('div');
        placeholder.className = 'tab-favicon-placeholder';
        favImg.replaceWith(placeholder);
      }, { once: true });
    }
    item.addEventListener('click', () => pickTab(tab));
    tabPickerList.appendChild(item);
  });
}

function selectPickerItem(items, idx) {
  items.forEach((el, i) => el.classList.toggle('selected', i === idx));
}

function pickTab(tab) {
  targetTabId = tab.id;
  targetTabTitle = tab.title || tab.url;
  targetTabFavicon = tab.favIconUrl || '';

  // Remove the @... text from input
  const val = chatInput.value;
  const cursor = chatInput.selectionStart;
  const before = val.slice(0, cursor);
  const atIdx = before.lastIndexOf('@');
  if (atIdx !== -1) {
    chatInput.value = val.slice(0, atIdx) + val.slice(cursor);
    chatInput.selectionStart = chatInput.selectionEnd = atIdx;
  }

  // Show badge
  tabBadgeTitle.textContent = targetTabTitle.length > 40 ? targetTabTitle.slice(0, 40) + '…' : targetTabTitle;
  tabBadgeFavicon.src = targetTabFavicon;
  tabBadgeFavicon.style.display = targetTabFavicon ? '' : 'none';
  tabBadge.style.display = 'flex';
  updateWorkspaceStrip(`Target locked · ${runMode === 'plan' ? 'plan only' : 'actions enabled'}`);
  closeTabPicker();
  chatInput.focus();
}

function closeTabPicker() {
  tabPicker.style.display = 'none';
}

function isPickerOpen() {
  return !!tabPicker && tabPicker.style.display !== 'none';
}

// ─── Send handler ──────────────────────────────────────────────────────────
async function handleSend(retryText = null) {
  const isRetry = typeof retryText === 'string';
  const text = isRetry ? retryText.trim() : chatInput.value.trim();
  if (!text) return;
  if (!apiKey && routingProviderOf(model) !== 'local') {
    noKeyNotice.style.display = 'block';
    return;
  }

  if (isRetry && lastErrorElement) {
    lastErrorElement.remove();
    lastErrorElement = null;
  }
  if (!isRetry) {
    chatInput.value = '';
    chatInput.style.height = 'auto';
  }
  sendBtn.disabled = true;
  hideWelcome();

  // Auto-capture screenshot if setting is on and no screenshot already attached
  if (!isRetry && autoScreenshot && !pendingScreenshot) {
    try {
      const res = await new Promise(resolve =>
        chrome.runtime.sendMessage({ type: 'CAPTURE_SCREENSHOT', tabId: targetTabId }, resolve)
      );
      if (res?.screenshot) {
        pendingScreenshot = res.screenshot;
      }
    } catch (_) {}
  }

  // Add user message
  // Smart auto-screenshot: grab screen for page-related questions if not already attached
  const screenKeywords = /what.*(open|on|see|screen|page|tab)|see.*screen|look at|this page|this tab|help.*with.*this|finish.*this|fill.*this|do this|what is this|what's this|go on|go ahead|continue|keep going|next|proceed|more|another/i;
  // Once any task has run in this conversation (currentGoal gets set the first
  // time a plan starts), treat every follow-up as needing fresh eyes on the
  // page — the AI should look and double-check rather than ask the user to
  // describe what's on screen.
  const wantsFreshLook = currentGoal || screenKeywords.test(text);
  if (!pendingScreenshot && !autoScreenshot && wantsFreshLook) {
    try {
      const res = await new Promise(resolve =>
        chrome.runtime.sendMessage({ type: 'CAPTURE_SCREENSHOT', tabId: targetTabId }, resolve)
      );
      if (res?.screenshot) pendingScreenshot = res.screenshot;
    } catch (_) {}
  }

  if (!isRetry) addUserMessage(text, pendingScreenshot);

  // Grab page context (URL + visible text) to help AI pick accurate selectors
  let pageContext = '';
  if (!isRetry) {
    try {
      const tabInfo = await new Promise(resolve =>
        chrome.runtime.sendMessage({ type: 'GET_TAB_INFO', tabId: targetTabId }, resolve)
      );
      if (tabInfo?.url && !tabInfo.url.startsWith('chrome://')) {
        const pageContent = await new Promise(resolve =>
          chrome.runtime.sendMessage({ type: 'GET_PAGE_CONTENT', tabId: targetTabId }, resolve)
        );
        const pageText = pageContent?.text?.slice(0, 1500) || '';
        pageContext = `\n[Current page: ${tabInfo.url}]${pageText ? '\n[Page text excerpt]: ' + pageText : ''}`;
      }
    } catch (_) {}
  }

  if (!isRetry) {
    // Prepare conversation message
    const providerSupportsMultimodal = !!PROVIDER_SUPPORTS_MULTIMODAL[routingProviderOf(model)];
    let userContent;
    if (pendingScreenshot && providerSupportsMultimodal) {
      userContent = [
        { type: 'image_url', image_url: { url: pendingScreenshot } },
        { type: 'text', text: text + pageContext }
      ];
    } else {
      // NVIDIA (and any non-multimodal provider) cannot receive images — send text only.
      if (pendingScreenshot && !providerSupportsMultimodal) pendingScreenshot = null;
      userContent = pageContext ? text + pageContext : text;
    }
    conversationHistory.push({ role: 'user', content: userContent });

    // Clear screenshot
    pendingScreenshot = null;
    screenshotBar.style.display = 'none';
    document.getElementById('attachScreenBtn').classList.remove('active');
  }

  showTyping('Thinking…');
  updateWorkspaceStrip('Thinking · building the safest next steps');

  try {
    const response = await callAI(conversationHistory);
    hideTyping();
    lastFailedRequestText = '';


    // Extract action plan from anywhere in the response (AI sometimes mixes prose + JSON)
    const { plan, visibleText } = extractActionPlan(response);
    if (plan) {
      conversationHistory.push({ role: 'assistant', content: response });
      // Remember the user's actual request so the follow-up loop knows the FULL
      // goal (e.g. "write about cyber security"), not just this sub-step's title.
      if (text && text.trim()) currentGoal = text.trim();
      if (visibleText) addAssistantMessage(visibleText);
      renderTaskCard(plan);
      updateWorkspaceStrip(runMode === 'plan' ? 'Plan ready · review the steps' : 'Plan ready · starting automation');
      const taskId = document.querySelector('.task-card:last-child')?.id;
      // In Plan mode the assistant MUST NOT control the page or open anything.
      // Only render the plan (with a manual Run button) — never auto-execute.
      if (runMode === 'plan') {
        setBadge('chat');
        if (taskId) {
          const runBtn = document.getElementById(`${taskId}-runBtn`);
          if (runBtn) { runBtn.disabled = true; runBtn.textContent = 'Run (Action mode)'; runBtn.title = 'Switch to Action mode to execute'; }
          const card = document.getElementById(taskId);
          if (card) {
            const badge = document.createElement('div');
            badge.className = 'plan-only-note';
            badge.textContent = 'Plan only — nothing will be opened or controlled. Switch to Action mode to run.';
            card.appendChild(badge);
          }
        }
        return;
      }
      saveCurrentSession();
      setBadge('actions');
      if (taskId) setTimeout(() => startTask(taskId, plan), 120);
      return;
    }

    // Regular text response
    conversationHistory.push({ role: 'assistant', content: response });
    addAssistantMessage(response);
    setBadge('chat');
    renderSources();
    saveCurrentSession();

  } catch (err) {
    hideTyping();
    if (err.name === 'AbortError') return; // User hit stop — no error message needed
    lastFailedRequestText = text;
    addErrorMessage(err.message || 'The AI provider did not return a response.');
  }
}


// ─── AI API call ───────────────────────────────────────────────────────────
// Remove image_url content blocks from a message (used for non-multimodal providers).
function stripImageParts(msg) {
  const c = msg.content;
  if (Array.isArray(c)) {
    const kept = c.filter(p => p && p.type !== 'image_url');
    // If nothing but images remains, leave a minimal text placeholder so the
    // message is still valid; otherwise return the pruned array.
    if (kept.length === 0) return { role: msg.role, content: '(screenshot omitted — provider does not support images)' };
    return { role: msg.role, content: kept };
  }
  return msg;
}

const NVIDIA_REQUEST_MODELS = {
  'nvidia/deepseek-v4-flash': 'deepseek-ai/deepseek-v4-flash-0731',
  'nvidia/nemotron-3-super': 'nvidia/nemotron-3-super-120b-a12b',
  'nvidia/deepseek-r1': 'deepseek-ai/deepseek-r1',
  'nvidia/nemotron-3-ultra': 'nvidia/nemotron-3-ultra',
  'nvidia/nemotron-4-340b-instruct': 'nvidia/nemotron-4-340b-instruct',
  'nvidia/llama-3.1-8b-instruct': 'meta/llama-3.1-8b-instruct',
  'nvidia/llama-3.1-70b-instruct': 'meta/llama-3.1-70b-instruct',
  'nvidia/llama-3.2-1b-instruct': 'meta/llama-3.2-1b-instruct',
  'nvidia/llama-3.2-3b-instruct': 'meta/llama-3.2-3b-instruct',
  'nvidia/llama-3.3-70b-instruct': 'meta/llama-3.3-70b-instruct',
  'nvidia/mistral-7b-instruct-v0.3': 'mistralai/mistral-7b-instruct-v0.3',
  'nvidia/mistral-nemo-12b-instruct': 'mistralai/mistral-nemo-12b-instruct',
  'nvidia/gemma-2-9b-it': 'google/gemma-2-9b-it',
  'nvidia/gemma-2-27b-it': 'google/gemma-2-27b-it',
  'nvidia/phi-3-mini-4k-instruct': 'microsoft/phi-3-mini-4k-instruct',
  'nvidia/phi-3-medium-128k-instruct': 'microsoft/phi-3-medium-128k-instruct',
};

const GROQ_REQUEST_MODELS = {
  'groq/llama-3.3-70b-versatile': 'llama-3.3-70b-versatile',
  'groq/llama-3.1-8b-instant': 'llama-3.1-8b-instant',
  'groq/llama-4-scout-17b-16e-instruct': 'meta-llama/llama-4-scout-17b-16e-instruct',
  'groq/compound': 'groq/compound',
  'groq/qwen3-32b': 'qwen/qwen3-32b',
  'groq/qwen3.6-27b': 'qwen/qwen3.6-27b',
  'groq/gpt-oss-120b': 'openai/gpt-oss-120b',
  'groq/gpt-oss-20b': 'openai/gpt-oss-20b',
  'groq/allam-2-7b': 'allam-2-7b',
};

async function callAI(history) {
  abortController = new AbortController();
  const prov = routingProviderOf(model);
  const endpoint = PROVIDER_API_ENDPOINTS[prov] || PROVIDER_API_ENDPOINTS.openrouter;
  const key = resolveApiKey({ ['apiKey_' + prov]: apiKey });
  const headers = { 'Content-Type': 'application/json' };
  if (key) headers['Authorization'] = `Bearer ${key}`;
  if (prov === 'openrouter') {
    headers['HTTP-Referer'] = 'https://viora-extension.local';
    headers['X-Title'] = 'Viora Browser Assistant';
  }

  // Sanitize history: providers without multimodal support (e.g. NVIDIA) reject
  // any image_url content. Strip image parts from every message so stale
  // screenshots (from a prior multimodal session, a manual capture, or a task
  // run) can never reach the API and trigger "multimodal processing is not enabled".
  const supportsMM = !!PROVIDER_SUPPORTS_MULTIMODAL[prov];
  const safeHistory = supportsMM ? history : history.map(stripImageParts);
  const requestModel = model === AUTO_MODEL
    ? 'openrouter/auto'
    : (NVIDIA_REQUEST_MODELS[model] || GROQ_REQUEST_MODELS[model] || model);

  if (prov === 'huggingface') {
    const hfModel = requestModel.replace(/^huggingface\//, '');
    const response = await fetch(endpoint, {
      method: 'POST',
      signal: abortController.signal,
      headers,
      body: JSON.stringify({
        model: hfModel,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT + userPrefsPrompt() },
          ...(runMode === 'plan'
            ? [{ role: 'system', content: 'PLAN MODE: Do NOT take any real action. Output an action_plan describing the steps you WOULD take, but nothing will be opened or controlled. Never claim you clicked, filled, or navigated — you are only proposing a plan.' }]
            : []),
          ...safeHistory
        ],
        max_tokens: 2500,
        temperature: 0.6
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const providerMessage = err.error?.message || err.error || err.message || `HTTP ${response.status}`;
      throw new Error(`${providerMessage} (huggingface: ${hfModel})`);
    }

    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content
      || data?.choices?.[0]?.text
      || data?.generated_text;
    if (!reply || !String(reply).trim()) {
      throw new Error(`Hugging Face returned no text (model: ${hfModel})`);
    }
    return String(reply);
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    signal: abortController.signal,
    headers,
    body: JSON.stringify({
      model: requestModel,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT + userPrefsPrompt() },
        ...(runMode === 'plan'
          ? [{ role: 'system', content: 'PLAN MODE: Do NOT take any real action. Output an action_plan describing the steps you WOULD take, but nothing will be opened or controlled. Never claim you clicked, filled, or navigated — you are only proposing a plan.' }]
          : []),
        ...safeHistory
      ],
      max_tokens: 2500,
      temperature: 0.6
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const providerMessage = err.error?.message || err.message;
    throw new Error(providerMessage ? `${providerMessage} (${prov}: ${requestModel})` : `HTTP ${response.status} (${prov}: ${requestModel})`);
  }

  const data = await response.json();
  const reply = data.choices?.[0]?.message?.content;
  if (!reply || !String(reply).trim()) {
    throw new Error(`${prov} returned no text (model: ${requestModel})`);
  }
  return String(reply);
}

// ─── Task card rendering ───────────────────────────────────────────────────
function renderTaskCard(plan) {
  const taskId = 'task-' + Date.now();
  const stepsCount = plan.steps?.length || 0;

  const card = document.createElement('div');
  card.className = 'task-card';
  card.id = taskId;
  card.innerHTML = `
    <div class="task-card-header">
      <div class="task-icon">${plan.emoji || '⚡'}</div>
      <div class="task-meta">
        <div class="task-title">${escapeHtml(plan.title || 'Task')}</div>
        <div class="task-subtitle">${stepsCount} step${stepsCount !== 1 ? 's' : ''} planned</div>
      </div>
    </div>
    <div class="task-progress">
      <div class="task-progress-bar" id="${taskId}-progress"></div>
    </div>
    <div class="task-steps" id="${taskId}-steps">
      ${(plan.steps || []).map((step, i) => `
        <div class="task-step" id="${taskId}-step-${i}">
          <div class="step-status pending" id="${taskId}-status-${i}">
            ${stepStatusIcon('pending')}
          </div>
          <div class="step-info">
            <div class="step-desc">${escapeHtml(step.description || step.type)}</div>
            <div class="step-detail">${stepDetailText(step)}</div>
          </div>
        </div>
      `).join('')}
    </div>
    <div class="task-card-footer" id="${taskId}-footer">
      <button class="btn-run" id="${taskId}-runBtn">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        Run Task
      </button>
      <button class="btn-discard" id="${taskId}-discardBtn">Discard</button>
    </div>
  `;

  messagesEl.appendChild(card);
  // Attach listeners via closure — inline onclick with JSON.stringify(plan) is
  // broken because the JSON's double quotes terminate the HTML attribute.
  const runBtn = document.getElementById(`${taskId}-runBtn`);
  if (runBtn) {
    runBtn.dataset.originalHTML = runBtn.innerHTML; // preserve SVG + label for mode restore
    runBtn.addEventListener('click', () => startTask(taskId, plan));
  }
  const discardBtn = document.getElementById(`${taskId}-discardBtn`);
  if (discardBtn) discardBtn.addEventListener('click', () => discardTask(taskId));
  scrollToBottom();
}

function stepDetailText(step) {
  if (step.type === 'navigate') return step.url || '';
  if (step.type === 'click') return step.selector || step.text || '';
  if (step.type === 'fill') return `${step.selector || ''} → "${step.value || ''}"`;
  if (step.type === 'extract') return step.selector || 'page content';
  if (step.type === 'wait_for') return step.selector || '';
  if (step.type === 'screenshot') return 'capture viewport';
  if (step.type === 'click_at')  return `coords (${step.x}, ${step.y})`;
  return step.selector || step.url || '';
}

function stepStatusIcon(status) {
  if (status === 'pending') return '○';
  if (status === 'running') return '↻';
  if (status === 'done') return '✓';
  if (status === 'error') return '✕';
  if (status === 'skipped') return '—';
  return '○';
}

// ─── Task execution ────────────────────────────────────────────────────────
async function startTask(taskId, plan) {
  // Bulletproof guard: never execute while in Plan mode, no matter how this is
  // invoked (manual Run click, auto-schedule, or follow-up loop).
  if (runMode === 'plan') return;
  if (activeTask) return;
  activeTask = taskId;
  stopRequested = false;
  updateWorkspaceStrip(`Running · ${plan.title || 'automation task'}`);

  const providerSupportsMultimodal = !!PROVIDER_SUPPORTS_MULTIMODAL[routingProviderOf(model)];

  const runBtn = document.getElementById(`${taskId}-runBtn`);
  const footer = document.getElementById(`${taskId}-footer`);

  // Replace run/discard with stop button.
  // BUG FIX: inline onclick="requestStop()" is blocked by the extension
  // page's CSP (script-src 'self' — no unsafe-inline), so the button did
  // nothing when clicked. Attach the listener in JS instead.
  footer.innerHTML = `
    <button class="btn-stop" id="${taskId}-stopBtn">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16"/></svg>
      Stop
    </button>
  `;
  const stopBtn = document.getElementById(`${taskId}-stopBtn`);
  if (stopBtn) stopBtn.addEventListener('click', requestStop);

  const steps = plan.steps || [];
  let completed = 0;
  let lastError = null;

  for (let i = 0; i < steps.length; i++) {
    if (stopRequested) break;

    const step = steps[i];

    // Safety cap: never run more than maxSteps in a single task (prevents
    // runaway loops). Skip the remainder once the cap is hit.
    if (i >= userPrefs.maxSteps) {
      setStepStatus(taskId, i, 'skipped');
      appendErrorToStep(taskId, i, `Skipped: reached max steps (${userPrefs.maxSteps})`);
      completed++;
      updateProgress(taskId, (completed / steps.length) * 100);
      continue;
    }

    // If proactive web search is disabled in settings, drop web_search steps so
    // Viora doesn't open search pages unprompted.
    if (step.type === 'web_search' && !userPrefs.autoWebSearch) {
      setStepStatus(taskId, i, 'skipped');
      appendErrorToStep(taskId, i, 'Skipped: web search disabled in settings');
      completed++;
      updateProgress(taskId, (completed / steps.length) * 100);
      continue;
    }

    // Guard: AI sometimes generates steps with null/undefined/unknown types.
    // Skip them silently instead of crashing the whole task.
    if (!step.type) {
      setStepStatus(taskId, i, 'skipped');
      appendErrorToStep(taskId, i, 'Skipped: step has no action type');
      completed++;
      updateProgress(taskId, (completed / steps.length) * 100);
      continue;
    }

    setStepStatus(taskId, i, 'running');
    showTyping(step.description || `Running step ${i + 1}…`);

    try {
      const result = await executeStep(step);
      setStepStatus(taskId, i, 'done');

      // Handle screenshot results — feed image into AI conversation
      if (step.type === 'screenshot' && result?.screenshot) {
        appendScreenshotToStep(taskId, i, result.screenshot);
        // Push screenshot to conversation so AI can SEE the page (skip on
        // providers without multimodal support, e.g. NVIDIA, to avoid errors)
        if (providerSupportsMultimodal) {
          conversationHistory.push({
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: result.screenshot } },
              { type: 'text', text: `[Step ${i + 1} screenshot — this is what the page looks like now]` }
            ]
          });
        } else {
          conversationHistory.push({
            role: 'user',
            content: `[Step ${i + 1} screenshot captured — page state now]`
          });
        }
      }

      // Auto-capture screenshot after each non-screenshot action when setting is on
      if (step.type !== 'screenshot' && stepScreenshots) {
        try {
          const snap = await new Promise(resolve =>
            chrome.runtime.sendMessage({ type: 'CAPTURE_SCREENSHOT', tabId: targetTabId }, resolve)
          );
          if (snap?.screenshot) {
            appendScreenshotToStep(taskId, i, snap.screenshot);
            // Feed to AI so it can verify the action worked
            if (providerSupportsMultimodal) {
              conversationHistory.push({
                role: 'user',
                content: [
                  { type: 'image_url', image_url: { url: snap.screenshot } },
                  { type: 'text', text: `[After step ${i + 1}: "${step.description || step.type}" — page state now]` }
                ]
              });
            } else {
              conversationHistory.push({
                role: 'user',
                content: `[After step ${i + 1}: "${step.description || step.type}" — page state now]`
              });
            }
          }
        } catch (_) {}
      }

      // Handle data extraction results
      if (result?.data) {
        appendDataToStep(taskId, i, result.data);
        // Add to conversation so AI has context
        conversationHistory.push({
          role: 'user',
          content: `[Step ${i + 1} extracted data]: ${result.data.slice(0, 2000)}`
        });
      }

      // Handle web_search results — record sources so the AI can cite them
      if (step.type === 'web_search') {
        const srcNote = (result?.results && result.results.length)
          ? `[Step ${i + 1} web search "${result.query}" returned ${result.results.length} sources]: ` +
            result.results.map(s => `- ${s.title} (${s.url})`).join('\n')
          : `[Step ${i + 1} web search "${result.query || ''}" — no structured results; search page opened at ${result?.searchUrl || ''}]`;
        conversationHistory.push({ role: 'user', content: srcNote });
        renderSources();
      }

      completed++;
      updateProgress(taskId, (completed / steps.length) * 100);
      await delay(300);

    } catch (err) {
      // Unknown action type = AI hallucinated a step type. Skip it and keep going.
      if (err.message?.startsWith('Unknown action type')) {
        setStepStatus(taskId, i, 'skipped');
        appendErrorToStep(taskId, i, `Skipped: ${err.message}`);
        completed++;
        updateProgress(taskId, (completed / steps.length) * 100);
        continue;
      }

      // Real execution error. If auto-retry is on and we haven't retried this
      // step yet, try once more before giving up.
      if (userPrefs.retryOnFailure && !step.__retried) {
        step.__retried = true;
        setStepStatus(taskId, i, 'running');
        appendErrorToStep(taskId, i, `Retrying — ${err.message}`);
        try {
          await delay(500);
          const retryResult = await executeStep(step);
          setStepStatus(taskId, i, 'done');
          if (retryResult?.screenshot) appendScreenshotToStep(taskId, i, retryResult.screenshot);
          if (retryResult?.data) appendDataToStep(taskId, i, retryResult.data);
          completed++;
          updateProgress(taskId, (completed / steps.length) * 100);
          await delay(300);
          continue;
        } catch (retryErr) {
          err = retryErr;
        }
      }

      setStepStatus(taskId, i, 'error');
      appendErrorToStep(taskId, i, err.message);
      lastError = err;

      // Mark remaining steps as skipped
      for (let j = i + 1; j < steps.length; j++) {
        setStepStatus(taskId, j, 'skipped');
      }
      break;
    }
  }

  hideTyping();

  const stopped = stopRequested;
  stopRequested = false;
  updateWorkspaceStrip(stopped ? 'Stopped · ready for the next task' : 'Task complete · ready for the next task');

  // Show completion banner
  const stepsEl = document.getElementById(`${taskId}-steps`);
  const banner = document.createElement('div');

  if (stopped) {
    banner.className = 'task-failed-banner';
    banner.innerHTML = '⏹ Task stopped by user';
  } else if (lastError) {
    banner.className = 'task-failed-banner';
    banner.innerHTML = `⚠️ Task stopped: ${escapeHtml(lastError.message)}`;
    // Let AI know
    await summarizeTaskResult(plan, steps, completed, lastError.message);
  } else {
    banner.className = 'task-complete-banner';
    banner.innerHTML = `✓ Task complete — ${completed} of ${steps.length} steps done`;
    await summarizeTaskResult(plan, steps, completed, null);
  }

  activeTask = null;

  // BUG FIX: footer/card can be null if the user cleared or discarded the
  // conversation while this task was still running its async steps —
  // previously `card.appendChild(banner)` threw "Cannot read properties of
  // null (reading 'appendChild')" once the loop finally finished.
  if (footer) footer.innerHTML = '';
  const card = document.getElementById(taskId);
  if (card) card.appendChild(banner);
  setBadge('chat');
  scrollToBottom();
}

async function summarizeTaskResult(plan, steps, completed, error) {
  const summary = error
    ? `Task "${plan.title}" failed at step ${completed + 1}: ${error}`
    : `Task "${plan.title}" completed successfully. All ${completed} steps done.`;

  // The real goal is the user's overarching request, not just this sub-step's
  // title — otherwise the loop stops after opening an editor without writing.
  const goal = currentGoal || plan.title;

  // Take a fresh screenshot so the AI can see the current page
  let postTaskContext = `[Task result]: ${summary}\n[Original user goal]: ${goal}\nThe steps you just ran may only be PART of the goal. Review the conversation to see the user's FULL request (e.g. if they asked you to WRITE or TYPE content, you must actually fill the document/textarea before declaring done). Examine the screenshot. If the ORIGINAL GOAL is fully complete, say so briefly. If NOT done, produce an action_plan with the NEXT steps to finish it (including actually writing/typing the requested content if it isn't there yet).`;

  try {
    const tabInfo = await new Promise(resolve =>
      chrome.runtime.sendMessage({ type: 'GET_TAB_INFO', tabId: targetTabId }, resolve)
    );
    if (tabInfo?.url && !tabInfo.url.startsWith('chrome://')) {
      postTaskContext += `\n[Now on: ${tabInfo.url}]`;
    }
    const snap = await new Promise(resolve =>
      chrome.runtime.sendMessage({ type: 'CAPTURE_SCREENSHOT', tabId: targetTabId }, resolve)
    );
    const providerSupportsMultimodal = !!PROVIDER_SUPPORTS_MULTIMODAL[routingProviderOf(model)];
    if (snap?.screenshot && providerSupportsMultimodal) {
      conversationHistory.push({
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: snap.screenshot } },
          { type: 'text', text: postTaskContext }
        ]
      });
    } else {
      conversationHistory.push({ role: 'user', content: postTaskContext });
    }
  } catch (_) {
    conversationHistory.push({ role: 'user', content: postTaskContext });
  }

  showTyping("Checking if there's more to do...");
  try {
    const reply = await callAI(conversationHistory);
    hideTyping();
    conversationHistory.push({ role: 'assistant', content: reply });

    // Extract action plan from anywhere in the reply (handles mixed prose + JSON)
    const { plan: nextPlan, visibleText } = extractActionPlan(reply);
    if (nextPlan) {
      if (visibleText) addAssistantMessage(visibleText);
      renderTaskCard(nextPlan);
      setBadge('actions');
      const taskId = document.querySelector('.' + 'task-card:last-child')?.id;
      // Plan mode: never auto-execute follow-up steps.
      if (runMode === 'plan') {
        setBadge('chat');
        if (taskId) {
          const runBtn = document.getElementById(`${taskId}-runBtn`);
          if (runBtn) { runBtn.disabled = true; runBtn.textContent = 'Run (Action mode)'; runBtn.title = 'Switch to Action mode to execute'; }
          const card = document.getElementById(taskId);
          if (card) {
            const note = document.createElement('div');
            note.className = 'plan-only-note';
            note.textContent = 'Plan only — nothing will be opened or controlled. Switch to Action mode to run.';
            card.appendChild(note);
          }
        }
        return;
      }
      if (taskId) setTimeout(() => startTask(taskId, nextPlan), 120);
      saveCurrentSession();
      return;
    }

    addAssistantMessage(reply);
    saveCurrentSession();
  } catch (err) {
    hideTyping();
    if (err.name !== 'AbortError') console.warn('summarize error', err);
  }
}

function requestStop() {
  stopRequested = true;
  if (abortController) abortController.abort();
}

function discardTask(taskId) {
  const card = document.getElementById(taskId);
  if (card) {
    card.style.opacity = '0';
    card.style.transform = 'scale(0.97)';
    card.style.transition = 'all 0.2s';
    setTimeout(() => card.remove(), 200);
  }
  setBadge('chat');
}

// ─── Step executor ────────────────────────────────────────────────────────
async function executeStep(step) {
  if (step.type === 'screenshot') {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'CAPTURE_SCREENSHOT', tabId: targetTabId }, (res) => {
        if (chrome.runtime.lastError || res?.error) {
          resolve({ success: true, screenshot: null });
        } else {
          resolve({ success: true, screenshot: res.screenshot });
        }
      });
    });
  }

  if (step.type === 'navigate') {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'NAVIGATE', url: step.url, tabId: targetTabId }, (res) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else if (res?.error) reject(new Error(res.error));
        else resolve(res);
      });
    });
  }

  if (step.type === 'web_search') {
    return executeWebSearch(step);
  }

  // DOM actions go through background → content script
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'DOM_ACTION', action: step, tabId: targetTabId }, (res) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (res?.success === false) {
        reject(new Error(res.error || 'Action failed'));
      } else {
        resolve(res || { success: true });
      }
    });
  });
}

// ─── Task UI helpers ───────────────────────────────────────────────────────
function setStepStatus(taskId, index, status) {
  const statusEl = document.getElementById(`${taskId}-status-${index}`);
  if (!statusEl) return;
  statusEl.className = `step-status ${status}`;
  statusEl.textContent = stepStatusIcon(status);
}

function updateProgress(taskId, percent) {
  const bar = document.getElementById(`${taskId}-progress`);
  if (bar) bar.style.width = percent + '%';
}

function appendScreenshotToStep(taskId, index, dataUrl) {
  // Screenshots are still captured and sent to the AI (see startTask/
  // conversationHistory) so it can verify each step actually worked — they're
  // just not rendered visibly in the task card anymore.
  return;
}

function appendDataToStep(taskId, index, data) {
  const stepsEl = document.getElementById(`${taskId}-steps`);
  if (!stepsEl) return; // card may have been discarded/cleared mid-task
  const prev = document.createElement('div');
  prev.className = 'data-preview';
  prev.textContent = data.slice(0, 600) + (data.length > 600 ? '…' : '');
  stepsEl.appendChild(prev);
}

function appendErrorToStep(taskId, index, message) {
  const stepEl = document.getElementById(`${taskId}-step-${index}`);
  if (!stepEl) return;
  const errEl = document.createElement('div');
  errEl.className = 'step-error';
  errEl.textContent = message;
  stepEl.querySelector('.step-info').appendChild(errEl);
}

// ─── Screenshot ────────────────────────────────────────────────────────────
async function captureAndAttach() {
  chrome.runtime.sendMessage({ type: 'CAPTURE_SCREENSHOT', tabId: targetTabId }, (res) => {
    if (res?.screenshot) {
      pendingScreenshot = res.screenshot;
      screenshotPreview.src = res.screenshot;
      screenshotBar.style.display = 'flex';
      document.getElementById('attachScreenBtn').classList.add('active');
    }
  });
}

// ─── Message rendering ─────────────────────────────────────────────────────
function addUserMessage(text, screenshot) {
  hideWelcome();
  const div = document.createElement('div');
  div.className = 'message user';
  // Screenshots are still sent to the AI (see handleSend/conversationHistory)
  // but are not rendered in the chat — keeps the transcript clean and avoids
  // showing page captures in the UI.
  div.innerHTML = `<div class="msg-row"><div class="msg-col"><div class="msg-name">You</div><div class="msg-bubble">${escapeHtml(text)}</div></div></div>`;
  messagesEl.appendChild(div);
  scrollToBottom();
}

function addAssistantMessage(text) {
  // Final safety strip: remove any JSON action_plan blobs that slipped through
  const { visibleText } = extractActionPlan(text);
  const cleaned = (visibleText || text).trim();
  if (!cleaned) return; // nothing to show
  const div = document.createElement('div');
  div.className = 'message assistant';
  div.innerHTML = `<div class="msg-row"><div class="msg-avatar" aria-hidden="true">✦</div><div class="msg-col"><div class="msg-name">Viora</div><div class="msg-bubble">${formatMarkdown(cleaned)}</div></div></div>`;
  messagesEl.appendChild(div);
  scrollToBottom();
}

function addErrorMessage(message) {
  const div = document.createElement('div');
  div.className = 'message assistant';
  const provider = providerLabel(routingProviderOf(model));
  div.innerHTML = `<div class="msg-row"><div class="msg-avatar" aria-hidden="true">!</div><div class="msg-col"><div class="msg-name">Viora</div><div class="error-banner"><div class="error-banner-icon">⚠</div><div class="error-banner-body"><div class="error-banner-title">${escapeHtml(provider)} could not answer</div><div class="error-banner-hint">Check the provider key or connection, then try again.</div><details class="error-banner-details"><summary>Technical details</summary><pre>${escapeHtml(message)}</pre></details><button class="error-banner-retry" type="button">Try again</button></div></div></div></div>`;
  const retryBtn = div.querySelector('.error-banner-retry');
  if (retryBtn) retryBtn.addEventListener('click', () => handleSend(lastFailedRequestText));
  if (lastErrorElement) lastErrorElement.remove();
  lastErrorElement = div;
  messagesEl.appendChild(div);
  scrollToBottom();
}

// Basic markdown formatter
function formatMarkdown(text) {
  const codeBlocks = [];
  const withPlaceholders = String(text).replace(/```([\w+-]*)\n?([\s\S]*?)```/g, (_, language, code) => {
    const index = codeBlocks.push({ language: language || 'code', code: escapeHtml(code.trim()) }) - 1;
    return `\n@@VIORA_CODE_${index}@@\n`;
  });
  let formatted = withPlaceholders
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<strong>$1</strong>')
    .replace(/^## (.+)$/gm, '<strong>$1</strong>')
    .replace(/^# (.+)$/gm, '<strong>$1</strong>')
    .replace(/^\- (.+)$/gm, '• $1')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
  codeBlocks.forEach((block, index) => {
    const code = `<div class="code-block"><div class="code-block-header"><span>${escapeHtml(block.language)}</span></div><pre><code>${block.code}</code></pre></div>`;
    formatted = formatted.replace(`@@VIORA_CODE_${index}@@`, code);
  });
  return formatted;
}

// ─── Extract action plan JSON from anywhere in an AI response ─────────────────
// Returns { plan, visibleText } where visibleText is the prose with JSON stripped.
function extractActionPlan(response) {
  // Fast path: entire response is a JSON action plan
  const trimmed = response.trim();
  if (trimmed.startsWith('{"type":"action_plan"') || trimmed.startsWith('{ "type": "action_plan"')) {
    try {
      const plan = JSON.parse(trimmed);
      if (plan?.type === 'action_plan') return { plan, visibleText: '' };
    } catch (_) {}
  }

  // Slow path: find a JSON object anywhere inside the text
  // Walk through looking for { ... } blocks that parse as action_plan
  let i = 0;
  while (i < response.length) {
    const brace = response.indexOf('{', i);
    if (brace === -1) break;
    // Try to extract a balanced JSON object starting here
    let depth = 0, j = brace;
    while (j < response.length) {
      if (response[j] === '{') depth++;
      else if (response[j] === '}') { depth--; if (depth === 0) break; }
      j++;
    }
    if (depth === 0) {
      const candidate = response.slice(brace, j + 1);
      try {
        const plan = JSON.parse(candidate);
        if (plan?.type === 'action_plan') {
          // Strip the JSON blob from the visible text
          const visibleText = (response.slice(0, brace) + response.slice(j + 1)).trim();
          return { plan, visibleText };
        }
      } catch (_) {}
    }
    i = brace + 1;
  }

  return { plan: null, visibleText: response };
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

// ─── UI helpers ────────────────────────────────────────────────────────────
function hideWelcome() {
  if (welcomeEl) { welcomeEl.style.display = 'none'; }
}

function showTyping(msg = 'Thinking…') {
  if (typingText) typingText.textContent = msg;
  typingIndicator.style.display = 'flex';
  // Swap send → stop while busy
  sendBtn.style.display = 'none';
  stopInputBtn.style.display = 'flex';
  scrollToBottom();
}

function hideTyping() {
  typingIndicator.style.display = 'none';
  // Restore send button
  stopInputBtn.style.display = 'none';
  sendBtn.style.display = '';
  sendBtn.disabled = chatInput.value.trim() === '';
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function setBadge(mode) {
  modeBadge.textContent = mode === 'actions' ? 'Actions' : 'Chat';
  modeBadge.className = 'mode-badge' + (mode === 'actions' ? ' actions' : '');
}

// ─── Web search & Sources ─────────────────────────────────────────────────
// Collected sources (url/title/snippet) from web_search steps in the current
// conversation. Rendered as a "Sources" block under assistant answers.
let currentSources = [];

function extractFavicon(url) {
  try {
    const hostname = new URL(url).hostname;
    const baseUrl = `https://${hostname}`;
    
    // Try common favicon locations
    const faviconUrls = [
      `${baseUrl}/favicon.ico`,
      `${baseUrl}/favicon.png`,
      `${baseUrl}/favicon.svg`,
      `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`,
      `https://icons.duckduckgo.com/ip3/${hostname}.ico`,
    ];
    
    // Return the first favicon URL that would likely exist
    return faviconUrls[0];
  } catch (_) {
    return null;
  }
}

function addSource(title, url, snippet) {
  // BUG FIX: this regex literal was missing its closing '/' before the 'i'
  // flag (`/^https?:\/\/i.test(url)`), which is an invalid regex literal —
  // a hard SyntaxError that prevented this entire file from parsing, which
  // in turn meant NONE of sidepanel.js ever ran (no chat, no actions).
  if (!url || !/^https?:\/\//i.test(url)) return;
  // Avoid duplicates by URL
  if (currentSources.some(s => s.url === url)) return;
  
  const favicon = extractFavicon(url);
  currentSources.push({ 
    title: title || url, 
    url, 
    snippet: snippet || '',
    favicon: favicon
  });
}

// Build the HTML for the current sources block (or '' if none).
function sourcesHtml() {
  if (!currentSources.length) return '';
  const items = currentSources.map(s => `
    <a class="source-link" href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(s.url)}">
      ${s.favicon ? `<img class="source-favicon" src="${escapeHtml(s.favicon)}" alt="${escapeHtml(new URL(s.url).hostname)}">` : `<span class="source-favicon"></span>`}
      <span class="source-text">
        <span class="source-title">${escapeHtml(s.title)}</span>
        ${s.snippet ? `<span class="source-snippet">${escapeHtml(s.snippet)}</span>` : ''}
      </span>
    </a>`).join('');
  return `<div class="sources-block"><div class="sources-head">🌐 Sources</div><div class="sources-list">${items}</div></div>`;
}

// Append the current sources block to the most recent assistant message bubble,
// if it isn't already present.
function renderSources() {
  if (!currentSources.length) return;
  const msgs = messagesEl.querySelectorAll('.message.assistant');
  const last = msgs[msgs.length - 1];
  if (!last) return;
  if (last.querySelector('.sources-block')) return; // already shown
  const bubble = last.querySelector('.msg-bubble');
  if (!bubble) return;
  const wrap = document.createElement('div');
  wrap.innerHTML = sourcesHtml();
  // BUG FIX: inline onerror="..." on the favicon <img> is blocked by the
  // extension page's CSP (script-src 'self' — no unsafe-inline), so a broken
  // favicon never hid itself. Attach the fallback in JS instead.
  wrap.querySelectorAll('img.source-favicon').forEach(img => {
    img.addEventListener('error', () => { img.style.display = 'none'; }, { once: true });
  });
  while (wrap.firstChild) bubble.appendChild(wrap.firstChild);
  scrollToBottom();
}

async function executeWebSearch(step) {
  const query = (step.query || step.value || step.description || '').toString().trim();
  if (!query) return { success: true, results: [], error: 'No search query provided' };

  // 1) Navigate the user's active tab to a real search results page so they see it.
  const engine = (step.engine || 'google').toLowerCase();
  const q = encodeURIComponent(query);
  const searchUrl = engine === 'bing'
    ? `https://www.bing.com/search?q=${q}`
    : engine === 'duckduckgo'
      ? `https://duckduckgo.com/?q=${q}`
      : `https://www.google.com/search?q=${q}`;

  try {
    await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'NAVIGATE', url: searchUrl, tabId: targetTabId }, (res) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else if (res?.error) reject(new Error(res.error));
        else resolve(res);
      });
    });
  } catch (_) { /* tab may be unavailable; still try extraction below */ }

  // 2) Give the SERP a moment to load, then pull result links from the page.
  await delay(900);
  let extracted = [];
  try {
    const res = await new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'DOM_ACTION', action: { type: 'extract_links' }, tabId: targetTabId }, resolve);
    });
    // content.js returns { data: JSON.stringify([{text, href}, ...]) }
    let raw = res?.data || res?.links || [];
    if (typeof raw === 'string') {
      try { raw = JSON.parse(raw); } catch (_) { raw = []; }
    }
    extracted = (Array.isArray(raw) ? raw : [])
      .map(l => ({ title: l.text || l.title || '', url: l.href || l.url, snippet: l.snippet || l.text || '' }))
      .filter(l => l && /^https?:\/\//i.test(l.url || ''))
      .slice(0, 8);
  } catch (_) {}

  // 3) Collect sources (falls back to the search URL itself if extraction failed).
  if (extracted.length) {
    extracted.forEach(l => addSource(l.title || l.text, l.url, l.snippet || l.text));
  } else {
    addSource(`Search: ${query}`, searchUrl, '');
  }

  return {
    success: true,
    query,
    searchUrl,
    results: currentSources.slice(),
  };
}

// ─── Chat history persistence & browse ─────────────────────────────────────
// Flatten a conversation message into {role, text} for storage/display.
function flattenMessage(msg) {
  const c = msg && msg.content;
  if (typeof c === 'string') return { role: msg.role, text: c };
  if (Array.isArray(c)) {
    const text = c.filter(p => p && p.type === 'text').map(p => p.text).join('\n');
    return { role: msg.role, text: text || '(image)' };
  }
  return { role: msg.role, text: '' };
}

function sessionTitle() {
  const firstUser = conversationHistory.find(m => m.role === 'user');
  const t = firstUser ? flattenMessage(firstUser).text : '';
  const clean = (t || 'New chat').replace(/\s+/g, ' ').trim();
  return clean.length > 60 ? clean.slice(0, 60) + '…' : (clean || 'New chat');
}

// Persist the current conversation into the shared chatSessions store so it
// shows up in both the side-panel history sidebar and the settings page.
async function saveCurrentSession() {
  // "Learn on every chat" can be disabled in Settings → AI Behavior.
  if (!userPrefs.persistMemory) { currentSessionId = null; return; }
  if (!conversationHistory.length) return;
  const now = Date.now();
  const sessions = (await chrome.storage.local.get(['chatSessions'])).chatSessions || [];
  const messages = conversationHistory.map(flattenMessage);
  const idx = sessions.findIndex(s => s.id === currentSessionId);
  const entry = {
    id: currentSessionId || (currentSessionId = 's_' + now + '_' + Math.random().toString(36).slice(2, 7)),
    title: sessionTitle(),
    messages,
    messageCount: messages.length,
    sources: currentSources.slice(),
    createdAt: idx >= 0 ? sessions[idx].createdAt : now,
    updatedAt: now,
  };
  if (idx >= 0) sessions[idx] = entry; else sessions.unshift(entry);
  await chrome.storage.local.set({ chatSessions: sessions });
  renderHistorySidebar();
}

function relativeTime(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
}

function renderHistorySidebar() {
  const list = document.getElementById('sidebarList');
  const empty = document.getElementById('sidebarEmpty');
  if (!list) return;
  chrome.storage.local.get(['chatSessions']).then(({ chatSessions = [] }) => {
    if (!chatSessions.length) {
      list.innerHTML = '';
      if (empty) empty.style.display = 'flex';
      return;
    }
    if (empty) empty.style.display = 'none';
    list.innerHTML = chatSessions.map(s => `
      <div class="history-item" data-id="${escapeHtml(s.id)}">
        <div class="history-row">
          <div class="history-row-main">
            <div class="history-row-title">${escapeHtml(s.title || 'New chat')}</div>
            <div class="history-row-meta">${relativeTime(s.updatedAt)} · ${s.messageCount || 0} message${(s.messageCount || 0) === 1 ? '' : 's'}</div>
          </div>
          <div class="history-row-actions">
            <button class="history-continue-btn" title="Continue this chat" data-id="${escapeHtml(s.id)}">Continue</button>
            <button class="history-delete-btn" title="Delete" data-id="${escapeHtml(s.id)}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </div>
        <div class="history-transcript" id="sidebar-transcript-${escapeHtml(s.id)}">
          ${(s.messages || []).map(m => `<div class="history-turn"><span class="history-turn-role">${m.role === 'user' ? 'You' : 'Viora'}</span><span class="history-turn-text">${escapeHtml(m.text)}</span></div>`).join('') || '<div class="history-turn"><span class="history-turn-text">No text content saved for this chat.</span></div>'}
          ${(Array.isArray(s.sources) && s.sources.length) ? `<div class="history-turn"><span class="history-turn-role">Sources</span><span class="history-turn-text">${s.sources.map(src => '• ' + escapeHtml(src.title)).join('\n')}</span></div>` : ''}
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.history-item').forEach(item => {
      const id = item.dataset.id;
      const transcript = document.getElementById(`sidebar-transcript-${id}`);
      item.querySelector('.history-row-main').addEventListener('click', () => {
        if (!transcript) return;
        const open = transcript.classList.toggle('open');
        item.querySelector('.history-row').classList.toggle('open', open);
      });
      const cont = item.querySelector('.history-continue-btn');
      if (cont) cont.addEventListener('click', (e) => { e.stopPropagation(); continueSession(id); });
      const del = item.querySelector('.history-delete-btn');
      if (del) del.addEventListener('click', async (e) => {
        e.stopPropagation();
        const sessions = ((await chrome.storage.local.get(['chatSessions'])).chatSessions || []).filter(s => s.id !== id);
        await chrome.storage.local.set({ chatSessions: sessions });
        if (currentSessionId === id) { currentSessionId = null; }
        renderHistorySidebar();
      });
    });
  });
}

// Load a past session back into the active conversation.
async function continueSession(id) {
  const sessions = (await chrome.storage.local.get(['chatSessions'])).chatSessions || [];
  const s = sessions.find(x => x.id === id);
  if (!s) return;
  currentSessionId = id;
  conversationHistory = (s.messages || []).map(m => ({ role: m.role, content: m.text }));
  currentSources = Array.isArray(s.sources) ? s.sources.slice() : [];
  messagesEl.innerHTML = '';
  const welcome = document.getElementById('welcome');
  if (welcome) welcome.remove();
  conversationHistory.forEach(m => {
    if (m.role === 'user') addUserMessage(typeof m.content === 'string' ? m.content : flattenMessage(m).text);
    else addAssistantMessage(typeof m.content === 'string' ? m.content : flattenMessage(m).text);
  });
  toggleSidebar();
}

function clearConversation() {
  // Persist the current conversation before wiping it so it remains browsable.
  saveCurrentSession();
  currentSessionId = null;   // start a brand-new session next time
  conversationHistory = [];
  currentSources = [];       // don't carry sources into a new chat
  messagesEl.innerHTML = '';
  // Recreate welcome
  const welcome = document.createElement('div');
  welcome.id = 'welcome';
  welcome.className = 'welcome';
  welcome.innerHTML = `
    <div class="welcome-icon">
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <circle cx="20" cy="20" r="19" fill="url(#wGrad2)" />
        <polyline points="10,15 20,27 30,15" stroke="white" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        <circle cx="20" cy="11" r="3" fill="#34d399"/>
        <defs><linearGradient id="wGrad2" x1="0" y1="0" x2="40" y2="40"><stop offset="0%" stop-color="#6366f1"/><stop offset="100%" stop-color="#8b5cf6"/></linearGradient></defs>
      </svg>
    </div>
    <h2>Hi, I'm Viora</h2>
    <p>Chat with me or ask me to automate tasks on any website.</p>`;
  messagesEl.appendChild(welcome);
  setBadge('chat');
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Make startTask/discardTask/requestStop global for inline onclick ──────
window.startTask = startTask;
window.discardTask = discardTask;
window.requestStop = requestStop;

// ─── Boot ─────────────────────────────────────────────────────────────────
init();
