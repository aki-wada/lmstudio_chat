/**
 * Local LLM Chat v1.8.0
 * =====================
 * OpenAI互換API向けの簡易チャットUIです。
 *
 * 主なAPI:
 *   - GET  {baseUrl}/models
 *   - POST {baseUrl}/chat/completions  (SSE stream: "data: {...}\n\n")
 *   - GET  /api/v1/models  (LM Studio v1 API - v0.4.0+)
 *   - POST /api/v1/models/load  (LM Studio v1 API - モデルロード)
 *   - POST /api/v1/models/unload  (LM Studio v1 API - モデルアンロード)
 *
 * 永続化（localStorage）:
 *   - localLLMChat_history      : 会話履歴（配列）
 *   - localLLMChat_settings     : 設定（Base URL / Key / temperature 等）
 *   - localLLMChat_presets      : プリセットのカスタム文面
 *   - localLLMChat_presetLabels : プリセットのラベル
 *   - localLLMChat_draft        : 入力中の下書き
 *   - localLLMChat_modelVisibility : モデル表示フィルター
 *   - localLLMChat_sessions     : セッション管理
 *   - localLLMChat_currentSessionId : 現在のセッションID
 *
 * v1.8.0 新機能 (2026-02-25):
 *   - 🧠 reasoning_effort パラメータ: モデルの推論レベルを設定可能
 *   - 💭 Thinking表示: <think>タグによる思考プロセスの表示/非表示切替
 *   - 🚫 Thinkingモード無効化: Qwen等のthinkingモデルに/no_think + chat_template_kwargsを送信して思考を停止
 *   - ⌨️ キーボードショートカット一覧モーダル (Ctrl+/)
 *   - 👁️ モデル表示フィルター: ドロップダウンに表示するモデルを選択可能
 *   - 📂 セッション管理: 複数の会話を管理・切り替え
 *
 * v1.7.3 新機能 (2026-02-09):
 *   - 🔄 モデル自動アンロード: モデル切替時に前のモデルを自動アンロード（設定でON/OFF可能）
 *
 * v1.7.2 新機能 (2026-02-04):
 *   - 🏥 医学用語チェック: 送信前に不正確な医学用語をLLMでチェック
 *
 * v1.7.1 新機能 (2026-02-02):
 *   - ⚖️ モデル比較機能: 2つのモデルの回答を並べて比較表示
 *   - 🤖 全モデル表示: LM Studio v1 API対応（v0.4.0以降）
 *   - 未ロードモデルをドロップダウンで選択すると自動ロード
 *   - モデル状態表示（🟢 ロード済み / ⏸️ 未ロード / 👁️ Vision対応）
 *
 * v1.6.8 新機能 (2026-01-21):
 *   - 🆕 新しい話題ボタン: 話題を変えた際に前の回答が混ざる問題を解決
 *   - ❓/⚙️ボタンをアイコンのみに変更（ヘッダー幅削減）
 *   - 鑑別診断プリセットの内容更新
 *
 * v1.6.7 新機能 (2026-01-20):
 *   - トークンキャッシング統計の表示
 *
 * v1.6.6 バグ修正・新機能 (2026-01-19):
 *   - 会話中のLLMモデル切り替えが正しく反映されない問題を修正
 *   - ヘルプモード: アプリの使い方をLLMに質問できる機能を追加
 *
 * v1.6.5 改善 (2026-01-17):
 *   - ファイルサイズ制限の調整（テキスト: 1MB→2MB、PDF: 5MB→10MB）
 *   - 長いファイル名で入力エリアが拡大する問題を修正
 */
