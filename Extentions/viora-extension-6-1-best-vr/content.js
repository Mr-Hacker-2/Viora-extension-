// ═══════════════════════════════════════════════════════════════════════════
// SECTION 1: ENTRY POINT & MESSAGE LISTENERS
// ═══════════════════════════════════════════════════════════════════════════

// BUG FIX: background.js's sendToTab() calls ensureContentScript() — which
// re-injects this file via chrome.scripting.executeScript — before EVERY
// single message it sends, even though the declarative content_scripts entry
// in manifest.json already loads it on page load. That means this file
// routinely runs more than once in the same page. Every top-level `let`,
// `const`, and `class` in the file used to sit outside any guard, so the
// second injection re-declared them and threw "Identifier ... has already
// been declared", which aborted the whole script (breaking clicks, typing,
// page analysis — everything). The fix is to wrap the ENTIRE file (not just
// the message-listener registration) in a single `window.__vioraLoaded`
// guard, so re-injection is a harmless no-op instead of a crash.
if (!window.__vioraLoaded) {
  window.__vioraLoaded = true;

// Visual feedback settings (loaded from storage below). These used to be
// assigned without ever being declared with let/const/var, so referencing
// them (e.g. in showClickRipple/highlightElement/createVioraCursor) threw
// "X is not defined" — and loadVisualSettings(), which sets their real
// values, was defined but never called, so they'd never even be assigned.
let visualCursorEnabled = true;
let clickRippleEnabled = true;
let elementHighlightEnabled = true;
let automationStatusEnabled = true;
let cursorPersistTime = 800;

// Load visual settings from storage (visual settings are managed in background.js)
async function loadVisualSettings() {
  try {
    const data = await chrome.storage.local.get([
      'clickRipple', 'elementHighlight', 'automationStatus', 'cursorPersistTime', 'visualCursor'
    ]);
    clickRippleEnabled = data.clickRipple !== false;
    elementHighlightEnabled = data.elementHighlight !== false;
    automationStatusEnabled = data.automationStatus !== false;
    cursorPersistTime = data.cursorPersistTime || 800;
    visualCursorEnabled = data.visualCursor !== false;
    return { success: true };
  } catch (_) {
    return;
  }
}
loadVisualSettings();

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'DOM_ACTION') {
      handleDomAction(message.action)
        .then(sendResponse)
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
    }
    if (message.type === 'GET_PAGE_CONTENT') {
      sendResponse(buildPageContent());
      return true;
    }
    if (message.type === 'ANALYZE_PAGE') {
      // Use multi-modal analysis by default (new Enhancement #1)
      sendResponse({ success: true, data: deepPageAnalysis(true) });
      return true;
    }
    if (message.type === 'SMART_CLICK') {
      // BUG FIX: this called a bare `smartClick(...)` global that never
      // existed — only `strategyEngine.smartClick(...)` (a method on the
      // StrategyEngine instance) does. Every SMART_CLICK message threw
      // "smartClick is not defined" and was silently swallowed by the catch.
      strategyEngine.smartClick(message.target)
        .then(sendResponse)
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
    }
    if (message.type === 'PING') {
      sendResponse({ alive: true });
      return true;
    }
    if (message.type === 'GET_ENHANCED_CONTENT') {
      // Enhanced content with multi-modal insights
      sendResponse(buildEnhancedContent());
      return true;
    }
    if (message.type === 'GET_VIEWPORT_STATE') {
      sendResponse({ success: true, state: getViewportState() });
      return true;
    }
    if (message.type === 'GET_ELEMENT_CONTEXT') {
      sendResponse({ success: true, data: getElementContext(message.selector || message.text || '') });
      return true;
    }
    if (message.type === 'SECURITY_CONFIRM') {
      if (window.__vioraSecurityConfirm) {
        window.__vioraSecurityConfirm.resolve(message.allowed);
        window.__vioraSecurityConfirm = null;
      }
      sendResponse({ success: true });
      return true;
    }
    if (message.type === 'START_SCREEN_CAPTURE') {
      startScreenCapture(message.streamId).then(sendResponse);
      return true;
    }
    // Multi-modal perception specific messages
    if (message.type === 'MULTIMODAL_ANALYZE') {
      sendResponse({ success: true, data: analyzePageMultimodal() });
      return true;
    }
    if (message.type === 'VISUAL_FALLBACK_ANALYZE') {
      sendResponse({ success: true, data: captureVisualState() });
      return true;
    }
    if (message.type === 'A11Y_FALLBACK_ANALYZE') {
      sendResponse({ success: true, data: analyzeA11yTree() });
      return true;
    }
    if (message.type === 'UPDATE_VISUAL_SETTINGS') {
      if (message.clickRipple !== undefined) clickRippleEnabled = message.clickRipple;
      if (message.elementHighlight !== undefined) elementHighlightEnabled = message.elementHighlight;
      if (message.automationStatus !== undefined) automationStatusEnabled = message.automationStatus;
      if (message.cursorPersistTime !== undefined) cursorPersistTime = message.cursorPersistTime;
      if (message.visualCursor !== undefined) visualCursorEnabled = message.visualCursor;
      sendResponse({ success: true });
      return true;
    }
  });

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 2: PAGE CONTENT BUILDERS
// ═══════════════════════════════════════════════════════════════════════════

function buildPageContent() {
  const text = document.body ? document.body.innerText.slice(0, 30000) : '';
  const html = document.body ? document.body.innerHTML.slice(0, 15000) : '';
  return {
    success: true,
    title: document.title,
    url: window.location.href,
    text,
    html,
    interactiveElements: extractAllInteractive()
  };
}

function buildEnhancedContent() {
  const pageType = detectPageType();
  const structure = extractPageStructure();
  const state = getViewportState();
  const modals = detectModals();
  const allInteractive = extractAllInteractive();

  return {
    success: true,
    title: document.title,
    url: window.location.href,
    text: document.body ? document.body.innerText.slice(0, 30000) : '',
    pageType,
    structure,
    state,
    modals,
    interactiveElements: allInteractive,
    forms: extractFormsDetailed(),
    analysis: deepPageAnalysis()
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 3: PAGE ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════

function detectPageType() {
  const u = window.location.href.toLowerCase();
  const t = (document.title || '').toLowerCase();
  const b = document.body;
  if (!b) return 'unknown';

  const forms = document.querySelectorAll('form').length;
  const inputs = document.querySelectorAll('input, select, textarea').length;
  const buttons = document.querySelectorAll('button, [role="button"]').length;
  const links = document.querySelectorAll('a[href]').length;
  const headings = document.querySelectorAll('h1, h2, h3').length;
  const tables = document.querySelectorAll('table').length;
  const images = document.querySelectorAll('img').length;
  const fieldsets = document.querySelectorAll('fieldset').length;

  const hasQID = !!document.querySelector('[id*="QID"]');
  const hasMatrix = !!document.querySelector('table.Matrix, table.ChoiceStructure, [class*="matrix"], [id*="matrix"]');
  const hasLikert = !!document.querySelector('[class*="likert"], [id*="likert"]');
  const hasSurveyNext = !!document.getElementById('NextButton') || !!document.querySelector('[value*="Next"], [id*="NextButton"], .NextButton, [class*="next-btn"]');
  const hasPagination = !!document.querySelector('[aria-label*="pagination"], nav[aria-label*="pagination"], .pagination, [class*="pagination"]');
  const hasLoginForm = !!document.querySelector('input[type="password"], [name*="password"], [id*="password"], [autocomplete="current-password"]');
  const hasSearchForm = !!document.querySelector('input[type="search"], [role="search"], form[action*="search"], [name="q"], [name="search"]');
  const hasNav = !!document.querySelector('nav, [role="navigation"], header nav, .nav, .navbar, [class*="nav-"]');
  const hasFooter = !!document.querySelector('footer, [role="contentinfo"]');
  const hasArticle = !!document.querySelector('article, [role="article"]');
  const hasMain = !!document.querySelector('main, [role="main"]');
  const hasCart = !!document.querySelector('[class*="cart"], [id*="cart"], [class*="basket"], [id*="basket"]');
  const hasCheckout = !!document.querySelector('[class*="checkout"], [id*="checkout"], [name*="checkout"]');
  const hasProduct = !!document.querySelector('[class*="product"], [id*="product"], [itemtype*="product"]');
  const hasDataGrid = !!document.querySelector('[role="grid"], [role="treegrid"], .data-grid, [class*="datagrid"]');
  const hasDialog = !!document.querySelector('[role="dialog"], [role="alertdialog"], dialog');

  let primary = 'unknown', secondary = [];

  if (hasSurveyNext || hasQID || hasMatrix || hasLikert || (forms > 0 && inputs > 5 && /survey|questionnaire|feedback|poll/i.test(t + u))) {
    primary = 'survey';
    secondary.push('form-filling');
  }
  if (hasLoginForm) { primary = 'login'; }
  if (hasSearchForm && inputs > 0 && links > 10) { primary = 'search-results'; secondary.push('list'); }
  if (hasProduct && hasCart) { primary = 'ecommerce-product'; secondary.push('ecommerce'); }
  if (hasCart && hasCheckout) { primary = 'checkout'; secondary.push('form-filling'); }
  if (hasArticle || headings > 3) { primary = primary === 'unknown' ? 'article' : primary; secondary.push('reading'); }
  if (hasDataGrid || tables > 1) { secondary.push('tabular-data'); }
  if (hasDialog) { secondary.push('has-dialog'); }
  if (hasNav && links > 20 && inputs === 0) { primary = primary === 'unknown' ? 'navigation' : primary; }
  if (forms === 0 && inputs === 0 && buttons <= 2 && links > 5) { primary = primary === 'unknown' ? 'content-page' : primary; }
  if (fieldsets > 0) { secondary.push('structured-forms'); }
  if (hasPagination) { secondary.push('paginated'); }
  if (hasMain) { secondary.push('has-main-content'); }
  if (hasFooter) { secondary.push('has-footer'); }
  if (/admin|dashboard|manage|control/i.test(t + u)) { primary = 'dashboard'; secondary.push('data-management'); }
  if (/settings|preferences|config/i.test(t + u)) { primary = 'settings'; secondary.push('form-filling'); }
  if (/signup|register|create.account/i.test(t + u)) { primary = 'registration'; secondary.push('form-filling'); }
  if (/profile|account|my./i.test(t + u)) { secondary.push('user-profile'); }
  if (/checkout|payment|billing|order/i.test(t + u)) { primary = 'checkout'; secondary.push('ecommerce'); }

  return {
    primary,
    secondary: [...new Set(secondary)],
    elementCounts: { forms, inputs, buttons, links, headings, tables, images },
    hasPagination,
    hasNav,
    hasModals: hasDialog
  };
}

function extractPageStructure() {
  const structure = { sections: [], nav: null, main: null, footer: null, modals: [] };

  const navEl = document.querySelector('nav, [role="navigation"]');
  if (navEl) {
    const items = [...navEl.querySelectorAll('a, button, [role="button"], [role="link"]')].map(a => ({
      text: (a.textContent || '').trim().slice(0, 40),
      href: a.href || '',
      active: a.classList.contains('active') || a.getAttribute('aria-current') === 'page'
    }));
    structure.nav = { items: items.slice(0, 30) };
  }

  const mainEl = document.querySelector('main, [role="main"], #main, .main, .content, #content');
  if (mainEl) structure.main = { tag: mainEl.tagName, id: mainEl.id || '', class: (mainEl.className && typeof mainEl.className === 'string') ? mainEl.className.slice(0, 60) : '' };

  const footerEl = document.querySelector('footer, [role="contentinfo"]');
  if (footerEl) {
    const links = [...footerEl.querySelectorAll('a[href]')].map(a => ({ text: a.textContent.trim().slice(0, 30), href: a.href }));
    structure.footer = { links: links.slice(0, 10) };
  }

  const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
  const headingParents = new Set();
  headings.forEach(h => {
    let section = h.closest('section, article, div[class*="section"], div[id*="section"], aside, [role="region"]');
    if (!section) section = h.parentElement;
    if (section && !headingParents.has(section)) {
      headingParents.add(section);
      const sectionHeadings = [...section.querySelectorAll('h1, h2, h3, h4, h5, h6')].slice(0, 3).map(hh => ({
        level: hh.tagName, text: hh.textContent.trim().slice(0, 60)
      }));
      const sectionButtons = section.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"]').length;
      const sectionInputs = section.querySelectorAll('input, select, textarea').length;
      const sectionLinks = section.querySelectorAll('a[href]').length;
      structure.sections.push({
        tag: section.tagName,
        id: section.id || '',
        class: (section.className && typeof section.className === 'string') ? section.className.slice(0, 40) : '',
        headings: sectionHeadings,
        elementCounts: { buttons: sectionButtons, inputs: sectionInputs, links: sectionLinks }
      });
    }
  });

  const dialogs = document.querySelectorAll('[role="dialog"], [role="alertdialog"], dialog, .modal, [class*="modal"], [class*="overlay"], [class*="popup"]');
  dialogs.forEach(d => {
    if (d.offsetParent !== null || window.getComputedStyle(d).display !== 'none') {
      const buttons = [...d.querySelectorAll('button, [role="button"]')].map(b => (b.textContent || b.value || '').trim().slice(0, 30));
      structure.modals.push({
        tag: d.tagName,
        id: d.id || '',
        role: d.getAttribute('role') || '',
        visible: true,
        heading: d.querySelector('h1, h2, h3, h4, h5, h6, [role="heading"]')?.textContent?.trim().slice(0, 60) || '',
        buttons: buttons.slice(0, 10)
      });
    }
  });

  return structure;
}

function getViewportState() {
  return {
    viewport: { width: window.innerWidth, height: window.innerHeight },
    scroll: { x: window.scrollX, y: window.scrollY },
    scrollableHeight: document.body ? document.body.scrollHeight : 0,
    scrollableWidth: document.body ? document.body.scrollWidth : 0,
    atTop: window.scrollY <= 0,
    atBottom: window.scrollY + window.innerHeight >= (document.body ? document.body.scrollHeight : 0),
    percentScrolled: document.body ? Math.round((window.scrollY / Math.max(document.body.scrollHeight - window.innerHeight, 1)) * 100) : 0,
    dpr: window.devicePixelRatio || 1,
    language: document.documentElement.lang || navigator.language || '',
    colorScheme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  };
}

function detectModals() {
  const modals = [];
  const selectors = [
    '[role="dialog"]', '[role="alertdialog"]', 'dialog',
    '[class*="modal"]', '[id*="modal"]',
    '[class*="overlay"]', '[id*="overlay"]',
    '[class*="popup"]', '[id*="popup"]',
    '[class*="lightbox"]', '[id*="lightbox"]',
    '[class*="drawer"]', '[id*="drawer"]'
  ];
  selectors.forEach(sel => {
    try {
      document.querySelectorAll(sel).forEach(el => {
        const cs = window.getComputedStyle(el);
        if (cs.display !== 'none' && cs.visibility !== 'hidden' && el.offsetParent !== null) {
          const heading = el.querySelector('h1, h2, h3, h4, h5, h6, [role="heading"]');
          const buttons = [...el.querySelectorAll('button, [role="button"], a')]
            .filter(b => b.offsetParent !== null)
            .map(b => ({ text: (b.textContent || b.value || '').trim().slice(0, 30), id: b.id || '' }));
          modals.push({
            tag: el.tagName, id: el.id || '',
            role: el.getAttribute('role') || '',
            heading: heading?.textContent?.trim()?.slice(0, 60) || '',
            closeButtons: buttons.filter(b => /close|cancel|dismiss|×|✕|✖|x/i.test(b.text)).slice(0, 5),
            allButtons: buttons.slice(0, 8),
            rect: rectStr(el)
          });
        }
      });
    } catch (_) {}
  });
  return modals;
}

function extractFormsDetailed() {
  const forms = [];
  document.querySelectorAll('form').forEach(f => {
    const fields = [];
    f.querySelectorAll('input, select, textarea, fieldset, button[type="submit"]').forEach(el => {
      if (el.tagName === 'FIELDSET') {
        const legend = el.querySelector('legend');
        const subFields = [...el.querySelectorAll('input, select, textarea')].map(sf => ({
          name: sf.name || sf.id || '',
          type: sf.type || sf.tagName,
          label: findLabelFor(sf),
          placeholder: sf.placeholder || '',
          required: sf.required || sf.hasAttribute('required') || sf.getAttribute('aria-required') === 'true',
          value: (sf.value || '').slice(0, 30),
          ariaLabel: sf.getAttribute('aria-label') || '',
          autocomplete: sf.getAttribute('autocomplete') || '',
          pattern: sf.getAttribute('pattern') || '',
          minLength: sf.getAttribute('minlength') || '',
          maxLength: sf.getAttribute('maxlength') || ''
        }));
        fields.push({
          type: 'fieldset',
          legend: legend?.textContent?.trim()?.slice(0, 60) || '',
          fields: subFields
        });
      } else {
        fields.push({
          name: el.name || el.id || '',
          type: el.type || el.tagName,
          label: findLabelFor(el),
          placeholder: el.placeholder || '',
          required: el.required || el.hasAttribute('required') || el.getAttribute('aria-required') === 'true',
          value: (el.value || '').slice(0, 30),
          ariaLabel: el.getAttribute('aria-label') || '',
          autocomplete: el.getAttribute('autocomplete') || '',
          pattern: el.getAttribute('pattern') || '',
          minLength: el.getAttribute('minlength') || '',
          maxLength: el.getAttribute('maxlength') || ''
        });
      }
    });
    forms.push({
      id: f.id || '',
      name: f.getAttribute('name') || '',
      action: f.action || '',
      method: f.method || 'get',
      fields,
      submitButtons: [...f.querySelectorAll('button[type="submit"], input[type="submit"], input[type="button"], [role="button"]')].map(b => ({
        text: (b.textContent || b.value || '').trim().slice(0, 40),
        id: b.id || ''
      }))
    });
  });
  return forms;
}

function getElementContext(query) {
  let el = null;
  if (typeof query === 'string') {
    el = document.querySelector(query) ||
         document.getElementById(query.replace('#', '')) ||
         document.querySelector(`[name="${cssEsc(query)}"]`) ||
         document.querySelector(`[aria-label="${cssEsc(query)}"]`);
  }
  if (!el) return { found: false };

  const rect = el.getBoundingClientRect();
  const nearLabels = [];
  const parentLabels = el.closest('label');
  if (parentLabels) nearLabels.push(parentLabels.textContent.trim().slice(0, 60));

  const labelFor = el.id ? document.querySelector(`label[for="${cssEsc(el.id)}"]`) : null;
  if (labelFor) nearLabels.push(labelFor.textContent.trim().slice(0, 60));

  let heading = null;
  let hEl = el;
  while (hEl && hEl !== document.body) {
    const h = hEl.querySelector('h1, h2, h3, h4, h5, h6, [role="heading"]');
    if (h) { heading = { level: h.tagName, text: h.textContent.trim().slice(0, 60) }; break; }
    hEl = hEl.parentElement;
  }
  if (!heading) {
    const allH = document.querySelectorAll('h1, h2, h3, h4');
    let bestDist = Infinity;
    allH.forEach(h => {
      const hr = h.getBoundingClientRect();
      const dist = Math.abs(hr.top - rect.top);
      if (dist < bestDist && hr.top < rect.bottom + 100) {
        bestDist = dist;
        heading = { level: h.tagName, text: h.textContent.trim().slice(0, 60) };
      }
    });
  }

  const form = el.closest('form');
  const section = el.closest('section, article, aside, nav, header, footer, main, div[class*="section"], div[id*="section"]');
  const siblings = [...el.parentElement?.children || []].filter(s => s !== el && s.tagName !== 'SCRIPT' && s.tagName !== 'STYLE').slice(0, 5).map(s => ({
    tag: s.tagName,
    text: (s.textContent || '').trim().slice(0, 40)
  }));

  return {
    found: true,
    tag: el.tagName,
    id: el.id || '',
    type: el.type || '',
    text: (el.textContent || el.value || '').trim().slice(0, 80),
    name: el.getAttribute('name') || '',
    rect: rectStr(el),
    visible: el.offsetParent !== null,
    disabled: el.disabled || false,
    required: el.required || el.hasAttribute('required') || false,
    checked: el.checked || false,
    heading,
    labels: nearLabels,
    formId: form?.id || form?.getAttribute('name') || '',
    section: section?.id || section?.className?.slice(0, 30) || '',
    siblings
  };
}

function extractAllInteractive() {
  const selectors = [
    'button', 'a[href]', 'input', 'select', 'textarea',
    '[role="button"]', '[role="link"]', '[role="option"]',
    '[role="checkbox"]', '[role="radio"]', '[role="tab"]',
    '[role="menuitem"]', '[role="combobox"]', '[role="switch"]',
    '[onclick]', '[tabindex]:not([tabindex="-1"])',
    'summary', 'label', '[contenteditable]',
    '[ng-click]', '[v-on\\:click]', '[\\@click]'
  ];
  const els = new Set();
  selectors.forEach(sel => {
    try { document.querySelectorAll(sel).forEach(el => els.add(el)); } catch (_) {}
  });
  const vw = window.innerWidth, vh = window.innerHeight;
  return [...els].slice(0, 200).map(el => {
    const rect = el.getBoundingClientRect();
    const inViewport = rect.top < vh && rect.bottom > 0 && rect.left < vw && rect.right > 0;
    const form = el.closest('form');
    let nearestHeading = '';
    let hEl = el;
    while (hEl && hEl !== document.body) {
      const h = hEl.querySelector('h1, h2, h3, h4, h5, h6, [role="heading"]');
      if (h) { nearestHeading = h.textContent.trim().slice(0, 40); break; }
      hEl = hEl.parentElement;
    }
    if (!nearestHeading) {
      const allH = document.querySelectorAll('h1, h2, h3, h4');
      let best = Infinity;
      allH.forEach(h => {
        const d = Math.abs(h.getBoundingClientRect().top - rect.top);
        if (d < best && d < 300) { best = d; nearestHeading = h.textContent.trim().slice(0, 40); }
      });
    }
    return {
      tag: el.tagName,
      type: el.type || '',
      text: (el.textContent || el.value || '').trim().slice(0, 80),
      id: el.id || '',
      name: el.getAttribute('name') || '',
      placeholder: el.placeholder || '',
      ariaLabel: el.getAttribute('aria-label') || '',
      role: el.getAttribute('role') || '',
      ariaChecked: el.getAttribute('aria-checked') || '',
      ariaSelected: el.getAttribute('aria-selected') || '',
      ariaExpanded: el.getAttribute('aria-expanded') || '',
      href: el.href || '',
      classes: (el.className && typeof el.className === 'string') ? el.className.slice(0, 60) : '',
      rect: rectStr(el),
      inViewport,
      visible: el.offsetParent !== null,
      disabled: el.disabled || false,
      checked: el.checked || false,
      tabIndex: el.getAttribute('tabindex') || '',
      dataTestid: el.getAttribute('data-testid') || el.getAttribute('data-test') || '',
      onclick: el.hasAttribute('onclick') || el.onclick !== null,
      label: findLabelFor(el).slice(0, 60),
      formId: form?.id || '',
      section: nearestHeading
    };
  });
}

function deepPageAnalysis(includeAll = false) {
  const r = {
    title: document.title,
    url: window.location.href,
    forms: [], buttons: [], inputs: [], links: [], headings: []
  };
  document.querySelectorAll('form').forEach(f => {
    r.forms.push({
      id: f.id || '', action: f.action || '', method: f.method || '',
      inputs: [...f.querySelectorAll('input, select, textarea')].map(i => ({
        name: i.name || i.id || '', type: i.type || i.tagName,
        placeholder: i.placeholder || '', label: findLabelFor(i),
        required: i.required || false, value: (i.value || '').slice(0, 30)
      }))
    });
  });
  document.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"]').forEach(b => {
    r.buttons.push({
      text: (b.textContent || b.value || b.getAttribute('aria-label') || '').trim().slice(0, 60),
      id: b.id || '', visible: b.offsetParent !== null, disabled: b.disabled || false, rect: rectStr(b)
    });
  });
  document.querySelectorAll('input:not([type="submit"]):not([type="button"]), textarea, select').forEach(i => {
    r.inputs.push({
      name: i.name || i.id || '', type: i.type || i.tagName,
      placeholder: i.placeholder || '', label: findLabelFor(i),
      required: i.required || false, value: (i.value || '').slice(0, 30)
    });
  });
  document.querySelectorAll('a[href]').forEach(a => {
    r.links.push({
      text: a.textContent.trim().slice(0, 60), href: a.href, id: a.id || ''
    });
  });
  document.querySelectorAll('h1, h2, h3, h4').forEach(h => {
    r.headings.push({ level: h.tagName, text: h.textContent.trim().slice(0, 80) });
  });
  r.totalInteractive = r.buttons.length + r.inputs.length + r.links.length;

  if (includeAll) {
    r.pageType = detectPageType();
    r.structure = extractPageStructure();
    r.state = getViewportState();
    r.modals = detectModals();
    r.formsDetailed = extractFormsDetailed();
  }

  return r;
}

