# 開発ドキュメント

Local LLM Chat の開発に関する技術情報とガイドライン

**最新バージョン**: v2.0（2026-02-15）
**アクティブ開発版**: `local_llm_chat_v2.0/`

## プロジェクト構造

```
local_llm_chat/
├── CHANGELOG.md                   # 変更履歴（v1.0.0〜v2.0）
├── MANUAL.md                      # ユーザーマニュアル
├── DEVELOPMENT.md                 # このファイル
├── README.md                      # プロジェクト概要
├── LICENSE                        # MIT License
├── .gitignore                     # Git除外設定
│
├── local_llm_chat_v2.0/           # 最新版（UI刷新・フルスクラッチ再構築）
│   ├── local_llm_chat_v2.0.html   #   HTML（297行）
│   ├── css/app.css                #   CSS（1,285行）BEM + Custom Properties
│   ├── js/app.js                  #   JS（2,792行）IIFE・28セクション
│   ├── assets/                    #   ライブラリ（marked.js, pdf.js）
│   ├── docs/                      #   設計文書（4ファイル）
│   ├── MANUAL.md                  #   マニュアル
│   └── MANUAL_print.html          #   印刷用マニュアル
│
├── local_llm_chat_v1.7.3/         # 前安定版（全23機能の完成版）
├── local_llm_chat_v1.7.2/         # 医学用語チェック・System Promptプリセット
├── local_llm_chat_v1.7.1/         # localStorageキー名変更・マイグレーション
├── local_llm_chat_v1.7.0/         # モデル比較機能
├── local_llm_chat_v1.6.8/         # 新しい話題ボタン
├── local_llm_chat_v1.6.7/         # 信頼度表示・インポート
├── local_llm_chat_v1.6.6.1/       # 重複応答バグ修正
└── local_llm_chat_v1.6.6/         # ヘルプモード
```

### v2.0 設計文書

```
local_llm_chat_v2.0/docs/
├── FUNCTIONAL_SPEC.md             # 全23機能の詳細仕様（F-01〜F-23）
├── UI_DESIGN_SPEC.md              # カラー、タイポ、レイアウト、コンポーネント
├── TECHNICAL_ARCHITECTURE.md      # JS構造、状態管理、DOM、CSS、SSE
└── IMPLEMENTATION_CHECKLIST.md    # 9フェーズの段階的実装ガイド
```

## アーキテクチャ

### 技術スタック

- **HTML5**: セマンティックマークアップ（BEM命名規則）
- **CSS3**: CSS Custom Properties、BEM、Soft Elevation、アニメーション
- **JavaScript (ES6+)**: Vanilla JS、IIFE（即時実行関数式）パターン
- **外部ライブラリ**: marked.js（Markdown）、PDF.js（PDFテキスト抽出） - すべてローカル同梱
- **ビルドツール**: なし（`file://` プロトコルで直接動作）

### データフロー

```
User Input → JavaScript → API Request → LLM Server (localhost)
                ↓                            ↓
         localStorage ←──────────── Streaming Response (SSE)
                ↓
           UI Update (marked.js → HTML)
```

### IIFE アーキテクチャ（v1.4〜）

グローバルスコープ汚染を防止するため、全コードをIIFE内に格納。
ES Modules は `file://` プロトコルのCORS制約により使用不可。

```javascript
(() => {
  "use strict";
  // Section 1〜28 がすべてこの中に収まる
})();
```

### JavaScript セクション構成（v2.0: 28セクション）

