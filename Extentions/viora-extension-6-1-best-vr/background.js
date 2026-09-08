// ═══════════════════════════════════════════════════════════════════════════
// SECTION 1: INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ tabId: tab.id });
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 2: UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Sleep utility
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry helper with exponential backoff
 */
async function withRetry(fn, maxRetries = 3, baseDelay = 500) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i === maxRetries - 1) throw e;
      await delay(baseDelay * Math.pow(2, i) + Math.random() * 200);
    }
  }
}

/**
 * Check if URL is restricted
 */
function isRestrictedPage(url) {
  if (!url) return true;
  return url.startsWith('chrome://') || url.startsWith('chrome-extension://') ||
    url.startsWith('about:') || url.startsWith('edge://') ||
    url.startsWith('devtools://') || url === '';
}

/**
 * Resolve tab - prefer explicit tabId, fall back to active tab
 */
async function resolveTab(preferredTabId) {
  if (preferredTabId) {
    try { const tab = await chrome.tabs.get(preferredTabId); if (tab) return tab; } catch (_) {}
  }
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

/**
 * Wait for tab to finish loading
 */
function waitForTabLoad(tabId, timeout = 12000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve(false);
    }, timeout);
    function listener(id, info) {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        setTimeout(() => resolve(true), 600);
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

/**
 * Ensure content script is injected
 */
async function ensureContentScript(tabId) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    await delay(250);
  } catch (_) {}
}

/**
 * Safe send message to content script with auto-reinject
 */
async function sendToTab(tabId, message) {
  return withRetry(async () => {
    try {
      await ensureContentScript(tabId);
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (e) {
      if (e.message?.includes('Receiving end does not exist')) {
        await ensureContentScript(tabId);
        return await chrome.tabs.sendMessage(tabId, message);
      }
      throw e;
    }
  });
}

/**
 * Capture visible tab screenshot
 */
async function captureScreenshot(tabId) {
  const tab = await resolveTab(tabId);
  if (!tab) return { error: 'No tab' };
  return new Promise((resolve) => {
    chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 80 }, (dataUrl) => {
      if (chrome.runtime.lastError) resolve({ error: chrome.runtime.lastError.message });
      else resolve({ screenshot: dataUrl });
    });
  });
}

/**
 * Capture full screen (entire desktop) using desktopCapture API
 */
async function captureScreen(tabId) {
  const tab = await resolveTab(tabId);
  if (!tab) return { error: 'No tab' };

  return new Promise((resolve) => {
    chrome.desktopCapture.chooseDesktopMedia(['screen', 'window', 'tab'], tab, (streamId) => {
      if (chrome.runtime.lastError || !streamId) {
        resolve({ error: chrome.runtime.lastError?.message || 'User denied screen capture' });
        return;
      }
      // Send streamId to content script to capture via getDisplayMedia
      chrome.tabs.sendMessage(tab.id, { type: 'START_SCREEN_CAPTURE', streamId }, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ error: chrome.runtime.lastError.message });
        } else {
          resolve(response);
        }
      });
    });
  });
}

/**
 * Navigate tab to URL
 */
async function navigateTab(tabId, url) {
  const tab = await resolveTab(tabId);
  if (!tab) return { error: 'No tab' };
  await chrome.tabs.update(tab.id, { url });
  const loaded = await waitForTabLoad(tab.id);
  return { success: true, loaded };
}

/**
 * Open new tab
 */
