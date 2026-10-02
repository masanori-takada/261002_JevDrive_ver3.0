#!/bin/bash
# /handoff が生成: 保存した設定で次のセッションを起動する
claude update 2>&1 || echo "(Update skipped or failed)"
exec claude --effort medium "前回の引き継ぎを確認して、作業を再開してください"