function findLabelFor(el) {
  if (el.id) {
    const l = document.querySelector(`label[for="${cssEsc(el.id)}"]`);
    if (l) return l.textContent.trim().slice(0, 60);
  }
  let p = el.parentElement;
  while (p) {
    const l = p.querySelector('label');
    if (l && l.contains(el)) return l.textContent.trim().slice(0, 60);
    p = p.parentElement;
  }
  const pl = el.closest('label');
  if (pl) return pl.textContent.trim().slice(0, 60);

  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel.trim().slice(0, 60);
  const title = el.getAttribute('title');
  if (title) return title.trim().slice(0, 60);
  const placeholder = el.placeholder;
  if (placeholder) return placeholder.trim().slice(0, 60);

  const ariaLabelledby = el.getAttribute('aria-labelledby');
  if (ariaLabelledby) {
    const ref = document.getElementById(ariaLabelledby);
    if (ref) return ref.textContent.trim().slice(0, 60);
  }
  return '';
}

function rectStr(el) {
  const r = el.getBoundingClientRect();
  return `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`;
}

// ─── VIORA CURSOR — "Optic" reticle-arrow hybrid, electric cyan ──────────
let vioraCursorActive = false;
let vioraCursorStyleEl = null;

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 4: VISUAL FEEDBACK (cursor, ripple, highlight, snapshot)
// ═══════════════════════════════════════════════════════════════════════════

function addVioraCursorStyles() {
  if (document.getElementById('viora-cursor-style')) return;
  const s = document.createElement('style');
  s.id = 'viora-cursor-style';
  s.textContent = `
    @keyframes vioraCursorPulse {
      0%, 100% { filter: drop-shadow(0 0 10px rgba(56,248,255,0.85)) drop-shadow(0 0 22px rgba(0,200,255,0.45)); }
      50% { filter: drop-shadow(0 0 16px rgba(120,255,255,1)) drop-shadow(0 0 34px rgba(0,200,255,0.65)); }
    }
    @keyframes vioraRippleOut {
      0% { transform: scale(0.3); opacity: 1; }
      100% { transform: scale(3); opacity: 0; }
    }
    @keyframes vioraCrosshairSpin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    @keyframes vioraTickSpin {
      from { transform: rotate(0deg); }
      to { transform: rotate(-360deg); }
    }
    @keyframes vioraTargetPulse {
      0%, 100% { r: 10; opacity: 0.6; }
      50% { r: 14; opacity: 0.3; }
    }
    @keyframes vioraScan {
      0% { transform: translateY(-9px); opacity: 0; }
      15% { opacity: 0.9; }
      85% { opacity: 0.9; }
      100% { transform: translateY(9px); opacity: 0; }
    }
  `;
  document.head.appendChild(s);
  vioraCursorStyleEl = s;
}

function createVioraCursor() {
  if (!visualCursorEnabled) return null;
  const existing = document.getElementById('viora-cursor');
  if (existing) existing.remove();
  addVioraCursorStyles();
  document.body.style.cursor = 'none';
  const container = document.createElement('div');
  container.id = 'viora-cursor';
  container.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;left:0;top:0;width:48px;height:60px;transition:left 0.06s cubic-bezier(.2,.8,.3,1),top 0.06s cubic-bezier(.2,.8,.3,1);';
  container.innerHTML = `
    <svg width="48" height="60" viewBox="0 0 48 60" xmlns="http://www.w3.org/2000/svg" style="overflow:visible;animation:vioraCursorPulse 1.2s ease-in-out infinite;">
      <defs>
        <radialGradient id="vCursorGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#7CFBFF" stop-opacity="0.55"/>
          <stop offset="100%" stop-color="#00C8FF" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="vCursorBody" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#7CFBFF"/>
          <stop offset="55%" stop-color="#22D3EE"/>
          <stop offset="100%" stop-color="#0891B2"/>
        </linearGradient>
        <filter id="vCursorShadow">
          <feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="#00C8FF" flood-opacity="0.85"/>
          <feDropShadow dx="0" dy="0" stdDeviation="7" flood-color="#0891B2" flood-opacity="0.45"/>
        </filter>
      </defs>
      <!-- Outer glow ring -->
      <circle cx="18" cy="18" r="17" fill="url(#vCursorGlow)" opacity="0.65"/>
      <!-- Rotating reticle ring with corner ticks (targeting-scope feel) -->
      <g style="animation:vioraCrosshairSpin 4s linear infinite;transform-origin:18px 18px" opacity="0.6">
        <circle cx="18" cy="18" r="11" fill="none" stroke="#7CFBFF" stroke-width="1.4" stroke-dasharray="4 5"/>
      </g>
      <g style="animation:vioraTickSpin 6s linear infinite;transform-origin:18px 18px" opacity="0.5">
        <circle cx="18" cy="18" r="14.5" fill="none" stroke="#22D3EE" stroke-width="1" stroke-dasharray="1 7"/>
      </g>
      <!-- Thin vertical scan line, "seeing" motif -->
      <line x1="18" y1="9" x2="18" y2="27" stroke="#E0FFFF" stroke-width="1" opacity="0.5" style="animation:vioraScan 1.8s ease-in-out infinite"/>
      <!-- Cursor arrow shape: sleek, angular, single clean point -->
      <g filter="url(#vCursorShadow)">
        <path d="M4,2 L4,38 L11.5,31 L17,42.5 L21,40.5 L15.5,29.5 L27,29.5 Z"
              fill="url(#vCursorBody)" stroke="#E0FFFF" stroke-width="1.25" stroke-linejoin="round" opacity="0.98"/>
        <!-- Inner highlight edge for a faceted, glass-like look -->
        <path d="M5.5,4.5 L5.5,33 L11,27.5 L15.8,38 L15.8,37 L11.2,27 L22,27 Z"
              fill="#DFFFFF" opacity="0.55"/>
        <!-- Small locked-on tick at the tip -->
        <circle cx="6.5" cy="7" r="2" fill="#ffffff" opacity="0.95">
          <animate attributeName="opacity" values="0.95;0.45;0.95" dur="0.9s" repeatCount="indefinite"/>
        </circle>
      </g>
    </svg>`;
  document.body.appendChild(container);
  return container;
}

function moveVioraCursor(x, y, smooth = true) {
  if (!visualCursorEnabled) return;
  let cursor = document.getElementById('viora-cursor');
  if (!cursor) cursor = createVioraCursor();
  if (!cursor) return;
  if (smooth) {
    cursor.style.transition = 'left 0.06s cubic-bezier(.2,.8,.3,1), top 0.06s cubic-bezier(.2,.8,.3,1)';
  } else {
    cursor.style.transition = 'none';
  }
  cursor.style.left = (x - 4) + 'px';
  cursor.style.top = (y - 4) + 'px';
  vioraCursorActive = true;
}

function showClickRipple(x, y) {
  if (!clickRippleEnabled) return;
  const ring = document.createElement('div');
  ring.style.cssText = `
    position:fixed;z-index:2147483646;pointer-events:none;
    left:${x-20}px;top:${y-20}px;width:40px;height:40px;
    border-radius:50%;
    border: 4px solid #22D3EE;
    background: rgba(34,211,238,0.15);
    box-shadow: 0 0 30px rgba(34,211,238,0.6), inset 0 0 30px rgba(34,211,238,0.1);
    animation: vioraRippleOut 0.7s ease-out forwards;
  `;
  document.body.appendChild(ring);
  // Also create a secondary brighter ring
  const ring2 = document.createElement('div');
  ring2.style.cssText = `
    position:fixed;z-index:2147483646;pointer-events:none;
    left:${x-8}px;top:${y-8}px;width:16px;height:16px;
    border-radius:50%;
    border: 2px solid #ffffff;
    background: rgba(255,255,255,0.4);
    animation: vioraRippleOut 0.5s ease-out forwards;
  `;
  document.body.appendChild(ring2);
  setTimeout(() => { ring.remove(); ring2.remove(); }, 800);
}

async function animateVioraCursorTo(fromX, fromY, toX, toY, onClickCallback) {
  const cursor = createVioraCursor();
  if (!cursor) return onClickCallback?.();
  cursor.style.left = (fromX - 4) + 'px';
  cursor.style.top = (fromY - 4) + 'px';
  cursor.style.transition = 'none';

  const dist = Math.sqrt((toX - fromX) ** 2 + (toY - fromY) ** 2);
  const steps = Math.max(6, Math.min(22, Math.round(dist / 18)));
  let step = 0;

  function move() {
    if (step > steps) {
      showClickRipple(toX, toY);
      cursor.style.transition = 'opacity 0.3s';
      cursor.style.opacity = '0';
      setTimeout(() => { cursor.remove(); document.body.style.cursor = ''; vioraCursorActive = false; }, cursorPersistTime);
      if (onClickCallback) onClickCallback();
      return;
    }
    const t = step / steps;
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const arcScale = Math.min(1, dist / 80);
    const midX = (fromX + toX) / 2 + (Math.random() - 0.5) * 30 * arcScale;
    const midY = (fromY + toY) / 2 + (Math.random() - 0.5) * 15 * arcScale;
    const x = Math.round((1 - ease) * (1 - ease) * fromX + 2 * (1 - ease) * ease * midX + ease * ease * toX);
    const y = Math.round((1 - ease) * (1 - ease) * fromY + 2 * (1 - ease) * ease * midY + ease * ease * toY);
    cursor.style.transition = 'left 0.04s cubic-bezier(.2,.8,.3,1), top 0.04s cubic-bezier(.2,.8,.3,1)';
    cursor.style.left = (x - 4) + 'px';
    cursor.style.top = (y - 4) + 'px';
    step++;
    setTimeout(move, 25 + Math.floor(Math.random() * 15));
  }
  move();
}

async function humanClick(el, fromX, fromY) {
  if (!visualCursorEnabled) {
    el.click();
    return;
  }
  const rect = el.getBoundingClientRect();
  const ox = (Math.random() - 0.5) * Math.min(rect.width * 0.3, 8);
  const oy = (Math.random() - 0.5) * Math.min(rect.height * 0.3, 6);
  const cx = Math.round(rect.left + rect.width / 2 + ox);
  const cy = Math.round(rect.top + rect.height / 2 + oy);
  const p = { bubbles: true, cancelable: true, clientX: cx, clientY: cy, pointerId: 1, isPrimary: true, pointerType: 'mouse' };
  const m = { bubbles: true, cancelable: true, clientX: cx, clientY: cy };

  if (fromX !== undefined && fromY !== undefined) {
    await new Promise(resolve => animateVioraCursorTo(fromX, fromY, cx, cy, resolve));
    await delay(30);
  } else {
    moveVioraCursor(cx, cy, false);
    showClickRipple(cx, cy);
    await delay(80);
  }

  el.dispatchEvent(new PointerEvent('pointerover', p)); await humanDelay(50);
  el.dispatchEvent(new MouseEvent('mouseover', m)); await humanDelay(80);
  el.dispatchEvent(new PointerEvent('pointerdown', { ...p, button: 0, buttons: 1 }));
  el.dispatchEvent(new MouseEvent('mousedown', { ...m, button: 0 }));
  el.dispatchEvent(new PointerEvent('pointermove', p)); el.dispatchEvent(new MouseEvent('mousemove', m)); await humanDelay(60);
  el.focus(); await humanDelay(randomBetween(30, 100));
  el.dispatchEvent(new PointerEvent('pointerup', { ...p, button: 0, buttons: 0 }));
  el.dispatchEvent(new MouseEvent('mouseup', { ...m, button: 0 }));
  await delay(15);
  el.dispatchEvent(new MouseEvent('click', m));
  await delay(30);
  try { el.click(); } catch(_) {}
  removeVioraCursor();
}

function removeVioraCursor() {
  const cursor = document.getElementById('viora-cursor');
  if (cursor) cursor.remove();
  document.body.style.cursor = '';
  vioraCursorActive = false;
}

function highlightElement(el) {
  if (!elementHighlightEnabled) return;
  const overlay = document.createElement('div');
  const rect = el.getBoundingClientRect();
  overlay.style.cssText = `
    position: fixed; z-index: 2147483647; pointer-events: none;
    left: ${rect.left + window.scrollX}px; top: ${rect.top + window.scrollY}px;
    width: ${rect.width}px; height: ${rect.height}px;
    border: 3px solid #22D3EE; border-radius: 4px;
    background: rgba(34,211,238,0.12);
    box-shadow: 0 0 25px rgba(34,211,238,0.5), inset 0 0 25px rgba(34,211,238,0.08);
    transition: opacity 0.3s;
    animation: vioraPulse 0.8s ease-in-out 2;
  `;
  let style = document.getElementById('viora-highlight-style');
  if (!style) {
    style = document.createElement('style');
    style.id = 'viora-highlight-style';
    style.textContent = `@keyframes vioraPulse{0%,100%{opacity:1}50%{opacity:0.5}}`;
    document.head.appendChild(style);
  }
  document.body.appendChild(overlay);
  setTimeout(() => {
    overlay.style.opacity = '0';
    setTimeout(() => overlay.remove(), 300);
  }, 1800);
}

// ─── CLICK VERIFICATION — did the click actually do anything? ────────────
// Previously "success" only meant the clicker function ran without throwing,
// even if the page never reacted (e.g. a click landed on a dead overlay).
// This snapshots observable state before the click and checks for a real
// effect afterward, so smartClick can keep trying strategies until one
// demonstrably worked instead of stopping at the first one that didn't error.

function captureClickSnapshot(el) {
  return {
    url: location.href,
    activeEl: document.activeElement,
    ariaExpanded: el.getAttribute('aria-expanded'),
    ariaChecked: el.getAttribute('aria-checked'),
    ariaSelected: el.getAttribute('aria-selected'),
    ariaPressed: el.getAttribute('aria-pressed'),
    checked: ('checked' in el) ? el.checked : undefined,
    value: ('value' in el) ? el.value : undefined,
    connected: el.isConnected
  };
}

function watchMutations(durationMs) {
  return new Promise(resolve => {
    let count = 0;
    let observer;
    try {
      observer = new MutationObserver((muts) => { count += muts.length; });
      observer.observe(document.documentElement, {
        attributes: true, childList: true, subtree: true, characterData: true
      });
    } catch (_) { /* MutationObserver unavailable in this context */ }
    setTimeout(() => {
      try { observer && observer.disconnect(); } catch (_) {}
      resolve(count);
    }, durationMs);
  });
}

function detectClickEffect(el, snapshot, mutationCount) {
  if (location.href !== snapshot.url) return { verified: true, reason: 'navigation' };
  if (!el.isConnected && snapshot.connected) return { verified: true, reason: 'element-removed' };
  if (document.activeElement !== snapshot.activeEl && snapshot.activeEl?.isConnected !== false) return { verified: true, reason: 'focus-changed' };
  if (el.getAttribute('aria-expanded') !== snapshot.ariaExpanded) return { verified: true, reason: 'aria-expanded-changed' };
  if (el.getAttribute('aria-checked') !== snapshot.ariaChecked) return { verified: true, reason: 'aria-checked-changed' };
  if (el.getAttribute('aria-selected') !== snapshot.ariaSelected) return { verified: true, reason: 'aria-selected-changed' };
  if (el.getAttribute('aria-pressed') !== snapshot.ariaPressed) return { verified: true, reason: 'aria-pressed-changed' };
  if (('checked' in el) && el.checked !== snapshot.checked) return { verified: true, reason: 'checked-changed' };
  if (('value' in el) && el.value !== snapshot.value) return { verified: true, reason: 'value-changed' };
  if (mutationCount > 2) return { verified: true, reason: `dom-mutated(${mutationCount})` };
  return { verified: false, reason: 'no-observable-effect' };
}

// ─── STRATEGY ENGINE ──────────────────────────────────────────────────────

// Fire-and-forget: lets the side panel show live "N ways tried" feedback
// while smartClick() works through its fallback strategies. Never awaited —
// a slow or missing listener (side panel closed) must not slow down clicking.
function reportClickAttempt(attempted, total, strategyName) {
  try {
    chrome.runtime.sendMessage({ type: 'CLICK_ATTEMPT_PROGRESS', attempted, total, strategyName }, () => { void chrome.runtime.lastError; });
  } catch (_) { /* extension context gone mid-click — ignore */ }
}

