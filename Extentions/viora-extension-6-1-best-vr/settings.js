// ═══════════════════════════════════════════════════════════════════════════
// SECTION 1: DOM REFERENCES
// ═══════════════════════════════════════════════════════════════════════════

const apiKeyInput = document.getElementById('apiKeyInput');
const autoScreenshot = document.getElementById('autoScreenshot');
const stepScreenshots = document.getElementById('stepScreenshots');
const fastMode = document.getElementById('fastMode');
const autoConfirmSensitive = document.getElementById('autoConfirmSensitive');
const clickRipple = document.getElementById('clickRipple');
const elementHighlight = document.getElementById('elementHighlight');
const automationStatus = document.getElementById('automationStatus');
const cursorPersistTime = document.getElementById('cursorPersistTime');
const saveBtn = document.getElementById('saveBtn');
const saveFeedback = document.getElementById('saveFeedback');
const toggleKeyBtn = document.getElementById('toggleKeyBtn');
const keyPrompt = document.getElementById('keyPrompt');
const modelSearch = document.getElementById('modelSearch');
const modelListEl = document.getElementById('modelList');
const modelListStatus = document.getElementById('modelListStatus');
const modelCountEl = document.getElementById('modelCount');
const apiKeyModelBadge = document.getElementById('apiKeyModelBadge');
const historyListStatus = document.getElementById('historyListStatus');
const historyListEl = document.getElementById('historyList');
const historyCountEl = document.getElementById('historyCount');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');

// AI Behavior settings
const responseDetail = document.getElementById('responseDetail');
const tone = document.getElementById('tone');
const responseLanguage = document.getElementById('responseLanguage');
const autoWebSearch = document.getElementById('autoWebSearch');
const persistMemory = document.getElementById('persistMemory');
const retryOnFailure = document.getElementById('retryOnFailure');
const maxSteps = document.getElementById('maxSteps');
const instructionsContent = document.getElementById('instructionsContent');
const reloadInstructionsBtn = document.getElementById('reloadInstructionsBtn');

const AUTO_MODEL = 'openrouter/auto';
const DEFAULT_LOCAL_MODEL = 'local/wan2.2-animate-2-14b';
let allModels = []; // full fetched catalog, each: {id, name, provider, context_length, promptPrice, vision}
let selectedModel = DEFAULT_LOCAL_MODEL;
let modelFilter = 'all';
const MODEL_CACHE_KEY = 'modelCatalogCache';
const MODEL_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // refetch at most once a day — the catalog doesn't change hour to hour

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 2: PROVIDER CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

function providerOf(id) {
  // Display/grouping only — used to sort the browsable model catalog into
  // provider headers ("OpenAI", "Anthropic", "Mistral", …). Not for routing;
  // see routingProviderOf() for which endpoint/key actually gets used.
  return id.includes('/') ? id.split('/')[0] : 'other';
}

function routingProviderOf(id) {
  // ROUTING classification. Only ids explicitly namespaced as a native direct
  // key (groq/…, nvidia/…, openai-direct/…, deepseek-direct/…, mistralai-direct/…)
  // route to that provider's native API + apiKey_<provider> slot. Everything else
  // — including OpenRouter catalog ids like "openai/gpt-4o-mini" — routes through
  // OpenRouter. (BUG FIX: providerOfSelected() used to reuse the display-grouping
  // providerOf(), so picking an OpenRouter catalog model like "openai/gpt-4o-mini"
  // would save your key under apiKey_openai and later call OpenAI's native API
  // directly with a malformed OpenRouter-style model string — breaking it.)
  if (!id || id === AUTO_MODEL || !id.includes('/')) return 'openrouter';
  const prefix = id.split('/')[0];
  if (prefix === 'local' || prefix === 'huggingface') return prefix;
  if (prefix === 'groq' || prefix === 'nvidia') return prefix;
  if (prefix === 'openai-direct') return 'openai';
  if (prefix === 'deepseek-direct') return 'deepseek';
  if (prefix === 'mistralai-direct') return 'mistralai';
  return 'openrouter';
}

// Set when the person arrives via the onboarding flow (settings.html?provider=x)
// and picks a provider before choosing a specific model. Cleared as soon as they
// pick a model themselves, at which point routing follows the model again.
let providerOverride = null;

function providerOfSelected() {
  if (providerOverride) return providerOverride;
  if (selectedModel === AUTO_MODEL) return 'openrouter';
  return routingProviderOf(selectedModel);
}

