# Local LLM Chat v1.7.3 - UI/UXデザイン仕様書

**文書バージョン**: 1.0
**作成日**: 2026-02-15
**目的**: モダンで洗練されたUIへの再設計ガイド

---

## 目次

1. [デザインコンセプト](#1-デザインコンセプト)
2. [カラーシステム](#2-カラーシステム)
3. [タイポグラフィ](#3-タイポグラフィ)
4. [レイアウト設計](#4-レイアウト設計)
5. [コンポーネント仕様](#5-コンポーネント仕様)
6. [ダークモード](#6-ダークモード)
7. [アニメーション・トランジション](#7-アニメーショントランジション)
8. [レスポンシブデザイン](#8-レスポンシブデザイン)
9. [アクセシビリティ](#9-アクセシビリティ)
10. [現行版との変更点一覧](#10-現行版との変更点一覧)

---

## 1. デザインコンセプト

### 1.1 デザイン方針

**「Clean, Calm, Professional」**

現行版からの改善方向:
- **Flat → Soft Elevation**: フラットデザインに控えめなシャドウとグラデーションを追加
- **Dense → Spacious**: 情報密度を下げ、余白（ホワイトスペース）を活用
- **Emoji-heavy → Subtle Icons**: 絵文字中心からSVGアイコン＋ラベルへ
- **Inline Styles → CSS Custom Properties**: インラインスタイルを排除し、CSS変数で一元管理
- **Basic → Polished**: 角丸・シャドウ・トランジションで洗練された印象

### 1.2 デザインリファレンス

参考とするUI:
- **ChatGPT**: サイドバー＋チャットの基本レイアウト
- **Claude.ai**: 洗練された色使い、余白のバランス
- **Linear**: モダンな設定パネル、キーボードファースト
- **Notion**: クリーンな入力エリア、ミニマルなツールバー

### 1.3 現行版の課題

| 課題 | 詳細 | 改善方針 |
|------|------|---------|
| ヘッダーの情報過多 | ボタンが密集、視覚的混雑 | ツールバーの階層化、ドロップダウンメニュー活用 |
| インラインスタイル多用 | HTML内にstyle属性が散在 | CSS Custom Properties + クラスベース |
| 設定パネルが長大 | スクロールが必要な設定パネル | タブ/アコーディオン分割 |
| 色の統一感不足 | 各ボタンの色がバラバラ | カラーパレット統一 |
| モバイル体験の弱さ | 横幅不足時のレイアウト崩れ | モバイルファースト再設計 |

---

## 2. カラーシステム

### 2.1 CSS Custom Properties（カラートークン）

```css
:root {
  /* === Primary === */
  --color-primary-50:  #eff6ff;
  --color-primary-100: #dbeafe;
  --color-primary-200: #bfdbfe;
  --color-primary-300: #93c5fd;
  --color-primary-400: #60a5fa;
  --color-primary-500: #3b82f6;  /* メインアクセント */
  --color-primary-600: #2563eb;
  --color-primary-700: #1d4ed8;
  --color-primary-800: #1e40af;
  --color-primary-900: #1e3a8a;

  /* === Neutral (Gray) === */
  --color-neutral-0:   #ffffff;
  --color-neutral-50:  #f9fafb;
  --color-neutral-100: #f3f4f6;
  --color-neutral-200: #e5e7eb;
  --color-neutral-300: #d1d5db;
  --color-neutral-400: #9ca3af;
  --color-neutral-500: #6b7280;
  --color-neutral-600: #4b5563;
  --color-neutral-700: #374151;
  --color-neutral-800: #1f2937;
  --color-neutral-900: #111827;

  /* === Semantic === */
  --color-success-500: #22c55e;
  --color-success-600: #16a34a;
  --color-warning-500: #f59e0b;
  --color-warning-600: #d97706;
  --color-danger-500:  #ef4444;
  --color-danger-600:  #dc2626;
  --color-info-500:    #06b6d4;
  --color-info-600:    #0891b2;

  /* === Functional === */
  --color-bg-primary:    var(--color-neutral-0);
  --color-bg-secondary:  var(--color-neutral-50);
  --color-bg-tertiary:   var(--color-neutral-100);
  --color-text-primary:  var(--color-neutral-900);
  --color-text-secondary: var(--color-neutral-500);
  --color-text-tertiary: var(--color-neutral-400);
  --color-border:        var(--color-neutral-200);
  --color-border-focus:  var(--color-primary-500);

  /* === Shadows === */
  --shadow-sm:  0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md:  0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);
  --shadow-lg:  0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1);
  --shadow-xl:  0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);

  /* === Spacing === */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;

  /* === Border Radius === */
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-full: 9999px;

  /* === Chat Bubble === */
  --color-user-bubble:      var(--color-primary-500);
  --color-user-bubble-text: #ffffff;
  --color-assistant-bubble:      var(--color-neutral-0);
  --color-assistant-bubble-text: var(--color-neutral-900);
  --color-assistant-bubble-border: var(--color-neutral-200);
}
```

### 2.2 メッセージの色

| ロール | 背景色 | テキスト色 | 配置 |
|--------|--------|-----------|------|
| user | `--color-primary-500` (#3b82f6) | 白 | 右寄せ |
| assistant | 白 + border | `--color-text-primary` | 左寄せ |
| system | `--color-neutral-100` | `--color-text-secondary` | 中央 |

### 2.3 比較モード色

| モデル | ヘッダー背景 | ボーダー |
|--------|-------------|---------|
| Model A | `--color-primary-100` | `--color-primary-300` |
| Model B | `#fef3c7` (amber-100) | `#fcd34d` (amber-300) |

---

## 3. タイポグラフィ

### 3.1 フォントスタック

```css
:root {
  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans JP",
               "Hiragino Kaku Gothic ProN", "Hiragino Sans", Meiryo,
               sans-serif;
  --font-mono: "SF Mono", "Fira Code", "Fira Mono", "Roboto Mono",
               "Noto Sans Mono CJK JP", Menlo, Consolas, monospace;
}
```

### 3.2 タイプスケール

| 用途 | サイズ | 行間 | ウェイト |
|------|--------|------|---------|
| ヘッダータイトル | 1.125rem (18px) | 1.4 | 600 |
| 本文 | 0.9375rem (15px) | 1.6 | 400 |
| メッセージ | 0.9375rem (15px) | 1.65 | 400 |
| ラベル | 0.8125rem (13px) | 1.4 | 500 |
| 注釈・キャプション | 0.75rem (12px) | 1.4 | 400 |
| コードブロック | 0.8125rem (13px) | 1.5 | 400 (mono) |

---

## 4. レイアウト設計

### 4.1 全体構造

```
┌─────────────────────────────────────────────┐
│  Header (Toolbar)                            │
│  ┌─────────────────────────────────────────┐ │
│  │ Logo + Title   │ Model Select │ Actions │ │
│  └─────────────────────────────────────────┘ │
├─────────────────────────────────────────────┤
│                                              │
│              Chat Area                       │
│        (scrollable, flex-grow)               │
│                                              │
│  ┌──────────┐                                │
│  │ Assistant │                                │
│  │ message   │                                │
│  └──────────┘                                │
│                          ┌──────────┐        │
│                          │   User   │        │
│                          │  message │        │
│                          └──────────┘        │
│                                              │
├─────────────────────────────────────────────┤
│  Input Area                                  │
│  ┌─────────────────────────────────────────┐ │
│  │ [Attach] │ Textarea          │ [Send]   │ │
│  │          │                   │ [More]   │ │
│  └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

### 4.2 ヘッダー（Toolbar）

**現行版の課題**: 3行構成でボタンが密集
**改善**: 1行のスリムなツールバー

```
┌────────────────────────────────────────────────┐
│ [≡] Local LLM Chat │ [Model ▼]  │  🆕 🗑 │ ⚙  │
└────────────────────────────────────────────────┘
```

**要素配置**:
- 左: ハンバーガーメニュー（モバイル用） + ロゴ/タイトル
- 中央: モデル選択ドロップダウン（チップ表示、ステータス付き）
- 右: アクションアイコン群 + 設定ボタン

**アクションのグルーピング**:
1. **会話操作**: 新しい話題、クリア
2. **ツールバーメニュー（•••）**: エクスポート、インポート、比較、ヘルプ
   - 使用頻度の低い機能をドロップダウンメニューに格納
3. **設定**: ⚙️ アイコン

**ヘッダーの高さ**: 48-56px（コンパクト）

### 4.3 チャットエリア

**改善ポイント**:
- メッセージの最大幅: **720px**（読みやすさ最適化）
- メッセージ間の余白: **16px**
- チャットエリア左右のパディング: **24px**（デスクトップ）/ **12px**（モバイル）
- メッセージバブルの角丸: **12px**
- アシスタントメッセージ: 左側に小さなアバターアイコン（🤖）を配置

**メッセージバブル**:
```
[User Message]
┌──────────────────────────────┐
│ メッセージテキスト              │
│                              │  ← 右寄せ、青背景、白文字
└──────────────────────────────┘

[Assistant Message]
  🤖
  ┌──────────────────────────────┐
  │ メッセージテキスト              │
  │                              │  ← 左寄せ、白背景、ボーダー
  │ ┌────────────────────────┐   │
  │ │ コードブロック             │   │
  │ └────────────────────────┘   │
  └──────────────────────────────┘
  [📋 Copy] [✏️ Edit] [🔄 Regen] [🏥 Check]  ← ホバー時に表示
```

### 4.4 入力エリア

**現行版の課題**: 左右にボタンが密集、ファイルボタンが大きい

**改善案 - ChatGPT/Claude風の入力デザイン**:

```
┌──────────────────────────────────────────┐
│ ┌──────────────────────────────────────┐ │
│ │ [📎+] メッセージを入力...             │ │
│ │                                      │ │
│ │  [添付ファイルプレビュー]               │ │
│ │                              [▲ Send]│ │
│ └──────────────────────────────────────┘ │
│  [🔍深掘り] [📋Preset]                   │
└──────────────────────────────────────────┘
```

**デザイン詳細**:
- テキストエリアを**カード風のコンテナ**で囲む（角丸 + シャドウ）
- 添付ボタン（📎+）: テキストエリア内の左下に配置（クリックでサブメニュー: 画像/ファイル）
- 送信ボタン: テキストエリア内の右下に配置（入力あるとき青く点灯）
- 深掘り/プリセット: テキストエリア下のミニボタン
- Stopボタン: ストリーミング中のみ Send ボタン位置に切替表示

**テキストエリア**:
- 最小高さ: 44px（1行）
- 最大高さ: 200px
- 自動リサイズ（入力に応じて高さ拡張）
- プレースホルダ: 「メッセージを入力... (Enter で送信)」

### 4.5 設定パネル

**現行版の課題**: 1枚の長いパネルに全設定が並列

**改善案 - スライドオーバー + タブ分割**:

```
                    ┌─────────────────────────┐
                    │ ⚙ 設定            [×]   │
                    ├─────────────────────────┤
                    │ [基本] [応答] [詳細]      │
                    ├─────────────────────────┤
                    │                         │
                    │  (タブに応じた内容)       │
                    │                         │
                    │  ─────────────────       │
                    │  [デフォルトに戻す]        │
                    └─────────────────────────┘
```

**タブ構成**:

| タブ | 含まれる設定 |
|------|------------|
| **基本** | ダークモード、Base URL、API Key、Temperature、Max Tokens、送信キー |
| **応答** | 応答スタイル、ユーザープロフィール（レベル・職業・関心）、System Prompt、System Promptプリセット |
| **詳細** | 信頼度表示、自動アンロード、プリセット編集、データ管理 |

**パネル挙動**:
- 右からスライドイン（アニメーション: 300ms ease-out）
- 背景にオーバーレイ（半透明黒）
- Esc で閉じる
- 幅: 420px（デスクトップ）/ 100%（モバイル）

### 4.6 プリセットパネル

**改善案 - ポップオーバーカード**:

```
              ┌──────────────────────┐
              │ 📋 プリセット         │
              ├──────────────────────┤
              │ ┌──────────────────┐ │
              │ │ 🏥 疾患解説       │ │
              │ └──────────────────┘ │
              │ ┌──────────────────┐ │
              │ │ 💊 鑑別診断       │ │
              │ └──────────────────┘ │
              │ ┌──────────────────┐ │
              │ │ 📝 論文査読       │ │
              │ └──────────────────┘ │
              │ ...                  │
              └──────────────────────┘
                    ▼
            [📋 Preset] ボタン
```

**デザイン**:
- Preset ボタンの上にポップオーバー表示
- 各項目はカード風（ホバーで背景色変化）
- クリックで挿入 → パネル自動クローズ
- 最大高さ: 60vh（スクロール可能）

### 4.7 医学用語チェックモーダル

**改善ポイント**:
- 中央配置のモーダルカード
- 角丸16px、シャドウ xl
- ヘッダー: 🏥 アイコン＋タイトル（グラデーション背景なし、クリーン）
- 指摘事項: カード形式で表示（原文→修正案→理由）
- 修正案: 緑の左ボーダー付きカード
- フッター: ボタン群（右揃え）

### 4.8 トピックセパレータ

```
──────────── 新しい話題 ────────────
```

**デザイン**:
- 水平線: `--color-neutral-200` の1px線
- ラベル: 小さなピル型（`--color-neutral-100` 背景、`--color-text-tertiary`テキスト）
- 余白: 上下 24px

---

## 5. コンポーネント仕様

### 5.1 ボタン

#### プライマリボタン
```css
.btn-primary {
  background: var(--color-primary-500);
  color: white;
  border: none;
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-4);
  height: 36px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 150ms ease, transform 100ms ease;
}
.btn-primary:hover {
  background: var(--color-primary-600);
}
.btn-primary:active {
  transform: scale(0.97);
}
```

#### ゴーストボタン（ヘッダー用）
```css
.btn-ghost {
  background: transparent;
  color: var(--color-text-secondary);
  border: none;
  border-radius: var(--radius-md);
  padding: var(--space-2);
  height: 36px;
  width: 36px;
  cursor: pointer;
  transition: background 150ms ease;
}
.btn-ghost:hover {
  background: var(--color-neutral-100);
}
```

#### 危険ボタン
```css
.btn-danger {
  background: var(--color-danger-500);
  color: white;
}
.btn-danger:hover {
  background: var(--color-danger-600);
}
```

### 5.2 送信ボタン

```css
.btn-send {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-full);
  background: var(--color-neutral-300);  /* 入力なし時 */
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 200ms ease;
}
.btn-send.active {
  background: var(--color-primary-500);  /* 入力あり時 */
  cursor: pointer;
}
```

### 5.3 モデルセレクト（カスタム）

```
┌─────────────────────────────┐
│ 🟢 Gemma 3 12B 👁️ Q4_K_M  ▼│
└─────────────────────────────┘
```

**デザイン**:
- ヘッダー内に自然に溶け込むデザイン
- ステータスインジケータ: 小さなドット（緑=ロード済み、灰=未ロード）
- Vision対応: 👁️ アイコン
- 量子化情報: 薄いバッジ表示

### 5.4 入力テキストエリア（カード型）

```css
.input-card {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  padding: var(--space-3) var(--space-4);
  box-shadow: var(--shadow-sm);
  transition: border-color 200ms ease, box-shadow 200ms ease;
}
.input-card:focus-within {
  border-color: var(--color-primary-400);
  box-shadow: 0 0 0 3px var(--color-primary-100);
}
```

### 5.5 メッセージアクション

**ホバー時に表示されるフローティングツールバー**:

```
          ┌─────────────────────────────┐
          │ [📋] [✏️] [🔄] [🏥]         │  ← フローティング
          └─────────────────────────────┘
┌──────────────────────────────┐
│ アシスタントのメッセージ        │
│ ...                          │
└──────────────────────────────┘
```

**デザイン**:
- メッセージ上部にフローティング表示（position: absolute）
- 背景: 白 + shadow-md
- 角丸: radius-md
- 各アクションはアイコンのみ（ホバーでツールチップ）
- サイズ: 28px × 28px

### 5.6 設定パネル内コンポーネント

#### セクションヘッダー
```css
.settings-section-title {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-tertiary);
  padding: var(--space-4) 0 var(--space-2);
  border-bottom: 1px solid var(--color-border);
}
```

#### 設定行
```css
.settings-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-3) 0;
  border-bottom: 1px solid var(--color-neutral-100);
}
.settings-item label {
  font-size: 0.875rem;
  color: var(--color-text-primary);
}
.settings-item .description {
  font-size: 0.75rem;
  color: var(--color-text-tertiary);
  margin-top: var(--space-1);
}
```

#### トグルスイッチ（チェックボックス代替）
```css
.toggle {
  width: 44px;
  height: 24px;
  border-radius: 12px;
  background: var(--color-neutral-300);
  position: relative;
  cursor: pointer;
  transition: background 200ms ease;
}
.toggle.active {
  background: var(--color-primary-500);
}
.toggle::after {
  content: '';
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: white;
  position: absolute;
  top: 2px;
  left: 2px;
  transition: transform 200ms ease;
  box-shadow: var(--shadow-sm);
}
.toggle.active::after {
  transform: translateX(20px);
}
```

---

## 6. ダークモード

### 6.1 ダークモードカラートークン

```css
body.dark-mode {
  --color-bg-primary:    #0f172a;
  --color-bg-secondary:  #1e293b;
  --color-bg-tertiary:   #334155;
  --color-text-primary:  #f1f5f9;
  --color-text-secondary: #94a3b8;
  --color-text-tertiary: #64748b;
  --color-border:        #334155;
  --color-border-focus:  var(--color-primary-400);

  /* Shadows are more subtle in dark mode */
  --shadow-sm:  0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-md:  0 4px 6px -1px rgba(0, 0, 0, 0.4);
  --shadow-lg:  0 10px 15px -3px rgba(0, 0, 0, 0.5);

  /* Chat bubbles */
  --color-user-bubble:      var(--color-primary-600);
  --color-user-bubble-text: #ffffff;
  --color-assistant-bubble:      #1e293b;
  --color-assistant-bubble-text: #f1f5f9;
  --color-assistant-bubble-border: #334155;
}
```

### 6.2 ダークモード固有の調整

| 要素 | ライト | ダーク |
|------|--------|--------|
| 全体背景 | #f9fafb | #0f172a |
| ヘッダー | #3b82f6 | #1e293b（ボーダー付き） |
| チャットエリア背景 | #f3f4f6 | #0f172a |
| 入力カード背景 | #ffffff | #1e293b |
| コードブロック背景 | #f3f4f6 | #0f172a |
| ホバー色 | #f3f4f6 | #334155 |

### 6.3 ダークモードヘッダー

ダークモードでは、ヘッダーの青い背景を**ダークスレート + 下ボーダー**に変更:
```css
body.dark-mode header {
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
}
```

---

## 7. アニメーション・トランジション

### 7.1 基本方針

- **控えめ・自然**: 0.15s - 0.3s の短いトランジション
- **意味のあるアニメーション**: 状態変化を明示する目的のみ
- **パフォーマンス優先**: `transform` と `opacity` のみアニメーション

### 7.2 トランジション一覧

| 要素 | プロパティ | 時間 | イージング |
|------|-----------|------|----------|
| ボタンホバー | background | 150ms | ease |
| ボタンアクティブ | transform | 100ms | ease |
| 設定パネル開閉 | transform (slideX) | 300ms | cubic-bezier(0.4, 0, 0.2, 1) |
| オーバーレイ表示 | opacity | 200ms | ease |
| モーダル表示 | transform (scale) + opacity | 200ms | cubic-bezier(0.4, 0, 0.2, 1) |
| メッセージ追加 | opacity + transform (slideY) | 300ms | ease-out |
| 入力カード フォーカス | border-color, box-shadow | 200ms | ease |
| トグルスイッチ | background, transform | 200ms | ease |
| 信頼度バー | width | 800ms | ease-out |
| メッセージアクション表示 | opacity | 150ms | ease |

### 7.3 メッセージ追加アニメーション

```css
@keyframes messageIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.message {
  animation: messageIn 300ms ease-out;
}
```

---

## 8. レスポンシブデザイン

### 8.1 ブレークポイント

| ブレークポイント | 幅 | 用途 |
|----------------|-----|------|
| Mobile | < 640px | スマートフォン |
| Tablet | 640px - 1024px | タブレット |
| Desktop | > 1024px | デスクトップ |

### 8.2 レスポンシブ変更一覧

#### Mobile (< 640px)

| 要素 | 変更 |
|------|------|
| ヘッダー | タイトル非表示、モデル選択のみ + ハンバーガーメニュー |
| チャットエリア | パディング 12px |
| メッセージ | max-width: 90% |
| 入力エリア | カード内にすべて収容 |
| 設定パネル | 全画面表示（width: 100%） |
| 比較モード | 縦並び表示 |
| プリセットパネル | 全画面ポップアップ |
| テキストエリア最小高さ | 40px |
| フォントサイズ | 本文: 14px |

#### Tablet (640px - 1024px)

| 要素 | 変更 |
|------|------|
| ヘッダー | コンパクト表示 |
| 設定パネル | 幅 380px |
| メッセージ | max-width: 85% |

#### Desktop (> 1024px)

| 要素 | 変更 |
|------|------|
| チャットエリア | パディング 24px、中央寄せ（max-width: 800px） |
| メッセージ | max-width: 720px |
| 設定パネル | 幅 420px |

---

## 9. アクセシビリティ

### 9.1 基本要件

| 項目 | 対応 |
|------|------|
| カラーコントラスト | WCAG AA 準拠（4.5:1 以上） |
| フォーカスリング | すべてのインタラクティブ要素にフォーカスインジケータ |
| aria-label | すべてのアイコンボタンに設定 |
| キーボードナビゲーション | Tab / Enter / Esc でパネル操作 |
| スクリーンリーダー | role / aria-live 属性の設定 |

### 9.2 フォーカスリング

```css
:focus-visible {
  outline: 2px solid var(--color-primary-500);
  outline-offset: 2px;
}
```

### 9.3 aria属性

| 要素 | 属性 |
|------|------|
| チャットエリア | `role="log"`, `aria-live="polite"` |
| 送信ボタン | `aria-label="メッセージを送信"` |
| 設定パネル | `role="dialog"`, `aria-labelledby="settings-title"` |
| モーダル | `role="dialog"`, `aria-modal="true"` |
| ストリーミング中テキスト | `aria-busy="true"` |

---

## 10. 現行版との変更点一覧

### 10.1 レイアウト変更

| 要素 | 現行版 | 新版 |
|------|--------|------|
| ヘッダー | 3行構成、青背景、ボタン密集 | 1行スリムバー、アクション整理 |
| 入力エリア | 3カラム（ボタン/テキスト/ボタン） | カード型テキストエリア内に統合 |
| 設定パネル | 全設定1列 | タブ3分割＋スライドオーバー |
| プリセットパネル | 左下固定 | ボタン上ポップオーバー |
| メッセージアクション | メッセージ内ホバー表示 | フローティングツールバー |

### 10.2 ビジュアル変更

| 要素 | 現行版 | 新版 |
|------|--------|------|
| カラー | #007bff（Bootstrap風）| #3b82f6（Tailwind Blue） |
| シャドウ | なし | Soft Elevation（多段影） |
| 角丸 | 8-10px | 8-16px（コンテキストに応じて） |
| フォント | system-ui | -apple-system + Noto Sans JP |
| アイコン | 絵文字中心 | 絵文字＋SVGアイコン併用可 |
| チェックボックス | ネイティブ | トグルスイッチ |

### 10.3 インタラクション変更

| 操作 | 現行版 | 新版 |
|------|--------|------|
| 設定パネル開閉 | 即時表示/非表示 | スライドアニメーション |
| メッセージ追加 | 即時DOM挿入 | フェードイン + スライドアップ |
| ボタンクリック | ホバー色変化のみ | ホバー + アクティブ（scale） |
| モーダル表示 | display切替 | フェードイン + スケールアニメ |
| 入力フォーカス | border色変化 | border色 + グロウシャドウ |

### 10.4 機能的変更なし（維持する項目）

以下の機能・動作は**完全に維持**する:
- 全23機能（F-01〜F-23）の動作ロジック
- localStorageキー名と構造（互換性維持）
- API呼び出しのリクエスト/レスポンス形式
- キーボードショートカット
- ファイル対応形式と制限
- エラーハンドリングロジック
- デフォルト値（設定、プリセット内容）
