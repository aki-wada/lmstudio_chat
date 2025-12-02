# Changelog

All notable changes to Local LLM Chat will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

- [1.1.0] - 2025-11-29 - アプリ名変更、ファイル添付、ドラッグ＆ドロップ対応、UI改善
- [1.0.0] - 2025-11-23 - 初回リリース
