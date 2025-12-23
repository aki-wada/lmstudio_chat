# CLAUDE.md - lmstudio_chat

このファイルはClaude Codeへの指示を記載しています。

## プロジェクト概要

Local LLM Chatは、ローカルで動作するLLMサーバー（LM Studio、Ollamaなど）と連携するWebベースのチャットインターフェースです。

## 開発方針（2025-12-23更新）

**アクティブ開発版**: `lmstudio_chat_v1.6.3/` - 今後の改良・修正はこのバージョンで行う

**保持版（変更しない）**:
- `local_llm_chat_v2.1/` - モジュール分割版（参照用として保持）
- `lmstudio_chat_v1.5/` - v1.6のベース版

### v1.6.3の特徴
- v1.5の外観・UIを維持
- 外部ファイル分割（HTML + CSS + JS）
- v2.1から移植した機能:
  - 設定リセット機能
  - 全データクリア機能
  - 日本語化システムプロンプト
  - 複数ファイル添付対応
- v1.6.1で追加:
  - Vision対応モデル表示（👁️アイコン）
  - 画像サムネイルプレビュー
  - メッセージ編集機能
  - 深掘りモード
- v1.6.2でバグ修正・機能追加:
  - 重複メッセージ送信バグの修正
  - ストリーミングエラー時のコンテンツ保持
  - キャッシュバスティング追加
  - 送信キー設定（Enter / Ctrl+Enter）
  - デバッグログ機能

## 技術スタック

- **HTML5, CSS3, Vanilla JavaScript (ES6+)**
- **アーキテクチャ**: IIFE（即時実行関数式）によるモジュール分割
- **外部ライブラリ**: marked.js (Markdown rendering), PDF.js (PDF text extraction) - すべてローカル同梱
- **API**: OpenAI互換API (LM Studio, Ollamaなど)

## プロジェクト構造

### v1.6.3（アクティブ開発版）
```
lmstudio_chat_v1.6.3/
├── local_llm_chat_v1.6.3.html  # メインアプリケーション
├── MANUAL.md                    # ユーザーマニュアル
├── assets/                      # 外部ライブラリ（CSS, marked.js, pdf.js）
└── js/
    └── app.js                   # メインJavaScript
```

### v2.1（保持版）
```
local_llm_chat_v2.1/
├── local_llm_chat_v2.1.html   # メインアプリケーション
├── assets/                     # 外部ライブラリ
├── css/                        # スタイルシート（8ファイル）
└── js/                         # JavaScriptモジュール（17ファイル）
```

### レガシー版（参照用）
- `lmstudio_chat_v1.5/` - v1.6のベース版
- `local_llm_chat.html` - 初期レガシー版

## Git運用ルール

- 機能追加・修正のたびにコミットすること
- コミットメッセージは変更内容を明確に記述
- 日本語のコミットメッセージも可
- 作業完了後は `git push` でGitHubに反映

## 開発時の注意

- LM Studioが `http://localhost:1234` で起動している必要あり
- VisionモデルでPDF画像認識する場合は30B以上推奨
- v2.0はモジュール分割されているため、HTMLファイルとjs/cssフォルダの両方を編集する必要がある場合がある

## 開発環境

- **エディタ**: 任意のテキストエディタ（VS Code推奨）
- **ブラウザ**: Chrome、Firefox、Safari、Edgeなどのモダンブラウザ
- **LLMサーバー**: LM StudioまたはOllama
- **バージョン管理**: Git

## 開発履歴

v2.0の開発にあたり、以下の方々の協力を得ました：
- **Ryo Nishizawa (西澤 亮 中3)** - v2.0の改善に関する協力と支援

詳細な開発履歴は `CHANGELOG.md` を参照してください。
