/**
 * Local LLM Chat v1.7.1
 * =====================
 * OpenAI互換API向けの簡易チャットUIです。
 *
 * 主なAPI:
 *   - GET  {baseUrl}/models
 *   - POST {baseUrl}/chat/completions  (SSE stream: "data: {...}\n\n")
 *   - POST {baseUrl}/responses  (Open Responses API - LM Studio v0.3.39+)
 *   - GET  /api/v1/models  (LM Studio v1 API - v0.4.0+)
 *   - POST /api/v1/models/load  (LM Studio v1 API - モデルロード)
 *
 * 永続化（localStorage）:
 *   - localLLMChat_history      : 会話履歴（配列）
 *   - localLLMChat_settings     : 設定（Base URL / Key / temperature 等）
 *   - localLLMChat_presets      : プリセットのカスタム文面
 *   - localLLMChat_presetLabels : プリセットのラベル
 *   - localLLMChat_draft        : 入力中の下書き
 *
 * v1.7.1 新機能 (2026-02-02):
 *   - 📊 モデル比較機能: 2つのモデルの回答を並べて比較表示
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
 *   - Open Responses API対応（LM Studio v0.3.39+）
 *   - 信頼度表示: AIの回答の確信度をログ確率から計算して表示
 *   - 代替候補表示: AIが検討した他のトークン候補を表示
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
    HISTORY: "localLLMChat_history",
    SETTINGS: "localLLMChat_settings",
    PRESETS: "localLLMChat_presets",
    DRAFT: "localLLMChat_draft",
    PRESET_LABELS: "localLLMChat_presetLabels",
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
  }

  const LIMITS = Object.freeze({
    IMAGE_MAX_BYTES: 20 * 1024 * 1024,  // 20MB
    FILE_MAX_BYTES:  2 * 1024 * 1024,   // 2MB
    PDF_MAX_BYTES:  10 * 1024 * 1024,   // 10MB
    MAX_HISTORY_FOR_API: 6,             // system + last N-1 turns（実送信は userMessage を別途追加）※ コンテキスト長10,000のモデル用に縮小
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

  // LM Studio v1 API エンドポイント（モデル管理用）
  const LMSTUDIO_V1_API = Object.freeze({
    MODELS: "/api/v1/models",        // GET: 全ダウンロード済みモデル（state付き）
    LOAD: "/api/v1/models/load",     // POST: モデルロード
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
    systemPrompt: "あなたは放射線画像診断、技術、研究のエキスパートアシスタントです。日本語で簡潔でバランスの取れたアドバイスを提供してください。フォーマルとカジュアルのバランスを保ち、専門用語は英語（日本語）の形式で表記してください。",
    responseStyle: "standard",
    sendKey: "enter",
    userLevel: "",
    userProfession: "",
    userInterests: "",
    darkMode: false,
    showLogprobs: false,  // v1.6.7: 信頼度・代替候補表示
    medicalTermCheck: false,  // v1.7.1: 医学用語チェック
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
    newTopicBtn: document.getElementById("newTopicBtn"),
    clearBtn: document.getElementById("clearBtn"),
    exportBtn: document.getElementById("exportBtn"),
    importBtn: document.getElementById("importBtn"),
    importInput: document.getElementById("importInput"),

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
    showLogprobsToggle: document.getElementById("showLogprobsToggle"),  // v1.6.7
    medicalTermCheckToggle: document.getElementById("medicalTermCheckToggle"),  // v1.7.1

    // v1.7.1: 医学用語チェックモーダル
    termCheckModal: document.getElementById("termCheckModal"),
    termCheckContent: document.getElementById("termCheckContent"),
    termCheckCorrected: document.getElementById("termCheckCorrected"),
    termCheckCorrectedText: document.getElementById("termCheckCorrectedText"),
    termCheckCancel: document.getElementById("termCheckCancel"),
    termCheckAsIs: document.getElementById("termCheckAsIs"),
    termCheckApply: document.getElementById("termCheckApply"),

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
    lmstudioV1Available: false // v1.7.0: LM Studio v1 API 利用可能フラグ
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

  /** 比較モードが有効かどうか (v1.7.0) */
  let compareMode = false;

  /** ストリーミング中にユーザーが手動スクロールしたか */
  let userScrolledDuringStream = false;

  /** ストリーミング中かどうか */
  let isStreaming = false;

  /** ヘルプモードが有効かどうか */
  let helpMode = false;

  // ---------------------------------------------------------------------------
  // Help Mode: アプリマニュアル内容（LLMに参照させる）
  // ---------------------------------------------------------------------------

  const APP_MANUAL_CONTENT = `
# Local LLM Chat v1.7.1 使い方ガイド

## 概要
Local LLM Chatは、ローカルで動作するLLMサーバー（LM Studio、Ollamaなど）と連携するWebベースのチャットアプリです。完全オフラインで動作し、プライバシーを重視した設計です。

## v1.7.1 新機能
- 📊 **モデル比較機能**: 2つのモデルの回答を並べて比較表示（目玉機能）
- **モデルリスト自動更新**: ドロップダウンクリック時に自動更新
- **ヘッダーUI改善**: ボタンを機能グループごとに整理
- **ストレージキー変更**: バージョン依存のないキー名に変更（自動移行あり）

## LM Studio バージョン情報
**公式サイトからダウンロードすると v0.4.1 がインストールされます。**

v0.4.1では「**モデルをロード＝使える**」状態になります。サーバー設定は触る必要がありません。

| 機能 | 0.3.x | 0.4.x |
|------|-------|-------|
| サーバー起動 | 手動 | **モデルロード時に自動** |
| 複数モデル同時ロード | 非対応 | **対応** |
| CORS設定場所 | 開発者タブ | **設定 → Local Server** |

## 起動方法（3ステップ）
1. **LM Studioを起動し、モデルをロード**（自動でAPIが有効になる）
2. **local_llm_chat_v1.7.1.html をブラウザで開く**
3. **モデルが自動的にドロップダウンに表示** → 会話開始！

**疎通確認**: うまくいかない場合はターミナルで実行:
\`curl http://localhost:1234/v1/models\`
- 返答あり → OK
- 返答なし → モデルがロードされていない

## 新しいモデルの追加方法
新しいモデルを追加するには、LM Studioでダウンロードします。

### ダウンロード手順
1. 左側メニューから「探索」を開く（⌘⇧M）
   - 「Mission Control」ウィンドウが開きます
2. モデルを検索
   - 上部の検索バー（「Hugging Faceでモデルを検索...」）にモデル名を入力
   - 例: qwen, llama, gemma, glm など
3. フォーマットを選択（検索バー右側のチェックボックス）
   - GGUF: CPU/GPU汎用フォーマット（推奨）
   - MLX: Apple Silicon最適化フォーマット
   - Windowsは GGUF を選択してください
4. ダウンロードしたいモデルをリストから選択
   - 右側で詳細情報と量子化レベル（4BIT等）を確認
5. 右下の「ダウンロード」ボタンをクリック

**モデルの切り替え**: ダウンロード済みのモデルは、Local LLM Chatのモデル選択ドロップダウンから選択すれば自動で読み込まれます。

## 画面構成
### ヘッダー
- モデル選択: ロードされているモデルを選択（👁️マークはVision対応）- クリック時に自動更新
- 📊 比較: モデル比較モードのON/OFF（v1.7新機能）
- 比較モデル選択: 比較モードON時のみ表示、2つ目のモデルを選択
- 🆕 新しい話題: 新しい話題を開始（AIへの履歴送信をリセット、画面は保持）
- 🗑️: 会話履歴をクリア
- 💾: 会話履歴をJSONでエクスポート
- 📥: 会話履歴をJSONからインポート
- ❓: ヘルプモードのON/OFF
- ⚙️: 設定パネルを開く

### 入力エリア
- 📷 Image: 画像ファイルを添付（複数可、20MB以下）
- 📎 File: テキスト/PDFファイルを添付（テキスト2MB、PDF10MB以下）
- 🔍 深掘り: より深く分析した回答を促すモード
- 🚀 Send: メッセージを送信
- ⏹ Stop: 生成を中断
- 📋 Preset: プリセットプロンプトを挿入

## 主な機能

### モデル比較機能（v1.7新機能）
📊 比較ボタンをONにすると、2つのモデルの回答を並べて比較できます。
- 同じ質問を2つのモデルに同時に送信
- 並列ストリーミングで両方の回答をリアルタイム表示
- モバイル対応（768px以下で縦並び表示）
- 要件: LM Studio v0.4.0以降で複数モデルを同時ロード

### チャット機能
- ストリーミング応答でリアルタイム表示
- Markdown対応（コードブロック、表など）
- メッセージ操作: Copy、Delete、Edit（ユーザーのみ）、Regenerate（AIのみ）

### 画像・ファイル添付
- Vision対応モデル（👁️マーク）で画像認識
- 対応方法: ボタン、Ctrl+V（ペースト）、ドラッグ＆ドロップ
- PDF: テキスト抽出してLLMに送信

### 深掘りモード
🔍ボタンで有効化すると、より深く分析した回答を促します

### 新しい話題
🆕 新しい話題ボタンをクリックすると、AIへの会話履歴送信がリセットされます。
- 画面上の会話は保持され、区切り線が表示されます
- 話題を変えた際に前の回答が繰り返されることを防ぎます

### ヘルプモード
❓ボタンで有効化すると、このアプリの使い方をLLMに質問できます

### スマートスクロール
ストリーミング中に上スクロールすると自動スクロールが停止、下部に戻ると再開

### 信頼度・代替候補表示
設定で「📊 信頼度・代替候補を表示」をONにすると、AIの回答に信頼度と代替候補が表示されます。
- LM Studio v0.3.39以降が必要

## 設定項目
- Base URL: LLMサーバーのURL（デフォルト: http://localhost:1234/v1）
- Temperature: 0=安定、2=創造的（デフォルト: 0.7）
- Max Tokens: 最大出力トークン数（デフォルト: 2048）
- 送信キー: Enter または Ctrl+Enter で送信
- 応答スタイル: 簡潔/標準/詳細/専門的
- ユーザープロフィール: 専門レベル、職業、興味を設定可能

## キーボードショートカット
- Enter / Ctrl+Enter: メッセージ送信（設定による）
- Shift+Enter: 改行
- Ctrl+V: 画像ペースト
- Ctrl+K: 履歴クリア
- Esc: パネルを閉じる

## トラブルシューティング

### まず確認：curlで疎通テスト
問題が発生したら、まずターミナルで実行: \`curl http://localhost:1234/v1/models\`
- **返答あり** → LM Studioは正常。ブラウザ側（CORS等）の問題
- **返答なし** → LM Studioでモデルがロードされていない

### モデルが表示されない
1. **モデルがロードされているか確認**（最重要）
2. 上記curlコマンドで疎通確認
3. CORSが有効か確認（設定 → Local Server → 「CORSを有効にする」がON）
4. モデル選択ドロップダウンをクリックして更新

### 比較機能が動作しない
1. **2つのモデルがLM Studioでロードされているか確認**
2. 比較モード（📊ボタン）がONになっているか確認

### 画像が認識されない
1. Vision対応モデル（👁️マーク）を選択
2. 画像サイズが20MB以下か確認
3. 30B以上のモデル推奨

### 応答が途中で止まる・遅い
1. Max Tokensの値を確認（小さすぎると途中で切れる）
2. より小さいモデルを試す
3. 長い会話は🆕新しい話題ボタンでリセット

## よくある質問（FAQ）

### Q: このアプリは無料ですか？
A: はい、完全無料です。オープンソースで提供されています。

### Q: インターネット接続は必要ですか？
A: いいえ、完全オフラインで動作します。LM Studioもローカルで動作するため、インターネット不要です。

### Q: データはどこに保存されますか？
A: 会話履歴と設定はブラウザのlocalStorageに保存されます。外部サーバーには一切送信されません。

### Q: 会話履歴を削除するには？
A: 🗑️ボタンで現在の会話をクリア。完全削除は設定パネルの「すべての保存データを消す」を使用。

### Q: モデル比較機能の使い方は？
A: 📊比較ボタンをONにして、2つ目のモデルを選択してからメッセージを送信します。LM Studioで2つのモデルをロードしておく必要があります。

### Q: 複数のモデルを同時に使えますか？
A: LM Studioで複数モデルをロードし、ドロップダウンで切り替え可能です。v1.7では📊比較機能で2つのモデルを同時に使えます。

### Q: システムプロンプトとは何ですか？
A: LLMに対する初期指示です。AIの振る舞いや応答スタイルを設定できます。

### Q: プリセットをカスタマイズできますか？
A: はい、設定パネルの「プリセット編集」で追加・編集・削除できます。

### Q: 深掘りモードとヘルプモードの違いは？
A: 深掘りモードは回答をより詳細に分析、ヘルプモードはこのアプリの使い方を質問するためのモードです。

### Q: 対応しているファイル形式は？
A: 画像（JPG, PNG, GIF, WebP）、テキスト（txt, md, json, csv, py, jsなど）、PDF

### Q: スマホでも使えますか？
A: ブラウザがあれば動作しますが、LM Studioが必要なためPC推奨です。

### Q: 会話を他の人と共有できますか？
A: 💾でJSONエクスポート、📥でインポートできます。

### Q: 「新しい話題」と「Clear」の違いは？
A: 「新しい話題」は画面を保持したままAIの文脈のみリセット。「Clear」は画面も含めてすべて削除します。

## 免責事項・損害補償について

**重要: このアプリを使用して生じた損害について、作成者は一切の補償を行いません。**

本ソフトウェア（Local LLM Chat）は「現状有姿」で無償提供されており、以下の条件で使用されます：

1. **自己責任での使用**: 本ソフトウェアの使用は、すべてユーザー自身の責任において行われます。
2. **無保証**: 作成者は、本ソフトウェアの正確性、信頼性、完全性、有用性について、いかなる保証も行いません。
3. **損害の免責**: 作成者は、本ソフトウェアの使用または使用不能から生じるいかなる損害（直接的、間接的、偶発的、特別、結果的損害を含む）についても、一切の責任を負いません。
4. **AI出力の検証**: AIによる出力結果は参考情報です。重要な判断を行う前には必ず専門家への相談や独自の検証を行ってください。
5. **医療・法律・財務への非適用**: 本ソフトウェアは医療診断、法的助言、財務アドバイスを提供するものではありません。これらの分野での判断には、必ず資格を持つ専門家にご相談ください。

本ソフトウェアを使用した時点で、上記の免責事項に同意したものとみなされます。
`.trim();

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
      showLogprobs: Boolean(s.showLogprobs),  // v1.6.7
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

    // v1.6.7: 信頼度・代替候補表示設定
    if (el.showLogprobsToggle) {
      el.showLogprobsToggle.checked = Boolean(settings.showLogprobs);
    }

    // v1.7.1: 医学用語チェック設定
    if (el.medicalTermCheckToggle) {
      el.medicalTermCheckToggle.checked = Boolean(settings.medicalTermCheck);
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
      showLogprobs: el.showLogprobsToggle?.checked || false,  // v1.6.7
      medicalTermCheck: el.medicalTermCheckToggle?.checked || false,  // v1.7.1
    };
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  }

  /** @returns {StoredMessage[]} */
  function loadHistory() {
    const raw = localStorage.getItem(STORAGE_KEYS.HISTORY) || "[]";
    return safeJSONParse(raw, []);
  }

  function persistHistory() {
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

    // メッセージのインデックスを探す（後ろから検索して最も近いものを見つける）
    let idx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user" && messages[i].content === msgContent) {
        idx = i;
        break;
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
    const msgContent = msgDiv.dataset.content || "";

    // アシスタントメッセージを履歴から削除（存在する場合）
    const idx = messages.findIndex(m => m.role === "assistant" && m.content === msgContent);
    if (idx !== -1) {
      messages.splice(idx, 1);
      persistHistory();
    }

    // UI上の直前のユーザーメッセージを探す（ストリーミングエラー時に必要）
    let lastUserDiv = null;
    let prevSibling = msgDiv.previousElementSibling;
    while (prevSibling) {
      if (prevSibling.classList.contains("user-message")) {
        lastUserDiv = prevSibling;
        break;
      }
      prevSibling = prevSibling.previousElementSibling;
    }

    // アシスタントメッセージをUIから削除
    msgDiv.remove();

    // ユーザーメッセージのコンテンツを取得
    let userContent = "";
    if (lastUserDiv) {
      userContent = lastUserDiv.dataset.content || "";
    }

    // UI上のユーザーメッセージがない場合、履歴から探す
    if (!userContent) {
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === "user") {
          userContent = messages[i].content;
          break;
        }
      }
    }

    if (!userContent) {
      notify("⚠️ 再生成するユーザーメッセージがありません");
      return;
    }

    // 履歴からユーザーメッセージを削除（再送信時に重複しないよう）
    const userIdx = messages.findIndex(m => m.role === "user" && m.content === userContent);
    if (userIdx !== -1) {
      messages.splice(userIdx, 1);
      persistHistory();
    }

    // UI上のユーザーメッセージを削除
    if (lastUserDiv) {
      lastUserDiv.remove();
    } else {
      // 履歴から見つけた場合は最後のuser-messageを削除
      const userDivs = el.chat.querySelectorAll(".user-message");
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
    let sysPrompt;

    // ヘルプモードの場合は専用のシステムプロンプトを使用
    if (helpMode) {
      sysPrompt = `あなたは「Local LLM Chat」アプリのヘルプアシスタントです。
以下のアプリマニュアルを参照して、ユーザーの質問に日本語で丁寧に回答してください。
マニュアルに記載されていない内容については「マニュアルに記載がありません」と伝えてください。

---
${APP_MANUAL_CONTENT}
---

上記のマニュアル内容を基に、ユーザーの質問に回答してください。`;
    } else {
      const baseSysPrompt = el.systemPrompt.value || settings.systemPrompt;
      sysPrompt = baseSysPrompt + getResponseStyleInstruction() + getUserProfileInstruction();
    }

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
    const key = settings.apiKey || el.apiKey.value.trim();

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
    const authKey = settings.apiKey || el.apiKey.value.trim();

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
    const key = settings.apiKey || el.apiKey.value.trim();

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
    const key = settings.apiKey || el.apiKey.value.trim();

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

      // アルファベット順にソート（表示名で、大文字小文字を区別しない）
      list.sort((a, b) => {
        const nameA = a.replace(/^.*\//, "").toLowerCase();
        const nameB = b.replace(/^.*\//, "").toLowerCase();
        return nameA.localeCompare(nameB);
      });

      // build options
      el.modelSelect.innerHTML = "";
      list.forEach(id => {
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
        list[0],
      ].filter(Boolean);

      let chosen = null;
      for (const cand of fallbacks) {
        if (runtime.availableModels.has(cand)) { chosen = cand; break; }
      }
      if (chosen) el.modelSelect.value = chosen;

      saveSettingsFromUI();

      // v1.7.0: 比較モデルドロップダウンも更新
      updateCompareModelDropdown();

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
   * v1.6.7: logprobs対応版SSE消費関数
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

          // v1.6.7: logprobsデータを抽出（複数のパスを試行）
          let logprobData = j.choices?.[0]?.logprobs?.content || null;
          // 代替パス: delta内のlogprobs
          if (!logprobData && j.choices?.[0]?.delta?.logprobs) {
            logprobData = j.choices[0].delta.logprobs.content || null;
          }
          // 代替パス: トップレベルのlogprobs
          if (!logprobData && j.logprobs?.content) {
            logprobData = j.logprobs.content;
          }

          // deltaまたはlogprobDataがあれば処理
          if (delta || logprobData) {
            onDelta(delta, logprobData);
          }
        } catch {
          // 不完全JSONは次チャンクで完成（元実装踏襲）
        }
      }
    }
  }

  /**
   * v1.6.7: 信頼度・代替候補情報を表示
   * @param {HTMLDivElement} msgDiv - メッセージのdiv要素
   * @param {Array} logprobs - logprobsデータの配列
   */
  function displayLogprobsInfo(msgDiv, logprobs) {
    if (!logprobs || logprobs.length === 0) return;

    // 平均ログ確率から信頼度を計算
    let totalLogprob = 0;
    let count = 0;
    const alternativesMap = new Map();  // トークン位置ごとの代替候補

    for (const item of logprobs) {
      if (item && typeof item.logprob === 'number') {
        totalLogprob += item.logprob;
        count++;

        // 代替候補を収集（確率が高い順に既にソートされている前提）
        if (item.top_logprobs && item.top_logprobs.length > 1) {
          const alternatives = item.top_logprobs
            .filter(alt => alt.token !== item.token)
            .slice(0, 3)  // 上位3つまで
            .map(alt => ({
              token: alt.token,
              prob: Math.exp(alt.logprob) * 100  // パーセンテージに変換
            }));

          if (alternatives.length > 0) {
            alternativesMap.set(item.token, alternatives);
          }
        }
      }
    }

    if (count === 0) return;

    // 平均確率を計算（ログ確率から確率に変換）
    const avgLogprob = totalLogprob / count;
    const avgProb = Math.exp(avgLogprob);
    const confidencePercent = Math.min(100, Math.max(0, avgProb * 100));

    // 信頼度バーを作成
    const infoDiv = document.createElement('div');
    infoDiv.className = 'logprobs-info';

    // 信頼度レベルに応じた色とラベル
    let confidenceLevel, confidenceColor;
    if (confidencePercent >= 80) {
      confidenceLevel = '高';
      confidenceColor = '#28a745';
    } else if (confidencePercent >= 50) {
      confidenceLevel = '中';
      confidenceColor = '#ffc107';
    } else {
      confidenceLevel = '低';
      confidenceColor = '#dc3545';
    }

    // 代替候補の表示（最も顕著なもの上位5つまで）
    let alternativesHtml = '';
    const topAlternatives = Array.from(alternativesMap.entries())
      .filter(([token, alts]) => alts[0].prob > 5)  // 5%以上の代替のみ
      .slice(0, 5);

    if (topAlternatives.length > 0) {
      alternativesHtml = `
        <div class="alternatives-section">
          <span class="alternatives-label">📝 検討された代替候補:</span>
          <div class="alternatives-list">
            ${topAlternatives.map(([selectedToken, alts]) => `
              <div class="alternative-item">
                <span class="selected-token">"${escapeHtml(selectedToken)}"</span>
                <span class="arrow">→</span>
                ${alts.map(alt => `<span class="alt-token" title="${alt.prob.toFixed(1)}%">${escapeHtml(alt.token)} (${alt.prob.toFixed(0)}%)</span>`).join(' / ')}
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

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

    const firstImageData = imageAttachments.length > 0 ? imageAttachments[0].data : null;

    // ユーザーメッセージを表示
    appendMessage("user", displayText || "(添付ファイルのみ)", { save: false, imageData: firstImageData });
    const userMsgDiv = /** @type {HTMLDivElement} */ (el.chat.lastChild);
    if (userMsgDiv) userMsgDiv.dataset.content = text;

    strongClearPrompt();
    clearAllAttachments();

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

    const userMessageForHistory = { role: "user", content: text, imageData: firstImageData || undefined };

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
      const requestBody = {
        model,
        messages: apiMessages,
        stream: true,
        temperature: parseFloat(el.temperature.value) || 0.7,
        max_tokens: parseInt(el.maxTokens.value, 10) || 2048,
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
            if (contentEl) contentEl.innerHTML = marked.parse(content);
            smartScrollToBottom();
          },
          () => {
            const contentEl = msgEl.querySelector(".message-content");
            if (contentEl) contentEl.innerHTML = marked.parse(content || "(空応答)");
          }
        );

        return content;
      } catch (e) {
        const contentEl = msgEl.querySelector(".message-content");
        if (e && e.name === "AbortError") {
          const currentContent = updateContent(null);
          if (contentEl) contentEl.innerHTML = marked.parse(currentContent + "\n\n⏹ **生成を停止しました。**");
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
      messages.push({ role: "assistant", content: resultA || "(比較モード)" });
      persistHistory();

    } catch (e) {
      // ★ 停止時もユーザーメッセージを履歴に保存（Edit対応）
      if (e && e.name === "AbortError") {
        messages.push(userMessageForHistory);
        messages.push({ role: "assistant", content: contentA || "(比較モード - 停止)" });
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
    const key = settings.apiKey || el.apiKey.value.trim();
    // モデルは常にUI（select要素）の値を優先して使用
    const model = el.modelSelect.value || settings.model;

    if (!validateModelExists(model)) {
      notify(`⚠️ 選択モデルが /v1/models に見つかりません: ${model}`);
      return;
    }

    // v1.7.1: 医学用語チェック（有効時、テキストがある場合のみ）
    if (settings.medicalTermCheck && text && text.length > 0) {
      notify("🏥 医学用語をチェック中...");
      const checkResult = await checkMedicalTerminology(text);

      if (checkResult) {
        const modalResult = await showTermCheckModal(text, checkResult);

        if (modalResult.action === "cancel") {
          // 入力欄にテキストを戻す
          el.prompt.value = text;
          autoResizeTextarea(el.prompt);
          return;
        }

        if (modalResult.action === "apply" && modalResult.text !== text) {
          // 修正後のテキストを使用
          text = modalResult.text;
          notify("✅ 修正後のテキストで送信します");
        }
      }
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

    // 最初の画像をメッセージ履歴保存用に取得
    const firstImageData = imageAttachments.length > 0 ? imageAttachments[0].data : null;

    // UI表示用（save: false で履歴には保存しない）
    appendMessage("user", displayText || "(添付ファイルのみ)", { save: false, imageData: firstImageData });

    // ★ dataset.contentを履歴と同じ内容に修正（Edit機能で検索できるようにする）
    const userMsgDiv = /** @type {HTMLDivElement} */ (el.chat.lastChild);
    if (userMsgDiv) userMsgDiv.dataset.content = text;

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
    el.stopBtn.removeAttribute("disabled");  // ★ 確実にdisabledを解除
    el.sendBtn.disabled = true;
    isStreaming = true;                       // ★ ストリーミング開始
    userScrolledDuringStream = false;         // ★ スクロール状態リセット

    try {
      const apiMessages = [...buildConversation(), userMessage];

      // v1.6.7: logprobs有効時は /v1/responses API を使用（非ストリーミング）
      // ただし、会話履歴に画像が含まれる場合は /v1/chat/completions を使用
      // （/v1/responses は画像未対応のため、画像の文脈が失われてしまう）
      // 通常は /v1/chat/completions API を使用（ストリーミング）
      const conversationHasImage = (() => {
        // 会話履歴全体（apiMessages）に画像が含まれているかをチェック
        for (const msg of apiMessages) {
          if (Array.isArray(msg.content)) {
            if (msg.content.some(c => c.type === "image_url")) {
              return true;
            }
          }
        }
        return false;
      })();

      if (settings.showLogprobs && !conversationHasImage) {
        // Open Responses API を使用（logprobs対応）

        // メッセージをOpen Responses API形式に変換
        // systemメッセージはinstructionsとして、それ以外はinputとして渡す
        const systemMessages = apiMessages.filter(m => m.role === "system");
        const nonSystemMessages = apiMessages.filter(m => m.role !== "system");

        // instructionsはsystemメッセージの内容を結合
        const instructions = systemMessages.map(m => {
          if (typeof m.content === "string") return m.content;
          if (Array.isArray(m.content)) {
            return m.content.filter(c => c.type === "text").map(c => c.text).join("\n");
          }
          return "";
        }).join("\n\n");

        // inputは会話履歴全体をメッセージ配列として渡す
        // 画像を含むメッセージはテキスト部分のみを抽出する
        const inputMessages = nonSystemMessages.map(m => {
          // contentが配列の場合（画像付きメッセージ等）、テキスト部分のみ抽出
          if (Array.isArray(m.content)) {
            const textParts = m.content.filter(c => c.type === "text").map(c => c.text);
            return {
              role: m.role,
              content: textParts.join("\n") || "(画像メッセージ)"
            };
          }
          return { role: m.role, content: m.content };
        });

        const responsesBody = {
          model,
          input: inputMessages,  // メッセージ配列として渡す（会話履歴を保持）
          instructions: instructions || undefined,
          temperature: parseFloat(el.temperature.value) || 0.7,
          max_output_tokens: parseInt(el.maxTokens.value, 10) || 2048,
          top_logprobs: 5,  // 上位5つの代替候補を取得
        };

        // instructionsが空の場合は削除
        if (!responsesBody.instructions) {
          delete responsesBody.instructions;
        }

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

        // Token Caching情報をコンソールに出力（v0.3.39新機能）
        if (responseData.usage) {
          const usage = responseData.usage;
          console.log("[Token Usage] Total input tokens:", usage.input_tokens || usage.prompt_tokens || 0);
          console.log("[Token Usage] Total output tokens:", usage.output_tokens || usage.completion_tokens || 0);
          if (usage.input_tokens_details?.cached_tokens !== undefined) {
            console.log("[Token Cache] Cached tokens:", usage.input_tokens_details.cached_tokens);
            const totalInput = usage.input_tokens || usage.prompt_tokens || 0;
            const cached = usage.input_tokens_details.cached_tokens;
            if (totalInput > 0) {
              const cacheRate = ((cached / totalInput) * 100).toFixed(1);
              console.log("[Token Cache] Cache hit rate:", cacheRate + "%");
            }
          }
        }

        // レスポンスからテキストとlogprobsを抽出
        let content = "";
        let allLogprobs = [];

        // Open Responses API のレスポンス形式を解析
        if (responseData.output) {
          for (const item of responseData.output) {
            if (item.type === "message" && item.content) {
              for (const contentItem of item.content) {
                if (contentItem.type === "output_text") {
                  content += contentItem.text || "";
                  // logprobsデータを抽出
                  if (contentItem.logprobs) {
                    allLogprobs.push(...contentItem.logprobs);
                  }
                }
              }
            }
          }
        }

        // 代替: 直接textフィールドがある場合
        if (!content && responseData.text) {
          content = responseData.text;
        }

        // 代替: choices形式の場合
        if (!content && responseData.choices?.[0]?.message?.content) {
          content = responseData.choices[0].message.content;
          if (responseData.choices[0].logprobs?.content) {
            allLogprobs = responseData.choices[0].logprobs.content;
          }
        }

        // UIに表示
        const contentEl = currentMsgDiv.querySelector(".message-content");
        if (contentEl) contentEl.innerHTML = marked.parse(content || "(空応答)");

        // 信頼度・代替候補の表示
        if (allLogprobs.length > 0) {
          displayLogprobsInfo(currentMsgDiv, allLogprobs);
        }

        // Copy機能用のdataset更新
        currentMsgDiv.dataset.content = content;

        // 履歴へ保存
        messages.push(userMessageForHistory);
        messages.push({ role: "assistant", content });
        persistHistory();

        isStreaming = false;
        userScrolledDuringStream = false;
        el.stopBtn.disabled = true;
        el.stopBtn.setAttribute("disabled", "");
        el.sendBtn.disabled = false;             // ★ 追加: 送信ボタンを再有効化
        runtime.controller = null;

      } else {
        // 通常のストリーミングAPI（/v1/chat/completions）
        const requestBody = {
          model,
          messages: apiMessages,
          stream: true,
          temperature: parseFloat(el.temperature.value) || 0.7,
          max_tokens: parseInt(el.maxTokens.value, 10) || 2048,
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

        await consumeSSEWithLogprobs(
          reader,
          (delta, logprobData) => {
            content += delta;
            // エラー時に内容を保持するためにdatasetに保存
            currentMsgDiv.dataset.partialContent = content;
            const contentEl = currentMsgDiv.querySelector(".message-content");
            if (contentEl) contentEl.innerHTML = marked.parse(content);
            smartScrollToBottom();  // ★ スマートスクロール
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

            isStreaming = false;                     // ★ ストリーミング終了
            userScrolledDuringStream = false;        // ★ スクロール状態リセット
            el.stopBtn.disabled = true;
            el.stopBtn.setAttribute("disabled", ""); // ★ 確実にdisabledを設定
            runtime.controller = null;
          }
        );
      }

    } catch (e) {
      const contentEl = currentMsgDiv.querySelector(".message-content");
      const currentContent = currentMsgDiv.dataset.partialContent || "";

      if (e && e.name === "AbortError") {
        const stoppedContent = currentContent + "\n\n⏹ **生成を停止しました。**";
        if (contentEl) contentEl.innerHTML = marked.parse(stoppedContent);
        // ★ 停止時もユーザーメッセージと途中の応答を履歴に保存（Edit/Regenerate対応）
        currentMsgDiv.dataset.content = stoppedContent;
        messages.push(userMessageForHistory);
        messages.push({ role: "assistant", content: stoppedContent });
        persistHistory();
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
  // Medical Terminology Check (v1.7.1)
  // ---------------------------------------------------------------------------

  /**
   * 医学用語チェックのプロンプト
   */
  const MEDICAL_TERM_CHECK_PROMPT = `あなたは医学用語の専門家です。以下のテキストに含まれる医学用語をチェックしてください。

チェック対象テキスト:
"""
{TEXT}
"""

以下のJSON形式で回答してください（他の文章は不要）:
{
  "hasIssues": true/false,
  "issues": [
    {
      "original": "誤った用語",
      "suggested": "正しい用語",
      "reason": "理由"
    }
  ],
  "correctedText": "修正後のテキスト全文（問題がない場合は元のテキスト）"
}

注意:
- 明らかな誤りのみ指摘してください（略語、俗語は許容）
- 問題がなければ hasIssues: false を返してください
- 必ず有効なJSONのみを返してください`;

  /**
   * 医学用語チェックを実行
   * @param {string} text - チェック対象テキスト
   * @returns {Promise<{hasIssues: boolean, issues: Array<{original: string, suggested: string, reason: string}>, correctedText: string}|null>}
   */
  async function checkMedicalTerminology(text) {
    const base = trimTrailingSlashes(settings.baseUrl || el.baseUrl.value.trim());
    const key = settings.apiKey || el.apiKey.value.trim();
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
   * 医学用語チェックモーダルを表示
   * @param {string} originalText - 元のテキスト
   * @param {{hasIssues: boolean, issues: Array<{original: string, suggested: string, reason: string}>, correctedText: string}} checkResult - チェック結果
   * @returns {Promise<{action: "apply"|"asis"|"cancel", text: string}>}
   */
  function showTermCheckModal(originalText, checkResult) {
    return new Promise((resolve) => {
      // コンテンツを構築
      let contentHtml = "";
      if (checkResult.issues && checkResult.issues.length > 0) {
        contentHtml = "<ul style='margin:0;padding-left:20px'>";
        for (const issue of checkResult.issues) {
          contentHtml += `<li style="margin-bottom:8px">
            <strong style="color:#dc3545">${issue.original}</strong> →
            <strong style="color:#28a745">${issue.suggested}</strong>
            ${issue.reason ? `<br><small style="color:#666">${issue.reason}</small>` : ""}
          </li>`;
        }
        contentHtml += "</ul>";
      } else {
        contentHtml = "<p style='color:#28a745;margin:0'>✅ 医学用語に問題は見つかりませんでした。</p>";
      }

      el.termCheckContent.innerHTML = contentHtml;

      // 修正後テキストを表示（問題がある場合のみ）
      if (checkResult.hasIssues && checkResult.correctedText && checkResult.correctedText !== originalText) {
        el.termCheckCorrectedText.textContent = checkResult.correctedText;
        el.termCheckCorrected.style.display = "block";
        el.termCheckApply.style.display = "inline-block";
      } else {
        el.termCheckCorrected.style.display = "none";
        el.termCheckApply.style.display = "none";
      }

      // モーダル表示
      el.termCheckModal.style.display = "flex";

      // ボタンハンドラー
      const cleanup = () => {
        el.termCheckModal.style.display = "none";
        el.termCheckCancel.onclick = null;
        el.termCheckAsIs.onclick = null;
        el.termCheckApply.onclick = null;
      };

      el.termCheckCancel.onclick = () => {
        cleanup();
        resolve({ action: "cancel", text: originalText });
      };

      el.termCheckAsIs.onclick = () => {
        cleanup();
        resolve({ action: "asis", text: originalText });
      };

      el.termCheckApply.onclick = () => {
        cleanup();
        resolve({ action: "apply", text: checkResult.correctedText || originalText });
      };
    });
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

  /**
   * 新しい話題を開始する
   * - APIへの履歴送信をリセット（messagesをクリア）
   * - 画面上の会話履歴は保持（区切り線を追加）
   * - localStorageの履歴もクリア
   */
  function startNewTopic() {
    // 履歴がなければ何もしない
    if (messages.length === 0) {
      notify("ℹ️ 会話履歴がありません");
      return;
    }

    // API送信用の履歴をクリア
    messages = [];
    localStorage.removeItem(STORAGE_KEYS.HISTORY);

    // 画面上に区切り線を追加
    const separator = document.createElement("div");
    separator.className = "topic-separator";
    separator.innerHTML = `
      <div class="separator-line"></div>
      <span class="separator-text">🆕 新しい話題</span>
      <div class="separator-line"></div>
    `;
    el.chat.appendChild(separator);

    // スクロールを最下部に
    scrollToBottom(true);

    notify("🆕 新しい話題を開始しました（前の会話は画面に残りますが、AIには送信されません）");
  }

  // ---------------------------------------------------------------------------
  // Import history
  // ---------------------------------------------------------------------------

  /**
   * 会話履歴をJSONファイルからインポート（ファイル選択ダイアログを開く）
   */
  function importHistory() {
    el.importInput.click();
  }

  /**
   * インポートファイル選択時の処理
   * @param {File} file
   */
  async function handleImportFile(file) {
    if (!file) return;

    // ファイルサイズチェック（10MB上限）
    if (file.size > 10 * 1024 * 1024) {
      notify("⚠️ ファイルサイズが大きすぎます（上限: 10MB）");
      return;
    }

    try {
      const text = await readTextFile(file);
      const imported = JSON.parse(text);

      // バリデーション
      if (!validateImportData(imported)) {
        notify("⚠️ 無効な形式のファイルです");
        return;
      }

      // 既存履歴との統合確認
      const action = showImportDialog(imported.length);
      if (action === "cancel") return;

      if (action === "replace") {
        // 既存履歴を置換
        messages = imported;
      }

      // 保存とUI更新
      persistHistory();
      renderAllMessages();
      notify(`✅ ${imported.length}件のメッセージをインポートしました`);

    } catch (err) {
      console.error("インポートエラー:", err);
      notify("⚠️ ファイルの読み込みに失敗しました");
    } finally {
      el.importInput.value = "";
    }
  }

  /**
   * インポートデータのバリデーション
   * @param {any} data
   * @returns {boolean}
   */
  function validateImportData(data) {
    if (!Array.isArray(data)) return false;

    return data.every(msg => {
      if (typeof msg !== "object" || msg === null) return false;
      if (!["user", "assistant", "system"].includes(msg.role)) return false;
      if (typeof msg.content !== "string") return false;
      // imageDataは任意
      if (msg.imageData !== undefined && typeof msg.imageData !== "string") return false;
      return true;
    });
  }

  /**
   * インポート確認ダイアログ
   * @param {number} count インポートするメッセージ数
   * @returns {"replace"|"cancel"}
   */
  function showImportDialog(count) {
    const hasExisting = messages.length > 0;

    if (!hasExisting) {
      // 既存履歴がなければそのままインポート
      return "replace";
    }

    const choice = confirm(
      `${count}件のメッセージをインポートします。\n\n` +
      `[OK] 既存の履歴を置き換える\n` +
      `[キャンセル] 中止する\n\n` +
      `※ 既存履歴に追加したい場合は、先にエクスポートしてください。`
    );

    return choice ? "replace" : "cancel";
  }

  /**
   * 全メッセージを再描画
   */
  function renderAllMessages() {
    el.chat.innerHTML = "";
    for (const msg of messages) {
      if (msg.role === "system") continue; // システムプロンプトは表示しない
      appendMessage(msg.role, msg.content, { save: false, imageData: msg.imageData });
    }
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
    ddx: `与えられた臨床情報・画像所見から鑑別を3つ挙げて、自信度(0-100)と根拠（1行）を示してください。
追加で、普段は思いも付かない｢大穴｣診断を1つ追加。

【臨床・画像情報】`,
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

    el.baseUrl.onchange = save;
    el.apiKey.onchange = save;

    el.temperature.oninput = () => {
      el.tempValue.textContent = el.temperature.value;
      save();
    };

    el.maxTokens.onchange = save;
    el.systemPrompt.onchange = save;
    el.responseStyle.onchange = save;
    el.sendKey.onchange = save;  // ★ 送信キー設定の保存
    el.userLevel.onchange = save;
    el.userProfession.onchange = save;
    el.userInterests.onchange = save;

    el.darkModeToggle.onchange = () => toggleDarkMode(el.darkModeToggle.checked);

    // v1.6.7: 信頼度・代替候補表示設定
    if (el.showLogprobsToggle) {
      el.showLogprobsToggle.onchange = () => {
        settings.showLogprobs = el.showLogprobsToggle.checked;
        save();
        if (el.showLogprobsToggle.checked) {
          notify("📊 信頼度・代替候補表示を有効化しました（LM Studio v0.3.39以降が必要）");
        }
      };
    }

    // v1.7.1: 医学用語チェック設定
    if (el.medicalTermCheckToggle) {
      el.medicalTermCheckToggle.onchange = () => {
        settings.medicalTermCheck = el.medicalTermCheckToggle.checked;
        save();
        if (el.medicalTermCheckToggle.checked) {
          notify("🏥 医学用語チェックを有効化しました");
        }
      };
    }

    el.modelSelect.addEventListener("change", async (e) => {
      const id = /** @type {HTMLSelectElement} */ (e.target).value;
      const details = runtime.modelDetails.get(id);

      // v1.7.0: 未ロードモデルを選択した場合は自動ロード
      if (runtime.lmstudioV1Available && details?.state === MODEL_STATE.NOT_LOADED) {
        const displayName = id.replace(/^.*\//, "");
        notify(`⏳ モデル ${displayName} を読み込み中...`);
        el.modelSelect.disabled = true;

        try {
          await loadModelV1(id);
          // 状態を更新
          details.state = MODEL_STATE.LOADED;
          runtime.modelDetails.set(id, details);

          // ドロップダウンを更新（ロード完了を反映）
          await refreshModels();
          el.modelSelect.value = id;

          notify(`✅ モデル ${displayName} を読み込みました`);
        } catch (err) {
          notify(`⚠️ モデルの読み込みに失敗しました: ${err.message}`);
          // 失敗時は前のモデルに戻す
          if (settings.model && runtime.availableModels.has(settings.model)) {
            el.modelSelect.value = settings.model;
          }
        } finally {
          el.modelSelect.disabled = false;
        }
        return;
      }

      // 通常のモデル切り替え
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
    el.newTopicBtn.onclick = startNewTopic;
    el.exportBtn.onclick = exportHistory;
    el.clearBtn.onclick = clearHistory;
    el.importBtn.onclick = importHistory;
    el.importInput.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (file) handleImportFile(file);
    });

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
    updateCompareButton();
    updateCompareRow();

    if (compareMode) {
      notify("📊 比較モード ON - 2つのモデルの回答を並べて表示します");
    } else {
      notify("📊 比較モード OFF");
    }
  }

  /**
   * 比較ボタンの見た目を更新
   */
  function updateCompareButton() {
    if (compareMode) {
      el.compareBtn.style.background = "#6f42c1";
      el.compareBtn.style.color = "#fff";
      el.compareBtn.textContent = "📊 比較 ON";
    } else {
      el.compareBtn.style.background = "#fff";
      el.compareBtn.style.color = "#6f42c1";
      el.compareBtn.textContent = "📊 比較";
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
    updateHelpButton();

    if (helpMode) {
      notify("❓ ヘルプモード ON - アプリの使い方を質問してください");
    } else {
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

    renderHistoryFromStorage();

    wireSettingsEvents();
    wireMainButtons();
    wireScrollEvents();  // ★ スクロールイベント監視
    wireTextareaResize();
    wireAttachmentEvents();
    wireDeepDiveEvents();
    wireHelpEvents();    // ★ ヘルプモードイベント
    wireCompareEvents(); // ★ 比較モードイベント (v1.7.0)
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
