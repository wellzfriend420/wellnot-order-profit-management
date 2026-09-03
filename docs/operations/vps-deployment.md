# XServer VPS 本番構成

## 構成

ウェルノット工程管理は XServer VPS の `/opt/wfs/wellnot` で、専用 Docker Compose Project として運用する。DB は専用 named volume の SQLite を継続し、n8n 用 PostgreSQLとは共用しない。

- Compose Project: `wfs-wellnot`
- アプリ待受: コンテナ内 `3000/tcp`
- 検証時: VPS loopback のみ。インターネットから直接到達させず、既存バックアップ連携に必要な外向き通信だけを許可する
- 本番公開: 共通 Caddy から専用内部接続へ中継する
- DB: `/var/lib/wellnot/wellnot.sqlite`
- VPS内バックアップ: `/var/backups/wfs/wellnot`
- 再起動: `unless-stopped`
- ログ: 10MB x 3世代

## 初回配置

1. GitHub main の検証済みVersionを `/opt/wfs/wellnot` へ配置する。
2. `providers/vps/.env.example` を `.env` へコピーし、VPS上でのみ秘密値を設定する。
3. `.env` を root 所有・mode 600 とする。
4. Render SQLite は稼働中ファイルや WAL を直接コピーせず、Node.js SQLite online backup APIで整合スナップショットを作成する。
5. 暗号化された経路でスナップショットをVPSへ移送する。
6. 起動前に `PRAGMA integrity_check` と主要テーブル件数を移送元と照合する。
7. `scripts/preflight.sh` 後、`docker compose up -d` で起動する。

## 公開切替

DNSおよび本番URLは、VPS版のログイン、権限、マスタ、案件、帳票を確認した後に別承認で切り替える。Renderサービス停止は本番通しテスト後の別承認とし、Persistent Disk削除はさらに別工程とする。

## バックアップ

VPS内バックアップはSQLite online backup APIを使用し、毎日実行して14日保持する。WFS共通外部バックアップ完成後は、生成されたSQLiteとSHA-256を公開鍵暗号化し、共通外部保管先へ複製する。外部保管先の認証情報や復号秘密鍵はGitHubへ保存しない。

## 復旧

復旧はデータ置換を伴うため、`scripts/restore.sh` 実行直前に明示承認を得る。復元後はSQLite整合性、主要件数、管理者・従業員ログイン、案件・帳票を確認してから公開を再開する。
