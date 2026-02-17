/**
 * Local LLM Chat v2.1
 * ====================
 * OpenAI互換API向けチャットUI（モダンUI版）
 *
 * v1.7.3 の全機能を維持しつつ、UIを刷新したフルスクラッチ再構築版。
 *
 * API:
 *   - GET  {baseUrl}/models
 *   - POST {baseUrl}/chat/completions  (SSE stream)
 *   - POST {baseUrl}/responses  (Open Responses API - logprobs)
 *   - GET  /api/v1/models  (LM Studio v1 API)
 *   - POST /api/v1/models/load
 *   - POST /api/v1/models/unload
 *
 * localStorage:
 *   - localLLMChat_history
 *   - localLLMChat_settings
 *   - localLLMChat_presets
 *   - localLLMChat_presetLabels
 *   - localLLMChat_draft
 *   - localLLMChat_systemPromptPresets
 */
(() => {
  "use strict";

  // ===================================================================
  // Section 1: 型定義・定数
  // ===================================================================

  /** @typedef {"user"|"assistant"|"system"} Role */
  /**
   * @typedef {Object} StoredMessage
   * @property {Role} role
   * @property {string} content
   * @property {string=} imageData
   */
  /**
   * @typedef {Object} Settings
   * @property {string} baseUrl
   * @property {string} apiKey
   * @property {string=} model
   * @property {number} temperature
   * @property {number} maxTokens
   * @property {string} systemPrompt
   * @property {"concise"|"standard"|"detailed"|"professional"} responseStyle
   * @property {"enter"|"ctrl-enter"} sendKey
   * @property {string=} userLevel
   * @property {string=} userProfession
   * @property {string=} userInterests
   * @property {boolean} darkMode
   * @property {boolean} showLogprobs
   * @property {boolean} autoUnload
   */

  const STORAGE_KEYS = Object.freeze({
    HISTORY: "localLLMChat_history",
    SETTINGS: "localLLMChat_settings",
    PRESETS: "localLLMChat_presets",
    DRAFT: "localLLMChat_draft",
    PRESET_LABELS: "localLLMChat_presetLabels",
    SYSTEM_PROMPT_PRESETS: "localLLMChat_systemPromptPresets",
    MODEL_FILTER: "localLLMChat_modelFilter",
  });

  const LEGACY_STORAGE_KEYS = Object.freeze({
    HISTORY: "chatHistory_v1.6",
    SETTINGS: "chatSettings_v1.6",
    PRESETS: "chatPresets_v1.6",
    DRAFT: "chatDraft_v1.6",
    PRESET_LABELS: "chatPresetLabels_v1.6",
  });

  const LIMITS = Object.freeze({
    IMAGE_MAX_SIZE: 20 * 1024 * 1024,    // 20MB
    TEXT_MAX_SIZE: 2 * 1024 * 1024,       // 2MB
    PDF_MAX_SIZE: 10 * 1024 * 1024,       // 10MB
    IMPORT_MAX_SIZE: 10 * 1024 * 1024,    // 10MB
  });

  const MAX_HISTORY_FOR_API = 6;
  const DRAFT_SAVE_DELAY = 300;
  const MODEL_REFRESH_THROTTLE = 3000;

  const VISION_KEYWORDS = Object.freeze([
    "vision", "llava", "qwen-vl", "qwen2-vl", "qwen3-vl", "pixtral",
    "devstral", "magistral", "gemma-3", "bakllava", "obsidian", "moondream",
    "minicpm-v", "cogvlm", "glm-4v", "internlm-xcomposer", "internvl",
    "yi-vl", "phi-3-vision", "llama-3-vision", "mllama",
  ]);

  const EMBEDDING_KEYWORDS = Object.freeze([
    "embed", "embedding", "bge", "e5-", "gte-", "jina",
  ]);

  const TEXT_FILE_EXTENSIONS = Object.freeze([
    ".txt", ".md", ".json", ".csv", ".xml", ".html", ".css", ".js", ".ts",
    ".py", ".java", ".c", ".cpp", ".h", ".hpp", ".sh", ".yaml", ".yml", ".log",
  ]);

  const DEFAULT_SYSTEM_PROMPT = `あなたは放射線画像診断、技術、研究のエキスパートアシスタントです。日本語で簡潔でバランスの取れたアドバイスを提供してください。フォーマルとカジュアルのバランスを保ち、専門用語は英語（日本語）の形式で表記してください。
応答の生成の前に、まず質問内容を確認し、医学用語についてユーザの入力に不備があれば、ユーザに確認してください。`;

  const STANDARD_SYSTEM_PROMPT = `あなたは優秀な汎用AIアシスタントです。ユーザーの質問や依頼に対して、正確で分かりやすい回答を日本語で提供してください。
回答は簡潔かつ要点を押さえた内容にし、必要に応じて箇条書きや見出しを使って整理してください。
不明な点がある場合は、推測せずにユーザーに確認してください。`;

  /** ビルトインSystem Promptプリセット */
  const BUILTIN_SYSTEM_PROMPTS = Object.freeze({
    "__default__": { label: "📌 デフォルト（放射線診断エキスパート）", prompt: DEFAULT_SYSTEM_PROMPT },
    "__standard__": { label: "🔵 標準（汎用アシスタント）", prompt: STANDARD_SYSTEM_PROMPT },
  });

  const DEFAULT_SETTINGS = Object.freeze({
    baseUrl: "http://localhost:1234/v1",
    apiKey: "lmstudio",
    temperature: 0.7,
    maxTokens: 2048,
    responseStyle: "standard",
    sendKey: "enter",
    darkMode: false,
    showLogprobs: false,
    autoUnload: false,
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    userLevel: "",
    userProfession: "",
    userInterests: "",
    model: "",
  });

  /** デフォルトプリセット（6種） */
  const DEFAULT_PRESETS = Object.freeze({
    disease: "以下の疾患について、放射線科医向けに包括的に解説してください。\n\n疾患名: [ここに疾患名を入力]\n\n以下の項目を含めてください：\n1. 疫学（有病率、好発年齢・性別）\n2. 病態生理\n3. 臨床所見・症状\n4. 診断基準\n5. 画像所見（CT, MRI, X線など）\n6. 鑑別診断\n7. 治療\n8. 予後",
    ddx: "以下の画像所見・臨床情報から鑑別診断を挙げてください。\n\n所見: [ここに所見を入力]\n\n以下の形式で回答してください：\n- Top 3 鑑別診断（それぞれ信頼度%付き）\n- 各診断の根拠\n- ダークホース診断 1つ（見落としやすいが重要なもの）",
    review: "以下の論文を査読してください。\n\n論文タイトル: [タイトル]\n\n以下の形式で回答してください：\n\n**Strengths（3点）:**\n1.\n2.\n3.\n\n**Weaknesses（3点）:**\n1.\n2.\n3.\n\n**評価（各5段階）:**\n- Novelty:\n- Clinical significance:\n- Methodology:\n- Statistics:\n- Reproducibility:\n\n**Verdict:** Accept / Minor Revision / Major Revision / Reject",
    stats: "以下のデータ・研究デザインに対して、適切な統計解析手法を推奨してください。\n\nデータの説明: [ここにデータの説明を入力]\n\n以下を含めてください：\n- 推奨する統計検定\n- その検定を選んだ理由\n- 前提条件の確認方法\n- サンプルサイズの考慮",
    email: "以下の内容で英文メールを作成してください。\n\n目的: [メールの目的]\n相手: [相手の役職・関係性]\n内容: [伝えたい内容]\n\n以下の形式で回答してください：\n- Subject: （件名を3パターン）\n- Body: （本文）",
    pdf: "以下の文章を要約してください。\n\n[ここに文章を貼り付け]\n\n以下の形式で回答してください：\n- 箇条書きで主要ポイント（5-7点）\n- 一文での要約",
  });

  const DEFAULT_PRESET_LABELS = Object.freeze({
    disease: "🏥 疾患解説",
    ddx: "💊 鑑別診断",
    review: "📝 論文査読",
    stats: "📈 統計解析",
    email: "✉️ 英文メール作成",
    pdf: "📄 文章要約",
  });

  // ===================================================================
  // Section 2: 状態管理
  // ===================================================================

  const state = {
    messages: [],
    settings: { ...DEFAULT_SETTINGS },
    customPresets: {},
    customPresetLabels: {},
    systemPromptPresets: {},
    modelFilter: [],
    attachments: [],
    deepDiveMode: false,
    compareMode: false,
    helpMode: false,
    isStreaming: false,
    userScrolledDuringStream: false,
  };

  const runtime = {
    controller: null,
    availableModels: new Set(),
    modelDetails: new Map(),
    lmstudioV1Available: false,
    lastModelRefresh: 0,
    draftTimer: null,
  };

  // ===================================================================
  // Section 3: DOM参照
  // ===================================================================

  let el = {};

  function cacheDomRefs() {
    el = {
      // Header
      modelSelect:        document.getElementById("modelSelect"),
      compareModelSelect: document.getElementById("compareModelSelect"),
      compareRow:         document.getElementById("compareRow"),
      newTopicBtn:        document.getElementById("newTopicBtn"),
      clearBtn:           document.getElementById("clearBtn"),
      moreBtn:            document.getElementById("moreBtn"),
      moreMenu:           document.getElementById("moreMenu"),
      settingsBtn:        document.getElementById("settingsBtn"),
      exportBtn:          document.getElementById("exportBtn"),
      importBtn:          document.getElementById("importBtn"),
      importInput:        document.getElementById("importInput"),
      compareBtn:         document.getElementById("compareBtn"),
      helpBtn:            document.getElementById("helpBtn"),

      // Chat
      chat:               document.getElementById("chat"),

      // Input
      inputCard:          document.getElementById("inputCard"),
      prompt:             document.getElementById("prompt"),
      send:               document.getElementById("send"),
      attachBtn:          document.getElementById("attachBtn"),
      attachMenu:         document.getElementById("attachMenu"),
      attachImageBtn:     document.getElementById("attachImageBtn"),
      attachFileBtn:      document.getElementById("attachFileBtn"),
      imageInput:         document.getElementById("imageInput"),
      fileInput:          document.getElementById("fileInput"),
      attachmentList:     document.getElementById("attachmentList"),
      deepDiveBtn:        document.getElementById("deepDiveBtn"),
      presetBtn:          document.getElementById("presetBtn"),
      stopBtn:            document.getElementById("stopBtn"),

      // Settings
      settingsPanel:      document.getElementById("settingsPanel"),
      settingsOverlay:    document.getElementById("settingsOverlay"),
      closeSettingsBtn:   document.getElementById("closeSettingsBtn"),
      darkModeToggle:     document.getElementById("darkModeToggle"),
      showLogprobsToggle: document.getElementById("showLogprobsToggle"),
      autoUnloadToggle:   document.getElementById("autoUnloadToggle"),
      baseUrl:            document.getElementById("baseUrl"),
      apiKey:             document.getElementById("apiKey"),
      temperature:        document.getElementById("temperature"),
      tempValue:          document.getElementById("tempValue"),
      maxTokens:          document.getElementById("maxTokens"),
      sendKey:            document.getElementById("sendKey"),
      responseStyle:      document.getElementById("responseStyle"),
      userLevel:          document.getElementById("userLevel"),
      userProfession:     document.getElementById("userProfession"),
      userInterests:      document.getElementById("userInterests"),
      systemPrompt:       document.getElementById("systemPrompt"),
      systemPromptPresetSelect: document.getElementById("systemPromptPresetSelect"),
      saveSystemPromptPresetBtn: document.getElementById("saveSystemPromptPresetBtn"),
      deleteSystemPromptPresetBtn: document.getElementById("deleteSystemPromptPresetBtn"),
      presetEditSelect:   document.getElementById("presetEditSelect"),
      newPresetName:      document.getElementById("newPresetName"),
      addPresetBtn:       document.getElementById("addPresetBtn"),
      presetEditText:     document.getElementById("presetEditText"),
      savePresetBtn:      document.getElementById("savePresetBtn"),
      resetPresetBtn:     document.getElementById("resetPresetBtn"),
      deletePresetBtn:    document.getElementById("deletePresetBtn"),
      resetAllPresetsBtn: document.getElementById("resetAllPresetsBtn"),
      resetSettingsBtn:   document.getElementById("resetSettingsBtn"),
      clearAllDataBtn:    document.getElementById("clearAllDataBtn"),
      fetchModelsForFilterBtn: document.getElementById("fetchModelsForFilterBtn"),
      selectAllModelsBtn: document.getElementById("selectAllModelsBtn"),
      deselectAllModelsBtn: document.getElementById("deselectAllModelsBtn"),
      modelFilterList:    document.getElementById("modelFilterList"),

      // Presets
      presetPanel:        document.getElementById("presetPanel"),
      presetList:         document.getElementById("presetList"),
      closePresetBtn:     document.getElementById("closePresetBtn"),

      // Term Check Modal
      termCheckModal:     document.getElementById("termCheckModal"),
      termCheckContent:   document.getElementById("termCheckContent"),
      termCheckCorrected: document.getElementById("termCheckCorrected"),
      termCheckCorrectedText: document.getElementById("termCheckCorrectedText"),
      termCheckCancel:    document.getElementById("termCheckCancel"),
      termCheckAsIs:      document.getElementById("termCheckAsIs"),
      termCheckApply:     document.getElementById("termCheckApply"),
      termCheckClose:     document.getElementById("termCheckClose"),
    };
  }

  // ===================================================================
  // Section 4: ユーティリティ
  // ===================================================================

  function debounce(fn, delay) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  function throttle(fn, limit) {
    let last = 0;
    return (...args) => {
      const now = Date.now();
      if (now - last >= limit) {
        last = now;
        fn(...args);
      }
    };
  }

  function trimTrailingSlashes(raw) {
    return String(raw || "").replace(/\/+$/, "");
  }

  function getApiBaseUrl() {
    const base = trimTrailingSlashes(state.settings.baseUrl || el.baseUrl?.value?.trim());
    return base.replace(/\/v1$/, "");
  }

  function isVisionModel(modelId) {
    const lower = String(modelId).toLowerCase();
    return VISION_KEYWORDS.some(k => lower.includes(k));
  }

  function isLikelyServerOffline(err) {
    if (!err) return false;
    const msg = String(err);
    return err.name === "TypeError" || msg.includes("Failed to fetch") || msg.includes("NetworkError");
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ===================================================================
  // Section 5: localStorage操作
  // ===================================================================

  function migrateStorageKeys() {
    const pairs = [
      [LEGACY_STORAGE_KEYS.HISTORY, STORAGE_KEYS.HISTORY],
      [LEGACY_STORAGE_KEYS.SETTINGS, STORAGE_KEYS.SETTINGS],
      [LEGACY_STORAGE_KEYS.PRESETS, STORAGE_KEYS.PRESETS],
      [LEGACY_STORAGE_KEYS.DRAFT, STORAGE_KEYS.DRAFT],
      [LEGACY_STORAGE_KEYS.PRESET_LABELS, STORAGE_KEYS.PRESET_LABELS],
    ];
    for (const [oldKey, newKey] of pairs) {
      const oldData = localStorage.getItem(oldKey);
      if (oldData && !localStorage.getItem(newKey)) {
        localStorage.setItem(newKey, oldData);
      }
      if (oldData && localStorage.getItem(newKey)) {
        localStorage.removeItem(oldKey);
      }
    }
  }

  function loadHistory() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.HISTORY);
      state.messages = raw ? JSON.parse(raw) : [];
    } catch { state.messages = []; }
  }

  /**
   * 履歴保存前に連続同ロールを除去する（後のものを優先）
   */
  function sanitizeMessages() {
    const cleaned = [];
    for (const m of state.messages) {
      if (cleaned.length > 0 && cleaned[cleaned.length - 1].role === m.role) {
        cleaned[cleaned.length - 1] = m;
      } else {
        cleaned.push(m);
      }
    }
    state.messages = cleaned;
  }

  function persistHistory() {
    sanitizeMessages();
    localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(state.messages));
  }

  function loadDraft() {
    const d = localStorage.getItem(STORAGE_KEYS.DRAFT);
    if (d && el.prompt) el.prompt.value = d;
  }

  function persistDraft() {
    localStorage.setItem(STORAGE_KEYS.DRAFT, el.prompt?.value || "");
  }

  function clearDraft() {
    localStorage.removeItem(STORAGE_KEYS.DRAFT);
  }

  function scheduleDraftSave() {
    clearTimeout(runtime.draftTimer);
    runtime.draftTimer = setTimeout(persistDraft, DRAFT_SAVE_DELAY);
  }

  // ===================================================================
  // Section 6: 設定管理
  // ===================================================================

  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (raw) Object.assign(state.settings, JSON.parse(raw));
    } catch { /* use defaults */ }
  }

  function saveSettings() {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(state.settings));
  }

  function loadCustomPresets() {
    try {
      const p = localStorage.getItem(STORAGE_KEYS.PRESETS);
      if (p) state.customPresets = JSON.parse(p);
      const l = localStorage.getItem(STORAGE_KEYS.PRESET_LABELS);
      if (l) state.customPresetLabels = JSON.parse(l);
    } catch { /* use defaults */ }
  }

  function persistCustomPresets() {
    localStorage.setItem(STORAGE_KEYS.PRESETS, JSON.stringify(state.customPresets));
    localStorage.setItem(STORAGE_KEYS.PRESET_LABELS, JSON.stringify(state.customPresetLabels));
  }

  function loadSystemPromptPresets() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.SYSTEM_PROMPT_PRESETS);
      if (raw) state.systemPromptPresets = JSON.parse(raw);
    } catch { /* use defaults */ }
  }

  function saveSystemPromptPresets() {
    localStorage.setItem(STORAGE_KEYS.SYSTEM_PROMPT_PRESETS, JSON.stringify(state.systemPromptPresets));
  }

  function loadModelFilter() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.MODEL_FILTER);
      if (raw) state.modelFilter = JSON.parse(raw);
    } catch { state.modelFilter = []; }
  }

  function saveModelFilter() {
    localStorage.setItem(STORAGE_KEYS.MODEL_FILTER, JSON.stringify(state.modelFilter));
  }

  // ===================================================================
  // Section 7: テーマ（ダークモード）
  // ===================================================================

  function applyDarkMode(isOn) {
    document.body.classList.toggle("dark-mode", isOn);
    state.settings.darkMode = isOn;
    const toggle = el.darkModeToggle;
    if (toggle) toggle.classList.toggle("active", isOn);
  }

  // ===================================================================
  // Section 8: Markdown設定
  // ===================================================================

  function setupMarkdown() {
    if (typeof marked === "undefined") return;
    marked.setOptions({ breaks: true, gfm: true });
    const renderer = new marked.Renderer();
    const origLink = renderer.link;
    renderer.link = function(href, title, text) {
      if (href && href.startsWith("javascript:")) return text;
      return `<a href="${href}" target="_blank" rel="noopener noreferrer"${
        title ? ` title="${title}"` : ""
      }>${text}</a>`;
    };
    renderer.code = function(code, language) {
      const lang = (language || "").split(/\s/)[0];
      const escaped = escapeHtml(typeof code === "object" ? code.text || "" : code);
      const langLabel = lang || "code";
      return `<pre><div class="code-header"><span class="code-header__lang">${escapeHtml(langLabel)}</span><button class="code-header__copy" onclick="navigator.clipboard.writeText(this.closest('pre').querySelector('code').textContent).then(()=>{this.textContent='Copied!';setTimeout(()=>{this.textContent='Copy'},1500)})">Copy</button></div><code class="language-${escapeHtml(lang)}">${escaped}</code></pre>`;
    };
    // breaks:true により改行が<br>に変換されるが、テーブルセル内では不要なため除去
    renderer.tablecell = function(token) {
      const content = this.parser.parseInline(token.tokens);
      const tag = token.header ? "th" : "td";
      const alignAttr = token.align ? ` align="${token.align}"` : "";
      return `<${tag}${alignAttr}>${content.replace(/<br>/g, "")}</${tag}>\n`;
    };
    marked.use({ renderer });
  }

  /**
   * renderMarkdown(text)
   * 数式（$...$, $$...$$, \(...\), \[...\]）をKaTeXでレンダリングし、残りをmarked.jsで処理する。
   * 手順: 1) 数式をプレースホルダに退避  2) marked.parse()  3) プレースホルダをKaTeX HTMLに置換
   */
  function renderMarkdown(text) {
    if (typeof marked === "undefined") return escapeHtml(text);

    // KaTeXが未読み込みの場合はmarked.parseのみ
    if (typeof katex === "undefined") return marked.parse(text);

    const placeholders = [];
    let idx = 0;

    // ブロック数式: $$...$$ （改行対応）
    let processed = text.replace(/\$\$([\s\S]+?)\$\$/g, function(match, expr) {
      const id = "\x00MATH_BLOCK_" + (idx++) + "\x00";
      placeholders.push({ id, expr: expr.trim(), displayMode: true });
      return id;
    });

    // ブロック数式: \[...\] （改行対応）
    processed = processed.replace(/\\\[([\s\S]+?)\\\]/g, function(match, expr) {
      const id = "\x00MATH_BLOCK_" + (idx++) + "\x00";
      placeholders.push({ id, expr: expr.trim(), displayMode: true });
      return id;
    });

    // インライン数式: \(...\)
    processed = processed.replace(/\\\(([\s\S]+?)\\\)/g, function(match, expr) {
      const id = "\x00MATH_INLINE_" + (idx++) + "\x00";
      placeholders.push({ id, expr: expr.trim(), displayMode: false });
      return id;
    });

    // インライン数式: $...$ （ただし $$, \$, 行頭$数字 を除外）
    processed = processed.replace(/(?<!\$)\$(?!\$)(?!\s)((?:[^$\\]|\\.)+?)(?<!\s)\$/g, function(match, expr) {
      const id = "\x00MATH_INLINE_" + (idx++) + "\x00";
      placeholders.push({ id, expr: expr.trim(), displayMode: false });
      return id;
    });

    // marked.jsでMarkdown処理
    let html = marked.parse(processed);

    // プレースホルダをKaTeX HTMLに置換
    for (const ph of placeholders) {
      try {
        const rendered = katex.renderToString(ph.expr, {
          displayMode: ph.displayMode,
          throwOnError: false,
          output: "html",
        });
        html = html.replace(ph.id, rendered);
      } catch (e) {
        // KaTeXエラー時は元の数式をそのまま表示
        const fallback = ph.displayMode
          ? '<div class="math-error">$$' + escapeHtml(ph.expr) + '$$</div>'
          : '<span class="math-error">$' + escapeHtml(ph.expr) + '$</span>';
        html = html.replace(ph.id, fallback);
      }
    }

    return html;
  }

  // ===================================================================
  // Section 9: LM Studio v1 API
  // ===================================================================

  const LMSTUDIO_V1_API = Object.freeze({
    MODELS: "/api/v1/models",
    LOAD: "/api/v1/models/load",
    UNLOAD: "/api/v1/models/unload",
  });

  const MODEL_STATE = Object.freeze({
    LOADED: "loaded",
    NOT_LOADED: "not-loaded",
  });

  async function checkLmstudioV1Api() {
    const apiBase = getApiBaseUrl();
    const key = state.settings.apiKey || "lmstudio";
    try {
      const res = await fetch(`${apiBase}${LMSTUDIO_V1_API.MODELS}`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async function fetchAllModelsV1() {
    const apiBase = getApiBaseUrl();
    const key = state.settings.apiKey || "lmstudio";
    const res = await fetch(`${apiBase}${LMSTUDIO_V1_API.MODELS}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const data = await res.json();
    const rawModels = data.models || data.data || [];
    return rawModels.map(m => ({
      id: m.key || m.id,
      state: (m.loaded_instances && m.loaded_instances.length > 0) ? MODEL_STATE.LOADED : MODEL_STATE.NOT_LOADED,
      quantization: m.quantization?.name || m.quantization || null,
      max_context_length: m.max_context_length || null,
    }));
  }

  async function loadModelV1(modelId) {
    const apiBase = getApiBaseUrl();
    const key = state.settings.apiKey || "lmstudio";
    try {
      const res = await fetch(`${apiBase}${LMSTUDIO_V1_API.LOAD}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: modelId }),
      });
      if (!res.ok) throw new Error(`Load failed: ${res.status}`);
      return true;
    } catch (err) {
      console.error("[Model Load Error]", err);
      throw err;
    }
  }

  async function unloadModelV1(modelId) {
    const apiBase = getApiBaseUrl();
    const key = state.settings.apiKey || "lmstudio";
    try {
      const res = await fetch(`${apiBase}${LMSTUDIO_V1_API.UNLOAD}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ instance_id: modelId }),
      });
      if (!res.ok) { console.warn(`[Unload] Failed: ${res.status}`); return false; }
      return true;
    } catch (err) {
      console.warn("[Unload Error]", err);
      return false;
    }
  }

  // ===================================================================
  // Section 10: モデル管理
  // ===================================================================

  function buildModelDropdown(selectEl, list) {
    selectEl.innerHTML = "";
    list.forEach(id => {
      const opt = document.createElement("option");
      opt.value = id;
      const displayName = id.replace(/^.*\//, "");
      const details = runtime.modelDetails.get(id);
      let label = "";
      if (runtime.lmstudioV1Available && details) {
        label += details.state === MODEL_STATE.LOADED ? "🟢 " : "⏸️ ";
      }
      label += displayName;
      if (isVisionModel(id)) label += " 👁️";
      if (details?.quantization) label += ` (${details.quantization})`;
      opt.textContent = label;
      selectEl.appendChild(opt);
    });
  }

  function renderModelFilterList(allModelIds) {
    const container = el.modelFilterList;
    if (!container) return;
    container.innerHTML = "";
    if (allModelIds.length === 0) {
      container.innerHTML = '<p class="model-filter-list__empty">モデルが見つかりません</p>';
      return;
    }
    const hasFilter = state.modelFilter.length > 0;
    allModelIds.forEach(id => {
      const item = document.createElement("label");
      item.className = "model-filter-list__item";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = !hasFilter || state.modelFilter.includes(id);
      cb.addEventListener("change", () => {
        updateModelFilterFromUI(container);
      });
      const span = document.createElement("span");
      const displayName = id.replace(/^.*\//, "");
      let text = displayName;
      if (isVisionModel(id)) text += " 👁️";
      const details = runtime.modelDetails.get(id);
      if (details?.quantization) text += ` (${details.quantization})`;
      span.textContent = text;
      span.title = id;
      item.appendChild(cb);
      item.appendChild(span);
      item.dataset.modelId = id;
      container.appendChild(item);
    });
  }

  function updateModelFilterFromUI(container) {
    const items = container.querySelectorAll(".model-filter-list__item");
    const checked = [];
    let allChecked = true;
    items.forEach(item => {
      const cb = item.querySelector("input[type=checkbox]");
      if (cb.checked) {
        checked.push(item.dataset.modelId);
      } else {
        allChecked = false;
      }
    });
    state.modelFilter = allChecked ? [] : checked;
    saveModelFilter();
    refreshModels();
  }

  async function refreshModels() {
    runtime.availableModels.clear();
    runtime.modelDetails.clear();

    const base = trimTrailingSlashes(state.settings.baseUrl || "http://localhost:1234/v1");
    const key = state.settings.apiKey || "lmstudio";

    el.modelSelect.innerHTML = "<option>Loading...</option>";

    try {
      runtime.lmstudioV1Available = await checkLmstudioV1Api();
      let list = [];

      if (runtime.lmstudioV1Available) {
        const allModels = await fetchAllModelsV1();
        for (const model of allModels) {
          const lower = String(model.id).toLowerCase();
          if (EMBEDDING_KEYWORDS.some(k => lower.includes(k))) continue;
          list.push(model.id);
          runtime.modelDetails.set(model.id, {
            state: model.state || MODEL_STATE.NOT_LOADED,
            quantization: model.quantization || null,
            max_context_length: model.max_context_length || null,
          });
          runtime.availableModels.add(model.id);
        }
      } else {
        const r = await fetch(`${base}/models`, {
          headers: { Authorization: `Bearer ${key}` },
        });
        if (!r.ok) throw new Error(String(r.status));
        const data = await r.json();
        const allModels = (data.data || []).map(m => m.id);
        list = allModels.filter(id => {
          const lower = String(id).toLowerCase();
          return !EMBEDDING_KEYWORDS.some(k => lower.includes(k));
        });
        for (const id of list) {
          runtime.modelDetails.set(id, { state: MODEL_STATE.LOADED, quantization: null, max_context_length: null });
          runtime.availableModels.add(id);
        }
      }

      // Sort by display name
      list.sort((a, b) => {
        const nameA = a.replace(/^.*\//, "").toLowerCase();
        const nameB = b.replace(/^.*\//, "").toLowerCase();
        return nameA.localeCompare(nameB);
      });

      // Apply model filter
      let filteredList = list;
      if (state.modelFilter.length > 0) {
        filteredList = list.filter(id => state.modelFilter.includes(id));
        if (filteredList.length === 0) filteredList = list;
      }

      buildModelDropdown(el.modelSelect, filteredList);
      if (el.compareModelSelect) buildModelDropdown(el.compareModelSelect, filteredList);

      // Selection: saved → first in filtered list
      const preferred = state.settings.model;
      let chosen = null;
      for (const cand of [preferred, filteredList[0]].filter(Boolean)) {
        if (runtime.availableModels.has(cand)) { chosen = cand; break; }
      }
      if (chosen) el.modelSelect.value = chosen;

    } catch (e) {
      el.modelSelect.innerHTML = "";
      const msg = isLikelyServerOffline(e)
        ? "⚠️ LM Studioに接続できません。起動を確認してください。"
        : "⚠️ モデル一覧を取得できませんでした。";
      appendMessage("system", msg, { save: false });
    }
  }

  // Model auto-load on selection change
  async function handleModelChange(previousModelId) {
    const newModelId = el.modelSelect.value;
    if (!newModelId || !runtime.lmstudioV1Available) return;

    const details = runtime.modelDetails.get(newModelId);

    // Auto-unload previous model
    if (state.settings.autoUnload && previousModelId && previousModelId !== newModelId) {
      const prevDetails = runtime.modelDetails.get(previousModelId);
      if (prevDetails && prevDetails.state === MODEL_STATE.LOADED) {
        appendMessage("system", `⏳ ${previousModelId.replace(/^.*\//, "")} をアンロード中...`, { save: false });
        const ok = await unloadModelV1(previousModelId);
        if (ok) prevDetails.state = MODEL_STATE.NOT_LOADED;
      }
    }

    // Auto-load if not loaded
    if (details && details.state === MODEL_STATE.NOT_LOADED) {
      appendMessage("system", `⏳ ${newModelId.replace(/^.*\//, "")} をロード中...`, { save: false });
      try {
        await loadModelV1(newModelId);
        details.state = MODEL_STATE.LOADED;
        appendMessage("system", `✅ ${newModelId.replace(/^.*\//, "")} をロードしました`, { save: false });
      } catch (err) {
        appendMessage("system", `❌ モデルのロードに失敗しました: ${err.message}`, { save: false });
      }
    }

    state.settings.model = newModelId;
    saveSettings();
  }

  // ===================================================================
  // Section 11: ヘルパー関数
  // ===================================================================

  function notify(message) {
    appendMessage("system", message, { save: false });
  }

  function scrollToBottom() {
    el.chat.scrollTop = el.chat.scrollHeight;
  }

  function isNearBottom() {
    return el.chat.scrollTop + el.chat.clientHeight >= el.chat.scrollHeight - 150;
  }

  function smartScrollToBottom() {
    if (!state.userScrolledDuringStream) {
      el.chat.scrollTop = el.chat.scrollHeight;
    }
  }

  function strongClearPrompt() {
    el.prompt.value = "";
    clearDraft();
    el.prompt.dispatchEvent(new Event("input", { bubbles: true }));
    el.prompt.setSelectionRange(0, 0);
    el.prompt.blur();
    setTimeout(() => { el.prompt.value = ""; }, 0);
    setTimeout(() => { el.prompt.focus(); }, 10);
  }

  function validateModelExists(modelId) {
    return runtime.availableModels.size > 0 && runtime.availableModels.has(modelId);
  }

  // ===================================================================
  // Section 12: System Prompt 構築
  // ===================================================================

  function getResponseStyleInstruction() {
    const style = el.responseStyle?.value || state.settings.responseStyle || "standard";
    const map = {
      concise: "\n\n【応答スタイル】簡潔に要点のみを述べてください。冗長な説明は避け、核心的な情報のみを提供してください。",
      standard: "",
      detailed: "\n\n【応答スタイル】詳細な説明を心がけてください。背景情報、理由、具体例などを含めて丁寧に説明してください。",
      professional: "\n\n【応答スタイル】専門的で技術的な詳細を重視してください。学術的な正確性を保ち、専門用語を適切に使用し、エビデンスや根拠を明示してください。",
    };
    let instruction = map[style] || "";

    if (state.deepDiveMode) {
      instruction += "\n\n【深掘りモード】回答する前に、まず問題を多角的に分析してください。以下の点を考慮して深く掘り下げた回答を提供してください：\n" +
        "1. 根本的な原因や背景は何か\n" +
        "2. 異なる視点や解釈の可能性\n" +
        "3. 関連する概念や理論との繋がり\n" +
        "4. 潜在的な問題点や限界\n" +
        "5. 実践的な応用や次のステップ\n" +
        "回答は構造化し、思考プロセスを明示してください。";
    }
    return instruction;
  }

  function getUserProfileInstruction() {
    const level = el.userLevel?.value || "";
    const profession = el.userProfession?.value?.trim() || "";
    const interests = el.userInterests?.value?.trim() || "";
    if (!level && !profession && !interests) return "";

    let out = "\n\n【ユーザー情報】";
    const levelMap = {
      beginner: "ユーザーは初心者です。専門用語を避け、基礎から丁寧に説明してください。",
      intermediate: "ユーザーは中級者です。基本的な知識は持っているものとして、適度な専門用語を使用して説明してください。",
      advanced: "ユーザーは上級者です。専門的な内容を深く掘り下げて説明してください。",
      expert: "ユーザーは専門家です。高度な専門知識を前提とし、最新の研究や詳細な技術的議論を含めてください。",
    };
    if (level && levelMap[level]) out += `\n- ${levelMap[level]}`;
    if (profession) out += `\n- 職業/専門分野: ${profession}`;
    if (interests) out += `\n- 興味・関心: ${interests}`;
    return out;
  }

  function buildConversation() {
    let sysPrompt;

    if (state.helpMode) {
      sysPrompt = `あなたは「Local LLM Chat」アプリのヘルプアシスタントです。
以下のアプリマニュアルを参照して、ユーザーの質問に日本語で丁寧に回答してください。
マニュアルに記載されていない内容については「マニュアルに記載がありません」と伝えてください。

---
${APP_MANUAL_CONTENT}
---

上記のマニュアル内容を基に、ユーザーの質問に回答してください。`;
    } else {
      const baseSysPrompt = el.systemPrompt?.value || state.settings.systemPrompt || DEFAULT_SYSTEM_PROMPT;
      sysPrompt = baseSysPrompt + getResponseStyleInstruction() + getUserProfileInstruction();
    }

    const conv = [{ role: "system", content: sysPrompt }];
    let last = "system";

    for (const m of state.messages) {
      if (!["user", "assistant"].includes(m.role)) continue;
      if (m.role === last) continue;

      if (m.role === "user" && m.imageData) {
        const contentArray = [];
        if (m.content) contentArray.push({ type: "text", text: m.content });
        contentArray.push({ type: "image_url", image_url: { url: m.imageData } });
        conv.push({ role: "user", content: contentArray });
      } else {
        conv.push({ role: m.role, content: m.content });
      }
      last = m.role;
    }

    // 末尾を整理: 新しいuserMessageが後に追加されるため、
    // 履歴は ...user, assistant で終わるのが正しい。
    // もし末尾が user で終わっている場合（削除操作等）のみ除去する。
    if (conv.length > 1 && conv.at(-1).role === "user") conv.pop();

    const tail = conv.slice(1).slice(-(MAX_HISTORY_FOR_API - 1));

    // tailが assistant で始まる場合、対応するuserが欠落しているので除去
    if (tail.length > 0 && tail[0].role === "assistant") tail.shift();

    return [conv[0], ...tail];
  }

  // ===================================================================
  // Section 13: 添付ファイル処理
  // ===================================================================

  function injectAttachmentsIntoText(text) {
    let textForApi = text;
    let displayText = text;
    const imageAttachments = state.attachments.filter(a => a.type === "image");
    const fileAttachments = state.attachments.filter(a => a.type === "file");

    if (fileAttachments.length === 0 && imageAttachments.length === 0) {
      return { textForApi, displayText, imageAttachments };
    }

    if (fileAttachments.length > 0) {
      const fileContents = fileAttachments.map(f => {
        const isPDF = f.name.toLowerCase().endsWith(".pdf");
        const label = isPDF ? `📄 **添付PDF: ${f.name}**` : `📄 **添付ファイル: ${f.name}**`;
        return `\n\n---\n${label}\n\`\`\`\n${f.data}\n\`\`\``;
      }).join("");
      textForApi = textForApi ? (textForApi + fileContents) : `添付ファイルの内容:${fileContents}`;
    }

    const allNames = state.attachments.map(a => a.name);
    if (allNames.length > 0) {
      const attachText = `📎 添付: ${allNames.join(", ")}`;
      displayText = text ? `${text}\n\n${attachText}` : attachText;
    }

    return { textForApi, displayText, imageAttachments };
  }

  function loadFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (ev) => resolve(ev.target.result);
      reader.onerror = () => reject(new Error("ファイルの読み込みに失敗しました"));
      reader.readAsDataURL(file);
    });
  }

  function readTextFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (ev) => resolve(ev.target.result);
      reader.onerror = () => reject(new Error("ファイルの読み込みに失敗しました"));
      reader.readAsText(file);
    });
  }

  function readArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (ev) => resolve(ev.target.result);
      reader.onerror = () => reject(new Error("PDFファイルの読み込みに失敗しました"));
      reader.readAsArrayBuffer(file);
    });
  }

  async function extractTextFromPdf(arrayBuffer) {
    if (typeof pdfjsLib === "undefined") throw new Error("PDF.jsが読み込まれていません");
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    let fullText = "";
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(" ");
      fullText += `\n--- ページ ${pageNum} ---\n${pageText}\n`;
    }
    return { text: fullText.trim(), pages: pdf.numPages };
  }

  function generateAttachmentId() {
    return `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function renderAttachmentList() {
    if (state.attachments.length === 0) {
      el.attachmentList.hidden = true;
      el.attachmentList.innerHTML = "";
      return;
    }

    el.attachmentList.hidden = false;
    el.attachmentList.innerHTML = state.attachments.map(att => {
      const sizeStr = formatFileSize(att.size);
      if (att.type === "image") {
        return `<div class="attachment-chip">
          <img src="${att.data}" alt="${att.name}" class="attachment-chip__thumb" />
          <div class="attachment-chip__info">
            <div class="attachment-chip__name" title="${att.name}">${att.name}</div>
            <div class="attachment-chip__size">${sizeStr}</div>
          </div>
          <button class="attachment-chip__remove" onclick="window._removeAttachment('${att.id}')">&times;</button>
        </div>`;
      }
      return `<div class="attachment-chip">
        <span class="attachment-chip__icon">📄</span>
        <div class="attachment-chip__info">
          <div class="attachment-chip__name" title="${att.name}">${att.name}</div>
          <div class="attachment-chip__size">${sizeStr}</div>
        </div>
        <button class="attachment-chip__remove" onclick="window._removeAttachment('${att.id}')">&times;</button>
      </div>`;
    }).join("");
  }

  function removeAttachment(id) {
    state.attachments = state.attachments.filter(a => a.id !== id);
    renderAttachmentList();
    // Update send button state
    const hasContent = (el.prompt?.value?.trim().length > 0) || state.attachments.length > 0;
    el.send.classList.toggle("active", hasContent);
    el.send.disabled = !hasContent;
  }
  window._removeAttachment = removeAttachment;

  function clearAllAttachments() {
    state.attachments = [];
    if (el.imageInput) el.imageInput.value = "";
    if (el.fileInput) el.fileInput.value = "";
    renderAttachmentList();
  }

  async function handleImagesSelected(files) {
    if (!files || files.length === 0) return;
    let addedCount = 0;
    for (const file of files) {
      if (!file.type.startsWith("image/")) { notify(`⚠️ ${file.name} は画像ファイルではありません`); continue; }
      if (file.size > LIMITS.IMAGE_MAX_SIZE) { notify(`⚠️ ${file.name} は20MBを超えています`); continue; }
      try {
        const data = await loadFileAsDataURL(file);
        state.attachments.push({ id: generateAttachmentId(), type: "image", name: file.name, data, size: file.size });
        addedCount++;
      } catch { notify(`⚠️ ${file.name} の読み込みに失敗しました`); }
    }
    el.imageInput.value = "";
    renderAttachmentList();
    if (addedCount > 0) {
      notify(`✅ ${addedCount}個の画像を添付しました`);
      el.send.classList.add("active");
      el.send.disabled = false;
    }
  }

  async function handleFilesSelected(files) {
    if (!files || files.length === 0) return;
    let addedCount = 0;
    for (const file of files) {
      const isPDF = file.name.toLowerCase().endsWith(".pdf");
      const sizeLimit = isPDF ? LIMITS.PDF_MAX_SIZE : LIMITS.TEXT_MAX_SIZE;
      const sizeLimitText = isPDF ? "10MB" : "2MB";
      if (file.size > sizeLimit) { notify(`⚠️ ${file.name} は${sizeLimitText}を超えています`); continue; }
      try {
        let data;
        if (isPDF) {
          if (typeof pdfjsLib === "undefined") { notify("⚠️ PDF.jsが読み込まれていません"); continue; }
          const buf = await readArrayBuffer(file);
          const result = await extractTextFromPdf(buf);
          data = result.text || `[PDF: ${file.name} - テキスト抽出失敗]`;
        } else {
          data = await readTextFile(file);
        }
        state.attachments.push({ id: generateAttachmentId(), type: "file", name: file.name, data, size: file.size });
        addedCount++;
      } catch (err) {
        console.error(`ファイル読み込みエラー (${file.name}):`, err);
        notify(`⚠️ ${file.name} の読み込みに失敗しました`);
      }
    }
    el.fileInput.value = "";
    renderAttachmentList();
    if (addedCount > 0) {
      notify(`✅ ${addedCount}個のファイルを添付しました`);
      el.send.classList.add("active");
      el.send.disabled = false;
    }
  }

  // ===================================================================
  // Section 14: SSE ストリーム処理
  // ===================================================================

  async function consumeSSE(reader, onDelta, onDone) {
    const decoder = new TextDecoder("utf-8");
    let buf = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buf += decoder.decode(value, { stream: true });
      const events = buf.split("\n\n");
      buf = events.pop() || "";

      for (const ev of events) {
        const lines = ev.split("\n").filter(l => l.startsWith("data: ")).map(l => l.slice(6));
        if (!lines.length) continue;

        const payload = lines.join("\n");
        if (payload === "[DONE]") { onDone(); return; }

        try {
          const j = JSON.parse(payload);
          const delta = j.choices?.[0]?.delta?.content ?? j.choices?.[0]?.text ?? "";
          if (delta) onDelta(delta);
        } catch { /* incomplete JSON, wait for next chunk */ }
      }
    }
  }

  /**
   * logprobs対応版SSE消費関数
   * @param {ReadableStreamDefaultReader<Uint8Array>} reader
   * @param {(delta:string, logprobs:Array|null)=>void} onDelta
   * @param {()=>void} onDone
   */
  async function consumeSSEWithLogprobs(reader, onDelta, onDone) {
    const decoder = new TextDecoder("utf-8");
    let buf = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buf += decoder.decode(value, { stream: true });
      const events = buf.split("\n\n");
      buf = events.pop() || "";

      for (const ev of events) {
        const lines = ev.split("\n").filter(l => l.startsWith("data: ")).map(l => l.slice(6));
        if (!lines.length) continue;

        const payload = lines.join("\n");
        if (payload === "[DONE]") { onDone(); return; }

        try {
          const j = JSON.parse(payload);
          const delta = j.choices?.[0]?.delta?.content ?? j.choices?.[0]?.text ?? "";
          let logprobData = j.choices?.[0]?.logprobs?.content || null;
          if (!logprobData && j.choices?.[0]?.delta?.logprobs) {
            logprobData = j.choices[0].delta.logprobs.content || null;
          }
          if (!logprobData && j.logprobs?.content) {
            logprobData = j.logprobs.content;
          }
          if (delta || logprobData) onDelta(delta, logprobData);
        } catch { /* incomplete JSON */ }
      }
    }

    // ストリーム終了後: バッファに残ったデータを処理
    if (buf.trim()) {
      const lines = buf.split("\n").filter(l => l.startsWith("data: ")).map(l => l.slice(6));
      for (const line of lines) {
        if (line.trim() === "[DONE]") { onDone(); return; }
        try {
          const j = JSON.parse(line);
          const delta = j.choices?.[0]?.delta?.content ?? j.choices?.[0]?.text ?? "";
          if (delta) onDelta(delta, null);
        } catch { /* incomplete JSON */ }
      }
    }

    // [DONE] が受信されなかった場合でも onDone を呼び出す
    // （Ollama等、[DONE]を送信しないサーバーへの対応）
    onDone();
  }

  /**
   * 信頼度・代替候補情報を表示
   * @param {HTMLDivElement} msgDiv
   * @param {Array} logprobs
   */
  function displayLogprobsInfo(msgDiv, logprobs) {
    if (!logprobs || logprobs.length === 0) return;

    let totalLogprob = 0;
    let count = 0;
    const alternativesMap = new Map();

    for (const item of logprobs) {
      if (item && typeof item.logprob === "number") {
        totalLogprob += item.logprob;
        count++;
        if (item.top_logprobs && item.top_logprobs.length > 1) {
          const alternatives = item.top_logprobs
            .filter(alt => alt.token !== item.token)
            .slice(0, 3)
            .map(alt => ({ token: alt.token, prob: Math.exp(alt.logprob) * 100 }));
          if (alternatives.length > 0) alternativesMap.set(item.token, alternatives);
        }
      }
    }

    if (count === 0) return;

    const avgLogprob = totalLogprob / count;
    const avgProb = Math.exp(avgLogprob);
    const confidencePercent = Math.min(100, Math.max(0, avgProb * 100));

    let confidenceLevel, confidenceColor;
    if (confidencePercent >= 80) { confidenceLevel = "高"; confidenceColor = "#28a745"; }
    else if (confidencePercent >= 50) { confidenceLevel = "中"; confidenceColor = "#ffc107"; }
    else { confidenceLevel = "低"; confidenceColor = "#dc3545"; }

    const topAlternatives = Array.from(alternativesMap.entries())
      .filter(([, alts]) => alts[0].prob > 5)
      .slice(0, 5);

    let alternativesHtml = "";
    if (topAlternatives.length > 0) {
      alternativesHtml = `
        <div class="alternatives-section">
          <span class="alternatives-label">📝 検討された代替候補:</span>
          <div class="alternatives-list">
            ${topAlternatives.map(([selectedToken, alts]) => `
              <div class="alternative-item">
                <span class="selected-token">"${escapeHtml(selectedToken)}"</span>
                <span class="arrow">→</span>
                ${alts.map(alt => `<span class="alt-token" title="${alt.prob.toFixed(1)}%">${escapeHtml(alt.token)} (${alt.prob.toFixed(0)}%)</span>`).join(" / ")}
              </div>
            `).join("")}
          </div>
        </div>
      `;
    }

    const infoDiv = document.createElement("div");
    infoDiv.className = "logprobs-info";
    infoDiv.innerHTML = `
      <div class="confidence-section">
        <span class="confidence-label">📊 応答の確信度:</span>
        <div class="confidence-bar-container">
          <div class="confidence-bar" style="width: ${confidencePercent}%; background: ${confidenceColor}"></div>
        </div>
        <span class="confidence-value" style="color: ${confidenceColor}">${confidencePercent.toFixed(0)}% (${confidenceLevel})</span>
      </div>
      ${alternativesHtml}
      <div class="logprobs-note">
        <small>※ この情報はLM Studio v0.3.39以降のOpen Responses APIによって提供されています</small>
      </div>
    `;

    msgDiv.appendChild(infoDiv);
  }

  // ===================================================================
  // Section 15: チャットUI（メッセージ表示）
  // ===================================================================

  function buildMessageActions(msgDiv, role) {
    const actions = document.createElement("div");
    actions.className = "message__actions";

    const copyBtn = document.createElement("button");
    copyBtn.title = "コピー";
    copyBtn.textContent = "📋";
    copyBtn.onclick = async () => {
      await navigator.clipboard.writeText(msgDiv.dataset.content || "");
      notify("✅ コピーしました");
    };

    const deleteBtn = document.createElement("button");
    deleteBtn.title = "削除";
    deleteBtn.textContent = "🗑";
    deleteBtn.onclick = () => {
      const msgContent = msgDiv.dataset.content || "";
      const idx = state.messages.findIndex(m => m.role === role && m.content === msgContent);
      if (idx !== -1) {
        state.messages.splice(idx, 1);
        persistHistory();
      }
      msgDiv.remove();
      notify("✅ メッセージを削除しました");
    };

    actions.append(copyBtn, deleteBtn);

    if (role === "user") {
      const editBtn = document.createElement("button");
      editBtn.title = "編集";
      editBtn.textContent = "✏️";
      editBtn.onclick = () => editUserMessage(msgDiv);
      actions.appendChild(editBtn);
    }

    if (role === "assistant") {
      const regenBtn = document.createElement("button");
      regenBtn.title = "再生成";
      regenBtn.textContent = "🔄";
      regenBtn.onclick = () => regenerateLastAssistant(msgDiv);
      actions.appendChild(regenBtn);

      const termCheckBtn = document.createElement("button");
      termCheckBtn.title = "医学用語チェック";
      termCheckBtn.textContent = "🏥";
      termCheckBtn.onclick = () => performPostResponseTermCheck(msgDiv.dataset.content || "");
      actions.appendChild(termCheckBtn);
    }

    return actions;
  }

  function editUserMessage(msgDiv) {
    const msgContent = msgDiv.dataset.content || "";
    if (!confirm("このメッセージを編集しますか？\n\n※ このメッセージ以降の会話は削除されます。")) return;

    let idx = -1;
    for (let i = state.messages.length - 1; i >= 0; i--) {
      if (state.messages[i].role === "user" && state.messages[i].content === msgContent) {
        idx = i; break;
      }
    }
    if (idx === -1) { notify("⚠️ メッセージが見つかりません"); return; }

    const removedCount = state.messages.length - idx;
    state.messages.splice(idx);
    persistHistory();

    const allMessages = Array.from(el.chat.querySelectorAll(".message"));
    const msgIndex = allMessages.indexOf(msgDiv);
    if (msgIndex !== -1) {
      for (let i = allMessages.length - 1; i >= msgIndex; i--) allMessages[i].remove();
    }

    el.prompt.value = msgContent;
    el.prompt.style.height = "auto";
    el.prompt.style.height = Math.min(el.prompt.scrollHeight, 200) + "px";
    el.prompt.focus();
    el.prompt.setSelectionRange(el.prompt.value.length, el.prompt.value.length);
    notify(`✏️ 編集モード（${removedCount}件のメッセージを削除）`);
  }

  function regenerateLastAssistant(msgDiv) {
    const msgContent = msgDiv.dataset.content || "";

    const idx = state.messages.findIndex(m => m.role === "assistant" && m.content === msgContent);
    if (idx !== -1) { state.messages.splice(idx, 1); persistHistory(); }

    let lastUserDiv = null;
    let prevSibling = msgDiv.previousElementSibling;
    while (prevSibling) {
      if (prevSibling.classList.contains("message--user")) { lastUserDiv = prevSibling; break; }
      prevSibling = prevSibling.previousElementSibling;
    }

    msgDiv.remove();

    let userContent = lastUserDiv?.dataset.content || "";
    if (!userContent) {
      for (let i = state.messages.length - 1; i >= 0; i--) {
        if (state.messages[i].role === "user") { userContent = state.messages[i].content; break; }
      }
    }
    if (!userContent) { notify("⚠️ 再生成するユーザーメッセージがありません"); return; }

    const userIdx = state.messages.findIndex(m => m.role === "user" && m.content === userContent);
    if (userIdx !== -1) { state.messages.splice(userIdx, 1); persistHistory(); }

    if (lastUserDiv) {
      lastUserDiv.remove();
    } else {
      const userDivs = el.chat.querySelectorAll(".message--user");
      if (userDivs.length > 0) userDivs[userDivs.length - 1].remove();
    }

    el.prompt.value = userContent;
    el.send.click();
  }

  function appendMessage(role, content, opts = {}) {
    const { save = true, imageData = null } = opts;

    const container = document.createElement("div");
    container.className = `message message--${role}`;
    container.dataset.content = content;
    if (imageData) container.dataset.imageData = imageData;

    // Role label
    if (role === "user" || role === "assistant") {
      const label = document.createElement("div");
      label.className = "message__role-label";
      label.textContent = role === "assistant" ? "🤖 Assistant" : "👤 User";
      container.appendChild(label);
    }

    // User image thumbnail
    if (imageData && role === "user") {
      const img = document.createElement("img");
      img.src = imageData;
      img.className = "image-in-message";
      container.appendChild(img);
    }

    // Message body
    const body = document.createElement("div");
    body.className = "message-content";
    if (role === "assistant" && typeof marked !== "undefined") {
      body.innerHTML = renderMarkdown(content);
    } else {
      body.textContent = content;
    }
    container.appendChild(body);

    // Action buttons (not for system messages)
    if (role !== "system") {
      container.appendChild(buildMessageActions(container, role));
    }

    el.chat.appendChild(container);
    scrollToBottom();

    if (save) {
      state.messages.push({ role, content, imageData: imageData || undefined });
      persistHistory();
    }

    return container;
  }

  function applySettingsToUI() {
    if (el.baseUrl) el.baseUrl.value = state.settings.baseUrl;
    if (el.apiKey) el.apiKey.value = state.settings.apiKey;
    if (el.temperature) {
      el.temperature.value = state.settings.temperature;
      el.tempValue.textContent = state.settings.temperature;
    }
    if (el.maxTokens) el.maxTokens.value = state.settings.maxTokens;
    if (el.sendKey) el.sendKey.value = state.settings.sendKey;
    if (el.responseStyle) el.responseStyle.value = state.settings.responseStyle;
    if (el.userLevel) el.userLevel.value = state.settings.userLevel || "";
    if (el.userProfession) el.userProfession.value = state.settings.userProfession || "";
    if (el.userInterests) el.userInterests.value = state.settings.userInterests || "";
    if (el.systemPrompt) el.systemPrompt.value = state.settings.systemPrompt || DEFAULT_SYSTEM_PROMPT;
    if (el.showLogprobsToggle) el.showLogprobsToggle.classList.toggle("active", !!state.settings.showLogprobs);
    if (el.autoUnloadToggle) el.autoUnloadToggle.classList.toggle("active", !!state.settings.autoUnload);
  }

  function renderHistoryFromStorage() {
    if (!el.chat) return;
    el.chat.innerHTML = "";
    for (const msg of state.messages) {
      appendMessage(msg.role, msg.content, { save: false, imageData: msg.imageData || null });
    }
  }

  // ===================================================================
  // Section 16: チャット送信・停止
  // ===================================================================

  async function handleSend() {
    let text = el.prompt.value.trim();
    const hasAnyInput = Boolean(text || state.attachments.length > 0);
    if (!hasAnyInput || state.isStreaming) return;

    const base = trimTrailingSlashes(state.settings.baseUrl || "http://localhost:1234/v1");
    const key = state.settings.apiKey || "lmstudio";
    const model = el.modelSelect.value || state.settings.model;

    if (!validateModelExists(model)) {
      notify(`⚠️ 選択モデルが /v1/models に見つかりません: ${model}`);
      return;
    }

    // Compare mode branch
    if (state.compareMode) {
      const compareModel = el.compareModelSelect?.value;
      if (!compareModel) {
        notify("⚠️ 比較モデルが選択されていません");
        return;
      }
      if (!validateModelExists(compareModel)) {
        notify(`⚠️ 比較モデルが /v1/models に見つかりません: ${compareModel}`);
        return;
      }
      if (model === compareModel) {
        notify("⚠️ メインモデルと比較モデルが同じです。異なるモデルを選択してください");
        return;
      }
      await handleCompareSend(text, model, compareModel, base, key);
      return;
    }

    // Attachment processing
    const { textForApi, displayText, imageAttachments } = injectAttachmentsIntoText(text);
    text = textForApi;
    const firstImageData = imageAttachments.length > 0 ? imageAttachments[0].data : null;

    // Show user message in UI (don't save to history yet)
    appendMessage("user", displayText || "(添付ファイルのみ)", { save: false, imageData: firstImageData });
    const userMsgDiv = el.chat.lastChild;
    if (userMsgDiv) userMsgDiv.dataset.content = text;

    strongClearPrompt();
    clearAllAttachments();

    // Build API user message (Vision format if images)
    let userMessage;
    if (imageAttachments.length > 0) {
      const contentArray = [];
      if (text) contentArray.push({ type: "text", text });
      for (const img of imageAttachments) {
        contentArray.push({ type: "image_url", image_url: { url: img.data } });
      }
      userMessage = { role: "user", content: contentArray };
    } else {
      userMessage = { role: "user", content: text };
    }

    const userMessageForHistory = { role: "user", content: text, imageData: firstImageData || undefined };

    // Assistant placeholder with streaming dots
    appendMessage("assistant", "", { save: false });
    const currentMsgDiv = el.chat.lastChild;
    currentMsgDiv.classList.add("streaming");
    const contentEl0 = currentMsgDiv.querySelector(".message-content");
    if (contentEl0) {
      contentEl0.innerHTML = '<div class="streaming-dots"><span class="streaming-dots__dot"></span><span class="streaming-dots__dot"></span><span class="streaming-dots__dot"></span></div>';
    }

    runtime.controller = new AbortController();
    el.stopBtn.hidden = false;
    el.stopBtn.disabled = false;
    el.send.disabled = true;
    state.isStreaming = true;
    state.userScrolledDuringStream = false;

    try {
      const apiMessages = [...buildConversation(), userMessage];

      // Check if conversation has images (Open Responses API doesn't support images)
      const conversationHasImage = apiMessages.some(msg =>
        Array.isArray(msg.content) && msg.content.some(c => c.type === "image_url")
      );

      if (state.settings.showLogprobs && !conversationHasImage) {
        // ── Open Responses API (logprobs) ──
        const systemMessages = apiMessages.filter(m => m.role === "system");
        const nonSystemMessages = apiMessages.filter(m => m.role !== "system");

        const instructions = systemMessages.map(m => {
          if (typeof m.content === "string") return m.content;
          if (Array.isArray(m.content)) return m.content.filter(c => c.type === "text").map(c => c.text).join("\n");
          return "";
        }).join("\n\n");

        const inputMessages = nonSystemMessages.map(m => {
          if (Array.isArray(m.content)) {
            const textParts = m.content.filter(c => c.type === "text").map(c => c.text);
            return { role: m.role, content: textParts.join("\n") || "(画像メッセージ)" };
          }
          return { role: m.role, content: m.content };
        });

        const responsesBody = {
          model,
          input: inputMessages,
          temperature: parseFloat(state.settings.temperature) || 0.7,
          max_output_tokens: parseInt(state.settings.maxTokens, 10) || 2048,
          top_logprobs: 5,
        };
        if (instructions) responsesBody.instructions = instructions;

        const res = await fetch(`${base}/responses`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify(responsesBody),
          signal: runtime.controller.signal,
        });

        if (!res.ok) {
          const t = await res.text().catch(() => "");
          const contentEl = currentMsgDiv.querySelector(".message-content");
          if (contentEl) contentEl.textContent = `エラー:${res.status}${t ? " / " + t : ""}`;
          return;
        }

        const responseData = await res.json();

        let content = "";
        let allLogprobs = [];

        if (responseData.output) {
          for (const item of responseData.output) {
            if (item.type === "message" && item.content) {
              for (const contentItem of item.content) {
                if (contentItem.type === "output_text") {
                  content += contentItem.text || "";
                  if (contentItem.logprobs) allLogprobs.push(...contentItem.logprobs);
                }
              }
            }
          }
        }
        if (!content && responseData.text) content = responseData.text;
        if (!content && responseData.choices?.[0]?.message?.content) {
          content = responseData.choices[0].message.content;
          if (responseData.choices[0].logprobs?.content) {
            allLogprobs = responseData.choices[0].logprobs.content;
          }
        }

        const contentEl = currentMsgDiv.querySelector(".message-content");
        if (contentEl) contentEl.innerHTML = renderMarkdown(content || "(空応答)");

        if (allLogprobs.length > 0) displayLogprobsInfo(currentMsgDiv, allLogprobs);

        currentMsgDiv.dataset.content = content;
        currentMsgDiv.classList.remove("streaming");
        state.messages.push(userMessageForHistory);
        state.messages.push({ role: "assistant", content });
        persistHistory();
        // 状態クリーンアップは finally ブロックで実行

      } else {
        // ── Normal streaming API (/v1/chat/completions) ──
        const requestBody = {
          model,
          messages: apiMessages,
          stream: true,
          temperature: parseFloat(state.settings.temperature) || 0.7,
          max_tokens: parseInt(state.settings.maxTokens, 10) || 2048,
        };

        const res = await fetch(`${base}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify(requestBody),
          signal: runtime.controller.signal,
        });

        if (!res.ok || !res.body) {
          const t = await res.text().catch(() => "");
          const contentEl = currentMsgDiv.querySelector(".message-content");
          if (contentEl) contentEl.textContent = `エラー:${res.status}${t ? " / " + t : ""}`;
          return;
        }

        const reader = res.body.getReader();
        let content = "";

        let firstChunk = true;
        let messagesSaved = false;
        await consumeSSEWithLogprobs(
          reader,
          (delta) => {
            if (firstChunk) {
              firstChunk = false;
              currentMsgDiv.classList.add("streaming-cursor");
            }
            content += delta;
            currentMsgDiv.dataset.partialContent = content;
            const contentEl = currentMsgDiv.querySelector(".message-content");
            if (contentEl) contentEl.innerHTML = renderMarkdown(content);
            smartScrollToBottom();
          },
          () => {
            // UI確定（[DONE]受信時 or ストリーム終了時に呼ばれる）
            currentMsgDiv.classList.remove("streaming", "streaming-cursor");
            const contentEl = currentMsgDiv.querySelector(".message-content");
            if (contentEl) contentEl.innerHTML = renderMarkdown(content || "(空応答)");
            currentMsgDiv.dataset.content = content;
          }
        );

        // ストリーミング完了後: 必ずメッセージを保存
        // （consumeSSEWithLogprobs は [DONE] 有無に関わらず onDone 呼出後に return する）
        if (!messagesSaved) {
          messagesSaved = true;
          state.messages.push(userMessageForHistory);
          state.messages.push({ role: "assistant", content });
          persistHistory();
        }
      }

    } catch (e) {
      const contentEl = currentMsgDiv.querySelector(".message-content");
      const currentContent = currentMsgDiv.dataset.partialContent || "";

      if (e && e.name === "AbortError") {
        const stoppedContent = currentContent + "\n\n⏹ **生成を停止しました。**";
        if (contentEl) contentEl.innerHTML = renderMarkdown(stoppedContent);
        currentMsgDiv.dataset.content = stoppedContent;
        state.messages.push(userMessageForHistory);
        state.messages.push({ role: "assistant", content: stoppedContent });
        persistHistory();
      } else if (isLikelyServerOffline(e) && !currentContent) {
        if (contentEl) contentEl.textContent = "接続できませんでした。LM Studioが起動していない可能性があります。";
        notify("⚠️ LM Studioが起動していないか、Base URLに接続できません。");
      } else {
        const errorMsg = `\n\n⚠️ **エラーが発生しました**: ${e?.message || e}`;
        if (contentEl) contentEl.innerHTML = renderMarkdown(currentContent + errorMsg);
        console.error("Streaming error:", e);
        // 部分的なコンテンツがある場合は保存（コンテキスト欠落を防止）
        if (currentContent) {
          currentMsgDiv.dataset.content = currentContent + errorMsg;
          state.messages.push(userMessageForHistory);
          state.messages.push({ role: "assistant", content: currentContent });
          persistHistory();
        }
      }
    } finally {
      currentMsgDiv.classList.remove("streaming", "streaming-cursor");
      state.isStreaming = false;
      state.userScrolledDuringStream = false;
      el.stopBtn.disabled = true;
      el.stopBtn.hidden = true;
      el.send.disabled = false;
      runtime.controller = null;
    }
  }

  function handleStop() {
    if (runtime.controller) runtime.controller.abort();
  }

  // ===================================================================
  // Section 17: 新しい話題・クリア
  // ===================================================================

  function handleNewTopic() {
    // Insert topic separator
    const sep = document.createElement("div");
    sep.className = "topic-separator";
    sep.innerHTML = "<span>新しい話題</span>";
    el.chat.appendChild(sep);
    scrollToBottom();

    // Clear messages array (API context reset) but keep UI history visible
    state.messages = [];
    persistHistory();
    notify("🆕 新しい話題を開始しました（以前の会話はAIに送信されません）");
  }

  function handleClear() {
    if (!confirm("すべての会話を消去しますか？")) return;
    state.messages = [];
    persistHistory();
    el.chat.innerHTML = "";
    notify("🗑️ すべての会話を消去しました");
  }

  // ===================================================================
  // Section 18: プリセット
  // ===================================================================

  function getPreset(key) {
    return (state.customPresets[key] !== undefined) ? state.customPresets[key] : DEFAULT_PRESETS[key];
  }

  function getPresetLabel(key) {
    return state.customPresetLabels[key] || DEFAULT_PRESET_LABELS[key] || key;
  }

  function getAllPresetKeys() {
    const keys = new Set(Object.keys(DEFAULT_PRESETS));
    Object.keys(state.customPresetLabels).forEach(k => keys.add(k));
    Object.keys(state.customPresets).forEach(k => keys.add(k));
    return Array.from(keys);
  }

  function renderPresetUI() {
    const keys = getAllPresetKeys();
    const current = el.presetEditSelect?.value;

    // Editor select
    if (el.presetEditSelect) {
      el.presetEditSelect.innerHTML = "";
      keys.forEach(key => {
        const opt = document.createElement("option");
        opt.value = key;
        opt.textContent = getPresetLabel(key);
        el.presetEditSelect.appendChild(opt);
      });
      if (keys.includes(current)) el.presetEditSelect.value = current;
    }

    // Preset panel buttons
    if (el.presetList) {
      el.presetList.innerHTML = "";
      keys.forEach(key => {
        const btn = document.createElement("button");
        btn.className = "preset-item";
        btn.dataset.preset = key;
        btn.textContent = getPresetLabel(key);
        btn.addEventListener("click", () => insertPresetIntoPrompt(key, getPresetLabel(key)));
        el.presetList.appendChild(btn);
      });
    }
  }

  function loadPresetToEditor() {
    const key = el.presetEditSelect?.value;
    if (!key) return;
    if (el.presetEditText) el.presetEditText.value = getPreset(key) || "";
    if (el.deletePresetBtn) el.deletePresetBtn.disabled = Boolean(DEFAULT_PRESETS[key]);
  }

  function savePresetFromEditor() {
    const key = el.presetEditSelect?.value;
    if (!key) return;
    state.customPresets[key] = el.presetEditText?.value || "";
    persistCustomPresets();
    notify("✅ プリセットを保存しました");
  }

  function resetPresetToDefault() {
    const key = el.presetEditSelect?.value;
    if (!key) return;
    if (DEFAULT_PRESETS[key]) {
      delete state.customPresets[key];
      persistCustomPresets();
      if (el.presetEditText) el.presetEditText.value = getPreset(key) || "";
      notify("✅ プリセットをデフォルトに戻しました");
    } else {
      delete state.customPresets[key];
      delete state.customPresetLabels[key];
      persistCustomPresets();
      renderPresetUI();
      if (el.presetEditSelect) el.presetEditSelect.value = Object.keys(DEFAULT_PRESETS)[0];
      loadPresetToEditor();
      notify("✅ カスタムプリセットを削除しました");
    }
  }

  function resetAllPresets() {
    if (!confirm("すべてのプリセットをデフォルトに戻しますか？")) return;
    state.customPresets = {};
    state.customPresetLabels = {};
    localStorage.removeItem(STORAGE_KEYS.PRESETS);
    localStorage.removeItem(STORAGE_KEYS.PRESET_LABELS);
    renderPresetUI();
    loadPresetToEditor();
    notify("✅ すべてのプリセットをリセットしました");
  }

  function addNewPreset() {
    const label = el.newPresetName?.value?.trim();
    if (!label) { notify("⚠️ プリセット名を入力してください"); return; }
    const key = `custom_${Date.now()}`;
    state.customPresetLabels[key] = label;
    state.customPresets[key] = "";
    persistCustomPresets();
    renderPresetUI();
    if (el.presetEditSelect) el.presetEditSelect.value = key;
    if (el.presetEditText) el.presetEditText.value = "";
    if (el.deletePresetBtn) el.deletePresetBtn.disabled = false;
    if (el.newPresetName) el.newPresetName.value = "";
    notify(`✅ プリセット「${label}」を追加しました`);
  }

  function deleteSelectedPreset() {
    const key = el.presetEditSelect?.value;
    if (!key) return;
    if (DEFAULT_PRESETS[key]) { notify("⚠️ デフォルトのプリセットは削除できません"); return; }
    if (!confirm("このカスタムプリセットを削除しますか？")) return;
    delete state.customPresets[key];
    delete state.customPresetLabels[key];
    persistCustomPresets();
    renderPresetUI();
    if (el.presetEditSelect) el.presetEditSelect.value = Object.keys(DEFAULT_PRESETS)[0];
    loadPresetToEditor();
    notify("✅ カスタムプリセットを削除しました");
  }

  function insertPresetIntoPrompt(presetKey, label) {
    const presetText = getPreset(presetKey);
    if (!presetText) return;
    if (el.prompt.value.trim()) el.prompt.value += "\n\n" + presetText;
    else el.prompt.value = presetText;
    el.prompt.style.height = "auto";
    el.prompt.style.height = Math.min(el.prompt.scrollHeight, 200) + "px";
    scheduleDraftSave();
    el.prompt.focus();
    el.prompt.setSelectionRange(el.prompt.value.length, el.prompt.value.length);
    if (el.presetPanel) el.presetPanel.hidden = true;
    el.send.classList.add("active");
    el.send.disabled = false;
    notify(`✅ プリセット「${label}」を挿入しました`);
  }

  // ===================================================================
  // Section 19: System Prompt プリセット
  // ===================================================================

  function updateSystemPromptPresetSelect() {
    if (!el.systemPromptPresetSelect) return;
    const currentValue = el.systemPromptPresetSelect.value;
    el.systemPromptPresetSelect.innerHTML = '<option value="">-- プリセットを選択 --</option>';

    for (const [key, { label }] of Object.entries(BUILTIN_SYSTEM_PROMPTS)) {
      const option = document.createElement("option");
      option.value = key;
      option.textContent = label;
      el.systemPromptPresetSelect.appendChild(option);
    }

    for (const [name] of Object.entries(state.systemPromptPresets)) {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      el.systemPromptPresetSelect.appendChild(option);
    }
    if (currentValue) el.systemPromptPresetSelect.value = currentValue;
  }

  function applySystemPromptPreset(presetKey) {
    if (!presetKey) return;
    let spPrompt;
    const builtin = BUILTIN_SYSTEM_PROMPTS[presetKey];
    if (builtin) {
      spPrompt = builtin.prompt;
    } else {
      spPrompt = state.systemPromptPresets[presetKey];
    }
    if (spPrompt && el.systemPrompt) {
      el.systemPrompt.value = spPrompt;
      saveSettingsFromUI();
      const displayName = builtin ? builtin.label.replace(/^[^\s]+\s/, "") : presetKey;
      notify(`✅ System Prompt「${displayName}」を適用しました`);
    }
  }

  function saveCurrentAsSystemPromptPreset() {
    const name = prompt("新しいプリセット名を入力してください:");
    if (!name || !name.trim()) return;
    const trimmedName = name.trim();
    if (trimmedName === "__default__") { notify("⚠️ この名前は使用できません"); return; }
    state.systemPromptPresets[trimmedName] = el.systemPrompt?.value || "";
    saveSystemPromptPresets();
    updateSystemPromptPresetSelect();
    el.systemPromptPresetSelect.value = trimmedName;
    notify(`✅ プリセット「${trimmedName}」を保存しました`);
  }

  function deleteSelectedSystemPromptPreset() {
    const selected = el.systemPromptPresetSelect?.value;
    if (!selected || BUILTIN_SYSTEM_PROMPTS[selected]) { notify("⚠️ 削除できるプリセットを選択してください"); return; }
    if (!confirm(`プリセット「${selected}」を削除しますか？`)) return;
    delete state.systemPromptPresets[selected];
    saveSystemPromptPresets();
    updateSystemPromptPresetSelect();
    el.systemPromptPresetSelect.value = "";
    notify(`🗑 プリセット「${selected}」を削除しました`);
  }

  // ===================================================================
  // Section 20: エクスポート・インポート
  // ===================================================================

  function exportHistory() {
    const blob = new Blob([JSON.stringify(state.messages, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chat_history_${new Date().toISOString().slice(0, 19)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    closeAllDropdowns();
  }

  function importHistory() {
    el.importInput?.click();
    closeAllDropdowns();
  }

  async function handleImportFile(file) {
    if (!file) return;
    if (file.size > LIMITS.IMPORT_MAX_SIZE) { notify("⚠️ ファイルサイズが大きすぎます（上限: 10MB）"); return; }
    try {
      const text = await readTextFile(file);
      const imported = JSON.parse(text);
      if (!Array.isArray(imported) || !imported.every(m => typeof m === "object" && ["user", "assistant", "system"].includes(m.role) && typeof m.content === "string")) {
        notify("⚠️ 無効な形式のファイルです");
        return;
      }
      if (state.messages.length > 0 && !confirm(`${imported.length}件のメッセージをインポートします。\n既存の履歴を置き換えますか？`)) return;
      state.messages = imported;
      persistHistory();
      renderHistoryFromStorage();
      notify(`✅ ${imported.length}件のメッセージをインポートしました`);
    } catch (err) {
      console.error("インポートエラー:", err);
      notify("⚠️ ファイルの読み込みに失敗しました");
    } finally {
      el.importInput.value = "";
    }
  }

  // ===================================================================
  // Section 21: 設定リセット・全データ消去
  // ===================================================================

  function resetSettings() {
    if (!confirm("設定をデフォルトに戻しますか？")) return;
    state.settings = { ...DEFAULT_SETTINGS };
    saveSettings();
    applySettingsToUI();
    applyDarkMode(false);
    notify("✅ 設定をデフォルトに戻しました");
  }

  function clearAllData() {
    if (!confirm("すべての保存データ（設定・履歴・プリセット）を削除しますか？\n\nこの操作は取り消せません。")) return;
    Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key));
    state.messages = [];
    state.settings = { ...DEFAULT_SETTINGS };
    state.customPresets = {};
    state.customPresetLabels = {};
    state.systemPromptPresets = {};
    state.modelFilter = [];
    el.chat.innerHTML = "";
    applySettingsToUI();
    applyDarkMode(false);
    renderPresetUI();
    updateSystemPromptPresetSelect();
    notify("✅ すべてのデータを削除しました");
  }

  // ===================================================================
  // Section 22: 深掘りモード
  // ===================================================================

  function toggleDeepDive() {
    state.deepDiveMode = !state.deepDiveMode;
    el.deepDiveBtn?.classList.toggle("active", state.deepDiveMode);
    notify(state.deepDiveMode ? "🔍 深掘りモード ON" : "🔍 深掘りモード OFF");
  }

  // ===================================================================
  // Section 23: 比較モード
  // ===================================================================

  function toggleCompareMode() {
    state.compareMode = !state.compareMode;

    // Update button appearance
    if (el.compareBtn) {
      el.compareBtn.classList.toggle("active", state.compareMode);
      el.compareBtn.textContent = state.compareMode ? "📊 比較 ON" : "📊 比較モード";
    }

    // Show/hide compare model selector
    if (el.compareRow) el.compareRow.hidden = !state.compareMode;

    if (state.compareMode) {
      // Auto-select a different model for comparison
      if (el.compareModelSelect && el.modelSelect) {
        const mainModel = el.modelSelect.value;
        for (const opt of el.compareModelSelect.options) {
          if (opt.value !== mainModel) {
            el.compareModelSelect.value = opt.value;
            break;
          }
        }
      }
      notify("📊 比較モード ON - 2つのモデルの回答を並べて表示します（LM Studio Developers設定の「JIT models auto-evict」をOFFにしてください）");
    } else {
      notify("📊 比較モード OFF");
    }

    closeAllDropdowns();
  }

  /**
   * 比較モード用の送信処理
   * @param {string} text
   * @param {string} modelA
   * @param {string} modelB
   * @param {string} base
   * @param {string} key
   */
  async function handleCompareSend(text, modelA, modelB, base, key) {
    const { textForApi, displayText, imageAttachments } = injectAttachmentsIntoText(text);
    text = textForApi;
    const firstImageData = imageAttachments.length > 0 ? imageAttachments[0].data : null;

    // Show user message
    appendMessage("user", displayText || "(添付ファイルのみ)", { save: false, imageData: firstImageData });
    const userMsgDiv = el.chat.lastChild;
    if (userMsgDiv) userMsgDiv.dataset.content = text;

    strongClearPrompt();
    clearAllAttachments();

    // Build API user message
    let userMessage;
    if (imageAttachments.length > 0) {
      const contentArray = [];
      if (text) contentArray.push({ type: "text", text });
      for (const img of imageAttachments) {
        contentArray.push({ type: "image_url", image_url: { url: img.data } });
      }
      userMessage = { role: "user", content: contentArray };
    } else {
      userMessage = { role: "user", content: text };
    }

    const userMessageForHistory = { role: "user", content: text, imageData: firstImageData || undefined };

    // Side-by-side container
    const compareContainer = document.createElement("div");
    compareContainer.className = "compare-container";

    const responseA = document.createElement("div");
    responseA.className = "compare-response";
    const headerA = document.createElement("div");
    headerA.className = "compare-model-header model-a";
    headerA.innerHTML = `🤖 <span>${escapeHtml(modelA.replace(/^.*\//, ""))}</span>`;
    const messageA = document.createElement("div");
    messageA.className = "compare-message model-a";
    messageA.innerHTML = '<div class="message-content"><div class="streaming-dots"><span class="streaming-dots__dot"></span><span class="streaming-dots__dot"></span><span class="streaming-dots__dot"></span></div></div>';
    responseA.appendChild(headerA);
    responseA.appendChild(messageA);

    const responseB = document.createElement("div");
    responseB.className = "compare-response";
    const headerB = document.createElement("div");
    headerB.className = "compare-model-header model-b";
    headerB.innerHTML = `🤖 <span>${escapeHtml(modelB.replace(/^.*\//, ""))}</span>`;
    const messageB = document.createElement("div");
    messageB.className = "compare-message model-b";
    messageB.innerHTML = '<div class="message-content"><div class="streaming-dots"><span class="streaming-dots__dot"></span><span class="streaming-dots__dot"></span><span class="streaming-dots__dot"></span></div></div>';
    responseB.appendChild(headerB);
    responseB.appendChild(messageB);

    compareContainer.appendChild(responseA);
    compareContainer.appendChild(responseB);
    el.chat.appendChild(compareContainer);

    // Parallel streaming setup
    runtime.controller = new AbortController();
    el.stopBtn.hidden = false;
    el.stopBtn.disabled = false;
    el.send.disabled = true;
    state.isStreaming = true;
    state.userScrolledDuringStream = false;

    const apiMessages = [...buildConversation(), userMessage];
    let contentA = "";
    let contentB = "";

    const streamModel = async (model, msgEl, updateContent) => {
      const requestBody = {
        model,
        messages: apiMessages,
        stream: true,
        temperature: parseFloat(state.settings.temperature) || 0.7,
        max_tokens: parseInt(state.settings.maxTokens, 10) || 2048,
      };

      try {
        const res = await fetch(`${base}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify(requestBody),
          signal: runtime.controller.signal,
        });

        if (!res.ok || !res.body) {
          const t = await res.text().catch(() => "");
          const contentEl = msgEl.querySelector(".message-content");
          if (contentEl) contentEl.textContent = `エラー:${res.status}${t ? " / " + t : ""}`;
          return "";
        }

        const reader = res.body.getReader();
        let content = "";

        await consumeSSEWithLogprobs(
          reader,
          (delta) => {
            content += delta;
            updateContent(content);
            const contentEl = msgEl.querySelector(".message-content");
            if (contentEl) contentEl.innerHTML = renderMarkdown(content);
            smartScrollToBottom();
          },
          () => {
            const contentEl = msgEl.querySelector(".message-content");
            if (contentEl) contentEl.innerHTML = renderMarkdown(content || "(空応答)");
          }
        );

        return content;
      } catch (e) {
        const contentEl = msgEl.querySelector(".message-content");
        if (e && e.name === "AbortError") {
          const currentContent = updateContent(null);
          if (contentEl) contentEl.innerHTML = renderMarkdown(currentContent + "\n\n⏹ **生成を停止しました。**");
        } else {
          if (contentEl) contentEl.textContent = `エラー: ${e?.message || e}`;
        }
        return "";
      }
    };

    try {
      const [resultA] = await Promise.all([
        streamModel(modelA, messageA, (c) => { if (c !== null) contentA = c; return contentA; }),
        streamModel(modelB, messageB, (c) => { if (c !== null) contentB = c; return contentB; }),
      ]);

      // Save only main model's response to history
      state.messages.push(userMessageForHistory);
      state.messages.push({ role: "assistant", content: resultA || "(比較モード)" });
      persistHistory();
    } catch (e) {
      if (e && e.name === "AbortError") {
        state.messages.push(userMessageForHistory);
        state.messages.push({ role: "assistant", content: contentA || "(比較モード - 停止)" });
        persistHistory();
      }
    } finally {
      state.isStreaming = false;
      state.userScrolledDuringStream = false;
      el.stopBtn.disabled = true;
      el.stopBtn.hidden = true;
      el.send.disabled = false;
      runtime.controller = null;
    }
  }

  // ===================================================================
  // Section 24: ヘルプモード
  // ===================================================================

  const APP_MANUAL_CONTENT = `
# Local LLM Chat v2.1 使い方ガイド

## 概要
Local LLM Chatは、ローカルで動作するLLMサーバー（LM Studio、Ollamaなど）と連携するWebベースのチャットアプリです。完全オフラインで動作し、プライバシーを重視した設計です。すべてのデータはブラウザのlocalStorageに保存され、外部に送信されることはありません。

## 起動方法（3ステップ）
1. **LM Studioを起動し、モデルをロード**（自動でAPIが有効になる）
2. **local_llm_chat_v2.1.html をブラウザで開く**
3. **モデルが自動的にドロップダウンに表示** → 会話開始！

**疎通確認**: うまくいかない場合はターミナルで実行:
\`curl http://localhost:1234/v1/models\`

## 画面構成

### ヘッダー（上部バー）
半透明のぼかし効果付きバーで、以下の要素が配置されています：
- **左端**: 「Local LLM Chat」タイトル
- **中央**: モデル選択ドロップダウン（クリックでモデル一覧を自動更新、👁️マークはVision対応モデル）
  - 比較モードON時は「vs」ラベルと比較モデル選択も表示
- **右端のボタン群**:
  - 🆕 **新しい話題**: AIへの会話履歴送信をリセット（画面上の会話は保持、区切り線を表示）
  - 🗑️ **クリア**: 画面上の全会話を削除
  - ••• **その他メニュー**（クリックでドロップダウン表示）:
    - 💾 エクスポート: 会話履歴をJSONファイルで保存
    - 📥 インポート: JSONファイルから会話履歴を復元
    - 📊 比較モード: 2つのモデルの回答を並べて比較
    - ❓ ヘルプモード: アプリの使い方をLLMに質問（このモード）
  - ⚙️ **設定**: 設定パネルを右から開く

### チャットエリア（中央）
メッセージが表示される領域です：
- **ユーザーメッセージ**: 右寄せ、淡いインディゴの背景
- **AIアシスタントメッセージ**: 左寄せ、左にインディゴのアクセントボーダー、「🤖 Assistant」ラベル付き
- **コードブロック**: ダーク背景、ヘッダーに言語名とCopyボタン付き
- **メッセージ操作**: マウスを乗せると表示される浮動ツールバー
  - 📋 コピー: テキストをクリップボードにコピー
  - 🗑 削除: メッセージを削除
  - ✏️ 編集（ユーザーのみ）: メッセージを編集して再送信（以降の会話は削除される）
  - 🔄 再生成（AIのみ）: 同じ質問でAI応答を再生成
  - 🏥 医学用語チェック（AIのみ）: AI応答の医学用語の正確性を別途チェック

### 入力エリア（下部フローティングカード）
画面下部に浮かぶ角丸カード型の入力エリアです：
- **📎 添付ボタン**: クリックで添付メニューを表示
  - 📷 画像を添付: Vision対応モデルで画像認識（複数可、ペースト/ドラッグ＆ドロップにも対応）
  - 📎 ファイルを添付: テキスト/PDFファイルの内容を送信
- **テキスト入力欄**: メッセージを入力（オートリサイズ）
- **▲ 送信ボタン**: 入力があると有効になる丸型ボタン
- **アクション行**:
  - 🔍 深掘り: ONにすると深い分析を促す指示が追加される
  - 📋 Preset: プリセットプロンプト一覧を表示
  - ⏹ Stop: ストリーミング中のみ表示、生成を中断

### プリセットパネル（ポップアップ）
📋 Presetボタンで表示されるポップアップ。定型プロンプトを選んで入力欄に挿入できます。
デフォルトのプリセット:
- 🏥 疾患解説
- 💊 鑑別診断
- 📄 文章要約
- 📝 論文査読
- 📈 統計解析
- ✉️ 英文メール作成
設定パネルの「詳細」タブでプリセットの編集・追加・削除が可能です。

### 設定パネル（右からスライド表示）
⚙️ボタンで右から開くパネル。3つのタブがあります：
- **基本タブ**: ダークモード、Base URL、API Key、Temperature、Max Tokens、送信キー設定
- **応答タブ**: 応答スタイル（簡潔/標準/詳細/専門的）、ユーザープロフィール（専門レベル/職業/興味）、System Prompt（プリセット保存・切替可能）
- **詳細タブ**: 信頼度・代替候補表示ON/OFF、モデル自動アンロードON/OFF、表示モデル管理、プリセット編集、データ管理（設定リセット/全データクリア）

## 主な機能

### チャット機能
- **ストリーミング応答**: リアルタイムでAIの回答を表示（考え中はドットアニメーション、生成中はカーソル点滅）
- **Markdown対応**: コードブロック（言語ラベル＋Copyボタン付き）、リスト、表、リンクなどを整形表示
- **メッセージ操作**: ホバーで表示される浮動ツールバーからCopy/Delete/Edit/Regenerate/医学用語チェック

### 画像・ファイル添付
- **画像添付**: Vision対応モデル（👁️マーク付き）で画像認識
  - 📎ボタン → 📷画像を添付、Ctrl+Vペースト、ドラッグ＆ドロップの3通り
  - 複数画像の同時添付可能、サムネイルプレビュー表示
  - サイズ制限: 20MB以下
- **ファイル添付**: テキストファイルやPDFの内容を送信
  - 対応形式: .txt, .md, .json, .csv, .xml, .html, .css, .js, .py, .pdf など
  - PDF: テキスト抽出してLLMに送信
  - サイズ制限: テキスト2MB、PDF10MB

### 表示モデル管理
設定 → 詳細タブの「表示モデル管理」で、ドロップダウンに表示するモデルを絞り込めます：
- 「🔄 モデル一覧を取得」で全モデルをチェックボックスリストに表示
- 表示したいモデルにチェックを入れる（外すとドロップダウンから非表示）
- 「全選択」「全解除」で一括操作可能
- フィルター設定はlocalStorageに保存され、次回起動時も維持
- 多数のモデルをダウンロードしている場合に便利

### モデル比較機能
•••メニュー → 📊比較モードをONにすると、2つのモデルの回答を並べて比較できます：
- ヘッダー中央にメインモデルと比較モデルの2つのドロップダウンが表示
- 同じ質問を2つのモデルに同時送信、並列ストリーミングで両方リアルタイム表示
- **要件**: LM Studio v0.4.0以降、複数モデル同時ロード、「JIT models auto-evict」をOFF
- **注意**: 比較モード使用時は「モデル自動アンロード」をOFFに

### 深掘りモード
🔍ボタンで有効化。ONの間、送信するメッセージに深い分析を促す指示が自動追加されます：
- 根本的な原因や背景の分析
- 異なる視点や解釈の可能性
- 関連する概念や理論との繋がり
- 実践的な応用や次のステップ
※ ページリロードでOFFに戻ります

### 新しい話題
🆕ボタンで、AIへの会話履歴送信がリセットされます：
- 画面上の会話は保持され、区切り線が表示
- 話題を変えた際に前の回答が繰り返されることを防止
- 🗑️クリアとの違い: クリアは画面も全削除、新しい話題は画面を保持しAI文脈のみリセット

### ヘルプモード
•••メニュー → ❓ヘルプモードをONにすると、このアプリの使い方をLLMに質問できます。ONの間、このマニュアル内容がシステムプロンプトに含まれ、LLMがマニュアルを参照して回答します。
※ ページリロードでOFFに戻ります

### 信頼度・代替候補表示（オプション）
設定 → 詳細タブ → 「📊 信頼度・代替候補を表示」をONにすると：
- **信頼度**: AIの回答の確信度をパーセンテージで表示（高=緑、中=黄、低=赤）
- **代替候補**: AIが各単語を選ぶ際に検討した他の候補を表示
- LM Studio v0.3.39以降のOpen Responses API（logprobs）が必要

### 医学用語チェック
AI応答のホバーメニューから🏥ボタンで、医学用語の正確性をLLMでチェック。修正案がある場合はモーダルで表示され、修正を適用できます。

### System Promptプリセット
設定 → 応答タブで、System Promptを複数保存・切替できます。💾ボタンで保存、ドロップダウンで切替、🗑ボタンで削除。

## 設定項目

### 基本タブ
- 🌙 ダークモード: ダーク/ライトの切替（デフォルト: OFF）
- 🔗 Base URL: LLMサーバーのURL（デフォルト: http://localhost:1234/v1、Ollama: http://localhost:11434/v1）
- 🔑 API Key: 認証キー（デフォルト: lmstudio、通常変更不要）
- Temperature: 創造性（0=安定、2=創造的、デフォルト: 0.7）
- Max Tokens: 最大出力トークン数（デフォルト: 2048）
- 送信キー: 「Enterで送信」または「Ctrl+Enterで送信」

### 応答タブ
- 応答スタイル: 簡潔（要点のみ）/標準（バランス型）/詳細（背景・具体例含む）/専門的（技術的詳細重視）
- ユーザープロフィール: 専門レベル（初心者〜専門家）、職業/専門分野、興味・関心
- System Prompt: カスタマイズ可能、プリセット保存・切替対応

### 詳細タブ
- 📊 信頼度・代替候補を表示: LM Studio v0.3.39以降が必要
- 🔄 モデル自動アンロード: モデル切替時にメモリ節約（デフォルト: OFF）
- プリセット編集: プリセットの追加・編集・削除・リセット
- データ管理: 設定をデフォルトに戻す、すべての保存データを削除

## キーボードショートカット
| ショートカット | 動作 |
|---|---|
| Enter | メッセージ送信（設定による） |
| Ctrl/Cmd+Enter | メッセージ送信（設定による） |
| Shift+Enter | 改行 |
| Ctrl/Cmd+V | 画像をペースト |
| Ctrl/Cmd+K | 履歴クリア |
| Esc | 設定パネル/プリセットパネルを閉じる |

## トラブルシューティング

### モデルが表示されない
1. LM Studioでモデルがロードされているか確認
2. curlで疎通確認: \`curl http://localhost:1234/v1/models\`
3. モデル選択ドロップダウンをクリックして更新

### 比較機能が動作しない
1. 2つのモデルがLM Studioでロードされているか確認
2. LM Studio Developers設定の「JIT models auto-evict」がOFFか確認
3. 「モデル自動アンロード」をOFFにする

### 画像が認識されない
1. Vision対応モデル（👁️マーク付き）を選択しているか確認
2. 画像サイズが20MB以下か確認
3. 高品質な認識には30B以上のモデルを推奨

### 応答が遅い・途切れる
1. Max Tokensを減らす
2. より小さいモデルに変更
3. PCのメモリ使用状況を確認

### 接続エラーが発生する
1. LM Studioでモデルがロードされているか確認（最重要）
2. 設定のBase URLが正しいか確認

## よくある質問
- **データはどこに保存？** → ブラウザのlocalStorage（外部送信なし、プライベートモードでは保存されない）
- **会話履歴の共有は？** → •••メニュー → エクスポート/インポートで可能
- **新しい話題とクリアの違い？** → 新しい話題は画面保持でAI文脈リセット、クリアは全削除
- **APIに送信されるメッセージ数は？** → 最後の6メッセージ（システムプロンプト含む）のみ。全履歴はlocalStorageに保存
- **Ollamaを使いたい場合は？** → 設定のBase URLを http://localhost:11434/v1 に変更
- **ダークモードの切り替えは？** → ⚙️設定 → 基本タブ → 🌙 ダークモード

## 免責事項
本ソフトウェアは「現状有姿」で無償提供されています。AI出力は参考情報であり、重要な判断には専門家への相談をお願いします。
`.trim();

  function toggleHelpMode() {
    state.helpMode = !state.helpMode;

    if (el.helpBtn) {
      el.helpBtn.classList.toggle("active", state.helpMode);
      el.helpBtn.textContent = state.helpMode ? "❓ ヘルプ ON" : "❓ ヘルプモード";
    }

    if (state.helpMode) {
      notify("❓ ヘルプモード ON - アプリの使い方を質問してください");
    } else {
      notify("❓ ヘルプモード OFF");
    }

    closeAllDropdowns();
  }

  // ===================================================================
  // Section 25: 医学用語チェック
  // ===================================================================

  const MEDICAL_TERM_CHECK_PROMPT = `あなたは医学用語の専門家です。以下のAI応答に含まれる医学用語をチェックし、誤りがあれば指摘してください。

AI応答テキスト:
"""
{TEXT}
"""

以下のJSON形式で回答してください（他の文章は不要）:
{
  "hasIssues": true/false,
  "issues": [
    {
      "original": "誤った用語または表現",
      "suggested": "正しい用語または表現",
      "reason": "理由"
    }
  ]
}

注意:
- 明らかな誤りのみ指摘してください（略語、俗語、一般的な表現は許容）
- 医学的に不正確な記述や誤解を招く表現を重点的にチェック
- 問題がなければ hasIssues: false を返してください
- 必ず有効なJSONのみを返してください`;

  /**
   * 医学用語チェックを実行
   * @param {string} text
   * @returns {Promise<{hasIssues:boolean, issues:Array}|null>}
   */
  async function checkMedicalTerminology(text) {
    const base = trimTrailingSlashes(state.settings.baseUrl || "http://localhost:1234/v1");
    const key = state.settings.apiKey || "lmstudio";
    const model = el.modelSelect.value || state.settings.model;

    if (!model || !text.trim()) return null;

    const checkPrompt = MEDICAL_TERM_CHECK_PROMPT.replace("{TEXT}", text);

    try {
      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: checkPrompt }],
          temperature: 0.3,
          max_tokens: 1024,
        }),
      });

      if (!res.ok) {
        console.error("Medical term check failed:", res.status);
        return null;
      }

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content || "";

      let jsonStr = content;
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) jsonStr = jsonMatch[1];

      const jsonStart = jsonStr.indexOf("{");
      const jsonEnd = jsonStr.lastIndexOf("}");
      if (jsonStart !== -1 && jsonEnd !== -1) {
        jsonStr = jsonStr.slice(jsonStart, jsonEnd + 1);
      }

      return JSON.parse(jsonStr);
    } catch (e) {
      console.error("Medical term check error:", e);
      return null;
    }
  }

  /**
   * 医学用語チェックモーダルを表示
   * @param {{hasIssues:boolean, issues:Array}} checkResult
   */
  function showTermCheckModal(checkResult) {
    let contentHtml = "";
    if (checkResult.issues && checkResult.issues.length > 0) {
      contentHtml = "<ul style='margin:0;padding-left:20px'>";
      for (const issue of checkResult.issues) {
        contentHtml += `<li style="margin-bottom:8px">
          <strong style="color:var(--color-error, #dc3545)">${escapeHtml(issue.original)}</strong> →
          <strong style="color:var(--color-success, #28a745)">${escapeHtml(issue.suggested)}</strong>
          ${issue.reason ? `<br><small style="opacity:0.7">${escapeHtml(issue.reason)}</small>` : ""}
        </li>`;
      }
      contentHtml += "</ul>";
    } else {
      contentHtml = "<p style='color:var(--color-success, #28a745);margin:0'>✅ AI応答の医学用語に問題は見つかりませんでした。</p>";
    }

    el.termCheckContent.innerHTML = contentHtml;

    if (el.termCheckCorrected) el.termCheckCorrected.hidden = true;
    if (el.termCheckApply) el.termCheckApply.hidden = true;
    if (el.termCheckCancel) el.termCheckCancel.hidden = true;

    el.termCheckModal.hidden = false;
  }

  /**
   * AI応答の医学用語をチェック（Checkボタンから呼び出し）
   * @param {string} responseText
   */
  async function performPostResponseTermCheck(responseText) {
    if (!responseText || responseText.length === 0) return;

    notify("🏥 医学用語をチェック中...");

    try {
      const checkResult = await checkMedicalTerminology(responseText);

      if (checkResult && checkResult.hasIssues && checkResult.issues && checkResult.issues.length > 0) {
        notify("⚠️ 医学用語に注意が必要な箇所があります");
        showTermCheckModal(checkResult);
      } else {
        notify("✅ 医学用語チェック完了（問題なし）");
      }
    } catch (e) {
      console.error("Post-response term check error:", e);
    }
  }

  // ===================================================================
  // Section 26: Settings Panel UI
  // ===================================================================

  function saveSettingsFromUI() {
    state.settings.baseUrl = el.baseUrl?.value?.trim() || DEFAULT_SETTINGS.baseUrl;
    state.settings.apiKey = el.apiKey?.value?.trim() || DEFAULT_SETTINGS.apiKey;
    state.settings.temperature = parseFloat(el.temperature?.value) || DEFAULT_SETTINGS.temperature;
    state.settings.maxTokens = parseInt(el.maxTokens?.value, 10) || DEFAULT_SETTINGS.maxTokens;
    state.settings.sendKey = el.sendKey?.value || DEFAULT_SETTINGS.sendKey;
    state.settings.responseStyle = el.responseStyle?.value || DEFAULT_SETTINGS.responseStyle;
    state.settings.userLevel = el.userLevel?.value || "";
    state.settings.userProfession = el.userProfession?.value?.trim() || "";
    state.settings.userInterests = el.userInterests?.value?.trim() || "";
    state.settings.systemPrompt = el.systemPrompt?.value || DEFAULT_SYSTEM_PROMPT;
    saveSettings();
  }

  function openSettingsPanel() {
    el.settingsOverlay.hidden = false;
    el.settingsPanel.hidden = false;
    requestAnimationFrame(() => {
      el.settingsOverlay.classList.add("visible");
      el.settingsPanel.classList.add("open");
    });
  }

  function closeSettingsPanel() {
    el.settingsOverlay.classList.remove("visible");
    el.settingsPanel.classList.remove("open");
    setTimeout(() => {
      el.settingsOverlay.hidden = true;
      el.settingsPanel.hidden = true;
    }, 300);
    saveSettingsFromUI();
  }

  function switchTab(tabName) {
    document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === tabName));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.toggle("active", c.id === `tab-${tabName}`));
  }

  // ===================================================================
  // Section 25: Toggle Switch
  // ===================================================================

  function setupToggle(toggleEl, onChange) {
    if (!toggleEl) return;
    toggleEl.addEventListener("click", (e) => {
      e.preventDefault();
      const isActive = toggleEl.classList.toggle("active");
      toggleEl.setAttribute("aria-checked", String(isActive));
      const cb = toggleEl.querySelector("input[type=checkbox]");
      if (cb) cb.checked = isActive;
      if (onChange) onChange(isActive);
      saveSettings();
    });
    toggleEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleEl.click();
      }
    });
  }

  // ===================================================================
  // Section 26: Dropdown Menu
  // ===================================================================

  function toggleDropdown(menuEl, anchorEl) {
    if (!menuEl.hidden) {
      menuEl.hidden = true;
      return;
    }
    const rect = anchorEl.getBoundingClientRect();
    menuEl.style.top = `${rect.bottom + 4}px`;
    menuEl.style.right = `${window.innerWidth - rect.right}px`;
    menuEl.hidden = false;
  }

  function closeAllDropdowns() {
    document.querySelectorAll(".dropdown-menu").forEach(m => m.hidden = true);
  }

  // ===================================================================
  // Section 27: イベント配線
  // ===================================================================

  function wireEvents() {
    // Close dropdowns on outside click
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".dropdown-menu") && !e.target.closest("#moreBtn") && !e.target.closest("#attachBtn")) {
        closeAllDropdowns();
      }
    });

    // Settings panel
    el.settingsBtn?.addEventListener("click", openSettingsPanel);
    el.closeSettingsBtn?.addEventListener("click", closeSettingsPanel);
    el.settingsOverlay?.addEventListener("click", closeSettingsPanel);

    // Tabs
    document.querySelectorAll(".tab").forEach(tab => {
      tab.addEventListener("click", () => switchTab(tab.dataset.tab));
    });

    // More menu
    el.moreBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleDropdown(el.moreMenu, el.moreBtn);
    });

    // Attach menu (上方向に開く)
    el.attachBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!el.attachMenu.hidden) {
        el.attachMenu.hidden = true;
        return;
      }
      closeAllDropdowns();
      const rect = el.attachBtn.getBoundingClientRect();
      el.attachMenu.style.top = "auto";
      el.attachMenu.style.bottom = `${window.innerHeight - rect.top + 4}px`;
      el.attachMenu.style.left = `${rect.left}px`;
      el.attachMenu.style.right = "auto";
      el.attachMenu.hidden = false;
    });
    el.attachImageBtn?.addEventListener("click", () => {
      closeAllDropdowns();
      el.imageInput?.click();
    });
    el.attachFileBtn?.addEventListener("click", () => {
      closeAllDropdowns();
      el.fileInput?.click();
    });
    el.imageInput?.addEventListener("change", (e) => {
      handleImagesSelected(e.target.files);
    });
    el.fileInput?.addEventListener("change", (e) => {
      handleFilesSelected(e.target.files);
    });

    // Toggles
    setupToggle(el.darkModeToggle, applyDarkMode);
    setupToggle(el.showLogprobsToggle, (v) => { state.settings.showLogprobs = v; });
    setupToggle(el.autoUnloadToggle, (v) => { state.settings.autoUnload = v; });

    // Temperature slider
    el.temperature?.addEventListener("input", () => {
      el.tempValue.textContent = el.temperature.value;
    });

    // Textarea auto-resize + send button state
    el.prompt?.addEventListener("input", () => {
      // Auto-resize
      el.prompt.style.height = "auto";
      el.prompt.style.height = Math.min(el.prompt.scrollHeight, 200) + "px";
      // Send button active state
      const hasContent = el.prompt.value.trim().length > 0 || state.attachments.length > 0;
      el.send.classList.toggle("active", hasContent);
      el.send.disabled = !hasContent;
      // Draft save
      scheduleDraftSave();
    });

    // Escape key
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeSettingsPanel();
        closeAllDropdowns();
        if (el.presetPanel) el.presetPanel.hidden = true;
      }
    });

    // Preset panel
    el.presetBtn?.addEventListener("click", () => {
      if (el.presetPanel) el.presetPanel.hidden = !el.presetPanel.hidden;
    });
    el.closePresetBtn?.addEventListener("click", () => {
      if (el.presetPanel) el.presetPanel.hidden = true;
    });

    // Model select: throttled refresh on click
    let modelRefreshThrottle = 0;
    el.modelSelect?.addEventListener("mousedown", () => {
      const now = Date.now();
      if (now - modelRefreshThrottle >= MODEL_REFRESH_THROTTLE) {
        modelRefreshThrottle = now;
        refreshModels();
      }
    });

    // Model select: handle change
    let previousModelId = el.modelSelect?.value || "";
    el.modelSelect?.addEventListener("focus", () => {
      previousModelId = el.modelSelect.value;
    });
    el.modelSelect?.addEventListener("change", () => {
      handleModelChange(previousModelId);
      previousModelId = el.modelSelect.value;
    });

    // Send / Stop
    el.send?.addEventListener("click", handleSend);
    el.stopBtn?.addEventListener("click", handleStop);

    // New topic / Clear
    el.newTopicBtn?.addEventListener("click", handleNewTopic);
    el.clearBtn?.addEventListener("click", handleClear);

    // Keyboard: Enter / Ctrl+Enter to send
    el.prompt?.addEventListener("keydown", (e) => {
      if (e.isComposing || e.keyCode === 229) return;
      const sendKeyMode = state.settings.sendKey || "enter";
      if (e.key === "Enter") {
        if (sendKeyMode === "enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          el.send.click();
        } else if (sendKeyMode === "ctrl-enter" && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
          e.preventDefault();
          el.send.click();
        }
      }
    });

    // Smart scroll detection during streaming
    el.chat?.addEventListener("scroll", () => {
      if (state.isStreaming && !isNearBottom()) {
        state.userScrolledDuringStream = true;
      }
    });

    // Deep dive
    el.deepDiveBtn?.addEventListener("click", toggleDeepDive);

    // Compare mode
    el.compareBtn?.addEventListener("click", toggleCompareMode);

    // Help mode
    el.helpBtn?.addEventListener("click", toggleHelpMode);

    // More menu items
    el.exportBtn?.addEventListener("click", exportHistory);
    el.importBtn?.addEventListener("click", importHistory);
    el.importInput?.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (file) handleImportFile(file);
    });

    // Preset editor (Settings > 詳細 tab)
    el.presetEditSelect?.addEventListener("change", loadPresetToEditor);
    el.savePresetBtn?.addEventListener("click", savePresetFromEditor);
    el.resetPresetBtn?.addEventListener("click", resetPresetToDefault);
    el.deletePresetBtn?.addEventListener("click", deleteSelectedPreset);
    el.addPresetBtn?.addEventListener("click", addNewPreset);
    el.resetAllPresetsBtn?.addEventListener("click", resetAllPresets);

    // System prompt presets
    el.systemPromptPresetSelect?.addEventListener("change", (e) => {
      applySystemPromptPreset(e.target.value);
    });
    el.saveSystemPromptPresetBtn?.addEventListener("click", saveCurrentAsSystemPromptPreset);
    el.deleteSystemPromptPresetBtn?.addEventListener("click", deleteSelectedSystemPromptPreset);

    // Settings data management
    el.resetSettingsBtn?.addEventListener("click", resetSettings);
    el.clearAllDataBtn?.addEventListener("click", clearAllData);

    // Model filter
    el.fetchModelsForFilterBtn?.addEventListener("click", async () => {
      el.fetchModelsForFilterBtn.disabled = true;
      el.fetchModelsForFilterBtn.textContent = "⏳ 取得中...";
      try {
        await refreshModels();
        const allIds = [...runtime.availableModels].sort((a, b) => {
          const nameA = a.replace(/^.*\//, "").toLowerCase();
          const nameB = b.replace(/^.*\//, "").toLowerCase();
          return nameA.localeCompare(nameB);
        });
        renderModelFilterList(allIds);
      } finally {
        el.fetchModelsForFilterBtn.disabled = false;
        el.fetchModelsForFilterBtn.textContent = "🔄 モデル一覧を取得";
      }
    });
    el.selectAllModelsBtn?.addEventListener("click", () => {
      if (!el.modelFilterList) return;
      el.modelFilterList.querySelectorAll("input[type=checkbox]").forEach(cb => { cb.checked = true; });
      state.modelFilter = [];
      saveModelFilter();
      refreshModels();
    });
    el.deselectAllModelsBtn?.addEventListener("click", () => {
      if (!el.modelFilterList) return;
      el.modelFilterList.querySelectorAll("input[type=checkbox]").forEach(cb => { cb.checked = false; });
      state.modelFilter = [];
      saveModelFilter();
      refreshModels();
    });

    // Term check modal close
    el.termCheckAsIs?.addEventListener("click", () => {
      if (el.termCheckModal) el.termCheckModal.hidden = true;
    });
    el.termCheckClose?.addEventListener("click", () => {
      if (el.termCheckModal) el.termCheckModal.hidden = true;
    });
  }

  // ===================================================================
  // Section 28: 初期化
  // ===================================================================

  function init() {
    cacheDomRefs();
    migrateStorageKeys();
    setupMarkdown();
    loadSettings();
    loadHistory();
    loadCustomPresets();
    loadSystemPromptPresets();
    loadModelFilter();
    loadDraft();

    applyDarkMode(state.settings.darkMode);
    applySettingsToUI();
    renderHistoryFromStorage();
    renderPresetUI();
    updateSystemPromptPresetSelect();
    loadPresetToEditor();
    refreshModels();

    wireEvents();

    console.log("Local LLM Chat v2.1 initialized");
  }

  // ===================================================================
  // 起動
  // ===================================================================

  document.addEventListener("DOMContentLoaded", init);
})();
