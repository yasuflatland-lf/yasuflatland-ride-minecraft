import io
import json
import sys
import traceback


def run(request):
    stdin, stdout = sys.stdin, sys.stdout
    path = sys.path[:]
    output = io.StringIO()
    try:
        sys.stdin = io.StringIO(request["input"])
        sys.stdout = output
        exec(compile(request["script"], "<test>", "exec"), {"__name__": "__main__"})
        return {"ok": True, "stdout": output.getvalue()}
    except BaseException:
        return {"ok": False, "error": traceback.format_exc()}
    finally:
        sys.stdin, sys.stdout = stdin, stdout
        sys.path = path


for line in sys.stdin:
    response = run(json.loads(line))
    sys.__stdout__.write(json.dumps(response) + "\n")
    sys.__stdout__.flush()