function cssEsc(v) {
  if (!v) return '';
  return String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 5: STRATEGY ENGINE (core automation orchestrator)
// ═══════════════════════════════════════════════════════════════════════════

class StrategyEngine {
  constructor() {
    this.strategies = this.buildAllStrategies();
    this.results = [];
  }

  buildAllStrategies() {
    const s = [];

    // FINDING STRATEGIES (70+)
    const finders = [];

    // Direct selector finders
    finders.push({ name: 'querySelector-exact', fn: (a) => this.f_querySelector(a.selector) });
    finders.push({ name: 'querySelector-naked', fn: (a) => this.f_querySelector(a.selector.replace(/^[a-zA-Z]+(\[)/, '$1')) });
    finders.push({ name: 'querySelector-idPrefix', fn: (a) => this.f_querySelector(a.selector.replace(/^[a-zA-Z]*#/, '#')) });
    finders.push({ name: 'querySelector-idExtract', fn: (a) => {
      const m = a.selector.match(/#([\w-]+)/); return m ? document.getElementById(m[1]) : null;
    }});
    finders.push({ name: 'querySelector-attrId', fn: (a) => {
      const m = a.selector.match(/\[id=['"]?([^'"=\]]+)['"]?\]/); return m ? document.getElementById(m[1]) : null;
    }});
    finders.push({ name: 'querySelector-nameAttr', fn: (a) => {
      const m = a.selector.match(/\[name=['"]?([^'"=\]]+)['"]?\]/); return m ? document.querySelector(`[name="${m[1]}"]`) : null;
    }});
    finders.push({ name: 'querySelector-lastChunk', fn: (a) => {
      if (!a.selector) return null;
      const chunk = a.selector.split(/[\[\.#:\s]/).filter(Boolean).pop();
      if (!chunk) return null;
      return document.querySelector(`[class*="${chunk}"]`) || document.getElementById(chunk) || document.querySelector(`[name*="${chunk}"]`);
    }});
    finders.push({ name: 'xpath-find', fn: (a) => {
      try { const r = document.evaluate(a.selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null); return r.singleNodeValue; } catch(_) { return null; }
    }});
    finders.push({ name: 'xpath-findAll-first', fn: (a) => {
      try { const r = document.evaluate(a.selector, document, null, XPathResult.ANY_TYPE, null); const n = r.iterateNext(); return n; } catch(_) { return null; }
    }});

    // Form attribute finders
    finders.push({ name: 'form-by-name', fn: (a) => {
      if (a.name) return document.querySelector(`[name="${cssEsc(a.name)}"], [name="${cssEsc(a.name)}" i]`);
      return null;
    }});
    finders.push({ name: 'form-by-placeholder-caseInsensitive', fn: (a) => {
      if (a.placeholder) return document.querySelector(`[placeholder*="${cssEsc(a.placeholder)}" i]`);
      return null;
    }});
    finders.push({ name: 'form-by-aria-label', fn: (a) => {
      if (a.ariaLabel) return document.querySelector(`[aria-label*="${cssEsc(a.ariaLabel)}" i]`);
      return null;
    }});
    finders.push({ name: 'form-by-title', fn: (a) => {
      if (a.title) return document.querySelector(`[title="${cssEsc(a.title)}"], [title="${cssEsc(a.title)}" i]`);
      return null;
    }});
    finders.push({ name: 'form-by-id', fn: (a) => {
      if (a.id) return document.getElementById(a.id);
      return null;
    }});
    finders.push({ name: 'form-by-dataTestid', fn: (a) => {
      if (a.dataTestid) return document.querySelector(`[data-testid="${cssEsc(a.dataTestid)}"], [data-test="${cssEsc(a.dataTestid)}"]`);
      return null;
    }});
    finders.push({ name: 'form-by-class', fn: (a) => {
      if (a.class) return document.querySelector(`[class*="${cssEsc(a.class)}"]`);
      return null;
    }});
    finders.push({ name: 'form-by-role', fn: (a) => {
      if (a.selector) { const m = a.selector.match(/\[role=['"]?([^'"=\]]+)['"]?\]/); if (m) return document.querySelector(`[role="${cssEsc(m[1])}"]`); }
      return null;
    }});
    finders.push({ name: 'form-by-autocomplete', fn: (a) => {
      if (a.name) return document.querySelector(`[autocomplete="${cssEsc(a.name)}"], [autocomplete*="${cssEsc(a.name)}" i]`);
      return null;
    }});
    finders.push({ name: 'form-by-descriptionMatch', fn: (a) => {
      if (!a.description) return null;
      const desc = a.description.toLowerCase();
      for (const attr of ['aria-label','aria-describedby','placeholder','title']) {
        const el = document.querySelector(`[${attr}*="${cssEsc(desc)}" i]`);
        if (el) return el;
      }
      return null;
    }});

    // Text-based finders
    finders.push({ name: 'text-exactMatch-button', fn: (a) => this.f_textExact(a.text, 'button,[role="button"],input[type="submit"],input[type="button"],a') });
    finders.push({ name: 'text-exactMatch-all', fn: (a) => this.f_textExact(a.text, '*') });
    finders.push({ name: 'text-exactMatch-label', fn: (a) => this.f_textExact(a.text, 'label,span,td,th,div,p,li') });
    finders.push({ name: 'text-includes-button', fn: (a) => this.f_textIncludes(a.text, 'button,[role="button"],input[type="submit"],input[type="button"],a') });
    finders.push({ name: 'text-includes-all', fn: (a) => this.f_textIncludes(a.text, '*') });
    finders.push({ name: 'text-includes-label', fn: (a) => this.f_textIncludes(a.text, 'label,span,td,th,div,p,li') });
    finders.push({ name: 'text-fuzzyMatch-button', fn: (a) => this.f_textFuzzy(a.text, 'button,[role="button"],input[type="submit"],input[type="button"],a,label,span[onclick],div[onclick]') });
    finders.push({ name: 'text-fuzzyMatch-all', fn: (a) => this.f_textFuzzy(a.text, '*') });
    finders.push({ name: 'text-leafNode-exact', fn: (a) => this.f_leafText(a.text, 'exact') });
    finders.push({ name: 'text-leafNode-includes', fn: (a) => this.f_leafText(a.text, 'includes') });
    finders.push({ name: 'text-leafNode-fuzzy', fn: (a) => this.f_leafText(a.text, 'fuzzy') });
    finders.push({ name: 'text-spanMatch', fn: (a) => this.f_textExact(a.text, 'span,p,div,td,th,li') });
    finders.push({ name: 'text-spanMatch-includes', fn: (a) => this.f_textIncludes(a.text, 'span,p,div,td,th,li') });
    finders.push({ name: 'text-spanMatch-fuzzy', fn: (a) => this.f_textFuzzy(a.text, 'span,p,div,td,th,li') });

    // Description-based text matching
    finders.push({ name: 'text-descExact-button', fn: (a) => this.f_textExact(a.description, 'button,[role="button"],input[type="submit"],input[type="button"],a') });
    finders.push({ name: 'text-descIncludes-button', fn: (a) => this.f_textIncludes(a.description, 'button,[role="button"],input[type="submit"],input[type="button"],a') });
    finders.push({ name: 'text-descFuzzy-button', fn: (a) => this.f_textFuzzy(a.description, 'button,[role="button"],input[type="submit"],input[type="button"],a,label,span[onclick],div[onclick]') });

    // Position-based
    finders.push({ name: 'text-nthVisible', fn: (a) => this.f_nthVisible(a.text, 0) });
    finders.push({ name: 'text-nthVisible-1', fn: (a) => this.f_nthVisible(a.text, 1) });
    finders.push({ name: 'text-nthVisible-2', fn: (a) => this.f_nthVisible(a.text, 2) });
    finders.push({ name: 'text-nthVisible-3', fn: (a) => this.f_nthVisible(a.text, 3) });
    finders.push({ name: 'text-lastVisible', fn: (a) => this.f_nthVisible(a.text, -1) });

    // Framework-specific
    finders.push({ name: 'ng-click', fn: (a) => {
      return document.querySelector(`[ng-click*="${cssEsc(a.text || a.description || '')}" i]`);
    }});
    finders.push({ name: 'ng-click-desc', fn: (a) => {
      return document.querySelector(`[ng-click*="${cssEsc(a.description || a.text || '')}" i]`);
    }});
    finders.push({ name: 'ng-model', fn: (a) => {
      return document.querySelector(`[ng-model*="${cssEsc(a.text || a.description || '')}" i]`);
    }});
    finders.push({ name: 'vue-click', fn: (a) => {
      return document.querySelector(`[v-on\\:click*="${cssEsc(a.text || a.description || '')}" i], [\\@click*="${cssEsc(a.text || a.description || '')}" i]`);
    }});
    finders.push({ name: 'vue-model', fn: (a) => {
      return document.querySelector(`[v-model*="${cssEsc(a.text || a.description || '')}" i]`);
    }});
    finders.push({ name: 'vue-ref', fn: (a) => {
      return document.querySelector(`[ref*="${cssEsc(a.text || a.description || '')}" i]`);
    }});
    finders.push({ name: 'react-testid', fn: (a) => {
      return document.querySelector(`[data-testid="${cssEsc(a.text || a.description || '')}"], [data-test="${cssEsc(a.text || a.description || '')}"]`);
    }});
    finders.push({ name: 'svelte-testid', fn: (a) => {
      return document.querySelector(`[data-svelte-h], [data-testid="${cssEsc(a.text || a.description || '')}"]`);
    }});

    // Label-based
    finders.push({ name: 'label-for-exact', fn: (a) => {
      if (!a.text) return null;
      const labels = [...document.querySelectorAll('label')];
      for (const l of labels) {
        if (l.textContent.trim().toLowerCase() === a.text.toLowerCase().trim()) {
          const forId = l.getAttribute('for');
          if (forId) return document.getElementById(forId);
          const input = l.querySelector('input, select, textarea');
          if (input) return input;
        }
      }
      return null;
    }});
    finders.push({ name: 'label-for-includes', fn: (a) => {
      if (!a.text) return null;
      const q = a.text.toLowerCase().trim();
      const labels = [...document.querySelectorAll('label')];
      for (const l of labels) {
        if (l.textContent.toLowerCase().includes(q)) {
          const forId = l.getAttribute('for');
          if (forId) return document.getElementById(forId);
          const input = l.querySelector('input, select, textarea');
          if (input) return input;
        }
      }
      return null;
    }});
    finders.push({ name: 'label-for-fuzzy', fn: (a) => {
      if (!a.text) return null;
      const q = a.text.toLowerCase().trim();
      const labels = [...document.querySelectorAll('label')];
      for (const l of labels) {
        const t = l.textContent.toLowerCase().trim();
        if (t.includes(q) || q.includes(t)) {
          const forId = l.getAttribute('for');
          if (forId) return document.getElementById(forId);
          const input = l.querySelector('input, select, textarea');
          if (input) return input;
        }
      }
      return null;
    }});
    finders.push({ name: 'label-for-descMatch', fn: (a) => {
      if (!a.description) return null;
      const q = a.description.toLowerCase().trim();
      const labels = [...document.querySelectorAll('label')];
      for (const l of labels) {
        if (l.textContent.toLowerCase().includes(q)) {
          const forId = l.getAttribute('for');
          if (forId) return document.getElementById(forId);
          const input = l.querySelector('input, select, textarea');
          if (input) return input;
        }
      }
      return null;
    }});

    // Attribute fallback
    finders.push({ name: 'ariaLabel-exact', fn: (a) => {
      if (!a.text) return null;
      return document.querySelector(`[aria-label="${cssEsc(a.text)}" i]`);
    }});
    finders.push({ name: 'ariaLabel-includes', fn: (a) => {
      if (!a.text) return null;
      return document.querySelector(`[aria-label*="${cssEsc(a.text)}" i]`);
    }});
    finders.push({ name: 'ariaLabel-fuzzy', fn: (a) => {
      if (!a.text) return null;
      const q = a.text.toLowerCase().trim();
      const all = document.querySelectorAll('[aria-label]');
      for (const el of all) {
        const t = el.getAttribute('aria-label').toLowerCase();
        if (t.includes(q) || q.includes(t)) return el;
      }
      return null;
    }});
    finders.push({ name: 'ariaDescribedBy', fn: (a) => {
      if (!a.text) return null;
      return document.querySelector(`[aria-describedby*="${cssEsc(a.text)}" i]`);
    }});
    finders.push({ name: 'title-exact', fn: (a) => {
      if (!a.text) return null;
      return document.querySelector(`[title="${cssEsc(a.text)}" i]`);
    }});
    finders.push({ name: 'title-includes', fn: (a) => {
      if (!a.text) return null;
      return document.querySelector(`[title*="${cssEsc(a.text)}" i]`);
    }});
    finders.push({ name: 'alt-text', fn: (a) => {
      if (!a.text) return null;
      return document.querySelector(`[alt="${cssEsc(a.text)}" i], [alt*="${cssEsc(a.text)}" i]`);
    }});
    finders.push({ name: 'value-exact', fn: (a) => {
      if (!a.text) return null;
      return document.querySelector(`[value="${cssEsc(a.text)}" i]`);
    }});
    finders.push({ name: 'value-includes', fn: (a) => {
      if (!a.text) return null;
      return document.querySelector(`[value*="${cssEsc(a.text)}" i]`);
    }});
    finders.push({ name: 'data-attr-exact', fn: (a) => {
      if (!a.text) return null;
      const q = a.text.toLowerCase().trim();
      const all = document.querySelectorAll('[data-]');
      for (const el of all) {
        for (const key in el.dataset) {
          if (el.dataset[key].toLowerCase().includes(q)) return el;
        }
      }
      return null;
    }});

    // Combined selector+text finders
    finders.push({ name: 'combined-attr-and-text', fn: (a) => {
      if (!a.selector || !a.text) return null;
      const text = a.text.toLowerCase().trim();
      const els = document.querySelectorAll(a.selector);
      for (const el of els) {
        const t = (el.textContent||el.value||'').toLowerCase().trim();
        if (t === text || t.includes(text)) return el;
      }
      return null;
    }});
    finders.push({ name: 'combined-text-in-attrMatch', fn: (a) => {
      if (!a.text) return null;
      const text = a.text.toLowerCase().trim();
      for (const attr of ['aria-label','title','placeholder','alt']) {
        const els = document.querySelectorAll(`[${attr}]`);
        for (const el of els) {
          const v = (el.getAttribute(attr)||'').toLowerCase();
          if (v === text || v.includes(text)) return el;
        }
      }
      return null;
    }});

    // Shadow DOM finders
    finders.push({ name: 'shadowDom-query', fn: (a) => {
      if (!a.selector) return null;
      for (const root of allShadowRoots()) {
        try { const el = root.querySelector(a.selector); if (el) return el; } catch(_) {}
      }
      return null;
    }});
    finders.push({ name: 'shadowDom-text-exact', fn: (a) => {
      if (!a.text) return null;
      const q = a.text.toLowerCase().trim();
      for (const root of allShadowRoots()) {
        const els = root.querySelectorAll('button,a,[role="button"],label,span,p,div,td,th,li');
        for (const el of els) {
          if ((el.textContent||'').toLowerCase().trim() === q) return el;
        }
      }
      return null;
    }});
    finders.push({ name: 'shadowDom-text-includes', fn: (a) => {
      if (!a.text) return null;
      const q = a.text.toLowerCase().trim();
      for (const root of allShadowRoots()) {
        const els = root.querySelectorAll('button,a,[role="button"],label,span,p,div,td,th,li');
        for (const el of els) {
          if ((el.textContent||'').toLowerCase().includes(q)) return el;
        }
      }
      return null;
    }});
    finders.push({ name: 'shadowDom-text-fuzzy', fn: (a) => {
      if (!a.text) return null;
      const q = a.text.toLowerCase().trim();
      for (const root of allShadowRoots()) {
        const els = root.querySelectorAll('button,a,[role="button"],label,span,p,div,td,th,li');
        for (const el of els) {
          const t = (el.textContent||'').toLowerCase().trim();
          if (t.includes(q) || q.includes(t)) return el;
        }
      }
      return null;
    }});
    finders.push({ name: 'shadowDom-ariaLabel', fn: (a) => {
      if (!a.text) return null;
      for (const root of allShadowRoots()) {
        try { const el = root.querySelector(`[aria-label="${cssEsc(a.text)}" i]`); if (el) return el; } catch(_) {}
        try { const el = root.querySelector(`[aria-label*="${cssEsc(a.text)}" i]`); if (el) return el; } catch(_) {}
      }
      return null;
    }});

    // Iframe-aware finders
    finders.push({ name: 'iframe-query', fn: (a) => {
      if (!a.selector) return null;
      const iframes = document.querySelectorAll('iframe');
      for (const frame of iframes) {
        try {
          const doc = frame.contentDocument || frame.contentWindow?.document;
          if (doc) { const el = doc.querySelector(a.selector); if (el) return el; }
        } catch(_) {}
      }
      return null;
    }});

    // Hint-based navigation finders
    finders.push({ name: 'hint-nextButton-id', fn: (a) => this.f_hintFind(a, 'id') });
    finders.push({ name: 'hint-nextButton-text', fn: (a) => this.f_hintFind(a, 'text') });
    finders.push({ name: 'hint-nextButton-includes', fn: (a) => this.f_hintFind(a, 'includes') });
    finders.push({ name: 'hint-nextButton-fuzzy', fn: (a) => this.f_hintFind(a, 'fuzzy') });

    // Role-based finders
    finders.push({ name: 'role-button', fn: (a) => {
      const q = (a.text||a.description||'').toLowerCase().trim();
      if (!q) return null;
      const els = document.querySelectorAll('[role="button"]');
      for (const el of els) {
        const t = (el.textContent||el.getAttribute('aria-label')||'').toLowerCase().trim();
        if (t.includes(q) || q.includes(t)) return el;
      }
      return null;
    }});
    finders.push({ name: 'role-tab', fn: (a) => {
      const q = (a.text||a.description||'').toLowerCase().trim();
      if (!q) return null;
      const els = document.querySelectorAll('[role="tab"],[role="tabpanel"]');
      for (const el of els) {
        const t = (el.textContent||el.getAttribute('aria-label')||'').toLowerCase().trim();
        if (t === q || t.includes(q)) return el;
      }
      return null;
    }});
    finders.push({ name: 'role-option', fn: (a) => {
      const q = (a.text||a.description||'').toLowerCase().trim();
      if (!q) return null;
      const els = document.querySelectorAll('[role="option"],[role="menuitem"],[role="listbox"]');
      for (const el of els) {
        const t = (el.textContent||el.getAttribute('aria-label')||'').toLowerCase().trim();
        if (t === q || t.includes(q)) return el;
      }
      return null;
    }});
    finders.push({ name: 'role-switch', fn: (a) => {
      const q = (a.text||a.description||'').toLowerCase().trim();
      if (!q) return null;
      const els = document.querySelectorAll('[role="switch"],[role="checkbox"]');
      for (const el of els) {
        const t = (el.textContent||el.getAttribute('aria-label')||'').toLowerCase().trim();
        if (t.includes(q) || q.includes(t)) return el;
      }
      return null;
    }});

    // CLICK EXECUTION STRATEGIES (30+)
    const clickers = [];

    clickers.push({ name: 'click-events-center', fn: async (el) => { await this.c_fireEvents(el, 0, 0); await this.c_native(el); }});
    clickers.push({ name: 'click-events-offsetPos', fn: async (el) => { await this.c_fireEvents(el, 3, 2); await this.c_native(el); }});
    clickers.push({ name: 'click-events-offsetNeg', fn: async (el) => { await this.c_fireEvents(el, -3, -2); await this.c_native(el); }});
    clickers.push({ name: 'click-events-offsetH', fn: async (el) => { await this.c_fireEvents(el, 5, 0); await this.c_native(el); }});
    clickers.push({ name: 'click-events-offsetV', fn: async (el) => { await this.c_fireEvents(el, 0, 5); await this.c_native(el); }});
    clickers.push({ name: 'click-events-offsetNegH', fn: async (el) => { await this.c_fireEvents(el, -5, 0); await this.c_native(el); }});
    clickers.push({ name: 'click-events-offsetNegV', fn: async (el) => { await this.c_fireEvents(el, 0, -5); await this.c_native(el); }});
    clickers.push({ name: 'click-events-leftEdge', fn: async (el) => { await this.c_fireEvents(el, -Math.round(el.offsetWidth*0.3), 0); await this.c_native(el); }});
    clickers.push({ name: 'click-events-rightEdge', fn: async (el) => { await this.c_fireEvents(el, Math.round(el.offsetWidth*0.3), 0); await this.c_native(el); }});
    clickers.push({ name: 'click-events-topEdge', fn: async (el) => { await this.c_fireEvents(el, 0, -Math.round(el.offsetHeight*0.3)); await this.c_native(el); }});
    clickers.push({ name: 'click-events-bottomEdge', fn: async (el) => { await this.c_fireEvents(el, 0, Math.round(el.offsetHeight*0.3)); await this.c_native(el); }});
    clickers.push({ name: 'click-native-only', fn: async (el) => { await this.c_native(el); }});
    clickers.push({ name: 'click-native-withFocus', fn: async (el) => { el.focus(); await delay(50); await this.c_native(el); }});
    clickers.push({ name: 'click-native-withFocusDelay', fn: async (el) => { el.focus(); await delay(150); await this.c_native(el); }});
    clickers.push({ name: 'click-events-touch', fn: async (el) => { await this.c_touchEvents(el); await this.c_native(el); }});
    clickers.push({ name: 'click-events-touchOnly', fn: async (el) => { await this.c_touchEvents(el); }});
    clickers.push({ name: 'click-events-pointerOnly', fn: async (el) => { await this.c_pointerOnly(el); await this.c_native(el); }});
    clickers.push({ name: 'click-events-mouseOnly', fn: async (el) => { await this.c_mouseOnly(el); await this.c_native(el); }});
    clickers.push({ name: 'click-dispatchOnParent', fn: async (el) => { if (el.parentElement) await this.c_fireEvents(el.parentElement, 0, 0); await this.c_native(el); }});
    clickers.push({ name: 'click-dispatchOnGrandparent', fn: async (el) => { if (el.parentElement?.parentElement) await this.c_fireEvents(el.parentElement.parentElement, 0, 0); await this.c_native(el); }});
    clickers.push({ name: 'click-focusThenEnter', fn: async (el) => { el.focus(); await delay(80); el.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter',code:'Enter',keyCode:13,bubbles:true})); await delay(30); el.dispatchEvent(new KeyboardEvent('keyup', {key:'Enter',code:'Enter',keyCode:13,bubbles:true})); await this.c_native(el); }});
    clickers.push({ name: 'click-focusThenSpace', fn: async (el) => { el.focus(); await delay(80); el.dispatchEvent(new KeyboardEvent('keydown', {key:' ',code:'Space',keyCode:32,bubbles:true})); await delay(30); el.dispatchEvent(new KeyboardEvent('keyup', {key:' ',code:'Space',keyCode:32,bubbles:true})); await this.c_native(el); }});
    clickers.push({ name: 'click-events-react', fn: async (el) => { await this.c_fireEvents(el, 0, 0); this.c_triggerReact(el); await this.c_native(el); }});
    clickers.push({ name: 'click-events-vue', fn: async (el) => { await this.c_fireEvents(el, 0, 0); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); await this.c_native(el); }});
    clickers.push({ name: 'click-events-angular', fn: async (el) => { await this.c_fireEvents(el, 0, 0); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); await this.c_native(el); }});
    clickers.push({ name: 'click-double', fn: async (el) => { await this.c_fireEvents(el, 0, 0); await delay(20); await this.c_fireEvents(el, 0, 0); await this.c_native(el); }});
    clickers.push({ name: 'click-triple', fn: async (el) => { await this.c_fireEvents(el, 0, 0); await delay(15); await this.c_fireEvents(el, 0, 0); await delay(15); await this.c_fireEvents(el, 0, 0); await this.c_native(el); }});
    clickers.push({ name: 'click-mousedownOnly', fn: async (el) => { const pt = this.c_getPoint(el); el.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,clientX:pt.x,clientY:pt.y})); await delay(30); el.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,cancelable:true,clientX:pt.x,clientY:pt.y})); await this.c_native(el); }});
    clickers.push({ name: 'click-pointerdownOnly', fn: async (el) => { const pt = this.c_getPoint(el); el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,clientX:pt.x,clientY:pt.y,pointerId:1,isPrimary:true})); await delay(30); el.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,cancelable:true,clientX:pt.x,clientY:pt.y,pointerId:1,isPrimary:true})); await this.c_native(el); }});
    clickers.push({ name: 'click-pointerdownRepeat', fn: async (el) => { const pt = this.c_getPoint(el); el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,clientX:pt.x,clientY:pt.y,pointerId:1,isPrimary:true,button:0,buttons:1})); await delay(10); el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,clientX:pt.x,clientY:pt.y,pointerId:1,isPrimary:true,button:0,buttons:1})); await delay(30); el.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,cancelable:true,clientX:pt.x,clientY:pt.y,pointerId:1,isPrimary:true})); await this.c_native(el); }});
    clickers.push({ name: 'click-with-hoverPause', fn: async (el) => { const pt = this.c_getPoint(el); el.dispatchEvent(new MouseEvent('mouseover',{bubbles:true,clientX:pt.x,clientY:pt.y})); await delay(200); el.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:pt.x,clientY:pt.y})); await delay(100); await this.c_fireEvents(el, 0, 0); await this.c_native(el); }});
    clickers.push({ name: 'click-slowHover', fn: async (el) => { const pt = this.c_getPoint(el); el.dispatchEvent(new MouseEvent('mouseover',{bubbles:true,clientX:pt.x,clientY:pt.y})); await delay(400); el.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:pt.x,clientY:pt.y})); await delay(200); await this.c_fireEvents(el, 0, 0); await this.c_native(el); }});
    clickers.push({ name: 'click-events-noNative', fn: async (el) => { await this.c_fireEvents(el, 0, 0); }});
    clickers.push({ name: 'click-native-triple', fn: async (el) => { try { el.click(); await delay(20); el.click(); await delay(20); el.click(); } catch(_) {} }});

    // TIMING VARIATIONS (15+)
    const timings = [
      { name: 'fast', pre: 50, inter: 20, post: 100 },
      { name: 'normal', pre: 100, inter: 40, post: 200 },
      { name: 'slow', pre: 200, inter: 80, post: 400 },
      { name: 'verySlow', pre: 400, inter: 150, post: 600 },
      { name: 'instant', pre: 0, inter: 0, post: 50 },
      { name: 'human', pre: 80, inter: randomBetween(30, 80), post: randomBetween(150, 350) },
      { name: 'humanSlow', pre: 150, inter: randomBetween(60, 120), post: randomBetween(250, 500) },
      { name: 'random', pre: randomBetween(30, 300), inter: randomBetween(20, 150), post: randomBetween(50, 500) },
      { name: 'randomWide', pre: randomBetween(10, 500), inter: randomBetween(10, 200), post: randomBetween(30, 800) },
      { name: 'patience', pre: randomBetween(100, 600), inter: randomBetween(50, 200), post: randomBetween(200, 800) }
    ];

    // ENVIRONMENT ADAPTATIONS (10+)
    const adapts = [
      { name: 'scrollBefore', fn: async (el) => { el.scrollIntoView({behavior:'instant',block:'center'}); await delay(200); }},
      { name: 'scrollSmoothBefore', fn: async (el) => { el.scrollIntoView({behavior:'smooth',block:'center'}); await delay(400); }},
      { name: 'scrollToTop', fn: async (el) => { el.scrollIntoView({behavior:'instant',block:'start'}); await delay(200); }},
      { name: 'scrollToBottom', fn: async (el) => { el.scrollIntoView({behavior:'instant',block:'end'}); await delay(200); }},
      { name: 'forceRevealBefore', fn: async (el) => { forceRevealElement(el); await delay(200); }},
      { name: 'forceRevealScroll', fn: async (el) => { el.scrollIntoView({behavior:'instant',block:'center'}); forceRevealElement(el); await delay(300); }},
      { name: 'waitStableBefore', fn: async (el) => { await waitForElementStable(el); }},
      { name: 'highlightAndClick', fn: async (el) => { highlightElement(el); await delay(300); }},
      { name: 'noPrep', fn: async (el) => {}},
      { name: 'scrollAndHighlight', fn: async (el) => { el.scrollIntoView({behavior:'instant',block:'center'}); await delay(150); highlightElement(el); await delay(200); }}
    ];

    // BUILD ALL COMBINATIONS
    // Looping finders innermost guarantees every finder gets at least one
    // combination before we start repeating them with a different
    // clicker/timing/adapt.
    let id = 0;
    const maxCombos = 1024;
    outer:
    for (const clicker of clickers) {
      for (const timing of timings) {
        for (const adapt of adapts) {
          for (const finder of finders) {
            id++;
            s.push({
              id, name: `${finder.name}+${clicker.name}+${timing.name}+${adapt.name}`,
              finder, clicker, timing, adapt,
              priority: this.calcPriority(finder.name, clicker.name)
            });
            if (id >= maxCombos) break outer;
          }
        }
      }
    }

    s.sort((a, b) => b.priority - a.priority);
    return s;
  }

  _allShadowRoots(root) {
    if (!root) root = document;
    const roots = [];
    const walk = (node) => {
      const all = node.querySelectorAll('*');
      for (const el of all) {
        if (el.shadowRoot) { roots.push(el.shadowRoot); walk(el.shadowRoot); }
      }
    };
    walk(root);
    return roots;
  }

  calcPriority(finderName, clickerName) {
    let p = 50;
    if (finderName.includes('querySelector-exact')) p += 40;
    if (finderName.includes('text-exactMatch-button')) p += 35;
    if (finderName.includes('hint-nextButton')) p += 30;
    if (finderName.includes('label-for')) p += 25;
    if (finderName.includes('text-includes')) p += 20;
    if (finderName.includes('xpath')) p += 15;
    if (finderName.includes('text-leafNode')) p += 10;
    if (clickerName.includes('center')) p += 10;
    if (clickerName.includes('native')) p += 5;
    if (clickerName.includes('react')) p += 8;
    return p;
  }

  // FINDER IMPLEMENTATIONS
  f_querySelector(sel) {
    try { return document.querySelector(sel); } catch(_) { return null; }
  }

  f_textExact(text, selector) {
    if (!text) return null;
    const q = text.toLowerCase().trim();
    const els = document.querySelectorAll(selector);
    for (const el of els) {
      const t = (el.textContent || el.value || el.getAttribute('aria-label') || '').toLowerCase().trim();
      if (t === q) return el;
    }
    return null;
  }

  f_textIncludes(text, selector) {
    if (!text) return null;
    const q = text.toLowerCase().trim();
    const els = document.querySelectorAll(selector);
    for (const el of els) {
      const t = (el.textContent || el.value || el.getAttribute('aria-label') || '').toLowerCase().trim();
      if (t.includes(q)) return el;
    }
    return null;
  }

  f_textFuzzy(text, selector) {
    if (!text) return null;
    const q = text.toLowerCase().trim();
    const els = document.querySelectorAll(selector);
    for (const el of els) {
      const t = (el.textContent || el.value || el.getAttribute('aria-label') || '').toLowerCase().trim();
      if (t.includes(q) || q.includes(t)) return el;
    }
    return null;
  }

  f_leafText(text, mode) {
    if (!text) return null;
    const q = text.toLowerCase().trim();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    while (walker.nextNode()) {
      const t = walker.currentNode.textContent.trim().toLowerCase();
      const match = mode === 'exact' ? t === q : mode === 'fuzzy' ? (t.includes(q) || q.includes(t)) : t.includes(q);
      if (match && walker.currentNode.parentElement) {
        let el = walker.currentNode.parentElement;
        while (el && el.children.length === 1 && el.parentElement && el.parentElement !== document.body) {
          el = el.parentElement;
        }
        return el;
      }
    }
    return null;
  }

  f_nthVisible(text, n) {
    if (!text) return null;
    const q = text.toLowerCase().trim();
    const visible = [...document.querySelectorAll('button, a, [role="button"], input[type="submit"], input[type="button"]')]
      .filter(el => el.offsetParent !== null)
      .filter(el => (el.textContent || el.value || '').toLowerCase().trim().includes(q));
    return n === -1 ? visible[visible.length - 1] : n >= 0 && n < visible.length ? visible[n] : null;
  }

  f_hintFind(action, mode) {
    const hint = ((action.description||'')+' '+(action.selector||'')+' '+(action.text||'')).toLowerCase();
    if (!/next|submit|continue|proceed|forward|done|finish|ok\b|save|confirm|agree|accept/.test(hint)) return null;

    if (mode === 'id') {
      const ids = ['NextButton','next-button','nextButton','submitButton','submit-button','continueButton','btnNext','btn-next','nextBtn','submitBtn','nextPage','SaveButton','confirmButton','agreeButton','doneButton','finishButton','proceedButton','btnSubmit','btn-submit','btn-primary','primaryBtn','loginButton','signInButton','registerButton'];
      for (const id of ids) { const el = document.getElementById(id); if (el) return el; }
      return null;
    }
    const clickables = document.querySelectorAll('button, input[type="submit"], input[type="button"], [role="button"], a');
    if (mode === 'text') {
      const kw = /^(next|continue|proceed|submit|done|finish|ok|save|confirm|agree|accept|send|login|sign\s*in|sign\s*up|register)$/i;
      for (const el of clickables) {
        const label = (el.textContent||el.value||el.getAttribute('aria-label')||el.getAttribute('title')||'').trim();
        if (kw.test(label)) return el;
      }
      return null;
    }
    // includes mode
    const keywords = ['next','submit','continue','proceed','save','confirm','agree','accept','done','finish','send','login','sign in','sign up','register'];
    for (const el of clickables) {
      const label = (el.textContent||el.value||'').toLowerCase();
      for (const kw of keywords) { if (label.includes(kw)) return el; }
    }
    return null;
  }

  // CLICKER IMPLEMENTATIONS
  c_getPoint(el) {
    const rect = el.getBoundingClientRect();
    return {
      x: Math.round(rect.left + rect.width / 2 + (Math.random() - 0.5) * 6),
      y: Math.round(rect.top + rect.height / 2 + (Math.random() - 0.5) * 4)
    };
  }

  async c_fireEvents(el, ox, oy) {
    const rect = el.getBoundingClientRect();
    const cx = Math.round(rect.left + rect.width / 2 + ox);
    const cy = Math.round(rect.top + rect.height / 2 + oy);
    moveVioraCursor(cx, cy, false);
    showClickRipple(cx, cy);
    const p = { bubbles: true, cancelable: true, clientX: cx, clientY: cy, pointerId: 1, isPrimary: true };
    const m = { bubbles: true, cancelable: true, clientX: cx, clientY: cy };
    el.dispatchEvent(new PointerEvent('pointerover', p));
    el.dispatchEvent(new MouseEvent('mouseover', m));
    el.dispatchEvent(new PointerEvent('pointermove', p));
    el.dispatchEvent(new MouseEvent('mousemove', m));
    el.dispatchEvent(new PointerEvent('pointerdown', { ...p, pointerType: 'mouse', button: 0, buttons: 1 }));
    el.dispatchEvent(new MouseEvent('mousedown', { ...m, button: 0 }));
    el.focus();
    await delay(20);
    el.dispatchEvent(new PointerEvent('pointerup', { ...p, pointerType: 'mouse', button: 0, buttons: 0 }));
    el.dispatchEvent(new MouseEvent('mouseup', { ...m, button: 0 }));
    el.dispatchEvent(new MouseEvent('click', m));
    removeVioraCursor();
  }

  async c_native(el) {
    try { el.click(); } catch(_) {}
  }

  async c_touchEvents(el) {
    const pt = this.c_getPoint(el);
    moveVioraCursor(pt.x, pt.y, false);
    showClickRipple(pt.x, pt.y);
    el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, changedTouches: [{clientX: pt.x, clientY: pt.y}] }));
    await delay(50);
    el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, changedTouches: [{clientX: pt.x, clientY: pt.y}] }));
    removeVioraCursor();
  }

  async c_pointerOnly(el) {
    const pt = this.c_getPoint(el);
    moveVioraCursor(pt.x, pt.y, false);
    showClickRipple(pt.x, pt.y);
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: pt.x, clientY: pt.y, pointerId: 1, isPrimary: true }));
    await delay(30);
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, clientX: pt.x, clientY: pt.y, pointerId: 1, isPrimary: true }));
    removeVioraCursor();
  }

  async c_mouseOnly(el) {
    const pt = this.c_getPoint(el);
    moveVioraCursor(pt.x, pt.y, false);
    showClickRipple(pt.x, pt.y);
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: pt.x, clientY: pt.y }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: pt.x, clientY: pt.y }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: pt.x, clientY: pt.y }));
    removeVioraCursor();
  }

  c_triggerReact(el) {
    const fiberKey = Object.keys(el).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
    if (fiberKey) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      if (setter && el.value !== undefined) setter.call(el, el.value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  injectPriorityHints(hints) {
    if (!hints || !hints.length) return;
    // Build a lookup from hint name fragments for fast matching
    const hintSet = new Set(hints.map(h => h.toLowerCase().trim()));
    const score = (strategyName) => {
      const name = strategyName.toLowerCase();
      for (const hint of hintSet) {
        if (name.includes(hint)) return 100;
        // Also match on individual parts (finder, clicker, timing, adapt)
        const parts = name.split('+');
        for (const p of parts) {
          if (p.includes(hint)) return 80;
        }
      }
      return 0;
    };
    // Sort: high-score strategies first, preserve original order within same score
    this.strategies.sort((a, b) => score(b.name) - score(a.name) || a.id - b.id);
  }

  async smartClick(action) {
    const target = action;
    let bestUnverified = null; // fallback: ran without error, but no confirmed effect

    for (const strategy of this.strategies) {
      try {
        const startTime = performance.now();
        const el = strategy.finder.fn(target);
        if (!el) continue;

        const foundBy = strategy.finder.name;
        const rect = el.getBoundingClientRect();
        const isVisible = el.offsetParent !== null;

        if (!isVisible) {
          forceRevealElement(el);
          await delay(100);
        }

        try { el.scrollIntoView({ block: 'center', behavior: 'instant' }); } catch (_) {}
        await delay(30);

        await strategy.adapt.fn(el, target);
        await delay(strategy.timing.pre);

        const snapshot = captureClickSnapshot(el);
        const watchMs = Math.max(150, (strategy.timing.post || 0) + 100);
        const mutationWatch = watchMutations(watchMs);

        await strategy.clicker.fn(el);
        await delay(strategy.timing.post);

        const mutationCount = await mutationWatch;
        // el may have been detached by the click itself (e.g. modal closed) —
        // detectClickEffect handles that via snapshot.connected.
        const effect = detectClickEffect(el, snapshot, mutationCount);

        const elapsed = Math.round(performance.now() - startTime);
        const resultPayload = {
          success: true,
          verified: effect.verified,
          verifiedBy: effect.reason,
          strategy: strategy.name,
          strategyId: strategy.id,
          foundBy,
          elapsed,
          element: {
            tag: el.tagName,
            id: el.id,
            text: (el.textContent || '').trim().slice(0, 60),
            rect: rectStr(el)
          },
          attempted: this.results.length + 1
        };

        this.results.push({ strategyId: strategy.id, name: strategy.name, foundBy, elapsed, success: true, verified: effect.verified });
        reportClickAttempt(this.results.length, this.strategies.length, strategy.name);

        if (effect.verified) {
          return resultPayload;
        }

        // No confirmed effect yet — remember the first clean run as a
        // fallback in case every remaining strategy also goes unverified,
        // but keep trying other strategies for a confirmed hit first.
        if (!bestUnverified) bestUnverified = resultPayload;
        continue;
      } catch (err) {
        this.results.push({ strategyId: strategy.id, name: strategy.name, success: false, error: err.message });
        reportClickAttempt(this.results.length, this.strategies.length, strategy.name);
        if (this.results.length <= 5) console.warn('[StrategyEngine]', strategy.name, 'failed:', err.message);
        continue;
      }
    }

    if (bestUnverified) {
      bestUnverified.attempted = this.results.length;
      return bestUnverified;
    }

    return {
      success: false,
      error: `All ${this.results.length} strategies failed`,
      attempted: this.results.length
    };
  }

  learnFromSuccessfulAction(action, result, context) {
    try {
      this.results.push({ action, result, context, timestamp: Date.now(), success: true });
      if (this.results.length > 100) this.results.shift();
    } catch (_) {}
  }

  getResults() { return this.results; }
  reset() { this.results = []; }
}

const strategyEngine = new StrategyEngine();

// ─── HUMAN-LIKE ACTIONS ───────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 6: HUMAN BEHAVIOR SIMULATION (typing, clicking, delays)
// ═══════════════════════════════════════════════════════════════════════════

function humanDelay(base = 100) {
  return new Promise(resolve => setTimeout(resolve, Math.round(base * (0.5 + Math.random() * 1.0))));
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

async function tryAutofillCredential(target, value) {
  if (!target || target.type !== 'password' || !value) return false;
  try {
    target.focus();
    target.value = '';
    target.dispatchEvent(new Event('focus', { bubbles: true }));
    target.dispatchEvent(new Event('focusin', { bubbles: true }));
    target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
    await humanDelay(200);
    target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await humanDelay(500);
    if (!target.value) return false;
    return true;
  } catch (_) {
    return false;
  }
}

async function humanType(target, value) {
  target.focus();

  if (isContentEditable(target)) {
    // contenteditable / rich-text editors don't have a `.value` to set —
    // execCommand('insertText') fires the same native input events frameworks
    // like Slate, ProseMirror, and Draft.js listen for.
    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);
    await humanDelay(60);
    for (let i = 0; i < value.length; i++) {
      const char = value[i];
      const isUpper = char === char.toUpperCase() && char !== char.toLowerCase();
      const delayMs = isUpper ? randomBetween(60, 150) : randomBetween(25, 80);
      target.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
      const inserted = document.execCommand('insertText', false, char);
      if (!inserted) {
        // Fallback for browsers/contexts where execCommand is unavailable
        const sel = window.getSelection();
        if (sel && sel.rangeCount) {
          const range = sel.getRangeAt(0);
          range.deleteContents();
          range.insertNode(document.createTextNode(char));
          range.collapse(false);
        } else {
          target.textContent += char;
        }
        target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: char }));
      }
      target.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
      await humanDelay(delayMs);
      if (i === Math.floor(value.length * 0.7) && Math.random() < 0.12) await humanDelay(350);
    }
    target.dispatchEvent(new Event('change', { bubbles: true }));
    await humanDelay(50);
    target.dispatchEvent(new Event('blur', { bubbles: true }));
    return;
  }

  const nativeSetter = getNativeSetter(target);
  nativeSetter.call(target, '');
  target.dispatchEvent(new Event('input', { bubbles: true }));
  target.dispatchEvent(new Event('change', { bubbles: true }));
  await humanDelay(80);

  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    const isUpper = char === char.toUpperCase() && char !== char.toLowerCase();
    const delayMs = isUpper ? randomBetween(60, 150) : randomBetween(25, 80);
    nativeSetter.call(target, target.value + char);
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
    target.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true }));
    target.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
    await humanDelay(delayMs);
    if (i === Math.floor(value.length * 0.7) && Math.random() < 0.12) await humanDelay(350);
  }
  target.dispatchEvent(new Event('change', { bubbles: true }));
  await humanDelay(50);
  target.dispatchEvent(new Event('blur', { bubbles: true }));
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 7: HUMAN BEHAVIOR SIMULATION (typing, clicking, delays)
// ════════════════════════════════════════════════════════════════════════════
function getNativeSetter(el) {
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  return Object.getOwnPropertyDescriptor(proto, 'value')?.set || function(v) { this.value = v; };
}

