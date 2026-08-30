/* ═══════════════════════════════════════════════════════
   store.js · Datenhaltung
   Texte in localStorage, Bilder in IndexedDB (die würden
   localStorage sofort sprengen). Nichts verlässt das Gerät.
   ═══════════════════════════════════════════════════════ */

/* ── Bilderspeicher ───────────────────────────────────── */
const ImgDB = (() => {
  const DB = 'vokabeln-images';
  const SHOP = 'images';
  let dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(SHOP)) {
          req.result.createObjectStore(SHOP, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    return dbp;
  }

  function tx(mode, fn) {
    return open().then(db => new Promise((res, rej) => {
      const t = db.transaction(SHOP, mode);
      const req = fn(t.objectStore(SHOP));
      t.oncomplete = () => res(req && req.result);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    }));
  }

  return {
    put: (id, data) => tx('readwrite', s => s.put({ id, data })),
    get: id => tx('readonly', s => s.get(id)).then(r => (r ? r.data : null)),
    del: id => tx('readwrite', s => s.delete(id)),
    all: () => tx('readonly', s => s.getAll()).then(r => r || []),
    clear: () => tx('readwrite', s => s.clear()),
    async bytes() {
      const all = await this.all();
      return all.reduce((n, r) => n + (r.data ? r.data.length : 0), 0);
    }
  };
})();