function updateApiKeyModelBadge() {
  if (!apiKeyModelBadge) return;
  const prov = providerOfSelected();
  const label = selectedModel === AUTO_MODEL
    ? 'Auto (recommended)'
    : (allModels.find(m => m.id === selectedModel)?.name || selectedModel);
  apiKeyModelBadge.textContent = `for ${label} (via ${providerLabel(prov)})`;
  apiKeyModelBadge.title = selectedModel;
  apiKeyModelBadge.style.display = 'inline-block';
  const sectionTitle = document.getElementById('apiKeySectionTitle');
  if (sectionTitle) sectionTitle.textContent = providerLabel(prov);
  const hint = document.querySelector('.field-hint');
  if (hint) {
    const link = PROVIDER_API_KEY_HINTS[prov] || PROVIDER_API_KEY_HINTS.openrouter;
    const a = hint.querySelector('a');
    if (a) {
      a.textContent = link;
      const urlMatch = link.match(/https?:\/\/[^\s]+|(?:[\w-]+\.)+[\w-]+(?:\/[^\s]*)?/);
      if (urlMatch) a.href = 'https://' + urlMatch[0].replace(/^https?:\/\//, '');
    }
  }
  const keyPromptText = document.getElementById('keyPromptText');
  if (keyPromptText) {
    keyPromptText.textContent = `Add your ${providerLabel(prov)} API key to use this model`;
  }
  apiKeyInput.placeholder = prov === 'openrouter' ? 'sk-or-v1-…' : `gsk_... or ${providerLabel(prov)} API key…`;
}

function providerLabel(p) {
  const known = {
    openai: 'OpenAI', anthropic: 'Anthropic', google: 'Google', 'meta-llama': 'Meta',
    mistralai: 'Mistral', deepseek: 'DeepSeek', 'x-ai': 'xAI', cohere: 'Cohere',
    qwen: 'Qwen', perplexity: 'Perplexity', microsoft: 'Microsoft', nvidia: 'NVIDIA',
    amazon: 'Amazon', ai21: 'AI21', groq: 'Groq', huggingface: 'Hugging Face',
  };
  return known[p] || (p.charAt(0).toUpperCase() + p.slice(1));
}

const PROVIDER_API_ENDPOINTS = {
  local: 'http://localhost:8000/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  openai: 'https://api.openai.com/v1/chat/completions',
  deepseek: 'https://api.deepseek.com/v1/chat/completions',
  mistralai: 'https://api.mistral.ai/v1/chat/completions',
  nvidia: 'https://integrate.api.nvidia.com/v1/chat/completions',
  huggingface: 'https://router.huggingface.co/hf-inference/models',
};

const PROVIDER_API_KEY_HINTS = {
  local: 'Local NIM server - no API key required',
  openrouter: 'Get a free key at openrouter.ai/keys',
  groq: 'Get a free key at console.groq.com/keys',
  openai: 'Get a key at platform.openai.com/api-keys',
  deepseek: 'Get a key at platform.deepseek.com/api_keys',
  mistralai: 'Get a key at console.mistral.ai/api-keys/',
  nvidia: 'Get a key at build.nvidia.com/explore/discover',
  huggingface: 'Create a token at hf.co/settings/tokens',
};

const GROQ_MODELS = [
  // ── Llama 3.3 ──────────────────────────────────────────────────────────
  { id: 'groq/llama-3.3-70b-versatile', apiId: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile', provider: 'groq', context_length: 131072, promptPrice: 0.59, vision: false },
  // ── Llama 3.1 ──────────────────────────────────────────────────────────
  { id: 'groq/llama-3.1-8b-instant', apiId: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant', provider: 'groq', context_length: 131072, promptPrice: 0.05, vision: false },
  // ── Llama 4 ────────────────────────────────────────────────────────────
  { id: 'groq/llama-4-scout-17b-16e-instruct', apiId: 'meta-llama/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout 17B', provider: 'groq', context_length: 16384, promptPrice: 0.20, vision: false },
  // ── Groq Compound ──────────────────────────────────────────────────────
  { id: 'groq/compound', apiId: 'groq/compound', name: 'Groq Compound', provider: 'groq', context_length: 131072, promptPrice: 0.40, vision: false },
  // ── Qwen ───────────────────────────────────────────────────────────────
  { id: 'groq/qwen3-32b', apiId: 'qwen/qwen3-32b', name: 'Qwen 3 32B', provider: 'groq', context_length: 131072, promptPrice: 0.35, vision: false },
  { id: 'groq/qwen3.6-27b', apiId: 'qwen/qwen3.6-27b', name: 'Qwen 3.6 27B', provider: 'groq', context_length: 131072, promptPrice: 0.30, vision: false },
  // ── GPT-OSS (OpenAI) ───────────────────────────────────────────────────
  { id: 'groq/gpt-oss-120b', apiId: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B', provider: 'groq', context_length: 16384, promptPrice: 0.90, vision: false },
  { id: 'groq/gpt-oss-20b', apiId: 'openai/gpt-oss-20b', name: 'GPT-OSS 20B', provider: 'groq', context_length: 16384, promptPrice: 0.20, vision: false },
  // ── Allam (Arabic) ─────────────────────────────────────────────────────
  { id: 'groq/allam-2-7b', apiId: 'allam-2-7b', name: 'Allam 2 7B (Arabic)', provider: 'groq', context_length: 8192, promptPrice: 0.05, vision: false },
];

const LOCAL_MODELS = [
  { id: 'local/wan2.2-animate-2-14b', apiId: 'wan2.2-animate-2-14b', name: 'Wan 2.2 Animate 2 14B (Local NIM)', provider: 'local', context_length: 32768, promptPrice: 0, vision: true },
];

const NVIDIA_MODELS = [
  // ── Nemotron ───────────────────────────────────────────────────────────
  { id: 'nvidia/nemotron-3-ultra', apiId: 'nvidia/nemotron-3-ultra', name: 'Nemotron 3 Ultra', provider: 'nvidia', context_length: 4096, promptPrice: 0, vision: false },
  { id: 'nvidia/nemotron-4-340b-instruct', apiId: 'nvidia/nemotron-4-340b-instruct', name: 'Nemotron 4 340B Instruct', provider: 'nvidia', context_length: 4096, promptPrice: 0, vision: false },
  // ── Llama 3.1/3.2/3.3 (NVIDIA hosted) ──────────────────────────────────
  { id: 'nvidia/llama-3.1-8b-instruct', apiId: 'meta/llama-3.1-8b-instruct', name: 'Llama 3.1 8B Instruct (NVIDIA)', provider: 'nvidia', context_length: 131072, promptPrice: 0, vision: false },
  { id: 'nvidia/llama-3.1-70b-instruct', apiId: 'meta/llama-3.1-70b-instruct', name: 'Llama 3.1 70B Instruct (NVIDIA)', provider: 'nvidia', context_length: 131072, promptPrice: 0, vision: false },
  { id: 'nvidia/llama-3.2-1b-instruct', apiId: 'meta/llama-3.2-1b-instruct', name: 'Llama 3.2 1B Instruct (NVIDIA)', provider: 'nvidia', context_length: 131072, promptPrice: 0, vision: false },
  { id: 'nvidia/llama-3.2-3b-instruct', apiId: 'meta/llama-3.2-3b-instruct', name: 'Llama 3.2 3B Instruct (NVIDIA)', provider: 'nvidia', context_length: 131072, promptPrice: 0, vision: false },
  { id: 'nvidia/llama-3.3-70b-instruct', apiId: 'meta/llama-3.3-70b-instruct', name: 'Llama 3.3 70B Instruct (NVIDIA)', provider: 'nvidia', context_length: 131072, promptPrice: 0, vision: false },
  // ── Mistral (NVIDIA hosted) ────────────────────────────────────────────
  { id: 'nvidia/mistral-7b-instruct-v0.3', apiId: 'mistralai/mistral-7b-instruct-v0.3', name: 'Mistral 7B Instruct v0.3 (NVIDIA)', provider: 'nvidia', context_length: 32768, promptPrice: 0, vision: false },
  { id: 'nvidia/mistral-nemo-12b-instruct', apiId: 'mistralai/mistral-nemo-12b-instruct', name: 'Mistral NeMo 12B Instruct (NVIDIA)', provider: 'nvidia', context_length: 131072, promptPrice: 0, vision: false },
  // ── Gemma (NVIDIA hosted) ──────────────────────────────────────────────
  { id: 'nvidia/gemma-2-9b-it', apiId: 'google/gemma-2-9b-it', name: 'Gemma 2 9B IT (NVIDIA)', provider: 'nvidia', context_length: 8192, promptPrice: 0, vision: false },
  { id: 'nvidia/gemma-2-27b-it', apiId: 'google/gemma-2-27b-it', name: 'Gemma 2 27B IT (NVIDIA)', provider: 'nvidia', context_length: 8192, promptPrice: 0, vision: false },
  // ── Phi / Other ─────────────────────────────────────────────────────────
  { id: 'nvidia/phi-3-mini-4k-instruct', apiId: 'microsoft/phi-3-mini-4k-instruct', name: 'Phi-3 Mini 4K Instruct (NVIDIA)', provider: 'nvidia', context_length: 4096, promptPrice: 0, vision: false },
  { id: 'nvidia/phi-3-medium-128k-instruct', apiId: 'microsoft/phi-3-medium-128k-instruct', name: 'Phi-3 Medium 128K Instruct (NVIDIA)', provider: 'nvidia', context_length: 131072, promptPrice: 0, vision: false },
];

const HUGGINGFACE_MODELS = [
  { id: 'huggingface/Qwen/Qwen2.5-3B-Instruct', apiId: 'Qwen/Qwen2.5-3B-Instruct', name: 'Qwen 2.5 3B Instruct (Free)', provider: 'huggingface', context_length: 32768, promptPrice: 0, vision: false },
  { id: 'huggingface/microsoft/Phi-3-mini-4k-instruct', apiId: 'microsoft/Phi-3-mini-4k-instruct', name: 'Phi-3 Mini 4K Instruct (Free)', provider: 'huggingface', context_length: 4096, promptPrice: 0, vision: false },
  { id: 'huggingface/HuggingFaceH4/zephyr-7b-beta', apiId: 'HuggingFaceH4/zephyr-7b-beta', name: 'Zephyr 7B Beta (Free)', provider: 'huggingface', context_length: 8192, promptPrice: 0, vision: false },
  { id: 'huggingface/TinyLlama/TinyLlama-1.1B-Chat-v1.0', apiId: 'TinyLlama/TinyLlama-1.1B-Chat-v1.0', name: 'TinyLlama 1.1B Chat (Free)', provider: 'huggingface', context_length: 2048, promptPrice: 0, vision: false },
  { id: 'huggingface/mistralai/Mistral-7B-Instruct-v0.3', apiId: 'mistralai/Mistral-7B-Instruct-v0.3', name: 'Mistral 7B Instruct v0.3 (Free)', provider: 'huggingface', context_length: 32768, promptPrice: 0, vision: false },
];

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 3: MODEL CATALOG
// ═══════════════════════════════════════════════════════════════════════════

async function loadModelCatalog() {
  // Serve from cache instantly if it's fresh, then refresh in the background
  // so the list is never empty/blank on open, but also never goes stale for long.
  try {
    const cached = await chrome.storage.local.get([MODEL_CACHE_KEY]);
    const c = cached[MODEL_CACHE_KEY];
    if (c && c.models && (Date.now() - c.fetchedAt) < MODEL_CACHE_TTL_MS) {
      allModels = c.models;
      renderModelList();
    }
  } catch (_) {}

  try {
    const res = await fetch('https://openrouter.ai/api/v1/models');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const models = (json.data || [])
      .filter(m => (m.architecture?.input_modalities || []).includes('text')) // keep the list to models Viora can actually use
      .map(m => ({
        id: m.id,
        name: m.name || m.id,
        provider: providerOf(m.id),
        context_length: m.context_length || m.top_provider?.context_length || null,
        promptPrice: m.pricing?.prompt ? parseFloat(m.pricing.prompt) : null,
        vision: (m.architecture?.input_modalities || []).includes('image'),
      }))
      .sort((a, b) => providerLabel(a.provider).localeCompare(providerLabel(b.provider)) || a.name.localeCompare(b.name));
    const merged = mergeExtraModels(models);
    allModels = merged;
    await chrome.storage.local.set({ [MODEL_CACHE_KEY]: { models: merged, fetchedAt: Date.now() } });
    renderModelList();
  } catch (e) {
    if (!allModels.length) {
      allModels = mergeExtraModels([]);
      renderModelList();
      modelListStatus.textContent = `Couldn't load full model list (${e.message}). Groq & NVIDIA models still available.`;
    }
  }
}

function mergeExtraModels(models) {
  const existing = new Set(models.map(m => m.id));
  const localToAdd = LOCAL_MODELS.filter(l => !existing.has(l.id));
  const groqToAdd = GROQ_MODELS.filter(g => !existing.has(g.id));
  const nvidiaToAdd = NVIDIA_MODELS.filter(n => !existing.has(n.id));
  const huggingFaceToAdd = HUGGINGFACE_MODELS.filter(h => !existing.has(h.id));
  if (!localToAdd.length && !groqToAdd.length && !nvidiaToAdd.length && !huggingFaceToAdd.length) return models;
  return [...models, ...localToAdd, ...groqToAdd, ...nvidiaToAdd, ...huggingFaceToAdd].sort((a, b) => providerLabel(a.provider).localeCompare(providerLabel(b.provider)) || a.name.localeCompare(b.name));
}

function formatContext(n) {
  if (!n) return '';
  if (n >= 1000) return `${Math.round(n / 1000)}K ctx`;
  return `${n} ctx`;
}

function formatPrice(p) {
  if (p === null || p === undefined) return '';
  const perM = p * 1_000_000;
  if (perM === 0) return 'free';
  return `$${perM < 1 ? perM.toFixed(2) : perM.toFixed(1)}/M`;
}

function renderModelList(filter = '') {
  const q = filter.trim().toLowerCase();
  let base = q
    ? allModels.filter(m => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q) || providerLabel(m.provider).toLowerCase().includes(q))
    : allModels;

  if (modelFilter === 'free') {
    base = base.filter(m => (typeof m.promptPrice === 'number' && m.promptPrice === 0) || m.provider === 'local');
  } else if (modelFilter === 'openrouter') {
    base = base.filter(m => m.provider === 'openrouter' || m.id === AUTO_MODEL);
  } else if (modelFilter === 'groq') {
    base = base.filter(m => m.provider === 'groq');
  } else if (modelFilter === 'nvidia') {
    base = base.filter(m => m.provider === 'nvidia');
  } else if (modelFilter === 'huggingface') {
    base = base.filter(m => m.provider === 'huggingface');
  }

  const filtered = base;

  modelCountEl.textContent = allModels.length ? `${allModels.length}+ available` : '';
  modelListStatus.style.display = 'none';
  modelListEl.style.display = 'block';
  modelListEl.innerHTML = '';

  // Auto is always pinned at the top, filter or not — it's the sane default.
  if (!q || 'auto'.includes(q) || 'openrouter'.includes(q)) {
    modelListEl.appendChild(buildModelRow({
      id: AUTO_MODEL, name: 'Auto (recommended)', provider: 'openrouter',
      context_length: null, promptPrice: null, vision: true,
    }, true));
  }

  if (!filtered.length) {
    const empty = document.createElement('div');
    empty.className = 'model-list-status';
    empty.textContent = q ? `No models matching "${filter}"` : `No ${modelFilter === 'all' ? 'models' : modelFilter} models available.`;
    modelListEl.appendChild(empty);
    return;
  }

  let lastProvider = null;
  for (const m of filtered) {
    if (m.provider !== lastProvider) {
      const header = document.createElement('div');
      header.className = 'model-group-header';
      header.textContent = providerLabel(m.provider);
      modelListEl.appendChild(header);
      lastProvider = m.provider;
    }
    modelListEl.appendChild(buildModelRow(m, false));
  }
  updateApiKeyModelBadge();
}

function buildModelRow(m, isAuto) {
  const row = document.createElement('div');
  row.className = 'model-row' + (m.id === selectedModel ? ' selected' : '');
  row.dataset.modelId = m.id;

  const main = document.createElement('div');
  main.className = 'model-row-main';
  const name = document.createElement('div');
  name.className = 'model-row-name';
  name.textContent = m.name;
  main.appendChild(name);

  const meta = document.createElement('div');
  meta.className = 'model-row-meta';
  const bits = [];
  if (!isAuto) bits.push(m.id);
  if (m.context_length) bits.push(formatContext(m.context_length));
  const price = formatPrice(m.promptPrice);
  if (price) bits.push(price);
  if (m.vision) bits.push('vision');
  meta.textContent = bits.join(' · ');
  main.appendChild(meta);
  row.appendChild(main);

  const check = document.createElement('div');
  check.className = 'model-row-check';
  check.innerHTML = m.id === selectedModel
    ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>'
    : '';
  row.appendChild(check);

  row.addEventListener('click', () => selectModel(m.id));
  return row;
}

async function selectModel(id) {
  providerOverride = null;
  selectedModel = id;
  await chrome.storage.local.set({ model: id });
  document.querySelectorAll('.model-row').forEach(r => {
    const isSel = r.dataset.modelId === id;
    r.classList.toggle('selected', isSel);
    r.querySelector('.model-row-check').innerHTML = isSel
      ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>'
      : '';
  });
  const prov = providerOfSelected();
  const data = await chrome.storage.local.get([`apiKey_${prov}`, 'apiKey']);
  const provKey = data[`apiKey_${prov}`] || data.apiKey || '';
  apiKeyInput.value = provKey;
  if (provKey) hideKeyPrompt(); else showKeyPrompt();
  updateApiKeyModelBadge();
  showFeedback('✓ Model updated');
}

modelSearch.addEventListener('input', () => renderModelList(modelSearch.value));

document.querySelectorAll('.filter-pill').forEach(button => {
  button.addEventListener('click', () => {
    modelFilter = button.dataset.modelFilter || 'all';
    document.querySelectorAll('.filter-pill').forEach(b => b.classList.toggle('active', b === button));
    renderModelList(modelSearch.value || '');
  });
});

document.querySelectorAll('.free-model-card').forEach(button => {
  button.addEventListener('click', async () => {
    const model = button.dataset.freeModel;
    if (!model) return;
    providerOverride = null;
    selectedModel = model;
    await chrome.storage.local.set({ model });
    apiKeyInput.value = '';
    showKeyPrompt();
    updateApiKeyModelBadge();
    document.querySelectorAll('.free-model-card').forEach(card => card.classList.toggle('selected', card === button));
    showFeedback('Model selected — add your provider key to connect');
  });
});

const GROQ_FREE_MODEL = 'groq/llama-3.1-8b-instant';
const freeGroqButton = document.createElement('button');
freeGroqButton.type = 'button';
freeGroqButton.className = 'free-model-card';
freeGroqButton.dataset.freeModel = GROQ_FREE_MODEL;
freeGroqButton.dataset.freeKey = 'free';
freeGroqButton.innerHTML = `
  <span class="free-model-sparkle">✦</span>
  <span><strong>Free chat</strong><small>Llama 3.1 8B Instant · Groq</small></span>
`;
freeGroqButton.addEventListener('click', async () => {
  providerOverride = null;
  selectedModel = GROQ_FREE_MODEL;
  await chrome.storage.local.set({ model: GROQ_FREE_MODEL });
  apiKeyInput.value = '';
  showKeyPrompt();
  updateApiKeyModelBadge();
  document.querySelectorAll('.free-model-card').forEach(card => card.classList.toggle('selected', card === freeGroqButton));
  showFeedback('Free Groq model selected — add your Groq API key');
});
const freeGrid = document.getElementById('freeModelGrid');
if (freeGrid && ![...freeGrid.querySelectorAll('.free-model-card')].some(card => card.dataset.freeModel === GROQ_FREE_MODEL)) {
  freeGrid.appendChild(freeGroqButton);
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 4: SETTINGS PERSISTENCE (load / save)
// ═══════════════════════════════════════════════════════════════════════════

async function loadSettings() {
  const data = await chrome.storage.local.get([
    'apiKey', 'apiKey_openrouter', 'apiKey_groq', 'apiKey_openai', 'apiKey_deepseek', 'apiKey_mistralai', 'apiKey_nvidia', 'apiKey_huggingface',
    'autoScreenshot', 'stepScreenshots', 'fastMode', 'autoConfirmSensitive', 'model',
    'clickRipple', 'elementHighlight', 'automationStatus', 'cursorPersistTime', 'visualCursor',
    'responseDetail', 'tone', 'responseLanguage', 'autoWebSearch', 'persistMemory', 'retryOnFailure', 'maxSteps'
  ]);
  selectedModel = data.model || DEFAULT_LOCAL_MODEL;
  const prov = providerOfSelected();
  const provKey = data[`apiKey_${prov}`] || data.apiKey || '';
  if (provKey) { apiKeyInput.value = provKey; hideKeyPrompt(); }
  autoScreenshot.checked = data.autoScreenshot !== false;
  stepScreenshots.checked = data.stepScreenshots !== false;
  fastMode.checked = data.fastMode === true;
  autoConfirmSensitive.checked = data.autoConfirmSensitive === true;
  clickRipple.checked = data.clickRipple !== false;
  elementHighlight.checked = data.elementHighlight !== false;
  automationStatus.checked = data.automationStatus !== false;
  cursorPersistTime.value = data.cursorPersistTime || 800;
  visualCursor.checked = data.visualCursor !== false;
  if (responseDetail) responseDetail.value = data.responseDetail || 'balanced';
  if (tone) tone.value = data.tone || 'friendly';
  if (responseLanguage) responseLanguage.value = data.responseLanguage || 'auto';
  if (autoWebSearch) autoWebSearch.checked = data.autoWebSearch !== false;
  if (persistMemory) persistMemory.checked = data.persistMemory !== false;
  if (retryOnFailure) retryOnFailure.checked = data.retryOnFailure !== false;
  if (maxSteps) maxSteps.value = data.maxSteps || 25;
  updateApiKeyModelBadge();
  loadModelCatalog();
  applyProviderQueryParam();
}

// Coming from the side panel's "Connect Your First AI Provider" onboarding
// card (settings.html?provider=openai etc.) — jump straight to that
// provider's key field without forcing a specific model choice yet.
function applyProviderQueryParam() {
  const prov = new URLSearchParams(window.location.search).get('provider');
  if (!prov || !PROVIDER_API_ENDPOINTS[prov]) return;

  providerOverride = prov;
  chrome.storage.local.get([`apiKey_${prov}`]).then(data => {
    const provKey = data[`apiKey_${prov}`] || '';
    apiKeyInput.value = provKey;
    if (provKey) hideKeyPrompt(); else showKeyPrompt();
    updateApiKeyModelBadge();
    document.getElementById('section-api-key')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    apiKeyInput.focus();
  });
}

async function saveSettings(requireKey = true) {
  await chrome.storage.local.set({
    autoScreenshot: autoScreenshot.checked,
    stepScreenshots: stepScreenshots.checked,
    fastMode: fastMode.checked,
    autoConfirmSensitive: autoConfirmSensitive.checked,
    clickRipple: clickRipple.checked,
    elementHighlight: elementHighlight.checked,
    automationStatus: automationStatus.checked,
    cursorPersistTime: parseInt(cursorPersistTime.value) || 800,
    visualCursor: visualCursor.checked,
    responseDetail: responseDetail ? responseDetail.value : 'balanced',
    tone: tone ? tone.value : 'friendly',
    responseLanguage: responseLanguage ? responseLanguage.value : 'auto',
    autoWebSearch: autoWebSearch ? autoWebSearch.checked : true,
    persistMemory: persistMemory ? persistMemory.checked : true,
    retryOnFailure: retryOnFailure ? retryOnFailure.checked : true,
    maxSteps: maxSteps ? (parseInt(maxSteps.value) || 25) : 25
  });

  if (!requireKey) { showFeedback('✓ Saved!'); return; }

  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) { showFeedback('⚠ API key is required', 'error'); apiKeyInput.focus(); return; }
  const prov = providerOfSelected();
  await chrome.storage.local.set({ [`apiKey_${prov}`]: apiKey, apiKey });
  showFeedback('✓ Saved!');
}

function showFeedback(msg, type = 'success') {
  saveFeedback.textContent = msg;
  saveFeedback.style.color = type === 'error' ? 'var(--red)' : 'var(--accent-2)';
  saveFeedback.style.opacity = '1';
  setTimeout(() => { saveFeedback.style.opacity = '0'; }, 2500);
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 5: UI HELPERS (theme toggle, key prompt, clipboard)
// ═══════════════════════════════════════════════════════════════════════════

const settingsThemeToggle = document.getElementById('settingsThemeToggle');
if (settingsThemeToggle) {
  settingsThemeToggle.addEventListener('click', () => {
    const root = document.documentElement;
    const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('viora-theme', next); } catch (_) {}
  });
} else { console.warn('settingsThemeToggle not found'); }

function showKeyPrompt() {
  if (!apiKeyInput.value.trim()) { keyPrompt.style.display = 'flex'; apiKeyInput.focus(); }
}

function hideKeyPrompt() { keyPrompt.style.display = 'none'; }

let keyVisible = false;
if (toggleKeyBtn) toggleKeyBtn.addEventListener('click', () => {
  keyVisible = !keyVisible;
  if (apiKeyInput) apiKeyInput.type = keyVisible ? 'text' : 'password';
  const eye = toggleKeyBtn.querySelector('#eyeIcon');
  if (eye) eye.innerHTML = keyVisible
    ? `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>`
    : `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`;
});

// ─── CHAT HISTORY ───────────────────────────────────────────────────────────

function escapeHtml(str) { return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

function relativeTime(ts) {
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(ts).toLocaleDateString();
}

let chatSessions = [];

async function loadChatHistory() {
  try {
    const data = await chrome.storage.local.get(['chatSessions']);
    chatSessions = Array.isArray(data.chatSessions) ? data.chatSessions : [];
  } catch (_) { chatSessions = []; }
  renderHistoryList();
}

function renderHistoryList() {
  historyCountEl.textContent = chatSessions.length ? String(chatSessions.length) : '';
  if (!chatSessions.length) {
    historyListStatus.textContent = 'No past chats yet — conversations you have in the side panel will show up here.';
    historyListStatus.style.display = 'block';
    historyListEl.style.display = 'none';
    clearHistoryBtn.style.display = 'none';
    return;
  }
  historyListStatus.style.display = 'none';
  historyListEl.style.display = 'block';
  clearHistoryBtn.style.display = 'block';

  historyListEl.innerHTML = chatSessions.map(s => `
    <div class="history-item" data-id="${escapeHtml(s.id)}">
      <div class="history-row">
        <div class="history-row-main">
          <div class="history-row-title">${escapeHtml(s.title || 'New chat')}</div>
          <div class="history-row-meta">${relativeTime(s.updatedAt)} · ${s.messageCount || s.messages?.length || 0} message${(s.messageCount||0) === 1 ? '' : 's'}</div>
        </div>
        <div class="history-row-actions">
          <button class="history-expand-btn" title="View transcript" data-id="${escapeHtml(s.id)}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transition:transform 0.15s"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <button class="history-delete-btn" title="Delete" data-id="${escapeHtml(s.id)}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>
      <div class="history-transcript" id="transcript-${escapeHtml(s.id)}">
        ${(s.messages || []).map(m => `<div class="history-turn"><span class="history-turn-role">${m.role === 'user' ? 'You' : 'Viora'}</span><span class="history-turn-text">${escapeHtml(m.text)}</span></div>`).join('') || '<div class="history-turn"><span class="history-turn-text">No text content saved for this chat.</span></div>'}
      </div>
    </div>
  `).join('');

  historyListEl.querySelectorAll('.history-row').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('.history-delete-btn')) return;
      const id = row.closest('.history-item').dataset.id;
      const transcript = document.getElementById(`transcript-${CSS.escape(id)}`);
      const btn = row.querySelector('.history-expand-btn');
      if (!transcript) return;
      const willOpen = !transcript.classList.contains('open');
      transcript.classList.toggle('open', willOpen);
      btn.classList.toggle('open', willOpen);
    });
  });

  historyListEl.querySelectorAll('.history-delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      chatSessions = chatSessions.filter(s => s.id !== id);
      await chrome.storage.local.set({ chatSessions });
      renderHistoryList();
    });
  });
}

