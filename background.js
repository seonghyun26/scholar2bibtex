/*
 * Scholar Top Result to BibTeX - service worker.
 *
 * Owns the whole job lifecycle:
 *   popup / context menu / keyboard shortcut
 *     -> open a real Google Scholar tab
 *     -> content script drives the page (top result -> Cite -> BibTeX link)
 *     -> service worker fetches the .bib text (cross-origin, needs host permission)
 *     -> offscreen document writes it to the clipboard
 *
 * Job state lives in chrome.storage.session so the popup can render it and so it
 * survives the service worker being torn down mid-job.
 */

importScripts('title-utils.js');

const { normalizeTitle, looksLikeTitle } = self.ScholarTitle;

const SEARCH_URL = 'https://scholar.google.com/scholar?hl=en&as_sdt=0,5&q=';
const JOB_KEY = 'job';
const LAST_TITLE_KEY = 'lastTitle';
const JOB_TIMEOUT_MS = 60000;
const MENU_ID = 'scholar-bibtex-selection';

const STATUS = {
  SEARCHING: 'searching',
  CITING: 'citing',
  FETCHING: 'fetching',
  DONE: 'done',
  ERROR: 'error'
};

const MESSAGES = {
  CAPTCHA:
    'Google Scholar is asking for verification (CAPTCHA / unusual traffic). Solve it in the Scholar tab, then try again.',
  NO_RESULTS: 'Google Scholar returned no results for that title.',
  NO_CITE_LINK:
    'Could not find the "Cite" control on the top result. Scholar may have changed its markup.',
  NO_BIBTEX_LINK:
    'The Cite dialog opened but no BibTeX link was found. Scholar may have changed its markup.',
  CITE_TIMEOUT: 'The Cite dialog did not finish loading in time.',
  RESULTS_TIMEOUT: 'The Scholar results page did not finish loading in time.',
  TIMEOUT: 'Timed out. Check the Scholar tab - it may be showing a CAPTCHA.',
  TAB_CLOSED: 'The Scholar tab was closed before the BibTeX could be copied.',
  EMPTY_TITLE: 'Enter a paper title first.',
  BAD_BIBTEX: 'Scholar returned something that does not look like BibTeX.',
  CLIPBOARD: 'Fetched the BibTeX but could not write it to the clipboard.'
};

/* ------------------------------------------------------------------ state */

async function getJob() {
  const stored = await chrome.storage.session.get(JOB_KEY);
  return stored[JOB_KEY] || null;
}

async function saveJob(job) {
  await chrome.storage.session.set({ [JOB_KEY]: job });
}

async function patchJob(id, patch) {
  const job = await getJob();
  if (!job || job.id !== id) return null;
  const next = { ...job, ...patch, updatedAt: Date.now() };
  await saveJob(next);
  return next;
}

function isActive(job) {
  return (
    job && job.status !== STATUS.DONE && job.status !== STATUS.ERROR
  );
}

/* ------------------------------------------------------------------ badge */

async function setBadge(kind) {
  const map = {
    busy: { text: '...', color: '#1a73e8' },
    ok: { text: '✓', color: '#188038' },
    err: { text: '!', color: '#d93025' },
    none: { text: '', color: '#1a73e8' }
  };
  const cfg = map[kind] || map.none;
  try {
    await chrome.action.setBadgeText({ text: cfg.text });
    await chrome.action.setBadgeBackgroundColor({ color: cfg.color });
  } catch (_) {
    /* action may be unavailable during startup */
  }
}

/* -------------------------------------------------------------- clipboard */

let offscreenPromise = null;

async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  if (!offscreenPromise) {
    offscreenPromise = chrome.offscreen
      .createDocument({
        url: 'offscreen.html',
        reasons: [chrome.offscreen.Reason.CLIPBOARD],
        justification: 'Write the fetched BibTeX entry to the clipboard.'
      })
      .catch((err) => {
        // Another call may have created it in the meantime.
        if (!String(err).includes('Only a single offscreen')) throw err;
      })
      .finally(() => {
        offscreenPromise = null;
      });
  }
  await offscreenPromise;
}

async function writeClipboard(text) {
  await ensureOffscreen();
  const response = await chrome.runtime.sendMessage({
    target: 'offscreen',
    type: 'COPY',
    text
  });
  if (!response || !response.ok) {
    throw new Error((response && response.error) || 'clipboard write failed');
  }
}

/* ------------------------------------------------------------------- jobs */

async function failJob(id, message, options = {}) {
  const job = await patchJob(id, {
    status: STATUS.ERROR,
    message,
    finishedAt: Date.now()
  });
  if (!job) return;
  await setBadge('err');
  if (options.focusTab && job.tabId != null) {
    try {
      await chrome.tabs.update(job.tabId, { active: true });
      const tab = await chrome.tabs.get(job.tabId);
      await chrome.windows.update(tab.windowId, { focused: true });
    } catch (_) {
      /* tab already gone */
    }
  }
}

async function finishJob(id, bibtex) {
  const job = await patchJob(id, {
    status: STATUS.DONE,
    message: 'BibTeX copied to the clipboard.',
    bibtexPreview: bibtex.slice(0, 400),
    finishedAt: Date.now()
  });
  if (!job) return;
  await setBadge('ok');
  if (job.tabId != null && job.closeTabWhenDone !== false) {
    try {
      await chrome.tabs.remove(job.tabId);
    } catch (_) {
      /* already closed */
    }
  }
}