| # | セクション | 概要 |
|---|-----------|------|
| 1 | 型定義・定数 | JSDoc型、STORAGE_KEYS、LIMITS、キーワード定数 |
| 2 | 状態管理 | `state`（永続）、`runtime`（一時） |
| 3 | DOM参照 | `el` オブジェクトに全DOM参照を集約 |
| 4 | ユーティリティ | エスケープ、サニタイズ、コピー等 |
| 5 | localStorage操作 | 読み書き、マイグレーション |
| 6 | 設定管理 | Settings ↔ UI 同期 |
| 7 | テーマ | ダークモード切替 |
| 8 | Markdown設定 | marked.js 設定 |
| 9 | LM Studio v1 API | モデルロード/アンロード |
| 10 | モデル管理 | モデル一覧取得、フィルタリング |
| 11 | ヘルパー関数 | タイムスタンプ生成等 |
| 12 | System Prompt構築 | 基本+スタイル+プロフィール合成 |
| 13 | 添付ファイル処理 | 画像/テキスト/PDF |
| 14 | SSEストリーム処理 | `consumeSSE()` - ReadableStream解析 |
| 15 | チャットUI | メッセージ表示、アクションボタン |
| 16 | チャット送信・停止 | `sendMessage()`、AbortController |
| 17 | 新しい話題・クリア | コンテキストリセット |
| 18 | プリセット | テンプレートプロンプト（6種） |
| 19 | System Promptプリセット | 保存・切替・削除 |
| 20 | エクスポート・インポート | JSON形式の会話データ |
| 21 | 設定リセット・全データ消去 | データ管理 |
| 22 | 深掘りモード | 多角的分析プロンプト |
| 23 | 比較モード | 2モデル並列ストリーミング |
| 24 | ヘルプモード | マニュアル参照AI応答 |
| 25 | 医学用語チェック | AI応答の医学用語検証 |
| 26 | UI操作 | Toggle Switch、Dropdown Menu |
| 27 | イベント配線 | 全イベントリスナー登録 |
| 28 | 初期化 | `init()` エントリーポイント |

### 状態管理

```javascript
// 永続状態（localStorageと同期）
const state = {
  messages: [],          // 会話履歴
  settings: {},          // ユーザー設定
  customPresets: {},     // カスタムプリセット
  customPresetLabels: {},// プリセットラベル
  systemPromptPresets: {},// System Promptプリセット
  attachments: [],       // 添付ファイル（一時）
  deepDiveMode: false,   // 深掘りモード
  compareMode: false,    // 比較モード
  helpMode: false,       // ヘルプモード
  isStreaming: false,    // ストリーミング中
  userScrolledDuringStream: false,  // スマートスクロール
};

// 一時状態（セッション限り）
const runtime = {
  controller: null,        // AbortController
  availableModels: new Set(),
  modelDetails: new Map(),
  lmstudioV1Available: false,
  lastModelRefresh: 0,     // スロットリング用
  draftTimer: null,        // 下書き保存タイマー
};
```

## データモデル

### StoredMessage

```javascript
/** @typedef {Object} StoredMessage */
{
  role: "user" | "assistant" | "system",
  content: string,
  imageData?: string  // base64エンコード画像
}
```

### Settings

```javascript
/** @typedef {Object} Settings */
{
  baseUrl: string,       // デフォルト: "http://localhost:1234/v1"
  apiKey: string,        // デフォルト: "lmstudio"
  model: string,
  temperature: number,   // 0.0〜2.0（デフォルト: 0.7）
  maxTokens: number,     // 1〜8192（デフォルト: 2048）
  systemPrompt: string,
  responseStyle: "concise" | "standard" | "detailed" | "professional",
  sendKey: "enter" | "ctrl-enter",
  userLevel: "" | "beginner" | "intermediate" | "advanced" | "expert",
  userProfession: string,
  userInterests: string,
  darkMode: boolean,
  showLogprobs: boolean,  // 信頼度・代替候補表示
  autoUnload: boolean,    // モデル自動アンロード
}
```

## localStorage

### ストレージキー（v1.7.1〜 バージョン非依存）

```javascript
const STORAGE_KEYS = Object.freeze({
  HISTORY:              "localLLMChat_history",
  SETTINGS:             "localLLMChat_settings",
  PRESETS:              "localLLMChat_presets",
  DRAFT:                "localLLMChat_draft",
  PRESET_LABELS:        "localLLMChat_presetLabels",
  SYSTEM_PROMPT_PRESETS: "localLLMChat_systemPromptPresets",
});
```

