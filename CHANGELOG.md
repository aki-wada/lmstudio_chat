# Changelog

All notable changes to Local LLM Chat will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.6.3] - 2025-12-23

### Changed
- **バージョン番号整理** - v1.6.2 から v1.6.3 へ移行
  - 内容は v1.6.2 と同一

---

## [1.6.2] - 2025-12-23

### Fixed
- **重複メッセージ送信バグ** - 同じメッセージがAPIに2回送信される問題を修正
  - UI表示用と履歴保存用のメッセージ処理を分離
  - `save: false`オプションでUI表示時は履歴に保存しないように修正
- **ストリーミングエラー時のコンテンツ消失** - 応答生成中にエラーが発生しても部分コンテンツを保持
  - `dataset.partialContent`で生成中のコンテンツを追跡
  - エラー発生時は生成済み内容を保持し、エラーメッセージを追記
- **キャッシュバスティング追加** - JS/CSSファイルにバージョンパラメータを追加
  - ブラウザキャッシュによる古いコードの実行を防止

### Added
- **送信キー設定** - Enter送信とCtrl+Enter送信を設定で切り替え可能
  - 「Enter で送信」: 従来通りEnterで送信、Shift+Enterで改行
  - 「Ctrl+Enter で送信」: Enterで改行、Ctrl+Enter（Mac: Cmd+Enter）で送信
- **デバッグログ機能** - 開発者向けのコンソールログ出力
  - `loadHistory`, `persistHistory`, `buildConversation`, API送信時のログ

---

## [1.6.1] - 2025-12-22

### Added
- **Vision対応モデル表示** - モデルドロップダウンにVision対応モデルを👁️アイコンで表示
  - 対応キーワード: vision, llava, gemma-3, pixtral, devstral, magistral, qwen3-vl, qwen2-vl, など
- **モデル一覧のアルファベット順ソート** - 見つけやすさ向上
- **画像サムネイルプレビュー** - 添付画像を48x48pxのサムネイルで表示
- **メッセージ編集機能** - ユーザーメッセージの✏️ Editボタンで編集・再送信可能
- **深掘りモード** - 🔍深掘りボタンでより詳細で分析的な回答を促す
  - 多角的分析、根本原因、異なる視点、関連概念、実践的応用を含む回答

---

## [1.6] - 2025-12-22

### Added
- **設定リセット機能** - 設定をデフォルトに戻すボタン
- **全データクリア機能** - すべての保存データを削除するボタン
- **複数ファイル添付** - 画像・ファイルを複数同時に添付可能

### Changed
- **外部ファイル分割** - HTML + CSS + JS構成（保守性向上）
- **日本語化システムプロンプト** - 放射線画像診断向けデフォルトプロンプト
- **ヘッダーレイアウト変更** - タイトル中央、モデル選択、ボタン群の3段構成
- **送信ボタン変更** - 「🚀 Send」に統一

### Technical Details
- ファイル構成: `lmstudio_chat_v1.6/` ディレクトリ
- localStorageキー: `chatHistory_v1.6`, `chatSettings_v1.6`, `chatPresets_v1.6`

---

## [1.4] - 2025-12-18

### Changed
- **コードリファクタリング** - 保守性・可読性の大幅向上
  - IIFE（即時実行関数式）でグローバルスコープ汚染を防止
  - JSDoc による型定義の追加（StoredMessage, Settings 等）
  - 定数の一元管理（STORAGE_KEYS, LIMITS, EMBEDDING_KEYWORDS）
  - DOM参照を `el` オブジェクトに集約（Single Source of Truth）
  - 状態管理を `runtime`, `attach` オブジェクトに分離
  - 機能ごとにセクション分割（Settings, Chat UI, SSE, Presets 等）
  - SSE処理を `consumeSSE()` 関数に抽出
  - イベント配線を `wireSettingsEvents()` 等に分離
  - `Object.freeze()` による定数の不変性保証

### Technical Details
- HTML + 外部アセット構成（変更なし）
- データ保存: localStorage（キー: `chatHistory_v1.4`, `chatSettings_v1.4`, `chatPresets_v1.4`）

---

## [1.3] - 2025-12-17

### Added
- **プリセットプロンプト機能** - 📋 Preset ボタンで構造化テンプレートを挿入（6種類）
  - 🏥 疾患解説、💊 鑑別診断、📄 文章要約
  - 📝 論文査読、🔬 リサーチデザイン、📈 統計解析
- **プリセット編集機能** - Settings パネルでプリセット内容をカスタマイズ可能
- **完全オフライン対応** - 外部ライブラリをローカルに同梱
  - `assets/app.css` - スタイルシート
  - `assets/marked.min.js` - Markdown レンダリング
  - `assets/pdf.min.js` - PDF テキスト抽出
  - `assets/pdf.worker.min.js` - PDF.js Worker

### Changed
- ファイル名を `local_llm_chat_v1.3.html` に変更
- CDN依存を完全に排除（閉域ネットワーク対応）
- スタイルシートを外部ファイル化（app.css）

### Technical Details
- HTML + 外部アセット構成
- 外部依存: marked.js, PDF.js（すべてローカル同梱）
- データ保存: localStorage（キー: `chatHistory_v1.3`, `chatSettings_v1.3`）

