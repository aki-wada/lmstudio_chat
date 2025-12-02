# CLAUDE.md - lmstudio_chat

このファイルはClaude Codeへの指示を記載しています。

## プロジェクト概要

LM Studio用のWebベースチャットインターフェース。単一HTMLファイルで動作し、ローカルLLMとの対話が可能。

## 技術スタック

- HTML5, CSS3, Vanilla JavaScript (ES6+)
- marked.js (Markdown rendering)
- PDF.js (PDF text extraction)
- OpenAI互換API (LM Studio)

## Git運用ルール

- 機能追加・修正のたびにコミットすること
- コミットメッセージは変更内容を明確に記述
- 日本語のコミットメッセージも可
- 作業完了後は `git push` でGitHubに反映

## 主要ファイル

- `local_llm_chat.html` - メインアプリケーション
- `local_llm_chat_pdf.html` - PDF対応版
- `lmstudio_chat_auto_models.html` - レガシー版

## 開発時の注意

- LM Studioが `http://localhost:1234` で起動している必要あり
- VisionモデルでPDF画像認識する場合は30B以上推奨
