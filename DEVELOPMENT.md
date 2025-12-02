# 開発ドキュメント

LM Studio Chat の開発に関する技術情報とガイドライン

## プロジェクト構造

```
lmstudio_chat/
├── lmstudio_chat_auto_models.html  # メインアプリケーション（~700行）
├── MANUAL.md                        # ユーザーマニュアル
├── README.md                        # プロジェクト概要
├── CHANGELOG.md                     # 変更履歴
├── DEVELOPMENT.md                   # このファイル
├── LICENSE                          # MIT License
└── .gitignore                       # Git除外設定
```

## アーキテクチャ

### 技術スタック

- **HTML5**: セマンティックマークアップ
- **CSS3**: フレキシブルレイアウト、ダークモードサポート
- **JavaScript (ES6+)**: Vanilla JS（フレームワーク不使用）
- **外部依存**: marked.js（CDN経由でMarkdownレンダリング）

### データフロー

```
User Input → JavaScript → API Request → LM Studio
                ↓                           ↓
         localStorage ←───────────── Streaming Response
                ↓
           UI Update
```

### 主要コンポーネント

#### 1. 設定管理（Settings Management）

**ファイル内位置**: 行 173-246

```javascript
// 設定の保存と読み込み
- localStorage.getItem(SETTINGS_KEY)
- localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))

// 設定項目
- baseUrl, apiKey, model
- temperature, maxTokens
- systemPrompt, responseStyle
- userLevel, userProfession, userInterests
- darkMode
```

#### 2. メッセージ管理（Message Management）

**ファイル内位置**: 行 218-297

```javascript
// メッセージの追加と表示
appendMessage(role, content, save, imageData)

// メッセージアクション
- Copy: クリップボードにコピー
- Delete: 個別削除
- Regenerate: AI応答の再生成（assistantのみ）
```

#### 3. モデル同期（Model Synchronization）

**ファイル内位置**: 行 310-359

```javascript
// /v1/models エンドポイントから自動取得
async function refreshModels()

// フォールバック順序
1. 保存済みモデル
2. google/gemma-3-12b
3. llama-3.1-swallow-8b-instruct-v0.5
4. qwen/qwen3-4b-2507
5. リストの最初
```

#### 4. 会話構築（Conversation Building）

**ファイル内位置**: 行 396-452

```javascript
function buildConversation()

// システムプロンプト構成
基本プロンプト + 応答スタイル + ユーザープロフィール

// コンテキスト管理
- 直近12メッセージのみをAPIに送信
- system, user, assistant の交互パターンを維持
```

#### 5. ストリーミング応答（Streaming Response）

**ファイル内位置**: 行 420-530

```javascript
// Server-Sent Events (SSE) でリアルタイム応答
const res = await fetch(`${base}/chat/completions`, {
  method: "POST",
  body: JSON.stringify({
    model,
    messages: [...buildConversation(), userMessage],
    stream: true,
    temperature,
    max_tokens
  }),
  signal: controller.signal  // AbortController for stopping
});

// ReadableStream で逐次処理
const reader = res.body.getReader();
```

#### 6. Vision API 対応（Vision Support）

**ファイル内位置**: 行 596-665

```javascript
// 画像のbase64エンコード
FileReader.readAsDataURL(file)

// マルチモーダルメッセージ形式
{
  role: "user",
  content: [
    { type: "text", text: "..." },
    { type: "image_url", image_url: { url: "data:image/..." } }
  ]
}
```

## データモデル

### Message Object

```javascript
{
  role: "user" | "assistant" | "system",
  content: string,
  imageData?: string  // base64-encoded image
}
```

### Settings Object

```javascript
{
  baseUrl: string,
  apiKey: string,
  model: string,
  temperature: number,      // 0.0-2.0
  maxTokens: number,        // 1-8192
  systemPrompt: string,
  responseStyle: "concise" | "standard" | "detailed" | "professional",
  userLevel: "" | "beginner" | "intermediate" | "advanced" | "expert",
  userProfession: string,
  userInterests: string,
  darkMode: boolean
}
```

## 主要機能の実装詳細

### 応答スタイル機能

```javascript
// スタイルに応じた指示を生成
function getResponseStyleInstruction() {
  const styleInstructions = {
    concise: "簡潔に要点のみを述べてください...",
    standard: "",  // 追加の指示なし
    detailed: "詳細な説明を心がけてください...",
    professional: "専門的で技術的な詳細を重視してください..."
  };
  return styleInstructions[style] || "";
}
```

### ユーザープロフィール機能

```javascript
// プロフィール情報からシステムプロンプトを生成
function getUserProfileInstruction() {
  let profile = "\n\n【ユーザー情報】";

  // 専門レベルに応じた指示
  if (level === "beginner") {
    profile += "\n- 専門用語を避け、基礎から丁寧に説明してください。";
  }

  // 職業/専門分野、興味・関心を追加
  if (profession) profile += `\n- 職業/専門分野: ${profession}`;
  if (interests) profile += `\n- 興味・関心: ${interests}`;

  return profile;
}
```

### ダークモード実装

```css
/* CSS変数を使用せず、直接スタイル指定 */
body.dark-mode {
  background: #1a1a1a;
  color: #e0e0e0;
}

body.dark-mode .assistant {
  background: #2d2d2d;
  border: 1px solid #444;
  color: #e0e0e0;
}
```

