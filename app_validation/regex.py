import subprocess
import sys
from pathlib import Path
from threading import BoundedSemaphore

from app_validation.models import Diagnostic, RegexRequest, RegexResult


slots = BoundedSemaphore(2)
MATCH_TIMEOUT_SECONDS = 1
WORKER_PATH = Path(__file__).with_name("regex_worker.py")


def run_python_regex(request: RegexRequest) -> RegexResult:
    if not slots.acquire(blocking=False):
        return RegexResult(
            diagnostic=Diagnostic(message="Regex runner is busy. Try again shortly.")
        )
    try:
        result = subprocess.run(
            [sys.executable, str(WORKER_PATH)],
            input=request.model_dump_json(),
            capture_output=True,
            encoding="utf-8",
            timeout=MATCH_TIMEOUT_SECONDS,
            check=True,
        )
    except subprocess.TimeoutExpired:
        return RegexResult(
            diagnostic=Diagnostic(message="Python regex exceeded the one-second limit.")
        )
    finally:
        slots.release()
    return RegexResult.model_validate_json(result.stdout)