if (clearHistoryBtn) clearHistoryBtn.addEventListener('click', async () => {
  if (!confirm('Delete all saved chat history? This can\'t be undone.')) return;
  chatSessions = [];
  await chrome.storage.local.set({ chatSessions: [] });
  renderHistoryList();
  showFeedback('✓ History cleared');
});

if (chrome.storage.onChanged) chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.chatSessions) try { loadChatHistory(); } catch (_) {}
  if (changes.workflowTemplates) try { loadWorkflows(); } catch (_) {}
  if (changes.scheduledTasks) try { loadScheduledTasks(); } catch (_) {}
  if (changes.dataVault) try { loadVault(); } catch (_) {}
  if (changes.blockedDomains || changes.allowedDomains) try { loadDomains(); } catch (_) {}
});

try { loadChatHistory(); } catch (_) {}

// ─── TEST API KEY ──────────────────────────────────────────────────────
const testKeyBtn = document.getElementById('testKeyBtn');
const keyTestResult = document.getElementById('keyTestResult');

function guessProvider(key) {
  if (key.startsWith('gsk_')) return 'groq';
  if (key.startsWith('hf_')) return 'huggingface';
  if (key.startsWith('sk-or-')) return 'openrouter';
  if (key.startsWith('sk-proj-') || key.startsWith('sk-svc-')) return 'openai';
  if (key.startsWith('nvapi-')) return 'nvidia';
  if (key.startsWith('sk-')) return 'openrouter';
  if (key.startsWith('s46_')) return 'mistralai';
  return null;
}

