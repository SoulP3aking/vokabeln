/* ═══════════════════════════════════════════════════════
   ui.js · Oberflächenhelfer, Bilder, Aussprache
   ═══════════════════════════════════════════════════════ */

const UI = (() => {

  /* ── DOM & Text ─────────────────────────────────────── */
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  const relTime = iso => {
    if (!iso) return 'noch nie';
    const d = new Date(iso);
    const days = Math.floor((Date.now() - d.getTime()) / 864e5);
    if (days <= 0) return 'heute';
    if (days === 1) return 'gestern';
    if (days < 7) return `vor ${days} Tagen`;
    return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' }).format(d);
  };

  const todayISO = () => {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };

  /* ── Symbole ────────────────────────────────────────── */
  const TICK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.6 4.4 4.4L19 7.4"/></svg>';
  const CROSS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  const NEAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>';
  const SPEAKER = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6.5 8.5H3.5v7h3L11 19V5Z"/><path d="M15 9.2a4 4 0 0 1 0 5.6M17.8 6.5a8 8 0 0 1 0 11" stroke-linecap="round"/></svg>';
  const CAMERA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l1.5-2h7L17 8h3v11H4V8Z"/><circle cx="12" cy="13" r="3.4"/></svg>';

  const BOOK_EMPTY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10a2 2 0 0 1 2 2v13a1.7 1.7 0 0 0-1.7-1.5H5.5A1.5 1.5 0 0 1 4 16V5.5Z"/><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H14a2 2 0 0 0-2 2v13a1.7 1.7 0 0 1 1.7-1.5h4.8A1.5 1.5 0 0 0 20 16V5.5Z"/></svg>';

  const empty = (title, text) =>
    `<div class="empty">${BOOK_EMPTY}<p><strong>${esc(title)}</strong>${esc(text)}</p></div>`;

  /* ── Hinweis-Einblendung ────────────────────────────── */
  let toastTimer = null;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    requestAnimationFrame(() => t.classList.add('is-open'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      t.classList.remove('is-open');
      setTimeout(() => { t.hidden = true; }, 260);
    }, 2400);
  }

  /* ── Bodensheet ─────────────────────────────────────── */
  /* Zähler, damit ein verzögertes Aufräumen kein neu geöffnetes Sheet leert */
  let sheetSeq = 0;

  function openSheet(title, html, afterRender) {
    sheetSeq++;
    const sheet = $('#sheet'), back = $('#sheetBackdrop');
    $('#sheetTitle').textContent = title;
    $('#sheetBody').innerHTML = html;
    sheet.hidden = false;
    back.hidden = false;
    requestAnimationFrame(() => {
      sheet.classList.add('is-open');
      back.classList.add('is-open');
    });
    document.body.style.overflow = 'hidden';
    if (afterRender) afterRender($('#sheetBody'));
  }

  function closeSheet() {
    const sheet = $('#sheet'), back = $('#sheetBackdrop');
    if (sheet.hidden) return;
    sheet.classList.remove('is-open');
    back.classList.remove('is-open');
    document.body.style.overflow = '';
    const seq = ++sheetSeq;
    setTimeout(() => {
      if (seq !== sheetSeq) return;      // inzwischen wurde ein neues Sheet geöffnet
      sheet.hidden = true;
      back.hidden = true;
      $('#sheetBody').innerHTML = '';
    }, 340);
  }

  const sheetIsOpen = () => !$('#sheet').hidden;

  /* ── Bilder ─────────────────────────────────────────── */
  const Img = {
    cache: new Map(),

    /** Bild aus dem Speicher holen (mit Zwischenspeicher). */
    async get(id) {
      if (!id) return null;
      if (this.cache.has(id)) return this.cache.get(id);
      const data = await ImgDB.get(id).catch(() => null);
      this.cache.set(id, data);
      return data;
    },

    /** Alle <img data-img="…"> im Bereich nachträglich befüllen. */
    hydrate(root = document) {
      $$('img[data-img]', root).forEach(async el => {
        const id = el.dataset.img;
        const data = await this.get(id);
        if (data) el.src = data;
        else el.remove();
      });
    },

    forget(id) { this.cache.delete(id); }
  };

  /** Datei einlesen, verkleinern und als JPEG-Datenstring liefern. */
  async function prepareImage(file, max = 900, quality = 0.72) {
    if (!file || !file.type.startsWith('image/')) throw new Error('Das ist kein Bild.');

    let src, w, h;
    if (window.createImageBitmap) {
      // beachtet die Drehung aus den Bilddaten (wichtig bei iPhone-Fotos)
      src = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null);
    }
    if (!src) {
      const url = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = () => rej(new Error('Datei konnte nicht gelesen werden.'));
        r.readAsDataURL(file);
      });
      src = await new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = () => rej(new Error('Bild konnte nicht geöffnet werden.'));
        i.src = url;
      });
    }
    w = src.width; h = src.height;

    const scale = Math.min(1, max / Math.max(w, h));
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(w * scale));
    cv.height = Math.max(1, Math.round(h * scale));
    cv.getContext('2d').drawImage(src, 0, 0, cv.width, cv.height);
    if (src.close) src.close();
    return cv.toDataURL('image/jpeg', quality);
  }

  const kb = n => (n / 1024 < 1024
    ? `${(n / 1024).toFixed(0)} KB`
    : `${(n / 1048576).toFixed(1)} MB`);

  /* ── Aussprache ─────────────────────────────────────── */
  const Speech = {
    get supported() { return 'speechSynthesis' in window; },
    voices: [],

    init() {
      if (!this.supported) return;
      const load = () => { this.voices = speechSynthesis.getVoices() || []; };
      load();
      speechSynthesis.addEventListener('voiceschanged', load);
    },

    /** Gibt es eine Stimme für dieses Sprachkürzel? */
    hasVoice(tag) {
      if (!this.supported || !tag) return false;
      if (!this.voices.length) return true;   // Liste noch nicht geladen – erlauben
      const base = tag.slice(0, 2).toLowerCase();
      return this.voices.some(v => v.lang.slice(0, 2).toLowerCase() === base);
    },

    speak(text, tag) {
      if (!this.supported || !text) return false;
      try {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        if (tag) {
          u.lang = tag;
          const base = tag.slice(0, 2).toLowerCase();
          const v = this.voices.find(x => x.lang.replace('_', '-') === tag)
                 || this.voices.find(x => x.lang.slice(0, 2).toLowerCase() === base);
          if (v) u.voice = v;
        }
        u.rate = 0.92;
        speechSynthesis.speak(u);
        return true;
      } catch (e) {
        console.warn('Vorlesen nicht möglich:', e);
        return false;
      }
    }
  };

  /* ── Sonderzeichen-Leiste ───────────────────────────── */
  /** Leiste für eine Sprache; leer, wenn die Sprache keine Extras hat. */
  function charbarHTML(code, targetId) {
    const chars = [...(Store.lang(code).chars || '')];
    if (!chars.length) return '';
    return `<div class="charbar" data-charbar="${esc(targetId)}">` +
      chars.map(c => `<button type="button" data-char="${esc(c)}">${esc(c)}</button>`).join('') +
      `</div>`;
  }

  /** Zeichen an der Cursorposition einfügen. */
  function insertChar(input, ch) {
    const s = input.selectionStart ?? input.value.length;
    const e = input.selectionEnd ?? s;
    input.value = input.value.slice(0, s) + ch + input.value.slice(e);
    const pos = s + ch.length;
    input.setSelectionRange(pos, pos);
    input.focus();
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  return {
    $, $$, esc, plural, relTime, todayISO,
    TICK, CROSS, NEAR, SPEAKER, CAMERA, empty,
    toast, openSheet, closeSheet, sheetIsOpen,
    Img, prepareImage, kb,
    Speech, charbarHTML, insertChar
  };
})();
