# 開発ドキュメント

Local LLM Chat の開発に関する技術情報とガイドライン

**最新バージョン**: v1.8.4（2026-03-08）
**アクティブ開発版**: `Local_LLM_Chat_JRC2026_preview/`

---

## プロジェクト構造

```
local_llm_chat/
├── CLAUDE.md                              # Claude Code 設定
├── CHANGELOG.md                           # 変更履歴
├── docs/                                  # ドキュメント
│   ├── MANUAL.md                          # ユーザーマニュアル（v1.8.4）
│   ├── DEVELOPMENT.md                     # このファイル
│   ├── MANUAL_v2.0.md                     # 旧マニュアル（v2.0時代）
│   └── DEVELOPMENT_v2.0.md                # 旧開発ドキュメント（v2.0時代）
│
├── Local_LLM_Chat_JRC2026_preview/        # ★ アクティブ開発版（v1.8.4）
│   ├── index.html                         #   HTML（330行）
│   ├── js/app.js                          #   JavaScript（約4,700行）IIFE
│   ├── assets/                            #   ライブラリ・CSS・ヘルプテキスト
│   ├── SAMPLE_PROMPTS.html                #   サンプルプロンプト集
│   ├── ADVANCED_PROMPTS.html              #   上級プロンプト集
│   ├── MANUAL.pdf                         #   マニュアル（PDF版）
│   └── MANUAL_print.html                  #   マニュアル（印刷用HTML版）
│
├── local_llm_chat_v1.8.4/                 # v1.8.4 バックアップ
├── local_llm_chat_v1.8.3/                 # v1.8.3 バックアップ
├── local_llm_chat_v1.8.0/                 # v1.8.0 配布版
│
├── dist/                                  # 配布用 zip ファイル
│   └── local_llm_chat_v1.8.4.zip          #   最新配布版
│
├── previous_ver/                          # 旧バージョンアーカイブ（git 管理外）
│   ├── Local_LLM_Chat_JRC2026_old/        #   元の JRC2026 配布版
│   ├── local_llm_chat_v1.6.6〜v1.7.3/     #   v1.6〜v1.7 系
│   ├── local_llm_chat_v2.0/               #   v2.0（UI刷新版）
│   ├── local_llm_chat_v2.1/               #   v2.1（モジュール分割版）
│   └── ...                                #   その他レガシー版
│
└── Presentation_in_JRC2026/               # JRC2026 発表資料
```

---

## アーキテクチャ

### 技術スタック

- **HTML5**: セマンティックマークアップ
- **CSS3**: インラインスタイル + 外部 CSS（`assets/app.css`）
- **JavaScript (ES6+)**: Vanilla JS、IIFE パターン
- **外部ライブラリ**（すべてローカル同梱）:
  - `marked.min.js` — Markdown レンダリング
  - `purify.min.js` — XSS 対策（DOMPurify）
  - `pdf.min.js` / `pdf.worker.min.js` — PDF テキスト抽出
- **ビルドツール**: なし（`file://` プロトコルで直接動作）

### データフロー

```
User Input → JavaScript → API Request → LLM Server (localhost)
                ↓                            ↓
         localStorage ←──────────── Streaming Response (SSE)
         IndexedDB (画像)                    ↓
                ↓                     Markdown → HTML (marked.js + DOMPurify)
           UI Update
```

### IIFE アーキテクチャ

グローバルスコープ汚染を防止するため、全コードを IIFE 内に格納。
ES Modules は `file://` プロトコルの CORS 制約により使用不可。

```javascript
(() => {
  "use strict";
  // 全コードがこの中に収まる
})();
```

---

## データモデル

### Settings（DEFAULT_SETTINGS）

```javascript
const DEFAULT_SETTINGS = Object.freeze({
  baseUrl: "http://localhost:1234/v1",
  apiKey: "lmstudio",
  model: null,
  temperature: 0.7,
  maxTokens: 2048,
  systemPrompt: "あなたは優秀なAIアシスタントです。...",
  responseStyle: "standard",        // concise | standard | detailed | professional
  responseLanguage: "",             // "" = 自動, "ja", "en", "zh", "ko"
  sendKey: "enter",                 // enter | ctrl-enter
  userName: "",
  userLevel: "",                    // "" | beginner | intermediate | advanced | expert
  userProfession: "",
  userInterests: "",
  darkMode: false,
  autoUnload: true,
  reasoningEffort: "",              // 未使用（UI削除済み、互換性のため残存）
  showWelcome: true,
  showSamplePrompts: true,
  hideThinking: false,
  enableQwen3Thinking: false,
});
```

