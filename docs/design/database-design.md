# データベース設計書 DB-0003

- 状態: proposed
- データ管理責任: データ管理責任者
- 最終確認日: 2026-07-05

## 目的・正本・分類

受注工事、工程、予定、実績、原価、改善知識、監査履歴を保持する。SQLiteを初期正本とし、実データや接続情報はGitへ保存しない。顧客名・工事名・金額は社外秘として扱う。

## 論理モデル

```text
Customer 1─N Project 1─N ProjectProcess N─1 ProcessMaster
                    ├─N Drawing
                    ├─N ProjectCaution N─1 CautionMaster
                    ├─N BudgetItem
                    ├─N ActualCost
                    ├─N DeadlineChange
                    ├─N ImprovementMemo
                    └─N AuditLog
ProjectProcess 1─N WorkMemo
User 1─N AuditLog / ExportHistory
```

予算は `BudgetItem(label, amount, sort_order)` の可変明細とし、見積書の項目を固定しない。実績原価は材料費・外注費を明細で持ち、工数は確定済み作業メモの時間を集計する。

## 制約・索引

- 工番は一意。
- 工程順序は案件内で一意。
- 予定終了日は予定開始日以降。
- 図面管理OFF案件に図面工程を登録しない。
- 納期変更履歴は削除しない。
- 工番、納期、案件状態、工程予定日、監査日時、出力日時に索引を設ける。

## 保持・削除・監査

削除は管理者のみ。通常は論理削除し、工番再利用を禁止する。監査履歴・出力履歴・納期変更履歴は業務データと同じ期間保持し、管理画面から削除しない。保持年数は運用開始前に決定する。

## 変更・移行・復旧

`schema_migrations` で適用済み版を管理し、破壊的変更は追加→移行→読替→旧列廃止の段階移行とする。バックアップ復元試験は四半期ごとに行う。