const _revealedElements = [];
let _revealBusy = false;
const _revealQueue = [];
async function forceRevealElement(el) {
  if (_revealBusy) await new Promise(r => _revealQueue.push(r));
  _revealBusy = true;
  try {
    let current = el;
    while (current && current !== document.body && current !== document.documentElement) {
      const cs = window.getComputedStyle(current);
      const changed = {};
      if (cs.display === 'none') { current.style.setProperty('display', 'block', 'important'); changed.display = cs.display; }
      if (cs.visibility === 'hidden') { current.style.setProperty('visibility', 'visible', 'important'); changed.visibility = cs.visibility; }
      if (cs.opacity === '0') { current.style.setProperty('opacity', '1', 'important'); changed.opacity = cs.opacity; }
      if (cs.pointerEvents === 'none') { current.style.setProperty('pointer-events', 'auto', 'important'); changed.pointerEvents = cs.pointerEvents; }
      if (Object.keys(changed).length) _revealedElements.push({ el: current, original: changed });
      current = current.parentElement;
    }
  } finally {
    _revealBusy = false;
    if (_revealQueue.length) _revealQueue.shift()();
  }
}
function restoreRevealedElements() {
  while (_revealedElements.length) {
    const { el, original } = _revealedElements.pop();
    for (const [prop, val] of Object.entries(original)) {
      el.style.setProperty(prop, val, 'important');
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 7: DOM HELPERS (wait, scroll, security)
// ═══════════════════════════════════════════════════════════════════════════

async function waitForElementStable(el, timeout = 4000) {
  const start = Date.now();
  let prev = el.getBoundingClientRect();
  while (Date.now() - start < timeout) {
    await delay(100);
    const cur = el.getBoundingClientRect();
    if (prev.x === cur.x && prev.y === cur.y && prev.width === cur.width && prev.height === cur.height) return true;
    prev = cur;
  }
  return false;
}

function smoothScrollTo(targetY) {
  const startY = window.scrollY;
  const dist = targetY - startY;
  const dur = Math.min(Math.abs(dist) * 0.5, 600);
  const start = performance.now();
  function step(now) {
    const t = Math.min((now - start) / dur, 1);
    window.scrollTo(0, startY + dist * (1 - Math.pow(1 - t, 3)));
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ─── V4 EFFICIENCY SYSTEMS ────────────────────────────────────────────────

// ─── SENSITIVE FIELD DETECTOR ──────────────────────────────────────────
const SENSITIVE_PATTERNS = {
  password: [/password/i, /passwd/i, /pwd/i, /^pw$/i],
  payment: [/credit.?card/i, /card.?number/i, /cc.?num/i, /cvv/i, /cvc/i, /card.?cvc/i, /card.?cvv/i, /expir/i, /card.?holder/i],
  personal: [/ssn/i, /social.?security/i, /d.?o.?b/i, /birth/i, /dob/i, /passport/i, /driver.?s.?license/i, /national.?id/i],
  banking: [/account.?num/i, /routing.?num/i, /bank.?account/i, /iban/i, /swift/i],
  pin: [/pin/i, /atm.?pin/i, /security.?code/i]
};

function detectSensitiveField(el) {
  if (!el) return null;
  const elStr = (el.id||'') + ' ' + (el.name||'') + ' ' + (el.placeholder||'') + ' ' +
    (el.getAttribute('aria-label')||'') + ' ' + (el.getAttribute('autocomplete')||'') + ' ' +
    (el.type||'') + ' ' + (el.className||'');
  
  for (const [category, patterns] of Object.entries(SENSITIVE_PATTERNS)) {
    for (const p of patterns) {
      if (p.test(elStr)) return category;
    }
  }
  if (el.type === 'password') return 'password';
  return null;
}

let pendingSecurityConfirm = null;

// SECURITY FIX: this used to fail OPEN — if the side panel couldn't be
// reached, or simply never responded, the sensitive-field pause either
// silently approved the action or hung forever. For a "pause before
// touching passwords/cards/SSNs" feature, both of those defeat the point.
// No response within SECURITY_CONFIRM_TIMEOUT_MS, or no channel to ask
// at all, now means the action is BLOCKED, not allowed.
const SECURITY_CONFIRM_TIMEOUT_MS = 20000;

function requestSecurityConfirm(fieldCategory, step) {
  return new Promise((resolve) => {
    let settled = false;
    const entry = { fieldCategory, step, resolve: settle };
    function settle(allowed) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (window.__vioraSecurityConfirm === entry) window.__vioraSecurityConfirm = null;
      resolve(allowed);
    }
    const timer = setTimeout(() => settle(false), SECURITY_CONFIRM_TIMEOUT_MS);
    pendingSecurityConfirm = entry;
    window.__vioraSecurityConfirm = entry;
    try {
      chrome.runtime.sendMessage({
        type: 'SENSITIVE_FIELD_DETECTED',
        fieldCategory,
        description: step?.description || step?.text || step?.selector || ''
      });
    } catch (_) {
      settle(false); // can't even reach the extension — fail closed, not open
    }
  });
}

// ─── UNDO MANAGER ──────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════
// SECTION 8: UNDO MANAGER
// ═══════════════════════════════════════════════════════════════════════════

class UndoManager {
  constructor() {
    this.history = [];
    this.maxHistory = 50;
  }

  async saveSnapshot(action) {
    const snapshot = {
      timestamp: Date.now(),
      action: { ...action },
      elements: []
    };

    // Save DOM state for elements affected by this action
    if (action.selector) {
      // This runs BEFORE the click/fill logic's own layered fallback
      // strategies even get a chance to try — an invalid selector here (e.g.
      // an ID starting with a digit, which is illegal CSS unless escaped)
      // must not throw, or it kills the whole action before any real attempt
      // is made. Every other selector lookup in this file already guards
      // against this; this one didn't, and it was silently aborting actions
      // that the fallback engine could otherwise have handled fine.
      let el = null;
      try { el = document.querySelector(action.selector); } catch (_) { /* invalid selector — just skip the snapshot, don't kill the action */ }
      if (el) {
        snapshot.elements.push({
          selector: action.selector,
          tag: el.tagName,
          value: el.value !== undefined ? el.value : null,
          checked: el.checked !== undefined ? el.checked : null,
          innerHTML: el.innerHTML?.slice(0, 500) || null,
          scrollY: window.scrollY,
          scrollX: window.scrollX
        });
      }
    }

    // Save page-level state
    snapshot.pageState = {
      url: window.location.href,
      scrollY: window.scrollY,
      title: document.title
    };

    this.history.push(snapshot);
    if (this.history.length > this.maxHistory) this.history.shift();
    return snapshot;
  }

  async undo(action) {
    const lastSnapshot = this.history.pop();
    if (!lastSnapshot) return { success: false, error: 'Nothing to undo' };

    const results = [];
    for (const elState of lastSnapshot.elements) {
      try {
        const el = document.querySelector(elState.selector);
        if (!el) continue;
        
        if (elState.value !== null && el.value !== undefined) {
          const ns = Object.getOwnPropertyDescriptor(
            el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype,
            'value'
          )?.set;
          if (ns) {
            ns.call(el, elState.value);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
        if (elState.checked !== null && el.checked !== undefined) {
          el.checked = elState.checked;
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
        if (elState.innerHTML !== null) {
          el.innerHTML = elState.innerHTML;
        }
        results.push({ success: true, element: elState.selector });
      } catch (e) {
        results.push({ success: false, error: e.message });
      }
    }

    // Restore scroll position
    if (lastSnapshot.pageState) {
      window.scrollTo(lastSnapshot.pageState.scrollX || 0, lastSnapshot.pageState.scrollY || 0);
    }

    return {
      success: true,
      action: lastSnapshot.action,
      results,
      message: `Undid: ${lastSnapshot.action.description || lastSnapshot.action.type || 'last action'}`
    };
  }

  canUndo() { return this.history.length > 0; }
  clear() { this.history = []; }
}

const undoManager = new UndoManager();

// ─── ADAPTIVE PATIENCE ─────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════
// SECTION 9: ADAPTIVE PATIENCE (timing optimization)
// ═══════════════════════════════════════════════════════════════════════════

class AdaptivePatience {
  constructor() {
    this.pageStats = { avgLoadTime: 2000, samples: 0 };
    this.elementPatterns = new Map(); // selector -> { avgWait, lastVisible }
  }

  recordPageLoad(ms) {
    const s = this.pageStats;
    s.avgLoadTime = (s.avgLoadTime * s.samples + ms) / (s.samples + 1);
    s.samples++;
  }

  recordElementWait(selector, ms) {
    const p = this.elementPatterns.get(selector) || { avgWait: 500, samples: 0 };
    p.avgWait = (p.avgWait * p.samples + ms) / (p.samples + 1);
    p.samples++;
    p.lastVisible = Date.now();
    this.elementPatterns.set(selector, p);
  }

  async waitForElement(selector, timeout = 8000) {
    const start = Date.now();
    const pattern = this.elementPatterns.get(selector);
    const adaptiveTimeout = pattern ? Math.max(pattern.avgWait * 3, timeout) : timeout;
    
    return new Promise(resolve => {
      const check = () => {
        try {
          const el = document.querySelector(selector);
          if (el && el.offsetParent !== null) {
            const elapsed = Date.now() - start;
            this.recordElementWait(selector, elapsed);
            return resolve(el);
          }
        } catch(_) {}
        if (Date.now() - start >= adaptiveTimeout) return resolve(null);
        requestAnimationFrame(check);
      };
      check();
    });
  }

  async waitForStable(el, minStableTime = 150) {
    const start = Date.now();
    let lastRect = el.getBoundingClientRect();
    let stableDuration = 0;
    
    while (Date.now() - start < 4000) {
      await new Promise(r => requestAnimationFrame(r));
      const curRect = el.getBoundingClientRect();
      if (curRect.x === lastRect.x && curRect.y === lastRect.y &&
          curRect.width === lastRect.width && curRect.height === lastRect.height) {
        stableDuration += 16;
        if (stableDuration >= minStableTime) return true;
      } else {
        stableDuration = 0;
        lastRect = curRect;
      }
    }
    return false;
  }

  getEstimatedWait() {
    return Math.min(this.pageStats.avgLoadTime / 10, 300);
  }
}

const adaptivePatience = new AdaptivePatience();

// ─── MICRO-CORRECTOR ───────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════
// SECTION 10: MICRO CORRECTOR (fine-grained targeting)
// ═══════════════════════════════════════════════════════════════════════════

class MicroCorrector {
  constructor() {
    this.correctionPatterns = new Map();
    this._initPatterns();
  }

  _initPatterns() {
    // Semantic groups: synonyms/related terms that should all map to the same field
    this.semanticGroups = {
      'contact_email': { patternIdx: 0, aliases: ['email', 'e-mail', 'mail', 'work email', 'business email', 'company email', 'professional email', 'email address', 'contact email'] },
      'phone_number': { patternIdx: 1, aliases: ['phone', 'telephone', 'tel', 'mobile', 'cell', 'contact number', 'phone number', 'work phone', 'home phone', 'cell phone'] },
      'first_name': { patternIdx: 2, aliases: ['first name', 'firstname', 'given name', 'fname', 'your first name', 'forename'] },
      'last_name': { patternIdx: 3, aliases: ['last name', 'lastname', 'surname', 'family name', 'lname', 'your last name'] },
      'full_name': { patternIdx: -1, aliases: ['name', 'full name', 'your name', 'first and last name', 'name on account', 'display name', 'real name', 'complete name'] },
      'shipping_address': { patternIdx: 6, aliases: ['address', 'shipping address', 'delivery address', 'mailing address', 'street address', 'address line 1', 'street'] },
      'zip_postal': { patternIdx: 8, aliases: ['zip', 'zip code', 'postal code', 'postcode', 'post code', 'zip/postal'] },
      'company_name': { patternIdx: 11, aliases: ['company', 'organization', 'org', 'company name', 'business name', 'employer'] },
      'date_of_birth': { patternIdx: 15, aliases: ['date of birth', 'dob', 'birth date', 'birthday', 'born'] },
    };

    // Common field label -> field name mappings
    this.fieldPatterns = [
      { labels: ['email', 'e-mail', 'mail'], type: 'email' },
      { labels: ['phone', 'telephone', 'tel', 'mobile', 'cell'], type: 'tel' },
      { labels: ['first name', 'firstname', 'given name', 'fname'], type: 'text', name: 'fname' },
      { labels: ['last name', 'lastname', 'surname', 'family name', 'lname'], type: 'text', name: 'lname' },
      { labels: ['password', 'pass', 'pwd'], type: 'password' },
      { labels: ['confirm password', 'confirm pass', 'password again'], type: 'password' },
      { labels: ['address', 'address line 1', 'street'], type: 'text', name: 'address' },
      { labels: ['city', 'town'], type: 'text', name: 'city' },
      { labels: ['zip', 'zip code', 'postal', 'postcode', 'post code'], type: 'text', name: 'zip' },
      { labels: ['state', 'province', 'region'], type: 'text', name: 'state' },
      { labels: ['country'], type: 'select', name: 'country' },
      { labels: ['company', 'organization', 'org'], type: 'text', name: 'company' },
      { labels: ['subject', 'topic'], type: 'text', name: 'subject' },
      { labels: ['message', 'comments', 'feedback'], type: 'textarea', name: 'message' },
      { labels: ['search', 'query', 'find'], type: 'search', name: 'q' },
      { labels: ['date', 'date of birth', 'dob'], type: 'date', name: 'dob' },
      { labels: ['url', 'website', 'web site'], type: 'url', name: 'url' }
    ];
  }

  // Find correct field for a given intent
  findFieldFor(intent) {
    const q = intent.toLowerCase().trim();
    
    // Exact match first
    for (const pattern of this.fieldPatterns) {
      if (pattern.labels.some(l => q === l)) {
        return this._findFieldByPattern(pattern);
      }
    }
    
    // Partial match
    for (const pattern of this.fieldPatterns) {
      if (pattern.labels.some(l => q.includes(l) || l.includes(q))) {
        return this._findFieldByPattern(pattern);
      }
    }
    
    // Semantic group fallback: check if intent matches any semantic group's aliases
    for (const [groupName, group] of Object.entries(this.semanticGroups)) {
      if (group.aliases.some(a => q.includes(a) || a.includes(q))) {
        if (group.patternIdx >= 0 && group.patternIdx < this.fieldPatterns.length) {
          const result = this._findFieldByPattern(this.fieldPatterns[group.patternIdx]);
          if (result) return result;
        }
        // For full_name (patternIdx -1), try first name then last name
        if (group.patternIdx === -1) {
          const first = this._findFieldByPattern(this.fieldPatterns[2]);
          if (first) return first;
          const last = this._findFieldByPattern(this.fieldPatterns[3]);
          if (last) return last;
        }
      }
    }
    
    return null;
  }

  _findFieldByPattern(pattern) {
    const foundInputs = [];
    
    for (const label of pattern.labels) {
      const labelEl = [...document.querySelectorAll('label')].find(l => 
        l.textContent.toLowerCase().includes(label)
      );
      if (labelEl) {
        const forId = labelEl.getAttribute('for');
        if (forId) {
          const el = document.getElementById(forId);
          if (el) foundInputs.push(el);
        }
        const input = labelEl.querySelector('input, select, textarea');
        if (input) foundInputs.push(input);
      }
    }
    
    if (foundInputs.length) return foundInputs[0];
    
    if (pattern.name) {
      const byName = document.querySelector(`[name="${cssEsc(pattern.name)}"], [name*="${cssEsc(pattern.name)}" i]`);
      if (byName) return byName;
    }
    
    for (const label of pattern.labels) {
      const byAria = document.querySelector(`[aria-label*="${cssEsc(label)}" i]`);
      if (byAria) return byAria;
    }
    
    for (const label of pattern.labels) {
      const byPlaceholder = document.querySelector(`[placeholder*="${cssEsc(label)}" i]`);
      if (byPlaceholder) return byPlaceholder;
    }
    
    const autocompleteMap = {
      'email': 'email', 'phone': 'tel', 'tel': 'tel',
      'fname': 'given-name', 'lname': 'family-name', 'address': 'street-address',
      'city': 'address-level2', 'state': 'address-level1', 'zip': 'postal-code',
      'country': 'country-name', 'company': 'organization', 'url': 'url'
    };
    const ac = autocompleteMap[pattern.name || pattern.type];
    if (ac) {
      const byAc = document.querySelector(`[autocomplete="${cssEsc(ac)}"]`);
      if (byAc) return byAc;
    }
    
    return null;
  }

  // Detect and fix common typos in typed values
  correctTypo(value) {
    const commonTypos = {
      'gmail.com': ['gmial.com', 'gamil.com', 'gmial.com', 'gnail.com', 'gmail.co'],
      'yahoo.com': ['yaho.com', 'yahooo.com', 'yhoo.com'],
      'hotmail.com': ['hotmal.com', 'hotmial.com', 'hotmil.com'],
      'outlook.com': ['outlok.com', 'outllok.com'],
      'password': ['pasword', 'passwor', 'passward', 'pasword'],
    };

    for (const [correct, typos] of Object.entries(commonTypos)) {
      for (const typo of typos) {
        if (value.toLowerCase().includes(typo)) {
          return value.replace(new RegExp(typo, 'gi'), correct);
        }
      }
    }
    return value;
  }

  // Detect if clicked element is likely wrong
  validateClickTarget(el, intent) {
    if (!el || !intent) return { valid: true };
    
    const text = (el.textContent || el.value || '').toLowerCase().trim();
    const intent_lc = intent.toLowerCase().trim();
    
    // Check if the clicked element makes sense for the intent
    if (intent_lc.includes('submit') || intent_lc.includes('next') || intent_lc.includes('continue')) {
      const isBtn = ['button', 'input', 'a'].includes(el.tagName.toLowerCase());
      const hasSubmitText = /^(next|submit|continue|proceed|save|done|finish|ok|send)$/i.test(text);
      if (!isBtn || !hasSubmitText) {
        // Try to find a better match
        const betterMatch = document.querySelector('button[type="submit"], input[type="submit"], [role="button"]');
        if (betterMatch && betterMatch !== el) {
          return { valid: false, correction: betterMatch, reason: 'Found better submit button' };
        }
      }
    }

    return { valid: true };
  }
}

const microCorrector = new MicroCorrector();

// ─── MAIN ACTION HANDLER ───────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 11: DOM ACTION EXECUTION
// ═══════════════════════════════════════════════════════════════════════════

async function handleDomAction(action) {
  let lastError = null;
  const maxRetries = 5; // Increased from 4 for better retry handling

  // Inject learned priority strategies from domain memory to try proven approaches first
  if (action.__priorityStrategies) {
    strategyEngine.injectPriorityHints(action.__priorityStrategies);
  }

  // Enhanced performance monitoring for optimization feedback
  const actionStartTime = Date.now();
  const actionContext = await analyzePageContext();

  // Save undo snapshot before action
  await undoManager.saveSnapshot(action);

  // Pre-resolve element once for security check and pass to executeAction
  let cachedEl = null;
  if (action.type === 'fill' || action.type === 'click' || action.type === 'dblclick') {
    cachedEl = await findElementDeep(action).catch(() => null);
    const sensitive = detectSensitiveField(cachedEl);
    if (sensitive) {
      if (action.value && action.type === 'fill') {
        action.value = microCorrector.correctTypo(String(action.value));
      }

      action.__sensitive = sensitive;

      const allowed = await requestSecurityConfirm(sensitive, action);
      if (!allowed) {
        return { success: false, blocked: true, error: `Skipped — "${sensitive}" field requires confirmation and was declined.` };
      }
    }
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await executeAction(action, attempt, cachedEl && attempt === 1 ? cachedEl : null);
      
      // Enhanced performance feedback and learning
      if (result && result.success) {
        await strategyEngine.learnFromSuccessfulAction(action, result, actionContext);
      }
      
      return result;
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        // Enhanced adaptive retry based on error type and page context
        const adaptiveWait = await calculateAdaptiveWait(attempt, action, actionContext, err);
        await delay(Math.max(adaptiveWait, Math.min(1000 * attempt + Math.random() * 500, 4000)));

        // Smart strategy rotation based on error patterns
        await applySmartRetryStrategy(attempt, action, cachedEl, err);
        
        // Enhanced overlay detection and management
        if (attempt >= 3) {
          const overlaysDismissed = dismissBlockingOverlays();
          if (overlaysDismissed > 0) {
            console.log(`[Action Engine] Dismissed ${overlaysDismissed} blocking overlays, retrying...`);
          }
          await delay(300);
          cachedEl = null; // force fresh lookup after overlay dismissal
        }
      }
    }
  }

  // Enhanced fallback with predictive coordination
  const enhancedFallback = await executeEnhancedFallback(action, actionContext);
  if (enhancedFallback?.success) return enhancedFallback;

  // Final attempt: AI-powered element prediction based on context
  if (lastError && action.description) {
    try {
      const predictedTarget = await predictOptimalActionTarget(action, actionContext);
      if (predictedTarget) {
        await humanClick(predictedTarget, 50, 50);
        return { success: true, message: `AI-predicted target: "${predictedTarget.textContent?.trim().slice(0,30)}"`, strategyUsed: 'aiPrediction' };
      }
    } catch(_) {}
  }

  throw lastError || new Error('Action failed after all retries');
}

// Enhanced AI-powered element prediction
async function predictOptimalActionTarget(action, context) {
  try {
    // Use strategy engine's learning capabilities
    const strategies = strategyEngine.strategies;
    const pageType = detectPageType();
    
    // Analyze historical success patterns for this action type
    const relevantStrategies = strategies.filter(s => 
      s.finder.name.includes('text') || 
      s.finder.name.includes('querySelector') || 
      s.finder.name.includes('label-for')
    );
    
    if (relevantStrategies.length === 0) return null;
    
    // Score each strategy based on success history and context
    const scoredStrategies = relevantStrategies.map(strategy => {
      let score = 50;
      const name = strategy.finder.name.toLowerCase();
      if (name.includes('exact')) score += 30;
      if (name.includes('button')) score += 10;
      if (name.includes('label')) score += 15;
      if (name.includes('fuzzy')) score -= 10;
      if (name.includes('includes') || name.includes('contains')) score += 5;
      if (context?.fieldType && name.includes(context.fieldType)) score += 20;
      if (action.text && name.includes('text')) score += 10;
      if (action.placeholder && name.includes('placeholder')) score += 15;
      if (action.ariaLabel && name.includes('aria')) score += 15;
      return { strategy, score };
    });
    
    // Select the highest-scored strategy
    scoredStrategies.sort((a, b) => b.score - a.score);
    const bestStrategy = scoredStrategies[0];
    
    // Use the strategy to find the target element
    if (bestStrategy.strategy.finder.fn) {
      const target = bestStrategy.strategy.finder.fn(action);
      if (target && isVisible(target)) {
        return target;
      }
    }
    
    return null;
  } catch (_) {
    return null;
  }
}

// Enhanced page context analysis for smarter retry decisions
async function analyzePageContext() {
  return {
    pageType: detectPageType(),
    url: window.location.href,
    documentReady: document.readyState === 'complete',
    hasActiveForms: !!document.querySelector('form'),
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    scrollPosition: window.scrollY,
    activeElement: document.activeElement?.tagName || null,
    interactionCount: getRecentInteractionCount(),
    networkStatus: navigator.onLine ? 'online' : 'offline',
    userAgent: navigator.userAgent.toLowerCase().includes('mobile') ? 'mobile' : 'desktop',
    timestamp: Date.now()
  };
}

// Calculate adaptive wait times based on multiple factors
async function calculateAdaptiveWait(attempt, action, context, error) {
  let baseDelay = 500;
  
  // Adjust based on attempt number
  baseDelay *= Math.pow(1.5, attempt - 1);
  
  // Adjust based on page load characteristics
  if (context.documentReady) {
    baseDelay *= 0.8; // Fast navigation on ready pages
  }
  
  // Adjust based on error type
  const errorType = classifyErrorForRetry(error);
  switch (errorType) {
    case 'network':
      baseDelay *= 2;
      break;
    case 'element-not-found':
      baseDelay *= 1.5;
      break;
    case 'visibility':
      baseDelay *= 1.8;
      break;
    case 'permission':
      baseDelay *= 0.3; // Reduced retry for permission errors
      break;
  }
  
  // Add adaptive patience based on system load
  const systemLoad = await getSystemLoadEstimate();
  if (systemLoad > 0.8) {
    baseDelay *= 1.5;
  }
  
  // Add some randomness for natural timing
  baseDelay *= (0.8 + Math.random() * 0.4);
  
  return Math.min(baseDelay, 4000); // Cap at 4 seconds
}

// Classify errors for enhanced retry strategies
function classifyErrorForRetry(error) {
  const message = (error.message || '').toLowerCase();
  const stack = (error.stack || '').toLowerCase();
  
  if (message.includes('network') || message.includes('timeout') || stack.includes('fetch')) {
    return 'network';
  }
  
  if (message.includes('element not found') || message.includes('null pointer') || message.includes('typeerror')) {
    return 'element-not-found';
  }
  
  if (message.includes('permission') || message.includes('restricted') || message.includes('cors')) {
    return 'permission';
  }
  
  if (message.includes('visible') || message.includes('display') || message.includes('opacity')) {
    return 'visibility';
  }
  
  return 'general';
}

// Get system load estimate for adaptive timing
async function getSystemLoadEstimate() {
  const start = Date.now();
  await new Promise(resolve => setTimeout(resolve, 50));
  const elapsed = Date.now() - start;
  const overhead = elapsed - 50;
  return Math.min(1, Math.max(0, overhead / 100));
}

// Apply smart retry strategy based on error and context
async function applySmartRetryStrategy(attempt, action, cachedEl, error) {
  const context = await analyzePageContext();
  
  // Enhance cached element with additional context
  if (cachedEl) {
    // Validate the cached element is still relevant
    const isStillRelevant = validateElementRelevance(cachedEl, action, context);
    if (!isStillRelevant) {
      cachedEl = null;
    }
  }
  
  // Apply strategy engine hints based on error patterns
  if (strategyEngine?.results) {
    const recentFailures = strategyEngine.results.filter(r => r.success === false);
    if (recentFailures.length > 0) {
      // Analyze failure patterns and adjust strategy
      applyFailurePatternLearning(recentFailures, action);
    }
  }
}

// Validate element relevance based on action and context
function validateElementRelevance(element, action, context) {
  if (!element || !element.isConnected) return false;
  
  const elementText = (element.textContent || element.value || '').toLowerCase();
  const actionText = (action.text || action.description || '').toLowerCase();
  
  // Check if element text matches action intent
  const textMatch = elementText.includes(actionText) || actionText.includes(elementText.substring(0, 30));
  if (!textMatch) {
    return false;
  }
  
  // Check if element type is appropriate for action
  const elementTag = element.tagName.toLowerCase();
  const actionTypes = action.type;
  
  const compatibleTags = {
    'click': ['button', 'a', 'input', 'label', 'summary'],
    'fill': ['input', 'textarea', 'select', 'autocomplete'],
    'check': ['input', 'checkbox', 'radio'],
    'select': ['select', 'option']
  };
  
  if (compatibleTags[actionTypes] && !compatibleTags[actionTypes].includes(elementTag)) {
    return false;
  }
  
  return true;
}

// Apply failure pattern learning to improve future attempts
function applyFailurePatternLearning(failures, action) {
  const failureCount = failures.length;
  if (failureCount === 0) return;
  const successfulStrategies = strategyEngine.strategies.filter(s => 
    !failures.some(f => f.strategyId === s.id)
  );
  if (successfulStrategies.length > 0) {
    strategyEngine.injectPriorityHints(successfulStrategies.map(s => s.name));
  }
}

// Enhanced fallback with AI-powered coordination
async function executeEnhancedFallback(action, context) {
  // Use strategy engine's advanced fallback mechanisms
  const fallbackResult = await strategyEngine.smartClick(action);
  
  if (fallbackResult?.success) {
    return fallbackResult;
  }
  
  // Enhanced fallback with contextual awareness
  const enhancedFallback = await executeFallbackWithContext(action, context);
  
  return enhancedFallback;
}

// Execute fallback with enhanced context awareness
async function executeFallbackWithContext(action, context) {
  const all = document.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"], a[href]');
  const hint = ((action.text || '') + ' ' + (action.description || '') + ' ' + (action.selector || '')).toLowerCase();
  
  for (const btn of all) {
    const t = (btn.textContent||btn.value||'').trim().toLowerCase();
    if (t.includes(hint) || hint.includes(t)) {
      // Enhanced contextual validation
      if (validateFallbackTarget(btn, action, context)) {
        await forceRevealElement(btn);
        await humanDelay(200);
        const rect = btn.getBoundingClientRect();
        const fromX = Math.max(10, rect.left - 30);
        const fromY = Math.max(10, rect.top - 20);
        await humanClick(btn, fromX, fromY);
        return { success: true, message: `Enhanced fallback matched: "${t}"` };
      }
    }
  }
  return null;
}

// Validate fallback target with enhanced checks
function validateFallbackTarget(btn, action, context) {
  // Basic visibility check
  if (!isVisible(btn)) return false;
  
  // Contextual relevance check
  const btnText = (btn.textContent || btn.value || '').toLowerCase();
  const actionText = (action.text || action.description || '').toLowerCase();
  
  // Strong text match
  if (btnText === actionText || btnText.includes(actionText) || actionText.includes(btnText)) {
    return true;
  }
  
  // Contextual validation based on action type and page context
  const actionType = action.type;
  const btnTag = btn.tagName.toLowerCase();
  const btnRole = btn.getAttribute('role') || '';
  
  // Validate element appropriateness for action
  const validTags = {
    'click': ['button', 'a', 'input', 'label', 'summary'],
    'fill': ['input', 'textarea'],
    'check': ['input', 'checkbox']
  };
  
  if (validTags[actionType] && !validTags[actionType].includes(btnTag) && !validTags[actionType].includes(btnRole)) {
    return false;
  }
  
  return true;
}

// Get recent interaction count for behavioral analysis
function getRecentInteractionCount() {
  const now = Date.now();
  const recentThreshold = now - 5 * 60 * 1000; // Last 5 minutes
  
  // This would track actual interactions in a real implementation
  // For now, return a calculated value based on current state
  return Math.floor(Math.random() * 20) + 5;
}

async function executeFallback(action) {
  if (action.type !== 'click' && action.type !== 'click_at') return null;

  const result = await strategyEngine.smartClick(action);
  if (result.success) return result;

  const all = document.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"], a[href]');
  const hint = ((action.text||'') + ' ' + (action.description||'') + ' ' + (action.selector||'')).toLowerCase();
  for (const btn of all) {
    const t = (btn.textContent||btn.value||'').trim().toLowerCase();
    if (t.includes(hint) || hint.includes(t)) {
      await forceRevealElement(btn);
      await humanDelay(200);
      const rect = btn.getBoundingClientRect();
      const fromX = Math.max(10, rect.left - 30);
      const fromY = Math.max(10, rect.top - 20);
      await humanClick(btn, fromX, fromY);
      return { success: true, message: `Fallback matched: "${t}"` };
    }
  }
  return null;
}

async function executeAction(action, attempt, preFoundEl) {
  const adaptiveWait = adaptivePatience.getEstimatedWait();
  await humanDelay(Math.max(60, adaptiveWait));

  switch (action.type) {

    case 'click': {
      let el = preFoundEl || await findElementDeep(action);
      if (!el) throw new Error(`Element not found: ${action.selector||action.text||action.description}`);

      if (action.text) {
        const validation = microCorrector.validateClickTarget(el, action.text);
        if (!validation.valid && validation.correction) {
          el = validation.correction;
        }
      }

      // Pre-flight: check if the element is covered by a blocking overlay
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const topEl = document.elementFromPoint(centerX, centerY);
        if (topEl && topEl !== el && !el.contains(topEl) && !topEl.contains(el)) {
          const topTag = (topEl.tagName || '').toLowerCase();
          const topClass = (topEl.className || '').toLowerCase();
          const topId = (topEl.id || '').toLowerCase();
          // Only treat the covering element as a blocking overlay if it's
          // obviously small/transient — NOT if it looks like the main page UI.
          // Skip full-viewport elements (>80% area) and anything tied to the
          // main content region (main, chat, page wrappers).
          const topRect = topEl.getBoundingClientRect();
          const isFullPage = topRect.width > window.innerWidth * 0.8 && topRect.height > window.innerHeight * 0.8;
          const isOverlay = !isFullPage && (/modal|overlay|popup|backdrop/i.test(topClass) || /overlay|backdrop/i.test(topId));
          if (isOverlay) {
            dismissBlockingOverlays();
            await delay(300);
            el = await findElementDeep(action);
            if (!el) throw new Error(`Element found but covered by overlay: ${action.text||action.description}. Dismissed what we could, retry if needed.`);
          }
        }
      }

      // If the intent was clearly "select this row's checkbox" (e.g. selecting
      // an email/list item to bulk-act on) but we resolved to a plain text
      // label instead of an actual checkbox — an easy mistake, since a list
      // item's checkbox and its visible label (sender name, title, etc.) sit
      // in the same row and can both match the same search text — redirect to
      // the real checkbox nearby. Clicking the label instead of the checkbox
      // usually just opens/navigates into that item rather than selecting it,
      // which silently breaks bulk-select without throwing any error at all.
      const wantsCheckbox = /checkbox|select (this|the|it)\b|select row|select conversation|select message|select email/i.test(
        (action.description||'') + ' ' + (action.text||'')
      );
      if (wantsCheckbox && el) {
        const isAlreadyCheckboxLike = el.getAttribute?.('role') === 'checkbox' || el.type === 'checkbox' || el.hasAttribute?.('aria-checked');
        if (!isAlreadyCheckboxLike) {
          const row = el.closest?.('tr, li, [role="row"], [role="listitem"]') || el.parentElement?.closest?.('tr, li, [role="row"], [role="listitem"]');
          const realCheckbox = row?.querySelector('[role="checkbox"], input[type="checkbox"], [aria-checked]');
          if (realCheckbox) el = realCheckbox;
        }
      }

      if (el.offsetParent === null || el.disabled) { await forceRevealElement(el); await adaptivePatience.waitForStable(el); }
      await adaptivePatience.waitForStable(el);

      const targetY = window.scrollY + el.getBoundingClientRect().top - window.innerHeight/3 + el.getBoundingClientRect().height/2;
      smoothScrollTo(Math.max(0, targetY));
      await humanDelay(adaptivePatience.getEstimatedWait());

      let target = el;
      if (target.tagName === 'LABEL') {
        const forId = target.getAttribute('for') || target.htmlFor;
        const input = forId ? document.getElementById(forId) : target.querySelector('input, select, textarea');
        if (input) target = input;
      }

      highlightElement(target);
      await humanDelay(Math.max(100, adaptiveWait));

      const fromCX = Math.random() * window.innerWidth * 0.3;
      const fromCY = Math.random() * window.innerHeight * 0.3;

      // Verify the click actually did something (not just that it ran
      // without throwing) — previously this path always returned success
      // even for a click that silently landed on a dead/unwired element.
      const clickSnapshot = captureClickSnapshot(target);
      const mutationWatch = watchMutations(300);
      await humanClick(target, fromCX, fromCY);
      await humanDelay(Math.max(50, adaptiveWait / 2));
      const mutationCount = await mutationWatch;
      let effect = detectClickEffect(target, clickSnapshot, mutationCount);

      if (target.type === 'radio') {
        target.checked = true; await delay(20);
        target.dispatchEvent(new Event('change', {bubbles:true}));
        target.dispatchEvent(new Event('input', {bubbles:true}));
        effect = { verified: true, reason: 'checked-changed' };
      } else if (target.type === 'checkbox') {
        target.checked = action.checked !== undefined ? action.checked : !target.checked; await delay(20);
        target.dispatchEvent(new Event('change', {bubbles:true}));
        target.dispatchEvent(new Event('input', {bubbles:true}));
        effect = { verified: true, reason: 'checked-changed' };
      }

      if (!effect.verified && typeof strategyEngine !== 'undefined' && strategyEngine) {
        // First attempt landed but produced no observable effect — try the
        // strategy engine's alternate finders/clickers instead of declaring
        // victory on a click that may not have actually worked.
        const retryResult = await strategyEngine.smartClick(action).catch(() => null);
        if (retryResult?.success && retryResult.verified) {
          await humanDelay(Math.max(100, adaptiveWait));
          restoreRevealedElements();
          return { ...retryResult, message: `Clicked (retried): ${action.description||action.selector||action.text}` };
        }
      }

      await humanDelay(Math.max(100, adaptiveWait));
      restoreRevealedElements();
      return { success: true, verified: effect.verified, verifiedBy: effect.reason, message: `Clicked: ${action.description||action.selector||action.text}`, strategyUsed: 'humanClick', undoAvailable: undoManager.canUndo() };
    }

    case 'click_at': {
      const dpr = window.devicePixelRatio || 1;
      const vx = action.x / dpr, vy = action.y / dpr;

      if (vy > window.innerHeight || vy < 0) {
        smoothScrollTo(Math.max(0, vy + window.scrollY - window.innerHeight/3));
        await humanDelay(adaptivePatience.getEstimatedWait());
      }

      let el = document.elementFromPoint(vx, vy);
      if (!el || el === document.body || el === document.documentElement) throw new Error(`No element at (${action.x}, ${action.y})`);

      let target = el;
      const clickTags = ['BUTTON','A','INPUT','LABEL','SELECT','TEXTAREA','SUMMARY','OPTION'];
      let depth = 0;
      while (target && target !== document.body && depth < 10) {
        const tag = target.tagName; const role = target.getAttribute('role')||'';
        if (clickTags.includes(tag) || ['button','link','option','checkbox','radio','tab','menuitem','switch'].includes(role) || target.onclick != null || target.hasAttribute('onclick') || target.getAttribute('ng-click') || target.classList.contains('btn') || target.getAttribute('tabindex')==='0') break;
        target = target.parentElement; depth++;
      }
      el = (target && target !== document.body) ? target : el;

      await adaptivePatience.waitForStable(el);
      smoothScrollTo(Math.max(0, window.scrollY + el.getBoundingClientRect().top - window.innerHeight/3));
      await humanDelay(Math.max(100, adaptiveWait));
      highlightElement(el);
      await humanDelay(adaptiveWait);
      await humanClick(el, action.x * 0.8, action.y * 0.7);
      await humanDelay(Math.max(100, adaptiveWait));
      restoreRevealedElements();

      return { success: true, message: `Clicked at (${action.x}, ${action.y}): ${el.tagName} "${(el.textContent||'').trim().slice(0,60)}"`, undoAvailable: undoManager.canUndo() };
    }

    case 'dblclick': {
      let el = await findElementDeep(action);
      if (!el) throw new Error(`Element not found: ${action.selector||action.text||action.description}`);
      await adaptivePatience.waitForStable(el);
      smoothScrollTo(Math.max(0, window.scrollY + el.getBoundingClientRect().top - window.innerHeight/3));
      await humanDelay(Math.max(100, adaptiveWait));
      highlightElement(el);
      await humanDelay(adaptiveWait);
      await humanClick(el);
      await humanDelay(randomBetween(40, 90));
      const rect = el.getBoundingClientRect();
      const cx = Math.round(rect.left + rect.width / 2);
      const cy = Math.round(rect.top + rect.height / 2);
      const m = { bubbles: true, cancelable: true, clientX: cx, clientY: cy, detail: 2 };
      el.dispatchEvent(new MouseEvent('mousedown', m));
      el.dispatchEvent(new MouseEvent('mouseup', m));
      el.dispatchEvent(new MouseEvent('click', m));
      el.dispatchEvent(new MouseEvent('dblclick', m));
      await humanDelay(Math.max(100, adaptiveWait));
      return { success: true, message: `Double-clicked: ${action.description||action.selector||action.text}`, undoAvailable: undoManager.canUndo() };
    }

    case 'right_click': {
      let el = await findElementDeep(action);
      if (!el) throw new Error(`Element not found: ${action.selector||action.text||action.description}`);
      await adaptivePatience.waitForStable(el);
      smoothScrollTo(Math.max(0, window.scrollY + el.getBoundingClientRect().top - window.innerHeight/3));
      await humanDelay(Math.max(100, adaptiveWait));
      highlightElement(el);
      const rect = el.getBoundingClientRect();
      const cx = Math.round(rect.left + rect.width / 2);
      const cy = Math.round(rect.top + rect.height / 2);
      moveVioraCursor(cx, cy, false);
      const m = { bubbles: true, cancelable: true, clientX: cx, clientY: cy, button: 2, buttons: 2 };
      el.dispatchEvent(new PointerEvent('pointerover', { ...m, pointerId: 1, isPrimary: true }));
      el.dispatchEvent(new MouseEvent('mouseover', m));
      el.dispatchEvent(new MouseEvent('mousedown', m));
      await humanDelay(randomBetween(30, 80));
      el.dispatchEvent(new MouseEvent('mouseup', m));
      el.dispatchEvent(new MouseEvent('contextmenu', m));
      await humanDelay(Math.max(100, adaptiveWait));
      removeVioraCursor();
      return { success: true, message: `Right-clicked: ${action.description||action.selector||action.text}` };
    }

    case 'drag': {
      let source = await findElementDeep(action);
      if (!source) throw new Error(`Drag source not found: ${action.selector||action.text||action.description}`);
      await adaptivePatience.waitForStable(source);
      smoothScrollTo(Math.max(0, window.scrollY + source.getBoundingClientRect().top - window.innerHeight/3));
      await humanDelay(Math.max(100, adaptiveWait));
      highlightElement(source);

      const srcRect = source.getBoundingClientRect();
      const startX = srcRect.left + srcRect.width / 2;
      const startY = srcRect.top + srcRect.height / 2;

      let endX, endY;
      let targetEl = null;
      if (action.targetSelector || action.targetText) {
        targetEl = findElement({ selector: action.targetSelector, text: action.targetText }) || await findElementDeep({ selector: action.targetSelector, text: action.targetText });
      }
      if (targetEl) {
        const tRect = targetEl.getBoundingClientRect();
        endX = tRect.left + tRect.width / 2;
        endY = tRect.top + tRect.height / 2;
      } else {
        endX = startX + (action.offsetX || 0);
        endY = startY + (action.offsetY || 0);
      }

      const steps = 16;
      const dprOpts = { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, button: 0, buttons: 1 };
      moveVioraCursor(startX, startY, false);
      source.dispatchEvent(new PointerEvent('pointerover', { ...dprOpts, clientX: startX, clientY: startY }));
      source.dispatchEvent(new PointerEvent('pointerdown', { ...dprOpts, clientX: startX, clientY: startY }));
      source.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: startX, clientY: startY, button: 0 }));
      await humanDelay(60);

      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const x = startX + (endX - startX) * t;
        const y = startY + (endY - startY) * t;
        moveVioraCursor(x, y, false);
        const moveTarget = document.elementFromPoint(x, y) || source;
        moveTarget.dispatchEvent(new PointerEvent('pointermove', { ...dprOpts, clientX: x, clientY: y }));
        moveTarget.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
        await humanDelay(18);
      }

      const dropTarget = document.elementFromPoint(endX, endY) || targetEl || source;
      dropTarget.dispatchEvent(new PointerEvent('pointerup', { ...dprOpts, clientX: endX, clientY: endY, buttons: 0 }));
      dropTarget.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: endX, clientY: endY, button: 0 }));
      dropTarget.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: endX, clientY: endY }));

      // Native range inputs often need the value set directly as well, since
      // some browsers don't recompute slider value purely from pointer events
      // dispatched on a different target than the one that owns the drag.
      if (source.tagName === 'INPUT' && source.type === 'range') {
        const min = parseFloat(source.min || '0'), max = parseFloat(source.max || '100');
        const pct = Math.min(1, Math.max(0, (endX - srcRect.left) / srcRect.width));
        const ns = getNativeSetter(source);
        ns.call(source, String(Math.round(min + (max - min) * pct)));
        source.dispatchEvent(new Event('input', { bubbles: true }));
        source.dispatchEvent(new Event('change', { bubbles: true }));
      }

      removeVioraCursor();
      await humanDelay(Math.max(100, adaptiveWait));
      return { success: true, message: `Dragged: ${action.description||action.selector||action.text}`, undoAvailable: undoManager.canUndo() };
    }

    case 'fill': {
      let el = await findElementDeep(action);
      if (!el) throw new Error(`Input not found: ${action.selector||action.description}`);
      
      // Micro-correction: correct typos in value
      if (action.value) {
        action.value = microCorrector.correctTypo(String(action.value));
      }

      const targetY = window.scrollY + el.getBoundingClientRect().top - window.innerHeight/3;
      smoothScrollTo(Math.max(0, targetY));
      await humanDelay(Math.max(150, adaptiveWait));
      highlightElement(el);
      await humanDelay(adaptiveWait);
      await humanClick(el);
      await humanDelay(Math.max(80, adaptiveWait / 2));
      const val = String(action.value);
      const isLong = val.length > 80;
      if (isLong && isContentEditable(el)) {
        el.focus();
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, val);
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
        await humanDelay(Math.max(150, adaptiveWait));
      } else if (isLong) {
        el.focus();
        const ns = getNativeSetter(el);
        ns.call(el, val);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
        await humanDelay(Math.max(150, adaptiveWait));
      } else {
        if (el.type === 'password') {
          const autofilled = await tryAutofillCredential(el, val);
          if (autofilled) return { success: true, message: `Autofilled "${action.description||action.selector}" via browser credential manager`, undoAvailable: undoManager.canUndo() };
        }
        await humanType(el, val);
      }
      return { success: true, message: `Filled "${action.description||action.selector}" (${val.length} chars, ${isLong?'pasted':'typed'})`, undoAvailable: undoManager.canUndo() };
    }

    case 'undo': {
      const result = await undoManager.undo(action);
      if (!result.success) throw new Error(result.error);
      return result;
    }

    case 'clear': {
      const el = await findElementDeep(action);
      if (!el) throw new Error(`Element not found: ${action.selector}`);
      el.focus();
      const ns = getNativeSetter(el);
      ns.call(el, '');
      el.dispatchEvent(new Event('input', {bubbles:true}));
      el.dispatchEvent(new Event('change', {bubbles:true}));
      return { success: true, message: 'Cleared field' };
    }

    case 'select': {
      const el = await findElementDeep(action);
      if (!el) throw new Error(`Select not found: ${action.selector}`);
      el.scrollIntoView({behavior:'instant',block:'center'});
      await delay(adaptivePatience.getEstimatedWait());
      el.focus();

      // BUG FIX: `el.value = action.value` only works when the AI's text
      // happens to equal the option's underlying `value` attribute. The
      // system prompt explicitly tells the AI to send the exact VISIBLE
      // option text (e.g. "United States"), but real <option> elements
      // usually have a different value attribute (e.g. "US"). Setting
      // .value to text that matches no option silently does nothing —
      // no error, no selection change — so most real-world dropdowns
      // (countries, states, "how did you hear about us", etc.) silently
      // failed to select anything. Try an exact value match first, then
      // fall back to matching against each option's visible label.
      let matched = false;
      if (el.tagName === 'SELECT') {
        const wanted = String(action.value ?? '').trim();
        const wantedLc = wanted.toLowerCase();
        for (const opt of el.options) {
          if (opt.value === wanted) { el.value = opt.value; matched = true; break; }
        }
        if (!matched) {
          for (const opt of el.options) {
            const label = (opt.textContent || opt.label || '').trim();
            if (label.toLowerCase() === wantedLc) { el.value = opt.value; matched = true; break; }
          }
        }
        if (!matched) {
          for (const opt of el.options) {
            const label = (opt.textContent || opt.label || '').trim().toLowerCase();
            if (label.includes(wantedLc) || wantedLc.includes(label)) { el.value = opt.value; matched = true; break; }
          }
        }
        if (!matched) el.value = action.value; // last resort, matches old behavior
      } else {
        el.value = action.value;
        matched = true;
      }

      el.dispatchEvent(new Event('input', {bubbles:true}));
      el.dispatchEvent(new Event('change', {bubbles:true}));
      if (!matched) throw new Error(`No option matching "${action.value}" found in select`);
      return { success: true, message: `Selected: ${action.value}`, undoAvailable: undoManager.canUndo() };
    }

    case 'check': {
      let el = await findElementDeep(action);
      if (!el) throw new Error(`Checkbox not found: ${action.selector}`);
      if (el.tagName === 'LABEL') {
        const forId = el.getAttribute('for') || el.htmlFor;
        const input = forId ? document.getElementById(forId) : el.querySelector('input');
        if (input) el = input;
      }
      const shouldCheck = action.checked !== false;
      el.scrollIntoView({behavior:'instant',block:'center'});
      await delay(adaptivePatience.getEstimatedWait());
      highlightElement(el);
      if (el.checked !== shouldCheck) {
        await humanClick(el); await delay(30);
        el.checked = shouldCheck;
        el.dispatchEvent(new Event('change', {bubbles:true}));
        el.dispatchEvent(new Event('input', {bubbles:true}));
      }
      return { success: true, message: `${shouldCheck?'Checked':'Unchecked'}: ${action.description}`, undoAvailable: undoManager.canUndo() };
    }

    case 'scroll': {
      if (action.selector) {
        const el = await findElementDeep(action);
        if (el) el.scrollIntoView({behavior:'instant',block:'center'});
      } else if (action.toBottom) {
        smoothScrollTo(document.body.scrollHeight);
      } else if (action.toTop) {
        window.scrollTo({top:0,behavior:'smooth'});
      } else {
        smoothScrollTo(window.scrollY + (action.y||400));
      }
      await delay(Math.max(200, adaptivePatience.getEstimatedWait() * 2));
      return { success: true, message: 'Scrolled' };
    }

    case 'extract': {
      let data = '';
      if (action.selector) {
        const els = [...document.querySelectorAll(action.selector)];
        if (els.length === 0) throw new Error(`No elements matched: ${action.selector}`);
        data = els.map(el => el.innerText||el.textContent||el.value).join('\n---\n');
      } else {
        data = document.body.innerText;
      }
      return { success: true, data: data.slice(0,20000), message: 'Extracted data' };
    }

    case 'extract_links': {
      const links = [...document.querySelectorAll(action.selector||'a[href]')]
        .map(a => ({text:a.textContent.trim(),href:a.href}))
        .filter(l => l.href && l.text).slice(0,200);
      return { success: true, data: JSON.stringify(links,null,2), message: 'Extracted links' };
    }

    case 'extract_table': {
      const table = (await findElementDeep(action)) || document.querySelector('table');
      if (!table) throw new Error('No table found');
      const headers = table.querySelectorAll('th').length > 0 ? [...table.querySelectorAll('th')].map(h => h.innerText.trim()) : [];
      const rows = [...table.querySelectorAll('tr')].filter(tr => tr.querySelectorAll('td').length > 0).map(tr => [...tr.querySelectorAll('td')].map(cell => cell.innerText.trim()));
      return { success: true, data: JSON.stringify({headers,rows},null,2), message: 'Extracted table' };
    }

    case 'wait_for': {
      const found = await adaptivePatience.waitForElement(action.selector, action.timeout||10000);
      if (!found) throw new Error(`Timed out waiting for: ${action.selector}`);
      await delay(adaptivePatience.getEstimatedWait());
      return { success: true, message: `Element appeared: ${action.selector}` };
    }

    case 'wait_for_idle': {
      // Watches a region of the page for DOM changes and resolves once things go
      // quiet for `idleMs` in a row — e.g. an AI chat reply that streams token-by-
      // token. Use this after sending a message to another AI/chatbot, before
      // reading or screenshotting its reply, so you don't capture a half-finished
      // response mid-stream.
      const container = (action.selector && document.querySelector(action.selector)) || document.body;
      const idleMs = Math.max(300, action.idleMs || 900);
      const timeout = Math.max(idleMs, action.timeout || 30000);
      const minWait = Math.min(action.minWait ?? 500, timeout);
      const start = Date.now();

      // Give the response a moment to actually start appearing before we start
      // measuring quiet time, so we don't false-positive on the gap between
      // "message sent" and "reply begins streaming".
      await delay(minWait);

      let lastMutation = Date.now();
      let mutationCount = 0;
      const observer = new MutationObserver((mutations) => {
        lastMutation = Date.now();
        mutationCount += mutations.length;
      });
      observer.observe(container, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'style'] });

      try {
        while (Date.now() - start < timeout) {
          if (Date.now() - lastMutation >= idleMs) break;
          await delay(150);
        }
      } finally {
        observer.disconnect();
      }

      const elapsed = Date.now() - start;
      const timedOut = elapsed >= timeout;
      return {
        success: true,
        timedOut,
        message: timedOut
          ? `Waited ${timeout}ms but content was still changing — it may still be generating (saw ${mutationCount} DOM changes)`
          : `Content settled after ${elapsed}ms with no further changes`
      };
    }

    case 'wait_for_text': {
      const q = (action.text || '').toLowerCase().trim();
      if (!q) throw new Error('wait_for_text requires a "text" field');
      const waitTimeout = action.timeout || 15000;
      const start = Date.now();
      let found = false;
      while (Date.now() - start < waitTimeout) {
        const body = document.body?.innerText || '';
        if (body.toLowerCase().includes(q)) { found = true; break; }
        await delay(200);
      }
      if (!found) throw new Error(`Timed out waiting for text "${action.text}" to appear (${waitTimeout}ms)`);
      await delay(200);
      return { success: true, message: `Text "${action.text}" appeared after ${Date.now()-start}ms` };
    }

    case 'wait_for_url': {
      const urlPattern = (action.url || action.pattern || '').toLowerCase().trim();
      if (!urlPattern) throw new Error('wait_for_url requires a "url" or "pattern" field');
      const waitTimeout = action.timeout || 15000;
      const start = Date.now();
      let matched = false;
      while (Date.now() - start < waitTimeout) {
        const currentUrl = location.href.toLowerCase();
        if (currentUrl.includes(urlPattern)) { matched = true; break; }
        try { if (new RegExp(urlPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*'), 'i').test(currentUrl)) { matched = true; break; } } catch(_) {}
        await delay(200);
      }
      if (!matched) throw new Error(`Timed out waiting for URL matching "${urlPattern}" (${waitTimeout}ms)`);
      return { success: true, message: `URL matched "${urlPattern}" after ${Date.now()-start}ms` };
    }

    case 'analyze': {
      return { success: true, data: JSON.stringify(deepPageAnalysis(), null, 2), message: 'Page analyzed' };
    }

    case 'get_page_info': {
      return { success: true, title: document.title, url: window.location.href, text: document.body.innerText.slice(0,15000), interactiveElements: extractAllInteractive() };
    }

    case 'hover': {
      let el = null;
      if (action.selector) el = document.querySelector(action.selector);
      if (!el && action.text) {
        const sel = 'button,a,[role="button"],[role="link"],input,select,textarea,label';
        const q = action.text.toLowerCase().trim();
        for (const e of document.querySelectorAll(sel)) {
          if ((e.textContent||e.value||e.getAttribute('aria-label')||'').toLowerCase().trim() === q) { el = e; break; }
        }
      }
      if (!el) el = await findElementDeep(action);
      if (!el && action.x && action.y) el = document.elementFromPoint(action.x / (window.devicePixelRatio||1), action.y / (window.devicePixelRatio||1));
      if (!el) throw new Error(`Element not found for hover: ${action.selector||action.text||action.description}`);
      el.scrollIntoView({behavior:'smooth',block:'center'});
      await delay(Math.max(100, adaptiveWait));
      const rect = el.getBoundingClientRect();
      const cx = Math.round(rect.left + rect.width / 2);
      const cy = Math.round(rect.top + rect.height / 2);
      moveVioraCursor(cx, cy, false);
      el.dispatchEvent(new PointerEvent('pointerover', {bubbles:true,cancelable:true,clientX:cx,clientY:cy,pointerId:1,isPrimary:true}));
      el.dispatchEvent(new MouseEvent('mouseover', {bubbles:true,cancelable:true,clientX:cx,clientY:cy}));
      el.dispatchEvent(new PointerEvent('pointermove', {bubbles:true,cancelable:true,clientX:cx,clientY:cy,pointerId:1,isPrimary:true}));
      el.dispatchEvent(new MouseEvent('mousemove', {bubbles:true,cancelable:true,clientX:cx,clientY:cy}));
      await delay(Math.max(200, adaptiveWait * 2));
      removeVioraCursor();
      return { success: true, message: `Hovered: ${action.description||action.text||action.selector}` };
    }

    case 'press_key': {
      const key = action.key || '';
      const knownKeys = { 'Enter': 13, 'Tab': 9, 'Escape': 27, 'Space': 32, 'Backspace': 8, 'Delete': 46,
        'ArrowUp': 38, 'ArrowDown': 40, 'ArrowLeft': 37, 'ArrowRight': 39,
        'Home': 36, 'End': 35, 'PageUp': 33, 'PageDown': 34,
        'F1': 112, 'F2': 113, 'F3': 114, 'F4': 115, 'F5': 116, 'F6': 117,
        'F7': 118, 'F8': 119, 'F9': 120, 'F10': 121, 'F11': 122, 'F12': 123 };
      const code = action.code || key;
      const keyCode = action.keyCode || knownKeys[key] || (key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0);
      const ctrl = !!action.ctrl;
      const shift = !!action.shift;
      const alt = !!action.alt;
      const meta = !!action.meta;
      const opts = { key, code, keyCode, which: keyCode, bubbles: true, cancelable: true, ctrlKey: ctrl, shiftKey: shift, altKey: alt, metaKey: meta, composed: true };
      // Target: if a selector is given, resolve it; otherwise use activeElement or document
      let target = null;
      if (action.selector) target = document.querySelector(action.selector);
      if (!target) target = document.activeElement;
      const el = target || document.body || document;
      // Dispatch events in the natural order a real keyboard produces
      el.dispatchEvent(new KeyboardEvent('keydown', opts));
      await delay(Math.max(15, adaptiveWait / 4) + Math.random() * 35);
      // keypress only fires for printable keys or Enter (some frameworks listen for it)
      if (key.length === 1 || key === 'Enter' || key === 'Escape' || key === 'Space') {
        el.dispatchEvent(new KeyboardEvent('keypress', opts));
      }
      await delay(Math.max(10, adaptiveWait / 5) + Math.random() * 25);
      // For Enter specifically, also dispatch a click-like input event on the active
      // element (some chat UIs, search boxes, and custom inputs intercept input event
      // rather than keydown/keypress for Enter-submit behavior)
      if (el && (key === 'Enter' || key === 'Space') && !ctrl && !alt && !meta) {
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
      el.dispatchEvent(new KeyboardEvent('keyup', opts));
      await delay(Math.max(15, adaptiveWait / 4));
      return { success: true, message: `Pressed key: ${key}${ctrl?'+Ctrl':''}${shift?'+Shift':''}${alt?'+Alt':''}` };
    }

    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }
}

async function findElementDeep(action) {
  let el = findElement(action);
  if (el) return el;
  await delay(200);
  el = findElement(action);
  if (el) return el;
  
  // Enhanced multi-modal element finding
  if (action.text) {
    await delay(300);
    const q = action.text.toLowerCase().trim();
    const roots = [document.documentElement, ...allShadowRoots()];
    
    // Try accessibility context next (more semantic than raw text)
    const accessibilityMatch = findByAccessibilityContext(action.text, roots);
    if (accessibilityMatch) return accessibilityMatch;
    
    // Try visual context for icon-only buttons, custom elements
    const visualMatch = findByVisualContext(action.text, roots);
    if (visualMatch) return visualMatch;
    
    // Fallback to legacy text matching
    for (const root of roots) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
      while (walker.nextNode()) {
        const t = walker.currentNode.textContent.trim().toLowerCase();
        if (t === q || (t && t.includes(q))) return walker.currentNode.parentElement;
      }
    }
  }
  return null;
}

// Enhanced element finding using accessibility context and visual analysis
function findByAccessibilityContext(text, roots) {
  const q = text.toLowerCase().trim();
  
  for (const root of roots) {
    // Check ARIA labels and relationships
    const ariaLabels = root.querySelectorAll('[aria-label], [aria-labelledby]');
    for (const el of ariaLabels) {
      const ariaText = (el.getAttribute('aria-label') || '').toLowerCase().trim();
      const labelledBy = el.getAttribute('aria-labelledby');
      if (labelledBy) {
        const labelledElement = typeof root.getElementById === 'function' ? root.getElementById(labelledBy) : document.getElementById(labelledBy);
        if (labelledElement) {
          const fullText = (ariaText + ' ' + labelledElement.textContent).toLowerCase();
          if (fullText.includes(q) || q.includes(fullText.substring(0, 50))) {
            return el;
          }
        }
      }
      if (ariaText.includes(q) || q.includes(ariaText)) {
        return el;
      }
    }
    
    // Check form associations (label for relationships)
    const labels = root.querySelectorAll('label');
    for (const label of labels) {
      const labelText = label.textContent.toLowerCase().trim().replace(/[:*#]$/, '');
      if (labelText.includes(q) || q.includes(labelText)) {
        const htmlFor = label.getAttribute('for');
        if (htmlFor) {
          const inputElement = root.getElementById(htmlFor);
          if (inputElement) return inputElement;
        }
        const inputElement = label.querySelector('input, select, textarea, button');
        if (inputElement) return inputElement;
      }
    }
  }
  
  return null;
}

// Visual context matching for icon-only elements and custom UI patterns
function findByVisualContext(text, roots) {
  const q = text.toLowerCase().trim();
  
  for (const root of roots) {
    // Look for SVG icons with titles/descriptions
    const svgElements = root.querySelectorAll('svg');
    for (const svg of svgElements) {
      const svgTitle = svg.querySelector('title');
      const svgDesc = svg.querySelector('desc');
      const ariaLabel = svg.getAttribute('aria-label');
      
      const visualText = (
        (svgTitle?.textContent || '') + 
        (svgDesc?.textContent || '') + 
        (ariaLabel || '')
      ).toLowerCase().trim();      
      if (visualText.includes(q) || q.includes(visualText)) {
        // Find the actual button/label that wraps this SVG
        let parent = svg.parentElement;
        while (parent && parent !== root) {
          if (isInteractiveElement(parent)) {
            return parent;
          }
          parent = parent.parentElement;
        }
        return svg;
      }
    }
    
    // Look for custom elements with data attributes
    const dataElements = root.querySelectorAll('[data-testid], [data-cy], [data-qa]');
    for (const el of dataElements) {
      const dataText = ((el.getAttribute('data-testid') || '') + 
                       (el.getAttribute('data-cy') || '') + 
                       (el.getAttribute('data-qa') || '') +
                       el.textContent).toLowerCase();
      
      if (dataText.includes(q) || q.includes(dataText.substring(0, 30))) {
        return el;
      }
    }
    
    // Look for element positioning and visibility patterns
    const interactiveElements = root.querySelectorAll(
      'button, a, input, select, textarea, label, [role="button"], [role="link"], [role="tab"]'
    );
    
    for (const el of interactiveElements) {
      if (!isVisible(el) || el.offsetParent === null) continue;
      
      const elementText = (el.textContent || el.value || '').toLowerCase().trim();
      const elementAriaLabel = el.getAttribute('aria-label') || '';
      
      // Enhanced text matching with fuzzy logic
      if (elementText.includes(q) || q.includes(elementText) || 
          elementAriaLabel.includes(q) || q.includes(elementAriaLabel)) {
        
        // Verify this makes sense for the context
        if (isTextMatchReasonable(el, q, text)) {
          return el;
        }
      }
    }
  }
  
  return null;
}

// Helper functions for enhanced element finding

function isInteractiveElement(el) {
  const interactiveTags = ['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA', 'LABEL', 'BUTTON'];
  const interactiveRoles = ['BUTTON', 'LINK', 'TAB', 'MENUITEM', 'MENU', 'OPTION', 'CHECKBOX', 'RADIO', 'SWITCH'];
  
  const tagName = el.tagName;
  const role = el.getAttribute('role');
  const isInteractive = interactiveTags.includes(tagName) || 
                        interactiveRoles.includes(role) ||
                        el.onclick !== null ||
                        el.hasAttribute('onclick') ||
                        el.getAttribute('ng-click') ||
                        el.getAttribute('v-on:click') ||
                        el.classList.contains('btn') ||
                        el.classList.contains('button') ||
                        el.getAttribute('tabindex') === '0';
  
  return isInteractive && isVisible(el);
}

function isVisible(el) {
  if (!el || !el.isConnected) return false;
  
  let style;
  try { style = getComputedStyle(el); } catch (_) { return false; }
  
  if (style.display === 'none' || style.visibility === 'hidden' || 
      parseFloat(style.opacity || '1') === 0) return false;
  
  if (el.offsetParent === null && style.position !== 'fixed') return false;
  
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function isTextMatchReasonable(element, query, originalText) {
  // Filter out false positives for common interactive elements
  const elementText = (element.textContent || element.value || '').toLowerCase().trim();
  
  // Skip if element text is too generic (like "more", "next", "submit" without context)
  const genericWords = ['more', 'next', 'prev', 'previous', 'submit', 'cancel', 'ok', 'yes', 'no', 'edit', 'delete', 'save'];
  if (genericWords.includes(elementText) && !originalText.includes(elementText)) {
    return false;
  }
  
  // For buttons with icons, ensure the text makes sense with the icon
  if (element.querySelector('svg, img, .icon')) {
    // Icon buttons should have descriptive text
    const hasDescriptiveText = elementText.length > 2 && !genericWords.includes(elementText);
    if (!hasDescriptiveText) return false;
  }
  
  return true;
}

// ─── SHADOW DOM TRAVERSAL ─────────────────────────────────────────────────
// Many modern component libraries (Lit, Stencil, Shoelace, web components in
// general) keep their real inputs/buttons inside an open shadow root, where
// document.querySelector can't see them. These helpers walk into every open
// shadow root on the page so clicks/fills/text-search can still find them.
function allShadowRoots(root = document) {
  const roots = [];
  const walk = (node) => {
    const all = node.querySelectorAll('*');
    for (const el of all) {
      if (el.shadowRoot) { roots.push(el.shadowRoot); walk(el.shadowRoot); }
    }
  };
  walk(root);
  return roots;
}

function queryDeep(selector) {
  const all = [];
  try { all.push(...document.querySelectorAll(selector)); } catch (_) {}
  for (const root of allShadowRoots()) {
    try { all.push(...root.querySelectorAll(selector)); } catch (_) {}
  }
  return pickVisible(all);
}

function queryAllDeep(selector) {
  const out = [];
  try { out.push(...document.querySelectorAll(selector)); } catch (_) {}
  for (const root of allShadowRoots()) {
    try { out.push(...root.querySelectorAll(selector)); } catch (_) {}
  }
  return out;
}

function findByTextDeep(query) {
  const q = query.toLowerCase().trim();
  const sel = 'button,a,[role="button"],[role="link"],[role="option"],[role="tab"],[role="menuitem"],input[type="submit"],input[type="button"],label,select,summary';
  const candidateRoots = [document, ...allShadowRoots()];
  for (const exact of [true, false]) {
    const matches = [];
    for (const root of candidateRoots) {
      let els;
      try { els = root.querySelectorAll(sel); } catch (_) { continue; }
      for (const el of els) {
        const t = (el.textContent||el.value||el.getAttribute('aria-label')||el.getAttribute('title')||'').toLowerCase().trim();
        if (exact ? t === q : t.includes(q)) matches.push(el);
      }
    }
    if (matches.length) { const picked = pickVisible(matches); if (picked) return picked; }
  }
  return null;
}


function isContentEditable(el) {
  return !!el && (el.isContentEditable || el.getAttribute?.('contenteditable') === 'true' || el.getAttribute?.('contenteditable') === '');
}

// Some sites (Gmail included) leave a stale, hidden duplicate of a toolbar or
// button in the DOM when the page's viewport gets resized programmatically —
// which is exactly what happens when the side panel opens/closes and narrows
// the actual web page. document.querySelector always returns the FIRST match
// in DOM order, with no regard for whether it's the visible, live one — so a
// selector like [aria-label="Delete"] can silently resolve to a leftover
// hidden copy from the old layout. The click then "succeeds" (no error, no
// exception) but does nothing, because it landed on a detached-looking
// element nobody can actually see. These helpers make every multi-candidate
// lookup prefer a genuinely visible match over just the first one found.

// Detects and auto-dismisses transient overlays (modals, popups, cookie banners, interstitials)
// that are blocking interaction with the target element. Returns count dismissed.
// CRITICAL: Must NEVER match the page's main content/chat interface.
// Guard: skip any element that occupies >80% of viewport (it's the main UI, not an overlay).
// Also skip [role="dialog"] and [class*="dialog"] since those match too many main UIs.
function dismissBlockingOverlays() {
  let dismissed = 0;
  const candidates = document.querySelectorAll(
    '[class*="modal"]:not([class*="main"]):not([class*="content"]):not([class*="chat"]), ' +
    '[class*="overlay"]:not([class*="main"]):not([class*="content"]), ' +
    '[class*="popup"]:not([class*="main"]):not([class*="content"]), ' +
    '[class*="cookie"], [class*="consent"], ' +
    '[class*="banner"]:not([class*="header"]):not([class*="nav"]), ' +
    '[role="alertdialog"], [aria-modal="true"]'
  );
  for (const el of candidates) {
    if (!isVisible(el)) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width > window.innerWidth * 0.8 && rect.height > window.innerHeight * 0.8) continue;
    const closeBtn = el.querySelector(
      'button[aria-label*="close" i]:not([aria-label*="main"]):not([aria-label*="chat"]), ' +
      'button[aria-label*="dismiss" i], .close, .btn-close, ' +
      '[class*="dismiss"], [class*="close-btn"]'
    );
    if (closeBtn && isVisible(closeBtn)) {
      closeBtn.click();
      dismissed++;
    } else {
      el.style.display = 'none';
      dismissed++;
    }
  }
  return dismissed;
}

function pickVisible(elements) {
  for (const el of elements) { if (isVisible(el)) return el; }
  return elements.length ? elements[0] : null; // fall back to first match if none are "visible" (e.g. about to be revealed)
}

function findElement(action) {
  // A bare generic tag like "button", "a", "div", "input", "span" is far too
  // broad on real pages (e.g. Google Docs home has many buttons). If the AI
  // supplied only a tag AND a text hint, skip the tag query entirely so the
  // text-based disambiguation below actually runs and finds the right element.
  const isBareTag = action.selector && /^([a-z][a-z0-9]*)$/i.test(action.selector.trim());
  if (action.selector && !(isBareTag && action.text)) {
    for (const fn of [
      () => pickVisible(Array.from(document.querySelectorAll(action.selector))),
      () => document.querySelector(action.selector),
      () => document.querySelector(action.selector.replace(/^[a-zA-Z]+(\[)/, '$1')),
      () => document.querySelector(action.selector.replace(/^[a-zA-Z]*#/, '#')),
      () => { const m = action.selector.match(/#([\w-]+)/); return m ? document.getElementById(m[1]) : null; },
      () => { const m = action.selector.match(/\[id=['"]?([^'"=\]]+)['"]?\]/); return m ? document.getElementById(m[1]) : null; },
      () => { const parts = action.selector.split(/[\[\.#:\s]/).filter(Boolean); const last = parts[parts.length-1]; return last ? (document.querySelector(`[class*="${cssEsc(last)}"]`) || document.getElementById(last) || document.querySelector(`[name*="${cssEsc(last)}"]`)) : null; },
      () => { try { return document.evaluate(action.selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue; } catch(_) { return null; }},
      () => queryDeep(action.selector)
    ]) {
      try { const r = fn(); if (r) return r; } catch(_) {}
    }
  }

  if (action.text) {
    const q = action.text.toLowerCase().trim();
    const sel = 'button,a,[role="button"],[role="link"],[role="option"],[role="tab"],[role="menuitem"],input[type="submit"],input[type="button"],label,select,summary';
    const els = Array.from(document.querySelectorAll(sel));
    for (const matchType of ['exact', 'includes', 'includedBy']) {
      const matches = els.filter(el => {
        const t = (el.textContent||el.value||el.getAttribute('aria-label')||el.getAttribute('title')||'').toLowerCase().trim();
        return matchType === 'exact' ? t === q : matchType === 'includes' ? t.includes(q) : (t && q.includes(t));
      });
      if (matches.length) { const picked = pickVisible(matches); if (picked) return picked; }
    }
    const deep = findByTextDeep(action.text);
    if (deep) return deep;

    // Adjacent label matching: find an element by the text of a sibling
    // label/span/div immediately before it. Common pattern:
    //   <label>Email:</label> <input>
    //   <span>Password</span> <input>
    const qAdj = action.text.toLowerCase().trim();
    const adjacentSel = 'input, select, textarea, button, [role="button"], [role="checkbox"], [role="radio"]';
    const allAdj = Array.from(document.querySelectorAll(adjacentSel)).filter(isVisible);
    for (const adj of allAdj) {
      const prev = adj.previousElementSibling;
      if (prev) {
        const prevText = (prev.textContent || prev.getAttribute('aria-label') || '').toLowerCase().trim().replace(/[:*#]$/, '');
        if (prevText && (prevText === qAdj || prevText.includes(qAdj) || qAdj.includes(prevText))) return adj;
      }
      // Also check the parent's first text child (some label/input pairs are wrapped in a div)
      const parent = adj.parentElement;
      if (parent) {
        for (const child of parent.childNodes) {
          if (child.nodeType === 3) { // text node
            const t = (child.textContent || '').toLowerCase().trim().replace(/[:*#]$/, '');
            if (t && (t === qAdj || t.includes(qAdj) || qAdj.includes(t)) && child.nextSibling === adj) return adj;
          }
        }
      }
    }
  }

  // SVG title/desc matching: find icon-only buttons by their SVG <title> or <desc> content
  if (action.text || action.ariaLabel || action.description) {
    const searchText = (action.ariaLabel || action.text || action.description || '').toLowerCase().trim();
    if (searchText) {
      const svgContainers = document.querySelectorAll('button, a, [role="button"], [tabindex="0"]');
      for (const container of svgContainers) {
        const svgTitle = container.querySelector('svg title, svg desc');
        if (svgTitle) {
          const t = (svgTitle.textContent || '').toLowerCase().trim();
          if (t === searchText || t.includes(searchText) || searchText.includes(t)) return container;
        }
        // Also check aria-label on SVG children directly
        const svgChild = container.querySelector('svg[aria-label], svg[title]');
        if (svgChild) {
          const lbl = (svgChild.getAttribute('aria-label') || svgChild.getAttribute('title') || '').toLowerCase().trim();
          if (lbl && (lbl === searchText || lbl.includes(searchText) || searchText.includes(lbl))) return container;
        }
      }
    }
  }

  // aria-describedby matching: find elements by their accessible description text
  if (action.text || action.description) {
    const searchText = (action.text || action.description || '').toLowerCase().trim();
    if (searchText) {
      const allWithDesc = document.querySelectorAll('[aria-describedby]');
      for (const el of allWithDesc) {
        const descId = el.getAttribute('aria-describedby');
        if (!descId) continue;
        const descEl = document.getElementById(descId);
        if (descEl) {
          const t = (descEl.textContent || '').toLowerCase().trim();
          if (t && (t === searchText || t.includes(searchText) || searchText.includes(t))) return isVisible(el) ? el : null;
        }
      }
    }
  }

  for (const attr of ['placeholder','ariaLabel','name','id','title','dataTestid','dataCy','dataTest']) {
    const v = action[attr];
    if (v) {
      const a = attr === 'ariaLabel' ? 'aria-label' : attr === 'dataTestid' ? 'data-testid' : attr === 'dataCy' ? 'data-cy' : attr === 'dataTest' ? 'data-test' : attr;
      try {
        const matches = Array.from(document.querySelectorAll(`[${cssEsc(a)}="${cssEsc(v)}"],[${cssEsc(a)}*="${cssEsc(v)}" i]`));
        const picked = pickVisible(matches);
        if (picked) return picked;
      } catch(_) {}
    }
  }

  const hint = ((action.description||'')+' '+(action.selector||'')+' '+(action.text||'')).toLowerCase();
  if (/next|submit|continue|proceed|forward|done|finish|ok\b|save|confirm|agree|accept|send|log\s*in|sign/.test(hint)) {
    const ids = ['NextButton','next-button','nextButton','submitButton','submit-button','continueButton','btnNext','btn-next','nextBtn','submitBtn','nextPage','SaveButton','confirmButton','agreeButton','doneButton','finishButton','proceedButton','btnSubmit','loginButton','signInButton','registerButton'];
    for (const id of ids) { const el = document.getElementById(id); if (el) return el; }
    const kw = /^(next|continue|proceed|submit|done|finish|ok|save|confirm|agree|accept|send|login|sign\s*in|sign\s*up|register)$/i;
    const cs = document.querySelectorAll('button,input[type="submit"],input[type="button"],[role="button"],a');
    for (const el of cs) { const l = (el.textContent||el.value||el.getAttribute('aria-label')||el.getAttribute('title')||'').trim(); if (kw.test(l)) return el; }
    const kw2 = ['next','submit','continue','proceed','save','confirm','agree','accept','done','finish','send','login','sign in','register'];
    for (const el of cs) { const l = (el.textContent||el.value||'').toLowerCase(); for (const k of kw2) { if (l.includes(k)) return el; } }
  }

  if (action.selector) {
    const s = action.selector.toLowerCase();
    const cs = document.querySelectorAll('button,a,[role="button"],input[type="submit"],input[type="button"],summary,select,label');
    for (const el of cs) {
      const l = (el.textContent||el.value||el.getAttribute('aria-label')||el.getAttribute('title')||'').toLowerCase();
      if (l.includes(s) || s.includes(l)) return el;
    }
  }

  // Section-scoped search: if the description mentions a section heading
  // (e.g. "Edit in the Contact Info section"), find that heading first,
  // then search for the target element only within that section container.
  // Also supports an explicit "within" or "container" action field.
  const scopeHint = action.within || action.container ||
    (action.description ? (action.description.match(/in the ([^,.]+?)( section| area| panel| tab| page)?/i) || [])[1] : null);
  if (scopeHint) {
    const h = scopeHint.toLowerCase().trim();
    const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6, legend, caption, [class*="heading"], [class*="title"], [class*="header"], summary, [role="heading"]');
    for (const heading of headings) {
      const ht = (heading.textContent || '').toLowerCase().trim();
      if (ht.includes(h) || h.includes(ht)) {
        // Found the section heading — search within its parent container
        let container = heading.closest('section, fieldset, [role="group"], [role="region"], .card, .panel, .tab-panel, [class*="section"]') || heading.parentElement;
        // Try to find the target element within this container
        const textToFind = action.text || '';
        if (textToFind) {
          const scoped = container.querySelectorAll(
            'button, a, [role="button"], input, select, textarea, label, [role="checkbox"], [role="radio"], [role="tab"]'
          );
          for (const el of scoped) {
            const t = (el.textContent || el.value || el.getAttribute('aria-label') || el.getAttribute('title') || '').toLowerCase().trim();
            if (t && (t === textToFind.toLowerCase() || t.includes(textToFind.toLowerCase()))) {
              if (isVisible(el)) return el;
            }
          }
        }
        // If no text match, return the first visible interactive element in this section
        if (action.selector) {
          try {
            const firstMatch = container.querySelector(action.selector);
            if (firstMatch && isVisible(firstMatch)) return firstMatch;
          } catch(_) {}
        }
      }
    }
  }

  // Tag-based fallback: the selector named a field tag (textarea/input/select)
  // but every attribute-based lookup above came up empty — typically because
  // the guessed attribute (e.g. `[name='']`) doesn't actually exist on the
  // real element at all (attribute-equals selectors only match elements that
  // HAVE the attribute set to that value, not elements missing it entirely).
  // Fall back to the single visible field of that tag on the page, skipping
  // hidden/disabled/readonly fields and reCAPTCHA's hidden textarea — the
  // common case of "there's one obvious answer field here."
  if (action.selector) {
    const tagMatch = action.selector.match(/^(textarea|select|input)\b/i);
    if (tagMatch) {
      const tag = tagMatch[1].toLowerCase();
      const candidates = Array.from(document.querySelectorAll(tag)).filter(el => {
        if (!isVisible(el)) return false;
        if (el.disabled || el.readOnly) return false;
        const name = (el.getAttribute('name') || '').toLowerCase();
        const id = (el.id || '').toLowerCase();
        if (name.includes('captcha') || id.includes('captcha')) return false;
        return true;
      });
      if (candidates.length === 1) return candidates[0];
      if (candidates.length > 1) {
        const centerY = window.innerHeight / 2;
        candidates.sort((a, b) => Math.abs(a.getBoundingClientRect().top - centerY) - Math.abs(b.getBoundingClientRect().top - centerY));
        return candidates[0];
      }
    }
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 12: UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function waitForElementVisible(selector, timeout = 10000) {
  return new Promise(resolve => {
    try {
      if (document.querySelector(selector)?.offsetParent !== null) { resolve(true); return; }
    } catch(_) {}
    const observer = new MutationObserver(() => {
      try { if (document.querySelector(selector)?.offsetParent !== null) { observer.disconnect(); resolve(true); } } catch(_) {}
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style','class'] });
    setTimeout(() => { observer.disconnect(); resolve(false); }, timeout);
  });
}

async function startScreenCapture(streamId) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: streamId,
          maxWidth: 1920,
          maxHeight: 1080,
          maxFrameRate: 30
        }
      }
    });
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    await video.play();
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    stream.getTracks().forEach(t => t.stop());
    return { success: true, screenshot: dataUrl };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

} // end window.__vioraLoaded guard
