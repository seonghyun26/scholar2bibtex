const titleEl = document.getElementById('title');
const runEl = document.getElementById('run');
const statusEl = document.getElementById('status');
const shortcutEl = document.getElementById('shortcut');
const shortcutsLink = document.getElementById('shortcuts-link');
const closeTabEl = document.getElementById('close-tab');
const sourceEl = document.getElementById('source');

const BUSY_STATUSES = new Set(['searching', 'citing', 'fetching']);

function render(job) {
  if (!job) {
    setStatus('idle', 'Enter a title and press the button.');
    runEl.disabled = false;
    return;
  }

  if (job.status === 'done') {
    setStatus(
      'ok',
      job.tabKeptOpen
        ? '✓ BibTeX copied. The Scholar tab was left open.'
        : '✓ BibTeX copied to the clipboard.'
    );
    runEl.disabled = false;
  } else if (job.status === 'error') {
    setStatus('err', `! ${job.message || 'Lookup failed.'}`);
    runEl.disabled = false;
  } else if (BUSY_STATUSES.has(job.status)) {
    setStatus('busy', job.message || 'Working…');
    runEl.disabled = true;
  } else {
    setStatus('idle', job.message || '');
    runEl.disabled = false;
  }
}

function setStatus(kind, text) {
  statusEl.className = `status status--${kind}`;
  statusEl.textContent = text;
}

async function start() {
  const title = titleEl.value.trim();
  if (!title) {
    setStatus('err', '! Enter a paper title first.');
    titleEl.focus();
    return;
  }
  runEl.disabled = true;
  setStatus('busy', 'Opening Google Scholar…');
  const response = await chrome.runtime.sendMessage({ type: 'START_JOB', title });
  if (response && response.ok === false) {
    setStatus('err', `! ${response.error}`);
    runEl.disabled = false;
  }
}

runEl.addEventListener('click', start);

titleEl.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    start();
  }
});

closeTabEl.addEventListener('change', () => {
  chrome.runtime.sendMessage({
    type: 'SET_SETTINGS',
    settings: { closeTabWhenDone: closeTabEl.checked }
  });
});

shortcutsLink.addEventListener('click', (event) => {
  event.preventDefault();
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});

chrome.storage.session.onChanged.addListener((changes) => {
  if (changes.job) render(changes.job.newValue);
});

(async () => {
  if (navigator.userAgent.includes('Mac')) {
    shortcutEl.textContent = 'Control+Command+B';
  }
  try {
    const commands = await chrome.commands.getAll();
    const cmd = commands.find((c) => c.name === 'copy-bibtex');
    if (cmd && cmd.shortcut) shortcutEl.textContent = cmd.shortcut;
  } catch (_) {
    /* keep the default label */
  }

  const state = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
  if (state && state.settings) {
    closeTabEl.checked = state.settings.closeTabWhenDone !== false;
  }

  // Prefilling from the last search is a convenience, never an auto-search:
  // the text is selected so typing over it replaces it.
  if (state && state.lastTitle) {
    titleEl.value = state.lastTitle;
    sourceEl.textContent = 'last search';
    sourceEl.hidden = false;
  }

  render(state && state.job);
  titleEl.focus();
  titleEl.select();

  // The popup is open, so the badge has served its purpose.
  chrome.runtime.sendMessage({ type: 'CLEAR_BADGE' });
})();