### localStorage キー

```javascript
const STORAGE_KEYS = Object.freeze({
  HISTORY:              "localLLMChat_history",
  SETTINGS:             "localLLMChat_settings",
  PRESETS:              "localLLMChat_presets",
  DRAFT:                "localLLMChat_draft",
  PRESET_LABELS:        "localLLMChat_presetLabels",
  SYSTEM_PROMPT_PRESETS: "localLLMChat_systemPromptPresets",
  MODEL_VISIBILITY:     "localLLMChat_modelVisibility",
  SESSIONS:             "localLLMChat_sessions",
  CURRENT_SESSION_ID:   "localLLMChat_currentSessionId",
});
```

旧キー名（`chatHistory_v1.6` 等）からの自動マイグレーション機能あり。

### ファイルサイズ制限

```javascript
const LIMITS = Object.freeze({
  IMAGE_MAX_SIZE:  20 * 1024 * 1024,  // 20MB
  TEXT_MAX_SIZE:    2 * 1024 * 1024,   //  2MB
  PDF_MAX_SIZE:   10 * 1024 * 1024,   // 10MB
  MAX_HISTORY_FOR_API: 6,             // コンテキスト長不明時の上限
  MAX_HISTORY_UPPER_BOUND: 30,        // 絶対上限ターン数
});
```

---

## API 仕様

### エンドポイント

```
GET  {baseUrl}/models                # モデル一覧取得
POST {baseUrl}/chat/completions      # チャット応答生成（SSE ストリーミング）
GET  /api/v1/models                  # LM Studio v1 API（state 付きモデル一覧）
POST /api/v1/models/load             # モデルロード
POST /api/v1/models/unload           # モデルアンロード
```

### 接続先サーバープリセット

| プリセット | URL |
|-----------|-----|
| LM Studio | `http://localhost:1234/v1` |
| Ollama | `http://localhost:11434/v1` |
| カスタム | 任意の URL |

### リクエスト例

```json
{
  "model": "qwen3:8b",
  "messages": [
    { "role": "system", "content": "あなたは..." },
    { "role": "user", "content": "Hello!" }
  ],
  "stream": true,
  "stream_options": { "include_usage": true },
  "temperature": 0.7,
  "max_tokens": 2048
}
```

### レスポンス形式（SSE ストリーミング）

```
data: {"choices":[{"delta":{"content":"Hello"}}]}
data: {"choices":[{"delta":{"content":" there"}}]}
data: [DONE]
```

---

## 主要機能一覧

| 機能 | 実装バージョン |
|------|---------------|
| チャット送受信（SSE ストリーミング） | v1.0.0 |
| 設定管理（localStorage 永続化） | v1.0.0 |
| ダークモード | v1.0.0 |
| Vision API（画像入力） | v1.0.0 |
| メッセージアクション（コピー/削除/再生成） | v1.0.0 |
| ファイル添付（テキスト/PDF） | v1.1.0 |
| プリセットプロンプト | v1.3 |
| 完全オフライン対応 | v1.3 |
| 設定リセット・全データクリア | v1.6 |
| メッセージ編集 | v1.6.1 |
| 深掘りモード | v1.6.1 |
| 送信キー設定（Enter/Ctrl+Enter） | v1.6.2 |
| スマートスクロール | v1.6.4 |
| ヘルプモード | v1.6.6 |
| 信頼度表示（Logprobs） | v1.6.7 |
| 会話インポート（JSON） | v1.6.7 |
| 新しい話題（コンテキストリセット） | v1.6.8 |
| モデル比較（並列ストリーミング） | v1.7.0 |
| モデルリスト自動更新 | v1.7.0 |
| localStorage マイグレーション | v1.7.1 |
| 医学用語チェック | v1.7.2 |
| System Prompt プリセット | v1.7.2 |
| モデル自動アンロード | v1.7.3 |
| Thinking 表示（`<think>` タグ） | v1.8.0 |
| ショートカット一覧（Ctrl+/） | v1.8.0 |
| モデル表示フィルター | v1.8.0 |
| セッション管理 | v1.8.0 |
| 応答統計表示（tok/s 等） | v1.8.1 |
| 3段階ヘルプシステム | v1.8.1 |
| Qwen3 Thinking 制御 | v1.8.1 |
| XSS 対策（DOMPurify） | v1.8.2 |
| IndexedDB 画像オフロード | v1.8.2 |
| 動的コンテキスト長調整 | v1.8.3 |
| 接続先サーバープリセット化 | v1.8.4 |
| API Key / Reasoning Effort 削除 | v1.8.4 |
| SAMPLE_PROMPTS 初心者フレンドリー化 | v1.8.4 |

