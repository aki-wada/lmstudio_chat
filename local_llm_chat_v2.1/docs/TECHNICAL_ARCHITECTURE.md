# Local LLM Chat v2.1 - 技術設計書

**文書バージョン**: 2.1
**作成日**: 2026-02-17
**目的**: フルスクラッチ再構築のための技術アーキテクチャ定義

---

## 目次

1. [ファイル構成](#1-ファイル構成)
2. [JavaScript アーキテクチャ](#2-javascript-アーキテクチャ)
3. [モジュール設計](#3-モジュール設計)
4. [状態管理設計](#4-状態管理設計)
5. [DOM構造設計](#5-dom構造設計)
6. [CSS設計](#6-css設計)
7. [イベントフロー](#7-イベントフロー)
8. [SSE（Server-Sent Events）処理](#8-sseserver-sent-events処理)
9. [外部ライブラリ依存](#9-外部ライブラリ依存)
10. [パフォーマンス設計](#10-パフォーマンス設計)
11. [セキュリティ考慮事項](#11-セキュリティ考慮事項)
12. [テスト戦略](#12-テスト戦略)

---

## 1. ファイル構成

### 1.1 現行版

```
local_llm_chat_v1.7.3/
├── local_llm_chat_v1.7.3.html    # HTML (239行)
├── js/
│   └── app.js                     # JavaScript (3574行, 単一IIFE)
├── assets/
│   ├── app.css                    # CSS (751行)
│   ├── marked.min.js              # Markdown パーサー (39KB)
│   ├── pdf.min.js                 # PDF テキスト抽出 (313KB)
│   └── pdf.worker.min.js          # PDF.js Worker (1.0MB)
├── MANUAL.md
├── MANUAL_print.html
└── MANUAL_v1.7.3.pdf
```

### 1.2 新版 推奨構成

```
local_llm_chat_v1.7.3/
├── local_llm_chat_v1.7.3.html    # HTML エントリポイント
├── js/
│   ├── app.js                     # アプリケーション起動・初期化
│   ├── modules/
│   │   ├── state.js               # 状態管理
│   │   ├── storage.js             # localStorage 操作
│   │   ├── settings.js            # 設定管理
│   │   ├── chat.js                # チャットUI・メッセージ管理
│   │   ├── streaming.js           # SSE ストリーミング処理
│   │   ├── models.js              # モデル管理・API通信
│   │   ├── attachments.js         # ファイル・画像添付
│   │   ├── presets.js             # プリセット管理
│   │   ├── compare.js             # モデル比較機能
│   │   ├── logprobs.js            # 信頼度・代替候補表示
│   │   ├── termcheck.js           # 医学用語チェック
│   │   ├── help.js                # ヘルプモード
│   │   ├── deepdive.js            # 深掘りモード
│   │   ├── theme.js               # ダークモード・テーマ管理
│   │   ├── keyboard.js            # キーボードショートカット
│   │   ├── scroll.js              # スマートスクロール
│   │   └── export-import.js       # エクスポート・インポート
│   └── utils/
│       ├── dom.js                 # DOM操作ヘルパー
│       ├── events.js              # イベント関連ユーティリティ
│       └── api.js                 # API呼び出しヘルパー
├── css/
│   ├── variables.css              # CSS Custom Properties
│   ├── base.css                   # リセット・基本スタイル
│   ├── layout.css                 # レイアウト（ヘッダー・チャット・入力）
│   ├── components.css             # ボタン・入力・カード等
│   ├── chat.css                   # メッセージ・バブル・アクション
│   ├── settings.css               # 設定パネル・タブ
│   ├── presets.css                # プリセットパネル
│   ├── modal.css                  # モーダルダイアログ
│   ├── compare.css                # 比較モードレイアウト
│   ├── logprobs.css               # 信頼度表示
│   ├── animations.css             # アニメーション定義
│   ├── dark-mode.css              # ダークモード上書き
│   └── responsive.css             # レスポンシブ対応
├── assets/
│   ├── marked.min.js
│   ├── pdf.min.js
│   └── pdf.worker.min.js
├── docs/
│   ├── FUNCTIONAL_SPEC.md
│   ├── UI_DESIGN_SPEC.md
│   ├── TECHNICAL_ARCHITECTURE.md
│   └── IMPLEMENTATION_CHECKLIST.md
├── MANUAL.md
├── MANUAL_print.html
└── MANUAL_v1.7.3.pdf
```

### 1.3 ファイル分割の判断基準

モジュール分割は開発効率向上のためだが、**配布の簡便さ**も重要。

**選択肢 A: モジュール分割（開発版）**
- 上記の分割構成
- 開発・保守が容易
- ファイル数が多い

**選択肢 B: 統合版（配布版）**
- HTML + app.js（単一）+ app.css（単一）
- 現行版と同じ構成
- 配布・コピーが簡単

**推奨**: 開発は選択肢Aで行い、配布時にバンドル（結合）する。
ただし、ビルドツールなしの場合は**選択肢Bの構成で開発**し、JSファイル内でセクションコメントにより論理的に分割する。

---

## 2. JavaScript アーキテクチャ

### 2.1 基本方針

- **IIFE（即時実行関数式）** でグローバルスコープ汚染を防止
- **"use strict"** モード
- **ES6+** 構文（const/let, arrow functions, template literals, destructuring, async/await）
- **ES Modules不使用**（file:// プロトコルでのCORS制約回避）
- **外部フレームワーク不使用**（Vanilla JS）

### 2.2 アプリケーション構造（単一ファイル版）

```javascript
(() => {
  "use strict";

  // ===================================================================
  // Section 1: 型定義・定数
  // ===================================================================

  // JSDoc型定義
  // STORAGE_KEYS, LEGACY_STORAGE_KEYS
  // LIMITS (ファイルサイズ等)
  // VISION_KEYWORDS, EMBEDDING_KEYWORDS
  // DEFAULT_SETTINGS
  // DEFAULT_PRESETS
  // API_ENDPOINTS

  // ===================================================================
  // Section 2: 状態管理
  // ===================================================================

  // state オブジェクト（リアクティブステート）
  // runtime オブジェクト（一時的な実行状態）

  // ===================================================================
  // Section 3: DOM参照
  // ===================================================================

  // el オブジェクト（全DOM参照のシングルソース）

  // ===================================================================
  // Section 4: ユーティリティ
  // ===================================================================

  // debounce, throttle
  // DOM操作ヘルパー (createElement, querySelector cache等)
  // 日付フォーマット

  // ===================================================================
  // Section 5: localStorage操作
  // ===================================================================

  // load / persist / clear 各データ
  // マイグレーション

  // ===================================================================
  // Section 6: 設定管理
  // ===================================================================

  // loadSettings, saveSettings, resetSettings
  // applySettingsToUI

  // ===================================================================
  // Section 7: テーマ（ダークモード）
  // ===================================================================

  // ===================================================================
  // Section 8: Markdown設定
  // ===================================================================

  // ===================================================================
  // Section 9: モデル管理
  // ===================================================================

  // checkLmstudioV1Api, fetchAllModelsV1
  // loadModelV1, unloadModelV1
  // refreshModels

  // ===================================================================
  // Section 10: チャットUI
  // ===================================================================

  // appendMessage, buildMessageActions
  // editUserMessage, regenerateLastAssistant
  // renderHistoryFromStorage

  // ===================================================================
  // Section 11: 会話構築
  // ===================================================================

  // buildConversation
  // getResponseStyleInstruction
  // getUserProfileInstruction

  // ===================================================================
  // Section 12: SSEストリーミング
  // ===================================================================

  // consumeSSE, consumeSSEWithLogprobs
  // handleSend, handleStop

  // ===================================================================
  // Section 13: モデル比較
  // ===================================================================

  // ===================================================================
  // Section 14: 信頼度・代替候補（Logprobs）
  // ===================================================================

  // ===================================================================
  // Section 15: 医学用語チェック
  // ===================================================================

  // ===================================================================
  // Section 16: プリセット管理
  // ===================================================================

  // ===================================================================
  // Section 17: System Promptプリセット
  // ===================================================================

  // ===================================================================
  // Section 18: ファイル・画像添付
  // ===================================================================

  // ===================================================================
  // Section 19: エクスポート・インポート
  // ===================================================================

  // ===================================================================
  // Section 20: 深掘り・ヘルプモード
  // ===================================================================

  // ===================================================================
  // Section 21: スマートスクロール
  // ===================================================================

  // ===================================================================
  // Section 22: キーボードショートカット
  // ===================================================================

  // ===================================================================
  // Section 23: イベント配線
  // ===================================================================

  // wireSettingsEvents, wireMainButtons, wireTextareaResize
  // wireAttachmentEvents, wireScrollEvents
  // wirePresetEvents, wireCompareEvents, wireHelpEvents

  // ===================================================================
  // Section 24: 初期化
  // ===================================================================

  // init()

  // ===================================================================
  // 起動
  // ===================================================================

  document.addEventListener("DOMContentLoaded", init);
})();
```

---

## 3. モジュール設計

### 3.1 依存関係グラフ

```
                    ┌───────────────┐
                    │   app.js      │  (初期化・起動)
                    │   (init)      │
                    └───────┬───────┘
                            │
           ┌────────────────┼────────────────┐
           │                │                │
    ┌──────┴──────┐  ┌──────┴──────┐  ┌──────┴──────┐
    │  settings   │  │    chat     │  │   models    │
    │  管理       │  │    UI       │  │   管理      │
    └──────┬──────┘  └──────┬──────┘  └──────┬──────┘
           │                │                │
           │         ┌──────┴──────┐         │
           │         │  streaming  │         │
           │         │  SSE処理    │         │
           │         └──────┬──────┘         │
           │                │                │
    ┌──────┴────────────────┴────────────────┴──────┐
    │                                               │
    │              state (状態管理)                   │
    │              storage (永続化)                   │
    │                                               │
    └───────────────────────────────────────────────┘
```

### 3.2 各モジュールの責務

| モジュール | 責務 | 主要関数 |
|-----------|------|---------|
| **state** | アプリケーション状態の一元管理 | getState, setState, subscribe |
| **storage** | localStorage CRUD + マイグレーション | load, persist, clear, migrate |
| **settings** | 設定のUI⇔状態 同期 | loadSettings, saveSettings, resetSettings, applyToUI |
| **chat** | メッセージの表示・操作 | appendMessage, editMessage, deleteMessage, regenerate |
| **streaming** | SSE接続・パース・中断 | consumeSSE, consumeSSEWithLogprobs, abort |
| **models** | モデル一覧・ロード・アンロード | refreshModels, loadModel, unloadModel |
| **attachments** | ファイル・画像の処理 | handleImage, handleFile, extractPdf, renderList |
| **presets** | プリセットのCRUD・UI | getPreset, insertPreset, addPreset, deletePreset |
| **compare** | 比較モードの全制御 | toggleCompare, handleCompareSend |
| **logprobs** | 信頼度・代替候補の表示 | displayLogprobs, renderConfidenceBar |
| **termcheck** | 医学用語チェックの実行・表示 | checkTerminology, showModal |
| **help** | ヘルプモードの制御 | toggleHelp, getManualContent |
| **deepdive** | 深掘りモードの制御 | toggleDeepDive, getInstruction |
| **theme** | テーマ切替 | toggleDarkMode, applyTheme |
| **keyboard** | キーボードショートカット | setupShortcuts |
| **scroll** | スマートスクロール | smartScrollToBottom, isNearBottom |
| **export-import** | 履歴のエクスポート・インポート | exportHistory, importHistory, validate |

---

## 4. 状態管理設計

### 4.1 状態オブジェクト構造

```javascript
const state = {
  // --- 永続化される状態 ---
  messages: [],           // StoredMessage[] - 会話履歴
  settings: { ... },      // Settings - ユーザー設定
  customPresets: {},       // { key: content } - カスタムプリセット文面
  customPresetLabels: {},  // { key: label } - カスタムプリセットラベル
  systemPromptPresets: {}, // { key: content } - System Promptプリセット

  // --- セッション状態（永続化しない） ---
  attachments: [],         // AttachmentItem[] - 現在の添付ファイル
  deepDiveMode: false,     // 深掘りモード ON/OFF
  compareMode: false,      // 比較モード ON/OFF
  helpMode: false,         // ヘルプモード ON/OFF
  isStreaming: false,      // ストリーミング中フラグ
  userScrolledDuringStream: false, // ストリーミング中のスクロール状態
};
```

### 4.2 ランタイムオブジェクト

```javascript
const runtime = {
  controller: null,         // AbortController（ストリーミング中断用）
  availableModels: new Set(), // 利用可能なモデルID集合
  modelDetails: new Map(),    // モデルID → { state, quantization, max_context_length }
  lmstudioV1Available: false, // LM Studio v1 API の利用可否
  lastModelRefresh: 0,        // 最終モデル一覧更新時刻（スロットリング用）
  draftTimer: null,           // 下書き保存タイマー
};
```

### 4.3 Attachment アイテム構造

```javascript
/**
 * @typedef {Object} AttachmentItem
 * @property {"image"|"text"|"pdf"} type
 * @property {string} name - ファイル名
 * @property {string} data - DataURL（画像）またはテキスト内容
 */
```

---

## 5. DOM構造設計

### 5.1 HTML セマンティック構造

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Local LLM Chat v1.7.3</title>
  <!-- CSS -->
  <link rel="stylesheet" href="./css/app.css?v=1.7.3">
  <!-- External Libraries -->
  <script src="./assets/marked.min.js"></script>
  <script src="./assets/pdf.min.js"></script>
  <script>
    if (typeof pdfjsLib !== 'undefined') {
      pdfjsLib.GlobalWorkerOptions.workerSrc = './assets/pdf.worker.min.js';
    }
  </script>
</head>
<body>

  <!-- ===== Header / Toolbar ===== -->
  <header class="toolbar" role="banner">
    <div class="toolbar__left">
      <span class="toolbar__title">Local LLM Chat</span>
    </div>
    <div class="toolbar__center">
      <div class="model-selector">
        <select id="modelSelect" aria-label="モデル選択"></select>
      </div>
      <div class="model-selector model-selector--compare" id="compareRow" hidden>
        <span class="model-selector__label">vs</span>
        <select id="compareModelSelect" aria-label="比較モデル選択"></select>
      </div>
    </div>
    <div class="toolbar__right">
      <button class="btn-ghost" id="newTopicBtn" aria-label="新しい話題" title="新しい話題">
        <!-- アイコン -->
      </button>
      <button class="btn-ghost" id="clearBtn" aria-label="クリア" title="クリア">
        <!-- アイコン -->
      </button>
      <div class="toolbar__divider"></div>
      <button class="btn-ghost" id="moreBtn" aria-label="その他" title="その他">
        <!-- ••• アイコン -->
      </button>
      <div class="toolbar__divider"></div>
      <button class="btn-ghost" id="settingsBtn" aria-label="設定" title="設定">
        <!-- ⚙ アイコン -->
      </button>
    </div>
  </header>

  <!-- ===== More Menu (Dropdown) ===== -->
  <div class="dropdown-menu" id="moreMenu" hidden>
    <button class="dropdown-item" id="exportBtn">💾 エクスポート</button>
    <button class="dropdown-item" id="importBtn">📥 インポート</button>
    <div class="dropdown-divider"></div>
    <button class="dropdown-item" id="compareBtn">📊 比較モード</button>
    <button class="dropdown-item" id="helpBtn">❓ ヘルプモード</button>
  </div>
  <input type="file" id="importInput" accept=".json" hidden>

  <!-- ===== Settings Panel (Slide-over) ===== -->
  <div class="overlay" id="settingsOverlay" hidden></div>
  <aside class="settings-panel" id="settingsPanel" role="dialog" aria-labelledby="settingsTitle" hidden>
    <div class="settings-panel__header">
      <h2 id="settingsTitle" class="settings-panel__title">設定</h2>
      <button class="btn-ghost" id="closeSettingsBtn" aria-label="閉じる">&times;</button>
    </div>
    <div class="settings-panel__tabs">
      <button class="tab active" data-tab="basic">基本</button>
      <button class="tab" data-tab="response">応答</button>
      <button class="tab" data-tab="advanced">詳細</button>
    </div>
    <div class="settings-panel__body">
      <!-- Tab: 基本 -->
      <div class="tab-content active" id="tab-basic">
        <!-- Dark Mode, Base URL, API Key, Temperature, Max Tokens, Send Key -->
      </div>
      <!-- Tab: 応答 -->
      <div class="tab-content" id="tab-response">
        <!-- Response Style, User Profile, System Prompt, System Prompt Presets -->
      </div>
      <!-- Tab: 詳細 -->
      <div class="tab-content" id="tab-advanced">
        <!-- Logprobs, Auto Unload, Preset Editor, Data Management -->
      </div>
    </div>
  </aside>

  <!-- ===== Chat Area ===== -->
  <main class="chat-area" id="chat" role="log" aria-live="polite">
    <!-- メッセージが動的に挿入される -->
  </main>

  <!-- ===== Preset Popover ===== -->
  <div class="preset-popover" id="presetPanel" hidden>
    <div class="preset-popover__header">
      <strong>プリセット</strong>
      <button class="btn-ghost btn-sm" id="closePresetBtn" aria-label="閉じる">&times;</button>
    </div>
    <div class="preset-popover__list" id="presetList">
      <!-- プリセット項目 -->
    </div>
  </div>

  <!-- ===== Input Area ===== -->
  <footer class="input-area">
    <div class="input-card" id="inputCard">
      <!-- 添付ファイルプレビュー -->
      <div class="attachment-preview" id="attachmentList" hidden>
        <!-- 添付ファイル一覧 -->
      </div>
      <!-- テキスト入力 -->
      <div class="input-card__row">
        <button class="btn-ghost btn-attach" id="attachBtn" aria-label="ファイルを添付" title="ファイルを添付">
          <!-- 📎+ アイコン -->
        </button>
        <textarea id="prompt"
                  placeholder="メッセージを入力..."
                  autocomplete="off" autocorrect="off"
                  autocapitalize="off" spellcheck="false"
                  aria-label="メッセージ入力"></textarea>
        <button class="btn-send" id="send" aria-label="送信" disabled>
          <!-- ▲ アイコン -->
        </button>
      </div>
      <!-- サブアクション -->
      <div class="input-card__actions">
        <button class="btn-tag" id="deepDiveBtn">🔍 深掘り</button>
        <button class="btn-tag" id="presetBtn">📋 Preset</button>
      </div>
    </div>
    <input type="file" id="imageInput" accept="image/*" multiple hidden>
    <input type="file" id="fileInput" accept=".txt,.md,.json,.csv,.xml,.html,.css,.js,.ts,.py,.java,.c,.cpp,.h,.hpp,.sh,.yaml,.yml,.log,.pdf" multiple hidden>
  </footer>

  <!-- ===== Attach Menu (Popover) ===== -->
  <div class="dropdown-menu" id="attachMenu" hidden>
    <button class="dropdown-item" id="attachImageBtn">📷 画像を添付</button>
    <button class="dropdown-item" id="attachFileBtn">📎 ファイルを添付</button>
  </div>

  <!-- ===== Medical Term Check Modal ===== -->
  <div class="modal-overlay" id="termCheckModal" hidden>
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="termCheckTitle">
      <div class="modal__header">
        <h3 id="termCheckTitle">🏥 医学用語チェック結果</h3>
        <button class="btn-ghost" id="termCheckClose" aria-label="閉じる">&times;</button>
      </div>
      <div class="modal__body">
        <div class="modal__content" id="termCheckContent"></div>
        <div class="modal__correction" id="termCheckCorrected" hidden>
          <strong>修正案:</strong>
          <div id="termCheckCorrectedText"></div>
        </div>
      </div>
      <div class="modal__footer">
        <button class="btn-secondary" id="termCheckCancel" hidden>キャンセル</button>
        <button class="btn-primary" id="termCheckAsIs">閉じる</button>
        <button class="btn-success" id="termCheckApply" hidden>修正を適用</button>
      </div>
    </div>
  </div>

  <!-- ===== Version Badge ===== -->
  <div class="version-badge">v1.7.3</div>

  <!-- ===== Application Script ===== -->
  <script src="./js/app.js?v=1.7.3"></script>

</body>
</html>
```

### 5.2 DOM参照オブジェクト（el）

```javascript
const el = Object.freeze({
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
  // ... 他の設定要素

  // Presets
  presetPanel:        document.getElementById("presetPanel"),
  presetList:         document.getElementById("presetList"),
  closePresetBtn:     document.getElementById("closePresetBtn"),

  // Medical Term Check Modal
  termCheckModal:     document.getElementById("termCheckModal"),
  termCheckContent:   document.getElementById("termCheckContent"),
  termCheckCorrected: document.getElementById("termCheckCorrected"),
  termCheckCorrectedText: document.getElementById("termCheckCorrectedText"),
  termCheckCancel:    document.getElementById("termCheckCancel"),
  termCheckAsIs:      document.getElementById("termCheckAsIs"),
  termCheckApply:     document.getElementById("termCheckApply"),
});
```

---

## 6. CSS設計

### 6.1 CSS設計方針

**BEM（Block Element Modifier）命名規則**:
```
.block {}
.block__element {}
.block--modifier {}
```

例:
```css
.toolbar {}
.toolbar__left {}
.toolbar__right {}
.toolbar__divider {}

.message {}
.message--user {}
.message--assistant {}
.message--system {}
.message__content {}
.message__actions {}

.input-card {}
.input-card__row {}
.input-card__actions {}
.input-card--focused {}

.settings-panel {}
.settings-panel__header {}
.settings-panel__tabs {}
.settings-panel__body {}
.settings-panel--open {}

.btn-primary {}
.btn-ghost {}
.btn-danger {}
.btn-send {}
.btn-send--active {}
```

### 6.2 CSS ファイル構成（単一ファイル版のセクション）

```css
/* ================================================
 * Local LLM Chat v1.7.3 - Stylesheet
 * ================================================ */

/* --- 1. CSS Custom Properties --- */
/* --- 2. Reset / Base --- */
/* --- 3. Layout (Header, Chat, Input) --- */
/* --- 4. Components (Buttons, Inputs, Cards) --- */
/* --- 5. Chat Messages --- */
/* --- 6. Settings Panel --- */
/* --- 7. Preset Panel --- */
/* --- 8. Modal --- */
/* --- 9. Compare Mode --- */
/* --- 10. Logprobs --- */
/* --- 11. Animations --- */
/* --- 12. Dark Mode --- */
/* --- 13. Responsive --- */
```

### 6.3 CSSリセット（最小限）

```css
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html {
  -webkit-text-size-adjust: 100%;
}

body {
  font-family: var(--font-sans);
  font-size: 0.9375rem;
  line-height: 1.6;
  color: var(--color-text-primary);
  background: var(--color-bg-secondary);
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh; /* iOS Safari対応 */
  overflow: hidden;
}
```

---

## 7. イベントフロー

### 7.1 メッセージ送信フロー

```
[Send Click / Enter]
    │
    ├─ validate input (空チェック、モデル選択チェック)
    │
    ├─ isStreaming → return (二重送信防止)
    │
    ├─ processAttachments()
    │   ├─ 画像 → DataURL → Vision形式メッセージ
    │   ├─ テキスト → 内容読み込み → テキスト付加
    │   └─ PDF → テキスト抽出 → テキスト付加
    │
    ├─ appendMessage("user", text) → DOM追加
    │
    ├─ persistHistory() → localStorage保存
    │
    ├─ buildConversation() → API用メッセージ配列構築
    │   ├─ System Prompt (base + responseStyle + userProfile + deepDive + help)
    │   └─ 最新MAX_HISTORY_FOR_API件のメッセージ
    │
    ├─ [Compare Mode?]
    │   ├─ YES → handleCompareSend() → Promise.all(modelA, modelB)
    │   └─ NO  → 単一モデル送信
    │
    ├─ [showLogprobs?]
    │   ├─ YES → POST /v1/responses (non-streaming)
    │   └─ NO  → POST /v1/chat/completions (streaming)
    │
    ├─ fetch() with AbortController
    │
    ├─ consumeSSE(reader, onDelta, onDone)
    │   ├─ onDelta(text) → DOM更新 + smartScroll
    │   └─ onDone() → persistHistory + re-enable UI
    │
    └─ Error → 部分コンテンツ保持 + エラーメッセージ追記
```

### 7.2 設定パネルフロー

```
[⚙ Settings Click]
    │
    ├─ openSettingsPanel()
    │   ├─ show overlay (fade-in)
    │   ├─ slide-in panel
    │   └─ loadSettingsToUI()
    │
    ├─ [User edits settings]
    │
    ├─ [Close / ← 戻る / Esc / Overlay click]
    │   ├─ saveSettingsFromUI()
    │   ├─ hide panel (slide-out)
    │   └─ hide overlay (fade-out)
    │
    └─ [Reset / Clear All]
        ├─ confirm dialog
        └─ resetSettingsToDefault() / clearAllData()
```

### 7.3 モデル選択フロー

```
[modelSelect mousedown]
    │
    ├─ throttle check (3秒以内 → skip)
    │
    ├─ refreshModels()
    │   ├─ checkLmstudioV1Api()
    │   │   └─ GET /api/v1/models → lmstudioV1Available = true/false
    │   │
    │   ├─ [v1Available]
    │   │   ├─ fetchAllModelsV1() → modelDetails Map更新
    │   │   └─ フィルタリング（embedding除外）
    │   │
    │   └─ [!v1Available]
    │       └─ GET {baseUrl}/models → fallback
    │
    └─ updateModelDropdown()
        ├─ ソート（表示名アルファベット順）
        └─ 各option生成（状態アイコン + 名前 + Vision + 量子化）

[modelSelect change]
    │
    ├─ [autoUnload ON && 前モデルがロード済み]
    │   └─ unloadModelV1(previousModel)
    │
    ├─ [新モデルが未ロード]
    │   └─ loadModelV1(newModel)
    │
    └─ saveSettings()
```

---

## 8. SSE（Server-Sent Events）処理

### 8.1 通常のSSEパーサー

```javascript
async function consumeSSE(reader, onDelta, onDone) {
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop(); // 不完全な最終行を保持

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data: ")) continue;

      const data = trimmed.slice(6); // "data: " を除去
      if (data === "[DONE]") {
        onDone();
        return;
      }

      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) onDelta(delta);
      } catch (e) {
        // JSON parse error → skip
      }
    }
  }
  onDone();
}
```

### 8.2 Logprobs付きSSEパーサー

```javascript
async function consumeSSEWithLogprobs(reader, onDelta, onDone) {
  // Open Responses API はストリーミングではなく
  // 一括JSONレスポンスを返す
  const decoder = new TextDecoder();
  let result = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }

  const json = JSON.parse(result);
  // output配列からテキストとlogprobsを抽出
  // onDelta(text), onDone(logprobs)
}
```

### 8.3 AbortController によるキャンセル

```javascript
function handleStop() {
  if (runtime.controller) {
    runtime.controller.abort();
    runtime.controller = null;
  }
  state.isStreaming = false;
  // UI復元: Send有効化、Stop無効化
}
```

---

## 9. 外部ライブラリ依存

### 9.1 必須ライブラリ

| ライブラリ | バージョン | サイズ | 用途 |
|-----------|----------|--------|------|
| marked.js | latest stable | ~39KB | Markdown → HTML 変換 |
| pdf.js (pdf.min.js) | latest stable | ~313KB | PDF テキスト抽出 |
| pdf.worker.min.js | latest stable | ~1.0MB | PDF.js Web Worker |

### 9.2 marked.js 設定

```javascript
function setupMarkdown() {
  if (typeof marked === "undefined") return;

  marked.setOptions({
    breaks: true,   // 改行をそのまま <br> に
    gfm: true,      // GitHub Flavored Markdown
  });

  // カスタムレンダラー: リンクを新規タブで開く
  const renderer = new marked.Renderer();
  renderer.link = function(href, title, text) {
    return `<a href="${href}" target="_blank" rel="noopener noreferrer"${
      title ? ` title="${title}"` : ""
    }>${text}</a>`;
  };
  marked.use({ renderer });
}
```

### 9.3 PDF.js Worker 設定

```javascript
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = './assets/pdf.worker.min.js';
}
```

---

## 10. パフォーマンス設計

### 10.1 最適化ポイント

| 対象 | 手法 | 効果 |
|------|------|------|
| 下書き保存 | 300ms デバウンス | localStorage書き込み頻度削減 |
| モデル一覧更新 | 3秒 スロットリング | API呼び出し頻度削減 |
| SSE処理 | バッファリング + 行分割 | 効率的なパース |
| DOM更新 | textContent / innerHTML 使い分け | リフロー最小化 |
| スクロール | isNearBottom() での条件分岐 | 不要なscrollTo回避 |
| Markdown | コンテンツ確定後に1回レンダリング | 中間レンダリング回避 |
| イベントリスナー | イベント委譲（delegation） | リスナー数削減 |

### 10.2 メモリ管理

- localStorage の容量制限: ブラウザ依存（通常5-10MB）
- 大量の会話履歴による容量超過 → エクスポート推奨
- 画像DataURLは会話履歴内に格納 → 容量消費に注意
- 添付ファイルは送信後にメモリから解放

### 10.3 キャッシュバスティング

```html
<link rel="stylesheet" href="./css/app.css?v=1.7.3">
<script src="./js/app.js?v=1.7.3"></script>
```

バージョンパラメータでブラウザキャッシュを制御。

---

## 11. セキュリティ考慮事項

### 11.1 ネットワーク

- すべてのAPI通信は `localhost` 宛て
- 外部サーバーへの通信なし
- CDN不使用（全アセットローカル）

### 11.2 Markdown レンダリング

- marked.js の出力をそのまま `innerHTML` に挿入
- **リスク**: XSSの可能性
- **対策**: marked.js の sanitize オプション、またはカスタムレンダラーで JavaScript URL を除外

```javascript
// リンクの安全性チェック
renderer.link = function(href, title, text) {
  if (href && href.startsWith("javascript:")) {
    return text; // JavaScript URLを無効化
  }
  // ...
};
```

### 11.3 データ保護

- すべてのデータは localStorage に平文保存
- パスワード・APIキーも平文（localhost環境のため許容）
- プライベートブラウジングモードでは保存されない

### 11.4 入力サニタイズ

- ユーザー入力テキストは API送信時にそのまま送信（LLM側で処理）
- DOM表示時は Markdown レンダラー経由（HTMLエスケープ含む）

---

## 12. テスト戦略

### 12.1 手動テスト項目

#### 基本機能
- [ ] ページロード・初期化
- [ ] モデル一覧取得・表示
- [ ] メッセージ送信・ストリーミング受信
- [ ] メッセージの Copy / Delete / Edit / Regenerate
- [ ] 会話履歴の保存・復元（ページリロード）
- [ ] 新しい話題（コンテキストリセット）

#### 設定
- [ ] 各設定項目の変更・保存・復元
- [ ] ダークモード切替
- [ ] 設定リセット
- [ ] 全データクリア

#### ファイル操作
- [ ] 画像添付（ボタン、ペースト、ドラッグ＆ドロップ）
- [ ] テキストファイル添付
- [ ] PDF添付
- [ ] 複数ファイル同時添付
- [ ] サイズ超過ファイルの拒否

#### 拡張機能
- [ ] 比較モード（並列ストリーミング）
- [ ] 深掘りモード
- [ ] ヘルプモード
- [ ] 信頼度表示
- [ ] 医学用語チェック
- [ ] プリセット操作（挿入、編集、追加、削除）
- [ ] System Promptプリセット
- [ ] モデル自動アンロード
- [ ] エクスポート・インポート

#### レスポンシブ
- [ ] デスクトップ表示
- [ ] タブレット表示
- [ ] モバイル表示
- [ ] 比較モードのモバイル表示

#### エラーケース
- [ ] サーバー未起動時のエラーハンドリング
- [ ] ストリーミング中の停止
- [ ] 不正なインポートファイルの拒否
- [ ] 大量メッセージ時のパフォーマンス

### 12.2 ブラウザ互換テスト

| ブラウザ | バージョン | テスト項目 |
|---------|----------|----------|
| Chrome | 最新 | 全機能 |
| Firefox | 最新 | 全機能 |
| Safari | 最新 | 全機能 + 100dvh対応 |
| Edge | 最新 | 全機能 |
