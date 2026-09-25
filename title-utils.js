/*
 * Helpers for deciding whether some arbitrary text - whatever the user happened
 * to have selected on the page - is plausibly a paper title.
 *
 * Loaded by the service worker via importScripts. Kept in its own file because
 * this is the one piece of judgement the extension makes on the user's behalf,
 * and it should be readable and testable on its own.
 */

(function (root) {
  'use strict';

  // 3 rather than 6: a single acronym - GPT, ViT, BERT - is a real thing to
  // drag, and the length floor was the only reason those were turned away.
  const MIN_LENGTH = 3;
  const MAX_LENGTH = 300;
  const MAX_LINES = 6;

  function normalizeTitle(raw) {
    return String(raw == null ? '' : raw)
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Deliberately conservative: a false positive silently opens a Scholar tab
   * and burns a request, so anything that does not look like a title is
   * rejected and the user is asked instead.
   */
  function looksLikeTitle(raw) {
    const source = String(raw == null ? '' : raw);
    const text = normalizeTitle(source);

    if (text.length < MIN_LENGTH || text.length > MAX_LENGTH) return false;

    // A BibTeX entry - very likely our own output, selected by accident.
    // Searching Scholar for "@inproceedings{...}" helps nobody.
    if (text.startsWith('@')) return false;
    if (/^\s*(BEGIN|%)/.test(text)) return false;

    // URLs, file paths, bare domains.
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return false;
    if (/^(\/|~\/|[a-z]:\\)/i.test(text)) return false;
    if (/^\S+\.(com|org|net|edu|gov|io|co\.kr|kr)(\/|$)/i.test(text)) return false;

    // Code-ish or structured payloads.
    if (/^[[{<]/.test(text)) return false;

    // Must contain letters (Latin or Hangul). A single token is accepted: model
    // and dataset names are routinely what gets dragged, and rejecting them only
    // pushed the shortcut into the popup, which is worse than one wasted search.
    if (!/[A-Za-zÀ-ɏ가-힣]/.test(text)) return false;

    // A whole paragraph pasted by accident is not a title.
    const lines = source.split(/\r?\n/).filter((line) => line.trim()).length;
    if (lines > MAX_LINES) return false;

    return true;
  }

  root.ScholarTitle = { normalizeTitle, looksLikeTitle, MIN_LENGTH, MAX_LENGTH };
})(typeof self !== 'undefined' ? self : globalThis);
