/**
 * Local LLM Chat v1.6.2
 * =====================
 * OpenAI互換API向けの簡易チャットUIです。
 *
 * 主なAPI:
 *   - GET  {baseUrl}/models
 *   - POST {baseUrl}/chat/completions  (SSE stream: "data: {...}\n\n")
 *
 * 永続化（localStorage）:
 *   - chatHistory_v1.6   : 会話履歴（配列）
 *   - chatSettings_v1.6  : 設定（Base URL / Key / temperature 等）
 *   - chatPresets_v1.6   : プリセットのカスタム文面
 *
 * v1.6 新機能:
 *   - 設定リセット機能
 *   - 全データクリア機能
 *   - 日本語化システムプロンプト
 *
 * v1.6.1 新機能 (2025-12-22):
 *   - Vision対応モデルの表示（👁️アイコン）
 *   - モデル一覧のアルファベット順ソート
 *   - 画像添付のサムネイルプレビュー
 *   - ユーザーメッセージの編集機能
 *   - 深掘りモード（より詳細な回答を促す）
 *
 * v1.6.2 バグ修正 (2025-12-23):
 *   - 重複メッセージ送信バグの修正
 *   - ストリーミングエラー時のコンテンツ保持
 *   - キャッシュバスティング追加
 *   - デバッグログ機能
 */
