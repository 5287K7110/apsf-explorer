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
# sleep 後は write-phase の meaningful-content 検証（>3 行）を通る出力を返す
# （kill テストではここに到達しない。queue テストでは build.md として保存される）
print("# Build", flush=True)
print("", flush=True)
print("## Work Done", flush=True)
print("", flush=True)
print("- fake provider execution finished.", flush=True)
print("- output is meaningful enough to persist.", flush=True)
print("- used by queue serialization tests.", flush=True)
print("- see slow_native_cli.py.", flush=True)
