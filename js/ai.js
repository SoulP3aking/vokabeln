/* ═══════════════════════════════════════════════════════
   ai.js · Übersetzer-KI (Hy-MT2-1.8B von Tencent)
   Läuft komplett im Browser über wllama (llama.cpp als
   WebAssembly). Das Modell (~1,1 GB) wird einmalig von
   Hugging Face geladen und danach vom Gerät gelesen.
   Die Bibliothek wird erst bei Bedarf nachgeladen.
   ═══════════════════════════════════════════════════════ */

const AI = (() => {
  const MODEL_URL = 'https://huggingface.co/tencent/Hy-MT2-1.8B-GGUF/resolve/main/Hy-MT2-1.8B-Q4_K_M.gguf';
  const MODEL_MB = 1133;
  const BASE = new URL('js/vendor/wllama/', document.baseURI).href;

  /* App-Sprachcode → Sprachname, wie ihn das Modell im Auftrag erwartet */
  const NAMES = {
    de: 'German', en: 'English', es: 'Spanish', fr: 'French', it: 'Italian',
    pt: 'Portuguese', nl: 'Dutch', tr: 'Turkish', pl: 'Polish', ru: 'Russian'
  };
  const supports = code => Object.hasOwn(NAMES, code);

  /* Empfohlene Werte aus der Modellbeschreibung */
  const SAMPLING = { top_p: 0.6, top_k: 20, penalty_repeat: 1.05 };

  let instP = null;        // Promise auf die wllama-Instanz
  let wllama = null;       // dieselbe Instanz, sobald sie steht
  let loading = null;
  let onProgress = null;
  // the model handles one request at a time, so requests wait in line
  let queue = Promise.resolve();

  /* Safari lacks JSPI or Memory64 and needs the slower compat build
     (same test as wllama; Firefox is excluded there as well) */
  function needsCompat() {
    if (/Firefox\//.test(navigator.userAgent)) return false;
    if (!WebAssembly.Suspending) return true;
    try {
      new WebAssembly.Memory({ address: 'i64', initial: BigInt(1) });
      return false;
    } catch (e) {
      return true;
    }
  }

  /* Fetched here on the page, so it comes from the offline cache –
     the wllama worker might not go through the service worker. */
  async function fetchOk(path) {
    const res = await fetch(BASE + path);
    if (!res.ok) throw new Error('KI-Dateien konnten nicht geladen werden.');
    return res;
  }
  const blobURL = async path => URL.createObjectURL(await (await fetchOk(path)).blob());

  function instance() {
    instP ||= (async () => {
      const { Wllama, LoggerWithoutDebug } = await import(BASE + 'index.js');
      const compat = needsCompat();
      const w = new Wllama(
        { default: compat ? BASE + 'wllama.wasm' : await blobURL('wllama.wasm') },
        { logger: LoggerWithoutDebug, allowOffline: true }
      );
      if (compat) {
        w.setCompat({
          wasm: await blobURL('compat/wllama.wasm'),
          worker: { code: await (await fetchOk('compat/wllama.js')).text() }
        });
      }
      return (wllama = w);
    })().catch(e => { instP = null; throw e; });
    return instP;
  }

  /** Instanz wegwerfen, damit der nächste Aufruf frisch startet. */
  async function reset() {
    const w = wllama;
    instP = null;
    wllama = null;
    if (w) await w.exit().catch(() => {});
  }

  const isReady = () => !!(wllama && wllama.isModelLoaded());
  const isLoading = () => !!loading;

  /* Only reads the on-device storage – no need to start the big wasm for that */
  async function modelManager() {
    const { ModelManager } = await import(BASE + 'index.js');
    return new ModelManager();
  }

  /** Liegt das Modell vollständig auf dem Gerät? */
  async function isDownloaded() {
    const models = await (await modelManager()).getModels();
    return models.some(m => m.url === MODEL_URL);
  }

  /** Modell laden, beim ersten Mal herunterladen. progress(anteil 0–1) */
  function load(progress) {
    if (progress) onProgress = progress;
    if (isReady()) return Promise.resolve();
    if (!loading) {
      loading = (async () => {
        const w = await instance();
        try {
          await w.loadModelFromUrl(MODEL_URL, {
            n_ctx: 2048,
            progressCallback: ({ loaded, total }) => {
              if (onProgress && total) onProgress(loaded / total);
            }
          });
        } catch (e) {
          // a failed load can leave the worker unusable
          await reset();
          throw e;
        }
      })().finally(() => { loading = null; });
    }
    return loading;
  }

  /** Modell vom Gerät löschen. */
  async function remove() {
    await reset();
    await (await modelManager()).clear();
  }

  function run(prompt, maxTokens, temperature, signal) {
    const job = queue.then(async () => {
      if (signal && signal.aborted) throw new DOMException('Abgebrochen', 'AbortError');
      await load();
      const res = await wllama.createChatCompletion({
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature,
        abortSignal: signal,
        ...SAMPLING
      });
      return (res.choices[0].message.content || '').trim();
    });
    queue = job.catch(() => {});
    return job;
  }

  const prompt = (text, to) => `Translate the following text into ${NAMES[to]}. ` +
    `Note that you should only output the translated result without any additional explanation:\n\n${text}`;

  /** Text in die Zielsprache übersetzen. */
  function translate(text, to, signal) {
    if (!supports(to)) return Promise.reject(new Error('Diese Sprache kann die KI nicht.'));
    return run(prompt(text, to), 1024, 0.7, signal);
  }

  /** Einzelnes Wort – ohne Zufall, damit derselbe Vorschlag kommt. */
  async function translateWord(word, to, signal) {
    if (!supports(to)) throw new Error('Diese Sprache kann die KI nicht.');
    let out = await run(prompt(word, to), 32, 0, signal);
    if (!/[.!?]$/.test(word)) out = out.replace(/\.$/, '');
    // the model writes single words like sentences ("La casa") – vocab is lowercase,
    // except German nouns and the English "I"
    if (to === 'de' || (to === 'en' && /^I\b/.test(out))) return out;
    return out.charAt(0).toLowerCase() + out.slice(1);
  }

  return { MODEL_MB, supports, isReady, isLoading, isDownloaded, load, remove, translate, translateWord };
})();