// Real "list models" endpoints — one authenticated GET call per provider tells us
// exactly which models this specific key can use. Far cheaper and more accurate
// than firing a chat-completion request per candidate model.
const PROVIDER_LIST_MODELS_ENDPOINTS = {
  groq: 'https://api.groq.com/openai/v1/models',
  openai: 'https://api.openai.com/v1/models',
  deepseek: 'https://api.deepseek.com/v1/models',
  mistralai: 'https://api.mistral.ai/v1/models',
  nvidia: 'https://integrate.api.nvidia.com/v1/models',
};

async function checkHuggingFaceKey(key) {
  try {
    const res = await fetch('https://huggingface.co/api/whoami-v2', {
      headers: { 'Authorization': `Bearer ${key}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { ok: false, status: res.status };
    return {
      ok: true,
      allAvailable: true,
      models: HUGGINGFACE_MODELS.map(m => ({ id: m.id, label: m.name })),
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function checkOpenRouterKey(key) {
  // OpenRouter doesn't gate individual models per key (access depends on account
  // credit, not the key itself) — so the right "test" is just: is this key valid?
  // If so, the whole cached catalog is what it unlocks.
  try {
    const res = await fetch('https://openrouter.ai/api/v1/auth/key', {
      headers: { 'Authorization': `Bearer ${key}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { ok: false, status: res.status };
    const openRouterModels = allModels.filter(m => m.provider !== 'groq' && m.provider !== 'nvidia');
    return {
      ok: true,
      allAvailable: true,
      models: openRouterModels.map(m => ({ id: m.id, label: m.name })),
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function checkDirectProviderKey(provider, key) {
  const endpoint = PROVIDER_LIST_MODELS_ENDPOINTS[provider];
  try {
    const res = await fetch(endpoint, {
      headers: { 'Authorization': `Bearer ${key}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { ok: false, status: res.status };
    const json = await res.json();
    const rawList = (json.data || json.models || []).map(m => m.id || m.name).filter(Boolean);

    if (provider === 'groq' || provider === 'nvidia') {
      // Match against our curated catalog (which has the friendly name + the
      // pre-mapped GROQ_API_MODEL_IDS/NVIDIA_API_MODEL_IDS routing entry) so
      // clicking a result Just Works with the existing routing tables.
      const curated = provider === 'groq' ? GROQ_MODELS : NVIDIA_MODELS;
      const rawSet = new Set(rawList);
      const matched = curated.filter(m => rawSet.has(m.apiId));
      const known = new Set(matched.map(m => m.apiId));
      const extra = rawList.filter(id => !known.has(id));
      return {
        ok: true,
        models: [
          ...matched.map(m => ({ id: m.id, label: m.name })),
          ...extra.map(id => ({ id: `${provider}/${id}`, label: id })),
        ],
      };
    }

    // openai / deepseek / mistralai — namespace as "<provider>-direct/<id>" so this
    // can never collide with OpenRouter's own catalog ids for the same provider
    // prefix (see routingProviderOf's comment for why that collision used to break
    // things). Keep it to chat-capable-looking models so the list isn't cluttered
    // with embeddings/moderation/whisper/etc. entries.
    const filtered = rawList.filter(id => !/embed|whisper|tts|moderation|dall-e|davinci-edit/i.test(id));
    return {
      ok: true,
      models: filtered.map(id => ({ id: `${provider}-direct/${id}`, label: id })),
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function checkKeyForProvider(provider, key) {
  if (provider === 'openrouter') return checkOpenRouterKey(key);
  if (provider === 'huggingface') return checkHuggingFaceKey(key);
  return checkDirectProviderKey(provider, key);
}

async function testKey() {
  const key = apiKeyInput.value.trim();
  if (!key) { keyTestResult.innerHTML = 'Enter a key first'; return; }
  testKeyBtn.disabled = true;
  testKeyBtn.textContent = 'Testing…';
  keyTestResult.innerHTML = '<span class="key-test-loading">Checking which models this key unlocks…</span>';

  const guessed = guessProvider(key);
  const candidates = guessed ? [guessed] : Object.keys({ openrouter: 1, huggingface: 1, ...PROVIDER_LIST_MODELS_ENDPOINTS });

  const results = await Promise.all(
    candidates.map(async (provider) => ({ provider, ...(await checkKeyForProvider(provider, key)) }))
  );
  const working = results.filter(r => r.ok);

  keyTestResult.innerHTML = '';
  if (!working.length) {
    keyTestResult.innerHTML = '<span class="failing">❌ No provider accepted this key</span>';
    testKeyBtn.disabled = false;
    testKeyBtn.textContent = '🔍 Test Key';
    return;
  }

  for (const r of working) {
    const block = document.createElement('div');
    block.className = 'key-test-provider-block';

    const header = document.createElement('div');
    header.innerHTML = `<span class="provider-label">${providerLabel(r.provider)}</span> <span class="working">✅ ${r.models.length} model${r.models.length === 1 ? '' : 's'} available</span>`;
    block.appendChild(header);

    const list = document.createElement('div');
    list.className = 'key-test-model-list';
    for (const m of r.models.slice(0, 30)) {
      const chip = document.createElement('span');
      chip.className = 'model-item clickable';
      chip.textContent = m.label;
      chip.title = 'Click to use this model';
      chip.addEventListener('click', async () => {
        await chrome.storage.local.set({ [`apiKey_${r.provider}`]: key, apiKey: key });
        if (!allModels.some(am => am.id === m.id)) {
          allModels = [...allModels, { id: m.id, name: m.label, provider: r.provider, context_length: null, promptPrice: null, vision: false }];
        }
        await selectModel(m.id);
        renderModelList(modelSearch.value);
        showFeedback(`✓ Using ${m.label}`);
      });
      list.appendChild(chip);
    }
    block.appendChild(list);
    keyTestResult.appendChild(block);
  }

  testKeyBtn.disabled = false;
  testKeyBtn.textContent = '🔍 Test Key';
}

if (testKeyBtn) testKeyBtn.addEventListener('click', testKey);

const safeToggle = (el, fn) => { 
  if (el) el.addEventListener('change', async () => {
    fn();
    // Send visual settings to content.js
    if (el.id === 'clickRipple' || el.id === 'elementHighlight' || el.id === 'automationStatus' || el.id === 'cursorPersistTime' || el.id === 'visualCursor') {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'UPDATE_VISUAL_SETTINGS',
            clickRipple: clickRipple?.checked,
            elementHighlight: elementHighlight?.checked,
            automationStatus: automationStatus?.checked,
            cursorPersistTime: cursorPersistTime?.value,
            visualCursor: visualCursor?.checked
          });
        }
      } catch (_) {}
    }
  });
};
safeToggle(autoScreenshot, () => saveSettings(false));
safeToggle(stepScreenshots, () => saveSettings(false));
safeToggle(fastMode, () => saveSettings(false));
safeToggle(autoConfirmSensitive, () => saveSettings(false));
safeToggle(clickRipple, () => saveSettings(false));
safeToggle(elementHighlight, () => saveSettings(false));
safeToggle(automationStatus, () => saveSettings(false));
safeToggle(cursorPersistTime, () => saveSettings(false));
safeToggle(visualCursor, () => saveSettings(false));
safeToggle(cursorPersistTime, () => saveSettings(false));
if (saveBtn) saveBtn.addEventListener('click', () => saveSettings(true));
if (apiKeyInput) {
  apiKeyInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveSettings(true); });
  apiKeyInput.addEventListener('input', () => { if (apiKeyInput.value.trim()) hideKeyPrompt(); });
}

// AI Behavior toggles / selects persist immediately (no key required)
safeToggle(responseDetail, () => saveSettings(false));
safeToggle(tone, () => saveSettings(false));
safeToggle(responseLanguage, () => saveSettings(false));
safeToggle(autoWebSearch, () => saveSettings(false));
safeToggle(persistMemory, () => saveSettings(false));
safeToggle(retryOnFailure, () => saveSettings(false));
safeToggle(maxSteps, () => saveSettings(false));

// ─── Instructions.md loader + minimal markdown renderer ───────────────────
function renderMarkdown(md) {
  const base = (chrome.runtime && chrome.runtime.getURL) ? chrome.runtime.getURL('') : '';
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  let html = '', i = 0;
  const inline = (t) => escapeHtml(t)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+?)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, txt, url) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(txt)}</a>`);
  while (i < lines.length) {
    let line = lines[i];
    if (/^#{1,6}\s/.test(line)) {
      const lvl = line.match(/^#+/)[0].length;
      html += `<h${lvl} class="in-h${lvl}">${inline(line.replace(/^#+\s/, ''))}</h${lvl}>`;
      i++; continue;
    }
    if (/^!\[[^\]]*\]\(([^)]+)\)\s*$/.test(line)) {
      const m = line.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/);
      const src = m[2].startsWith('http') ? m[2] : base + m[2].replace(/^\.?\//, '');
      html += `<figure class="in-figure"><img src="${escapeHtml(src)}" alt="${escapeHtml(m[1])}" /><figcaption>${escapeHtml(m[1])}</figcaption></figure>`;
      i++; continue;
    }
    if (/^\s*[-*]\s+\[[ x]\]\s/.test(line)) { // task list
      const txt = line.replace(/^\s*[-*]\s+\[[ x]\]\s/, '');
      html += `<li class="in-task">${inline(txt)}</li>`; i++; continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      let items = '';
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { items += `<li>${inline(lines[i].replace(/^\s*[-*]\s+/, ''))}</li>`; i++; }
      html += `<ul class="in-ul">${items}</ul>`; continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      let items = '';
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { items += `<li>${inline(lines[i].replace(/^\s*\d+\.\s+/, ''))}</li>`; i++; }
      html += `<ol class="in-ol">${items}</ol>`; continue;
    }
    if (/^\s*>\s?/.test(line)) {
      let quote = '';
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) { quote += inline(lines[i].replace(/^\s*>\s?/, '')) + ' '; i++; }
      html += `<blockquote class="in-quote">${quote}</blockquote>`; continue;
    }
    if (/^\s*\|/.test(line) && lines[i + 1] && /^\s*\|?[\s:|-]+\|/.test(lines[i + 1])) {
      const head = line.split('|').map(c => c.trim()).filter(Boolean);
      i += 2;
      let rows = '';
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        const cells = lines[i].split('|').map(c => c.trim()).filter(Boolean);
        rows += `<tr>${cells.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`; i++;
      }
      html += `<table class="in-table"><thead><tr>${head.map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`; continue;
    }
    if (line.trim() === '') { i++; continue; }
    let para = '';
    while (i < lines.length && lines[i].trim() !== '' && !/^(#{1,6}\s|!\[|\s*[-*]\s|\s*\d+\.\s|\s*>\s?|\s*\|)/.test(lines[i])) { para += (para ? ' ' : '') + lines[i]; i++; }
    html += `<p class="in-p">${inline(para)}</p>`;
  }
  return html;
}
async function loadInstructions() {
  if (!instructionsContent) return;
  try {
    const url = chrome.runtime.getURL('Instructions.md');
    const res = await fetch(url);
    const md = await res.text();
    instructionsContent.innerHTML = renderMarkdown(md);
  } catch (e) {
    instructionsContent.innerHTML = `<div class="instructions-loading">Could not load Instructions.md (${escapeHtml(e.message)}).</div>`;
  }
}
if (reloadInstructionsBtn) reloadInstructionsBtn.addEventListener('click', loadInstructions);

try { loadSettings(); } catch (_) {}
loadInstructions();


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 6: AUTO-FILL PROFILE (DATA VAULT)
// ═══════════════════════════════════════════════════════════════════════════

const vaultFields = {
  firstName: 'vaultFirstName', lastName: 'vaultLastName', fullName: 'vaultFullName',
  email: 'vaultEmail', phone: 'vaultPhone', company: 'vaultCompany', title: 'vaultTitle',
};
const vaultAddrFields = { street: 'vaultStreet', city: 'vaultCity', state: 'vaultState', zip: 'vaultZip', country: 'vaultCountry' };

let vaultCustom = {};

function getEl(id) { return document.getElementById(id); }

function loadVault() {
  chrome.storage.local.get(['dataVault']).then(data => {
    const v = data.dataVault || { profile: {}, custom: {} };
    const p = v.profile || {};
    for (const [key, elId] of Object.entries(vaultFields)) {
      const el = getEl(elId);
      if (el) el.value = p[key] || '';
    }
    for (const [key, elId] of Object.entries(vaultAddrFields)) {
      const el = getEl(elId);
      if (el) el.value = (p.address || {})[key] || '';
    }
    vaultCustom = v.custom || {};
    renderVaultCustom();
    const total = Object.values(p).filter(Boolean).length + Object.keys(vaultCustom).length;
    const badge = getEl('vaultCount');
    if (badge) badge.textContent = total ? `${total} fields` : '';
  });
}

function saveVault() {
  const profile = {};
  for (const [key, elId] of Object.entries(vaultFields)) {
    const el = getEl(elId);
    if (el) profile[key] = el.value.trim();
  }
  profile.address = {};
  for (const [key, elId] of Object.entries(vaultAddrFields)) {
    const el = getEl(elId);
    if (el) profile.address[key] = el.value.trim();
  }
  const dataVault = { profile, custom: vaultCustom };
  chrome.storage.local.set({ dataVault });
  const total = Object.values(profile).filter(Boolean).length + Object.keys(vaultCustom).length;
  const badge = getEl('vaultCount');
  if (badge) badge.textContent = total ? `${total} fields` : '';
}

function renderVaultCustom() {
  const container = getEl('vaultCustomFields');
  if (!container) return;
  const keys = Object.keys(vaultCustom);
  if (!keys.length) { container.innerHTML = '<div style="font-size:11px;color:var(--text-3);">No custom fields saved yet.</div>'; return; }
  container.innerHTML = keys.map(k => `
    <div class="vault-custom-item">
      <span class="vault-key">${escapeHtml(k)}</span>
      <span class="vault-val">${escapeHtml(vaultCustom[k])}</span>
      <button class="vault-del" data-key="${escapeHtml(k)}">✕</button>
    </div>
  `).join('');
  container.querySelectorAll('.vault-del').forEach(btn => {
    btn.addEventListener('click', () => {
      delete vaultCustom[btn.dataset.key];
      saveVault();
      renderVaultCustom();
    });
  });
}

// Auto-save vault on field change
document.querySelectorAll('.vault-field').forEach(el => {
  el.addEventListener('input', saveVault);
});

const addCustomBtn = getEl('vaultAddCustom');
if (addCustomBtn) {
  addCustomBtn.addEventListener('click', () => {
    const key = getEl('vaultCustomKey');
    const val = getEl('vaultCustomVal');
    if (key && val && key.value.trim()) {
      vaultCustom[key.value.trim()] = val.value.trim();
      key.value = ''; val.value = '';
      saveVault();
      renderVaultCustom();
    }
  });
}

try { loadVault(); } catch (_) {}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 7: WORKFLOW LIBRARY
// ═══════════════════════════════════════════════════════════════════════════

let workflows = [];

function loadWorkflows() {
  chrome.storage.local.get(['workflowTemplates']).then(data => {
    workflows = Array.isArray(data.workflowTemplates) ? data.workflowTemplates : [];
    renderWorkflows();
  });
}

function renderWorkflows() {
  const count = getEl('workflowCount');
  if (count) count.textContent = workflows.length ? String(workflows.length) : '';
  const status = getEl('workflowListStatus');
  const list = getEl('workflowList');
  if (!status || !list) return;
  if (!workflows.length) {
    status.textContent = 'No workflows saved yet. Workflows are created automatically when the AI performs multi-step tasks.';
    status.style.display = 'block';
    list.style.display = 'none';
    return;
  }
  status.style.display = 'none';
  list.style.display = 'block';
  list.innerHTML = workflows.map(w => {
    const steps = (w.steps || []).map(s => escapeHtml(s.description || s.type)).join(' → ');
    const lastUsed = w.lastUsed ? relativeTime(w.lastUsed) : 'never';
    return `<div class="history-item" data-id="${escapeHtml(w.id)}">
      <div class="history-row">
        <div class="history-row-main">
          <div class="history-row-title">${escapeHtml(w.name)}</div>
          <div class="history-row-meta">${w.steps?.length || 0} step${(w.steps?.length||0) === 1 ? '' : 's'} · used ${w.runCount || 0}x · last ${lastUsed}</div>
        </div>
        <div class="history-row-actions">
          <button class="history-expand-btn" title="View steps" data-id="${escapeHtml(w.id)}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transition:transform 0.15s"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <button class="history-delete-btn" title="Delete" data-id="${escapeHtml(w.id)}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>
      <div class="history-transcript" id="wf-transcript-${escapeHtml(w.id)}">
        <div class="history-turn"><span class="history-turn-role">Intent</span><span class="history-turn-text">${escapeHtml(w.intent || '')}</span></div>
        ${(w.steps || []).map((s, i) => `<div class="history-turn"><span class="history-turn-role">Step ${i+1}</span><span class="history-turn-text">${escapeHtml(s.description || s.type)}${s.value ? ' (' + escapeHtml(String(s.value)) + ')' : ''}</span></div>`).join('')}
      </div>
    </div>`;
  }).join('');

  list.querySelectorAll('.history-row').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('.history-delete-btn')) return;
      const id = row.closest('.history-item').dataset.id;
      const transcript = getEl(`wf-transcript-${CSS.escape(id)}`);
      const btn = row.querySelector('.history-expand-btn');
      if (!transcript) return;
      const willOpen = !transcript.classList.contains('open');
      transcript.classList.toggle('open', willOpen);
      btn.classList.toggle('open', willOpen);
    });
  });

  list.querySelectorAll('.history-delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      workflows = workflows.filter(w => w.id !== id);
      chrome.storage.local.set({ workflowTemplates: workflows });
      renderWorkflows();
    });
  });
}

