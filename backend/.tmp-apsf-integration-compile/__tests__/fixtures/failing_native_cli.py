# -*- coding: utf-8 -*-
"""実行失敗テスト用の fake provider。プロンプトを消費して非ゼロ終了する。"""
import sys

sys.stdin.read()
print("[fake] provider crashed on purpose", file=sys.stderr, flush=True)
sys.exit(1)
