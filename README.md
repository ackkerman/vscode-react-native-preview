# React Native Preview

**UI変更時は `make preview-screenshot` を実行してプレビュー画像を更新し、既存の自動化スクリプトを活用してください。**

React Native Preview は Expo/Metro プロジェクトの Web プレビューを VS Code で確認し、ステータスバーと出力チャネルに状態を表示する拡張です。

## インストール方法

1. VS Code (1.85+) と Node.js を準備し、このリポジトリをクローンします。
2. `npm install` で依存関係を取得し、`npm run build` で拡張をビルドします。
3. 開発用途では VS Code の「Run Extension」(F5) で拡張ホストを起動して動作を確認できます。
4. 配布用 VSIX は `npm run package` もしくは `npm run vsix` を実行して作成し、「Extensions: Install from VSIX」でインストールします。

## コマンド一覧

- **React Native: Open Preview (`rnPreview.open`)**: プレビュー WebView を開き、`npx expo start --web` で Metro/Expo を起動します。
- **React Native: Reload Preview (`rnPreview.reload`)**: 開いたプレビューを再読み込みし、Metro が停止している場合は再起動します。
- **React Native: Restart Metro (`rnPreview.restartMetro`)**: Metro を停止してから再起動し、プレビューを開き直します。

## ステータスバー表示

ステータスバー左側に「React Native Preview」が追加され、状態を表すアイコンとテキストを表示します。

- `$(preview) React Native Preview: Idle`: 拡張読み込み直後の待機状態。
- `$(loading~spin) React Native Preview: Starting Metro`: Expo/Metro 起動中。
- `$(play) React Native Preview: Metro running`: プレビュー URL が応答中。ツールチップでプレビュー URL とワークスペースパスを確認できます。
- `$(debug-stop) React Native Preview: Metro stopped`/`Stopping Metro`: 停止中または停止完了。
- `$(error) React Native Preview: Metro failed/not ready`: 起動失敗やプレビュー応答なし。詳細は出力チャネルを参照してください。

## 設定項目

- `rnPreview.previewUrl`: 既定値は `http://localhost:19006` です。Expo Web のホスト/ポートに合わせて変更できます。
- VS Code の Settings UI または `settings.json` で設定します。

  ```json
  {
    "rnPreview.previewUrl": "http://localhost:19007"
  }
  ```

- 無効な URL を設定すると、警告を表示し既定値にフォールバックします。

## Metro/Expo 要件

- プレビューは `npx expo start --web` を使用するため、ワークスペースに Expo/Metro 環境がセットアップされていることが前提です。
- プレビュー URL で Metro/Expo が応答できるよう、`package.json` のスクリプトや `app.json` の設定を確認してください。
- ワークスペースが複数ある場合は、Metro の起動フォルダーを選択する必要があります。

## プレビュー撮影手順

UI 変更時やレビュー用のスクリーンショットが必要な場合は、以下の自動化スクリプトを実行します。

1. 依存関係のセットアップ: `make preview-deps` （uv で Python 依存と Playwright Chromium をインストール）
   - OS依存ライブラリも必要な場合は `make preview-deps PLAYWRIGHT_WITH_DEPS=1` を使用してください（`apt-get` が使える環境向け）。
2. プレビュー撮影: `make preview-screenshot` （`PREVIEW_URL` や `PREVIEW_OUT` で上書き可能）

生成された画像は `artifacts/preview.png` に保存されます。

## トラブルシューティング

- VS Code の「出力」ビューで「React Native Preview」チャネルを選択すると、Metro のログやプレビューの状態を確認できます。
- プレビューが応答しない場合は、`rnPreview.previewUrl` の値と Metro/Expo の起動状態を確認してください。