try { loadWorkflows(); } catch (_) {}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 8: SCHEDULED TASKS
// ═══════════════════════════════════════════════════════════════════════════

let schedTasks = [];

function loadScheduledTasks() {
  chrome.storage.local.get(['scheduledTasks']).then(data => {
    schedTasks = Array.isArray(data.scheduledTasks) ? data.scheduledTasks : [];
    renderScheduledTasks();
  });
}

function formatInterval(ms) {
  if (ms < 60000) return `${Math.round(ms/1000)}s`;
  if (ms < 3600000) return `${Math.round(ms/60000)}m`;
  if (ms < 86400000) return `${Math.round(ms/3600000)}h`;
  return `${Math.round(ms/86400000)}d`;
}

function renderScheduledTasks() {
  const count = getEl('schedCount');
  if (count) count.textContent = schedTasks.length ? String(schedTasks.length) : '';
  const status = getEl('schedListStatus');
  const list = getEl('schedList');
  if (!status || !list) return;
  if (!schedTasks.length) {
    status.textContent = 'No scheduled tasks. Create recurring tasks from the side panel.';
    status.style.display = 'block';
    list.style.display = 'none';
    return;
  }
  status.style.display = 'none';
  list.style.display = 'block';
  list.innerHTML = schedTasks.map(t => {
    const lastRun = t.lastRun ? relativeTime(t.lastRun) : 'never';
    return `<div class="history-item" data-id="${escapeHtml(t.id)}">
      <div class="history-row">
        <div class="history-row-main">
          <div class="history-row-title">${escapeHtml(t.name)}</div>
          <div class="history-row-meta">Every ${formatInterval(t.intervalMs)} · last ${lastRun}${t.url ? ' · ' + escapeHtml(t.url) : ''}</div>
        </div>
        <div class="history-row-actions" style="gap:8px;">
          <label class="toggle" style="transform:scale(0.8);" title="${t.enabled ? 'Enabled' : 'Disabled'}">
            <input type="checkbox" class="sched-toggle" data-id="${escapeHtml(t.id)}" ${t.enabled ? 'checked' : ''} />
            <span class="toggle-track"></span>
          </label>
          <button class="history-delete-btn" title="Delete" data-id="${escapeHtml(t.id)}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>
    </div>`;
  }).join('');

  list.querySelectorAll('.sched-toggle').forEach(cb => {
    cb.addEventListener('change', () => {
      const task = schedTasks.find(t => t.id === cb.dataset.id);
      if (task) { task.enabled = cb.checked; persistSchedTasks(); }
    });
  });

  list.querySelectorAll('.history-delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      schedTasks = schedTasks.filter(t => t.id !== id);
      persistSchedTasks();
      renderScheduledTasks();
    });
  });
}

