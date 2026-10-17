/* ═══════════════════════════════════════════════════════
   app.js · Ansichten, Formulare, Steuerung
   ═══════════════════════════════════════════════════════ */

(() => {
  const { $, $$, esc, plural, relTime, empty, toast,
          openSheet, closeSheet, Img, prepareImage, kb,
          Speech, charbarHTML, insertChar, SPEAKER, CAMERA, TICK, CROSS, NEAR } = UI;

  /* ── Zustand ────────────────────────────────────────── */
  const state = {
    view: 'books',
    bookId: null,
    wordSearch: '',
    wordFilter: 'all',
    train: null,
    setup: { bookId: '', scope: 'due', dir: 'lr', mode: 'mix', limit: 20 }
  };

  /** Bild-Änderung im offenen Formular: null | {mode:'set',data} | {mode:'remove'} */
  let imgState = null;

  /* ── Kleine Helfer ──────────────────────────────────── */
  const langName = side => Store.lang(side.code).name === 'Andere …'
    ? (side.label || 'Andere') : (side.label || Store.lang(side.code).name);

  const ttsTag = side => Store.lang(side.code).tts;

  /** Welche Seite ist die Fremdsprache? (zum Vorlesen) */
  const foreignSide = book => (book.right.code !== 'de' ? 'right'
    : book.left.code !== 'de' ? 'left' : 'right');

  const boxbarHTML = boxes => {
    const total = boxes.reduce((a, b) => a + b, 0);
    if (!total) return '';
    return `<div class="boxbar">` + boxes.map((n, i) =>
      n ? `<i data-b="${i + 1}" style="width:${(n / total * 100).toFixed(2)}%"></i>` : ''
    ).join('') + `</div>`;
  };

  const speakBtn = (text, tag, cls = 'speak') => {
    if (!Store.settings().tts || !Speech.supported || !tag || !Speech.hasVoice(tag)) return '';
    return `<button class="${cls}" data-speak="${esc(text)}" data-lang="${esc(tag)}" aria-label="Vorlesen">${SPEAKER}</button>`;
  };

  /* ═══════════════════════════════════════════════════
     Ansicht: Hefte
     ═══════════════════════════════════════════════════ */
  function renderBooks() {
    const list = Store.books();
    if (!list.length) {
      $('#booksContent').innerHTML = empty('Noch kein Heft',
        'Tippe unten rechts auf +, um dein erstes Vokabelheft anzulegen.');
      return;
    }
    $('#booksContent').innerHTML = list.map(b => {
      const s = Store.stats(b.id);
      const meta = [`${plural(s.total, 'Vokabel', 'Vokabeln')}`];
      if (s.due) meta.push(`<span class="due">${s.due} fällig</span>`);
      if (s.hard) meta.push(`${s.hard} schwierig`);
      return `<button class="book" data-book="${b.id}">
        <h3>${esc(b.name)}</h3>
        <span class="book-langs">${esc(langName(b.left))}<span class="arrow">→</span>${esc(langName(b.right))}</span>
        <div class="book-meta">${meta.join('<span class="dot"></span>')}</div>
        ${boxbarHTML(s.boxes)}
      </button>`;
    }).join('');
  }

  /* ═══════════════════════════════════════════════════
     Ansicht: ein Heft
     ═══════════════════════════════════════════════════ */
  function renderBook() {
    const b = Store.book(state.bookId);
    if (!b) return switchView('books');
    const s = Store.stats(b.id);

    $('#viewTitle').textContent = b.name;

    $('#bookHeader').innerHTML = `<div class="glass card book-head">
      <span class="book-langs">${esc(langName(b.left))}<span class="arrow">→</span>${esc(langName(b.right))}</span>
      <div class="book-meta">
        ${plural(s.total, 'Vokabel', 'Vokabeln')}<span class="dot"></span>
        ${s.due ? `<span class="due">${s.due} fällig</span>` : 'nichts fällig'}
        ${s.learned ? `<span class="dot"></span>${s.learned} sitzen` : ''}
      </div>
      ${boxbarHTML(s.boxes)}
      <div class="btn-row">
        <button class="btn btn-primary" data-train-book="${b.id}">Üben</button>
        <button class="btn btn-soft" data-bulk="${b.id}">Liste einfügen</button>
        <button class="btn btn-soft" data-edit-book="${b.id}">Heft</button>
      </div>
    </div>`;

    renderWords();
  }

  function renderWords() {
    const b = Store.book(state.bookId);
    if (!b) return;
    let list = Store.words(b.id);

    if (state.wordFilter === 'hard') list = list.filter(w => w.hard);
    if (state.wordFilter === 'due') list = list.filter(Store.isDue);

    const q = Train.loose(state.wordSearch);
    if (q) list = list.filter(w =>
      Train.loose(w.left).includes(q) ||
      Train.loose(w.right).includes(q) ||
      Train.loose(w.note).includes(q));

    if (!list.length) {
      $('#wordsContent').innerHTML = empty(
        state.wordSearch ? 'Nichts gefunden' : 'Noch keine Vokabeln',
        state.wordSearch ? 'Für diese Suche gibt es keinen Treffer.'
          : state.wordFilter !== 'all' ? 'Für diese Auswahl gibt es keine Einträge.'
          : 'Tippe unten rechts auf +, um die erste Vokabel einzutragen.');
      return;
    }

    const fs = foreignSide(b);
    const tag = ttsTag(b[fs]);

    $('#wordsContent').innerHTML = list.map(w => {
      const tags = [];
      if (w.hard) tags.push('<span class="tag tag-hard">schwierig</span>');
      tags.push(`<span class="tag tag-box">Fach ${w.box}</span>`);
      if (w.correct + w.wrong > 0) tags.push(`<span class="tag">${w.correct}× richtig</span>`);

      return `<article class="word" data-box="${w.box}" data-word="${w.id}">
        ${w.img ? `<img class="thumb" data-img="${w.img}" alt="">` : ''}
        <div class="word-main">
          <p class="word-left">${esc(w.left)}</p>
          <p class="word-right">${esc(w.right)}</p>
          ${w.note ? `<p class="word-note">${esc(w.note)}</p>` : ''}
          <div class="word-tags">${tags.join('')}</div>
        </div>
        ${speakBtn(w[fs], tag)}
      </article>`;
    }).join('');

    Img.hydrate($('#wordsContent'));
  }

  /* ═══════════════════════════════════════════════════
     Ansicht: Üben
     ═══════════════════════════════════════════════════ */
  function renderTrain() {
    if (state.train) return renderSession();
    renderSetup();
  }

  function renderSetup() {
    const books = Store.books();
    if (!books.length) {
      $('#trainContent').innerHTML = empty('Noch kein Heft',
        'Lege zuerst ein Vokabelheft mit ein paar Wörtern an.');
      return;
    }
    const su = state.setup;
    const b = su.bookId ? Store.book(su.bookId) : null;
    const n = Train.count({ bookId: su.bookId || null, scope: su.scope });
    const s = Store.stats(su.bookId || null);

    const dirLabels = b
      ? [`${langName(b.left)} → ${langName(b.right)}`, `${langName(b.right)} → ${langName(b.left)}`]
      : ['Links → Rechts', 'Rechts → Links'];

    $('#trainContent').innerHTML = `<div class="train-setup">
      <div class="glass card">
        <label class="field">
          <span class="lbl">Heft</span>
          <select id="tBook">
            <option value=""${!su.bookId ? ' selected' : ''}>Alle Hefte</option>
            ${books.map(x => `<option value="${x.id}"${su.bookId === x.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}
          </select>
        </label>

        <div class="field">
          <span class="lbl">Was üben?</span>
          <div class="seg" id="tScope">
            <button class="seg-btn${su.scope === 'due' ? ' is-active' : ''}" data-scope="due">Fällige</button>
            <button class="seg-btn${su.scope === 'all' ? ' is-active' : ''}" data-scope="all">Alle</button>
            <button class="seg-btn${su.scope === 'hard' ? ' is-active' : ''}" data-scope="hard">Schwierige</button>
          </div>
        </div>

        <div class="field">
          <span class="lbl">Richtung</span>
          <div class="seg" id="tDir">
            <button class="seg-btn${su.dir === 'lr' ? ' is-active' : ''}" data-dir="lr">${esc(dirLabels[0])}</button>
            <button class="seg-btn${su.dir === 'rl' ? ' is-active' : ''}" data-dir="rl">${esc(dirLabels[1])}</button>
            <button class="seg-btn${su.dir === 'mix' ? ' is-active' : ''}" data-dir="mix">Gemischt</button>
          </div>
        </div>

        <div class="field">
          <span class="lbl">Art</span>
          <div class="seg" id="tMode">
            <button class="seg-btn${su.mode === 'type' ? ' is-active' : ''}" data-mode="type">Tippen</button>
            <button class="seg-btn${su.mode === 'choice' ? ' is-active' : ''}" data-mode="choice">Auswahl</button>
            <button class="seg-btn${su.mode === 'mix' ? ' is-active' : ''}" data-mode="mix">Gemischt</button>
          </div>
        </div>

        <label class="field">
          <span class="lbl">Wie viele</span>
          <select id="tLimit">
            ${[10, 20, 30, 50].map(x => `<option value="${x}"${su.limit === x ? ' selected' : ''}>${x} Vokabeln</option>`).join('')}
            <option value="999"${su.limit === 999 ? ' selected' : ''}>Alle</option>
          </select>
        </label>

        <div class="btn-row">
          <button class="btn btn-primary btn-block" id="btnStart"${n ? '' : ' disabled'}>
            ${n ? `${Math.min(n, su.limit)} ${n === 1 ? 'Vokabel' : 'Vokabeln'} üben` : 'Nichts zu üben'}
          </button>
        </div>
        ${!n && su.scope === 'due' && s.total
          ? '<p class="hint">Alles Fällige ist erledigt. Wähle „Alle“, um trotzdem zu wiederholen.</p>' : ''}
        ${!s.total ? '<p class="hint">In diesem Heft stehen noch keine Vokabeln.</p>' : ''}
      </div>

      ${s.total ? `<div class="glass card">
        <h2>Lernstand</h2>
        <p class="hint">Vokabeln wandern bei richtigen Antworten ein Fach weiter und kommen dann seltener dran. Ein Fehler wirft sie zurück auf Fach 1.</p>
        ${boxbarHTML(s.boxes)}
        <div class="boxbar-legend"><span>Fach 1: ${s.boxes[0]}</span><span>${s.boxes[1]}</span><span>${s.boxes[2]}</span><span>${s.boxes[3]}</span><span>Fach 5: ${s.boxes[4]}</span></div>
      </div>` : ''}
    </div>`;
  }

  /* ── Laufende Runde ─────────────────────────────────── */
  function startSession() {
    const su = state.setup;
    const items = Train.build({
      bookId: su.bookId || null,
      scope: su.scope,
      dir: su.dir,
      mode: su.mode,
      limit: su.limit
    });
    if (!items.length) return toast('Nichts zu üben');
    state.train = { items, i: 0, right: 0, wrong: 0, wrongList: [], answered: null };
    renderSession();
  }

  function renderSession() {
    const t = state.train;
    if (t.i >= t.items.length) return renderResult();

    const it = t.items[t.i];
    const w = it.word;
    const b = Store.book(w.bookId);
    const askSide = it.dir === 'lr' ? 'left' : 'right';
    const ansSide = it.dir === 'lr' ? 'right' : 'left';
    const askLang = b ? langName(b[askSide]) : '';
    const ansLang = b ? langName(b[ansSide]) : '';
    const askTag = b ? ttsTag(b[askSide]) : '';
    const ansTag = b ? ttsTag(b[ansSide]) : '';

    const pct = (t.i / t.items.length) * 100;
    const fb = t.answered;

    $('#trainContent').innerHTML = `
      <div class="progress">
        <div class="progress-bar"><i style="width:${pct}%"></i></div>
        <span class="progress-txt">${t.i + 1}/${t.items.length}</span>
        <span class="progress-score">${t.right} ✓</span>
      </div>

      <div class="prompt-card">
        <p class="prompt-lang">${esc(askLang)}</p>
        <p class="prompt-word">${esc(w[askSide])}</p>
        ${w.note ? `<p class="prompt-note">${esc(w.note)}</p>` : ''}
        ${w.img ? `<img class="prompt-img" data-img="${w.img}" alt="">` : ''}
        ${speakBtn(w[askSide], askTag)}
      </div>

      ${it.mode === 'type' ? `
        <div class="field answer-field">
          <span class="lbl">${esc(ansLang)}</span>
          <input type="text" id="tAnswer" autocomplete="off" autocorrect="off"
                 autocapitalize="off" spellcheck="false" enterkeyhint="done"
                 placeholder="Antwort eingeben"${fb ? ' disabled' : ''}
                 value="${fb ? esc(fb.given) : ''}">
          ${fb ? '' : charbarHTML(b ? b[ansSide].code : 'de', 'tAnswer')}
        </div>`
      : `
        <div class="choices">
          ${it.choices.map(c => {
            let cls = 'choice';
            if (fb) {
              if (Train.base(c) === Train.base(w[ansSide])) cls += ' is-right';
              else if (c === fb.given) cls += ' is-wrong';
            }
            return `<button class="${cls}" data-choice="${esc(c)}"${fb ? ' disabled' : ''}>${esc(c)}</button>`;
          }).join('')}
        </div>`}

      ${fb ? feedbackHTML(fb, w[ansSide], ansTag) : ''}

      <div class="btn-row">
        ${fb
          ? `<button class="btn btn-primary btn-block" id="btnNext">${t.i + 1 >= t.items.length ? 'Auswertung' : 'Weiter'}</button>`
          : it.mode === 'type'
            ? '<button class="btn btn-primary btn-block" id="btnCheck">Prüfen</button>'
            : ''}
      </div>
      <div class="btn-row">
        <button class="btn btn-soft btn-block" id="btnStop">Runde beenden</button>
      </div>`;

    Img.hydrate($('#trainContent'));
    const inp = $('#tAnswer');
    if (inp && !fb) setTimeout(() => inp.focus(), 60);
  }

  function feedbackHTML(fb, solution, tag) {
    if (fb.result === 'right') {
      return `<div class="feedback fb-right"><h3>${TICK} Richtig</h3></div>`;
    }
    if (fb.result === 'accent') {
      return `<div class="feedback fb-right"><h3>${TICK} Richtig</h3>
        <p>Achte auf die Schreibweise: <span class="sol">${esc(solution)}</span></p></div>`;
    }
    if (fb.result === 'near') {
      return `<div class="feedback fb-close"><h3>${NEAR} Fast</h3>
        <p>Ein Buchstabe daneben. Richtig ist <span class="sol">${esc(solution)}</span>.</p></div>`;
    }
    return `<div class="feedback fb-wrong"><h3>${CROSS} Nicht richtig</h3>
      <p>Richtig ist <span class="sol">${esc(solution)}</span>.</p></div>`;
  }

  function submitAnswer(given) {
    const t = state.train;
    const it = t.items[t.i];
    const w = it.word;
    const ansSide = it.dir === 'lr' ? 'right' : 'left';

    const res = it.mode === 'type'
      ? Train.check(given, w[ansSide])
      : { result: Train.base(given) === Train.base(w[ansSide]) ? 'right' : 'wrong' };

    const ok = Train.passed(res.result);
    Store.answer(w.id, ok);
    if (ok) t.right++;
    else { t.wrong++; t.wrongList.push({ word: w, given, side: ansSide }); }

    t.answered = { ...res, given };
    renderSession();
  }

  function nextItem() {
    const t = state.train;
    t.i++;
    t.answered = null;
    renderSession();
  }

  function renderResult() {
    const t = state.train;
    const total = t.right + t.wrong;
    const pct = total ? Math.round((t.right / total) * 100) : 0;

    $('#trainContent').innerHTML = `
      <div class="glass card" style="text-align:center">
        <p class="result-num">${t.right} / ${total}</p>
        <p class="result-sub">${pct}% richtig${pct === 100 ? ' – alles gewusst!' : ''}</p>
      </div>

      ${t.wrongList.length ? `<h2 class="sec-title">Nochmal ansehen<span class="count">${t.wrongList.length}</span></h2>
        <div class="result-list">${t.wrongList.map(({ word: w, side }) => `
          <article class="word" data-box="${w.box}" data-word="${w.id}">
            <div class="word-main">
              <p class="word-left">${esc(side === 'right' ? w.left : w.right)}</p>
              <p class="word-right">${esc(w[side])}</p>
            </div>
          </article>`).join('')}</div>` : ''}

      <div class="btn-row">
        <button class="btn btn-primary" id="btnAgain">Nochmal</button>
        <button class="btn btn-soft" id="btnDone">Fertig</button>
      </div>`;
  }

  /* ═══════════════════════════════════════════════════
     Ansicht: Nachschlagen
     ═══════════════════════════════════════════════════ */
  function renderDict() {
    const q = $('#dictSearch').value.trim();
    $('#clearDict').hidden = !q;
    $('#dictHint').textContent = q
      ? ''
      : `${Dict.size} Wörter in Deutsch, Englisch, Spanisch und Französisch – ohne Internet.`;

    if (q.length < 2) {
      $('#dictContent').innerHTML = q
        ? ''
        : empty('Wort nachschlagen', 'Tippe ein Wort in einer der vier Sprachen ein.');
      return;
    }

    const rows = Dict.lookupAll(q, 20);
    if (!rows.length) {
      $('#dictContent').innerHTML = empty('Nichts gefunden',
        'Dieses Wort steht nicht im eingebauten Wörterbuch.');
      return;
    }

    const NAMES = ['Deutsch', 'English', 'Español', 'Français'];
    const TAGS = ['de-DE', 'en-GB', 'es-ES', 'fr-FR'];

    $('#dictContent').innerHTML = rows.map((row, idx) => `
      <div class="dict-row">
        <dl>${row.map((w, i) =>
          `<dt>${NAMES[i]}</dt><dd${i === 0 ? ' class="lead"' : ''}>${esc(w)}${
            i > 0 ? speakBtn(w, TAGS[i], 'speak speak-inline') : ''}</dd>`).join('')}</dl>
        <div class="row-actions">
          <button class="btn btn-soft" data-dict-add="${idx}">In ein Heft übernehmen</button>
        </div>
      </div>`).join('');

    dictRows = rows;
  }
  let dictRows = [];

  /* ═══════════════════════════════════════════════════
     KI-Übersetzer: Status und Download
     ═══════════════════════════════════════════════════ */
  /** phase: none | ondisk | downloading | starting | ready | error */
  const ai = { phase: 'none', pct: 0, error: '' };
  // set while the model starts – if it is still set on the next launch, the start crashed
  const AI_START_KEY = 'vokabeln.aiStarting';
  let aiStartCrashed = false;

  const aiDownloaded = () => ['ondisk', 'starting', 'ready'].includes(ai.phase);
  const aiSize = () => `${(AI.MODEL_MB / 1000).toFixed(1).replace('.', ',')} GB`;

  async function aiCheck() {
    try {
      ai.phase = AI.isReady() ? 'ready' : (await AI.isDownloaded()) ? 'ondisk' : 'none';
    } catch (e) {
      console.warn('KI-Status unbekannt:', e);
      ai.phase = 'none';
    }
    if (ai.phase === 'ondisk' && aiStartCrashed) {
      ai.phase = 'error';
      ai.error = 'Sie wurde beim letzten Mal nicht fertig gestartet – App geschlossen oder zu wenig Arbeitsspeicher.';
    }
    paintAI();
  }

  /** KI herunterladen bzw. vom Gerät starten. */
  async function aiStart() {
    if (AI.isReady() || AI.isLoading()) return;
    const fromDisk = ai.phase === 'ondisk';
    if (!fromDisk && navigator.storage && navigator.storage.estimate) {
      const est = await navigator.storage.estimate().catch(() => null);
      if (est && est.quota - est.usage < AI.MODEL_MB * 1.05e6) {
        toast('Nicht genug freier Speicher für die KI.');
        return;
      }
    }
    ai.phase = fromDisk ? 'starting' : 'downloading';
    ai.pct = 0;
    paintAI();

    // iOS pauses the download when the screen locks
    const lock = !fromDisk && navigator.wakeLock
      ? await navigator.wakeLock.request('screen').catch(() => null) : null;
    try { localStorage.setItem(AI_START_KEY, '1'); } catch (e) {}
    try {
      await AI.load(p => { ai.pct = p; paintProgress(); });
      ai.phase = 'ready';
      aiStartCrashed = false;
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    } catch (e) {
      console.warn('KI konnte nicht laden:', e);
      ai.phase = 'error';
      ai.error = (e && e.message) || String(e);
    }
    try { localStorage.removeItem(AI_START_KEY); } catch (e) {}
    if (lock) lock.release().catch(() => {});
    paintAI();
  }

  /** Beim Öffnen von Übersetzen oder Vokabel-Formular schon mal starten. */
  function aiWarmup() {
    if (ai.phase === 'ondisk') aiStart();
  }

  async function aiRemove() {
    if (!confirm(`Die KI vom Gerät löschen? Das gibt ${aiSize()} frei. Du kannst sie jederzeit wieder herunterladen.`)) return;
    try {
      await AI.remove();
      toast('KI gelöscht');
    } catch (e) {
      console.warn('KI löschen fehlgeschlagen:', e);
      toast('Löschen hat nicht geklappt.');
    }
    aiStartCrashed = false;
    await aiCheck();
  }

  function aiPanelHTML(where) {
    const size = aiSize();
    switch (ai.phase) {
      case 'downloading':
        return `<p class="hint">Wird heruntergeladen … <strong data-ai-pct>${Math.floor(ai.pct * 100)} %</strong><br>
          Lass die App dabei offen.</p>
          <div class="progress-bar" style="margin-top:10px"><i data-ai-bar style="width:${(ai.pct * 100).toFixed(1)}%"></i></div>`;
      case 'starting':
        return `<p class="hint">KI startet …</p>`;
      case 'ready':
      case 'ondisk':
        return where === 'settings'
          ? `<p class="hint">${ai.phase === 'ready' ? 'Bereit.' : 'Liegt auf dem Gerät.'} Hy-MT2 von Tencent übersetzt direkt auf diesem Gerät, auch ohne Internet. Belegt ${size}.</p>
             <div class="btn-row"><button class="btn btn-soft" data-ai-remove>KI löschen</button></div>`
          : '';
      case 'error':
        return `<p class="hint">Die KI konnte nicht starten. ${esc(ai.error)}</p>
          <div class="btn-row"><button class="btn btn-primary" data-ai-retry>Nochmal versuchen</button></div>`;
      default:
        return `<p class="hint">Die Übersetzer-KI (Hy-MT2 von Tencent) läuft direkt auf deinem Gerät – ohne Internet, deine Texte bleiben hier. Sie wird einmalig heruntergeladen (${size}), am besten im WLAN.</p>
          <div class="btn-row"><button class="btn btn-primary" data-ai-download>Herunterladen (${size})</button></div>`;
    }
  }

  function paintAI() {
    const card = aiPanelHTML('translate');
    $('#aiCard').innerHTML = card ? `<div class="glass card"><h2>KI-Übersetzer</h2>${card}</div>` : '';
    $('#aiSettings').innerHTML = aiPanelHTML('settings');
  }

  /** Nur Balken und Prozentzahl erneuern – das passiert sehr oft. */
  function paintProgress() {
    $$('[data-ai-bar]').forEach(i => { i.style.width = `${(ai.pct * 100).toFixed(1)}%`; });
    $$('[data-ai-pct]').forEach(s => { s.textContent = `${Math.floor(ai.pct * 100)} %`; });
  }

  /* ═══════════════════════════════════════════════════
     Ansicht: Übersetzen
     ═══════════════════════════════════════════════════ */
  const tr = { busy: false, result: null };

  function renderTranslate() {
    paintAI();
    const set = Store.settings();
    const opts = sel => Store.LANGS.filter(l => AI.supports(l.code)).map(l =>
      `<option value="${l.code}"${l.code === sel ? ' selected' : ''}>${esc(l.name)}</option>`).join('');
    $('#trFrom').innerHTML = opts(set.trFrom || 'de');
    $('#trTo').innerHTML = opts(set.trTo || 'es');
    $('#trChars').innerHTML = charbarHTML($('#trFrom').value, 'trText');
    renderTrResult();
    aiWarmup();
  }

  function renderTrResult() {
    const btn = $('#btnTranslate');
    btn.disabled = tr.busy;
    btn.textContent = tr.busy ? 'Übersetzt …' : 'Übersetzen';

    const r = tr.result;
    if (!r) { $('#trResult').innerHTML = ''; return; }
    const L = Store.lang(r.to);
    // vocab fields hold at most 120 characters
    const fits = r.text.length <= 120 && r.out.length <= 120;
    $('#trResult').innerHTML = `
      <div class="glass card">
        <div class="row-between">
          <p class="prompt-lang" style="margin:0">${esc(L.name)}</p>
          ${speakBtn(r.out, L.tts)}
        </div>
        <p class="tr-out">${esc(r.out)}</p>
        <div class="btn-row">
          <button class="btn btn-soft" data-tr-copy>Kopieren</button>
          ${fits ? '<button class="btn btn-soft" data-tr-add>In ein Heft übernehmen</button>' : ''}
        </div>
      </div>`;
  }

  async function doTranslate() {
    const text = $('#trText').value.trim();
    if (!text || tr.busy) return;
    if (ai.phase === 'error') return toast('Die KI läuft gerade nicht – siehe oben.');
    if (!aiDownloaded()) return toast('Lade zuerst die KI herunter.');
    const from = $('#trFrom').value, to = $('#trTo').value;
    if (from === to) return toast('Wähle zwei verschiedene Sprachen.');

    tr.busy = true;
    renderTrResult();
    aiWarmup();
    try {
      const out = await AI.translate(text, to);
      tr.result = { text, out, from, to };
    } catch (e) {
      console.warn('Übersetzen fehlgeschlagen:', e);
      toast('Übersetzen hat nicht geklappt.');
    }
    tr.busy = false;
    renderTrResult();
  }

  function trSwap() {
    const f = $('#trFrom'), t = $('#trTo');
    [f.value, t.value] = [t.value, f.value];
    if (tr.result) {
      $('#trText').value = tr.result.out;
      tr.result = null;
    }
    Store.setSetting('trFrom', f.value);
    Store.setSetting('trTo', t.value);
    renderTranslate();
  }

  function trCopy() {
    if (!tr.result) return;
    navigator.clipboard.writeText(tr.result.out)
      .then(() => toast('Kopiert'))
      .catch(() => toast('Kopieren nicht möglich'));
  }

  /* ═══════════════════════════════════════════════════
     Ansicht: Einstellungen
     ═══════════════════════════════════════════════════ */
  async function renderSettings() {
    $('#appVersion').textContent = Store.APP_VERSION;
    paintAI();
    $('#ttsEnabled').checked = !!Store.settings().tts;
    $('#dictInfo').textContent =
      `${Dict.size} Einträge in Deutsch, Englisch, Spanisch und Französisch. Sie erscheinen beim Eintippen als Vorschlag und lassen sich unter „Nachschlagen“ durchsuchen. Einzelne Wörter, keine Satzübersetzung.`;

    $('#ttsHint').textContent = Speech.supported
      ? 'Nutzt die Stimmen deines Geräts. Auf dem iPhone sind Deutsch, Englisch, Spanisch und Französisch normalerweise vorhanden.'
      : 'Dieses Gerät kann keine Sprachausgabe.';

    const st = Store.stats();
    const imgBytes = await ImgDB.bytes().catch(() => 0);
    $('#storageInfo').textContent =
      `${plural(Store.books().length, 'Heft', 'Hefte')} · ${plural(st.total, 'Vokabel', 'Vokabeln')} · ${st.withImg} mit Bild
` +
      `Text ${kb(Store.bytes())} · Bilder ${kb(imgBytes)}`;
    $('#imgSizeHint').textContent = imgBytes ? `(${kb(imgBytes)})` : '';
  }

  /* ═══════════════════════════════════════════════════
     Ansichtswechsel
     ═══════════════════════════════════════════════════ */
  const RENDER = {
    books: renderBooks, book: renderBook, train: renderTrain,
    dict: renderDict, translate: renderTranslate, settings: renderSettings
  };

  const TAB_OF = { books: 'books', book: 'books', train: 'train', dict: 'dict', translate: 'translate', settings: null };

  function switchView(name) {
    state.view = name;
    $$('.view').forEach(v => { v.hidden = v.id !== 'view-' + name; });
    $$('.tab').forEach(t => t.classList.toggle('is-active', t.dataset.view === TAB_OF[name]));
    $('#viewTitle').textContent = $('#view-' + name).dataset.title;
    $('#btnBack').hidden = !(name === 'book' || name === 'settings');
    $('#btnSettings').hidden = name === 'settings';

    const fab = $('#fab');
    const showFab = name === 'books' || name === 'book';
    fab.style.display = showFab ? '' : 'none';
    fab.setAttribute('aria-label', name === 'book' ? 'Neue Vokabel' : 'Neues Heft');

    RENDER[name]();
    window.scrollTo(0, 0);
  }

  function refresh() { RENDER[state.view](); }

  function openBook(id) {
    state.bookId = id;
    state.wordSearch = '';
    state.wordFilter = 'all';
    $('#wordSearch').value = '';
    $('#clearSearch').hidden = true;
    $$('#wordFilter .seg-btn').forEach(b => b.classList.toggle('is-active', b.dataset.wf === 'all'));
    switchView('book');
  }

  /* ═══════════════════════════════════════════════════
     Formular: Heft
     ═══════════════════════════════════════════════════ */
  function langSelect(id, selected, labelId) {
    return `<select id="${id}">${Store.LANGS.map(l =>
      `<option value="${l.code}"${l.code === selected ? ' selected' : ''}>${esc(l.name)}</option>`).join('')}</select>
      <input type="text" id="${labelId}" placeholder="Sprache benennen" style="margin-top:8px" hidden>`;
  }

  function openBookSheet(id = null) {
    const b = id ? Store.book(id) : null;
    const L = b ? b.left : { code: 'de', label: '' };
    const R = b ? b.right : { code: 'es', label: '' };
    const n = b ? Store.words(b.id).length : 0;

    openSheet(b ? 'Heft bearbeiten' : 'Neues Heft', `
      <label class="field">
        <span class="lbl">Name des Hefts <span class="req">*</span></span>
        <input type="text" id="bName" placeholder="z. B. Spanisch Unit 3" value="${esc(b ? b.name : '')}" maxlength="60" enterkeyhint="done">
      </label>

      <div class="field">
        <span class="lbl">Sprachen</span>
        <div class="lang-swap">
          <label class="field" style="margin:0">
            <span class="lbl" style="font-size:.68rem">Links</span>
            ${langSelect('bLeft', L.code, 'bLeftLabel')}
          </label>
          <button type="button" class="swap-btn" id="bSwap" aria-label="Sprachen tauschen">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 8h13l-3-3M17 16H4l3 3"/></svg>
          </button>
          <label class="field" style="margin:0">
            <span class="lbl" style="font-size:.68rem">Rechts</span>
            ${langSelect('bRight', R.code, 'bRightLabel')}
          </label>
        </div>
        <p class="hint">Links steht meist deine Sprache, rechts die, die du lernst.</p>
      </div>

      <div class="sheet-actions">
        ${b ? `<button class="btn btn-danger btn-icon-only" data-del-book="${b.id}">Löschen</button>` : ''}
        <button class="btn btn-primary" data-save-book="${b ? b.id : ''}">${b ? 'Sichern' : 'Anlegen'}</button>
      </div>
      ${b && n ? `<p class="hint">Beim Löschen verschwinden auch ${plural(n, 'Vokabel', 'Vokabeln')}.</p>` : ''}`,
      () => {
        $('#bLeftLabel').value = L.label || '';
        $('#bRightLabel').value = R.label || '';
        syncLangLabels();
      });
  }

  function syncLangLabels() {
    [['bLeft', 'bLeftLabel'], ['bRight', 'bRightLabel']].forEach(([sel, lab]) => {
      const s = $('#' + sel), l = $('#' + lab);
      if (s && l) l.hidden = s.value !== 'other';
    });
  }

  function saveBook(id) {
    const name = $('#bName').value.trim();
    if (!name) { toast('Bitte einen Namen eingeben.'); $('#bName').focus(); return; }
    const mk = (sel, lab) => {
      const code = $('#' + sel).value;
      const label = code === 'other' ? ($('#' + lab).value.trim() || 'Andere') : '';
      return { code, label };
    };
    const payload = { name, left: mk('bLeft', 'bLeftLabel'), right: mk('bRight', 'bRightLabel') };

    if (id) { Store.updateBook(id, payload); toast('Gesichert'); }
    else {
      const b = Store.addBook(payload);
      Store.flush();
      closeSheet();
      openBook(b.id);
      toast('Heft angelegt');
      return;
    }
    closeSheet();
    refresh();
  }

  /* ═══════════════════════════════════════════════════
     Formular: Vokabel
     ═══════════════════════════════════════════════════ */
  function openWordSheet(bookId, id = null, preset = null) {
    const b = Store.book(bookId);
    if (!b) return;
    const w = id ? Store.word(id) : null;
    imgState = null;

    const lName = langName(b.left), rName = langName(b.right);

    openSheet(w ? 'Vokabel bearbeiten' : 'Neue Vokabel', `
      <label class="field">
        <span class="lbl">${esc(lName)} <span class="req">*</span></span>
        <input type="text" id="wLeft" autocomplete="off" autocapitalize="off" spellcheck="false"
               placeholder="${esc(lName)}" value="${esc(w ? w.left : (preset ? preset.left : ''))}" maxlength="120">
        ${charbarHTML(b.left.code, 'wLeft')}
        <div id="sugLeft"></div>
      </label>

      <label class="field">
        <span class="lbl">${esc(rName)} <span class="req">*</span></span>
        <input type="text" id="wRight" autocomplete="off" autocapitalize="off" spellcheck="false"
               placeholder="${esc(rName)}" value="${esc(w ? w.right : (preset ? preset.right : ''))}" maxlength="120">
        ${charbarHTML(b.right.code, 'wRight')}
        <div id="sugRight"></div>
      </label>

      <label class="field">
        <span class="lbl">Kommentar</span>
        <input type="text" id="wNote" placeholder="Merkhilfe, Beispielsatz, Hinweis …" value="${esc(w ? w.note : '')}" maxlength="200">
      </label>

      <div class="field">
        <span class="lbl">Bild</span>
        <div class="img-pick">
          <img class="img-preview" id="wImgPrev" alt="" hidden>
          <div class="img-empty" id="wImgEmpty">${CAMERA}</div>
          <div>
            <button type="button" class="btn btn-soft" id="wImgPick">Bild wählen</button>
            <button type="button" class="btn btn-soft" id="wImgDrop" hidden style="margin-top:8px">Entfernen</button>
          </div>
        </div>
        <input type="file" id="wImgFile" accept="image/*" hidden>
        <p class="hint">Wird beim Üben mit angezeigt. Große Fotos werden automatisch verkleinert.</p>
      </div>

      ${w ? `<label class="check-line">
        <input type="checkbox" id="wHard"${w.hard ? ' checked' : ''}>
        <span>Als schwierig markieren</span>
      </label>` : ''}

      <div class="sheet-actions">
        ${w ? `<button class="btn btn-danger btn-icon-only" data-del-word="${w.id}">Löschen</button>` : ''}
        <button class="btn btn-primary" data-save-word="${w ? w.id : ''}">${w ? 'Sichern' : 'Eintragen'}</button>
      </div>`,
      async body => {
        body.dataset.bookId = bookId;
        if (w && w.img) {
          const data = await Img.get(w.img);
          if (data) showImgPreview(data);
        }
        // Sheet könnte inzwischen wieder geschlossen sein
        setTimeout(() => { const el = $('#wLeft'); if (el) el.focus(); }, 60);
        aiWarmup();
      });
  }

  function showImgPreview(dataUrl) {
    const prev = $('#wImgPrev'), emp = $('#wImgEmpty'), drop = $('#wImgDrop');
    if (!prev) return;
    if (dataUrl) {
      prev.src = dataUrl; prev.hidden = false;
      emp.hidden = true; drop.hidden = false;
    } else {
      prev.hidden = true; prev.removeAttribute('src');
      emp.hidden = false; drop.hidden = true;
    }
  }

  const sugBtn = (which, from, to, isAI = false) =>
    `<button type="button" class="suggest" data-fill="${which}" data-from="${esc(from)}" data-to="${esc(to)}">
       <span class="s-from">${esc(from)}</span><span class="s-arr">→</span><span class="s-to">${esc(to)}</span>${
       isAI ? '<span class="tag tag-ai">KI</span>' : ''}
     </button>`;

  let sugTimer = null, sugCtrl = null;

  function stopSuggest() {
    clearTimeout(sugTimer);
    if (sugCtrl) sugCtrl.abort();
  }

  function dropSlot(slot) {
    const list = slot.parentElement;
    slot.remove();
    if (list && !list.children.length) list.remove();
  }

  /** Vorschläge unter dem gerade getippten Feld: Wörterbuch sofort, KI kurz danach. */
  function updateSuggests(which) {
    const body = $('#sheetBody');
    const b = Store.book(body.dataset.bookId);
    if (!b) return;
    const from = which === 'left' ? b.left.code : b.right.code;
    const to = which === 'left' ? b.right.code : b.left.code;
    const box = $(which === 'left' ? '#sugLeft' : '#sugRight');
    const other = $(which === 'left' ? '#wRight' : '#wLeft');
    const q = $(which === 'left' ? '#wLeft' : '#wRight').value.trim();

    stopSuggest();
    if (!box) return;
    if (other.value.trim()) {
      box.innerHTML = '';
      return;
    }
    const hits = Dict.supports(from) && Dict.supports(to) ? Dict.lookup(q, from, to, 5) : [];
    const askAI = q.length >= 2 && aiDownloaded() && AI.supports(to);
    box.innerHTML = hits.length || askAI
      ? `<div class="suggests">${hits.map(h => sugBtn(which, h.from, h.to)).join('')}${askAI
          ? `<div class="suggest is-waiting" data-ai-slot>
               <span class="s-from">${esc(q)}</span><span class="s-arr">→</span><span class="s-to">KI überlegt …</span>
             </div>` : ''}</div>`
      : '';
    if (!askAI) return;

    // wait for a typing pause, then ask the AI; a newer keystroke aborts this
    const ctrl = sugCtrl = new AbortController();
    sugTimer = setTimeout(() => {
      AI.translateWord(q, to, ctrl.signal)
        .then(res => {
          const slot = !ctrl.signal.aborted && box.querySelector('[data-ai-slot]');
          if (!slot) return;
          if (res && !hits.some(h => h.to === res)) slot.outerHTML = sugBtn(which, q, res, true);
          else dropSlot(slot);
        })
        .catch(e => {
          if (ctrl.signal.aborted) return;
          console.warn('KI-Vorschlag fehlgeschlagen:', e);
          const slot = box.querySelector('[data-ai-slot]');
          if (slot) dropSlot(slot);
        });
    }, 450);
  }

  async function saveWord(id) {
    const body = $('#sheetBody');
    const bookId = body.dataset.bookId;
    const left = $('#wLeft').value.trim();
    const right = $('#wRight').value.trim();

    if (!left) { toast('Bitte die linke Seite ausfüllen.'); $('#wLeft').focus(); return; }
    if (!right) { toast('Bitte die rechte Seite ausfüllen.'); $('#wRight').focus(); return; }

    const note = $('#wNote').value.trim();
    const hardEl = $('#wHard');
    const old = id ? Store.word(id) : null;

    // Bild verarbeiten
    let imgId = old ? old.img : null;
    if (imgState && imgState.mode === 'set') {
      const newId = Store.uid();
      await ImgDB.put(newId, imgState.data);
      if (imgId) { await ImgDB.del(imgId).catch(() => {}); Img.forget(imgId); }
      imgId = newId;
      Img.cache.set(newId, imgState.data);
    } else if (imgState && imgState.mode === 'remove') {
      if (imgId) { await ImgDB.del(imgId).catch(() => {}); Img.forget(imgId); }
      imgId = null;
    }

    if (id) {
      Store.updateWord(id, { left, right, note, img: imgId, hard: hardEl ? hardEl.checked : old.hard });
      toast('Gesichert');
    } else {
      Store.addWord({ bookId, left, right, note, img: imgId });
      toast('Eingetragen');
    }
    Store.flush();
    imgState = null;
    closeSheet();
    refresh();
  }

  /* ═══════════════════════════════════════════════════
     Formular: Liste einfügen
     ═══════════════════════════════════════════════════ */
  function parseBulk(text) {
    return text.split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean)
      .map(line => {
        const m = line.match(/^(.*?)\s*(?:=|\t|;|\s[–—-]\s)\s*(.+)$/);
        return m ? [m[1].trim(), m[2].trim()] : null;
      })
      .filter(p => p && p[0] && p[1]);
  }

  function openBulkSheet(bookId) {
    const b = Store.book(bookId);
    openSheet('Liste einfügen', `
      <p class="hint" style="margin:0 0 14px">Eine Vokabel pro Zeile, die beiden Seiten getrennt durch <b>=</b>, <b>;</b>, einen Tabulator oder einen Bindestrich mit Leerzeichen.</p>
      <label class="field">
        <span class="lbl">${esc(langName(b.left))} = ${esc(langName(b.right))}</span>
        <textarea id="bulkText" style="min-height:190px" placeholder="la casa = das Haus&#10;el perro = der Hund&#10;la escuela = die Schule"></textarea>
      </label>
      <p class="hint" id="bulkCount">Noch nichts erkannt.</p>
      <div class="sheet-actions">
        <button class="btn btn-primary btn-block" data-save-bulk="${bookId}">Übernehmen</button>
      </div>`,
      () => setTimeout(() => { const el = $('#bulkText'); if (el) el.focus(); }, 60));
  }

  /* ═══════════════════════════════════════════════════
     Sicherung
     ═══════════════════════════════════════════════════ */
  async function exportData() {
    const withImages = $('#exportImages').checked;
    toast('Sicherung wird erstellt …');
    const json = await Store.exportJSON(withImages);
    const name = `vokabeln-${UI.todayISO()}.json`;
    const file = new File([json], name, { type: 'application/json' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Vokabel-Sicherung' }); return; }
      catch (e) { if (e && e.name === 'AbortError') return; }
    }
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast(`Sicherung erstellt (${kb(json.length)})`);
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const preview = JSON.parse(reader.result);
        const n = Array.isArray(preview.words) ? preview.words.length : 0;
        if (!confirm(`Sicherung einlesen?\n\n${n} Vokabeln werden übernommen. Alles, was jetzt auf diesem Gerät liegt, wird ersetzt.`)) return;
        const res = await Store.importJSON(reader.result);
        Img.cache.clear();
        toast(`${res.words} Vokabeln eingelesen`);
        state.bookId = null;
        switchView('books');
      } catch (e) {
        alert('Die Datei konnte nicht gelesen werden.\n\n' + e.message);
      }
    };
    reader.onerror = () => alert('Die Datei konnte nicht gelesen werden.');
    reader.readAsText(file);
  }

  /* ═══════════════════════════════════════════════════
     Ereignisse
     ═══════════════════════════════════════════════════ */
  function wire() {
    $('#tabbar').addEventListener('click', e => {
      const b = e.target.closest('.tab');
      if (!b) return;
      if (state.train && b.dataset.view !== 'train') {
        if (!confirm('Die laufende Runde beenden?')) return;
        state.train = null;
      }
      switchView(b.dataset.view);
    });

    $('#btnSettings').addEventListener('click', () => switchView('settings'));
    $('#btnBack').addEventListener('click', () => {
      if (state.view === 'settings') return switchView(state.bookId ? 'book' : 'books');
      switchView('books');
    });

    $('#fab').addEventListener('click', () => {
      if (state.view === 'book') openWordSheet(state.bookId);
      else openBookSheet();
    });

    /* Inhalte */
    $('#main').addEventListener('click', async e => {
      const speak = e.target.closest('[data-speak]');
      if (speak) {
        e.stopPropagation();
        Speech.speak(speak.dataset.speak, speak.dataset.lang);
        speak.classList.add('is-speaking');
        setTimeout(() => speak.classList.remove('is-speaking'), 900);
        return;
      }

      const book = e.target.closest('[data-book]');
      if (book) return openBook(book.dataset.book);

      const editBook = e.target.closest('[data-edit-book]');
      if (editBook) return openBookSheet(editBook.dataset.editBook);

      const bulk = e.target.closest('[data-bulk]');
      if (bulk) return openBulkSheet(bulk.dataset.bulk);

      const trainBook = e.target.closest('[data-train-book]');
      if (trainBook) {
        state.setup.bookId = trainBook.dataset.trainBook;
        state.train = null;
        return switchView('train');
      }

      const word = e.target.closest('[data-word]');
      if (word) return openWordSheet(Store.word(word.dataset.word).bookId, word.dataset.word);

      const dictAdd = e.target.closest('[data-dict-add]');
      if (dictAdd) return dictAddToBook(dictRows[+dictAdd.dataset.dictAdd]);

      /* KI und Übersetzen */
      if (e.target.closest('[data-ai-download]')) return aiStart();
      if (e.target.closest('[data-ai-retry]')) {
        aiStartCrashed = false;
        await aiCheck();
        return aiStart();
      }
      if (e.target.closest('[data-ai-remove]')) return aiRemove();
      if (e.target.closest('#btnTranslate')) return doTranslate();
      if (e.target.closest('#trSwap')) return trSwap();
      if (e.target.closest('[data-tr-copy]')) return trCopy();
      if (e.target.closest('[data-tr-add]') && tr.result) {
        return addToBook({ [tr.result.from]: tr.result.text, [tr.result.to]: tr.result.out });
      }
      const ch = e.target.closest('.charbar [data-char]');
      if (ch) return insertChar($('#' + ch.closest('[data-charbar]').dataset.charbar), ch.dataset.char);

      /* Übungsablauf */
      const choice = e.target.closest('[data-choice]');
      if (choice) return submitAnswer(choice.dataset.choice);
      if (e.target.closest('#btnCheck')) return submitAnswer($('#tAnswer').value);
      if (e.target.closest('#btnNext')) return nextItem();
      if (e.target.closest('#btnStart')) return startSession();
      if (e.target.closest('#btnAgain')) { state.train = null; return startSession(); }
      if (e.target.closest('#btnDone')) { state.train = null; return renderTrain(); }
      if (e.target.closest('#btnStop')) {
        if (state.train.i > 0 && !confirm('Runde wirklich beenden?')) return;
        return renderResult();
      }

      /* Einrichtung der Runde */
      const scope = e.target.closest('[data-scope]');
      if (scope) { state.setup.scope = scope.dataset.scope; return renderSetup(); }
      const dir = e.target.closest('[data-dir]');
      if (dir) { state.setup.dir = dir.dataset.dir; return renderSetup(); }
      const mode = e.target.closest('[data-mode]');
      if (mode) { state.setup.mode = mode.dataset.mode; return renderSetup(); }
    });

    $('#main').addEventListener('change', e => {
      if (e.target.id === 'tBook') { state.setup.bookId = e.target.value; renderSetup(); }
      if (e.target.id === 'tLimit') { state.setup.limit = +e.target.value; renderSetup(); }
      if (e.target.id === 'trFrom' || e.target.id === 'trTo') {
        Store.setSetting(e.target.id, e.target.value);
        $('#trChars').innerHTML = charbarHTML($('#trFrom').value, 'trText');
      }
    });

    $('#main').addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.id === 'tAnswer') {
        e.preventDefault();
        submitAnswer(e.target.value);
      }
    });

    /* Suche im Heft */
    $('#wordSearch').addEventListener('input', e => {
      state.wordSearch = e.target.value;
      $('#clearSearch').hidden = !e.target.value;
      renderWords();
    });
    $('#clearSearch').addEventListener('click', () => {
      $('#wordSearch').value = '';
      state.wordSearch = '';
      $('#clearSearch').hidden = true;
      renderWords();
    });
    $('#wordFilter').addEventListener('click', e => {
      const b = e.target.closest('.seg-btn');
      if (!b) return;
      state.wordFilter = b.dataset.wf;
      $$('#wordFilter .seg-btn').forEach(x => x.classList.toggle('is-active', x === b));
      renderWords();
    });

    /* Nachschlagen */
    $('#dictSearch').addEventListener('input', renderDict);
    $('#clearDict').addEventListener('click', () => {
      $('#dictSearch').value = '';
      renderDict();
    });

    /* Einstellungen */
    $('#btnExport').addEventListener('click', exportData);
    $('#btnImport').addEventListener('click', () => $('#importFile').click());
    $('#importFile').addEventListener('change', e => {
      if (e.target.files[0]) importData(e.target.files[0]);
      e.target.value = '';
    });
    $('#ttsEnabled').addEventListener('change', e => {
      Store.setSetting('tts', e.target.checked);
      toast(e.target.checked ? 'Vorlesen an' : 'Vorlesen aus');
    });
    $('#btnResetBoxes').addEventListener('click', () => {
      const n = Store.stats().total;
      if (!n) return toast('Keine Vokabeln vorhanden');
      if (!confirm(`Der Lernfortschritt aller ${n} Vokabeln wird auf Fach 1 zurückgesetzt. Die Vokabeln selbst bleiben.`)) return;
      Store.resetBoxes();
      toast('Zurückgesetzt');
      renderSettings();
    });

    /* Sheet */
    $('#sheetClose').addEventListener('click', closeSheet);
    $('#sheetBackdrop').addEventListener('click', closeSheet);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && UI.sheetIsOpen()) closeSheet();
    });

    $('#sheetBody').addEventListener('input', e => {
      if (e.target.id === 'wLeft') updateSuggests('left');
      if (e.target.id === 'wRight') updateSuggests('right');
      if (e.target.id === 'bulkText') {
        const n = parseBulk(e.target.value).length;
        $('#bulkCount').textContent = n
          ? `${plural(n, 'Vokabel', 'Vokabeln')} erkannt.`
          : 'Noch nichts erkannt.';
      }
    });

    $('#sheetBody').addEventListener('change', e => {
      if (e.target.id === 'bLeft' || e.target.id === 'bRight') syncLangLabels();
      if (e.target.id === 'wImgFile' && e.target.files[0]) pickImage(e.target.files[0]);
    });

    $('#sheetBody').addEventListener('click', async e => {
      const ch = e.target.closest('.charbar [data-char]');
      if (ch) {
        const bar = ch.closest('[data-charbar]');
        const target = $('#' + bar.dataset.charbar);
        if (target) insertChar(target, ch.dataset.char);
        return;
      }

      const fill = e.target.closest('[data-fill]');
      if (fill) {
        stopSuggest();
        const which = fill.dataset.fill;
        $(which === 'left' ? '#wLeft' : '#wRight').value = fill.dataset.from;
        $(which === 'left' ? '#wRight' : '#wLeft').value = fill.dataset.to;
        $('#sugLeft').innerHTML = '';
        $('#sugRight').innerHTML = '';
        return;
      }

      if (e.target.closest('#bSwap')) {
        const l = $('#bLeft'), r = $('#bRight');
        const ll = $('#bLeftLabel'), rl = $('#bRightLabel');
        [l.value, r.value] = [r.value, l.value];
        [ll.value, rl.value] = [rl.value, ll.value];
        syncLangLabels();
        return;
      }

      if (e.target.closest('#wImgPick')) return $('#wImgFile').click();
      if (e.target.closest('#wImgDrop')) {
        imgState = { mode: 'remove' };
        showImgPreview(null);
        return;
      }

      const saveB = e.target.closest('[data-save-book]');
      if (saveB) return saveBook(saveB.dataset.saveBook || null);

      const saveW = e.target.closest('[data-save-word]');
      if (saveW) return saveWord(saveW.dataset.saveWord || null);

      const saveBulk = e.target.closest('[data-save-bulk]');
      if (saveBulk) {
        const pairs = parseBulk($('#bulkText').value);
        if (!pairs.length) return toast('Keine Vokabeln erkannt.');
        const n = Store.addWordsBulk(saveBulk.dataset.saveBulk, pairs);
        closeSheet();
        refresh();
        toast(`${plural(n, 'Vokabel', 'Vokabeln')} übernommen`);
        return;
      }

      const delB = e.target.closest('[data-del-book]');
      if (delB) {
        const n = Store.words(delB.dataset.delBook).length;
        if (!confirm(n ? `Heft und ${plural(n, 'Vokabel', 'Vokabeln')} endgültig löschen?`
                       : 'Dieses Heft endgültig löschen?')) return;
        await Store.removeBook(delB.dataset.delBook);
        closeSheet();
        state.bookId = null;
        switchView('books');
        toast('Gelöscht');
        return;
      }

      const delW = e.target.closest('[data-del-word]');
      if (delW) {
        if (!confirm('Diese Vokabel endgültig löschen?')) return;
        await Store.removeWord(delW.dataset.delWord);
        closeSheet();
        refresh();
        toast('Gelöscht');
        return;
      }
    });

    document.addEventListener('store:error', e => toast(e.detail));
  }

  async function pickImage(file) {
    try {
      toast('Bild wird verkleinert …');
      const data = await prepareImage(file);
      imgState = { mode: 'set', data };
      showImgPreview(data);
      toast(`Bild bereit (${kb(data.length)})`);
    } catch (err) {
      alert('Das Bild konnte nicht verarbeitet werden.\n\n' + err.message);
    }
  }

  /** Wörterbuch-Treffer in ein Heft übernehmen. */
  function dictAddToBook(row) {
    addToBook({ de: row[0], en: row[1], es: row[2], fr: row[3] });
  }

  /** Wortpaar in ein Heft mit passenden Sprachen übernehmen. byCode: { Sprachcode: Text } */
  function addToBook(byCode) {
    const books = Store.books();
    if (!books.length) return toast('Lege zuerst ein Heft an.');

    const has = code => Object.hasOwn(byCode, code);
    const usable = books.filter(b => has(b.left.code) && has(b.right.code));
    if (!usable.length) return toast('Kein Heft mit passenden Sprachen.');

    openSheet('In welches Heft?', `
      <div class="suggests">
        ${usable.map(b => `<button type="button" class="suggest" data-pick-book="${b.id}">
          <span class="s-to">${esc(b.name)}</span>
          <span class="s-from">${esc(langName(b.left))} → ${esc(langName(b.right))}</span>
        </button>`).join('')}
      </div>`, body => {
      body.addEventListener('click', ev => {
        const p = ev.target.closest('[data-pick-book]');
        if (!p) return;
        const b = Store.book(p.dataset.pickBook);
        closeSheet();
        setTimeout(() => openWordSheet(b.id, null, {
          left: byCode[b.left.code],
          right: byCode[b.right.code]
        }), 220);
      });
    });
  }

  /* ── Start ──────────────────────────────────────────── */
  function init() {
    Store.load();
    Speech.init();
    wire();
    switchView('books');
    Store.cleanImages().catch(() => {});

    try {
      aiStartCrashed = !!localStorage.getItem(AI_START_KEY);
      localStorage.removeItem(AI_START_KEY);
    } catch (e) {}
    aiCheck();

    if ('serviceWorker' in navigator) {
      // a new version took over – reload once so it shows right away,
      // but not in the middle of something
      const hadController = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadController || UI.sheetIsOpen() || state.train || AI.isLoading() || tr.busy) return;
        location.reload();
      });
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(err =>
          console.warn('Service Worker nicht registriert:', err));
      });
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