```javascript
// トグル処理
darkModeToggle.onchange = () => {
  if (darkModeToggle.checked) {
    document.body.classList.add("dark-mode");
  } else {
    document.body.classList.remove("dark-mode");
  }
  saveSettings();
};
```

## localStorage 使用状況

### ストレージキー

```javascript
const STORAGE_KEY = "chatHistory_auto_models";    // 会話履歴
const SETTINGS_KEY = "chatSettings_auto_models";  // 設定情報
```

### データサイズ考慮事項

- localStorage の一般的な上限: 5-10MB
- base64画像データはサイズが大きくなる可能性あり
- 直近12メッセージのみをAPIに送信することでコンテキスト長を制限

## API 仕様

### エンドポイント

```
GET  /v1/models              # モデル一覧取得
POST /v1/chat/completions    # チャット応答生成（ストリーミング）
```

### リクエスト例

```json
{
  "model": "llama-3.1-swallow-8b-instruct-v0.5",
  "messages": [
    {
      "role": "system",
      "content": "You are a helpful assistant."
    },
    {
      "role": "user",
      "content": "Hello!"
    }
  ],
  "stream": true,
  "temperature": 0.7,
  "max_tokens": 2048
}
```

### レスポンス形式（ストリーミング）

```
data: {"choices":[{"delta":{"content":"Hello"}}]}
data: {"choices":[{"delta":{"content":" there"}}]}
data: [DONE]
```

## セキュリティ考慮事項

1. **ローカル実行**: すべての処理がローカル環境で完結
2. **データ保存**: ブラウザのlocalStorageのみ使用（外部サーバーには送信しない）
3. **API通信**: LM Studioへの通信はlocalhostのみ
4. **XSS対策**: marked.jsによるMarkdown変換（サニタイズ済み）

## パフォーマンス最適化

1. **ストリーミング**: 逐次的に応答を表示（全体の待機時間を短縮）
2. **コンテキスト制限**: 直近12メッセージのみを送信
3. **イベント委譲**: メッセージアクションボタンにイベント委譲を使用せず、個別に設定
4. **画像サイズ制限**: 20MB以下に制限

## テスト

### 手動テスト項目

#### 基本機能
- [ ] メッセージ送信
- [ ] ストリーミング応答表示
- [ ] 応答の停止
- [ ] 履歴のクリア

#### 設定機能
- [ ] Temperature変更
- [ ] Max Tokens変更
- [ ] System Prompt変更
- [ ] 応答スタイル変更
- [ ] ユーザープロフィール設定

#### Vision機能
- [ ] 画像ファイル選択
- [ ] 画像ペースト
- [ ] 画像削除
- [ ] 画像付きメッセージ送信

#### UI/UX
- [ ] ダークモード切り替え
- [ ] レスポンシブデザイン
- [ ] キーボードショートカット
- [ ] メッセージアクション（コピー、削除、再生成）

#### データ永続化
- [ ] 設定の自動保存・読み込み
- [ ] 履歴の自動保存・読み込み
- [ ] 履歴のエクスポート

## デバッグ

### ブラウザコンソールでの確認

```javascript
// 保存されている設定を確認
JSON.parse(localStorage.getItem("chatSettings_auto_models"))

// 会話履歴を確認
JSON.parse(localStorage.getItem("chatHistory_auto_models"))

// 設定をクリア
localStorage.removeItem("chatSettings_auto_models")

// 履歴をクリア
localStorage.removeItem("chatHistory_auto_models")
```

### よくある問題

1. **モデル一覧が取得できない**
   - LM Studioが起動しているか確認
   - Base URLが正しいか確認（http://localhost:1234/v1）

2. **応答が返ってこない**
   - ブラウザのコンソールでエラーを確認
   - LM Studioのログを確認
   - モデルが正しくロードされているか確認

3. **画像が送信できない**
   - Vision対応モデルを選択しているか確認
   - 画像サイズが20MB以下か確認

## 貢献ガイドライン

### コーディング規約

1. **命名規則**
   - 変数: camelCase
   - 定数: UPPER_SNAKE_CASE
   - 関数: camelCase

2. **コメント**
   - 各セクションに `/* === セクション名 === */` を追加
   - 複雑なロジックには説明コメントを追加

3. **フォーマット**
   - インデント: スペース2個
   - セミコロン: 使用する

### 機能追加の流れ

1. 要件定義
2. 実装
3. テスト
4. ドキュメント更新（MANUAL.md, CHANGELOG.md）
5. コミット

## 今後の開発予定

### 短期（v1.1.0）
- [ ] 会話履歴のJSONインポート機能
- [ ] メッセージ検索機能
- [ ] カスタムテーマのサポート

### 中期（v1.2.0）
- [ ] 会話のフォルダ分類
- [ ] 音声入力対応
- [ ] プラグインシステム

### 長期（v2.0.0）
- [ ] 複数会話の同時管理
- [ ] クラウド同期オプション
- [ ] モバイルアプリ版

## ライセンス

MIT License - 詳細は [LICENSE](LICENSE) を参照

---

開発に関する質問や提案がある場合は、Issueを作成してください。
