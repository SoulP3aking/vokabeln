/* ═══════════════════════════════════════════════════════
   train.js · Übungslogik
   Baut die Runde zusammen und bewertet Antworten.
   Bei Akzenten wird nachsichtig geprüft: ein fehlendes ´
   zählt als richtig, die korrekte Schreibweise wird gezeigt.
   ═══════════════════════════════════════════════════════ */

const Train = (() => {

  /* ── Vergleichen ────────────────────────────────────── */
  const ART = /^(der|die|das|den|dem|ein|eine|el|la|los|las|un|una|unos|unas|le|les|une|des|du|the|an|a|il|lo|gli|i)\s+/i;
  // l'été, aber auch "l ete" – auf dem Handy wird der Apostroph gern vergessen
  const ELIDED = /^[ldsnj]['’ ]/i;

  // ß und ss gelten als gleich – sonst findet "strasse" die "Straße" nicht
  const stripAccents = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');

  /** Kleinschreibung, ohne Artikel, ohne Satzzeichen. Akzente bleiben. */
  function base(s) {
    return String(s || '')
      .toLowerCase().trim()
      .replace(ART, '')
      .replace(ELIDED, '')
      .replace(/[.,;:!?¿¡"'’()\[\]]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Wie base(), zusätzlich ohne Akzente. */
  const loose = s => stripAccents(base(s));

  /** "la casa, el hogar" oder "casa / hogar" → beide gelten. */
  const alternatives = s => String(s || '')
    .split(/[,;/]|\bbzw\.?\b|\boder\b/i)
    .map(x => x.trim())
    .filter(Boolean);

  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(
          prev[j] + 1,
          cur[j - 1] + 1,
          prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
      }
      prev = cur;
    }
    return prev[b.length];
  }

  /**
   * Prüft eine getippte Antwort.
   * @returns {result} 'right' | 'accent' | 'near' | 'wrong'
   *   right  – stimmt
   *   accent – stimmt bis auf Akzente (gilt als richtig, mit Hinweis)
   *   near   – ein Tippfehler daneben (gilt als falsch, aber freundlich)
   *   wrong  – falsch
   */
  function check(given, expected) {
    const g = base(given);
    if (!g) return { result: 'wrong' };

    const opts = alternatives(expected);
    const all = opts.length > 1 ? [expected, ...opts] : [expected];

    for (const opt of all) {
      if (base(opt) === g) return { result: 'right', matched: opt };
    }
    const gl = loose(given);
    for (const opt of all) {
      if (loose(opt) === gl) return { result: 'accent', matched: opt };
    }
    for (const opt of all) {
      const ol = loose(opt);
      if (ol.length >= 4 && levenshtein(ol, gl) <= 1) return { result: 'near', matched: opt };
    }
    return { result: 'wrong' };
  }

  /** Zählt die Antwort als bestanden? */
  const passed = result => result === 'right' || result === 'accent';

  /* ── Runde zusammenstellen ──────────────────────────── */
  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /** Drei Ablenker plus die richtige Antwort, gemischt. */
  function choicesFor(word, dir, pool) {
    const side = dir === 'lr' ? 'right' : 'left';
    const right = word[side];
    const others = pool
      .filter(w => w.id !== word.id && w[side] && base(w[side]) !== base(right))
      .map(w => w[side]);

    const uniq = [...new Set(others)];
    return shuffle([right, ...shuffle(uniq).slice(0, 3)]);
  }

  /**
   * Baut eine Übungsrunde.
   * @param opts.bookId   Heft oder null für alle
   * @param opts.scope    'due' | 'all' | 'hard'
   * @param opts.dir      'lr' | 'rl' | 'mix'
   * @param opts.mode     'type' | 'choice' | 'mix'
   * @param opts.limit    Höchstzahl Vokabeln
   */
  function build({ bookId = null, scope = 'due', dir = 'lr', mode = 'mix', limit = 20 }) {
    let pool = Store.words(bookId).filter(w => w.left && w.right);
    if (scope === 'due') pool = pool.filter(Store.isDue);
    if (scope === 'hard') pool = pool.filter(w => w.hard);

    // Bei Auswahlfragen braucht es genug andere Wörter als Ablenker
    const full = Store.words(bookId).filter(w => w.left && w.right);

    const picked = shuffle(pool).slice(0, limit);

    return picked.map(w => {
      const d = dir === 'mix' ? (Math.random() < 0.5 ? 'lr' : 'rl') : dir;
      let m = mode === 'mix' ? (Math.random() < 0.5 ? 'type' : 'choice') : mode;
      if (m === 'choice' && full.length < 3) m = 'type';   // zu wenig Auswahl
      return {
        word: w,
        dir: d,
        mode: m,
        choices: m === 'choice' ? choicesFor(w, d, full) : null
      };
    });
  }

  /** Wie viele Vokabeln stünden gerade zur Auswahl? */
  function count({ bookId = null, scope = 'due' }) {
    let pool = Store.words(bookId).filter(w => w.left && w.right);
    if (scope === 'due') pool = pool.filter(Store.isDue);
    if (scope === 'hard') pool = pool.filter(w => w.hard);
    return pool.length;
  }

  return { check, passed, build, count, shuffle, base, loose, alternatives, levenshtein };
})();