---

## [1.1.0] - 2025-11-29

### Added
- ファイル添付機能を追加（📎 File ボタン）
  - 対応形式: .txt, .md, .json, .csv, .xml, .html, .css, .js, .ts, .py, .java, .c, .cpp, .h, .hpp, .sh, .yaml, .yml, .log, .pdf
  - テキストファイルは内容をメッセージに含めて送信
  - PDFファイルのテキスト抽出に対応（PDF.jsを使用）
    - PDFからテキストを抽出してメッセージに含める
    - 抽出に失敗した場合はファイル名のみを送信
- 画像のドラッグ＆ドロップに対応
  - ウィンドウ内に画像をドロップして添付可能
  - ドラッグ中は画面が薄くなり、ドロップ可能であることを視覚的に表示
- Settings パネルに「← 戻る」ボタンを追加
- 埋め込みモデル（text embedding model）の自動フィルタリング
  - チャットに使用できない埋め込みモデルをモデル一覧から自動除外
  - 除外キーワード: embed, embedding, bge, e5-, gte-, jina
- Settings の各項目に説明文を追加
  - Temperature: 「※ 低いと安定、高いと創造的」
  - Base URL: デフォルト値を付記

### Changed
- アプリ名を「LM Studio Chat」から「Local LLM Chat」に変更
- ファイル名を `lmstudio_chat_auto_models.html` から `local_llm_chat.html` に変更
- OpenAI 互換 API をサポートするすべてのローカル LLM サーバーに対応
- ヘッダーレイアウトを2段構成に変更
  - 1段目: タイトル + モデル選択 + Refresh
  - 2段目: Clear + Export + Settings
- 入力エリアのレイアウトを変更
  - 左側: 📷 Image + 📎 File
  - 中央: テキスト入力
  - 右側: 送信 + ⏹ Stop
- Base URL、API Key を Settings パネル内に移動（UI簡略化）

### Fixed
- ストリーミング応答のコピー機能が正しく動作しない問題を修正
  - `dataset.content` を使用してコピーするように変更
  - ストリーミング完了時に `dataset.content` を更新するように修正

---

## [1.0.0] - 2025-11-23

### Added

#### ユーザープロフィール機能
- 専門レベルの設定（指定なし/初心者/中級者/上級者/専門家）
- 職業/専門分野の入力
- 興味・関心の入力
- プロフィール情報に基づいた応答の最適化
- プロフィール情報の自動保存（localStorage）

#### 応答スタイルカスタマイズ
- 4つの応答スタイル（簡潔/標準/詳細/専門的）
- システムプロンプトへの自動統合
- 応答スタイルの記憶機能

#### 基本機能
- LM Studio との自動モデル同期
- ストリーミング応答（Server-Sent Events）
- Vision API 対応（画像入力・ペースト）
- マルチモーダルメッセージ送信
- ダークモード
- メッセージ管理（コピー、削除、再生成）
- 会話履歴の永続化（localStorage）
- 会話履歴の JSON エクスポート

#### UI/UX
- レスポンシブデザイン
- 入力欄の自動拡張
- キーボードショートカット
  - `Enter`: メッセージ送信
  - `Shift + Enter`: 改行
  - `Ctrl/Cmd + V`: 画像ペースト
  - `Ctrl/Cmd + K`: 履歴クリア
  - `Esc`: 設定パネルを閉じる

#### 設定機能
- Temperature 調整（0.0-2.0）
- Max Tokens 設定（1-8192）
- System Prompt カスタマイズ
- Base URL / API Key 設定
- すべての設定の自動保存

### Fixed
- 日本語 IME 変換中の誤送信防止
- 入力欄の強制クリア処理
- モデル選択の状態管理

### Technical Details
- 単一 HTML ファイル構成（約 700 行）
- 外部依存: marked.js（CDN 経由）
- データ保存: localStorage
- API: OpenAI 互換 API（LM Studio）

---

## [Unreleased]

### 計画中の機能
- 会話履歴の JSON インポート機能
- カスタムテーマのサポート
- 会話のフォルダ分類
- メッセージの検索機能
- 音声入力対応

---

## リリースノート形式

各バージョンは以下のカテゴリで分類されます：

- `Added`: 新機能
- `Changed`: 既存機能の変更
- `Deprecated`: 非推奨となった機能
- `Removed`: 削除された機能
- `Fixed`: バグ修正
- `Security`: セキュリティ関連の修正

---

**バージョン履歴**

- [1.6.3] - 2025-12-23 - v1.6.2 からのバージョン番号整理
- [1.6.2] - 2025-12-23 - 重複メッセージバグ修正、送信キー設定、デバッグログ
- [1.6.1] - 2025-12-22 - Vision対応表示、メッセージ編集、深掘りモード
- [1.6] - 2025-12-22 - 設定リセット、複数ファイル添付、外部ファイル分割
- [1.4] - 2025-12-18 - コードリファクタリング、保守性向上
- [1.3] - 2025-12-17 - プリセットプロンプト機能、完全オフライン対応
- [1.1.0] - 2025-11-29 - アプリ名変更、ファイル添付、ドラッグ＆ドロップ対応、UI改善
- [1.0.0] - 2025-11-23 - 初回リリース
