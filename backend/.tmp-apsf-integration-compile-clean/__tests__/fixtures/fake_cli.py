"""
Claude/Codex CLI test fixture.

CLIFullExecutor / CLILiteExecutor は env APSF_CLI_OVERRIDE 経由で本フィクスチャを
起動できる（例: APSF_CLI_OVERRIDE="python <path>/fake_cli.py"）。
実 CLI と同じ流儀で動作する: argv でフラグを受け取り、prompt を stdin から読み、
stdout へ結果をストリームし、実 exit code で終了する。

Behavior:
  stdin prompt に 'fail' を含む -> stderr 出力, exit 1
  それ以外                     -> [ARTIFACT:...] 付き出力, exit 0
"""
import sys
import time


def main():
    prompt = sys.stdin.read()

    if "fail" in prompt:
        sys.stderr.write("fake_cli: simulated CLI failure\n")
        sys.stderr.flush()
        sys.exit(1)

    print("[ARTIFACT:fake-artifact-1] Starting execution", flush=True)
    time.sleep(0.2)
    print(f"Processed prompt ({len(prompt)} chars). Done.", flush=True)
    sys.exit(0)


if __name__ == "__main__":
    main()
