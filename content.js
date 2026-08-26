/*
 * Scholar Top Result to BibTeX - content script.
 *
 * Runs on every scholar.google.com page but does nothing unless the service
 * worker says this tab belongs to an active lookup job. When it does, it drives
 * the page the way a person would: read the top result, click "Cite", wait for
 * the dialog, hand the BibTeX link back to the service worker.
 */

(() => {
  'use strict';

  const RESULT_SELECTOR = '#gs_res_ccl_mid .gs_r.gs_or.gs_scl, #gs_res_ccl_mid .gs_r.gs_scl';
  const CITE_SELECTOR = 'a.gs_or_cit';
  const CITE_DIALOG = '#gs_cit, #gs_citd';

  const RESULTS_TIMEOUT_MS = 15000;
  const CITE_TIMEOUT_MS = 15000;
  const POLL_MS = 150;

  let jobId = null;

  /* ---------------------------------------------------------------- utils */

  /**
   * Resolve with the first truthy value the predicate returns, or null on
   * timeout. Uses a MutationObserver as the primary trigger: the Scholar tab is
   * opened in the background, and Chrome throttles timers in hidden tabs, but
   * DOM mutation callbacks still fire promptly.
   */
  function waitFor(predicate, timeoutMs) {
    const check = () => {
      try {
        return predicate();
      } catch (_) {
        return null;
      }
    };

    const immediate = check();
    if (immediate) return Promise.resolve(immediate);

    return new Promise((resolve) => {
      let done = false;
      let observer = null;
      let interval = null;
      let deadline = null;

      const finish = (value) => {
        if (done) return;
        done = true;
        if (observer) observer.disconnect();
        if (interval) clearInterval(interval);
        if (deadline) clearTimeout(deadline);
        resolve(value);
      };

      const tick = () => {
        const value = check();
        if (value) finish(value);
      };

      observer = new MutationObserver(tick);
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true
      });
      interval = setInterval(tick, POLL_MS);
      deadline = setTimeout(() => finish(null), timeoutMs);
    });
  }

  function send(message) {
    try {
      return chrome.runtime.sendMessage(message);
    } catch (_) {
      return Promise.resolve(null);
    }
  }

  function progress(status, message) {
    return send({ type: 'PROGRESS', id: jobId, status, message });
  }

  function fail(code, message) {
    return send({ type: 'FAILED', id: jobId, code, message });
  }

  /* ------------------------------------------------------------ detection */

  function pageText() {
    const body = document.body;
    if (!body) return '';
    return body.innerText || body.textContent || '';
  }

  function looksLikeCaptcha() {
    if (/\/sorry\/|captcha/i.test(location.pathname + location.search)) return true;
    if (document.querySelector('form#captcha-form, #gs_captcha_f, #captcha, iframe[src*="recaptcha"]')) {
      return true;
    }
    return /unusual traffic|not a robot|비정상적인 트래픽|자동 검색어/i.test(pageText().slice(0, 3000));
  }

  function looksLikeNoResults() {
    const mid = document.querySelector('#gs_res_ccl_mid');
    if (mid && mid.querySelector(RESULT_SELECTOR)) return false;
    return /did not match any articles|no results|일치하는 학술자료가 없습니다|검색결과가 없습니다/i.test(
      pageText()
    );
  }

  function findTopResult() {
    return document.querySelector(RESULT_SELECTOR);
  }

  function findCiteControl(result) {
    const direct = result.querySelector(CITE_SELECTOR);
    if (direct) return direct;
    // Fallback: scan the result's action row for a Cite-looking control.
    const candidates = result.querySelectorAll('a[role="button"], a[href="#"], a.gs_nph');
    for (const el of candidates) {
      const label = `${el.getAttribute('aria-label') || ''} ${el.textContent || ''}`.trim();
      if (/^\s*(cite|인용|引用|citar|citer|zitieren)\s*$/i.test(label)) return el;
      if (/gs_ocit/.test(el.getAttribute('onclick') || '')) return el;
    }
    return null;
  }

  function isHidden(el) {
    try {
      const style = window.getComputedStyle(el);
      return style.display === 'none' || style.visibility === 'hidden';
    } catch (_) {
      return false;
    }
  }

  function findBibtexLink() {
    const scopes = document.querySelectorAll(CITE_DIALOG);
    for (const scope of scopes) {
      if (!scope || isHidden(scope)) continue;
      const links = scope.querySelectorAll('a[href]');
      for (const link of links) {
        const href = link.href || '';
        if (/scholar\.bib|[?&]output=citation/.test(href)) return link;
        if (/^\s*bibtex\s*$/i.test(link.textContent || '') && /^https?:/.test(href)) return link;
      }
    }
    return null;
  }

  function citeDialogPresent() {
    const dialog = document.querySelector('#gs_citd');
    if (!dialog || isHidden(dialog)) return false;
    return (dialog.textContent || '').trim().length > 0;
  }

  /* ------------------------------------------------------------------ run */

  async function run() {
    if (looksLikeCaptcha()) {
      await fail('CAPTCHA');
      return;
    }

    await progress('searching', 'Reading search results…');

    const result = await waitFor(() => {
      if (looksLikeCaptcha()) throw new Error('captcha');
      return findTopResult();
    }, RESULTS_TIMEOUT_MS);

    if (!result) {
      if (looksLikeCaptcha()) await fail('CAPTCHA');
      else if (looksLikeNoResults()) await fail('NO_RESULTS');
      else await fail('RESULTS_TIMEOUT');
      return;
    }

    const cite = findCiteControl(result);
    if (!cite) {
      await fail('NO_CITE_LINK');
      return;
    }

    await progress('citing', 'Opening the Cite dialog…');
    try {
      result.scrollIntoView({ block: 'center' });
    } catch (_) {
      /* not important */
    }
    cite.click();

    const link = await waitFor(findBibtexLink, CITE_TIMEOUT_MS);
    if (!link) {
      if (looksLikeCaptcha()) await fail('CAPTCHA');
      else if (citeDialogPresent()) await fail('NO_BIBTEX_LINK');
      else await fail('CITE_TIMEOUT');
      return;
    }

    await progress('fetching', 'Found the BibTeX link…');
    await send({ type: 'BIBTEX_URL', id: jobId, url: link.href });
  }

  /* ---------------------------------------------------------------- start */

  (async () => {
    let assignment = null;
    try {
      assignment = await chrome.runtime.sendMessage({ type: 'SCHOLAR_READY' });
    } catch (_) {
      return;
    }
    if (!assignment || !assignment.active || !assignment.job) return;

    jobId = assignment.job.id;
    try {
      await run();
    } catch (err) {
      await fail(null, `Unexpected error on the Scholar page: ${err && err.message}`);
    }
  })();
})();
