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
  const SAMPLING = { temperature: 0.7, top_p: 0.6, top_k: 20, penalty_repeat: 1.05 };

  let wllama = null;
  let loading = null;
  let onProgress = null;
  // the model handles one request at a time, so requests wait in line
  let queue = Promise.resolve();

  async function instance() {
    if (wllama) return wllama;
    const { Wllama, LoggerWithoutDebug } = await import(BASE + 'index.js');
    wllama = new Wllama({ default: BASE + 'wllama.wasm' }, { logger: LoggerWithoutDebug, allowOffline: true });
    // Safari lacks JSPI/Memory64 and needs this slower build
    wllama.setCompat({ wasm: BASE + 'compat/wllama.wasm', worker: BASE + 'compat/wllama.js' });
    return wllama;
  }

  const isReady = () => !!(wllama && wllama.isModelLoaded());

  /** Liegt das Modell schon auf dem Gerät? */
  async function isDownloaded() {
    const w = await instance();
    const models = await w.modelManager.getModels();
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
          // a failed load can leave the worker unusable – start fresh next time
          await w.exit().catch(() => {});
          wllama = null;
          throw e;
        }
      })().finally(() => { loading = null; });
    }
    return loading;
  }

  /** Modell vom Gerät löschen. */
  async function remove() {
    const w = await instance();
    if (w.isModelLoaded()) await w.exit().catch(() => {});
    wllama = null;
    const fresh = await instance();
    await fresh.modelManager.clear();
  }

  function run(prompt, maxTokens, signal) {
    const job = queue.then(async () => {
      if (signal && signal.aborted) throw new DOMException('Abgebrochen', 'AbortError');
      await load();
      const res = await wllama.createChatCompletion({
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        abortSignal: signal,
        ...SAMPLING
      });
      return (res.choices[0].message.content || '').trim();
    });
    queue = job.catch(() => {});
    return job;
  }

  /** Text in die Zielsprache übersetzen. */
  function translate(text, to, signal) {
    if (!supports(to)) return Promise.reject(new Error('Diese Sprache kann die KI nicht.'));
    const prompt = `Translate the following text into ${NAMES[to]}. ` +
      `Note that you should only output the translated result without any additional explanation:\n\n${text}`;
    return run(prompt, 1024, signal);
  }

  /** Ein einzelnes Wort übersetzen – Nomen mit Artikel, wie im Heft. */
  function translateWord(word, to, signal) {
    if (!supports(to)) return Promise.reject(new Error('Diese Sprache kann die KI nicht.'));
    const prompt = `[Source Text]\n${word}\n\n[Translation Tasks]\n` +
      `1. If the word is a noun, include its definite article.\n` +
      `2. Translate the [Source Text] into ${NAMES[to]}. Only output the translation.`;
    return run(prompt, 32, signal);
  }

  return { MODEL_MB, supports, isReady, isDownloaded, load, remove, translate, translateWord, instance };
})();