function persistSchedTasks() {
  try { chrome.storage.local.set({ scheduledTasks: JSON.parse(JSON.stringify(schedTasks)) }); } catch (_) {}
}

try { loadScheduledTasks(); } catch (_) {}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 9: DOMAIN PERMISSIONS
// ═══════════════════════════════════════════════════════════════════════════

let blockedDomains = [];
let allowedDomains = [];

function loadDomains() {
  chrome.storage.local.get(['blockedDomains', 'allowedDomains']).then(data => {
    blockedDomains = data.blockedDomains || [];
    allowedDomains = data.allowedDomains || [];
    renderDomains();
  });
}

function renderDomains() {
  renderDomainList('blockedDomainList', blockedDomains, 'blocked');
  renderDomainList('allowedDomainList', allowedDomains, 'allowed');
}

function renderDomainList(containerId, list, type) {
  const container = getEl(containerId);
  if (!container) return;
  if (!list.length) {
    container.innerHTML = '<span style="font-size:11px;color:var(--text-3);">None</span>';
    return;
  }
  container.innerHTML = list.map(d => `
    <span class="perm-chip">
      ${escapeHtml(d)}
      <button class="perm-del" data-domain="${escapeHtml(d)}" data-type="${type}">✕</button>
    </span>
  `).join('');
  container.querySelectorAll('.perm-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const domain = btn.dataset.domain;
      if (btn.dataset.type === 'blocked') {
        blockedDomains = blockedDomains.filter(d => d !== domain);
      } else {
        allowedDomains = allowedDomains.filter(d => d !== domain);
      }
      persistDomains();
      renderDomains();
    });
  });
}