旧キー名（`chatHistory_v1.6` 等）からの自動マイグレーション機能あり。

### データサイズ考慮事項

- localStorage の一般的な上限: 5〜10MB
- base64画像データはサイズが大きくなる可能性あり
- 直近6メッセージ（`MAX_HISTORY_FOR_API = 6`）のみをAPIに送信

### ファイルサイズ制限

```javascript
const LIMITS = Object.freeze({
  IMAGE_MAX_SIZE:  20 * 1024 * 1024,  // 20MB
  TEXT_MAX_SIZE:    2 * 1024 * 1024,  //  2MB
  PDF_MAX_SIZE:   10 * 1024 * 1024,  // 10MB
  IMPORT_MAX_SIZE: 10 * 1024 * 1024,  // 10MB
});
```

## API 仕様

### エンドポイント

```
GET  {baseUrl}/models                # モデル一覧取得
POST {baseUrl}/chat/completions      # チャット応答生成（SSE）
POST {baseUrl}/responses             # Open Responses API（logprobs）
GET  /api/v1/models                  # LM Studio v1 API（state付きモデル一覧）
POST /api/v1/models/load             # モデルロード
POST /api/v1/models/unload           # モデルアンロード
```

### リクエスト例

```json
{
  "model": "gemma-3-12b-it",
  "messages": [
    { "role": "system", "content": "あなたは..." },
    { "role": "user", "content": "Hello!" }
  ],
  "stream": true,
  "temperature": 0.7,
  "max_tokens": 2048
}
```

### レスポンス形式（SSEストリーミング）

```
data: {"choices":[{"delta":{"content":"Hello"}}]}
data: {"choices":[{"delta":{"content":" there"}}]}
data: [DONE]
```

### logprobs付きレスポンス

```
data: {"choices":[{"delta":{"content":"Hello"},"logprobs":{"content":[{"token":"Hello","logprob":-0.5,"top_logprobs":[...]}]}}]}
```

## CSS 設計（v2.0）

### デザインコンセプト: Clean, Calm, Professional

| 項目 | v1.7.3 | v2.0 |
|------|--------|------|
| レイアウト | Dense | Spacious（余白活用） |
| 影 | Flat | Soft Elevation |
| アイコン | Emoji-heavy | Subtle Icons |
| スタイル | Inline Styles | CSS Custom Properties |
| 命名規則 | なし | BEM |
| カラー | #007bff | #3b82f6（Tailwind Blue） |
| トグル | チェックボックス | トグルスイッチ |

### CSS Custom Properties（抜粋）

```css
:root {
  /* カラーパレット */
  --color-primary: #3b82f6;
  --color-bg-primary: #ffffff;
  --color-bg-secondary: #f9fafb;
  --color-text-primary: #111827;
  --color-border: #e5e7eb;

  /* スペーシング */
  --space-1: 4px;  --space-2: 8px;  --space-3: 12px;
  --space-4: 16px; --space-6: 24px; --space-8: 32px;

  /* その他 */
  --radius-md: 8px;
  --shadow-md: 0 4px 6px -1px rgba(0,0,0,.1);
}
```

### BEM 命名規則

```css
.toolbar { }              /* Block */
.toolbar__left { }        /* Element */
.toolbar__title { }       /* Element */
.model-selector--compare { } /* Modifier */
```

## 機能一覧（全23機能）