/* ── Hauptspeicher ────────────────────────────────────── */
const Store = (() => {
  const KEY = 'vokabeln.v1';
  const APP_VERSION = '1.0.0';

  /* Leitner: Wartezeit in Tagen je Fach (Index = Fach 1–5) */
  const BOX_DAYS = [0, 0, 1, 3, 7, 21];
  const MAX_BOX = 5;

  /* Sprachen: Code, Anzeigename, Stimme fürs Vorlesen, Sonderzeichen */
  const LANGS = [
    { code: 'de', name: 'Deutsch',        tts: 'de-DE', chars: 'äöüßÄÖÜ' },
    { code: 'en', name: 'Englisch',       tts: 'en-GB', chars: '' },
    { code: 'es', name: 'Spanisch',       tts: 'es-ES', chars: 'áéíóúüñ¿¡' },
    { code: 'fr', name: 'Französisch',    tts: 'fr-FR', chars: 'àâçéèêëîïôùûüœæ' },
    { code: 'it', name: 'Italienisch',    tts: 'it-IT', chars: 'àèéìòù' },
    { code: 'pt', name: 'Portugiesisch',  tts: 'pt-PT', chars: 'ãáâàçéêíõóôú' },
    { code: 'nl', name: 'Niederländisch', tts: 'nl-NL', chars: 'éëïö' },
    { code: 'la', name: 'Latein',         tts: '',      chars: 'āēīōūăĕĭŏŭ' },
    { code: 'tr', name: 'Türkisch',       tts: 'tr-TR', chars: 'çğıİöşü' },
    { code: 'pl', name: 'Polnisch',       tts: 'pl-PL', chars: 'ąćęłńóśźż' },
    { code: 'ru', name: 'Russisch',       tts: 'ru-RU', chars: '' },
    { code: 'other', name: 'Andere …',    tts: '',      chars: '' }
  ];

  const lang = code => LANGS.find(l => l.code === code) || LANGS[LANGS.length - 1];

  let data = null;

  const uid = () => (crypto.randomUUID
    ? crypto.randomUUID()
    : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9));

  const blank = () => ({
    version: 1,
    created: new Date().toISOString(),
    books: [],
    words: [],
    settings: { tts: true }
  });

  /* ── Laden & Sichern ────────────────────────────────── */
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      data = raw ? JSON.parse(raw) : blank();
    } catch (e) {
      console.warn('Daten konnten nicht gelesen werden:', e);
      data = blank();
    }
    data.books ||= [];
    data.words ||= [];
    data.settings ||= { tts: true };
    return data;
  }

  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(writeNow, 120);
  }

  function flush() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; writeNow(); }
  }

  function writeNow() {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {
      console.error('Speichern fehlgeschlagen:', e);
      document.dispatchEvent(new CustomEvent('store:error', {
        detail: 'Speicher voll oder blockiert – bitte Daten exportieren.'
      }));
    }
  }

  window.addEventListener('pagehide', flush);
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });

  /* ── Hefte ──────────────────────────────────────────── */
  const books = () => data.books;
  const book = id => data.books.find(b => b.id === id) || null;

  function addBook({ name, left, right }) {
    const b = { id: uid(), name: name.trim(), left, right, createdAt: new Date().toISOString() };
    data.books.push(b);
    save();
    return b;
  }

  function updateBook(id, patch) {
    const b = book(id);
    if (!b) return null;
    Object.assign(b, patch);
    if (b.name) b.name = b.name.trim();
    save();
    return b;
  }

  /** Löscht ein Heft samt Vokabeln und deren Bildern. */
  async function removeBook(id) {
    const gone = data.words.filter(w => w.bookId === id);
    data.words = data.words.filter(w => w.bookId !== id);
    data.books = data.books.filter(b => b.id !== id);
    save();
    await Promise.all(gone.filter(w => w.img).map(w => ImgDB.del(w.img).catch(() => {})));
  }

  /* ── Vokabeln ───────────────────────────────────────── */
  const words = bookId => (bookId ? data.words.filter(w => w.bookId === bookId) : data.words);
  const word = id => data.words.find(w => w.id === id) || null;

  function addWord({ bookId, left, right, note, img }) {
    const w = {
      id: uid(),
      bookId,
      left: (left || '').trim(),
      right: (right || '').trim(),
      note: (note || '').trim(),
      img: img || null,
      box: 1,
      correct: 0,
      wrong: 0,
      lastSeen: null,
      hard: false,
      createdAt: new Date().toISOString()
    };
    data.words.push(w);
    save();
    return w;
  }

  function updateWord(id, patch) {
    const w = word(id);
    if (!w) return null;
    Object.assign(w, patch);
    ['left', 'right', 'note'].forEach(k => {
      if (typeof w[k] === 'string') w[k] = w[k].trim();
    });
    save();
    return w;
  }

  async function removeWord(id) {
    const w = word(id);
    data.words = data.words.filter(x => x.id !== id);
    save();
    if (w && w.img) await ImgDB.del(w.img).catch(() => {});
  }

  /** Mehrere Vokabeln auf einmal. Erwartet [[links, rechts], …] */
  function addWordsBulk(bookId, pairs) {
    const added = pairs
      .filter(p => p[0] && p[1])
      .map(([l, r]) => addWord({ bookId, left: l, right: r }));
    flush();
    return added.length;
  }

  const toggleHard = id => {
    const w = word(id);
    if (!w) return null;
    w.hard = !w.hard;
    save();
    return w;
  };

  /* ── Leitner ────────────────────────────────────────── */
  /** Ist die Vokabel wieder dran? */
  function isDue(w) {
    if (!w.lastSeen) return true;
    const days = (Date.now() - new Date(w.lastSeen).getTime()) / 864e5;
    return days >= BOX_DAYS[w.box] || false;
  }

  /** Antwort verbuchen: richtig → ein Fach weiter, falsch → zurück auf 1. */
  function answer(id, wasRight) {
    const w = word(id);
    if (!w) return null;
    if (wasRight) { w.box = Math.min(MAX_BOX, w.box + 1); w.correct++; }
    else { w.box = 1; w.wrong++; }
    w.lastSeen = new Date().toISOString();
    save();
    return w;
  }

  function resetBoxes(bookId = null) {
    let n = 0;
    data.words.forEach(w => {
      if (bookId && w.bookId !== bookId) return;
      w.box = 1; w.lastSeen = null; w.correct = 0; w.wrong = 0;
      n++;
    });
    flush();
    return n;
  }

  /** Kennzahlen für ein Heft (oder alle). */
  function stats(bookId = null) {
    const list = bookId ? words(bookId) : data.words;
    const boxes = [0, 0, 0, 0, 0];
    list.forEach(w => { boxes[Math.min(MAX_BOX, Math.max(1, w.box)) - 1]++; });
    return {
      total: list.length,
      due: list.filter(isDue).length,
      hard: list.filter(w => w.hard).length,
      withImg: list.filter(w => w.img).length,
      boxes,
      learned: boxes[4]
    };
  }

  /* ── Einstellungen ──────────────────────────────────── */
  const settings = () => data.settings;
  function setSetting(key, value) {
    data.settings[key] = value;
    save();
  }

  /* ── Sicherung ──────────────────────────────────────── */
  async function exportJSON(withImages = true) {
    const payload = {
      app: 'vokabeln',
      version: 1,
      exportedAt: new Date().toISOString(),
      books: data.books,
      words: data.words,
      settings: data.settings,
      images: []
    };
    if (withImages) {
      const all = await ImgDB.all();
      const used = new Set(data.words.map(w => w.img).filter(Boolean));
      payload.images = all.filter(r => used.has(r.id));
    }
    return JSON.stringify(payload);
  }

  /** Übernimmt eine Sicherungsdatei und ersetzt den Bestand. */
  async function importJSON(text) {
    const inc = JSON.parse(text);
    if (!inc || typeof inc !== 'object' || !Array.isArray(inc.words) || !Array.isArray(inc.books)) {
      throw new Error('Das ist keine gültige Sicherungsdatei.');
    }
    data = {
      version: 1,
      created: inc.created || new Date().toISOString(),
      books: inc.books,
      words: inc.words,
      settings: inc.settings || { tts: true }
    };
    writeNow();

    if (Array.isArray(inc.images) && inc.images.length) {
      await ImgDB.clear().catch(() => {});
      for (const r of inc.images) {
        if (r && r.id && r.data) await ImgDB.put(r.id, r.data).catch(() => {});
      }
    }
    return { books: data.books.length, words: data.words.length, images: (inc.images || []).length };
  }

  /** Bilder ohne zugehörige Vokabel entfernen. */
  async function cleanImages() {
    const used = new Set(data.words.map(w => w.img).filter(Boolean));
    const all = await ImgDB.all();
    const orphans = all.filter(r => !used.has(r.id));
    await Promise.all(orphans.map(r => ImgDB.del(r.id).catch(() => {})));
    return orphans.length;
  }

  const bytes = () => (localStorage.getItem(KEY) || '').length;

  return {
    APP_VERSION, LANGS, BOX_DAYS, MAX_BOX, lang, uid,
    load, save, flush,
    books, book, addBook, updateBook, removeBook,
    words, word, addWord, updateWord, removeWord, addWordsBulk, toggleHard,
    isDue, answer, resetBoxes, stats,
    settings, setSetting,
    exportJSON, importJSON, cleanImages, bytes
  };
})();