function addDomain(inputId, list, type) {
  const input = getEl(inputId);
  if (!input || !input.value.trim()) return;
  const d = input.value.trim().toLowerCase().replace(/^(https?:\/\/)/, '').replace(/\/.*$/, '');
  if (d && !list.includes(d)) {
    list.push(d);
    persistDomains();
    renderDomains();
  }
  input.value = '';
}

function persistDomains() {
  try { chrome.storage.local.set({ blockedDomains, allowedDomains }); } catch (_) {}
}

const addBlockedBtn = getEl('addBlockedDomain');
if (addBlockedBtn) addBlockedBtn.addEventListener('click', () => addDomain('blockedDomainInput', blockedDomains, 'blocked'));
const addAllowedBtn = getEl('addAllowedDomain');
if (addAllowedBtn) addAllowedBtn.addEventListener('click', () => addDomain('allowedDomainInput', allowedDomains, 'allowed'));
getEl('blockedDomainInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') addDomain('blockedDomainInput', blockedDomains, 'blocked'); });
getEl('allowedDomainInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') addDomain('allowedDomainInput', allowedDomains, 'allowed'); });

try { loadDomains(); } catch (_) {}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 10: DATA MANAGEMENT (EXPORT / IMPORT / CLEAR)
// ═══════════════════════════════════════════════════════════════════════════