(() => {
  "use strict";

  /** @typedef {"user"|"assistant"|"system"} Role */
  /**
   * @typedef {Object} StoredMessage
   * @property {Role} role
   * @property {string} content
   * @property {string=} imageData  - user添付画像（DataURL）
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
   */

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------

  const STORAGE_KEYS = Object.freeze({
    HISTORY: "chatHistory_v1.6",
    SETTINGS: "chatSettings_v1.6",
    PRESETS: "chatPresets_v1.6",
    DRAFT: "chatDraft_v1.6",
    PRESET_LABELS: "chatPresetLabels_v1.6",
  });

  const LIMITS = Object.freeze({
    IMAGE_MAX_BYTES: 20 * 1024 * 1024,  // 20MB
    FILE_MAX_BYTES:  1 * 1024 * 1024,   // 1MB
    PDF_MAX_BYTES:   5 * 1024 * 1024,   // 5MB
    MAX_HISTORY_FOR_API: 12,            // system + last N-1 turns（実送信は userMessage を別途追加）
    MAX_TEXTAREA_PX: 240,
    MIN_TEXTAREA_PX: 56,
  });

  // /v1/models から取得したIDのうち、埋め込み系を除外するためのキーワード
  const EMBEDDING_KEYWORDS = Object.freeze(["embed", "embedding", "bge", "e5-", "gte-", "jina"]);

  // Vision対応モデルを識別するためのキーワード（小文字で比較）
  const VISION_KEYWORDS = Object.freeze([
    "vision",       // llama-3.2-11b-vision, phi-3-vision
    "llava",        // LLaVA models
    "gemma-3",      // Google Gemma 3 (multimodal)
    "pixtral",      // Mistral Pixtral
    "devstral",     // Mistral Devstral (vision)
    "magistral",    // Mistral Magistral (vision)
    "qwen3-vl",     // Qwen3-VL
    "qwen2-vl",     // Qwen2-VL
    "qwen-vl",      // Qwen-VL
    "bakllava",     // BakLLaVA
    "obsidian",     // Obsidian vision model
    "moondream",    // Moondream vision model
    "minicpm-v",    // MiniCPM-V
    "cogvlm",       // CogVLM
    "glm-4v",       // GLM-4V
    "glm-4.6v",     // GLM-4.6V (zai-org/glm-4.6v-flash)
    "internlm-xcomposer", // InternLM-XComposer
  ]);

  // デフォルト設定値
  const DEFAULT_SETTINGS = Object.freeze({
    baseUrl: "http://localhost:1234/v1",
    apiKey: "lmstudio",
    model: null,
    temperature: 0.7,
    maxTokens: 2048,
    systemPrompt: "あなたは放射線画像診断、技術、研究のエキスパートアシスタントです。日本語で簡潔でバランスの取れたアドバイスを提供してください。フォーマルとカジュアルのバランスを保ち、専門用語は英語（日本語）の形式で表記してください。",
    responseStyle: "standard",
    sendKey: "enter",
    userLevel: "",
    userProfession: "",
    userInterests: "",
    darkMode: false,
  });

  // ---------------------------------------------------------------------------
  // DOM (single source of truth)
  // ---------------------------------------------------------------------------

  const el = Object.freeze({
    // main
    chat: document.getElementById("chat"),
    modelSelect: document.getElementById("modelSelect"),
    prompt: document.getElementById("prompt"),
    sendBtn: document.getElementById("send"),
    stopBtn: document.getElementById("stopBtn"),
    refreshBtn: document.getElementById("refreshBtn"),
    clearBtn: document.getElementById("clearBtn"),
    exportBtn: document.getElementById("exportBtn"),

    // settings
    settingsBtn: document.getElementById("settingsBtn"),
    settingsPanel: document.getElementById("settingsPanel"),
    closeSettingsBtn: document.getElementById("closeSettingsBtn"),
    baseUrl: document.getElementById("baseUrl"),
    apiKey: document.getElementById("apiKey"),
    temperature: document.getElementById("temperature"),
    tempValue: document.getElementById("tempValue"),
    maxTokens: document.getElementById("maxTokens"),
    systemPrompt: document.getElementById("systemPrompt"),
    responseStyle: document.getElementById("responseStyle"),
    sendKey: document.getElementById("sendKey"),
    userLevel: document.getElementById("userLevel"),
    userProfession: document.getElementById("userProfession"),
    userInterests: document.getElementById("userInterests"),
    darkModeToggle: document.getElementById("darkModeToggle"),

    // v1.6: data management
    resetSettingsBtn: document.getElementById("resetSettingsBtn"),
    clearAllDataBtn: document.getElementById("clearAllDataBtn"),

    // attachments (multiple files support)
    imageInput: document.getElementById("imageInput"),
    fileInput: document.getElementById("fileInput"),
    attachmentList: document.getElementById("attachmentList"),

    // deep dive mode
    deepDiveBtn: document.getElementById("deepDiveBtn"),

    // preset (panel + editor)
    presetPanel: document.getElementById("presetPanel"),
    presetBtn: document.getElementById("presetBtn"),
    closePresetBtn: document.getElementById("closePresetBtn"),
    presetEditSelect: document.getElementById("presetEditSelect"),
    newPresetName: document.getElementById("newPresetName"),
    addPresetBtn: document.getElementById("addPresetBtn"),
    presetEditText: document.getElementById("presetEditText"),
    savePresetBtn: document.getElementById("savePresetBtn"),
    resetPresetBtn: document.getElementById("resetPresetBtn"),
    deletePresetBtn: document.getElementById("deletePresetBtn"),
    resetAllPresetsBtn: document.getElementById("resetAllPresetsBtn"),

    presetList: document.getElementById("presetList"),
  });

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  /** @type {{controller: AbortController|null, availableModels:Set<string>}} */
  const runtime = {
    controller: null,          // Stopボタン用
    availableModels: new Set() // /v1/models の正確なID一覧
  };

  /**
   * @typedef {Object} AttachmentItem
   * @property {string} id - 一意識別子
   * @property {"image"|"file"} type - 添付タイプ
   * @property {string} name - ファイル名
   * @property {string} data - DataURL or テキストデータ
   * @property {number} size - ファイルサイズ
   */

  /** @type {AttachmentItem[]} */
  let attachments = [];

  /** @type {StoredMessage[]} */
  let messages = [];

  /** @type {Settings} */
  let settings = /** @type {any} */ ({});

  /** @type {Record<string,string>} */
  let customPresets = {};
  /** @type {Record<string,string>} */
  let customPresetLabels = {};

  let draftSaveTimer = null;

  /** 深掘りモードが有効かどうか */
  let deepDiveMode = false;

  // ---------------------------------------------------------------------------
  // Markdown (marked) - safe-ish renderer tweaks
  // ---------------------------------------------------------------------------

  function setupMarkdown() {
    marked.setOptions({ breaks: true, gfm: true });

    // リンクを必ず別タブで開く（rel も付与）
    const renderer = new marked.Renderer();
    const origLink = renderer.link.bind(renderer);
    renderer.link = (href, title, text) =>
      origLink(href, title, text).replace(
        "<a ",
        '<a target="_blank" rel="noopener noreferrer" '
      );

    marked.use({ renderer, mangle: false, headerIds: false });
  }

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------

  /** @param {string} raw */
  function trimTrailingSlashes(raw) {
    return String(raw || "").replace(/\/+$/, "");
  }

  /** @param {string} text */
  function safeJSONParse(text, fallback) {
    try {
      return JSON.parse(text);
    } catch {
      return fallback;
    }
  }

  /** @param {unknown} err */
  function isLikelyServerOffline(err) {
    if (!err) return false;
    const msg = String(err);
    return err.name === "TypeError" || msg.includes("Failed to fetch") || msg.includes("NetworkError");
  }

  /**
   * モデルIDがVision対応かどうかを判定
   * @param {string} modelId
   * @returns {boolean}
   */
  function isVisionModel(modelId) {
    const lower = String(modelId).toLowerCase();
    return VISION_KEYWORDS.some(k => lower.includes(k));
  }

  /** @param {string} message */
  function notify(message) {
    appendMessage("system", message, { save: false });
  }

  function scrollToBottom() {
    el.chat.scrollTop = el.chat.scrollHeight;
  }

  /**
   * テキストエリアの高さを内容に合わせて伸縮させる
   * @param {HTMLTextAreaElement} ta
   */
  function autoResizeTextarea(ta) {
    ta.style.height = `${LIMITS.MIN_TEXTAREA_PX}px`;
    const newHeight = Math.min(ta.scrollHeight, LIMITS.MAX_TEXTAREA_PX);
    ta.style.height = `${newHeight}px`;
  }

  /**
   * 入力欄の「最後の1文字が残る」系のブラウザ挙動を避けるための強いクリア
   * （元実装の手順をそのまま整理）
   */
  function strongClearPrompt() {
    el.prompt.value = "";
    clearDraft();
    el.prompt.dispatchEvent(new Event("input", { bubbles: true }));
    el.prompt.setSelectionRange(0, 0);
    el.prompt.blur();
    setTimeout(() => { el.prompt.value = ""; }, 0);
    setTimeout(() => { el.prompt.focus(); }, 10);
  }

  // ---------------------------------------------------------------------------
  // localStorage: settings/history/presets
  // ---------------------------------------------------------------------------

  /** @returns {Settings} */
  function loadSettings() {
    const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS) || "{}";
    const s = safeJSONParse(raw, {});
    return /** @type {Settings} */ ({
      baseUrl: s.baseUrl || DEFAULT_SETTINGS.baseUrl,
      apiKey: s.apiKey || DEFAULT_SETTINGS.apiKey,
      model: s.model,
      temperature: (typeof s.temperature === "number") ? s.temperature : DEFAULT_SETTINGS.temperature,
      maxTokens: (typeof s.maxTokens === "number") ? s.maxTokens : DEFAULT_SETTINGS.maxTokens,
      systemPrompt: s.systemPrompt || DEFAULT_SETTINGS.systemPrompt,
      responseStyle: s.responseStyle || DEFAULT_SETTINGS.responseStyle,
      sendKey: s.sendKey || DEFAULT_SETTINGS.sendKey,
      userLevel: s.userLevel || DEFAULT_SETTINGS.userLevel,
      userProfession: s.userProfession || DEFAULT_SETTINGS.userProfession,
      userInterests: s.userInterests || DEFAULT_SETTINGS.userInterests,
      darkMode: Boolean(s.darkMode),
    });
  }

  /** Settings → UIへ反映 */
  function applySettingsToUI() {
    el.baseUrl.value = settings.baseUrl;
    el.apiKey.value = settings.apiKey;
    el.temperature.value = String(settings.temperature);
    el.tempValue.textContent = String(settings.temperature);
    el.maxTokens.value = String(settings.maxTokens);
    el.systemPrompt.value = settings.systemPrompt;
    el.responseStyle.value = settings.responseStyle;
    el.sendKey.value = settings.sendKey || "enter";
    el.userLevel.value = settings.userLevel || "";
    el.userProfession.value = settings.userProfession || "";
    el.userInterests.value = settings.userInterests || "";

    if (settings.darkMode) {
      document.body.classList.add("dark-mode");
      el.darkModeToggle.checked = true;
    } else {
      document.body.classList.remove("dark-mode");
      el.darkModeToggle.checked = false;
    }
  }

  /** UI → settingsへ反映し保存 */
  function saveSettingsFromUI() {
    settings = {
      baseUrl: el.baseUrl.value.trim(),
      apiKey: el.apiKey.value.trim(),
      model: el.modelSelect.value,
      temperature: parseFloat(el.temperature.value),
      maxTokens: parseInt(el.maxTokens.value, 10),
      systemPrompt: el.systemPrompt.value,
      responseStyle: /** @type {any} */ (el.responseStyle.value),
      sendKey: /** @type {any} */ (el.sendKey.value),
      userLevel: el.userLevel.value,
      userProfession: el.userProfession.value.trim(),
      userInterests: el.userInterests.value.trim(),
      darkMode: document.body.classList.contains("dark-mode"),
    };
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  }

  /** @returns {StoredMessage[]} */
  function loadHistory() {
    const raw = localStorage.getItem(STORAGE_KEYS.HISTORY) || "[]";
    const result = safeJSONParse(raw, []);
    console.log("[DEBUG] loadHistory:", result.length, "messages loaded", result);
    return result;
  }

  function persistHistory() {
    console.log("[DEBUG] persistHistory:", messages.length, "messages", messages);
    localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(messages));
  }

  function loadCustomPresets() {
    const raw = localStorage.getItem(STORAGE_KEYS.PRESETS) || "{}";
    customPresets = safeJSONParse(raw, {});
  }

  function persistCustomPresets() {
    localStorage.setItem(STORAGE_KEYS.PRESETS, JSON.stringify(customPresets));
  }

  function loadCustomPresetLabels() {
    const raw = localStorage.getItem(STORAGE_KEYS.PRESET_LABELS) || "{}";
    customPresetLabels = safeJSONParse(raw, {});
  }

  function persistCustomPresetLabels() {
    localStorage.setItem(STORAGE_KEYS.PRESET_LABELS, JSON.stringify(customPresetLabels));
  }

  function loadDraft() {
    return localStorage.getItem(STORAGE_KEYS.DRAFT) || "";
  }

  function persistDraft(text) {
    localStorage.setItem(STORAGE_KEYS.DRAFT, text);
  }

  function clearDraft() {
    localStorage.removeItem(STORAGE_KEYS.DRAFT);
  }

  function scheduleDraftSave() {
    if (draftSaveTimer) clearTimeout(draftSaveTimer);
    draftSaveTimer = setTimeout(() => {
      const text = el.prompt.value || "";
      if (text.trim()) persistDraft(text);
      else clearDraft();
    }, 300);
  }

  // ---------------------------------------------------------------------------
  // v1.6: 設定リセット・全データクリア機能
  // ---------------------------------------------------------------------------

  /**
   * 設定をデフォルトに戻す
   */
  function resetSettingsToDefault() {
    if (!confirm("設定をデフォルトに戻しますか？\n\n※ 会話履歴とプリセットは保持されます。")) return;

    // デフォルト設定を適用（モデルは現在の選択を維持）
    const currentModel = el.modelSelect.value;
    settings = {
      ...DEFAULT_SETTINGS,
      model: currentModel,
    };

    applySettingsToUI();
    saveSettingsFromUI();
    notify("✅ 設定をデフォルトに戻しました");
  }

  /**
   * すべての保存データを削除
   */
  function clearAllData() {
    const message = "すべての保存データを削除しますか？\n\n" +
      "削除対象:\n" +
      "- 会話履歴\n" +
      "- 設定\n" +
      "- カスタムプリセット\n" +
      "- 下書き";

    if (!confirm(message)) return;
    if (!confirm("本当に削除してよろしいですか？\nこの操作は取り消せません。")) return;

    // すべてのlocalStorageキーを削除
    Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key));

    // 状態をリセット
    messages = [];
    settings = { ...DEFAULT_SETTINGS };
    customPresets = {};
    customPresetLabels = {};

    // UI更新
    el.chat.innerHTML = "";
    applySettingsToUI();
    renderPresetUI();
    loadPresetToEditor();
    clearDraft();
    el.prompt.value = "";

    notify("✅ すべてのデータを削除しました");
  }

  // ---------------------------------------------------------------------------
  // Chat UI
  // ---------------------------------------------------------------------------

  /**
   * チャットにメッセージを描画し、必要なら履歴へ保存する
   * @param {Role} role
   * @param {string} content
   * @param {{save?:boolean, imageData?:string|null}=} opts
   */
  function appendMessage(role, content, opts = {}) {
    const { save = true, imageData = null } = opts;

    const container = document.createElement("div");
    container.classList.add("message", role);

    // Copy/Regenerate 用にメッセージ本文を埋め込み
    container.dataset.content = content;
    if (imageData) container.dataset.imageData = imageData;

    // user画像添付はメッセージ内にも表示
    if (imageData && role === "user") {
      const img = document.createElement("img");
      img.src = imageData;
      img.classList.add("image-in-message");
      container.appendChild(img);
    }

    // 本文（assistantは markdown）
    const body = document.createElement("div");
    body.classList.add("message-content");
    if (role === "assistant") {
      body.innerHTML = marked.parse(content);
    } else {
      body.textContent = content;
    }
    container.appendChild(body);

    // system 以外はアクションボタン表示
    if (role !== "system") {
      container.appendChild(buildMessageActions(container, role));
    }

    el.chat.appendChild(container);
    scrollToBottom();

    if (save) {
      messages.push({ role, content, imageData: imageData || undefined });
      persistHistory();
    }
  }

  /**
   * Copy/Delete/Edit/Regenerate のUIを作る（systemは呼ばれない）
   * @param {HTMLDivElement} msgDiv
   * @param {Role} role
   */
  function buildMessageActions(msgDiv, role) {
    const actions = document.createElement("div");
    actions.classList.add("msg-actions");

    const copyBtn = document.createElement("button");
    copyBtn.classList.add("msg-btn");
    copyBtn.textContent = "📋 Copy";
    copyBtn.onclick = async () => {
      await navigator.clipboard.writeText(msgDiv.dataset.content || "");
      notify("✅ コピーしました");
    };

    const deleteBtn = document.createElement("button");
    deleteBtn.classList.add("msg-btn");
    deleteBtn.textContent = "🗑 Delete";
    deleteBtn.onclick = () => {
      const msgContent = msgDiv.dataset.content || "";
      const idx = messages.findIndex(m => m.role === role && m.content === msgContent);
      if (idx !== -1) {
        messages.splice(idx, 1);
        persistHistory();
      }
      msgDiv.remove();
      notify("✅ メッセージを削除しました");
    };

    actions.append(copyBtn, deleteBtn);

    // Edit（userのみ）
    if (role === "user") {
      const editBtn = document.createElement("button");
      editBtn.classList.add("msg-btn");
      editBtn.textContent = "✏️ Edit";
      editBtn.onclick = () => editUserMessage(msgDiv);
      actions.appendChild(editBtn);
    }

    // Regenerate（assistantのみ）
    if (role === "assistant") {
      const regenBtn = document.createElement("button");
      regenBtn.classList.add("msg-btn");
      regenBtn.textContent = "🔄 Regenerate";
      regenBtn.onclick = () => regenerateLastAssistant(msgDiv);
      actions.appendChild(regenBtn);
    }

    return actions;
  }

  /**
   * ユーザーメッセージを編集モードにする
   * - メッセージ内容を入力欄に戻す
   * - そのメッセージ以降の履歴を削除
   * @param {HTMLDivElement} msgDiv
   */
  function editUserMessage(msgDiv) {
    const msgContent = msgDiv.dataset.content || "";

    // 確認ダイアログ
    if (!confirm("このメッセージを編集しますか？\n\n※ このメッセージ以降の会話は削除されます。")) {
      return;
    }

    // メッセージのインデックスを探す
    const idx = messages.findIndex(m => m.role === "user" && m.content === msgContent);
    if (idx === -1) {
      notify("⚠️ メッセージが見つかりません");
      return;
    }

    // このメッセージ以降をすべて削除（履歴から）
    const removedCount = messages.length - idx;
    messages.splice(idx);
    persistHistory();

    // DOM上でも該当メッセージ以降を削除
    const allMessages = Array.from(el.chat.querySelectorAll(".message"));
    const msgIndex = allMessages.indexOf(msgDiv);
    if (msgIndex !== -1) {
      for (let i = allMessages.length - 1; i >= msgIndex; i--) {
        allMessages[i].remove();
      }
    }

    // 入力欄にメッセージ内容を復元
    el.prompt.value = msgContent;
    autoResizeTextarea(el.prompt);
    el.prompt.focus();
    el.prompt.setSelectionRange(el.prompt.value.length, el.prompt.value.length);

    notify(`✏️ 編集モード（${removedCount}件のメッセージを削除）`);
  }

  /**
   * 再生成: 現状の仕様は「最後のassistantメッセージを消して、最後のuserを再送」。
   * そのため、途中の過去メッセージをregenしても最後のuserが送られます（元実装踏襲）。
   * @param {HTMLDivElement} msgDiv
   */
  function regenerateLastAssistant(msgDiv) {
    const msgContent = msgDiv.dataset.content || "";
    const idx = messages.findIndex(m => m.role === "assistant" && m.content === msgContent);
    if (idx !== -1) {
      messages.splice(idx, 1);
      persistHistory();
    }
    msgDiv.remove();

    if (messages.length > 0 && messages[messages.length - 1].role === "user") {
      el.sendBtn.click();
    } else {
      notify("⚠️ 再生成するユーザーメッセージがありません");
    }
  }

  // ---------------------------------------------------------------------------
  // System prompt composition
  // ---------------------------------------------------------------------------

  /** 応答スタイルの追加指示 */
  function getResponseStyleInstruction() {
    const style = el.responseStyle.value || "standard";
    const map = {
      concise: "\n\n【応答スタイル】簡潔に要点のみを述べてください。冗長な説明は避け、核心的な情報のみを提供してください。",
      standard: "",
      detailed: "\n\n【応答スタイル】詳細な説明を心がけてください。背景情報、理由、具体例などを含めて丁寧に説明してください。",
      professional: "\n\n【応答スタイル】専門的で技術的な詳細を重視してください。学術的な正確性を保ち、専門用語を適切に使用し、エビデンスや根拠を明示してください。",
    };

    let instruction = map[style] || "";

    // 深掘りモードが有効な場合は追加指示
    if (deepDiveMode) {
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

  /** ユーザープロフィール（任意） */
  function getUserProfileInstruction() {
    const level = el.userLevel.value;
    const profession = el.userProfession.value.trim();
    const interests = el.userInterests.value.trim();
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

  /**
   * API送信用の messages を作る（system先頭、交互、末尾assistantは除外）
   * 画像添付は Vision API形式（content配列）に変換。
   *
   * NOTE: system が slice で落ちないように、必ず system + 最後のN-1件に整形する。
   * @returns {Array<{role:string, content:any}>}
   */
  function buildConversation() {
    const baseSysPrompt = el.systemPrompt.value || settings.systemPrompt;
    const sysPrompt = baseSysPrompt + getResponseStyleInstruction() + getUserProfileInstruction();

    /** @type {Array<{role:string, content:any}>} */
    const conv = [{ role: "system", content: sysPrompt }];

    let last = "system";
    for (const m of messages) {
      if (!["user", "assistant"].includes(m.role)) continue;
      if (m.role === last) continue;

      // Vision API形式に変換（user画像のみ）
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

    // 末尾がassistantなら削って「次のassistant生成」に備える
    if (conv.length > 1 && conv.at(-1).role === "assistant") conv.pop();

    // systemは常に残し、残りを末尾から LIMITS.MAX_HISTORY_FOR_API-1 個取る
    const tail = conv.slice(1).slice(-(LIMITS.MAX_HISTORY_FOR_API - 1));
    const result = [conv[0], ...tail];
    console.log("[DEBUG] buildConversation:", result.length, "messages (from", messages.length, "in history)");
    return result;
  }

  // ---------------------------------------------------------------------------
  // Models: /v1/models
  // ---------------------------------------------------------------------------

  /**
   * /v1/models を叩いて <select> を更新する
   * - "embedding系" を除外
   * - 以前の選択 / fallback を考慮して選択を決定
   */
  async function refreshModels() {
    runtime.availableModels.clear();

    const base = trimTrailingSlashes(settings.baseUrl || el.baseUrl.value.trim());
    const key = settings.apiKey || el.apiKey.value.trim();

    // UI: Loading...
    el.modelSelect.innerHTML = "<option>Loading...</option>";

    try {
      const r = await fetch(`${base}/models`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!r.ok) throw new Error(String(r.status));

      const data = await r.json();
      const allModels = (data.data || []).map(m => m.id);

      // 埋め込みモデル（text embedding）を除外
      const list = allModels.filter(id => {
        const lower = String(id).toLowerCase();
        return !EMBEDDING_KEYWORDS.some(k => lower.includes(k));
      });

      // アルファベット順にソート（大文字小文字を区別しない）
      list.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

      // build options
      el.modelSelect.innerHTML = "";
      list.forEach(id => {
        const opt = document.createElement("option");
        opt.value = id;
        // モデル名を整形（パス部分を削除）
        const displayName = id.replace(/^.*\//, "");
        // Vision対応モデルには👁️アイコンを付与
        opt.textContent = isVisionModel(id) ? `👁️ ${displayName}` : displayName;
        el.modelSelect.appendChild(opt);
        runtime.availableModels.add(id);
      });

      // selection strategy: saved → some known fallbacks → first
      const preferred = settings.model;
      const fallbacks = [
        preferred,
        "google/gemma-3-12b",
        "llama-3.1-swallow-8b-instruct-v0.5",
        "qwen/qwen3-4b-2507",
        list[0],
      ].filter(Boolean);

      let chosen = null;
      for (const cand of fallbacks) {
        if (runtime.availableModels.has(cand)) { chosen = cand; break; }
      }
      if (chosen) el.modelSelect.value = chosen;

      saveSettingsFromUI();
    } catch (e) {
      el.modelSelect.innerHTML = "";
      if (isLikelyServerOffline(e)) {
        notify("⚠️ LM Studioが起動していないか、Base URLに接続できません。LM Studioを起動して再試行してください。");
      } else {
        notify("⚠️ モデル一覧を取得できませんでした。Base/KeyとServer状態を確認してください。");
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Send / streaming
  // ---------------------------------------------------------------------------

  /**
   * 送信前に、選択モデルが /v1/models に存在するかを確認する
   * @param {string} modelId
   */
  function validateModelExists(modelId) {
    return runtime.availableModels.size > 0 && runtime.availableModels.has(modelId);
  }

  /**
   * 添付ファイル（複数対応）をユーザー入力に「表示/送信用」に反映する
   * @param {string} text
   * @returns {{textForApi:string, displayText:string, imageAttachments:AttachmentItem[]}}
   */
  function injectAttachmentsIntoText(text) {
    let textForApi = text;
    let displayText = text;

    // 画像添付を分離（Vision API用）
    const imageAttachments = attachments.filter(a => a.type === "image");
    const fileAttachments = attachments.filter(a => a.type === "file");

    if (fileAttachments.length === 0 && imageAttachments.length === 0) {
      return { textForApi, displayText, imageAttachments };
    }

    // ファイル添付をテキストに追加
    if (fileAttachments.length > 0) {
      const fileContents = fileAttachments.map(f => {
        const isPDF = f.name.toLowerCase().endsWith(".pdf");
        const label = isPDF ? `📄 **添付PDF: ${f.name}**` : `📄 **添付ファイル: ${f.name}**`;
        return `\n\n---\n${label}\n\`\`\`\n${f.data}\n\`\`\``;
      }).join("");

      textForApi = textForApi ? (textForApi + fileContents) : `添付ファイルの内容:${fileContents}`;
    }

    // 表示用テキスト
    const allNames = attachments.map(a => a.name);
    if (allNames.length > 0) {
      const attachText = `📎 添付: ${allNames.join(", ")}`;
      displayText = text ? `${text}\n\n${attachText}` : attachText;
    }

    return { textForApi, displayText, imageAttachments };
  }

  /**
   * SSEストリームを読み取り、delta文字列を順次 callback へ渡す
   * @param {ReadableStreamDefaultReader<Uint8Array>} reader
   * @param {(delta:string)=>void} onDelta
   * @param {()=>void} onDone
   */
  async function consumeSSE(reader, onDelta, onDone) {
    const decoder = new TextDecoder("utf-8");
    let buf = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buf += decoder.decode(value, { stream: true });

      // SSE: event delimiter is blank line
      const events = buf.split("\n\n");
      buf = events.pop() || "";

      for (const ev of events) {
        const lines = ev
          .split("\n")
          .filter(l => l.startsWith("data: "))
          .map(l => l.slice(6));

        if (!lines.length) continue;

        const payload = lines.join("\n");
        if (payload === "[DONE]") {
          onDone();
          return;
        }

        // chunk JSON
        try {
          const j = JSON.parse(payload);
          const delta =
            j.choices?.[0]?.delta?.content ??
            j.choices?.[0]?.text ??
            "";
          if (delta) onDelta(delta);
        } catch {
          // 不完全JSONは次チャンクで完成（元実装踏襲）
        }
      }
    }
  }

  /**
   * 送信ボタンの本体
   * - 入力 + 添付を整形
   * - バリデーション（モデル存在）
   * - 逐次描画（... → streaming）
   * - 完了時に履歴へ保存
   */
  async function handleSend() {
    let text = el.prompt.value.trim();
    const hasAnyInput = Boolean(text || attachments.length > 0);
    if (!hasAnyInput) return;

    const base = trimTrailingSlashes(settings.baseUrl || el.baseUrl.value.trim());
    const key = settings.apiKey || el.apiKey.value.trim();
    const model = settings.model || el.modelSelect.value;

    if (!validateModelExists(model)) {
      notify(`⚠️ 選択モデルが /v1/models に見つかりません: ${model}`);
      return;
    }

    // user表示用/送信用にファイル内容を反映
    const { textForApi, displayText, imageAttachments } = injectAttachmentsIntoText(text);
    text = textForApi;

    // 最初の画像をメッセージ履歴保存用に取得
    const firstImageData = imageAttachments.length > 0 ? imageAttachments[0].data : null;

    // UI表示用（save: false で履歴には保存しない）
    appendMessage("user", displayText || "(添付ファイルのみ)", { save: false, imageData: firstImageData });
    strongClearPrompt();

    // 添付をクリア
    clearAllAttachments();

    // API送信用のuserMessage を作成（画像ありの場合は Vision形式）
    let userMessage;
    if (imageAttachments.length > 0) {
      const contentArray = [];
      if (text) contentArray.push({ type: "text", text });
      // 複数画像を追加
      for (const img of imageAttachments) {
        contentArray.push({ type: "image_url", image_url: { url: img.data } });
      }
      userMessage = { role: "user", content: contentArray };
    } else {
      userMessage = { role: "user", content: text };
    }

    // 履歴保存用のデータを保持（API送信後に保存）
    const userMessageForHistory = { role: "user", content: text, imageData: firstImageData || undefined };

    // assistant placeholder
    appendMessage("assistant", "...", { save: false });
    const currentMsgDiv = /** @type {HTMLDivElement} */ (el.chat.lastChild);

    runtime.controller = new AbortController();
    el.stopBtn.disabled = false;
    el.sendBtn.disabled = true;

    try {
      const apiMessages = [...buildConversation(), userMessage];
      console.log("[DEBUG] API request - total messages:", apiMessages.length);
      console.log("[DEBUG] API request - messages:", apiMessages);

      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          messages: apiMessages,
          stream: true,
          temperature: parseFloat(el.temperature.value) || 0.7,
          max_tokens: parseInt(el.maxTokens.value, 10) || 2048,
        }),
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

      await consumeSSE(
        reader,
        (delta) => {
          content += delta;
          // エラー時に内容を保持するためにdatasetに保存
          currentMsgDiv.dataset.partialContent = content;
          const contentEl = currentMsgDiv.querySelector(".message-content");
          if (contentEl) contentEl.innerHTML = marked.parse(content);
          scrollToBottom();
        },
        () => {
          const contentEl = currentMsgDiv.querySelector(".message-content");
          if (contentEl) contentEl.innerHTML = marked.parse(content || "(空応答)");

          // Copy機能用のdataset更新
          currentMsgDiv.dataset.content = content;

          // 履歴へ保存（ユーザーメッセージとアシスタント応答）
          messages.push(userMessageForHistory);
          messages.push({ role: "assistant", content });
          persistHistory();

          el.stopBtn.disabled = true;
          runtime.controller = null;
        }
      );

    } catch (e) {
      const contentEl = currentMsgDiv.querySelector(".message-content");
      const currentContent = currentMsgDiv.dataset.partialContent || "";

      if (e && e.name === "AbortError") {
        if (contentEl) contentEl.innerHTML = marked.parse(currentContent + "\n\n⏹ **生成を停止しました。**");
      } else if (isLikelyServerOffline(e) && !currentContent) {
        // 生成が始まる前のエラーのみ「接続できませんでした」と表示
        if (contentEl) contentEl.textContent = "接続できませんでした。LM Studioが起動していない可能性があります。";
        notify("⚠️ LM Studioが起動していないか、Base URLに接続できません。LM Studioを起動して再試行してください。");
      } else {
        // 生成途中でのエラーは内容を保持してエラーを追記
        const errorMsg = `\n\n⚠️ **エラーが発生しました**: ${e?.message || e}`;
        if (contentEl) contentEl.innerHTML = marked.parse(currentContent + errorMsg);
        console.error("Streaming error:", e);
      }
    } finally {
      el.stopBtn.disabled = true;
      el.sendBtn.disabled = false;
      runtime.controller = null;
    }
  }

  function handleStop() {
    if (runtime.controller) runtime.controller.abort();
  }

  // ---------------------------------------------------------------------------
  // Export / Clear
  // ---------------------------------------------------------------------------

  function exportHistory() {
    const blob = new Blob([JSON.stringify(messages, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `chat_history_${new Date().toISOString().slice(0, 19)}.json`;
    a.click();

    URL.revokeObjectURL(url);
  }

  function clearHistory() {
    if (!confirm("履歴をすべて削除しますか？")) return;
    localStorage.removeItem(STORAGE_KEYS.HISTORY);
    messages = [];
    el.chat.innerHTML = "";
    notify("🗑 会話履歴を削除しました。");
  }

  // ---------------------------------------------------------------------------
  // Settings panel
  // ---------------------------------------------------------------------------

  function toggleSettingsPanel() {
    el.settingsPanel.classList.toggle("open");
    if (el.settingsPanel.classList.contains("open")) {
      el.presetPanel.classList.remove("open");
    }
  }

  function closeSettingsPanel() {
    el.settingsPanel.classList.remove("open");
  }

  function toggleDarkMode(isOn) {
    if (isOn) document.body.classList.add("dark-mode");
    else document.body.classList.remove("dark-mode");
    saveSettingsFromUI();
  }

  // ---------------------------------------------------------------------------
  // Attachments: Multiple files support
  // ---------------------------------------------------------------------------

  /**
   * ファイルを DataURL(base64) として読み込む
   * @param {File} file
   * @returns {Promise<string>}
   */
  function loadFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (ev) => resolve(/** @type {string} */ (ev.target.result));
      reader.onerror = () => reject(new Error("ファイルの読み込みに失敗しました"));
      reader.readAsDataURL(file);
    });
  }

  /** @param {File} file */
  function readTextFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (ev) => resolve(ev.target.result);
      reader.onerror = () => reject(new Error("ファイルの読み込みに失敗しました"));
      reader.readAsText(file);
    });
  }

  /** @param {File} file */
  function readArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (ev) => resolve(ev.target.result);
      reader.onerror = () => reject(new Error("PDFファイルの読み込みに失敗しました"));
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * PDF.js で全ページからテキスト抽出する
   * @param {ArrayBuffer} arrayBuffer
   * @returns {Promise<{text:string, pages:number}>}
   */
  async function extractTextFromPdf(arrayBuffer) {
    if (typeof pdfjsLib === "undefined") {
      throw new Error("PDF.jsが読み込まれていません");
    }

    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;

    let fullText = "";
    const numPages = pdf.numPages;

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(" ");
      fullText += `\n--- ページ ${pageNum} ---\n${pageText}\n`;
    }

    return { text: fullText.trim(), pages: numPages };
  }

  /** 一意のIDを生成 */
  function generateAttachmentId() {
    return `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  /** ファイルサイズを人間が読みやすい形式に変換 */
  function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  /**
   * 添付ファイル一覧UIを更新
   */
  function renderAttachmentList() {
    if (attachments.length === 0) {
      el.attachmentList.style.display = "none";
      el.attachmentList.innerHTML = "";
      return;
    }

    el.attachmentList.style.display = "block";
    el.attachmentList.innerHTML = attachments.map(att => {
      const sizeStr = formatFileSize(att.size);

      // 画像の場合はサムネイルを表示
      if (att.type === "image") {
        return `
          <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #eee">
            <img src="${att.data}" alt="${att.name}" style="width:48px;height:48px;object-fit:cover;border-radius:4px;border:1px solid #ddd;flex-shrink:0" />
            <div style="flex:1;min-width:0">
              <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500" title="${att.name}">${att.name}</div>
              <div style="color:#666;font-size:0.8em">${sizeStr}</div>
            </div>
            <button onclick="window._removeAttachment('${att.id}')" style="background:#dc3545;color:#fff;border:none;border-radius:4px;padding:4px 10px;cursor:pointer;font-size:0.85em;flex-shrink:0">×</button>
          </div>
        `;
      }

      // ファイルの場合はアイコン表示
      return `
        <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #eee">
          <span style="font-size:1.5em;flex-shrink:0">📄</span>
          <div style="flex:1;min-width:0">
            <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500" title="${att.name}">${att.name}</div>
            <div style="color:#666;font-size:0.8em">${sizeStr}</div>
          </div>
          <button onclick="window._removeAttachment('${att.id}')" style="background:#dc3545;color:#fff;border:none;border-radius:4px;padding:4px 10px;cursor:pointer;font-size:0.85em;flex-shrink:0">×</button>
        </div>
      `;
    }).join("");
  }

  /**
   * 添付を削除（グローバルから呼び出し可能にする）
   * @param {string} id
   */
  function removeAttachment(id) {
    attachments = attachments.filter(a => a.id !== id);
    renderAttachmentList();
  }
  // グローバルに公開（onclick から呼び出すため）
  window._removeAttachment = removeAttachment;

  /** すべての添付をクリア */
  function clearAllAttachments() {
    attachments = [];
    el.imageInput.value = "";
    el.fileInput.value = "";
    renderAttachmentList();
  }

  /**
   * 複数画像ファイルを処理
   * @param {FileList} files
   */
  async function handleImagesSelected(files) {
    if (!files || files.length === 0) return;

    let addedCount = 0;
    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        notify(`⚠️ ${file.name} は画像ファイルではありません`);
        continue;
      }

      if (file.size > LIMITS.IMAGE_MAX_BYTES) {
        notify(`⚠️ ${file.name} は20MBを超えています`);
        continue;
      }

      try {
        const data = await loadFileAsDataURL(file);
        attachments.push({
          id: generateAttachmentId(),
          type: "image",
          name: file.name,
          data: data,
          size: file.size,
        });
        addedCount++;
      } catch {
        notify(`⚠️ ${file.name} の読み込みに失敗しました`);
      }
    }

    el.imageInput.value = "";
    renderAttachmentList();

    if (addedCount > 0) {
      notify(`✅ ${addedCount}個の画像を添付しました`);
    }
  }

  /**
   * 複数ファイルを処理
   * @param {FileList} files
   */
  async function handleFilesSelected(files) {
    if (!files || files.length === 0) return;

    let addedCount = 0;
    for (const file of files) {
      const isPDF = file.name.toLowerCase().endsWith(".pdf");
      const sizeLimit = isPDF ? LIMITS.PDF_MAX_BYTES : LIMITS.FILE_MAX_BYTES;
      const sizeLimitText = isPDF ? "5MB" : "1MB";

      if (file.size > sizeLimit) {
        notify(`⚠️ ${file.name} は${sizeLimitText}を超えています`);
        continue;
      }

      try {
        let data;
        if (isPDF) {
          if (typeof pdfjsLib === "undefined") {
            notify("⚠️ PDF.jsが読み込まれていません");
            continue;
          }
          const buf = /** @type {ArrayBuffer} */ (await readArrayBuffer(file));
          const result = await extractTextFromPdf(buf);
          data = result.text || `[PDF: ${file.name} - テキスト抽出失敗]`;
        } else {
          data = /** @type {string} */ (await readTextFile(file));
        }

        attachments.push({
          id: generateAttachmentId(),
          type: "file",
          name: file.name,
          data: data,
          size: file.size,
        });
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
    }
  }

  // ---------------------------------------------------------------------------
  // Presets
  // ---------------------------------------------------------------------------

  // デフォルトプリセット（変更不可）
  const DEFAULT_PRESETS = Object.freeze({
    disease: `以下の疾患について、医学的に正確な解説をしてください。

1. 定義・概要（1-2行）
2. 疫学（発症率、好発年齢・性別）
3. 病態生理（発症機序）
4. 症状・臨床所見
5. 診断基準・検査所見
6. 画像所見（特徴的な所見）
7. 鑑別診断（3つ程度）
8. 治療（第一選択、代替療法）
9. 予後

【疾患名】`,
    ddx: `鑑別を5つ挙げ、可能性(高/中/低)と根拠を1行で示してください。
最後に「見逃し厳禁」3つと追加検査3つ。

【主訴】
【年齢・性別】
【症状・所見】`,
    review: `Strengths/Weaknessesを各3つ。加えて「臨床的意義」「再現性」「統計の妥当性」を1行ずつ。
最後にOverall評価(1-5)と主要修正点3つ。

【研究内容】`,
    stats: `以下のデータに対する最適な統計解析手法を提案してください。

【データの種類】
【比較する群】
【目的】`,
    email: `以下の情報をもとに、丁寧で自然な英文メールを作成してください。
トーン: フォーマル/セミフォーマル/カジュアルのいずれかを指定。
出力: 件名(Subject) + 本文。必要なら3つの代替件名も提示。

【相手】
【用件】
【トーン】`,
    pdf: `以下の文章を箇条書きで要約してください。

【文章】`,
  });

  const DEFAULT_PRESET_LABELS = Object.freeze({
    disease: "🏥 疾患解説",
    ddx: "💊 鑑別診断",
    pdf: "📄 文章要約",
    review: "📝 論文査読",
    stats: "📈 統計解析",
    email: "✉️ 英文メール作成",
  });

  /** @param {string} key */
  function getPreset(key) {
    // カスタムがあれば優先、なければデフォルト
    return (customPresets[key] !== undefined) ? customPresets[key] : DEFAULT_PRESETS[key];
  }

  /** @param {string} key */
  function getPresetLabel(key) {
    return customPresetLabels[key] || DEFAULT_PRESET_LABELS[key] || key;
  }

  function getAllPresetKeys() {
    const keys = new Set(Object.keys(DEFAULT_PRESETS));
    Object.keys(customPresetLabels).forEach(k => keys.add(k));
    Object.keys(customPresets).forEach(k => keys.add(k));
    return Array.from(keys);
  }

  function renderPresetUI() {
    const keys = getAllPresetKeys();
    const current = el.presetEditSelect.value;

    // Editor select
    el.presetEditSelect.innerHTML = "";
    keys.forEach((key) => {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = getPresetLabel(key);
      el.presetEditSelect.appendChild(opt);
    });

    if (keys.includes(current)) {
      el.presetEditSelect.value = current;
    }

    // Preset panel buttons
    el.presetList.innerHTML = "";
    keys.forEach((key) => {
      const btn = document.createElement("button");
      btn.classList.add("preset-item");
      btn.dataset.preset = key;
      btn.textContent = getPresetLabel(key);
      btn.addEventListener("click", () => {
        insertPresetIntoPrompt(key, getPresetLabel(key));
      });
      el.presetList.appendChild(btn);
    });
  }

  function loadPresetToEditor() {
    const key = el.presetEditSelect.value;
    el.presetEditText.value = getPreset(key) || "";
    el.deletePresetBtn.disabled = Boolean(DEFAULT_PRESETS[key]);
  }

  function savePresetFromEditor() {
    const key = el.presetEditSelect.value;
    customPresets[key] = el.presetEditText.value;
    persistCustomPresets();
    notify("✅ プリセットを保存しました");
  }

  function resetPresetToDefault() {
    const key = el.presetEditSelect.value;
    const isDefault = Boolean(DEFAULT_PRESETS[key]);
    if (isDefault) {
      delete customPresets[key];
      persistCustomPresets();
      el.presetEditText.value = getPreset(key) || "";
      notify("✅ プリセットをデフォルトに戻しました");
      return;
    }

    delete customPresets[key];
    delete customPresetLabels[key];
    persistCustomPresets();
    persistCustomPresetLabels();
    renderPresetUI();
    el.presetEditSelect.value = Object.keys(DEFAULT_PRESETS)[0];
    loadPresetToEditor();
    notify("✅ カスタムプリセットを削除しました");
  }

  function resetAllPresets() {
    if (!confirm("すべてのプリセットをデフォルトに戻しますか？")) return;
    customPresets = {};
    localStorage.removeItem(STORAGE_KEYS.PRESETS);
    customPresetLabels = {};
    localStorage.removeItem(STORAGE_KEYS.PRESET_LABELS);
    renderPresetUI();
    loadPresetToEditor();
    notify("✅ すべてのプリセットをリセットしました");
  }

  function addNewPreset() {
    const label = el.newPresetName.value.trim();
    if (!label) {
      notify("⚠️ プリセット名を入力してください");
      return;
    }

    const key = `custom_${Date.now()}`;
    customPresetLabels[key] = label;
    customPresets[key] = "";
    persistCustomPresetLabels();
    persistCustomPresets();
    renderPresetUI();
    el.presetEditSelect.value = key;
    el.presetEditText.value = "";
    el.deletePresetBtn.disabled = false;
    el.newPresetName.value = "";
    notify(`✅ プリセット「${label}」を追加しました`);
  }

  function deleteSelectedPreset() {
    const key = el.presetEditSelect.value;
    if (DEFAULT_PRESETS[key]) {
      notify("⚠️ デフォルトのプリセットは削除できません");
      return;
    }
    if (!confirm("このカスタムプリセットを削除しますか？")) return;
    delete customPresets[key];
    delete customPresetLabels[key];
    persistCustomPresets();
    persistCustomPresetLabels();
    renderPresetUI();
    el.presetEditSelect.value = Object.keys(DEFAULT_PRESETS)[0];
    loadPresetToEditor();
    notify("✅ カスタムプリセットを削除しました");
  }

  function togglePresetPanel() {
    el.presetPanel.classList.toggle("open");
    if (el.presetPanel.classList.contains("open")) {
      el.settingsPanel.classList.remove("open");
    }
  }

  function closePresetPanel() {
    el.presetPanel.classList.remove("open");
  }

  /** @param {string} presetKey @param {string} label */
  function insertPresetIntoPrompt(presetKey, label) {
    const presetText = getPreset(presetKey);
    if (!presetText) return;

    if (el.prompt.value.trim()) el.prompt.value = el.prompt.value + "\n\n" + presetText;
    else el.prompt.value = presetText;

    autoResizeTextarea(el.prompt);
    scheduleDraftSave();

    // カーソル末尾
    el.prompt.focus();
    el.prompt.setSelectionRange(el.prompt.value.length, el.prompt.value.length);

    closePresetPanel();
    notify(`✅ プリセット「${label}」を挿入しました`);
  }

  // ---------------------------------------------------------------------------
  // Keyboard shortcuts / paste / drag&drop
  // ---------------------------------------------------------------------------

  function setupKeyboardShortcuts() {
    // 送信キー設定に応じて送信：IME変換中は送信しない
    el.prompt.addEventListener("keydown", (e) => {
      if (e.isComposing || e.keyCode === 229) return;

      const sendKeyMode = settings.sendKey || "enter";

      if (e.key === "Enter") {
        if (sendKeyMode === "enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
          // Enterで送信（Shift/Ctrl/Cmd なし）
          e.preventDefault();
          el.sendBtn.click();
        } else if (sendKeyMode === "ctrl-enter" && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
          // Ctrl+Enter または Cmd+Enter で送信
          e.preventDefault();
          el.sendBtn.click();
        }
        // それ以外のEnter（Shift+Enterなど）は改行として動作
      }
    });

    document.addEventListener("keydown", (e) => {
      // Ctrl+K / Cmd+K でクリア
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        el.clearBtn.click();
      }
      // Esc で設定パネルを閉じる
      if (e.key === "Escape" && el.settingsPanel.classList.contains("open")) {
        closeSettingsPanel();
      }
      if (e.key === "Escape" && el.presetPanel.classList.contains("open")) {
        closePresetPanel();
      }
    });
  }

  function setupPasteImage() {
    document.addEventListener("paste", async (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const imageFiles = [];
      for (const item of items) {
        if (!item.type.startsWith("image/")) continue;
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }

      if (imageFiles.length > 0) {
        e.preventDefault();
        // FileListの代わりに配列を渡す
        await handleImagesSelected(imageFiles);
      }
    });
  }

  function setupDragAndDropImage() {
    document.addEventListener("dragover", (e) => { e.preventDefault(); e.stopPropagation(); });
    document.addEventListener("dragenter", (e) => {
      e.preventDefault(); e.stopPropagation();
      document.body.style.opacity = "0.7";
    });
    document.addEventListener("dragleave", (e) => {
      e.preventDefault(); e.stopPropagation();
      if (e.relatedTarget === null) document.body.style.opacity = "1";
    });
    document.addEventListener("drop", async (e) => {
      e.preventDefault(); e.stopPropagation();
      document.body.style.opacity = "1";

      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;

      // 画像ファイルのみをフィルタ
      const imageFiles = Array.from(files).filter(f => f.type.startsWith("image/"));
      if (imageFiles.length > 0) {
        await handleImagesSelected(imageFiles);
      } else {
        notify("⚠️ 画像ファイルをドロップしてください");
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Event wiring
  // ---------------------------------------------------------------------------

  function wireSettingsEvents() {
    const save = saveSettingsFromUI;

    el.baseUrl.onchange = save;
    el.apiKey.onchange = save;

    el.temperature.oninput = () => {
      el.tempValue.textContent = el.temperature.value;
      save();
    };

    el.maxTokens.onchange = save;
    el.systemPrompt.onchange = save;
    el.responseStyle.onchange = save;
    el.userLevel.onchange = save;
    el.userProfession.onchange = save;
    el.userInterests.onchange = save;

    el.darkModeToggle.onchange = () => toggleDarkMode(el.darkModeToggle.checked);

    el.modelSelect.addEventListener("change", (e) => {
      save();
      const id = /** @type {HTMLSelectElement} */ (e.target).value;
      notify(`🔄 モデルを ${id} に切り替えました`);
    });

    el.settingsBtn.onclick = toggleSettingsPanel;
    el.closeSettingsBtn.onclick = closeSettingsPanel;

    // v1.6: data management
    el.resetSettingsBtn.onclick = resetSettingsToDefault;
    el.clearAllDataBtn.onclick = clearAllData;
  }

  function wireMainButtons() {
    el.sendBtn.onclick = handleSend;
    el.stopBtn.onclick = handleStop;
    el.refreshBtn.onclick = refreshModels;
    el.exportBtn.onclick = exportHistory;
    el.clearBtn.onclick = clearHistory;
  }

  function wireTextareaResize() {
    el.prompt.addEventListener("input", () => {
      autoResizeTextarea(el.prompt);
      scheduleDraftSave();
    });
  }

  function wireAttachmentEvents() {
    el.imageInput.addEventListener("change", (e) => {
      const files = e.target.files;
      if (files && files.length > 0) handleImagesSelected(files);
    });

    el.fileInput.addEventListener("change", (e) => {
      const files = e.target.files;
      if (files && files.length > 0) handleFilesSelected(files);
    });
  }

  /**
   * 深掘りモードのトグル
   */
  function toggleDeepDiveMode() {
    deepDiveMode = !deepDiveMode;
    updateDeepDiveButton();

    if (deepDiveMode) {
      notify("🔍 深掘りモード ON - より深く分析した回答を生成します");
    } else {
      notify("🔍 深掘りモード OFF");
    }
  }

  /**
   * 深掘りボタンの見た目を更新
   */
  function updateDeepDiveButton() {
    if (deepDiveMode) {
      el.deepDiveBtn.style.background = "#6f42c1";
      el.deepDiveBtn.style.color = "#fff";
      el.deepDiveBtn.textContent = "🔍 深掘り ON";
    } else {
      el.deepDiveBtn.style.background = "#fff";
      el.deepDiveBtn.style.color = "#6f42c1";
      el.deepDiveBtn.textContent = "🔍 深掘り";
    }
  }

  function wireDeepDiveEvents() {
    el.deepDiveBtn.onclick = toggleDeepDiveMode;
  }

  function wirePresetEvents() {
    // Editor
    el.presetEditSelect.onchange = loadPresetToEditor;
    el.savePresetBtn.onclick = savePresetFromEditor;
    el.resetPresetBtn.onclick = resetPresetToDefault;
    el.deletePresetBtn.onclick = deleteSelectedPreset;
    el.resetAllPresetsBtn.onclick = resetAllPresets;
    el.addPresetBtn.onclick = addNewPreset;

    // Panel open/close
    el.presetBtn.onclick = togglePresetPanel;
    el.closePresetBtn.onclick = closePresetPanel;

    // Panel外クリックで閉じる
    document.addEventListener("click", (e) => {
      if (!el.presetPanel.classList.contains("open")) return;
      if (el.presetPanel.contains(/** @type {any} */ (e.target))) return;
      if (e.target === el.presetBtn) return;
      closePresetPanel();
    });
  }

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------

  function renderHistoryFromStorage() {
    messages = loadHistory();
    messages.forEach(m => appendMessage(m.role, m.content, { save: false, imageData: m.imageData || null }));
  }

  async function init() {
    setupMarkdown();

    settings = loadSettings();
    applySettingsToUI();

    const draft = loadDraft();
    if (draft) {
      el.prompt.value = draft;
      autoResizeTextarea(el.prompt);
    }

    loadCustomPresets();
    loadCustomPresetLabels();
    renderPresetUI();
    loadPresetToEditor();

    renderHistoryFromStorage();

    wireSettingsEvents();
    wireMainButtons();
    wireTextareaResize();
    wireAttachmentEvents();
    wireDeepDiveEvents();
    wirePresetEvents();
    setupKeyboardShortcuts();
    setupPasteImage();
    setupDragAndDropImage();

    // 起動時に同期
    await refreshModels();
  }

  // bootstrap
  init();

})();