(() => {
  "use strict";

  /** @typedef {"user"|"assistant"|"system"} Role */
  /**
   * @typedef {Object} StoredMessage
   * @property {Role} role
   * @property {string} content
   * @property {string=} imageData  - user添付画像（DataURL）先頭1枚（後方互換）
   * @property {string[]=} imageDataList - user添付画像の全リスト
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
   * @property {string=} userName
   * @property {string=} userLevel
   * @property {string=} userProfession
   * @property {string=} userInterests
   * @property {boolean} darkMode
   */

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------

  const STORAGE_KEYS = Object.freeze({
    HISTORY: "localLLMChat_history",
    SETTINGS: "localLLMChat_settings",
    PRESETS: "localLLMChat_presets",
    DRAFT: "localLLMChat_draft",
    PRESET_LABELS: "localLLMChat_presetLabels",
    SYSTEM_PROMPT_PRESETS: "localLLMChat_systemPromptPresets",  // v1.7.2
    MODEL_VISIBILITY: "localLLMChat_modelVisibility",          // v1.8.0
    SESSIONS: "localLLMChat_sessions",                         // v1.8.0
    CURRENT_SESSION_ID: "localLLMChat_currentSessionId",       // v1.8.0
  });

  // 旧バージョンのキー（マイグレーション用）
  const LEGACY_STORAGE_KEYS = Object.freeze({
    HISTORY: "chatHistory_v1.6",
    SETTINGS: "chatSettings_v1.6",
    PRESETS: "chatPresets_v1.6",
    DRAFT: "chatDraft_v1.6",
    PRESET_LABELS: "chatPresetLabels_v1.6",
  });

  /**
   * 旧キーから新キーへデータをマイグレーション
   * 旧キーにデータがあり、新キーにデータがない場合のみ移行
   */
  function migrateStorageKeys() {
    const migrations = [
      { oldKey: LEGACY_STORAGE_KEYS.HISTORY, newKey: STORAGE_KEYS.HISTORY },
      { oldKey: LEGACY_STORAGE_KEYS.SETTINGS, newKey: STORAGE_KEYS.SETTINGS },
      { oldKey: LEGACY_STORAGE_KEYS.PRESETS, newKey: STORAGE_KEYS.PRESETS },
      { oldKey: LEGACY_STORAGE_KEYS.DRAFT, newKey: STORAGE_KEYS.DRAFT },
      { oldKey: LEGACY_STORAGE_KEYS.PRESET_LABELS, newKey: STORAGE_KEYS.PRESET_LABELS },
    ];

    let migrated = false;
    migrations.forEach(({ oldKey, newKey }) => {
      const oldData = localStorage.getItem(oldKey);
      const newData = localStorage.getItem(newKey);
      // 旧データがあり、新データがない場合のみ移行
      if (oldData && !newData) {
        localStorage.setItem(newKey, oldData);
        localStorage.removeItem(oldKey);
        console.log(`[Migration] ${oldKey} → ${newKey}`);
        migrated = true;
      } else if (oldData && newData) {
        // 両方ある場合は旧データを削除（新データを優先）
        localStorage.removeItem(oldKey);
        console.log(`[Migration] Removed legacy key: ${oldKey}`);
      }
    });
    if (migrated) {
      console.log("[Migration] データ移行が完了しました");
    }

    // 旧 persistApiKey / volatileApiKey を削除（機能廃止: API鍵は常にlocalStorageに保存）
    const settingsRaw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (settingsRaw) {
      const parsed = safeJSONParse(settingsRaw, {});
      if ("persistApiKey" in parsed || "volatileApiKey" in parsed) {
        delete parsed.persistApiKey;
        delete parsed.volatileApiKey;
        delete parsed._volatileMigrated;
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(parsed));
        sessionStorage.removeItem("localLLMChat_apiKey");
        console.log("[Migration] persistApiKey/volatileApiKey を削除しました");
      }
    }
  }

  const LIMITS = Object.freeze({
    IMAGE_MAX_BYTES: 20 * 1024 * 1024,  // 20MB
    FILE_MAX_BYTES:  2 * 1024 * 1024,   // 2MB
    PDF_MAX_BYTES:  10 * 1024 * 1024,   // 10MB
    PDF_TEXT_MAX_CHARS: 30000,           // PDFテキスト上限（約30,000文字 ≒ ~10,000トークン）
    TEXT_MAX_CHARS: 30000,               // テキストファイル上限（CSV等。PDF同等）
    MAX_HISTORY_FOR_API: 6,             // フォールバック: max_context_length不明時の上限
    MAX_HISTORY_UPPER_BOUND: 30,        // 絶対上限: トークン計算でも超えない最大ターン数
    MAX_TEXTAREA_PX: 240,
    MIN_TEXTAREA_PX: 56,
    IDB_IMAGE_WARN_MB: 200,             // IndexedDB画像 警告しきい値 (MB)
    IDB_IMAGE_MAX_MB: 500,              // IndexedDB画像 自動削除しきい値 (MB)
  });

  // ---------------------------------------------------------------------------
  // IndexedDB: 画像データのオフロード（localStorage 5MB上限回避）
  // ---------------------------------------------------------------------------

  const IDB_NAME = "localLLMChat_images";
  const IDB_VERSION = 1;
  const IDB_STORE = "images";

  /** @type {IDBDatabase|null} */
  let _idb = null;

  /**
   * IndexedDB を開く（初回時にストアを自動作成）
   * @returns {Promise<IDBDatabase>}
   */
  function openImageDb() {
    if (_idb) return Promise.resolve(_idb);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => { _idb = req.result; resolve(_idb); };
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * IndexedDB に画像を保存する
   * @param {string} key - 一意キー（例: メッセージID）
   * @param {string} dataUrl - base64 DataURL
   * @returns {Promise<void>}
   */
  async function saveImageToIdb(key, dataUrl) {
    const db = await openImageDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(dataUrl, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * IndexedDB から画像を取得する
   * @param {string} key
   * @returns {Promise<string|undefined>}
   */
  async function getImageFromIdb(key) {
    const db = await openImageDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * IndexedDB から画像を削除する
   * @param {string} key
   * @returns {Promise<void>}
   */
  async function deleteImageFromIdb(key) {
    const db = await openImageDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * IndexedDB の全画像を削除する
   * @returns {Promise<void>}
   */
  async function clearAllImagesFromIdb() {
    const db = await openImageDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * IndexedDB 内の画像総サイズを取得する (bytes)
   * @returns {Promise<number>}
   */
  async function getIdbImagesTotalSize() {
    const db = await openImageDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const store = tx.objectStore(IDB_STORE);
      const req = store.openCursor();
      let total = 0;
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          if (typeof cursor.value === "string") total += cursor.value.length * 2; // UTF-16
          cursor.continue();
        } else {
          resolve(total);
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * IndexedDB から最も古い画像を削除する（容量超過時に呼ぶ）
   * @param {number} targetBytes - この値以下になるまで削除
   * @returns {Promise<number>} 削除した件数
   */
  async function pruneOldestImages(targetBytes) {
    const db = await openImageDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      const store = tx.objectStore(IDB_STORE);
      const req = store.openCursor();
      let total = 0;
      const keysToCheck = [];

      // まずすべてのキーとサイズを列挙
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          const size = typeof cursor.value === "string" ? cursor.value.length * 2 : 0;
          total += size;
          keysToCheck.push({ key: cursor.key, size });
          cursor.continue();
        } else {
          // totalが目標以下なら削除不要
          if (total <= targetBytes) { resolve(0); return; }
          // 古い順（先頭）から削除
          let deletedCount = 0;
          let current = total;
          const deleteNext = () => {
            if (current <= targetBytes || keysToCheck.length === 0) {
              resolve(deletedCount);
              return;
            }
            const item = keysToCheck.shift();
            const delReq = store.delete(item.key);
            delReq.onsuccess = () => {
              current -= item.size;
              deletedCount++;
              deleteNext();
            };
            delReq.onerror = () => resolve(deletedCount);
          };
          deleteNext();
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * メッセージ配列内の imageData を IndexedDB にオフロードする
   * imageData が "data:" で始まる場合は IDB に保存し、参照キー "idb:<msgId>" に置換
   * @param {StoredMessage[]} msgs
   * @returns {Promise<StoredMessage[]>} imageData が idb: 参照に置き換わったコピー
   */
  async function offloadImagesToIdb(msgs) {
    const result = [];
    for (const m of msgs) {
      const clone = { ...m };
      // 単一 imageData の処理（後方互換）
      if (clone.imageData && clone.imageData.startsWith("data:")) {
        const key = clone.id || generateMsgId();
        try {
          await saveImageToIdb(key, clone.imageData);
          clone.imageData = "idb:" + key;
        } catch (e) {
          console.warn("[IDB] 画像保存失敗:", e);
        }
      }
      // imageDataList の処理
      if (Array.isArray(clone.imageDataList)) {
        const newList = [];
        for (let i = 0; i < clone.imageDataList.length; i++) {
          const img = clone.imageDataList[i];
          if (img && img.startsWith("data:")) {
            const key = (clone.id || generateMsgId()) + "_" + i;
            try {
              await saveImageToIdb(key, img);
              newList.push("idb:" + key);
            } catch (e) {
              console.warn("[IDB] 画像保存失敗:", e);
              newList.push(img);
            }
          } else {
            newList.push(img);
          }
        }
        clone.imageDataList = newList;
      }
      result.push(clone);
    }
    return result;
  }

  /**
   * メッセージ配列内の "idb:<key>" 参照を実データに復元する
   * @param {StoredMessage[]} msgs
   * @returns {Promise<StoredMessage[]>}
   */
  async function rehydrateImagesFromIdb(msgs) {
    const result = [];
    for (const m of msgs) {
      const clone = { ...m };
      // 単一 imageData の復元（後方互換）
      if (clone.imageData && clone.imageData.startsWith("idb:")) {
        const key = clone.imageData.slice(4);
        try {
          const data = await getImageFromIdb(key);
          if (data) clone.imageData = data;
        } catch (e) {
          console.warn("[IDB] 画像復元失敗:", e);
        }
      }
      // imageDataList の復元
      if (Array.isArray(clone.imageDataList)) {
        const newList = [];
        for (const img of clone.imageDataList) {
          if (img && img.startsWith("idb:")) {
            const key = img.slice(4);
            try {
              const data = await getImageFromIdb(key);
              newList.push(data || img);
            } catch (e) {
              console.warn("[IDB] 画像復元失敗:", e);
              newList.push(img);
            }
          } else {
            newList.push(img);
          }
        }
        clone.imageDataList = newList;
      }
      result.push(clone);
    }
    return result;
  }

  /**
   * ストレージ容量チェック（警告・自動削除）
   * persistHistory 完了後に非同期で呼ぶ
   */
  async function checkImageStorageQuota() {
    try {
      const totalBytes = await getIdbImagesTotalSize();
      const totalMB = totalBytes / (1024 * 1024);

      if (totalMB > LIMITS.IDB_IMAGE_MAX_MB) {
        const target = LIMITS.IDB_IMAGE_WARN_MB * 1024 * 1024;
        const deleted = await pruneOldestImages(target);
        notify(`⚠️ 画像容量が${LIMITS.IDB_IMAGE_MAX_MB}MBを超えたため、古い画像${deleted}件を自動削除しました`);
      } else if (totalMB > LIMITS.IDB_IMAGE_WARN_MB) {
        notify(`⚠️ 画像ストレージ使用量: ${totalMB.toFixed(0)}MB / ${LIMITS.IDB_IMAGE_MAX_MB}MB`);
      }
    } catch (e) {
      console.warn("[IDB] 容量チェック失敗:", e);
    }
  }

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
    "qwen3.5",      // Qwen3.5 (native multimodal)
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
    "medgemma",           // Google MedGemma (medical multimodal)
  ]);

  // LM Studio v1 API エンドポイント（モデル管理用）
  const LMSTUDIO_V1_API = Object.freeze({
    MODELS: "/api/v1/models",        // GET: 全ダウンロード済みモデル（state付き）
    LOAD: "/api/v1/models/load",     // POST: モデルロード
    UNLOAD: "/api/v1/models/unload", // POST: モデルアンロード
  });

  // モデル状態（/api/v1/models のレスポンス）
  const MODEL_STATE = Object.freeze({
    LOADED: "loaded",
    NOT_LOADED: "not-loaded",
  });

  // デフォルト設定値
  const DEFAULT_SETTINGS = Object.freeze({
    baseUrl: "http://localhost:1234/v1",
    apiKey: "lmstudio",
    model: null,
    temperature: 0.7,
    maxTokens: 2048,
    systemPrompt: "あなたは優秀なAIアシスタントです。ユーザーの質問に対して、正確で分かりやすい回答を日本語で提供してください。必要に応じて具体例や補足を加え、専門用語には簡単な説明を添えてください。",
    responseStyle: "standard",
    responseLanguage: "",       // 応答言語（"" = 自動, "ja", "en", "zh", "ko"）
    sendKey: "enter",
    userName: "",          // v1.8.0: ユーザーの呼び名
    userLevel: "",
    userProfession: "",
    userInterests: "",
    darkMode: false,
    autoUnload: true,     // v1.7.3: モデル切替時に前のモデルを自動アンロード
    reasoningEffort: "",  // v1.8.0: reasoning_effort パラメータ（"", "low", "medium", "high"）
    showWelcome: true,    // v1.8.0: 起動時にオープニング画面を表示
    showSamplePrompts: true, // プロンプト集ボタンの表示
    hideThinking: false,     // 思考プロセス表示を非表示
    enableQwen3Thinking: false, // Qwen3のThinkingモードを有効化（デフォルト: 無効）
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
    clearBtn: document.getElementById("clearBtn"),
    // settings
    settingsBtn: document.getElementById("settingsBtn"),
    settingsPanel: document.getElementById("settingsPanel"),
    closeSettingsBtn: document.getElementById("closeSettingsBtn"),
    baseUrlPreset: document.getElementById("baseUrlPreset"),
    baseUrl: document.getElementById("baseUrl"),
    apiKey: document.getElementById("apiKey"),  // UI削除済み: null
    temperature: document.getElementById("temperature"),
    tempValue: document.getElementById("tempValue"),
    maxTokens: document.getElementById("maxTokens"),
    systemPrompt: document.getElementById("systemPrompt"),
    systemPromptPresetSelect: document.getElementById("systemPromptPresetSelect"),  // v1.7.2
    saveSystemPromptPresetBtn: document.getElementById("saveSystemPromptPresetBtn"),  // v1.7.2
    deleteSystemPromptPresetBtn: document.getElementById("deleteSystemPromptPresetBtn"),  // v1.7.2
    responseStyle: document.getElementById("responseStyle"),
    responseLanguage: document.getElementById("responseLanguage"),
    sendKey: document.getElementById("sendKey"),
    userName: document.getElementById("userName"),
    userLevel: document.getElementById("userLevel"),
    userProfession: document.getElementById("userProfession"),
    userInterests: document.getElementById("userInterests"),
    darkModeToggle: document.getElementById("darkModeToggle"),
    autoUnloadToggle: document.getElementById("autoUnloadToggle"),      // v1.7.3
    reasoningEffort: document.getElementById("reasoningEffort"),        // v1.8.0: UI削除済み（null）
    showWelcomeToggle: document.getElementById("showWelcomeToggle"),   // v1.8.0
    showSamplePromptsToggle: document.getElementById("showSamplePromptsToggle"),
    hideThinkingToggle: document.getElementById("hideThinkingToggle"),
    enableQwen3ThinkingToggle: document.getElementById("enableQwen3ThinkingToggle"),
    samplePromptsBtn: document.getElementById("samplePromptsBtn"),

    // v1.7.2: 医学用語チェックモーダル
    termCheckModal: document.getElementById("termCheckModal"),
    termCheckContent: document.getElementById("termCheckContent"),
    termCheckCorrected: document.getElementById("termCheckCorrected"),
    termCheckCorrectedText: document.getElementById("termCheckCorrectedText"),
    termCheckCancel: document.getElementById("termCheckCancel"),
    termCheckAsIs: document.getElementById("termCheckAsIs"),
    termCheckApply: document.getElementById("termCheckApply"),

    // v1.8.0: キーボードショートカットモーダル
    shortcutsBtn: document.getElementById("shortcutsBtn"),
    shortcutsModal: document.getElementById("shortcutsModal"),
    shortcutsCloseBtn: document.getElementById("shortcutsCloseBtn"),

    // v1.8.0: モデル表示フィルター
    modelVisibilityList: document.getElementById("modelVisibilityList"),
    modelVisibilityCount: document.getElementById("modelVisibilityCount"),
    modelVisibilitySelectAllBtn: document.getElementById("modelVisibilitySelectAllBtn"),
    modelVisibilityClearBtn: document.getElementById("modelVisibilityClearBtn"),

    // v1.8.0: セッション管理
    sessionList: document.getElementById("sessionList"),
    sessionCount: document.getElementById("sessionCount"),
    createSessionBtn: document.getElementById("createSessionBtn"),

    // v1.6: data management
    resetSettingsBtn: document.getElementById("resetSettingsBtn"),
    clearAllDataBtn: document.getElementById("clearAllDataBtn"),

    // attachments (multiple files support)
    imageInput: document.getElementById("imageInput"),
    fileInput: document.getElementById("fileInput"),
    attachmentList: document.getElementById("attachmentList"),

    // deep dive mode
    deepDiveBtn: document.getElementById("deepDiveBtn"),

    // help mode
    helpBtn: document.getElementById("helpBtn"),

    // compare mode (v1.7.0)
    compareBtn: document.getElementById("compareBtn"),
    compareRow: document.getElementById("compareRow"),
    compareModelSelect: document.getElementById("compareModelSelect"),

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

  /** @type {{controller: AbortController|null, availableModels:Set<string>, modelDetails:Map<string,{state:string,quantization:string|null,max_context_length:number|null}>, lmstudioV1Available:boolean}} */
  const runtime = {
    controller: null,          // Stopボタン用
    availableModels: new Set(), // /v1/models の正確なID一覧
    modelDetails: new Map(),   // v1.7.0: モデル詳細情報（state, quantization, max_context_length）
    lmstudioV1Available: false, // v1.7.0: LM Studio v1 API 利用可能フラグ
    lastUsage: null,           // 最新の応答のusage情報
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

  /** 新しい話題の開始位置（この位置以降のメッセージのみAPIに送信） */
  let topicStartIndex = 0;

  /** @type {Settings} */
  let settings = /** @type {any} */ ({});

  /** @type {Record<string,string>} */
  let customPresets = {};
  /** @type {Record<string,string>} */
  let customPresetLabels = {};

  let draftSaveTimer = null;

  /** 深掘りモードが有効かどうか */
  let deepDiveMode = false;

  /** 比較モードが有効かどうか (v1.7.0) */
  let compareMode = false;

  /** ストリーミング中にユーザーが手動スクロールしたか */
  let userScrolledDuringStream = false;

  /** ストリーミング中かどうか */
  let isStreaming = false;

  /** ヘルプモードが有効かどうか */
  let helpMode = false;

  /** @type {Array<{id:string, title:string, history:StoredMessage[], createdAt:string, updatedAt:string}>} */
  let sessions = [];

  /** @type {string} */
  let currentSessionId = "";

  // ---------------------------------------------------------------------------
  // Help Mode: 3段階ヘルプシステム (v1.8.1)
  //   1. FAQ表示 — よくある質問をカードで表示、クリックで即回答
  //   2. ローカル検索 — マニュアル内をキーワード検索
  //   3. LLM質問 — 検索で不足ならLLMに質問を転送
  // ---------------------------------------------------------------------------

  let _manualContentCache = null;
  /** @type {Array<{title:string, content:string}>} マニュアルをセクション分割したキャッシュ */
  let _manualSections = [];

  const HELP_MANUAL_FALLBACK = `# Local LLM Chat ヘルプ
このアプリはローカルLLMサーバー（LM Studio / Ollama）と連携するチャットアプリです。
- LM Studioを起動しモデルをロード → 自動でAPIが有効に
- 画像・ファイル添付対応（Vision対応モデルで画像認識可能）
- ⚖️ 比較モードで2つのモデルの回答を並べて比較
- 詳しくは MANUAL.md を参照してください。`;

  /** よくある質問（即座に回答可能な項目） */
  const HELP_FAQ = [
    {
      icon: "🚀",
      q: "起動方法は？",
      a: "1. LM StudioまたはOllamaを起動し、モデルをロード\n2. index.html をブラウザで開く\n3. 設定 → 基本タブ → 接続先サーバーを選択（LM Studio / Ollama / カスタム）\n4. モデルが自動的にドロップダウンに表示されます\n\n疎通確認: ターミナルで以下を実行\n・LM Studio: curl http://localhost:1234/v1/models\n・Ollama: curl http://localhost:11434/v1/models"
    },
    {
      icon: "🤖",
      q: "モデルが表示されない",
      a: "1. LM Studio/Ollamaでモデルがロードされているか確認（最重要）\n2. 設定 → 基本タブ → 接続先サーバーが正しいか確認\n3. ターミナルで疎通確認（LM Studio: curl http://localhost:1234/v1/models / Ollama: curl http://localhost:11434/v1/models）\n4. LM Studioの場合: CORSが有効か確認（設定 → Local Server → 「CORSを有効にする」がON）\n5. モデル選択ドロップダウンをクリックして更新\n6. 設定 → モデルタブ → 「表示モデル管理」で非表示になっていないか確認"
    },
    {
      icon: "📎",
      q: "ファイル添付の使い方",
      a: "📷 Image: 画像ファイルを添付（複数可、20MB以下）\n📎 File: テキスト/PDFファイルを添付（テキスト2MB、PDF10MB以下）\n\n対応方法: ボタン、Ctrl+V（ペースト）、ドラッグ＆ドロップ\nVision対応モデル（👁️マーク）で画像認識が可能です。PDFはテキスト抽出してLLMに送信されます。"
    },
    {
      icon: "⚖️",
      q: "モデル比較の使い方",
      a: "1. ⚖️ 比較ボタンをONにする\n2. 2つ目のモデルを選択（LM Studioで2つのモデルをロードしておく必要あり）\n3. メッセージを送信すると、両モデルの回答が並んで表示されます\n\n注意: LM Studio v0.4.0以降が必要です。Developers設定の「JIT models auto-evict」をOFFにしてください。"
    },
    {
      icon: "⌨️",
      q: "キーボードショートカット",
      a: "Enter / Ctrl+Enter: メッセージ送信（設定で変更可能）\nShift+Enter: 改行\nCtrl+V: 画像ペースト\nCtrl+K: 履歴クリア\nCtrl+/: ショートカット一覧を表示\nEsc: パネルを閉じる"
    },
    {
      icon: "💾",
      q: "データの保存場所は？",
      a: "会話履歴と設定はブラウザのlocalStorageに保存されます。外部サーバーには一切送信されません。\n\n画像データが多い場合はIndexedDBに自動オフロードされます。\n\n「設定 → データタブ → すべての保存データを消す」で全データを初期化できます。"
    },
    {
      icon: "🔧",
      q: "応答が途中で止まる",
      a: "1. Max Tokensの値を確認（小さすぎると途中で切れます）\n2. より小さいモデルを試す\n3. 長い会話は「新しい話題」ボタンでコンテキストをリセット\n4. Temperature を下げると安定しやすくなります"
    },
    {
      icon: "🧠",
      q: "Thinkingモードとは？",
      a: "Qwen3等のモデルが<think>タグで思考プロセスを出力する機能です。\n\nQwen3はデフォルトでThinking無効です。設定 → モデルタブ → 🧠 Thinking設定 で制御できます:\n・「Qwen3のThinkingを有効化」: チェックでThinkingを有効化\n・「思考プロセスを非表示」: 表示だけ隠す（折りたたみ）"
    },
  ];

  async function getManualContent() {
    if (_manualContentCache) return _manualContentCache;
    try {
      const res = await fetch("./assets/help-manual.txt");
      if (!res.ok) throw new Error(res.statusText);
      _manualContentCache = (await res.text()).trim();
    } catch (e) {
      console.warn("[Help] マニュアル外部ファイル読込失敗、フォールバック使用:", e.message);
      _manualContentCache = HELP_MANUAL_FALLBACK;
    }
    _manualSections = parseManualSections(_manualContentCache);
    return _manualContentCache;
  }

  /**
   * マニュアルテキストを ##/### 見出し単位でセクション分割
   * @param {string} text
   * @returns {Array<{title:string, content:string}>}
   */
  function parseManualSections(text) {
    const lines = text.split("\n");
    const sections = [];
    let currentTitle = "";
    let currentLines = [];

    for (const line of lines) {
      const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
      if (headingMatch) {
        if (currentTitle || currentLines.length > 0) {
          sections.push({ title: currentTitle, content: currentLines.join("\n").trim() });
        }
        currentTitle = headingMatch[2];
        currentLines = [];
      } else {
        currentLines.push(line);
      }
    }
    if (currentTitle || currentLines.length > 0) {
      sections.push({ title: currentTitle, content: currentLines.join("\n").trim() });
    }
    return sections.filter(s => s.content.length > 0);
  }

  /**
   * マニュアル内をキーワード検索し、該当セクションを返す
   * @param {string} query
   * @returns {Array<{title:string, content:string, score:number}>}
   */
  function searchManualSections(query) {
    if (_manualSections.length === 0 && _manualContentCache) {
      _manualSections = parseManualSections(_manualContentCache);
    }
    if (_manualSections.length === 0) return [];

    const keywords = query.toLowerCase().split(/\s+/).filter(k => k.length > 0);
    if (keywords.length === 0) return [];

    const results = [];
    for (const section of _manualSections) {
      const haystack = (section.title + " " + section.content).toLowerCase();
      let score = 0;
      for (const kw of keywords) {
        // タイトルマッチは高スコア
        if (section.title.toLowerCase().includes(kw)) score += 3;
        // 本文マッチ（出現回数）
        const contentMatches = haystack.split(kw).length - 1;
        score += contentMatches;
      }
      if (score > 0) {
        results.push({ ...section, score });
      }
    }
    return results.sort((a, b) => b.score - a.score).slice(0, 5);
  }

  /**
   * 検索結果のテキスト内でキーワードをハイライト（HTML）
   * @param {string} text
   * @param {string} query
   * @returns {string}
   */
  function highlightKeywords(text, query) {
    const keywords = query.split(/\s+/).filter(k => k.length > 0);
    let html = escapeHtml(text);
    for (const kw of keywords) {
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      html = html.replace(new RegExp(`(${escaped})`, "gi"), "<mark>$1</mark>");
    }
    return html;
  }

  /**
   * ヘルプパネル（FAQ + 検索ボックス）をチャットエリアに表示
   */
  function showHelpPanel() {
    hideHelpPanel();
    hideWelcomeScreen();

    const panel = document.createElement("div");
    panel.className = "help-panel";
    panel.id = "helpPanelInChat";

    // タイトル
    panel.innerHTML = `
      <div style="font-size:2rem;margin-bottom:4px">❓</div>
      <h2 class="help-panel-title">ヘルプ</h2>
      <p class="help-panel-subtitle">よくある質問をクリック、または下の検索ボックスで探せます</p>
    `;

    // FAQ グリッド
    const grid = document.createElement("div");
    grid.className = "help-faq-grid";
    for (let i = 0; i < HELP_FAQ.length; i++) {
      const faq = HELP_FAQ[i];
      const card = document.createElement("div");
      card.className = "help-faq-card";
      card.innerHTML = `
        <span class="help-faq-icon">${faq.icon}</span>
        <span class="help-faq-text"><strong>${escapeHtml(faq.q)}</strong></span>
      `;
      card.addEventListener("click", () => showFaqAnswer(i));
      grid.appendChild(card);
    }
    panel.appendChild(grid);

    // FAQ 回答表示エリア
    const answerArea = document.createElement("div");
    answerArea.id = "helpFaqAnswerArea";
    answerArea.style.cssText = "max-width:560px;width:100%";
    panel.appendChild(answerArea);

    // 検索ボックス
    const searchBox = document.createElement("div");
    searchBox.className = "help-search-box";
    searchBox.innerHTML = `
      <input type="text" class="help-search-input" id="helpSearchInput"
             placeholder="キーワードで検索…（例: CORS、比較、PDF）" />
      <button class="help-search-btn" id="helpSearchBtn">🔍 検索</button>
    `;
    panel.appendChild(searchBox);

    // 検索結果エリア
    const resultsArea = document.createElement("div");
    resultsArea.className = "help-search-results";
    resultsArea.id = "helpSearchResults";
    panel.appendChild(resultsArea);

    // LLMに質問ボタン
    const llmRow = document.createElement("div");
    llmRow.style.cssText = "display:flex;gap:8px;align-items:center;margin-top:8px";
    llmRow.innerHTML = `
      <button class="help-llm-btn" id="helpAskLlmBtn">🤖 LLMに質問する</button>
      <span style="font-size:0.8rem;color:#999">検索で見つからない場合</span>
    `;
    panel.appendChild(llmRow);

    // 閉じるボタン
    const closeBtn = document.createElement("button");
    closeBtn.className = "help-close-btn";
    closeBtn.textContent = "← ヘルプを閉じる";
    closeBtn.addEventListener("click", () => {
      helpMode = false;
      updateHelpButton();
      hideHelpPanel();
      if (messages.length === 0) showWelcomeScreen();
      notify("❓ ヘルプモード OFF");
    });
    panel.appendChild(closeBtn);

    el.chat.appendChild(panel);

    // イベント登録
    const searchInput = document.getElementById("helpSearchInput");
    const searchBtn = document.getElementById("helpSearchBtn");
    const askLlmBtn = document.getElementById("helpAskLlmBtn");

    searchBtn.addEventListener("click", () => executeHelpSearch(searchInput.value));
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        executeHelpSearch(searchInput.value);
      }
    });

    askLlmBtn.addEventListener("click", () => {
      const query = searchInput.value.trim();
      if (!query) {
        searchInput.focus();
        searchInput.placeholder = "質問を入力してからボタンを押してください";
        return;
      }
      // ヘルプパネルを消してLLMモードでチャットに質問を送信
      hideHelpPanel();
      el.prompt.value = query;
      // helpMode は ON のまま → buildConversation でマニュアル注入
      handleSend();
    });

    scrollToBottom();
  }

  /**
   * FAQの回答をパネル内に表示
   * @param {number} index
   */
  function showFaqAnswer(index) {
    const faq = HELP_FAQ[index];
    if (!faq) return;
    const area = document.getElementById("helpFaqAnswerArea");
    if (!area) return;

    area.innerHTML = `
      <div class="help-faq-answer">
        <div class="help-faq-answer-title">${faq.icon} ${escapeHtml(faq.q)}</div>
        <div style="white-space:pre-wrap">${escapeHtml(faq.a)}</div>
      </div>
    `;
    area.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  /**
   * ローカル検索を実行して結果を表示
   * @param {string} query
   */
  function executeHelpSearch(query) {
    const trimmed = query.trim();
    const resultsEl = document.getElementById("helpSearchResults");
    if (!resultsEl) return;

    if (!trimmed) {
      resultsEl.innerHTML = "";
      return;
    }

    const results = searchManualSections(trimmed);

    if (results.length === 0) {
      resultsEl.innerHTML = `
        <div class="help-search-no-result">
          「${escapeHtml(trimmed)}」に該当する項目が見つかりませんでした。<br>
          「🤖 LLMに質問する」ボタンで詳しく聞くことができます。
        </div>
      `;
    } else {
      resultsEl.innerHTML = results.map(r => `
        <div class="help-search-result">
          <div class="help-search-result-title">${escapeHtml(r.title)}</div>
          <div style="white-space:pre-wrap">${highlightKeywords(r.content, trimmed)}</div>
        </div>
      `).join("");
    }
    resultsEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function hideHelpPanel() {
    const panel = document.getElementById("helpPanelInChat");
    if (panel) panel.remove();
  }

  // ---------------------------------------------------------------------------
  // Markdown (marked) - safe-ish renderer tweaks
  // ---------------------------------------------------------------------------

  function setupMarkdown() {
    marked.setOptions({ breaks: true, gfm: true });

    // リンクを必ず別タブで開く（rel も付与）
    // marked v15+ ではレンダラーのシグネチャが変更されている
    const renderer = {
      link({ href, title, text }) {
        const titleAttr = title ? ` title="${title}"` : '';
        return `<a href="${href || ''}"${titleAttr} target="_blank" rel="noopener noreferrer">${text || ''}</a>`;
      }
    };

    marked.use({ renderer });
  }

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------

  /** メッセージ用の一意なIDを生成 */
  function generateMsgId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  }

  /** @param {string} raw */
  function trimTrailingSlashes(raw) {
    return String(raw || "").replace(/\/+$/, "");
  }

  /**
   * テキストのトークン数を概算する
   * 日本語: ~1.5 chars/token, 英語: ~4 chars/token → 安全平均 ~2 chars/token
   * @param {string|Array} content - テキストまたはVision API形式のcontent配列
   * @returns {number}
   */
  function estimateTokens(content) {
    if (!content) return 0;
    if (typeof content === "string") return Math.ceil(content.length / 2);
    if (Array.isArray(content)) {
      let tokens = 0;
      for (const item of content) {
        if (item.type === "text") tokens += Math.ceil((item.text || "").length / 2);
        else if (item.type === "image_url") tokens += 300;
      }
      return tokens;
    }
    return 0;
  }

  /**
   * 現在選択中のモデルの max_context_length を取得する
   * @returns {number|null}
   */
  function getModelContextLength() {
    const model = el.modelSelect.value || settings.model;
    if (!model) return null;
    const details = runtime.modelDetails.get(model);
    return details?.max_context_length || null;
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
    // LM Studio ネイティブAPI: capabilities.vision で正確に判別
    const details = runtime.modelDetails.get(modelId);
    if (details?.capabilities?.vision === true) return true;
    if (details?.capabilities?.vision === false) return false;
    // フォールバック: キーワードマッチ（レガシーAPI時）
    const lower = String(modelId).toLowerCase();
    return VISION_KEYWORDS.some(k => lower.includes(k));
  }

  /**
   * Qwen3 Thinkingモデルかどうかを判定（qwen3.5、qwen3-vl は除外）
   * @param {string} modelId
   * @returns {boolean}
   */
  function isQwen3ThinkingModel(modelId) {
    const lower = String(modelId).toLowerCase();
    // "qwen3" を含むが "qwen3.5" "qwen3-vl" "qwen3_vl" を除外
    if (!lower.includes("qwen3")) return false;
    if (lower.includes("qwen3.5")) return false;
    if (lower.includes("qwen3-vl") || lower.includes("qwen3_vl")) return false;
    return true;
  }

  /**
   * 現在のモデルでThinkingを無効化すべきかを判定
   * Qwen3のみ: デフォルト無効、トグルONで有効化
   * @returns {boolean}
   */
  function shouldDisableThinking() {
    const model = el.modelSelect.value || settings.model || "";
    if (isQwen3ThinkingModel(model)) {
      return !settings.enableQwen3Thinking;
    }
    return false;
  }

  /**
   * 応答統計（時間・トークン数・速度）をメッセージ下部に表示
   * @param {HTMLElement} msgDiv - assistantメッセージのdiv
   * @param {number} elapsedMs - 応答時間（ミリ秒）
   * @param {object|null} usage - APIのusageオブジェクト
   */
  function appendResponseStats(msgDiv, elapsedMs, usage) {
    // 既存のstatsがあれば削除
    const existing = msgDiv.querySelector(".response-stats");
    if (existing) existing.remove();

    const parts = [];
    const sec = (elapsedMs / 1000).toFixed(1);

    if (usage && usage.completion_tokens) {
      const tps = (usage.completion_tokens / (elapsedMs / 1000)).toFixed(1);
      parts.push(`⚡ ${tps} tok/s`);
      if (usage.prompt_tokens) {
        parts.push(`📥 prompt: ${usage.prompt_tokens}`);
      }
      parts.push(`📝 ${usage.completion_tokens} tokens`);
    }
    parts.push(`⏱ ${sec}s`);

    const statsEl = document.createElement("div");
    statsEl.className = "response-stats";
    statsEl.textContent = parts.join("  ·  ");
    msgDiv.appendChild(statsEl);
  }

  /** @param {string} message */
  function notify(message) {
    appendMessage("system", message, { save: false });
  }

  function scrollToBottom() {
    el.chat.scrollTop = el.chat.scrollHeight;
  }

  /**
   * ユーザーがチャット下部付近にいるかどうかを判定
   */
  function isNearBottom() {
    const threshold = 150;
    return el.chat.scrollTop + el.chat.clientHeight >= el.chat.scrollHeight - threshold;
  }

  /**
   * ストリーミング中のスマートスクロール
   * ユーザーが手動でスクロールしていない場合のみ自動スクロール
   */
  function smartScrollToBottom() {
    if (!userScrolledDuringStream) {
      el.chat.scrollTop = el.chat.scrollHeight;
    }
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
    const apiKey = s.apiKey || DEFAULT_SETTINGS.apiKey;
    return /** @type {Settings} */ ({
      baseUrl: s.baseUrl || DEFAULT_SETTINGS.baseUrl,
      apiKey,
      model: s.model,
      temperature: (typeof s.temperature === "number") ? s.temperature : DEFAULT_SETTINGS.temperature,
      maxTokens: (typeof s.maxTokens === "number") ? s.maxTokens : DEFAULT_SETTINGS.maxTokens,
      systemPrompt: s.systemPrompt || DEFAULT_SETTINGS.systemPrompt,
      responseStyle: s.responseStyle || DEFAULT_SETTINGS.responseStyle,
      responseLanguage: s.responseLanguage || DEFAULT_SETTINGS.responseLanguage,
      sendKey: s.sendKey || DEFAULT_SETTINGS.sendKey,
      userName: s.userName || DEFAULT_SETTINGS.userName,
      userLevel: s.userLevel || DEFAULT_SETTINGS.userLevel,
      userProfession: s.userProfession || DEFAULT_SETTINGS.userProfession,
      userInterests: s.userInterests || DEFAULT_SETTINGS.userInterests,
      darkMode: Boolean(s.darkMode),
      autoUnload: s.autoUnload !== false,        // v1.7.3: デフォルトtrue
      reasoningEffort: s.reasoningEffort || "",  // v1.8.0
      showWelcome: s.showWelcome !== false,        // v1.8.0: デフォルトtrue
      showSamplePrompts: s.showSamplePrompts !== false, // デフォルトtrue
      hideThinking: Boolean(s.hideThinking),
      enableQwen3Thinking: Boolean(s.enableQwen3Thinking),
    });
  }

  /** Settings → UIへ反映 */
  function applySettingsToUI() {
    // Base URL プリセット連動
    const presetUrls = Array.from(el.baseUrlPreset.options).map(o => o.value).filter(v => v !== "custom");
    if (presetUrls.includes(settings.baseUrl)) {
      el.baseUrlPreset.value = settings.baseUrl;
      el.baseUrl.style.display = "none";
    } else {
      el.baseUrlPreset.value = "custom";
      el.baseUrl.style.display = "";
    }
    el.baseUrl.value = settings.baseUrl;
    if (el.apiKey) el.apiKey.value = settings.apiKey;
    el.temperature.value = String(settings.temperature);
    el.tempValue.textContent = String(settings.temperature);
    el.maxTokens.value = String(settings.maxTokens);
    el.systemPrompt.value = settings.systemPrompt;
    el.responseStyle.value = settings.responseStyle;
    if (el.responseLanguage) el.responseLanguage.value = settings.responseLanguage || "";
    el.sendKey.value = settings.sendKey || "enter";
    el.userName.value = settings.userName || "";
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


    // v1.7.3: モデル自動アンロード設定
    if (el.autoUnloadToggle) {
      el.autoUnloadToggle.checked = Boolean(settings.autoUnload);
    }

    // v1.8.0: reasoning_effort
    if (el.reasoningEffort) {
      el.reasoningEffort.value = settings.reasoningEffort || "";
    }

    // v1.8.0: オープニング画面表示設定
    if (el.showWelcomeToggle) {
      el.showWelcomeToggle.checked = settings.showWelcome !== false;
    }

    // プロンプト集ボタン表示設定
    if (el.showSamplePromptsToggle) {
      el.showSamplePromptsToggle.checked = settings.showSamplePrompts !== false;
    }
    if (el.samplePromptsBtn) {
      el.samplePromptsBtn.style.display = (settings.showSamplePrompts !== false) ? "" : "none";
    }

    // 思考プロセス非表示設定
    if (el.hideThinkingToggle) {
      el.hideThinkingToggle.checked = Boolean(settings.hideThinking);
    }
    if (el.enableQwen3ThinkingToggle) {
      el.enableQwen3ThinkingToggle.checked = Boolean(settings.enableQwen3Thinking);
    }
  }

  /** UI → settingsへ反映し保存 */
  function saveSettingsFromUI() {
    settings = {
      baseUrl: el.baseUrlPreset.value === "custom" ? el.baseUrl.value.trim() : el.baseUrlPreset.value,
      apiKey: el.apiKey?.value?.trim() || settings.apiKey || DEFAULT_SETTINGS.apiKey,
      model: el.modelSelect.value,
      temperature: parseFloat(el.temperature.value),
      maxTokens: parseInt(el.maxTokens.value, 10),
      systemPrompt: el.systemPrompt.value,
      responseStyle: /** @type {any} */ (el.responseStyle.value),
      responseLanguage: el.responseLanguage?.value || "",
      sendKey: /** @type {any} */ (el.sendKey.value),
      userName: el.userName.value.trim(),
      userLevel: el.userLevel.value,
      userProfession: el.userProfession.value.trim(),
      userInterests: el.userInterests.value.trim(),
      darkMode: document.body.classList.contains("dark-mode"),
      autoUnload: el.autoUnloadToggle?.checked || false,       // v1.7.3
      reasoningEffort: el.reasoningEffort?.value || "",         // v1.8.0
      showWelcome: el.showWelcomeToggle?.checked !== false,    // v1.8.0
      showSamplePrompts: el.showSamplePromptsToggle?.checked !== false,
      hideThinking: el.hideThinkingToggle?.checked || false,
      enableQwen3Thinking: el.enableQwen3ThinkingToggle?.checked || false,
    };
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  }

  /** @returns {StoredMessage[]} */
  function loadHistory() {
    const raw = localStorage.getItem(STORAGE_KEYS.HISTORY) || "[]";
    const arr = safeJSONParse(raw, []);
    // 後方互換: 既存メッセージにIDがなければ付与
    arr.forEach(m => { if (!m.id) m.id = generateMsgId(); });
    return arr;
  }

  /**
   * メッセージ配列を正規化: 同じroleが連続する場合、後のメッセージで上書き
   * （重複保存やストリーミング異常終了時のゴミを除去）
   */
  function sanitizeMessages() {
    const cleaned = [];
    for (const m of messages) {
      if (cleaned.length > 0 && cleaned[cleaned.length - 1].role === m.role) {
        cleaned[cleaned.length - 1] = m;
      } else {
        cleaned.push(m);
      }
    }
    messages = cleaned;
  }

  /** 非同期画像オフロードのキュー制御 */
  let _persistQueue = Promise.resolve();

  function persistHistory() {
    sanitizeMessages();
    // 同期: まず imageData をそのまま保存（フォールバック）
    localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(messages));
    syncCurrentSession();

    // 非同期: 画像を IndexedDB にオフロードし、localStorage を軽量化
    _persistQueue = _persistQueue.then(async () => {
      try {
        const offloaded = await offloadImagesToIdb(messages);
        // messages 内の imageData を idb: 参照に置換
        for (let i = 0; i < messages.length; i++) {
          if (offloaded[i] && offloaded[i].imageData !== messages[i].imageData) {
            messages[i].imageData = offloaded[i].imageData;
          }
        }
        localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(messages));
        syncCurrentSession();
        // 容量チェック（バックグラウンド）
        checkImageStorageQuota();
      } catch (e) {
        console.warn("[IDB] 画像オフロード失敗（localStorageにフォールバック）:", e);
      }
    });
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
    // IndexedDB画像も削除
    clearAllImagesFromIdb().catch(e => console.warn("[IDB] 画像削除失敗:", e));

    // 状態をリセット
    messages = [];
    topicStartIndex = 0;
    settings = { ...DEFAULT_SETTINGS };
    customPresets = {};
    customPresetLabels = {};
    sessions = [];
    currentSessionId = "";

    // UI更新
    el.chat.innerHTML = "";
    showWelcomeScreen();
    applySettingsToUI();
    renderPresetUI();
    loadPresetToEditor();
    clearDraft();
    el.prompt.value = "";

    notify("✅ すべてのデータを削除しました");
  }

  // ---------------------------------------------------------------------------
  // v1.8.0: Thinking process extraction (<think> tag support)
  // ---------------------------------------------------------------------------

  /**
   * テキストから思考プロセスブロックを抽出する
   * <think>...</think>, <seed:think>...</seed:think>, <medgemma_thinking>...</medgemma_thinking> に対応
   * @param {string} text
   * @returns {{thinking: string, main: string, isPartial: boolean}}
   */
  function extractThinkingBlocks(text) {
    if (!text) return { thinking: "", main: text || "", isPartial: false };

    const patterns = [
      { open: "<think>", close: "</think>" },
      { open: "<seed:think>", close: "</seed:think>" },
      { open: "<medgemma_thinking>", close: "</medgemma_thinking>" },
    ];

    let thinking = "";
    let main = text;
    let isPartial = false;

    for (const { open, close } of patterns) {
      // 同じタグの全出現を繰り返し抽出
      let idx;
      while ((idx = main.indexOf(open)) !== -1) {
        const closeIdx = main.indexOf(close, idx + open.length);
        if (closeIdx === -1) {
          // 閉じタグがない = ストリーミング中（部分的）
          thinking += main.slice(idx + open.length);
          main = main.slice(0, idx);
          isPartial = true;
          break;
        } else {
          // 完全なブロック
          thinking += main.slice(idx + open.length, closeIdx);
          main = main.slice(0, idx) + main.slice(closeIdx + close.length);
        }
      }
    }

    return { thinking: thinking.trim(), main: main.trim(), isPartial };
  }

  /**
   * 思考プロセスのHTMLを生成する
   * @param {string} thinking - 思考プロセステキスト
   * @param {boolean} isPartial - ストリーミング中か
   * @returns {string} HTML文字列
   */
  function renderThinkingHtml(thinking, isPartial) {
    if (!thinking || settings.hideThinking) return "";
    const label = isPartial ? "思考中…" : "思考プロセス";
    return '<details class="thinking-block"' + (isPartial ? " open" : "") + ">"
      + '<summary class="thinking-summary">' + label + "</summary>"
      + '<div class="thinking-content">' + escapeHtml(thinking) + "</div>"
      + "</details>";
  }

  // ---------------------------------------------------------------------------
  // v1.8.0: Model Visibility Filter
  // ---------------------------------------------------------------------------

  /**
   * モデル表示設定をlocalStorageから読み込む
   * @returns {string[]|null} 表示するモデルIDの配列、nullは全表示
   */
  function loadModelVisibility() {
    const raw = localStorage.getItem(STORAGE_KEYS.MODEL_VISIBILITY);
    if (!raw) return null;
    return safeJSONParse(raw, null);
  }

  /**
   * モデル表示設定をlocalStorageに保存する
   * @param {string[]|null} visibleIds - 表示するモデルIDの配列、nullは全表示
   */
  function saveModelVisibility(visibleIds) {
    if (visibleIds === null) {
      localStorage.removeItem(STORAGE_KEYS.MODEL_VISIBILITY);
    } else {
      localStorage.setItem(STORAGE_KEYS.MODEL_VISIBILITY, JSON.stringify(visibleIds));
    }
  }

  /**
   * モデルリストに表示フィルターを適用する
   * @param {string[]} allModels - 全モデルIDリスト
   * @returns {string[]} フィルター後のモデルIDリスト
   */
  function getVisibleModels(allModels) {
    const visibility = loadModelVisibility();
    if (!visibility) return allModels;
    return allModels.filter(id => visibility.includes(id));
  }

  /**
   * モデル表示フィルターUIを描画する
   */
  function renderModelVisibilityManager() {
    if (!el.modelVisibilityList) return;

    const allIds = Array.from(runtime.availableModels);
    // ABC順にソート（パスプレフィックスを除いた名前で比較）
    allIds.sort((a, b) => {
      const nameA = a.replace(/^.*\//, "").toLowerCase();
      const nameB = b.replace(/^.*\//, "").toLowerCase();
      return nameA.localeCompare(nameB);
    });
    const visibility = loadModelVisibility();

    // カウント表示を更新
    if (el.modelVisibilityCount) {
      const visibleCount = visibility ? visibility.length : allIds.length;
      el.modelVisibilityCount.textContent = `${visibleCount} / ${allIds.length}`;
    }

    // チェックボックスリストを生成
    el.modelVisibilityList.innerHTML = allIds.map(id => {
      const displayName = id.replace(/^.*\//, "");
      const checked = (!visibility || visibility.includes(id)) ? "checked" : "";
      const details = runtime.modelDetails.get(id);
      let label = displayName;
      if (isVisionModel(id)) label += " 👁️";
      if (details?.quantization) label += ` (${details.quantization})`;

      return `<label class="model-visibility-item" style="display:flex;align-items:center;gap:6px;padding:4px 0;cursor:pointer">
        <input type="checkbox" data-model-id="${id}" ${checked} style="margin:0" />
        <span style="font-size:0.9em">${escapeHtml(label)}</span>
      </label>`;
    }).join("");
  }

  /**
   * チェックボックスの状態を読み取り、モデル表示設定を適用する
   */
  function applyModelVisibility() {
    if (!el.modelVisibilityList) return;

    const checkboxes = el.modelVisibilityList.querySelectorAll("input[type='checkbox']");
    const allIds = Array.from(runtime.availableModels);
    const visibleIds = [];

    checkboxes.forEach(cb => {
      if (cb.checked) visibleIds.push(cb.dataset.modelId);
    });

    // 全て選択されている場合はnull（=全表示）として保存
    if (visibleIds.length === allIds.length) {
      saveModelVisibility(null);
    } else {
      saveModelVisibility(visibleIds);
    }

    // カウント更新
    if (el.modelVisibilityCount) {
      el.modelVisibilityCount.textContent = `${visibleIds.length} / ${allIds.length}`;
    }

    // ドロップダウンを更新
    refreshModelDropdown();
  }

  /**
   * モデルドロップダウンをフィルター後のリストで再構築する（API再取得なし）
   */
  function refreshModelDropdown() {
    const allIds = Array.from(runtime.availableModels);
    const visibleIds = getVisibleModels(allIds);

    // 現在の選択を保持
    const currentValue = el.modelSelect.value;

    // ソート
    visibleIds.sort((a, b) => {
      const nameA = a.replace(/^.*\//, "").toLowerCase();
      const nameB = b.replace(/^.*\//, "").toLowerCase();
      return nameA.localeCompare(nameB);
    });

    // ドロップダウン再構築
    el.modelSelect.innerHTML = "";
    visibleIds.forEach(id => {
      const opt = document.createElement("option");
      opt.value = id;
      const displayName = id.replace(/^.*\//, "");
      const details = runtime.modelDetails.get(id);
      let label = displayName;
      if (isVisionModel(id)) label += ` 👁️`;
      if (details?.quantization) label += ` (${details.quantization})`;
      opt.textContent = label;
      el.modelSelect.appendChild(opt);
    });

    // 選択復元
    if (visibleIds.includes(currentValue)) {
      el.modelSelect.value = currentValue;
    } else if (visibleIds.length > 0) {
      el.modelSelect.value = visibleIds[0];
    }

    // 比較モデルドロップダウンも更新
    updateCompareModelDropdown();
  }

  // ---------------------------------------------------------------------------
  // v1.8.0: Session Management
  // ---------------------------------------------------------------------------

  /**
   * セッションIDを生成する
   * @returns {string}
   */
  function generateSessionId() {
    return `${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
  }

  /**
   * ISO日付文字列を "MM/DD HH:mm" 形式に変換する
   * @param {string} isoStr
   * @returns {string}
   */
  function formatSessionDate(isoStr) {
    try {
      const d = new Date(isoStr);
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const hh = String(d.getHours()).padStart(2, "0");
      const min = String(d.getMinutes()).padStart(2, "0");
      return `${mm}/${dd} ${hh}:${min}`;
    } catch {
      return isoStr;
    }
  }

  /**
   * 会話履歴からセッション概要を取得する
   * @param {StoredMessage[]} history
   * @returns {string}
   */
  function getSessionSummary(history) {
    if (!history || history.length === 0) return "新しいチャット";
    const firstUser = history.find(m => m.role === "user");
    if (!firstUser) return "新しいチャット";
    const text = firstUser.content || "";
    return text.length > 40 ? text.slice(0, 40) + "..." : text;
  }

  /**
   * セッションをlocalStorageから読み込む
   * レガシー履歴が存在し、セッションが空の場合はマイグレーションする
   */
  function loadSessions() {
    const raw = localStorage.getItem(STORAGE_KEYS.SESSIONS);
    sessions = raw ? safeJSONParse(raw, []) : [];
    currentSessionId = localStorage.getItem(STORAGE_KEYS.CURRENT_SESSION_ID) || "";

    // レガシー履歴のマイグレーション: セッションが空で既存履歴がある場合
    if (sessions.length === 0) {
      const legacyHistory = loadHistory();
      if (legacyHistory.length > 0) {
        const now = new Date().toISOString();
        const newSession = {
          id: generateSessionId(),
          title: "",
          history: legacyHistory,
          createdAt: now,
          updatedAt: now,
        };
        newSession.title = getSessionSummary(legacyHistory);
        sessions.push(newSession);
        currentSessionId = newSession.id;
        persistSessions();
      } else {
        // 完全に新規: 空セッションを作成
        createNewSession(true);
      }
    }

    // currentSessionIdが有効でない場合は最新のセッションに切り替え
    if (!sessions.find(s => s.id === currentSessionId)) {
      if (sessions.length > 0) {
        currentSessionId = sessions[sessions.length - 1].id;
      } else {
        createNewSession(true);
      }
    }

    // 現在のセッションの履歴をロード（後方互換: IDがないメッセージにID付与）
    const current = sessions.find(s => s.id === currentSessionId);
    if (current) {
      messages = current.history || [];
      messages.forEach(m => { if (!m.id) m.id = generateMsgId(); });
      localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(messages));

      // 非同期: IndexedDB から画像を復元
      rehydrateImagesFromIdb(messages).then(hydrated => {
        messages = hydrated;
        // 画像を含むメッセージのDOM要素を更新
        hydrated.forEach(m => {
          const msgEl = document.querySelector(`[data-msg-id="${m.id}"]`);
          if (!msgEl) return;
          const thumbsDiv = msgEl.querySelector(".image-thumbnails");
          if (thumbsDiv && Array.isArray(m.imageDataList)) {
            const imgs = thumbsDiv.querySelectorAll("img.image-in-message");
            m.imageDataList.forEach((d, i) => {
              if (imgs[i] && d && !d.startsWith("idb:")) imgs[i].src = d;
            });
          } else if (m.imageData && !m.imageData.startsWith("idb:")) {
            msgEl.dataset.imageData = m.imageData;
            const img = msgEl.querySelector("img.image-in-message");
            if (img) img.src = m.imageData;
          }
        });
      }).catch(e => console.warn("[IDB] 画像復元失敗:", e));
    }
  }

  /**
   * セッション配列とcurrentSessionIdをlocalStorageに保存する
   */
  function persistSessions() {
    localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(sessions));
    localStorage.setItem(STORAGE_KEYS.CURRENT_SESSION_ID, currentSessionId);
  }

  /**
   * 現在のセッションの履歴を同期する
   */
  function syncCurrentSession() {
    if (!currentSessionId) return;
    const session = sessions.find(s => s.id === currentSessionId);
    if (!session) return;
    session.history = [...messages];
    session.updatedAt = new Date().toISOString();
    // タイトルが空または "新しいチャット" の場合、自動設定
    if (!session.title || session.title === "新しいチャット") {
      session.title = getSessionSummary(messages);
    }
    persistSessions();
  }

  /**
   * 新しいセッションを作成する
   * @param {boolean} [silent=false] - trueの場合はUI更新やnotifyを行わない（初期化時用）
   */
  function createNewSession(silent = false) {
    // 現在のセッションを同期
    syncCurrentSession();

    const now = new Date().toISOString();
    const newSession = {
      id: generateSessionId(),
      title: "新しいチャット",
      history: [],
      createdAt: now,
      updatedAt: now,
    };

    sessions.push(newSession);

    // セッション数上限チェック（100件）
    while (sessions.length > 100) {
      sessions.shift(); // 最も古いセッションを削除
    }

    currentSessionId = newSession.id;
    messages = [];
    topicStartIndex = 0;
    localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(messages));
    persistSessions();

    if (!silent) {
      el.chat.innerHTML = "";
      showWelcomeScreen();
      renderSessionList();
      notify("📂 新しいセッションを作成しました");
    }
  }

  /**
   * 指定セッションに切り替える
   * @param {string} sessionId
   */
  function switchSession(sessionId) {
    if (sessionId === currentSessionId) return;

    // 現在のセッションを同期
    syncCurrentSession();

    const target = sessions.find(s => s.id === sessionId);
    if (!target) return;

    currentSessionId = sessionId;
    messages = target.history ? [...target.history] : [];
    messages.forEach(m => { if (!m.id) m.id = generateMsgId(); });
    topicStartIndex = 0;
    localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(messages));
    persistSessions();

    // UI更新: チャットを再描画
    el.chat.innerHTML = "";
    if (messages.length === 0) {
      showWelcomeScreen();
    } else {
      messages.forEach(m => appendMessage(m.role, m.content, { save: false, imageData: m.imageData || null, imageDataList: m.imageDataList || null, msgId: m.id }));
    }
    renderSessionList();

    // 非同期: IndexedDB から画像を復元
    rehydrateImagesFromIdb(messages).then(hydrated => {
      messages = hydrated;
      hydrated.forEach(m => {
        const msgEl = document.querySelector(`[data-msg-id="${m.id}"]`);
        if (!msgEl) return;
        // imageDataList がある場合はサムネイル群を更新
        const thumbsDiv = msgEl.querySelector(".image-thumbnails");
        if (thumbsDiv && Array.isArray(m.imageDataList)) {
          const imgs = thumbsDiv.querySelectorAll("img.image-in-message");
          m.imageDataList.forEach((d, i) => {
            if (imgs[i] && d && !d.startsWith("idb:")) imgs[i].src = d;
          });
        } else if (m.imageData && !m.imageData.startsWith("idb:")) {
          msgEl.dataset.imageData = m.imageData;
          const img = msgEl.querySelector("img.image-in-message");
          if (img) img.src = m.imageData;
        }
      });
    }).catch(e => console.warn("[IDB] 画像復元失敗:", e));
  }

  /**
   * セッションを削除する
   * @param {string} sessionId
   */
  function deleteSession(sessionId) {
    if (!confirm("このセッションを削除しますか？")) return;

    // 削除対象セッションの画像を IndexedDB からも削除
    const toDelete = sessions.find(s => s.id === sessionId);
    if (toDelete && toDelete.history) {
      for (const m of toDelete.history) {
        if (m.imageData && m.imageData.startsWith("idb:")) {
          deleteImageFromIdb(m.imageData.slice(4)).catch(() => {});
        }
        if (Array.isArray(m.imageDataList)) {
          for (const img of m.imageDataList) {
            if (img && img.startsWith("idb:")) deleteImageFromIdb(img.slice(4)).catch(() => {});
          }
        }
      }
    }

    sessions = sessions.filter(s => s.id !== sessionId);

    if (sessionId === currentSessionId) {
      // 削除したのが現在のセッションなら別のセッションに切り替え
      if (sessions.length > 0) {
        const latest = sessions[sessions.length - 1];
        currentSessionId = latest.id;
        messages = latest.history ? [...latest.history] : [];
        localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(messages));

        // UI更新
        el.chat.innerHTML = "";
        messages.forEach(m => appendMessage(m.role, m.content, { save: false, imageData: m.imageData || null, imageDataList: m.imageDataList || null, msgId: m.id }));
      } else {
        // セッションが全て削除された場合は新規作成
        createNewSession(true);
        el.chat.innerHTML = "";
        showWelcomeScreen();
      }
    }

    persistSessions();
    renderSessionList();
    notify("🗑 セッションを削除しました");
  }

  /**
   * セッション名を変更する
   * @param {string} sessionId
   * @param {string} newTitle
   */
  function renameSession(sessionId, newTitle) {
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;
    session.title = newTitle;
    persistSessions();
    renderSessionList();
  }

  /**
   * セッション一覧UIを描画する
   */
  function renderSessionList() {
    if (!el.sessionList) return;

    // カウント更新
    if (el.sessionCount) {
      el.sessionCount.textContent = String(sessions.length);
    }

    // 更新日時の降順でソート（最新が上）
    const sorted = [...sessions].sort((a, b) => {
      return new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime();
    });

    el.sessionList.innerHTML = sorted.map(s => {
      const isActive = s.id === currentSessionId;
      const dateStr = formatSessionDate(s.updatedAt || s.createdAt);
      const title = escapeHtml(s.title || getSessionSummary(s.history));
      const msgCount = (s.history || []).length;
      const activeClass = isActive ? " session-active" : "";

      return `<div class="session-card${activeClass}" data-session-id="${s.id}">
        <div class="session-card-title" title="${title}">${title}</div>
        <div class="session-card-meta">${dateStr} / ${msgCount}件</div>
        <div class="session-card-actions">
          <button class="session-open-btn" data-action="open" data-session-id="${s.id}" title="開く">📂</button>
          <button class="session-rename-btn" data-action="rename" data-session-id="${s.id}" title="名前変更">✏️</button>
          <button class="session-delete-btn" data-action="delete" data-session-id="${s.id}" title="削除">🗑</button>
        </div>
      </div>`;
    }).join("");
  }

  // ---------------------------------------------------------------------------
  // v1.8.0: Keyboard Shortcuts Modal
  // ---------------------------------------------------------------------------

  /**
   * キーボードショートカットモーダルの表示/非表示をトグルする
   */
  function toggleShortcutsModal() {
    if (!el.shortcutsModal) return;
    const isVisible = el.shortcutsModal.style.display === "flex";
    el.shortcutsModal.style.display = isVisible ? "none" : "flex";
  }

  // ---------------------------------------------------------------------------
  // Chat UI
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // v1.8.0: Welcome Screen
  // ---------------------------------------------------------------------------

  function showWelcomeScreen() {
    // 設定で非表示の場合はスキップ
    if (settings && settings.showWelcome === false) return;
    // 既に表示中なら何もしない
    if (el.chat.querySelector(".welcome-screen")) return;

    const welcome = document.createElement("div");
    welcome.className = "welcome-screen";
    welcome.innerHTML = `
      <div class="welcome-logo">💬</div>
      <h2 class="welcome-title">Local LLM Chat</h2>
      <p class="welcome-version">JRC2026 Edition</p>
      <p class="welcome-description">ローカルLLMとプライベートに対話できるチャットアプリ</p>
      <div class="welcome-tips">
        <div class="welcome-tip">
          <span class="welcome-tip-icon">🤖</span>
          <span class="welcome-tip-text"><strong>モデル選択</strong>上部のドロップダウンからモデルを選択</span>
        </div>
        <div class="welcome-tip">
          <span class="welcome-tip-icon">📎</span>
          <span class="welcome-tip-text"><strong>ファイル添付</strong>画像・PDF・テキストを添付可能</span>
        </div>
        <div class="welcome-tip">
          <span class="welcome-tip-icon">⚖️</span>
          <span class="welcome-tip-text"><strong>比較モード</strong>⚖️ボタンで2つのモデルの回答を並べて比較</span>
        </div>
        <div class="welcome-tip">
          <span class="welcome-tip-icon">⚙️</span>
          <span class="welcome-tip-text"><strong>設定カスタマイズ</strong>右上の⚙️で応答スタイルやプロンプトを調整</span>
        </div>
      </div>
    `;
    el.chat.appendChild(welcome);
  }

  function hideWelcomeScreen() {
    const welcome = el.chat.querySelector(".welcome-screen");
    if (welcome) welcome.remove();
  }

  /**
   * チャットにメッセージを描画し、必要なら履歴へ保存する
   * @param {Role} role
   * @param {string} content
   * @param {{save?:boolean, imageData?:string|null}=} opts
   */
  function appendMessage(role, content, opts = {}) {
    if (role !== "system") { hideWelcomeScreen(); hideHelpPanel(); }
    const { save = true, imageData = null, imageDataList = null, msgId = null } = opts;

    const id = msgId || generateMsgId();

    const container = document.createElement("div");
    container.classList.add("message", role);

    // メッセージID・本文を埋め込み
    container.dataset.msgId = id;
    container.dataset.content = content;
    if (imageData) container.dataset.imageData = imageData;

    // user画像添付はメッセージ内にも表示（複数画像対応）
    if (role === "user") {
      const imagesToRender = imageDataList || (imageData ? [imageData] : []);
      if (imagesToRender.length > 0) {
        const thumbsDiv = document.createElement("div");
        thumbsDiv.classList.add("image-thumbnails");
        for (const imgSrc of imagesToRender) {
          const img = document.createElement("img");
          img.classList.add("image-in-message");
          if (imgSrc.startsWith("idb:")) {
            img.alt = "読込中…";
            const idbKey = imgSrc.slice(4);
            getImageFromIdb(idbKey).then(data => {
              if (data) img.src = data;
              else img.alt = "画像が見つかりません";
            }).catch(() => { img.alt = "画像読込エラー"; });
          } else {
            img.src = imgSrc;
          }
          img.addEventListener("click", () => {
            if (img.src) showImageLightbox(img.src);
          });
          thumbsDiv.appendChild(img);
        }
        container.appendChild(thumbsDiv);
      }
    }

    // 本文（assistantは markdown + thinking対応）
    const body = document.createElement("div");
    body.classList.add("message-content");
    if (role === "assistant") {
      const { thinking, main, isPartial } = extractThinkingBlocks(content);
      const thinkingHtml = renderThinkingHtml(thinking, isPartial);
      body.innerHTML = thinkingHtml + safeMarkdown(main);
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
      messages.push({ id, role, content, imageData: imageData || undefined, imageDataList: imageDataList || undefined });
      persistHistory();
    }

    return id;
  }

  /** ライトボックス: 画像クリックで拡大表示 */
  function showImageLightbox(src) {
    const overlay = document.createElement("div");
    overlay.classList.add("image-lightbox-overlay");
    overlay.addEventListener("click", () => overlay.remove());
    const img = document.createElement("img");
    img.src = src;
    img.classList.add("image-lightbox-img");
    overlay.appendChild(img);
    document.body.appendChild(overlay);
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
      const msgId = msgDiv.dataset.msgId;
      const idx = msgId
        ? messages.findIndex(m => m.id === msgId)
        : messages.findIndex(m => m.role === role && m.content === (msgDiv.dataset.content || ""));
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

      // 医学用語チェックボタン（v1.7.2）
      const termCheckBtn = document.createElement("button");
      termCheckBtn.classList.add("msg-btn");
      termCheckBtn.textContent = "🏥 Check";
      termCheckBtn.title = "医学用語をチェック";
      termCheckBtn.onclick = () => {
        const content = msgDiv.dataset.content || "";
        if (!content.trim()) {
          notify("⚠️ チェックする内容がありません");
          return;
        }
        performPostResponseTermCheck(content);
      };
      actions.appendChild(termCheckBtn);
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
    const msgId = msgDiv.dataset.msgId;

    // 確認ダイアログ
    if (!confirm("このメッセージを編集しますか？\n\n※ このメッセージ以降の会話は削除されます。")) {
      return;
    }

    // メッセージのインデックスをIDで探す（フォールバック: role+content）
    let idx = msgId
      ? messages.findIndex(m => m.id === msgId)
      : -1;
    if (idx === -1) {
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === "user" && messages[i].content === msgContent) {
          idx = i;
          break;
        }
      }
    }
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
   * 再生成: 最後のassistantメッセージを消して、対応するuserメッセージを再送。
   * ストリーミングエラー時も対応（UI上のメッセージを参照）。
   * @param {HTMLDivElement} msgDiv
   */
  function regenerateLastAssistant(msgDiv) {
    const assistantMsgId = msgDiv.dataset.msgId;

    // アシスタントメッセージを履歴から削除（IDで検索、フォールバック: role+content）
    const idx = assistantMsgId
      ? messages.findIndex(m => m.id === assistantMsgId)
      : messages.findIndex(m => m.role === "assistant" && m.content === (msgDiv.dataset.content || ""));
    if (idx !== -1) {
      messages.splice(idx, 1);
      persistHistory();
    }

    // UI上の直前のユーザーメッセージを探す（ストリーミングエラー時に必要）
    let lastUserDiv = null;
    let prevSibling = msgDiv.previousElementSibling;
    while (prevSibling) {
      if (prevSibling.classList.contains("message") && prevSibling.classList.contains("user")) {
        lastUserDiv = prevSibling;
        break;
      }
      prevSibling = prevSibling.previousElementSibling;
    }

    // アシスタントメッセージをUIから削除
    msgDiv.remove();

    // ユーザーメッセージのコンテンツとIDを取得
    let userContent = "";
    let userMsgId = "";
    if (lastUserDiv) {
      userContent = lastUserDiv.dataset.content || "";
      userMsgId = lastUserDiv.dataset.msgId || "";
    }

    // UI上のユーザーメッセージがない場合、履歴から探す
    if (!userContent) {
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === "user") {
          userContent = messages[i].content;
          userMsgId = messages[i].id || "";
          break;
        }
      }
    }

    if (!userContent) {
      notify("⚠️ 再生成するユーザーメッセージがありません");
      return;
    }

    // 履歴からユーザーメッセージを削除（IDで検索、フォールバック: role+content）
    const userIdx = userMsgId
      ? messages.findIndex(m => m.id === userMsgId)
      : messages.findIndex(m => m.role === "user" && m.content === userContent);
    if (userIdx !== -1) {
      messages.splice(userIdx, 1);
      persistHistory();
    }

    // UI上のユーザーメッセージを削除
    if (lastUserDiv) {
      lastUserDiv.remove();
    } else {
      // 履歴から見つけた場合は最後のユーザーメッセージを削除
      const userDivs = el.chat.querySelectorAll(".message.user");
      if (userDivs.length > 0) {
        userDivs[userDivs.length - 1].remove();
      }
    }

    // プロンプト入力欄にテキストをセットして送信
    el.prompt.value = userContent;
    el.sendBtn.click();
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

    // 応答言語の指定
    const lang = el.responseLanguage?.value || "";
    if (lang) {
      const langMap = {
        ja: "日本語",
        en: "English",
        zh: "中文",
        ko: "한국어",
      };
      instruction += `\n\n【応答言語】必ず${langMap[lang] || lang}で回答してください。`;
    }

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
    const name = el.userName.value.trim();
    const level = el.userLevel.value;
    const profession = el.userProfession.value.trim();
    const interests = el.userInterests.value.trim();
    if (!name && !level && !profession && !interests) return "";

    let out = "\n\n【ユーザー情報】";

    if (name) out += `\n- ユーザーを「${name}」と呼んでください。`;

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
   * 話題リセット後にLLMへ送るユーザー自己紹介メッセージを構築
   * プロフィール設定がなければ空文字を返す
   */
  function buildUserProfileContext() {
    const name = el.userName.value.trim();
    const level = el.userLevel.value;
    const profession = el.userProfession.value.trim();
    const interests = el.userInterests.value.trim();
    if (!name && !level && !profession && !interests) return "";

    const parts = [];
    if (name) parts.push(`${name}です`);
    if (profession) parts.push(`職業は${profession}です`);
    const levelLabel = { beginner: "初心者", intermediate: "中級者", advanced: "上級者", expert: "専門家" };
    if (level && levelLabel[level]) parts.push(`専門レベルは${levelLabel[level]}です`);
    if (interests) parts.push(`${interests}に関心があります`);

    return parts.join("。") + "。よろしくお願いします。";
  }

  /**
   * API送信用の messages を作る（system先頭、交互、末尾assistantは除外）
   * 画像添付は Vision API形式（content配列）に変換。
   *
   * NOTE: system が slice で落ちないように、必ず system + 最後のN-1件に整形する。
   * @returns {Array<{role:string, content:any}>}
   */
  function buildConversation() {
    let sysPrompt;

    // ヘルプモードの場合は専用のシステムプロンプトを使用
    if (helpMode) {
      const manual = _manualContentCache || HELP_MANUAL_FALLBACK;
      sysPrompt = `あなたは「Local LLM Chat」アプリのヘルプアシスタントです。
以下のアプリマニュアルを参照して、ユーザーの質問に日本語で丁寧に回答してください。
マニュアルに記載されていない内容については「マニュアルに記載がありません」と伝えてください。

---
${manual}
---

上記のマニュアル内容を基に、ユーザーの質問に回答してください。`;
    } else {
      const baseSysPrompt = el.systemPrompt.value || settings.systemPrompt;
      sysPrompt = baseSysPrompt + getResponseStyleInstruction() + getUserProfileInstruction();
    }

    /** @type {Array<{role:string, content:any}>} */
    const conv = [{ role: "system", content: sysPrompt }];

    // 話題リセット後はユーザー基本情報を会話冒頭に再注入
    if (topicStartIndex > 0) {
      const profile = buildUserProfileContext();
      if (profile) {
        conv.push({ role: "user", content: profile });
        conv.push({ role: "assistant", content: "承知しました。引き続きよろしくお願いします。" });
      }
    }

    // topicStartIndex 以降のメッセージのみをAPIに送信
    const relevantMessages = messages.slice(topicStartIndex);

    let last = conv.at(-1)?.role || "system";
    for (const m of relevantMessages) {
      if (!["user", "assistant"].includes(m.role)) continue;
      if (m.role === last) continue;

      // Vision API形式に変換（user画像のみ、idb:参照はスキップ）
      const imgList = m.imageDataList || (m.imageData ? [m.imageData] : []);
      const validImgs = imgList.filter(d => d && !d.startsWith("idb:"));
      if (m.role === "user" && validImgs.length > 0) {
        const contentArray = [];
        if (m.content) contentArray.push({ type: "text", text: m.content });
        for (const imgUrl of validImgs) {
          contentArray.push({ type: "image_url", image_url: { url: imgUrl } });
        }
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

    // systemは常に残し、まず絶対上限でスライス
    const tail = conv.slice(1).slice(-LIMITS.MAX_HISTORY_UPPER_BOUND);

    // 動的コンテキストトリミング: モデルのmax_context_lengthに基づき調整
    const contextLength = getModelContextLength();
    const maxTokens = parseInt(el.maxTokens.value, 10) || 2048;

    if (contextLength) {
      const budget = contextLength - maxTokens - 200; // 200 = safety margin
      const sysTokens = estimateTokens(conv[0].content);
      let sumTail = 0;
      for (const m of tail) sumTail += estimateTokens(m.content);

      let trimmed = false;
      while (tail.length > 0 && (sysTokens + sumTail) > budget) {
        sumTail -= estimateTokens(tail[0].content);
        tail.shift();
        trimmed = true;
      }
      if (trimmed) {
        notify("⚠️ コンテキスト長に合わせて古い会話を省略しました");
      }
    } else {
      // フォールバック: max_context_length不明 → 従来の6ターン制限
      while (tail.length > (LIMITS.MAX_HISTORY_FOR_API - 1)) {
        tail.shift();
      }
    }

    // tailが assistant で始まる場合、対応するuserが欠落しているので除去
    if (tail.length > 0 && tail[0].role === "assistant") tail.shift();

    return [conv[0], ...tail];
  }

  // ---------------------------------------------------------------------------
  // LM Studio v1 API (Model Management) - v1.7.0
  // ---------------------------------------------------------------------------

  /**
   * Base URLから /v1 を除去してAPIベースURLを取得
   * @returns {string}
   */
  function getApiBaseUrl() {
    const base = trimTrailingSlashes(settings.baseUrl || el.baseUrl.value.trim());
    return base.replace(/\/v1$/, "");
  }

  /**
   * LM Studio v1 API が利用可能かチェック
   * @returns {Promise<boolean>}
   */
  async function checkLmstudioV1Api() {
    const apiBase = getApiBaseUrl();
    const key = settings.apiKey || el.apiKey?.value?.trim() || DEFAULT_SETTINGS.apiKey;

    try {
      const res = await fetch(`${apiBase}${LMSTUDIO_V1_API.MODELS}`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * LM Studio v1 API で全ダウンロード済みモデルを取得
   * @returns {Promise<Array<{id:string, state:string, quantization?:string, max_context_length?:number}>>}
   */
  async function fetchAllModelsV1() {
    const apiBase = getApiBaseUrl();
    const authKey = settings.apiKey || el.apiKey?.value?.trim() || DEFAULT_SETTINGS.apiKey;

    const res = await fetch(`${apiBase}${LMSTUDIO_V1_API.MODELS}`, {
      headers: { Authorization: `Bearer ${authKey}` },
    });

    if (!res.ok) throw new Error(`API error: ${res.status}`);

    const data = await res.json();

    // LM Studio v1 API のレスポンス構造に対応
    // - models 配列にモデル情報が格納
    // - key がモデルID
    // - loaded_instances が空配列なら未ロード
    const rawModels = data.models || data.data || [];

    return rawModels.map(m => ({
      id: m.key || m.id,
      state: (m.loaded_instances && m.loaded_instances.length > 0) ? MODEL_STATE.LOADED : MODEL_STATE.NOT_LOADED,
      quantization: m.quantization?.name || m.quantization || null,
      max_context_length: m.max_context_length || null,
      type: m.type || "llm",
      capabilities: m.capabilities || {},
    }));
  }

  /**
   * LM Studio v1 API でモデルをロード
   * @param {string} modelId
   * @returns {Promise<boolean>}
   */
  async function loadModelV1(modelId) {
    const apiBase = getApiBaseUrl();
    const key = settings.apiKey || el.apiKey?.value?.trim() || DEFAULT_SETTINGS.apiKey;

    try {
      const res = await fetch(`${apiBase}${LMSTUDIO_V1_API.LOAD}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({ model: modelId }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Load failed: ${res.status} ${text}`);
      }
      return true;
    } catch (err) {
      console.error("[Model Load Error]", err);
      throw err;
    }
  }

  /**
   * LM Studio v1 API でモデルをアンロードする (v1.7.3)
   * @param {string} modelId
   * @returns {Promise<boolean>}
   */
  async function unloadModelV1(modelId) {
    const apiBase = getApiBaseUrl();
    const key = settings.apiKey || el.apiKey?.value?.trim() || DEFAULT_SETTINGS.apiKey;

    try {
      const res = await fetch(`${apiBase}${LMSTUDIO_V1_API.UNLOAD}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({ instance_id: modelId }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.warn(`[Model Unload] Failed: ${res.status} ${text}`);
        return false;
      }
      return true;
    } catch (err) {
      console.warn("[Model Unload Error]", err);
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Models: /v1/models (with LM Studio v1 API support)
  // ---------------------------------------------------------------------------

  /**
   * モデル一覧を取得して <select> を更新する
   * - LM Studio v1 API が利用可能な場合: 全ダウンロード済みモデルを取得（loaded/not-loaded 状態付き）
   * - 利用不可の場合: 従来の /v1/models を使用（ロード済みモデルのみ）
   * - "embedding系" を除外
   * - 以前の選択 / fallback を考慮して選択を決定
   */
  async function refreshModels() {
    runtime.availableModels.clear();
    runtime.modelDetails.clear();

    const base = trimTrailingSlashes(settings.baseUrl || el.baseUrl.value.trim());
    const key = settings.apiKey || el.apiKey?.value?.trim() || DEFAULT_SETTINGS.apiKey;

    // UI: Loading...
    el.modelSelect.innerHTML = "<option>Loading...</option>";

    try {
      // v1.7.0: LM Studio v1 API が利用可能かチェック
      runtime.lmstudioV1Available = await checkLmstudioV1Api();

      let list = [];

      if (runtime.lmstudioV1Available) {
        // v1 API で全ダウンロード済みモデルを取得
        const allModels = await fetchAllModelsV1();

        for (const model of allModels) {
          const lower = String(model.id).toLowerCase();
          // 埋め込みモデルを除外
          if (EMBEDDING_KEYWORDS.some(k => lower.includes(k))) continue;

          list.push(model.id);
          runtime.modelDetails.set(model.id, {
            state: model.state || MODEL_STATE.NOT_LOADED,
            quantization: model.quantization || null,
            max_context_length: model.max_context_length || null,
            capabilities: model.capabilities || null,
          });
          runtime.availableModels.add(model.id);
        }
      } else {
        // フォールバック: 従来の /v1/models を使用
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

        // レガシーモードでは全てロード済みとして扱う
        for (const id of list) {
          runtime.modelDetails.set(id, { state: MODEL_STATE.LOADED, quantization: null, max_context_length: null });
          runtime.availableModels.add(id);
        }
      }

      // v1.8.0: モデル表示フィルターを適用
      const visibleList = getVisibleModels(list);

      // アルファベット順にソート（表示名で、大文字小文字を区別しない）
      visibleList.sort((a, b) => {
        const nameA = a.replace(/^.*\//, "").toLowerCase();
        const nameB = b.replace(/^.*\//, "").toLowerCase();
        return nameA.localeCompare(nameB);
      });

      // build options
      el.modelSelect.innerHTML = "";
      visibleList.forEach(id => {
        const opt = document.createElement("option");
        opt.value = id;
        const displayName = id.replace(/^.*\//, "");
        const details = runtime.modelDetails.get(id);

        // ラベル構築: モデル名 + Vision + 量子化情報（シンプル表示）
        let label = displayName;
        if (isVisionModel(id)) label += ` 👁️`;
        if (details?.quantization) {
          label += ` (${details.quantization})`;
        }

        opt.textContent = label;
        el.modelSelect.appendChild(opt);
      });

      // selection strategy: saved → some known fallbacks → first
      const preferred = settings.model;
      const fallbacks = [
        preferred,
        "google/gemma-3-12b",
        "llama-3.1-swallow-8b-instruct-v0.5",
        "qwen/qwen3-4b-2507",
        visibleList[0],
      ].filter(Boolean);

      let chosen = null;
      for (const cand of fallbacks) {
        if (visibleList.includes(cand)) { chosen = cand; break; }
      }
      if (chosen) el.modelSelect.value = chosen;

      saveSettingsFromUI();

      // v1.7.0: 比較モデルドロップダウンも更新
      updateCompareModelDropdown();

      // v1.8.0: モデル表示フィルターUIを更新
      renderModelVisibilityManager();

    } catch (e) {
      el.modelSelect.innerHTML = "";
      if (isLikelyServerOffline(e)) {
        notify("⚠️ サーバーに接続できません。LM Studio/Ollamaが起動しているか、接続先サーバーの設定を確認してください。");
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
  async function consumeSSE(reader, onDelta, onDone, { timeoutMs = 60000 } = {}) {
    const decoder = new TextDecoder("utf-8");
    let buf = "";

    while (true) {
      // タイムアウト: timeoutMs 間データが来なければ TimeoutError
      let result;
      try {
        result = await Promise.race([
          reader.read(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new DOMException("SSE inactivity timeout", "TimeoutError")), timeoutMs)
          ),
        ]);
      } catch (e) {
        reader.cancel().catch(() => {});
        throw e;
      }
      const { value, done } = result;
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
          const reasoningDelta =
            j.choices?.[0]?.delta?.reasoning ??
            j.choices?.[0]?.delta?.reasoning_content ??
            "";

          // usage情報を取得（最終チャンクに含まれる）
          if (j.usage) {
            runtime.lastUsage = j.usage;
          }

          if (delta || reasoningDelta) onDelta(delta, reasoningDelta);
        } catch {
          // 不完全JSONは次チャンクで完成（元実装踏襲）
        }
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
          const reasoningDelta = j.choices?.[0]?.delta?.reasoning ?? j.choices?.[0]?.delta?.reasoning_content ?? "";
          if (delta || reasoningDelta) onDelta(delta, reasoningDelta);
        } catch { /* incomplete JSON */ }
      }
    }

    // [DONE] が受信されなかった場合でも onDone を呼び出す
    // （Ollama等、[DONE]を送信しないサーバーへの対応）
    onDone();
  }

  /**
   * HTMLエスケープ
   * @param {string} str
   * @returns {string}
   */
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * marked.parse() + DOMPurify でサニタイズされたHTMLを返す
   * @param {string} md - Markdownテキスト
   * @returns {string} サニタイズ済みHTML
   */
  function safeMarkdown(md) {
    const raw = marked.parse(md);
    if (typeof DOMPurify !== "undefined") {
      return DOMPurify.sanitize(raw, {
        ADD_TAGS: ["details", "summary"],
        ADD_ATTR: ["open"],
      });
    }
    return raw;
  }

  // ---------------------------------------------------------------------------
  // Compare Mode Send (v1.7.0)
  // ---------------------------------------------------------------------------

  /**
   * 比較モード用の送信処理
   * - 2つのモデルに同時にリクエストを送信
   * - サイドバイサイドでストリーミング表示
   * @param {string} text - ユーザー入力テキスト
   * @param {AttachmentItem[]} currentAttachments - 添付ファイル
   * @param {string} modelA - メインモデル
   * @param {string} modelB - 比較モデル
   * @param {string} base - API Base URL
   * @param {string} key - API Key
   */
  async function handleCompareSend(text, currentAttachments, modelA, modelB, base, key) {
    // 添付ファイルの処理（グローバルのattachmentsはhandleSendの分岐前にセットされている）
    const { textForApi, displayText, imageAttachments } = injectAttachmentsIntoText(text);
    text = textForApi;

    const allImageData = imageAttachments.map(img => img.data);
    const firstImageData = allImageData.length > 0 ? allImageData[0] : null;

    // メッセージIDを事前生成
    const userMsgId = generateMsgId();
    const assistantMsgId = generateMsgId();

    // ユーザーメッセージを表示
    appendMessage("user", displayText || "(添付ファイルのみ)", { save: false, imageData: firstImageData, imageDataList: allImageData.length > 0 ? allImageData : null, msgId: userMsgId });
    const userMsgDiv = /** @type {HTMLDivElement} */ (el.chat.lastChild);
    if (userMsgDiv) userMsgDiv.dataset.content = text;

    strongClearPrompt();
    clearAllAttachments();

    // Thinkingモード無効化（Qwen3はデフォルト無効、その他はトグルに従う）
    if (shouldDisableThinking()) {
      text += " /no_think";
    }

    // API送信用のuserMessage を作成
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

    const userMessageForHistory = { id: userMsgId, role: "user", content: text, imageData: firstImageData || undefined, imageDataList: allImageData.length > 0 ? allImageData : undefined };

    // サイドバイサイド表示用のコンテナを作成
    const compareContainer = document.createElement("div");
    compareContainer.className = "compare-container";

    // モデルA用の応答エリア
    const responseA = document.createElement("div");
    responseA.className = "compare-response";
    const headerA = document.createElement("div");
    headerA.className = "compare-model-header model-a";
    headerA.innerHTML = `🤖 <span>${escapeHtml(modelA.replace(/^.*\//, ""))}</span>`;
    const messageA = document.createElement("div");
    messageA.className = "compare-message model-a";
    messageA.innerHTML = '<div class="message-content">...</div>';
    responseA.appendChild(headerA);
    responseA.appendChild(messageA);

    // モデルB用の応答エリア
    const responseB = document.createElement("div");
    responseB.className = "compare-response";
    const headerB = document.createElement("div");
    headerB.className = "compare-model-header model-b";
    headerB.innerHTML = `🤖 <span>${escapeHtml(modelB.replace(/^.*\//, ""))}</span>`;
    const messageB = document.createElement("div");
    messageB.className = "compare-message model-b";
    messageB.innerHTML = '<div class="message-content">...</div>';
    responseB.appendChild(headerB);
    responseB.appendChild(messageB);

    compareContainer.appendChild(responseA);
    compareContainer.appendChild(responseB);
    el.chat.appendChild(compareContainer);

    // 両方のモデルに並列でリクエスト
    runtime.controller = new AbortController();
    el.stopBtn.disabled = false;
    el.sendBtn.disabled = true;
    isStreaming = true;
    userScrolledDuringStream = false;

    const apiMessages = [...buildConversation(), userMessage];

    // 並列ストリーミング
    let contentA = "";
    let contentB = "";

    const streamModel = async (model, msgEl, updateContent) => {
      const modelStartTime = performance.now();
      let modelUsage = null;
      const requestBody = {
        model,
        messages: apiMessages,
        stream: true,
        stream_options: { include_usage: true },
        temperature: parseFloat(el.temperature.value) || 0.7,
        max_tokens: parseInt(el.maxTokens.value, 10) || 2048,
      };

      // Thinkingモード無効化（Qwen3はデフォルト無効、その他はトグルに従う）
      if (shouldDisableThinking()) {
        requestBody.chat_template_kwargs = { enable_thinking: false };
      }

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

        await consumeSSE(
          reader,
          (delta, _reasoningDelta) => {
            if (delta) content += delta;
            updateContent(content);
            const contentEl = msgEl.querySelector(".message-content");
            if (contentEl) {
              const { thinking, main, isPartial } = extractThinkingBlocks(content);
              contentEl.innerHTML = renderThinkingHtml(thinking, isPartial) + safeMarkdown(main);
            }
            smartScrollToBottom();
          },
          () => {
            const contentEl = msgEl.querySelector(".message-content");
            if (contentEl) {
              const { thinking, main } = extractThinkingBlocks(content || "(空応答)");
              contentEl.innerHTML = renderThinkingHtml(thinking, false) + safeMarkdown(main || "(空応答)");
            }
            // 比較モード: 各モデルの応答統計を表示
            modelUsage = runtime.lastUsage;
            appendResponseStats(msgEl, performance.now() - modelStartTime, modelUsage);
          }
        );

        return content;
      } catch (e) {
        const contentEl = msgEl.querySelector(".message-content");
        if (e && e.name === "AbortError") {
          const currentContent = updateContent(null);
          if (contentEl) contentEl.innerHTML = safeMarkdown(currentContent + "\n\n⏹ **生成を停止しました。**");
        } else if (e && e.name === "TimeoutError") {
          const currentContent = updateContent(null);
          if (contentEl) contentEl.innerHTML = safeMarkdown((currentContent || "") + "\n\n⏳ **タイムアウト（60秒）**");
        } else {
          if (contentEl) contentEl.textContent = `エラー: ${e?.message || e}`;
        }
        return "";
      }
    };

    try {
      // 両モデルに並列でリクエスト
      const [resultA, resultB] = await Promise.all([
        streamModel(modelA, messageA, (c) => { if (c !== null) contentA = c; return contentA; }),
        streamModel(modelB, messageB, (c) => { if (c !== null) contentB = c; return contentB; }),
      ]);

      // 履歴には最初のモデル（メインモデル）の応答のみ保存
      // 比較結果はエクスポート時には含まれない（比較は一時的な参照用）
      messages.push(userMessageForHistory);
      messages.push({ id: assistantMsgId, role: "assistant", content: resultA || "(比較モード)" });
      persistHistory();

    } catch (e) {
      // ★ 停止時もユーザーメッセージを履歴に保存（Edit対応）
      if (e && e.name === "AbortError") {
        messages.push(userMessageForHistory);
        messages.push({ id: assistantMsgId, role: "assistant", content: contentA || "(比較モード - 停止)" });
        persistHistory();
      }
    } finally {
      isStreaming = false;
      userScrolledDuringStream = false;
      el.stopBtn.disabled = true;
      el.sendBtn.disabled = false;
      runtime.controller = null;
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
    const key = settings.apiKey || el.apiKey?.value?.trim() || DEFAULT_SETTINGS.apiKey;
    // モデルは常にUI（select要素）の値を優先して使用
    const model = el.modelSelect.value || settings.model;

    if (!validateModelExists(model)) {
      notify(`⚠️ 選択モデルが /v1/models に見つかりません: ${model}`);
      return;
    }

    // v1.7.0: 比較モード時は専用の処理へ分岐
    if (compareMode) {
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
      await handleCompareSend(text, attachments.slice(), model, compareModel, base, key);
      return;
    }

    // user表示用/送信用にファイル内容を反映
    const { textForApi, displayText, imageAttachments } = injectAttachmentsIntoText(text);
    text = textForApi;

    // 画像をメッセージ履歴保存用に取得（全画像 + 後方互換用先頭1枚）
    const allImageData = imageAttachments.map(img => img.data);
    const firstImageData = allImageData.length > 0 ? allImageData[0] : null;

    // メッセージIDを事前生成
    const userMsgId = generateMsgId();
    const assistantMsgId = generateMsgId();

    // UI表示用（save: false で履歴には保存しない）
    appendMessage("user", displayText || "(添付ファイルのみ)", { save: false, imageData: firstImageData, imageDataList: allImageData.length > 0 ? allImageData : null, msgId: userMsgId });

    // ★ dataset.contentを履歴と同じ内容に修正（Edit機能で検索できるようにする）
    const userMsgDiv = /** @type {HTMLDivElement} */ (el.chat.lastChild);
    if (userMsgDiv) userMsgDiv.dataset.content = text;

    strongClearPrompt();

    // 添付をクリア
    clearAllAttachments();

    // Thinkingモード無効化 — ユーザーメッセージ末尾に /no_think を付与
    // Qwen3はデフォルト無効、その他はトグルに従う
    if (shouldDisableThinking()) {
      text += " /no_think";
    }

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
    const userMessageForHistory = { id: userMsgId, role: "user", content: text, imageData: firstImageData || undefined, imageDataList: allImageData.length > 0 ? allImageData : undefined };

    // assistant placeholder
    appendMessage("assistant", "...", { save: false, msgId: assistantMsgId });
    const currentMsgDiv = /** @type {HTMLDivElement} */ (el.chat.lastChild);

    runtime.controller = new AbortController();
    el.stopBtn.disabled = false;
    el.stopBtn.removeAttribute("disabled");  // ★ 確実にdisabledを解除
    el.sendBtn.disabled = true;
    isStreaming = true;                       // ★ ストリーミング開始
    userScrolledDuringStream = false;         // ★ スクロール状態リセット

    const sendStartTime = performance.now();
    runtime.lastUsage = null;

    try {
      const apiMessages = [...buildConversation(), userMessage];

      // ストリーミングAPI（/v1/chat/completions）
      {
        const requestBody = {
          model,
          messages: apiMessages,
          stream: true,
          stream_options: { include_usage: true },
          temperature: parseFloat(el.temperature.value) || 0.7,
          max_tokens: parseInt(el.maxTokens.value, 10) || 2048,
        };

        // Thinkingモード無効化（Qwen3はデフォルト無効、その他はトグルに従う）
        if (shouldDisableThinking()) {
          requestBody.chat_template_kwargs = { enable_thinking: false };
        }

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
          if (res.status === 401 || res.status === 403) {
            if (contentEl) contentEl.textContent = "認証に失敗しました。サーバー側の認証設定を確認してください。";
            notify("🔒 サーバーの認証設定を確認してください (HTTP " + res.status + ")");
          } else if (res.status >= 500) {
            if (contentEl) contentEl.textContent = "サーバーエラーが発生しました。LM Studioを再起動してください。";
            notify("⚠️ サーバーエラー (HTTP " + res.status + ")");
          } else {
            if (contentEl) contentEl.textContent = `エラー:${res.status}${t ? " / " + t : ""}`;
          }
          return;
        }

        const reader = res.body.getReader();
        let content = "";
        let reasoning = "";
        let messagesSaved = false;

        /** ストリーミング中の表示を更新する共通関数 */
        function updateStreamingUI(isFinal) {
          const contentEl = currentMsgDiv.querySelector(".message-content");
          if (!contentEl) return;

          // content が空で reasoning のみの場合、reasoning を本文として使用
          let displayContent = content;
          if (isFinal && !content && reasoning) {
            displayContent = reasoning;
          }

          // content 内の <think> タグを抽出（モデルが直接出力する場合）
          const { thinking, main, isPartial } = extractThinkingBlocks(isFinal ? (displayContent || "(空応答)") : displayContent);
          const thinkingHtml = renderThinkingHtml(thinking, isPartial);

          contentEl.innerHTML = thinkingHtml + safeMarkdown(main || (isFinal ? "(空応答)" : ""));
        }

        await consumeSSE(
          reader,
          (delta, reasoningDelta) => {
            if (reasoningDelta) reasoning += reasoningDelta;
            if (delta) content += delta;
            // エラー時に内容を保持するためにdatasetに保存
            currentMsgDiv.dataset.partialContent = content;
            updateStreamingUI(false);
            smartScrollToBottom();  // ★ スマートスクロール
          },
          () => {
            // onDone: UI表示の最終化
            updateStreamingUI(true);

            // Copy機能用のdataset更新
            currentMsgDiv.dataset.content = content;

            isStreaming = false;                     // ★ ストリーミング終了
            userScrolledDuringStream = false;        // ★ スクロール状態リセット
            el.stopBtn.disabled = true;
            el.stopBtn.setAttribute("disabled", ""); // ★ 確実にdisabledを設定
            runtime.controller = null;
          }
        );

        // ストリーミング完了後に履歴を保存（onDoneの外で確実に実行）
        if (!messagesSaved) {
          messagesSaved = true;
          messages.push(userMessageForHistory);
          messages.push({ id: assistantMsgId, role: "assistant", content });
          persistHistory();
        }

        // 応答統計を表示
        const elapsed = performance.now() - sendStartTime;
        appendResponseStats(currentMsgDiv, elapsed, runtime.lastUsage);
      }

    } catch (e) {
      const contentEl = currentMsgDiv.querySelector(".message-content");
      const currentContent = currentMsgDiv.dataset.partialContent || "";

      if (e && e.name === "AbortError") {
        const stoppedContent = currentContent + "\n\n⏹ **生成を停止しました。**";
        if (contentEl) contentEl.innerHTML = safeMarkdown(stoppedContent);
        // ★ 停止時もユーザーメッセージと途中の応答を履歴に保存（Edit/Regenerate対応）
        currentMsgDiv.dataset.content = stoppedContent;
        messages.push(userMessageForHistory);
        messages.push({ id: assistantMsgId, role: "assistant", content: stoppedContent });
        persistHistory();
      } else if (e && e.name === "TimeoutError") {
        // タイムアウト: 60秒間データなし
        const timeoutMsg = currentContent
          ? currentContent + "\n\n⏳ **応答がありません（60秒タイムアウト）**"
          : "⏳ 応答がありません（60秒タイムアウト）";
        if (contentEl) {
          contentEl.innerHTML = safeMarkdown(timeoutMsg);
          const retryBtn = document.createElement("button");
          retryBtn.textContent = "🔄 再試行";
          retryBtn.className = "msg-btn";
          retryBtn.style.cssText = "margin-top:8px;padding:6px 16px;background:#17a2b8;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:0.9em";
          retryBtn.onclick = () => {
            currentMsgDiv.remove();
            handleSend();
          };
          contentEl.appendChild(retryBtn);
        }
        if (currentContent) {
          currentMsgDiv.dataset.content = timeoutMsg;
          messages.push(userMessageForHistory);
          messages.push({ id: assistantMsgId, role: "assistant", content: timeoutMsg });
          persistHistory();
        }
      } else if (isLikelyServerOffline(e) && !currentContent) {
        // 生成が始まる前のエラーのみ「接続できませんでした」と表示
        if (contentEl) contentEl.textContent = "接続できませんでした。LM Studioが起動していない可能性があります。";
        notify("⚠️ サーバーに接続できません。LM Studio/Ollamaが起動しているか、接続先サーバーの設定を確認してください。");
      } else {
        // 生成途中でのエラーは内容を保持してエラーを追記
        const errorMsg = `\n\n⚠️ **エラーが発生しました**: ${e?.message || e}`;
        if (contentEl) contentEl.innerHTML = safeMarkdown(currentContent + errorMsg);
        console.error("Streaming error:", e);

        // 部分的なコンテンツがある場合は履歴に保存（再生成・編集対応）
        if (currentContent) {
          currentMsgDiv.dataset.content = currentContent + errorMsg;
          messages.push(userMessageForHistory);
          messages.push({ id: assistantMsgId, role: "assistant", content: currentContent + errorMsg });
          persistHistory();
        }
      }
    } finally {
      isStreaming = false;                     // ★ ストリーミング終了
      userScrolledDuringStream = false;        // ★ スクロール状態リセット
      el.stopBtn.disabled = true;
      el.stopBtn.setAttribute("disabled", ""); // ★ 確実にdisabledを設定
      el.sendBtn.disabled = false;
      runtime.controller = null;
    }
  }

  function handleStop() {
    if (runtime.controller) runtime.controller.abort();
  }

  // ---------------------------------------------------------------------------
  // Medical Terminology Check (v1.7.2)
  // ---------------------------------------------------------------------------

  /**
   * 医学用語チェックのプロンプト
   */
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
   * @param {string} text - チェック対象テキスト
   * @returns {Promise<{hasIssues: boolean, issues: Array<{original: string, suggested: string, reason: string}>, correctedText: string}|null>}
   */
  async function checkMedicalTerminology(text) {
    const base = trimTrailingSlashes(settings.baseUrl || el.baseUrl.value.trim());
    const key = settings.apiKey || el.apiKey?.value?.trim() || DEFAULT_SETTINGS.apiKey;
    const model = el.modelSelect.value || settings.model;

    if (!model || !text.trim()) return null;

    const prompt = MEDICAL_TERM_CHECK_PROMPT.replace("{TEXT}", text);

    try {
      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.3,  // 低めで安定した結果を得る
          max_tokens: 1024,
        }),
      });

      if (!res.ok) {
        console.error("Medical term check failed:", res.status);
        return null;
      }

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content || "";

      // JSONを抽出（```json ... ``` でラップされている場合も対応）
      let jsonStr = content;
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }

      // JSONの開始位置を探す
      const jsonStart = jsonStr.indexOf("{");
      const jsonEnd = jsonStr.lastIndexOf("}");
      if (jsonStart !== -1 && jsonEnd !== -1) {
        jsonStr = jsonStr.slice(jsonStart, jsonEnd + 1);
      }

      const result = JSON.parse(jsonStr);
      return result;
    } catch (e) {
      console.error("Medical term check error:", e);
      return null;
    }
  }

  /**
   * 医学用語チェックモーダルを表示（応答後の自己チェック用）
   * @param {{hasIssues: boolean, issues: Array<{original: string, suggested: string, reason: string}>}} checkResult - チェック結果
   */
  function showTermCheckModal(checkResult) {
    // コンテンツを構築
    let contentHtml = "";
    if (checkResult.issues && checkResult.issues.length > 0) {
      contentHtml = "<ul style='margin:0;padding-left:20px'>";
      for (const issue of checkResult.issues) {
        contentHtml += `<li style="margin-bottom:8px">
          <strong style="color:#dc3545">${escapeHtml(issue.original || "")}</strong> →
          <strong style="color:#28a745">${escapeHtml(issue.suggested || "")}</strong>
          ${issue.reason ? `<br><small style="color:#666">${escapeHtml(issue.reason)}</small>` : ""}
        </li>`;
      }
      contentHtml += "</ul>";
    } else {
      contentHtml = "<p style='color:#28a745;margin:0'>✅ AI応答の医学用語に問題は見つかりませんでした。</p>";
    }

    el.termCheckContent.innerHTML = contentHtml;

    // 修正テキスト欄は非表示（応答後チェックでは使用しない）
    el.termCheckCorrected.style.display = "none";
    el.termCheckApply.style.display = "none";

    // モーダル表示
    el.termCheckModal.style.display = "flex";

    // ボタンハンドラー（閉じるボタンのみ有効）
    const cleanup = () => {
      el.termCheckModal.style.display = "none";
      el.termCheckCancel.onclick = null;
      el.termCheckAsIs.onclick = null;
    };

    // 両方のボタンを「閉じる」として機能させる
    el.termCheckCancel.onclick = cleanup;
    el.termCheckAsIs.onclick = cleanup;
  }

  /**
   * AI応答の医学用語をチェック（Checkボタンから呼び出し）
   * @param {string} responseText - AI応答テキスト
   */
  async function performPostResponseTermCheck(responseText) {
    if (!responseText || responseText.length === 0) {
      return;
    }

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

  // ---------------------------------------------------------------------------
  // System Prompt Presets (v1.7.2)
  // ---------------------------------------------------------------------------

  const SYSTEM_PROMPT_BUILTINS = Object.freeze({
    "__general__": {
      label: "💬 汎用アシスタント",
      prompt: "あなたは優秀なAIアシスタントです。ユーザーの質問に対して、正確で分かりやすい回答を日本語で提供してください。必要に応じて具体例や補足を加え、専門用語には簡単な説明を添えてください。",
    },
    "__radiology__": {
      label: "🩻 放射線科アシスタント",
      prompt: `あなたは放射線画像診断、技術、研究のエキスパートアシスタントです。日本語で簡潔でバランスの取れたアドバイスを提供してください。フォーマルとカジュアルのバランスを保ち、専門用語は英語（日本語）の形式で表記してください。
応答の生成の前に、まず質問内容を確認し、医学用語についてユーザの入力に不備があれば、ユーザに確認してください。`,
    },
  });

  // 後方互換: __default__ は __general__ にマップ
  const DEFAULT_SYSTEM_PROMPT = SYSTEM_PROMPT_BUILTINS["__general__"].prompt;

  /**
   * System Promptプリセットを読み込む
   * @returns {Object<string, string>} プリセット名とプロンプトのマップ
   */
  function loadSystemPromptPresets() {
    const raw = localStorage.getItem(STORAGE_KEYS.SYSTEM_PROMPT_PRESETS) || "{}";
    return safeJSONParse(raw, {});
  }

  /**
   * System Promptプリセットを保存する
   * @param {Object<string, string>} presets
   */
  function saveSystemPromptPresets(presets) {
    localStorage.setItem(STORAGE_KEYS.SYSTEM_PROMPT_PRESETS, JSON.stringify(presets));
  }

  /**
   * System Promptプリセットドロップダウンを更新する
   */
  function updateSystemPromptPresetSelect() {
    if (!el.systemPromptPresetSelect) return;

    const presets = loadSystemPromptPresets();
    const currentValue = el.systemPromptPresetSelect.value;

    // クリアして再構築
    el.systemPromptPresetSelect.innerHTML = '<option value="">-- プリセットを選択 --</option>';

    // ビルトインプリセットを追加
    for (const [key, { label }] of Object.entries(SYSTEM_PROMPT_BUILTINS)) {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = label;
      el.systemPromptPresetSelect.appendChild(opt);
    }

    // ユーザー定義プリセットを追加
    for (const [name, _prompt] of Object.entries(presets)) {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      el.systemPromptPresetSelect.appendChild(option);
    }

    // 選択状態を復元
    if (currentValue) {
      el.systemPromptPresetSelect.value = currentValue;
    }
  }

  /**
   * System Promptプリセットを適用する
   * @param {string} presetKey
   */
  function applySystemPromptPreset(presetKey) {
    if (!presetKey) return;

    let prompt;
    let label;
    // ビルトインプリセット
    if (SYSTEM_PROMPT_BUILTINS[presetKey]) {
      prompt = SYSTEM_PROMPT_BUILTINS[presetKey].prompt;
      label = SYSTEM_PROMPT_BUILTINS[presetKey].label;
    } else {
      // ユーザー定義プリセット
      const presets = loadSystemPromptPresets();
      prompt = presets[presetKey];
      label = presetKey;
    }

    if (prompt) {
      el.systemPrompt.value = prompt;
      saveSettingsFromUI();
      notify(`✅ System Prompt「${label}」を適用しました`);
    }
  }

  /**
   * 現在のSystem Promptを新規プリセットとして保存する
   */
  function saveCurrentAsSystemPromptPreset() {
    const name = prompt("新しいプリセット名を入力してください:");
    if (!name || !name.trim()) return;

    const trimmedName = name.trim();
    if (trimmedName === "__default__") {
      notify("⚠️ この名前は使用できません");
      return;
    }

    const presets = loadSystemPromptPresets();
    presets[trimmedName] = el.systemPrompt.value;
    saveSystemPromptPresets(presets);
    updateSystemPromptPresetSelect();
    el.systemPromptPresetSelect.value = trimmedName;
    notify(`✅ プリセット「${trimmedName}」を保存しました`);
  }

  /**
   * 選択中のSystem Promptプリセットを削除する
   */
  function deleteSelectedSystemPromptPreset() {
    const selected = el.systemPromptPresetSelect.value;
    if (!selected || selected === "__default__") {
      notify("⚠️ 削除できるプリセットを選択してください");
      return;
    }

    if (!confirm(`プリセット「${selected}」を削除しますか？`)) return;

    const presets = loadSystemPromptPresets();
    delete presets[selected];
    saveSystemPromptPresets(presets);
    updateSystemPromptPresetSelect();
    el.systemPromptPresetSelect.value = "";
    notify(`🗑 プリセット「${selected}」を削除しました`);
  }

  // ---------------------------------------------------------------------------
  // Clear
  // ---------------------------------------------------------------------------

  function clearHistory() {
    if (!confirm("画面の会話をすべて削除します。\n削除後は元に戻せません。\n\nよろしいですか？")) return;
    messages = [];
    topicStartIndex = 0;
    localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(messages));
    // セッション側の履歴も同期
    syncCurrentSession();
    el.chat.innerHTML = "";
    showWelcomeScreen();
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

  /** 設定タブ切り替え */
  function initSettingsTabs() {
    const tabs = el.settingsPanel.querySelectorAll(".settings-tab");
    const contents = el.settingsPanel.querySelectorAll(".settings-tab-content");
    tabs.forEach(tab => {
      tab.addEventListener("click", () => {
        tabs.forEach(t => t.classList.remove("active"));
        contents.forEach(c => c.classList.remove("active"));
        tab.classList.add("active");
        const target = document.getElementById(tab.dataset.tab);
        if (target) target.classList.add("active");
      });
    });
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

    // ArrayBuffer → Uint8Array に変換（PDF.js互換性向上）
    const data = new Uint8Array(arrayBuffer);
    const loadingTask = pdfjsLib.getDocument({ data });
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
      const safeName = escapeHtml(att.name);
      const safeId = escapeHtml(att.id);

      // 画像の場合はサムネイルを表示
      if (att.type === "image") {
        return `
          <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #eee">
            <img src="${att.data}" alt="${safeName}" style="width:48px;height:48px;object-fit:cover;border-radius:4px;border:1px solid #ddd;flex-shrink:0" />
            <div style="flex:1;min-width:0">
              <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500" title="${safeName}">${safeName}</div>
              <div style="color:#666;font-size:0.8em">${sizeStr}</div>
            </div>
            <button onclick="window._removeAttachment('${safeId}')" style="background:#dc3545;color:#fff;border:none;border-radius:4px;padding:4px 10px;cursor:pointer;font-size:0.85em;flex-shrink:0">×</button>
          </div>
        `;
      }

      // ファイルの場合はアイコン表示
      return `
        <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #eee">
          <span style="font-size:1.5em;flex-shrink:0">📄</span>
          <div style="flex:1;min-width:0">
            <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500" title="${safeName}">${safeName}</div>
            <div style="color:#666;font-size:0.8em">${sizeStr}</div>
          </div>
          <button onclick="window._removeAttachment('${safeId}')" style="background:#dc3545;color:#fff;border:none;border-radius:4px;padding:4px 10px;cursor:pointer;font-size:0.85em;flex-shrink:0">×</button>
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
      const sizeLimitText = isPDF ? "10MB" : "2MB";

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
          let pdfText = result.text || "";

          if (!pdfText) {
            data = `[PDF: ${file.name} - テキスト抽出失敗（画像PDFの可能性があります）]`;
          } else if (pdfText.length > LIMITS.PDF_TEXT_MAX_CHARS) {
            // テキストが上限を超える場合は先頭のみ読み込み
            const originalLen = pdfText.length;
            pdfText = pdfText.slice(0, LIMITS.PDF_TEXT_MAX_CHARS);
            // 文の途中で切れないように最後の改行位置で切る
            const lastBreak = pdfText.lastIndexOf("\n");
            if (lastBreak > LIMITS.PDF_TEXT_MAX_CHARS * 0.8) {
              pdfText = pdfText.slice(0, lastBreak);
            }
            data = pdfText + `\n\n[... 以降省略: 全${originalLen.toLocaleString()}文字中 先頭${pdfText.length.toLocaleString()}文字のみ読み込み]`;
            notify(`⚠️ ${file.name}: テキストが大きいため先頭${(pdfText.length / 1000).toFixed(0)}K文字のみ読み込みました（全${result.pages}ページ / ${originalLen.toLocaleString()}文字）。コンテキスト不足で空応答になる場合があります。`);
          } else {
            data = pdfText;
            notify(`📄 ${file.name}: ${result.pages}ページ / ${pdfText.length.toLocaleString()}文字を読み込みました`);
          }
        } else {
          let textData = /** @type {string} */ (await readTextFile(file));
          if (textData.length > LIMITS.TEXT_MAX_CHARS) {
            const originalLen = textData.length;
            textData = textData.slice(0, LIMITS.TEXT_MAX_CHARS);
            // 行の途中で切れないように最後の改行位置で切る
            const lastBreak = textData.lastIndexOf("\n");
            if (lastBreak > LIMITS.TEXT_MAX_CHARS * 0.8) {
              textData = textData.slice(0, lastBreak);
            }
            textData += `\n\n[... 以降省略: 全${originalLen.toLocaleString()}文字中 先頭${textData.length.toLocaleString()}文字のみ読み込み]`;
            notify(`⚠️ ${file.name}: テキストが大きいため先頭${(textData.length / 1000).toFixed(0)}K文字のみ読み込みました（全${originalLen.toLocaleString()}文字）。コンテキスト不足で空応答になる場合があります。`);
          }
          data = textData;
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
        const detail = isPDF ? `（PDF処理エラー: ${err.message || err}）` : "";
        notify(`⚠️ ${file.name} の読み込みに失敗しました${detail}`);
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
    writing: `あなたは文章作成のプロフェッショナルです。ユーザーの意図に沿った自然で読みやすい日本語の文章を作成・校正・推敲します。ビジネス文書、レポート、メール、ブログなど幅広い文体に対応してください。`,
    translate: `あなたは翻訳の専門家です。日本語と英語の間で、文脈やニュアンスを正確に保ちながら翻訳してください。専門用語には原語を括弧書きで併記してください。`,
    pdf: `以下の文章を箇条書きで要約してください。

【文章】`,
    brainstorm: `あなたは創造的なブレインストーミングパートナーです。ユーザーのアイデアを広げ、多角的な視点から提案を行ってください。批判よりも発展・拡張を優先し、実現可能性も考慮してください。`,
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
    ddx: `与えられた臨床情報・画像所見から鑑別を3つ挙げて、自信度(0-100)と根拠（1行）を示してください。
追加で、普段は思いも付かない｢大穴｣診断を1つ追加。

【臨床・画像情報】`,
    review: `以下の研究内容を査読してください。

1. 要旨（3行以内）
2. Strengths / Weaknesses: 各3つ（改善提案付き）
3. 評価（各5段階）: 新規性 / 臨床的意義 / 方法論 / 統計 / 再現性
4. 主要修正点: 3つ以内
5. 判定: Accept / Minor Revision / Major Revision / Reject

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
    coding: `あなたはプログラミングに精通したAIアシスタントです。コードの説明・レビュー・デバッグ・改善提案を行います。回答にはコード例を含め、言語やフレームワークのベストプラクティスに従ってください。`,
  });

  const DEFAULT_PRESET_LABELS = Object.freeze({
    writing: "✏️ 文章作成・校正",
    translate: "🌐 翻訳",
    pdf: "📄 文章要約",
    brainstorm: "💡 ブレインストーミング",
    disease: "🏥 疾患解説",
    ddx: "💊 鑑別診断",
    review: "📝 論文査読",
    stats: "📈 統計解析",
    email: "✉️ 英文メール作成",
    coding: "💻 プログラミング",
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
      // v1.8.0: Ctrl+/ / Cmd+/ でショートカット一覧
      if ((e.ctrlKey || e.metaKey) && e.key === "/") {
        e.preventDefault();
        toggleShortcutsModal();
      }
      // Esc で各パネル/モーダルを閉じる
      if (e.key === "Escape") {
        if (el.shortcutsModal && el.shortcutsModal.style.display === "flex") {
          el.shortcutsModal.style.display = "none";
          return;
        }
        if (el.settingsPanel.classList.contains("open")) {
          closeSettingsPanel();
        }
        if (el.presetPanel.classList.contains("open")) {
          closePresetPanel();
        }
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

      const allFiles = Array.from(files);

      // 画像ファイルとその他のファイルに分類
      const imageFiles = allFiles.filter(f => f.type.startsWith("image/"));
      const otherFiles = allFiles.filter(f => !f.type.startsWith("image/"));

      // 画像ファイルを処理
      if (imageFiles.length > 0) {
        await handleImagesSelected(imageFiles);
      }

      // PDF・テキストファイルを処理
      if (otherFiles.length > 0) {
        await handleFilesSelected(otherFiles);
      }

      // ファイルが何も処理されなかった場合
      if (imageFiles.length === 0 && otherFiles.length === 0) {
        notify("⚠️ サポートされているファイルをドロップしてください");
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Event wiring
  // ---------------------------------------------------------------------------

  function wireSettingsEvents() {
    const save = saveSettingsFromUI;

    el.baseUrlPreset.onchange = () => {
      if (el.baseUrlPreset.value === "custom") {
        el.baseUrl.style.display = "";
        el.baseUrl.value = "";
        el.baseUrl.focus();
      } else {
        el.baseUrl.style.display = "none";
        el.baseUrl.value = el.baseUrlPreset.value;
      }
      save();
    };
    el.baseUrl.onchange = save;
    if (el.apiKey) el.apiKey.onchange = save;

    el.temperature.oninput = () => {
      el.tempValue.textContent = el.temperature.value;
      save();
    };

    el.maxTokens.onchange = save;
    el.systemPrompt.onchange = save;
    el.responseStyle.onchange = save;
    if (el.responseLanguage) el.responseLanguage.onchange = save;
    el.sendKey.onchange = save;  // ★ 送信キー設定の保存
    el.userName.onchange = save;
    el.userLevel.onchange = save;
    el.userProfession.onchange = save;
    el.userInterests.onchange = save;

    el.darkModeToggle.onchange = () => toggleDarkMode(el.darkModeToggle.checked);

    // v1.7.3: モデル自動アンロード設定
    if (el.autoUnloadToggle) {
      el.autoUnloadToggle.onchange = save;
    }

    // v1.8.0: reasoning_effort
    if (el.reasoningEffort) {
      el.reasoningEffort.onchange = save;
    }

    // v1.8.0: オープニング画面表示設定
    if (el.showWelcomeToggle) {
      el.showWelcomeToggle.onchange = save;
    }

    // プロンプト集ボタン表示設定
    if (el.showSamplePromptsToggle) {
      el.showSamplePromptsToggle.onchange = () => {
        save();
        if (el.samplePromptsBtn) {
          el.samplePromptsBtn.style.display = el.showSamplePromptsToggle.checked ? "" : "none";
        }
      };
    }

    // 思考プロセス非表示設定
    if (el.hideThinkingToggle) {
      el.hideThinkingToggle.onchange = save;
    }
    if (el.enableQwen3ThinkingToggle) {
      el.enableQwen3ThinkingToggle.onchange = save;
    }

    // v1.7.2: System Promptプリセット
    if (el.systemPromptPresetSelect) {
      el.systemPromptPresetSelect.onchange = () => {
        const selected = el.systemPromptPresetSelect.value;
        if (selected) {
          applySystemPromptPreset(selected);
        }
      };
    }
    if (el.saveSystemPromptPresetBtn) {
      el.saveSystemPromptPresetBtn.onclick = saveCurrentAsSystemPromptPreset;
    }
    if (el.deleteSystemPromptPresetBtn) {
      el.deleteSystemPromptPresetBtn.onclick = deleteSelectedSystemPromptPreset;
    }

    el.modelSelect.addEventListener("change", async (e) => {
      const id = /** @type {HTMLSelectElement} */ (e.target).value;
      const details = runtime.modelDetails.get(id);
      const previousModel = settings.model;

      // v1.7.0: 未ロードモデルを選択した場合は自動ロード
      if (runtime.lmstudioV1Available && details?.state === MODEL_STATE.NOT_LOADED) {
        const displayName = id.replace(/^.*\//, "");
        notify(`⏳ モデル ${displayName} を読み込み中...`);
        el.modelSelect.disabled = true;

        try {
          // v1.7.3: 自動アンロードが有効かつ前モデルが存在する場合、先にアンロード
          if (settings.autoUnload && previousModel && previousModel !== id) {
            const prevDetails = runtime.modelDetails.get(previousModel);
            if (prevDetails?.state === MODEL_STATE.LOADED) {
              const prevName = previousModel.replace(/^.*\//, "");
              notify(`⏳ ${prevName} をアンロード中...`);
              const unloaded = await unloadModelV1(previousModel);
              if (unloaded) {
                prevDetails.state = MODEL_STATE.NOT_LOADED;
                runtime.modelDetails.set(previousModel, prevDetails);
              }
            }
          }

          await loadModelV1(id);
          // 状態を更新
          details.state = MODEL_STATE.LOADED;
          runtime.modelDetails.set(id, details);

          // ドロップダウンを更新（ロード完了を反映）
          await refreshModels();
          el.modelSelect.value = id;
          settings.model = id;
          saveSettingsFromUI();

          notify(`✅ モデル ${displayName} を読み込みました`);
        } catch (err) {
          notify(`⚠️ モデルの読み込みに失敗しました: ${err.message}`);
          // 失敗時は前のモデルに戻す
          if (previousModel && runtime.availableModels.has(previousModel)) {
            el.modelSelect.value = previousModel;
          }
        } finally {
          el.modelSelect.disabled = false;
        }
        return;
      }

      // 通常のモデル切り替え（両方ロード済みモデル間の切り替え）
      // v1.7.3: 自動アンロードが有効かつ前モデルが存在する場合
      if (settings.autoUnload && runtime.lmstudioV1Available && previousModel && previousModel !== id) {
        const prevDetails = runtime.modelDetails.get(previousModel);
        if (prevDetails?.state === MODEL_STATE.LOADED) {
          const prevName = previousModel.replace(/^.*\//, "");
          notify(`⏳ ${prevName} をアンロード中...`);
          const unloaded = await unloadModelV1(previousModel);
          if (unloaded) {
            prevDetails.state = MODEL_STATE.NOT_LOADED;
            runtime.modelDetails.set(previousModel, prevDetails);
          }
        }
      }

      settings.model = id;
      save();
      notify(`🔄 モデルを ${id.replace(/^.*\//, "")} に切り替えました`);
    });

    el.settingsBtn.onclick = toggleSettingsPanel;
    el.closeSettingsBtn.onclick = closeSettingsPanel;

    // v1.6: data management
    el.resetSettingsBtn.onclick = resetSettingsToDefault;
    el.clearAllDataBtn.onclick = clearAllData;
  }

  /** モデルリスト自動更新のスロットリング用 */
  let lastModelRefresh = 0;
  const MODEL_REFRESH_INTERVAL = 3000; // 3秒間隔

  function wireMainButtons() {
    el.sendBtn.onclick = handleSend;
    el.stopBtn.onclick = handleStop;
    el.clearBtn.onclick = clearHistory;

    // v1.7.0: モデルドロップダウンクリック時に自動リフレッシュ（スロットリング付き）
    el.modelSelect.addEventListener("mousedown", () => {
      const now = Date.now();
      if (now - lastModelRefresh > MODEL_REFRESH_INTERVAL) {
        lastModelRefresh = now;
        refreshModels();
      }
    });
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

  // ---------------------------------------------------------------------------
  // Compare Mode (v1.7.0)
  // ---------------------------------------------------------------------------

  /**
   * 比較モードのトグル
   */
  function toggleCompareMode() {
    compareMode = !compareMode;

    // ヘルプモードと排他
    if (compareMode && helpMode) {
      helpMode = false;
      updateHelpButton();
    }

    updateCompareButton();
    updateCompareRow();

    if (compareMode) {
      notify("⚖️ 比較モード ON - 2つのモデルの回答を並べて表示します（LM Studio Developers設定の「JIT models auto-evict」をOFFにしてください）");
    } else {
      notify("⚖️ 比較モード OFF");
    }
  }

  /**
   * 比較ボタンの見た目を更新
   */
  function updateCompareButton() {
    if (compareMode) {
      el.compareBtn.style.background = "#6f42c1";
      el.compareBtn.style.color = "#fff";
      el.compareBtn.textContent = "⚖️ 比較 ON";
    } else {
      el.compareBtn.style.background = "#fff";
      el.compareBtn.style.color = "#6f42c1";
      el.compareBtn.textContent = "⚖️ 比較";
    }
  }

  /**
   * 比較モデル選択の表示/非表示を切り替え
   */
  function updateCompareRow() {
    if (el.compareRow) {
      el.compareRow.style.display = compareMode ? "inline" : "none";
    }
  }

  /**
   * 比較モデルドロップダウンを更新（メインドロップダウンと同じ内容）
   */
  function updateCompareModelDropdown() {
    if (!el.compareModelSelect) return;

    const currentCompareValue = el.compareModelSelect.value;
    el.compareModelSelect.innerHTML = "";

    // メインドロップダウンからオプションをコピー
    for (const opt of el.modelSelect.options) {
      const newOpt = document.createElement("option");
      newOpt.value = opt.value;
      newOpt.textContent = opt.textContent;
      el.compareModelSelect.appendChild(newOpt);
    }

    // 前の選択を復元（なければ2番目のモデルを選択）
    if (currentCompareValue && [...el.compareModelSelect.options].some(o => o.value === currentCompareValue)) {
      el.compareModelSelect.value = currentCompareValue;
    } else if (el.compareModelSelect.options.length > 1) {
      // メインと異なるモデルを選択
      const mainModel = el.modelSelect.value;
      for (const opt of el.compareModelSelect.options) {
        if (opt.value !== mainModel) {
          el.compareModelSelect.value = opt.value;
          break;
        }
      }
    }
  }

  function wireCompareEvents() {
    if (el.compareBtn) {
      el.compareBtn.onclick = toggleCompareMode;
    }
  }

  /**
   * ヘルプモードのトグル
   */
  function toggleHelpMode() {
    helpMode = !helpMode;

    // 比較モードと排他
    if (helpMode && compareMode) {
      compareMode = false;
      updateCompareButton();
      updateCompareRow();
    }

    updateHelpButton();

    if (helpMode) {
      // マニュアルを事前ロード（キャッシュに格納）→ 完了後にヘルプパネル表示
      getManualContent().then(() => showHelpPanel()).catch(() => showHelpPanel());
    } else {
      hideHelpPanel();
      if (messages.length === 0) showWelcomeScreen();
      notify("❓ ヘルプモード OFF");
    }
  }

  /**
   * ヘルプボタンの見た目を更新
   */
  function updateHelpButton() {
    if (helpMode) {
      el.helpBtn.style.background = "#fd7e14";
      el.helpBtn.style.color = "#fff";
      el.helpBtn.textContent = "❓ ON";
    } else {
      el.helpBtn.style.background = "#fff";
      el.helpBtn.style.color = "#fd7e14";
      el.helpBtn.textContent = "❓";
    }
  }

  function wireHelpEvents() {
    el.helpBtn.onclick = toggleHelpMode;
  }

  /**
   * スクロールイベントを監視してストリーミング中のユーザースクロールを検出
   */
  function wireScrollEvents() {
    el.chat.addEventListener("scroll", () => {
      if (isStreaming && !isNearBottom()) {
        // 上にスクロール → 自動スクロール停止
        userScrolledDuringStream = true;
      }
      if (isStreaming && isNearBottom()) {
        // 下部に戻る → 自動スクロール再開
        userScrolledDuringStream = false;
      }
    });
  }

  // ---------------------------------------------------------------------------
  // v1.8.0: Event wiring for new features
  // ---------------------------------------------------------------------------

  function wireShortcutsEvents() {
    if (el.shortcutsBtn) {
      el.shortcutsBtn.onclick = toggleShortcutsModal;
    }
    if (el.shortcutsCloseBtn) {
      el.shortcutsCloseBtn.onclick = () => {
        if (el.shortcutsModal) el.shortcutsModal.style.display = "none";
      };
    }
  }

  function wireModelVisibilityEvents() {
    // イベント委任: チェックボックスの変更を親要素で検知
    if (el.modelVisibilityList) {
      el.modelVisibilityList.addEventListener("change", (e) => {
        if (e.target.type === "checkbox") {
          applyModelVisibility();
        }
      });
    }

    // 全選択/全解除ボタン
    if (el.modelVisibilitySelectAllBtn) {
      el.modelVisibilitySelectAllBtn.onclick = () => {
        if (!el.modelVisibilityList) return;
        const checkboxes = el.modelVisibilityList.querySelectorAll("input[type='checkbox']");
        checkboxes.forEach(cb => { cb.checked = true; });
        applyModelVisibility();
      };
    }

    if (el.modelVisibilityClearBtn) {
      el.modelVisibilityClearBtn.onclick = () => {
        if (!el.modelVisibilityList) return;
        const checkboxes = el.modelVisibilityList.querySelectorAll("input[type='checkbox']");
        checkboxes.forEach(cb => { cb.checked = false; });
        applyModelVisibility();
      };
    }
  }

  function wireSessionEvents() {
    // 新規セッション作成ボタン
    if (el.createSessionBtn) {
      el.createSessionBtn.onclick = () => createNewSession();
    }

    // セッションリスト: イベント委任
    if (el.sessionList) {
      el.sessionList.addEventListener("click", (e) => {
        const btn = /** @type {HTMLElement} */ (e.target).closest("[data-action]");
        if (!btn) return;

        const action = btn.dataset.action;
        const sessionId = btn.dataset.sessionId;
        if (!sessionId) return;

        switch (action) {
          case "open":
            switchSession(sessionId);
            break;
          case "rename": {
            const session = sessions.find(s => s.id === sessionId);
            if (!session) break;
            const newTitle = prompt("新しいセッション名:", session.title || "");
            if (newTitle !== null && newTitle.trim()) {
              renameSession(sessionId, newTitle.trim());
            }
            break;
          }
          case "delete":
            deleteSession(sessionId);
            break;
        }
      });
    }
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
    messages.forEach(m => appendMessage(m.role, m.content, { save: false, imageData: m.imageData || null, imageDataList: m.imageDataList || null, msgId: m.id }));
  }

  async function init() {
    // IndexedDB 初期化（画像オフロード用）
    openImageDb().catch(e => console.warn("[IDB] 初期化失敗:", e));

    // 旧バージョンからのデータ移行
    migrateStorageKeys();

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
    updateSystemPromptPresetSelect();  // v1.7.2: System Promptプリセット初期化

    // v1.8.0: セッション管理を初期化（renderHistoryFromStorageの前に）
    loadSessions();

    renderHistoryFromStorage();

    // v1.8.0: メッセージが空ならウェルカム画面を表示
    if (messages.length === 0) {
      showWelcomeScreen();
    }

    // v1.8.0: セッションリストを描画
    renderSessionList();

    initSettingsTabs();
    wireSettingsEvents();
    wireMainButtons();
    wireScrollEvents();          // ★ スクロールイベント監視
    wireTextareaResize();
    wireAttachmentEvents();
    wireDeepDiveEvents();
    wireHelpEvents();            // ★ ヘルプモードイベント
    wireCompareEvents();         // ★ 比較モードイベント (v1.7.0)
    wireShortcutsEvents();       // ★ ショートカットモーダル (v1.8.0)
    wireModelVisibilityEvents(); // ★ モデル表示フィルター (v1.8.0)
    wireSessionEvents();         // ★ セッション管理 (v1.8.0)
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
