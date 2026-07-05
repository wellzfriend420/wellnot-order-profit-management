# 本番デプロイ手順

## 採用構成

- 公開先: Render Web Service（東京から近いSingaporeリージョン）
- URL: Renderが発行するHTTPS共有URL。必要に応じて独自ドメインへ変更可能
- 実行数: 1インスタンス固定（SQLiteの同時多重起動を避けるため）
- DB: Render Persistent Disk上の `/var/data/wellnot/wellnot.sqlite`
- バックアップ: アプリ内スケジューラーからGoogle Driveへ24時間ごとに保存

Renderの通常ファイル領域は再デプロイで消えるため、`DATABASE_PATH`を必ず上記の永続ディスク配下にする。ソースツリー内の`data/`はローカル開発専用で、本番データを置かない。

## 初回デプロイ

1. GitHubの本リポジトリをRenderへ接続する。
2. Render Dashboardで「New > Blueprint」を選び、リポジトリの`render.yaml`を適用する。
3. Secret入力画面で次を設定する。
   - `ADMIN_INITIAL_PASSWORD`: 管理者の長い初期パスワード
   - `WORKER_INITIAL_PASSWORD`: 従業員の長い初期パスワード
   - `PUBLIC_BASE_URL`: 発行された `https://...onrender.com`
   - `GOOGLE_SERVICE_ACCOUNT_JSON`: Google Cloudで作成したサービスアカウント鍵JSON全文
   - `GOOGLE_DRIVE_BACKUP_FOLDER_ID`: バックアップ先フォルダーURL内のID
4. デプロイ完了後、`https://共有URL/healthz` が `{"ok":true}` を返すことを確認する。
5. PC、スマホ、タブレットの各ブラウザーから共有URLを開き、管理者・従業員でログイン確認する。

## Google Driveバックアップ設定

1. Google CloudでDrive APIを有効化し、専用サービスアカウントを作成する。
2. Google Workspaceの共有ドライブに「Wellnot DB Backup」フォルダーを作成する。
3. フォルダーをサービスアカウントのメールアドレスへ編集者として共有する。
4. サービスアカウント鍵JSON全文とフォルダーIDをRender Secretへ設定する。
5. 再デプロイ後30秒程度で初回バックアップ、その後`BACKUP_INTERVAL_HOURS`ごとに実行される。
6. 管理者は `POST /api/admin/backup` で手動実行、`GET /api/admin/backup-status` で成否を確認できる。サービスアカウントには個人用マイドライブ容量がないため、原則として共有ドライブを使用する。

バックアップはSQLiteのオンラインバックアップAPIを使って整合性のある一時コピーを作成し、そのコピーだけをDriveへ送る。稼働中DBファイルの単純コピーは行わない。

## 更新と復旧

- `main`へのpushで自動デプロイする。DBは永続ディスクに残る。
- 配備前後に`/healthz`とログインを確認する。
- 復旧時はサービスを停止し、Drive上のバックアップを `/var/data/wellnot/wellnot.sqlite` へ戻してから再起動する。
- SQLite運用中は永続ディスク付きサービスを複数インスタンスへ増やさない。将来複数台構成が必要になった時点でPostgreSQLへ移行する。

## 運用上の注意

- Renderの永続ディスクが利用できる有料プランを使用する。
- サービスアカウント鍵、パスワード、DBファイルはGitへ登録しない。
- Google Drive側で保存期間を定め、月1回は復元手順を確認する。

## 参考仕様

- [Render Persistent Disks](https://render.com/docs/disks)
- [Render Blueprint YAML Reference](https://render.com/docs/blueprint-spec)
- [Node.js SQLite backup API](https://nodejs.org/docs/latest-v22.x/api/sqlite.html#sqlitebackupsourceDb-destination-options)
- [Google Drive API - Upload file data](https://developers.google.com/workspace/drive/api/guides/manage-uploads)
