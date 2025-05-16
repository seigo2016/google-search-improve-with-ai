# GSIAI: Google Search Improve with AI
### 概要
GSIAIは、Chrome拡張機能として動作し、Google検索結果をLLMで内容評価してフィルタリングします。  
URLパターンフィルタリングに特化した[GSI4D](https://github.com/yanorei32/GSI4D)のアイデアを継承しつつ 、Cloudflare Workers経由でGemini 1.5 Flash 8bを用いて各リンクの品質をスコアリングします。  
指定するモデルを変更することで、他のLLMを利用することも可能です。  

[このツールの開発について紹介したLTの資料(docswell)](https://www.docswell.com/s/seigo/57R8WW-GSIAI/12)

### 主な機能
- AIによるコンテンツ評価
  Gemini 1.5 Flash 8bで検索結果の内容をスコア化
- 自動フィルタリング
  カスタム閾値に基づき、低品質な結果をグレーアウトまたは非表示
- ハイライト表示
  高品質なリンクを緑色などで強調表示
- 高速動作
  Cloudflare Workers + TypeScriptで低レイテンシを実現
- キー不要
  Cloudflare AI GatewayがAPIキー管理を代行

### インストール手順

1. リポジトリをクローン
```bash
git clone https://github.com/seigo2016/google-search-improve-with-ai.git
cd google-search-improve-with-ai
```
2. 依存パッケージをインストール
```bash
npm install
```
3. 環境設定
- Cloudflare Workers用の`CF_ACCOUNT_ID`を取得
- Cloudflare AI GatewayでGemini 1.5 Flash 8bを有効化
- `.env.example`を`.env`にコピーし、`CF_ACCOUNT_ID`を記入
4. Workersをデプロイ
```bash
npx wrangler publish
```
5. 拡張機能を読み込む
- `npm run build`で`dist/`フォルダを生成
- Chromeの拡張機能画面(`chrome://extensions`)で「デベロッパーモード」をオンにし、`dist/`を読み込む

### 使い方
- 通常通りGoogleで検索します。
- 表示された追加質問文をクリックすると、AIが評価した結果が表示されます。
![image](https://github.com/user-attachments/assets/79d2971c-c0bf-4378-ba5e-8400e30e35e0)

- 検索結果は自動評価され、タイトルの左側にスコアが表示されます。

### 技術スタック
- Chrome拡張機能 (Manifest V3)
- Cloudflare Workers + TypeScript
- Cloudflare AI Gateway (Gemini 1.5 Flash 8b)
- Wrangler

### ライセンス
MITライセンスのもとで公開しています。

### 謝辞
- アイデア元：[GSI4D](https://github.com/yanorei32/GSI4D)
- プロンプト調整：@kaitoyama