async function startJob(rawTitle, options = {}) {
  const title = normalizeTitle(rawTitle);
  if (!title) {
    const id = `job-${Date.now()}`;
    await saveJob({
      id,
      title: '',
      status: STATUS.ERROR,
      message: MESSAGES.EMPTY_TITLE,
      tabId: null,
      startedAt: Date.now()
    });
    await setBadge('err');
    return { ok: false, error: MESSAGES.EMPTY_TITLE };
  }

  const previous = await getJob();
  if (isActive(previous) && Date.now() - previous.startedAt < JOB_TIMEOUT_MS) {
    return { ok: false, error: 'A lookup is already running. Wait for it to finish.' };
  }

  const id = `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const job = {
    id,
    title,
    status: STATUS.SEARCHING,
    message: 'Opening Google Scholar…',
    tabId: null,
    source: options.source || 'popup',
    startedAt: Date.now(),
    updatedAt: Date.now()
  };
  await saveJob(job);
  await chrome.storage.session.set({ [LAST_TITLE_KEY]: title });
  await setBadge('busy');

  let tab;
  try {
    tab = await chrome.tabs.create({
      url: SEARCH_URL + encodeURIComponent(title),
      active: false
    });
  } catch (err) {
    await failJob(id, `Could not open a Scholar tab: ${err.message}`);
    return { ok: false, error: err.message };
  }

  await patchJob(id, { tabId: tab.id, message: 'Loading search results…' });

  setTimeout(async () => {
    const current = await getJob();
    if (current && current.id === id && isActive(current)) {
      await failJob(id, MESSAGES.TIMEOUT, { focusTab: true });
    }
  }, JOB_TIMEOUT_MS);

  return { ok: true, id };
}

/* --------------------------------------------------------------- messages */

async function fetchBibtex(url) {
  const res = await fetch(url, { credentials: 'include', redirect: 'follow' });
  if (!res.ok) throw new Error(`Scholar returned HTTP ${res.status}`);
  const text = (await res.text()).trim();
  if (!text.startsWith('@')) throw new Error(MESSAGES.BAD_BIBTEX);
  return text;
}

async function handleMessage(message, sender) {
  if (!message || typeof message !== 'object') return undefined;

  switch (message.type) {
    /* --- from the popup ------------------------------------------------ */
    case 'START_JOB':
      return startJob(message.title, { source: 'popup' });

    case 'GET_STATE': {
      const stored = await chrome.storage.session.get([JOB_KEY, LAST_TITLE_KEY]);
      return {
        job: stored[JOB_KEY] || null,
        lastTitle: stored[LAST_TITLE_KEY] || ''
      };
    }

    case 'CLEAR_BADGE':
      await setBadge('none');
      return { ok: true };

    /* --- from the Scholar content script -------------------------------- */
    case 'SCHOLAR_READY': {
      const job = await getJob();
      const mine =
        isActive(job) && sender.tab && sender.tab.id === job.tabId;
      return mine ? { active: true, job: { id: job.id, title: job.title } } : { active: false };
    }

    case 'PROGRESS':
      await patchJob(message.id, {
        status: message.status || STATUS.CITING,
        message: message.message || ''
      });
      return { ok: true };

    case 'BIBTEX_URL': {
      await patchJob(message.id, {
        status: STATUS.FETCHING,
        message: 'Downloading the BibTeX entry…'
      });
      try {
        const bibtex = await fetchBibtex(message.url);
        try {
          await writeClipboard(bibtex);
        } catch (err) {
          console.error('clipboard', err);
          await failJob(message.id, MESSAGES.CLIPBOARD);
          return { ok: false };
        }
        await finishJob(message.id, bibtex);
        return { ok: true };
      } catch (err) {
        await failJob(message.id, err.message || 'Could not download the BibTeX entry.', {
          focusTab: true
        });
        return { ok: false };
      }
    }

    case 'FAILED': {
      const text = MESSAGES[message.code] || message.message || 'Lookup failed.';
      await failJob(message.id, text, { focusTab: message.code === 'CAPTCHA' });
      return { ok: true };
    }

    default:
      return undefined;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Messages addressed to the offscreen document are not ours to answer.
  if (message && message.target === 'offscreen') return false;
  handleMessage(message, sender).then(sendResponse, (err) => {
    console.error('background message error', err);
    sendResponse({ ok: false, error: String(err && err.message) });
  });
  return true;
});

/* ------------------------------------------------- context menu + command */

function installContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: 'Copy Scholar BibTeX for "%s"',
      contexts: ['selection']
    });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  installContextMenu();
  setBadge('none');
});

chrome.runtime.onStartup.addListener(() => {
  installContextMenu();
  setBadge('none');
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId !== MENU_ID) return;
  startJob(info.selectionText, { source: 'contextMenu' });
});

async function readSelection() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || tab.id == null || !/^https?:/.test(tab.url || '')) return '';
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => (window.getSelection() ? window.getSelection().toString() : '')
    });
    return (result && result.result) || '';
  } catch (_) {
    // Restricted page, or activeTab was not granted for this invocation.
    return '';
  }
}

/*
 * Shortcut resolution order, per priority:
 *   1. text selected on the current page
 *   2. the popup, for manual entry
 *
 * The clipboard is deliberately not consulted. Reading it silently turns
 * whatever the user last copied - often unrelated - into a Scholar request they
 * did not ask for, and from an offscreen document the read is unreliable
 * anyway. If there is no selection, ask.
 */
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'copy-bibtex') return;

  const selection = await readSelection();
  if (looksLikeTitle(selection)) {
    await startJob(selection, { source: 'selection' });
    return;
  }

  try {
    await chrome.action.openPopup();
  } catch (_) {
    // openPopup needs a recent user gesture and is not available everywhere;
    // the badge is the fallback hint to click the icon.
    await setBadge('err');
  }
});

/* ----------------------------------------------------------- tab lifecycle */

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const job = await getJob();
  if (isActive(job) && job.tabId === tabId) {
    await failJob(job.id, MESSAGES.TAB_CLOSED);
  }
});
