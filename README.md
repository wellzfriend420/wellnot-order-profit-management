# ウェルノット 受注工事・利益管理システム

工程表を紙で運用する現場を変えず、紙の自動生成と受注工事データの蓄積・分析によって、見積精度と粗利を改善するシステムです。

## 開発状態

- WFS Status: Candidate
- App ID: `APP-0004`
- System ID: `SYS-0004`
- Repository ID: `REPO-0004`
- Database ID: `DB-0003`

## ローカル開発

Node.js 22.16以上で `npm start` を実行し、`http://localhost:3000` を開きます。

初期デモ利用者は管理者 `admin / wellnot-admin`、従業員 `worker / wellnot-worker` です。本番では環境変数 `ADMIN_INITIAL_PASSWORD` と `WORKER_INITIAL_PASSWORD` を必ず設定してください。

ローカル開発のDBは既定で `data/wellnot.sqlite` に作成されます。このDBは開発確認専用で、共有運用には使用しません。

## 本番運用

本番はlocalhostではなく、Renderから発行されるHTTPS共有URLをPC・スマホ・タブレットのブラウザーで開いて利用します。利用端末へのインストールやcloneは不要です。

本番DBはRender Persistent Diskの `/var/data/wellnot/wellnot.sqlite` に保存します。通常の一時ファイル領域へDBを置く構成では起動しません。サービスはSQLite保護のため1インスタンス固定です。

Google Driveバックアップを設定すると、アプリがSQLiteの整合性を保ったコピーを24時間ごとに指定フォルダーへ保存します。詳しい初回配備、環境変数、バックアップ、復旧手順は [本番デプロイ手順](docs/operations/production-deployment.md) を参照してください。

## 構成

- `src/domain`: 業務ルール
- `src/infrastructure`: SQLite、認証、帳票
- `src/routes`: HTTP API
- `public`: 画面
- `docs`: WFS設計正本
- `tests`: 自動テスト
- `render.yaml`: 共有URL・永続ディスクを含む本番配備定義

## Excel原本

`受注工事明細表2026.5.18.xls` の第3シート「受注工事 作成依頼分6.12」を有効見本として採用しています。原本から実案件データを除いた `assets/excel/order-details-template.xlsx` に、客先、工事名、契約工期、予算合計を差し込みます。単月は1シート、2〜3か月は空月を含む月別シート、4か月以上は期間合算で出力し、31件を超える場合は同じ原本レイアウトでページを分けます。

原本ファイル自体は実案件情報を含むためリポジトリへ保存せず、無記名化したテンプレートのみを管理します。

## 帳票検証

開発環境では `BROWSER_EXECUTABLE` にChromium系ブラウザーを指定し、`npm run verify:pdf` でA4工程管理票、A3受注一覧、A3カレンダーを `tmp/pdfs` へ生成できます。生成物はPopplerで画像化し、用紙サイズ、金額非表示、改ページ、モノクロ判読性を確認します。
