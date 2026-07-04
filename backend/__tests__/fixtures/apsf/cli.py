"""
APSF CLI test fixture.

The real backend spawns `python -m apsf.cli execute --provider ... --command ...`
(see backend/src/services/apsf-bridge.service.ts). Integration tests point
APSF_CLI_PATH at this fixture directory so the FULL real execution path is
exercised: real python process, real stdout/stderr streaming, real exit codes.

Behavior:
  --command fail  -> writes to stderr, exits 1 (error path)
  otherwise       -> emits JSON progress lines to stdout, exits 0 (success path)
"""
import json
import sys
import time


def get_arg(args, flag):
    if flag in args:
        idx = args.index(flag)
        if idx + 1 < len(args):
            return args[idx + 1]
    return None


def main():
    args = sys.argv[1:]
    command = get_arg(args, "--command") or ""
    provider = get_arg(args, "--provider") or "unknown"

    if command == "fail":
        sys.stderr.write("APSF fixture: simulated execution failure\n")
        sys.stderr.flush()
        sys.exit(1)

    print(json.dumps({"stage": "plan", "progress": 30,
                      "message": f"planning '{command}' via {provider}"}), flush=True)
    time.sleep(0.2)
    print(json.dumps({"stage": "build", "progress": 100,
                      "message": "execution finished"}), flush=True)
    sys.exit(0)


if __name__ == "__main__":
    main()