---

## セキュリティ

1. **ローカル実行**: すべての処理がローカル環境で完結
2. **データ保存**: localStorage / IndexedDB のみ（外部送信なし）
3. **API 通信**: localhost のみ
4. **XSS 対策**: DOMPurify によるサニタイズ + marked.js
5. **外部依存なし**: CDN 不使用、全ライブラリをローカル同梱

---

## コーディング規約

### 命名規則

- **JavaScript 変数/関数**: camelCase
- **JavaScript 定数**: UPPER_SNAKE_CASE
- **CSS クラス**: kebab-case

### コメント

- セクション間は `// ------...------` 区切り線
- JSDoc 型定義を使用

### フォーマット

- インデント: スペース2個
- セミコロン: 使用する
- 文字列: ダブルクォート（HTML属性）、テンプレートリテラル（JS内文字列組み立て）

---

## 開発バージョン履歴

```
v1.0.0  (2025-11) → 基盤構築（単一HTML、700行、CDN依存）
v1.1.0  (2025-11) → 汎用化（ファイル添付、D&D）
v1.3    (2025-12) → オフライン対応（プリセット、CDN排除）
v1.4    (2025-12) → リファクタリング（IIFE化、JSDoc型定義）
v1.6    (2025-12) → 外部ファイル分割（HTML + CSS + JS）
v1.6.1  (2025-12) → Vision表示、編集、深掘り
v1.6.2  (2025-12) → 重複バグ修正、送信キー設定
v1.6.4  (2025-12) → スマートスクロール
v1.6.6  (2026-01) → ヘルプモード
v1.6.7  (2026-01) → 信頼度表示、インポート
v1.6.8  (2026-01) → 新しい話題ボタン
v1.7.0  (2026-02) → モデル比較機能
v1.7.1  (2026-02) → localStorageキー名変更、マイグレーション
v1.7.2  (2026-02) → 医学用語チェック、System Promptプリセット
v1.7.3  (2026-02) → モデル自動アンロード
v2.0    (2026-02) → UI刷新（フルスクラッチ → 開発停止、参照用として保持）
v1.8.0  (2026-02) → JRC2026 Edition（Thinking、セッション管理、モデルフィルター）
v1.8.1  (2026-03) → 応答統計、3段階ヘルプ、Qwen3 Thinking制御
v1.8.2  (2026-03) → XSS対策（DOMPurify）、IndexedDB画像オフロード
v1.8.3  (2026-03) → 動的コンテキスト長、タイムアウト改善、マルチ画像改善
v1.8.4  (2026-03) → UI簡素化（API Key削除、接続先プリセット化）、SAMPLE_PROMPTS初心者フレンドリー化
```

---

## デバッグ

### ブラウザコンソールでの確認

```javascript
// 保存されている設定を確認
JSON.parse(localStorage.getItem("localLLMChat_settings"))

// 会話履歴を確認
JSON.parse(localStorage.getItem("localLLMChat_history"))

// セッション一覧を確認
JSON.parse(localStorage.getItem("localLLMChat_sessions"))

// 全データクリア
Object.keys(localStorage)
  .filter(k => k.startsWith("localLLMChat_"))
  .forEach(k => localStorage.removeItem(k));
```

---

## ライセンス

MIT License