const EXPORT_KEYS = [
  'apiKey', 'apiKey_openrouter', 'apiKey_groq', 'apiKey_openai', 'apiKey_deepseek', 'apiKey_mistralai', 'apiKey_nvidia', 'apiKey_huggingface',
  'model', 'autoScreenshot', 'stepScreenshots', 'fastMode', 'autoConfirmSensitive',
  'responseDetail', 'tone', 'responseLanguage', 'autoWebSearch', 'persistMemory', 'retryOnFailure', 'maxSteps',
  'chatSessions', 'workflowTemplates', 'scheduledTasks', 'dataVault',
  'blockedDomains', 'allowedDomains', 'auditLog', 'userPatterns'
];

getEl('exportAllBtn')?.addEventListener('click', async () => {
  const data = await chrome.storage.local.get(EXPORT_KEYS);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `viora-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click(); URL.revokeObjectURL(url);
  showFeedback('✓ Data exported');
});

getEl('importAllBtn')?.addEventListener('click', () => {
  getEl('importFileInput')?.click();
});

getEl('importFileInput')?.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    // Validate that it looks like Viora data
    if (!data || typeof data !== 'object') throw new Error('Invalid format');
    const importKeys = EXPORT_KEYS.filter(k => k in data);
    if (!importKeys.length) throw new Error('No recognizable Viora data found in file');
    const toStore = {};
    for (const k of importKeys) toStore[k] = data[k];
    await chrome.storage.local.set(toStore);
    showFeedback(`✓ Imported ${importKeys.length} data fields`);
    // Reload all sections
    try { loadVault(); loadWorkflows(); loadScheduledTasks(); loadDomains(); loadChatHistory(); loadSettings(); } catch (_) {}
  } catch (err) {
    showFeedback('⚠ Import failed: ' + err.message, 'error');
  }
  e.target.value = '';
});

getEl('clearAllDataBtn')?.addEventListener('click', async () => {
  if (!confirm('Delete ALL Viora data including workflows, tasks, profile, history, and settings? This cannot be undone.')) return;
  if (!confirm('Are you absolutely sure? All stored data will be permanently removed.')) return;
  await chrome.storage.local.clear();
  // Re-apply theme from localStorage
  try {
    const theme = localStorage.getItem('viora-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
  } catch (_) {}
  showFeedback('✓ All data cleared');
  // Reload all sections
  try { loadVault(); loadWorkflows(); loadScheduledTasks(); loadDomains(); loadChatHistory(); loadSettings(); } catch (_) {}
});

// ═══════════════════════════════════════════════════════════════════════════
// SIDEBAR NAVIGATION
// ═══════════════════════════════════════════════════════════════════════════

(function initSidebar() {
  const sidebar = document.getElementById('settingsSidebar');
  const body = document.getElementById('settingsBody');
  if (!sidebar || !body) return;

  const links = sidebar.querySelectorAll('.sidebar-link');
  const sections = [];
  links.forEach(link => {
    const id = link.getAttribute('data-section');
    const sec = id ? document.getElementById(id) : null;
    if (sec) sections.push({ link, sec });
  });

  // Click handler: smooth scroll to section
  links.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const id = link.getAttribute('data-section');
      const sec = id ? document.getElementById(id) : null;
      if (sec) {
        sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setActive(link);
      }
    });
  });

  function setActive(activeLink) {
    links.forEach(l => l.classList.remove('active'));
    activeLink.classList.add('active');
  }

  // Intersection Observer: highlight sidebar link when section scrolls into view
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const match = sections.find(s => s.sec === entry.target);
        if (match) setActive(match.link);
      }
    });
  }, {
    root: null,
    rootMargin: '-20% 0px -60% 0px',
    threshold: 0
  });

  sections.forEach(s => observer.observe(s.sec));

  // Scroll to hash on load
  if (window.location.hash) {
    const target = document.getElementById(window.location.hash.slice(1));
    if (target) {
      setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
      const match = sections.find(s => s.sec === target);
      if (match) setActive(match.link);
    }
  }
})();


