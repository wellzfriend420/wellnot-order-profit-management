# ウェルノット 受注工事・利益管理システム

工程表を紙で運用する現場を変えず、紙の自動生成と受注工事データの蓄積・分析によって、見積精度と粗利を改善するシステムです。

## 開発状態

- WFS Status: Candidate
- App ID: `APP-0004`
- System ID: `SYS-0004`
- Repository ID: `REPO-0004`
- Database ID: `DB-0003`

## 起動

Node.js 22.5以上で `npm start` を実行し、`http://localhost:3000` を開きます。

初期デモ利用者は管理者 `admin / wellnot-admin`、従業員 `worker / wellnot-worker` です。本番では環境変数 `ADMIN_INITIAL_PASSWORD` と `WORKER_INITIAL_PASSWORD` を必ず設定してください。

## 構成

- `src/domain`: 業務ルール
- `src/infrastructure`: SQLite、認証、帳票
- `src/routes`: HTTP API
- `public`: 画面
- `docs`: WFS設計正本
- `tests`: 自動テスト

## Excel原本

現行の「受注工事明細」Excel原本は未提供です。期間別Excel互換出力を先行実装し、原本受領後に `config/excel-template-map.json` のセルマッピングを確定します。原本レイアウトは変更しません。

## 帳票検証

開発環境では `BROWSER_EXECUTABLE` にChromium系ブラウザーを指定し、`npm run verify:pdf` でA4工程管理票、A3受注一覧、A3工程ガントを `tmp/pdfs` へ生成できます。生成物はPopplerで画像化し、用紙サイズ、金額非表示、改ページ、モノクロ判読性を確認します。