| # | 機能 | 実装バージョン |
|---|------|---------------|
| F-01 | チャット送受信（SSEストリーミング） | v1.0.0 |
| F-02 | 設定管理（localStorage永続化） | v1.0.0 |
| F-03 | ダークモード | v1.0.0 |
| F-04 | Vision API（画像入力） | v1.0.0 |
| F-05 | メッセージアクション（コピー/削除/再生成） | v1.0.0 |
| F-06 | 会話エクスポート（JSON） | v1.0.0 |
| F-07 | ファイル添付（テキスト/PDF） | v1.1.0 |
| F-08 | プリセットプロンプト（6種） | v1.3 |
| F-09 | 完全オフライン対応 | v1.3 |
| F-10 | 設定リセット・全データクリア | v1.6 |
| F-11 | メッセージ編集 | v1.6.1 |
| F-12 | 深掘りモード | v1.6.1 |
| F-13 | 送信キー設定（Enter/Ctrl+Enter） | v1.6.2 |
| F-14 | スマートスクロール | v1.6.4 |
| F-15 | ヘルプモード | v1.6.6 |
| F-16 | 信頼度表示（Logprobs） | v1.6.7 |
| F-17 | 会話インポート（JSON） | v1.6.7 |
| F-18 | 新しい話題（コンテキストリセット） | v1.6.8 |
| F-19 | モデル比較（並列ストリーミング） | v1.7.0 |
| F-20 | モデルリスト自動更新 | v1.7.0 |
| F-21 | localStorageマイグレーション | v1.7.1 |
| F-22 | 医学用語チェック | v1.7.2 |
| F-23 | System Promptプリセット | v1.7.2 |
| - | モデル自動アンロード | v1.7.3 |

## セキュリティ考慮事項

1. **ローカル実行**: すべての処理がローカル環境で完結
2. **データ保存**: ブラウザのlocalStorageのみ使用（外部サーバーには送信しない）
3. **API通信**: LLMサーバーへの通信はlocalhostのみ
4. **XSS対策**: marked.jsによるMarkdown変換（サニタイズ済み）
5. **外部依存なし**: CDN不使用、全ライブラリをローカル同梱

## パフォーマンス最適化

1. **SSEストリーミング**: 逐次的に応答を表示（全体の待機時間を短縮）
2. **コンテキスト制限**: 直近6メッセージのみをAPIに送信
3. **モデルリスト更新スロットリング**: 3秒間隔の制限
4. **下書き保存デバウンス**: 300ms遅延
5. **スマートスクロール**: ユーザースクロール操作を尊重
6. **画像サイズ制限**: 20MB以下

## テスト

### 手動テスト項目

#### 基本機能
- [ ] メッセージ送信・ストリーミング応答表示
- [ ] 応答の停止（Stopボタン）
- [ ] 新しい話題（コンテキストリセット）
- [ ] 全会話クリア

#### 設定機能
- [ ] Temperature/Max Tokens変更
- [ ] System Prompt変更
- [ ] System Promptプリセット保存・切替・削除
- [ ] 応答スタイル変更
- [ ] ユーザープロフィール設定
- [ ] 送信キー設定（Enter/Ctrl+Enter）
- [ ] 設定リセット・全データクリア

#### Vision・ファイル
- [ ] 画像ファイル選択・ペースト
- [ ] 複数画像添付
- [ ] テキストファイル添付
- [ ] PDF添付・テキスト抽出
- [ ] ドラッグ＆ドロップ

#### メッセージ操作
- [ ] コピー
- [ ] 削除
- [ ] 再生成（Regenerate）
- [ ] 編集（Edit）

#### モデル管理
- [ ] モデル一覧自動取得・更新
- [ ] Embeddingモデルのフィルタリング
- [ ] Vision対応モデルの表示
- [ ] モデル自動アンロード

#### 高度な機能
- [ ] モデル比較モード
- [ ] 深掘りモード
- [ ] ヘルプモード
- [ ] 信頼度・代替候補表示
- [ ] 医学用語チェック
- [ ] プリセットプロンプト（6種）

#### データ管理
- [ ] 設定の自動保存・読み込み
- [ ] 履歴の自動保存・読み込み
- [ ] エクスポート・インポート
- [ ] ダークモード切替

#### UI/UX
- [ ] レスポンシブデザイン
- [ ] スマートスクロール
- [ ] キーボードショートカット
- [ ] タブ付き設定パネル（基本/応答/詳細）

