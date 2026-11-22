import argparse
import json
import subprocess
from datetime import datetime, timedelta, timezone


def backup_status(cronjob: dict, jobs: list[dict], now: datetime, max_age_hours: int):
    cron_uid = cronjob["metadata"]["uid"]
    successes = cronjob.get("status", {}).get("lastSuccessfulTime")
    last_success = datetime.fromisoformat(successes) if successes else None
    last_failure = max(
        (
            datetime.fromisoformat(condition["lastTransitionTime"])
            for job in jobs
            if any(
                owner.get("uid") == cron_uid
                for owner in job["metadata"].get("ownerReferences", [])
            )
            for condition in job.get("status", {}).get("conditions", [])
            if condition["type"] == "Failed" and condition["status"] == "True"
        ),
        default=None,
    )
    if cronjob.get("spec", {}).get("suspend"):
        status = "suspended"
    elif last_failure and (not last_success or last_failure > last_success):
        status = "failed"
    elif not last_success:
        status = "missing"
    elif now - last_success > timedelta(hours=max_age_hours):
        status = "stale"
    else:
        status = "ok"
    return {
        "event": "postgres_backup_check",
        "scope": "scheduled",
        "status": status,
        "last_success_at": successes,
        "last_failure_at": last_failure.isoformat() if last_failure else None,
        "max_age_hours": max_age_hours,
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Check scheduled Postgres backup freshness."
    )
    parser.add_argument("context")
    parser.add_argument("max_age_hours", type=int)
    args = parser.parse_args()
    if not args.context.strip():
        parser.error("context must be the name of a Kubernetes context.")
    if args.max_age_hours < 1:
        parser.error("max_age_hours must be positive.")
    prefix = [
        "kubectl",
        "--context",
        args.context,
        "--request-timeout=15s",
        "-n",
        "daily-planner",
        "get",
    ]
    try:
        cronjob = json.loads(
            subprocess.check_output(
                [*prefix, "cronjob", "postgres-backup", "-o", "json"]
            )
        )
        jobs = json.loads(subprocess.check_output([*prefix, "jobs", "-o", "json"]))[
            "items"
        ]
    except subprocess.CalledProcessError:
        print(
            json.dumps(
                {
                    "event": "postgres_backup_check",
                    "scope": "scheduled",
                    "status": "unavailable",
                }
            )
        )
        return 1
    result = backup_status(
        cronjob, jobs, datetime.now(timezone.utc), args.max_age_hours
    )
    print(json.dumps(result))
    return 0 if result["status"] == "ok" else 1


if __name__ == "__main__":
    raise SystemExit(main())