async function openTab(url) {
  return new Promise((resolve) => {
    chrome.tabs.create({ url, active: true }, (tab) => {
      waitForTabLoad(tab.id).then(() => resolve({ success: true, tabId: tab.id }));
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 3: MESSAGE HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.type === 'LIST_TABS') {
    chrome.tabs.query({}, (tabs) => {
      sendResponse({ tabs: tabs.map(t => ({ id: t.id, title: t.title, url: t.url, favIconUrl: t.favIconUrl })) });
    });
    return true;
  }

  if (message.type === 'CAPTURE_SCREENSHOT') {
    captureScreenshot(message.tabId).then(sendResponse);
    return true;
  }

  if (message.type === 'CAPTURE_SCREEN') {
    captureScreen(message.tabId).then(sendResponse);
    return true;
  }

  if (message.type === 'NAVIGATE') {
    navigateTab(message.tabId, message.url).then(sendResponse);
    return true;
  }

  if (message.type === 'OPEN_TAB') {
    openTab(message.url).then(sendResponse);
    return true;
  }

  if (message.type === 'GET_TAB_INFO') {
    resolveTab(message.tabId).then(tab => {
      if (tab) sendResponse({ url: tab.url, title: tab.title, tabId: tab.id });
      else sendResponse({ error: 'No tab' });
    });
    return true;
  }

  if (message.type === 'DOM_ACTION') {
    resolveTab(message.tabId).then(async tab => {
      if (!tab) { sendResponse({ error: 'No tab' }); return; }
      const tabId = tab.id;
      const tabUrl = tab.url || '';

      if (isRestrictedPage(tabUrl)) {
        sendResponse({
          success: false,
          error: `Cannot automate this page (${tabUrl.split('/')[0]}// pages are restricted). Navigate to a regular website first.`
        });
        return;
      }

      try {
        const result = await sendToTab(tabId, { type: 'DOM_ACTION', action: message.action });
        sendResponse(result);
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    });
    return true;
  }

  if (message.type === 'GET_PAGE_CONTENT') {
    resolveTab(message.tabId).then(async tab => {
      if (!tab) { sendResponse({ error: 'No tab' }); return; }
      try {
        const result = await sendToTab(tab.id, { type: 'GET_PAGE_CONTENT' });
        sendResponse(result);
      } catch (e) { sendResponse({ error: e.message }); }
    });
    return true;
  }

  if (message.type === 'GET_ENHANCED_CONTENT') {
    resolveTab(message.tabId).then(async tab => {
      if (!tab) { sendResponse({ error: 'No tab' }); return; }
      if (isRestrictedPage(tab.url)) {
        sendResponse({ error: `Cannot get page content from restricted page (${tab.url}). Navigate to a regular website first.` });
        return;
      }
      try {
        const result = await sendToTab(tab.id, { type: 'GET_ENHANCED_CONTENT' });
        sendResponse(result);
      } catch (e) { sendResponse({ error: e.message }); }
    });
    return true;
  }

  if (message.type === 'GET_VIEWPORT_STATE') {
    resolveTab(message.tabId).then(async tab => {
      if (!tab) { sendResponse({ error: 'No tab' }); return; }
      try {
        const result = await sendToTab(tab.id, { type: 'GET_VIEWPORT_STATE' });
        sendResponse(result);
      } catch (e) { sendResponse({ error: e.message }); }
    });
    return true;
  }

  if (message.type === 'ANALYZE_PAGE') {
    resolveTab(message.tabId).then(async tab => {
      if (!tab) { sendResponse({ error: 'No tab' }); return; }
      try {
        const result = await sendToTab(tab.id, { type: 'ANALYZE_PAGE' });
        sendResponse(result);
      } catch (e) { sendResponse({ error: e.message }); }
    });
    return true;
  }

  if (message.type === 'SMART_CLICK') {
    resolveTab(message.tabId).then(async tab => {
      if (!tab) { sendResponse({ error: 'No tab' }); return; }
      if (isRestrictedPage(tab.url)) {
        sendResponse({
          success: false,
          error: `Cannot automate this page (${tab.url.split('/')[0]}// pages are restricted). Navigate to a regular website first.`
        });
        return;
      }
      try {
        const result = await sendToTab(tab.id, { type: 'SMART_CLICK', target: message.target });
        sendResponse(result);
      } catch (e) { sendResponse({ success: false, error: e.message }); }
    });
    return true;
  }

  if (message.type === 'PING') {
    resolveTab(message.tabId).then(async tab => {
      if (!tab) { sendResponse({ alive: false }); return; }
      try {
        const result = await sendToTab(tab.id, { type: 'PING' });
        sendResponse(result);
      } catch (e) { sendResponse({ alive: false }); }
    });
    return true;
  }

  if (message.type === 'GET_ELEMENT_CONTEXT') {
    resolveTab(message.tabId).then(async tab => {
      if (!tab) { sendResponse({ error: 'No tab' }); return; }
      try {
        const result = await sendToTab(tab.id, { type: 'GET_ELEMENT_CONTEXT', selector: message.selector, text: message.text });
        sendResponse(result);
      } catch (e) { sendResponse({ error: e.message }); }
    });
    return true;
  }

  if (message.type === 'SECURITY_CONFIRM') {
    resolveTab(message.tabId).then(async tab => {
      if (!tab) { sendResponse({ error: 'No tab' }); return; }
      try {
        const result = await sendToTab(tab.id, { type: 'SECURITY_CONFIRM', allowed: message.allowed });
        sendResponse(result);
      } catch (e) { sendResponse({ error: e.message }); }
    });
    return true;
  }
});