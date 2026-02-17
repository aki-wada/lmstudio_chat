# Local LLM Chat v2.1 - 機能仕様書

**文書バージョン**: 2.1
**作成日**: 2026-02-17
**対象**: v2.1（v1.7.3フルスクラッチ再構築 + グラスモーフィズムUI + モデルフィルター）

---

## 目次

1. [プロジェクト概要](#1-プロジェクト概要)
2. [システム要件](#2-システム要件)
3. [機能一覧](#3-機能一覧)
4. [機能詳細仕様](#4-機能詳細仕様)
5. [API仕様](#5-api仕様)
6. [データ永続化仕様](#6-データ永続化仕様)
7. [デフォルト値一覧](#7-デフォルト値一覧)
8. [キーボードショートカット](#8-キーボードショートカット)
9. [ファイル対応形式](#9-ファイル対応形式)
10. [エラーハンドリング](#10-エラーハンドリング)

---

## 1. プロジェクト概要

### 1.1 目的

ローカルで動作するLLMサーバー（LM Studio、Ollama等）と連携するWebベースのチャットインターフェース。完全オフライン動作、プライバシー重視の設計。

### 1.2 対象ユーザー

- 医療従事者（放射線科医、研究者）
- 大学教育関係者
- ローカルLLMを利用する技術者

### 1.3 技術制約

- **単一HTMLファイル + 外部JS/CSS構成**（サーバー不要）
- **ブラウザのみで動作**（Node.js不要）
- **外部ライブラリはすべてローカル同梱**（CDN不使用）
- **localStorageによるデータ永続化**

---

## 2. システム要件

| 項目 | 要件 |
|------|------|
| ブラウザ | Chrome / Firefox / Safari / Edge（モダンブラウザ） |
| LLMサーバー | LM Studio v0.4.0+ 推奨 / Ollama / OpenAI互換API |
| デフォルトURL | `http://localhost:1234/v1` |
| ネットワーク | localhost接続のみ（外部通信なし） |

---

## 3. 機能一覧

### 3.1 コア機能

| ID | 機能名 | 説明 | 優先度 |
|----|--------|------|--------|
| F-01 | チャット送受信 | テキストメッセージの送信とストリーミング応答受信 | 必須 |
| F-02 | モデル選択 | LLMモデルの一覧表示・選択・自動ロード | 必須 |
| F-03 | 設定管理 | 各種パラメータの設定・保存・復元 | 必須 |
| F-04 | 会話履歴管理 | 履歴の保存・表示・エクスポート・インポート | 必須 |
| F-05 | Markdown表示 | AIの応答をMarkdown形式でレンダリング | 必須 |

### 3.2 拡張機能

| ID | 機能名 | 説明 | 優先度 |
|----|--------|------|--------|
| F-06 | 画像添付（Vision） | Vision対応モデルへの画像送信 | 必須 |
| F-07 | ファイル添付 | テキスト/PDFファイルの内容送信 | 必須 |
| F-08 | プリセットプロンプト | 定型プロンプトの挿入・編集・カスタマイズ | 必須 |
| F-09 | 深掘りモード | より詳細な分析を促す応答モード | 必須 |
| F-10 | モデル比較 | 2モデルの同時応答・並列表示 | 必須 |
| F-11 | ヘルプモード | アプリ操作についてLLMに質問 | 必須 |
| F-12 | 信頼度・代替候補表示 | Logprobs APIによる信頼度と代替トークン表示 | 必須 |
| F-13 | 医学用語チェック | AI応答の医学用語正確性チェック | 必須 |
| F-14 | System Promptプリセット | 複数System Promptの保存・切替 | 必須 |
| F-15 | モデル自動アンロード | モデル切替時の前モデル自動アンロード | 必須 |
| F-16 | ダークモード | ライト/ダーク テーマ切替 | 必須 |
| F-17 | スマートスクロール | ストリーミング中の賢いスクロール制御 | 必須 |
| F-18 | 新しい話題 | 会話コンテキストの部分リセット | 必須 |
| F-19 | メッセージ編集 | ユーザーメッセージの編集・再送信 | 必須 |
| F-20 | メッセージ再生成 | AI応答の再生成 | 必須 |
| F-21 | 下書き自動保存 | 入力中テキストの自動保存・復元 | 必須 |
| F-22 | ドラッグ＆ドロップ | 画像のドラッグ＆ドロップ添付 | 必須 |
| F-23 | 画像ペースト | Ctrl+V による画像ペースト | 必須 |

---

## 4. 機能詳細仕様

### F-01: チャット送受信

#### 送信フロー

```
ユーザー入力 → バリデーション → 添付ファイル処理 → API構築 → SSE送信
                                                           ↓
履歴保存 ← UI更新（リアルタイム） ← ストリーミング受信 ←──┘
```

#### 入力バリデーション
- テキストが空かつ添付ファイルなし → 送信不可
- モデル未選択 → アラート表示
- ストリーミング中 → 送信不可（二重送信防止）

#### メッセージ構造（StoredMessage）
```
{
  role: "user" | "assistant" | "system",
  content: string,
  imageData?: string  // DataURL（ユーザー画像のみ）
}
```

#### ストリーミング応答
- Server-Sent Events（SSE）形式で受信
- `data: {"choices":[{"delta":{"content":"..."}}]}` を逐次パース
- `data: [DONE]` で完了
- 応答中は Send ボタン無効化、Stop ボタン有効化
- 部分コンテンツをリアルタイムでDOM更新
- エラー発生時も生成済みコンテンツを保持

#### 応答停止（Stop）
- AbortController で fetch をキャンセル
- 生成済み部分テキストは保持
- 履歴にはユーザーメッセージと部分応答を保存

#### コンテキスト管理
- APIへの送信メッセージ数: **最大6ターン**（MAX_HISTORY_FOR_API = 6）
- System Prompt は毎回先頭に付加
- Response Style / User Profile / Deep Dive / Help は System Prompt に付加
- 全履歴は localStorage に保存（API制限とは独立）

---

### F-02: モデル選択

#### モデル一覧取得
1. **OpenAI互換API** (`GET {baseUrl}/models`): 基本のモデルリスト
2. **LM Studio v1 API** (`GET /api/v1/models`): 拡張情報（state, quantization, max_context_length）

#### モデルリスト自動更新
- ドロップダウンのクリック（mousedown）イベントで自動更新
- スロットリング: 3秒間隔（連続クリック防止）

#### 表示形式
```
[状態アイコン] モデル表示名 [👁️ Vision] [量子化情報]
```
- 🟢: ロード済み
- ⏸️: 未ロード
- 👁️: Vision対応

#### Vision対応判定キーワード（21種）
```
vision, llava, qwen-vl, qwen2-vl, qwen3-vl, pixtral, devstral, magistral,
gemma-3, bakllava, obsidian, moondream, minicpm-v, cogvlm, glm-4v,
internlm-xcomposer, internvl, yi-vl, phi-3-vision, llama-3-vision, mllama
```

#### Embeddingモデルフィルタリング
以下のキーワードを含むモデルはリストから除外:
```
embed, embedding, bge, e5-, gte-, jina
```

#### 自動ロード
- 未ロードモデル選択時 → `POST /api/v1/models/load` で自動ロード
- ロード中は「⏳ モデルをロード中...」表示

#### 自動アンロード（F-15）
- 設定で ON/OFF 可能（デフォルト: OFF）
- モデル切替時に前のモデルを `POST /api/v1/models/unload`
- アンロード失敗時は切替処理を続行（エラーで中断しない）

#### ソート
- モデル表示名のアルファベット順

---

### F-03: 設定管理

#### 設定項目一覧

| 項目 | 型 | デフォルト | 範囲/選択肢 |
|------|-----|----------|------------|
| darkMode | boolean | false | - |
| showLogprobs | boolean | false | - |
| autoUnload | boolean | false | - |
| baseUrl | string | "http://localhost:1234/v1" | - |
| apiKey | string | "lmstudio" | - |
| temperature | number | 0.7 | 0.0 - 2.0（step 0.1） |
| maxTokens | number | 2048 | 1 - 8192 |
| sendKey | string | "enter" | "enter" / "ctrl-enter" |
| responseStyle | string | "standard" | "concise" / "standard" / "detailed" / "professional" |
| userLevel | string | "" | "" / "beginner" / "intermediate" / "advanced" / "expert" |
| userProfession | string | "" | フリーテキスト |
| userInterests | string | "" | フリーテキスト |
| systemPrompt | string | （放射線診断エキスパート） | テキストエリア |
| model | string | "" | モデルリストから選択 |

#### 設定の保存タイミング
- 設定パネルの「← 戻る」ボタンクリック時
- ダークモードトグル変更時（即時保存）

#### デフォルトシステムプロンプト
```
あなたは放射線画像診断、技術、研究のエキスパートアシスタントです。日本語で簡潔でバランスの取れたアドバイスを提供してください。フォーマルとカジュアルのバランスを保ち、専門用語は英語（日本語）の形式で表記してください。
応答の生成の前に、まず質問内容を確認し、医学用語についてユーザの入力に不備があれば、ユーザに確認してください。
```

#### 応答スタイル指示文

| スタイル | System Promptへの付加テキスト |
|----------|---------------------------|
| concise | "要点のみを簡潔に回答してください。箇条書きを推奨します。" |
| standard | （付加なし） |
| detailed | "背景や理由も含めて詳しく説明してください。具体例があれば示してください。" |
| professional | "技術的な詳細を重視し、専門家向けの正確な表現で回答してください。参考文献があれば示してください。" |

#### ユーザープロフィール指示文

各項目が設定されている場合のみ、System Promptに付加:
```
ユーザー情報:
- 専門レベル: {userLevel}
- 職業/専門分野: {userProfession}
- 興味・関心: {userInterests}
上記を考慮して回答してください。
```

---

### F-06: 画像添付（Vision）

#### 対応操作
1. 📷 Image ボタンクリック → ファイル選択ダイアログ
2. Ctrl+V / Cmd+V → クリップボードから画像ペースト
3. ドラッグ＆ドロップ → チャットエリアへドロップ

#### 制限
- 最大ファイルサイズ: **20MB**
- 対応形式: JPG, PNG, GIF, WebP
- 複数画像同時添付可能

#### 処理フロー
1. 画像を DataURL（base64）に変換
2. 添付リストにサムネイル（48×48px）プレビュー表示
3. 送信時、Vision形式のメッセージ構造で API に送信:

```json
{
  "role": "user",
  "content": [
    {"type": "text", "text": "ユーザーのテキスト"},
    {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,..."}}
  ]
}
```

---

### F-07: ファイル添付

#### テキストファイル
- 最大サイズ: **2MB**
- 対応拡張子: `.txt`, `.md`, `.json`, `.csv`, `.xml`, `.html`, `.css`, `.js`, `.ts`, `.py`, `.java`, `.c`, `.cpp`, `.h`, `.hpp`, `.sh`, `.yaml`, `.yml`, `.log`
- メッセージへの埋め込み形式:
```
[File: filename.txt]
<ファイル内容>
```

#### PDFファイル
- 最大サイズ: **10MB**
- pdf.js によるテキスト抽出（全ページ結合）
- メッセージへの埋め込み形式:
```
[File: document.pdf]
<抽出テキスト>
```

#### 複数ファイル同時添付
- 画像・テキスト・PDF の混在対応
- 添付リストで個別削除可能

---

### F-08: プリセットプロンプト

#### デフォルトプリセット（6種）

| キー | ラベル | 用途 |
|------|--------|------|
| disease | 🏥 疾患解説 | 疾患の包括的解説（疫学、病態生理、画像所見、鑑別、治療、予後） |
| ddx | 💊 鑑別診断 | Top3鑑別診断＋信頼度＋ダークホース1つ |
| review | 📝 論文査読 | Strengths/Weaknesses各3点＋5段階評価5項目＋判定 |
| stats | 📈 統計解析 | データに対する適切な統計検定の推奨 |
| email | ✉️ 英文メール作成 | 件名＋本文＋代替件名 |
| pdf | 📄 文章要約 | 箇条書き要約 |

#### プリセット操作
- **挿入**: プリセットパネルからクリック → テキストエリアに挿入
- **編集**: 設定パネルのプリセット編集セクション
- **追加**: 新規プリセット名を入力して「＋ 追加」
- **削除**: 個別削除 / 全リセット
- **デフォルト復元**: 個別復元 / 全リセット

#### カスタムプリセットの保存
- `localLLMChat_presets`: カスタム文面
- `localLLMChat_presetLabels`: カスタムラベル

---

### F-10: モデル比較

#### 動作仕様
1. 📊 比較ボタンで比較モード ON/OFF
2. ON時: 2つ目のモデル選択ドロップダウンを表示
3. メッセージ送信時、同じテキストを2モデルに**並列送信** (`Promise.all`)
4. サイドバイサイドでリアルタイムストリーミング表示

#### 表示形式
- **左側（Model A）**: メインモデル（青系ヘッダー）
- **右側（Model B）**: 比較モデル（黄系ヘッダー）
- モバイル（768px以下）: 縦並び表示

#### 履歴保存
- **メインモデルの応答のみ保存**（比較は一時的参照用）

#### 制約
- 比較モード使用時は自動アンロード（F-15）をOFFにすること
- 2モデルが同時ロードされている必要あり

---

### F-12: 信頼度・代替候補表示

#### 有効化
- 設定パネルの「📊 信頼度・代替候補を表示」トグル
- LM Studio v0.3.39+ 必要

#### API
- Open Responses API (`POST {baseUrl}/responses`) を使用
- 非ストリーミング、JSON応答
- logprobs データを含む

#### 信頼度表示
- ログ確率から計算したパーセンテージ
- 色分け:
  - 80%以上: 緑（高信頼度）
  - 50-80%: 黄（中信頼度）
  - 50%未満: 赤（低信頼度）
- アニメーション付きバー表示

#### 代替候補表示
- 各トークン位置で検討された代替候補
- 候補名と確率を表示

---

### F-13: 医学用語チェック

#### トリガー
- AI応答メッセージの「🏥 Check」ボタンをクリック

#### 処理フロー
1. 対象メッセージのテキストを取得
2. 専用のJSON応答プロンプトでLLMに送信（Temperature: 0.3）
3. JSON応答をパース（マークダウンコードブロック対応）
4. モーダルダイアログで結果表示

#### 応答構造
```json
{
  "hasIssues": true/false,
  "issues": [
    {
      "original": "不正確な用語",
      "suggested": "正確な用語",
      "reason": "修正理由"
    }
  ],
  "correctedText": "修正後のテキスト全文（optional）"
}
```

#### モーダルUI
- 問題なし: 「問題は検出されませんでした」
- 問題あり: 各指摘事項を表示（原文→修正案＋理由）
- 修正テキストがある場合: 「修正して送信」ボタン表示

---

### F-14: System Promptプリセット

#### 操作
- ドロップダウンでプリセット選択 → System Prompt テキストエリアに適用
- 💾 保存: 現在の System Prompt を新規プリセットとして保存（名前入力ダイアログ）
- 🗑 削除: 選択中のプリセットを削除

#### デフォルトプリセット
- 「放射線診断エキスパート」（デフォルトSystem Prompt）

#### 保存先
- `localLLMChat_systemPromptPresets`

---

### F-18: 新しい話題

#### 動作仕様
1. 🆕 ボタンクリック
2. API送信用の会話履歴を**クリア**
3. 画面上の会話は**保持**
4. 区切り線（トピックセパレータ）を表示
5. localStorage の履歴にセパレータを記録

#### 区切り線のデザイン
- 水平線＋中央テキスト「新しい話題」
- グラデーション線 + ティール背景のピル型ラベル

---

### F-17: スマートスクロール

#### 動作仕様
- ストリーミング中、ユーザーが上方向にスクロール → 自動スクロール**停止**
- ユーザーが下部（150px以内）に戻る → 自動スクロール**再開**
- ストリーミング完了時 → 自動スクロール再開

---

## 5. API仕様

### 5.1 OpenAI互換API

#### モデル一覧
```
GET {baseUrl}/models
Authorization: Bearer {apiKey}
```

#### チャット送信（ストリーミング）
```
POST {baseUrl}/chat/completions
Authorization: Bearer {apiKey}
Content-Type: application/json

{
  "model": "モデルID",
  "messages": [...],
  "stream": true,
  "temperature": 0.7,
  "max_tokens": 2048
}
```

#### Open Responses API（信頼度表示用）
```
POST {baseUrl}/responses
Authorization: Bearer {apiKey}
Content-Type: application/json

{
  "model": "モデルID",
  "instructions": "System Prompt",
  "input": [{"role": "user", "content": "..."}],
  "temperature": 0.7,
  "max_output_tokens": 2048
}
```

### 5.2 LM Studio v1 ネイティブAPI

#### 全モデル一覧（state付き）
```
GET /api/v1/models
```
Response:
```json
{
  "data": [
    {
      "id": "model-name",
      "state": "loaded" | "not-loaded",
      "quantization": "Q4_K_M",
      "max_context_length": 8192
    }
  ]
}
```

#### モデルロード
```
POST /api/v1/models/load
Content-Type: application/json
{"instance_id": "model-id"}
```

#### モデルアンロード
```
POST /api/v1/models/unload
Content-Type: application/json
{"instance_id": "model-id"}
```

---

## 6. データ永続化仕様

### 6.1 localStorageキー

| キー | 型 | 内容 |
|------|-----|------|
| `localLLMChat_history` | JSON Array | 会話履歴（StoredMessage[]） |
| `localLLMChat_settings` | JSON Object | 全設定値 |
| `localLLMChat_presets` | JSON Object | カスタムプリセット文面 |
| `localLLMChat_presetLabels` | JSON Object | カスタムプリセットラベル |
| `localLLMChat_draft` | string | 入力中の下書き |
| `localLLMChat_systemPromptPresets` | JSON Object | System Promptプリセット |

### 6.2 レガシーキーマイグレーション

旧キーが存在し新キーが空の場合、自動移行:

| 旧キー | 新キー |
|--------|--------|
| `chatHistory_v1.6` | `localLLMChat_history` |
| `chatSettings_v1.6` | `localLLMChat_settings` |
| `chatPresets_v1.6` | `localLLMChat_presets` |
| `chatDraft_v1.6` | `localLLMChat_draft` |
| `chatPresetLabels_v1.6` | `localLLMChat_presetLabels` |

### 6.3 下書き自動保存
- 300ms デバウンスで自動保存
- 送信成功時にクリア
- ページリロード時に復元

---

## 7. デフォルト値一覧

| 項目 | デフォルト値 |
|------|------------|
| Base URL | `http://localhost:1234/v1` |
| API Key | `lmstudio` |
| Temperature | 0.7 |
| Max Tokens | 2048 |
| Send Key | Enter で送信 |
| Response Style | standard |
| Dark Mode | OFF |
| Show Logprobs | OFF |
| Auto Unload | OFF |
| MAX_HISTORY_FOR_API | 6 |
| ドラフト保存間隔 | 300ms |
| モデル一覧更新スロットリング | 3秒 |
| スクロール閾値 | 150px |

---

## 8. キーボードショートカット

| ショートカット | 動作 | 条件 |
|---------------|------|------|
| Enter | 送信 | sendKey = "enter" |
| Ctrl/Cmd + Enter | 送信 | sendKey = "ctrl-enter" |
| Shift + Enter | 改行 | 常時 |
| Ctrl/Cmd + V | 画像ペースト | 常時 |
| Ctrl/Cmd + K | 履歴クリア | 常時 |
| Esc | パネルを閉じる | 設定/プリセットパネル開時 |

---

## 9. ファイル対応形式

### 画像
| 形式 | 上限 |
|------|------|
| JPEG, PNG, GIF, WebP | 20MB |

### テキスト
| 拡張子 | 上限 |
|--------|------|
| .txt, .md, .json, .csv, .xml, .html, .css, .js, .ts, .py, .java, .c, .cpp, .h, .hpp, .sh, .yaml, .yml, .log | 2MB |

### PDF
| 形式 | 上限 |
|------|------|
| .pdf | 10MB |

---

## 10. エラーハンドリング

### API接続エラー
- 「接続できません。LM Studioが起動しているか確認してください。」をシステムメッセージで表示

### ストリーミングエラー
- 生成済みコンテンツを**保持**
- エラーメッセージを末尾に追記
- `dataset.partialContent` で生成中コンテンツを追跡

### ファイルサイズ超過
- 「ファイルサイズが制限を超えています（上限: XXX MB）」アラート

### モデルロード失敗
- エラーメッセージをアラート表示
- ロード中表示を解除

### インポートバリデーション
- JSON構造チェック（messages配列の存在、role/contentの存在）
- 不正なデータは拒否してアラート表示