## デバッグ

### ブラウザコンソールでの確認

```javascript
// 保存されている設定を確認
JSON.parse(localStorage.getItem("localLLMChat_settings"))

// 会話履歴を確認
JSON.parse(localStorage.getItem("localLLMChat_history"))

// プリセットを確認
JSON.parse(localStorage.getItem("localLLMChat_presets"))

// System Promptプリセットを確認
JSON.parse(localStorage.getItem("localLLMChat_systemPromptPresets"))

// 設定をクリア
localStorage.removeItem("localLLMChat_settings")

// 履歴をクリア
localStorage.removeItem("localLLMChat_history")

// 全データクリア
Object.keys(localStorage)
  .filter(k => k.startsWith("localLLMChat_"))
  .forEach(k => localStorage.removeItem(k));
```

### よくある問題

1. **モデル一覧が取得できない**
   - LM Studioが起動しているか確認
   - Base URLが正しいか確認（デフォルト: `http://localhost:1234/v1`）
   - ブラウザコンソールでCORSエラーがないか確認

2. **応答が返ってこない**
   - ブラウザコンソールでエラーを確認
   - LM Studioのログを確認
   - モデルが正しくロードされているか確認

3. **画像が送信できない**
   - Vision対応モデルを選択しているか確認（モデル名に👁️アイコン）
   - 画像サイズが20MB以下か確認

4. **旧バージョンの設定が引き継がれない**
   - `chatHistory_v1.6` 等の旧キーが残っているか確認
   - マイグレーション関数は初回起動時に自動実行される

5. **比較モードでモデルが動かない**
   - LM Studio v0.4.0以降が必要（複数モデル同時ロード対応）
   - 自動アンロード設定がONの場合はOFFにする

## コーディング規約

### 命名規則

- **JavaScript 変数/関数**: camelCase（`sendMessage`, `compareMode`）
- **JavaScript 定数**: UPPER_SNAKE_CASE（`STORAGE_KEYS`, `MAX_HISTORY_FOR_API`）
- **CSS クラス**: BEM（`.message__actions`, `.model-selector--compare`）
- **CSS Custom Properties**: kebab-case（`--color-primary`, `--space-4`）

### コメント

- 各セクションに `// Section N: セクション名` ヘッダーを追加
- セクション間は `// ===...===` 区切り線
- JSDoc型定義を使用

### フォーマット

- インデント: スペース2個
- セミコロン: 使用する
- 文字列: ダブルクォート（HTML属性）、テンプレートリテラル（JS内文字列組み立て）

## 開発バージョン履歴

```
v1.0.0 (2025-11) → 基盤構築（単一HTML、700行、CDN依存）
v1.1.0 (2025-11) → 汎用化（ファイル添付、D&D、名称変更）
v1.3   (2025-12) → オフライン対応（プリセット、CDN排除）
v1.4   (2025-12) → リファクタリング（IIFE化、JSDoc型定義）
v1.6   (2025-12) → 外部ファイル分割（HTML + CSS + JS）
v1.6.1 (2025-12) → Vision表示、編集、深掘り
v1.6.2 (2025-12) → 重複バグ修正、送信キー設定
v1.6.4 (2025-12) → スマートスクロール
v1.6.6 (2026-01) → ヘルプモード
v1.6.7 (2026-01) → 信頼度表示、インポート
v1.6.8 (2026-01) → 新しい話題ボタン
v1.7.0 (2026-02) → モデル比較機能（目玉機能）
v1.7.1 (2026-02) → localStorageキー名変更、マイグレーション
v1.7.2 (2026-02) → 医学用語チェック、System Promptプリセット
v1.7.3 (2026-02) → モデル自動アンロード、重複応答バグ修正
v2.0   (2026-02) → UI刷新（フルスクラッチ再構築、全機能維持）
```

## ライセンス

MIT License - 詳細は [LICENSE](LICENSE) を参照
