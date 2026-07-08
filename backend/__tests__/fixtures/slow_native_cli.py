# -*- coding: utf-8 -*-
"""実行中クラッシュテスト用の fake provider。

長時間実行を模す: 出力を 1 行流してから長く sleep する。
テストは sleep 中に backend を強制終了する（実行マーカーが残ることを検証）。
"""
import sys
import time

sys.stdin.read()  # プロンプトを消費（executor は stdin でプロンプトを渡す）
print("[fake] long-running execution started", flush=True)
time.sleep(int(sys.argv[1]) if len(sys.argv) > 1 else 120)
print("[fake] finished (should not be reached in kill tests)", flush=True)
