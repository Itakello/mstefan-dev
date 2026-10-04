#!/usr/bin/env python3
"""Bounded, operator-classified production release observations."""

import argparse
import datetime as dt
import fcntl
import json
import os
import re
import stat
import sys
import tempfile
from pathlib import Path

SHA = re.compile(r"[0-9a-f]{40}\Z")
DEPLOYMENT_ID = re.compile(r"dep_[A-Za-z0-9_-]{1,120}\Z")
UTC_TIME = re.compile(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|\+00:00)\Z")
MAX_BYTES = 10 * 1024 * 1024
MAX_DEPLOYMENTS = 10000
MAX_COMMITS = 250
CLASSIFICATIONS = {"unknown", "normal", "failed", "rework", "failed-rework"}


class ObservationError(Exception):
    pass


def timestamp(value):
    if not isinstance(value, str) or not UTC_TIME.fullmatch(value):
        raise ObservationError("invalid timestamp")
    try:
        parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise ObservationError("invalid timestamp") from None
    return parsed.astimezone(dt.timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


def now_utc():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


def valid_sha(value):
    return isinstance(value, str) and SHA.fullmatch(value) is not None


def valid_id(value):
    return isinstance(value, str) and DEPLOYMENT_ID.fullmatch(value) is not None


def validate(data):
    if not isinstance(data, dict) or set(data) != {"version", "coverageStartedAt", "updatedAt", "captureState", "deployments"} or type(data["version"]) is not int or data["version"] != 1:
        raise ObservationError("invalid ledger")
    if data["captureState"] not in {"ready", "pending", "paused"}:
        raise ObservationError("invalid capture state")
    start, updated = timestamp(data["coverageStartedAt"]), timestamp(data["updatedAt"])
    if start != data["coverageStartedAt"] or updated != data["updatedAt"] or updated < start or updated > now_utc():
        raise ObservationError("invalid ledger timestamps")
    rows = data["deployments"]
    if not isinstance(rows, list) or len(rows) > MAX_DEPLOYMENTS:
        raise ObservationError("invalid deployments")
    ids = set()
    for row in rows:
        if not isinstance(row, dict) or set(row) != {"id", "sha", "baselineSha", "deployedAt", "classification", "commits", "commitCoverageComplete", "incidentStartedAt", "recoveredAt"}:
            raise ObservationError("invalid deployment")
        if not valid_id(row["id"]) or row["id"] in ids or not valid_sha(row["sha"]) or (row["baselineSha"] is not None and not valid_sha(row["baselineSha"])):
            raise ObservationError("invalid deployment identity")
        ids.add(row["id"])
        deployed = timestamp(row["deployedAt"])
        if deployed != row["deployedAt"] or deployed < start or deployed > updated:
            raise ObservationError("invalid deployment time")
        if row["classification"] not in CLASSIFICATIONS or type(row["commitCoverageComplete"]) is not bool:
            raise ObservationError("invalid classification or coverage")
        commits = row["commits"]
        if not isinstance(commits, list) or len(commits) > MAX_COMMITS or (not row["commitCoverageComplete"] and commits):
            raise ObservationError("invalid commits")
        commit_shas = set()
        for commit in commits:
            if not isinstance(commit, dict) or set(commit) != {"sha", "committedAt"} or not valid_sha(commit["sha"]) or commit["sha"] in commit_shas:
                raise ObservationError("invalid commit")
            commit_shas.add(commit["sha"])
            committed = timestamp(commit["committedAt"])
            if committed != commit["committedAt"] or committed > deployed:
                raise ObservationError("invalid commit time")
        incident, recovered = row["incidentStartedAt"], row["recoveredAt"]
        if incident is not None:
            if timestamp(incident) != incident or incident < deployed or incident > updated:
                raise ObservationError("invalid incident time")
        if recovered is not None:
            if incident is None or timestamp(recovered) != recovered or recovered < incident or recovered > updated:
                raise ObservationError("invalid recovery time")
        if row["classification"] in {"failed", "failed-rework"}:
            if incident is None:
                raise ObservationError("failed release requires incident time")
        elif incident is not None or recovered is not None:
            raise ObservationError("nonfailed release has incident time")
    return data


def _parent(path):
    parent = path.parent
    parent.mkdir(mode=0o750, parents=True, exist_ok=True)
    if parent.is_symlink() or not parent.is_dir() or parent.stat().st_mode & 0o022:
        raise ObservationError("unsafe ledger directory")
    return parent


def _load(path):
    if path.is_symlink():
        raise ObservationError("unsafe ledger file")
    try:
        info = path.stat()
        if not stat.S_ISREG(info.st_mode) or info.st_mode & 0o137 or info.st_size > MAX_BYTES:
            raise ObservationError("unsafe ledger file")
        with path.open("rb") as stream:
            raw = stream.read(MAX_BYTES + 1)
        if len(raw) > MAX_BYTES:
            raise ObservationError("ledger too large")
        return validate(json.loads(raw))
    except FileNotFoundError:
        raise ObservationError("ledger not initialized") from None
    except (UnicodeError, ValueError, TypeError, KeyError):
        raise ObservationError("invalid ledger") from None


def _save(path, data):
    validate(data)
    raw = (json.dumps(data, separators=(",", ":"), sort_keys=True) + "\n").encode()
    if len(raw) > MAX_BYTES:
        raise ObservationError("ledger too large")
    fd, tmp = tempfile.mkstemp(prefix=".release-", dir=path.parent)
    try:
        os.fchmod(fd, 0o640)
        with os.fdopen(fd, "wb") as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(tmp, path)
        directory = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def _locked(path, action):
    path = Path(path)
    _parent(path)
    lock = path.parent / ("." + path.name + ".lock")
    if lock.is_symlink():
        raise ObservationError("unsafe ledger lock")
    fd = os.open(lock, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "r+b") as stream:
        if not stat.S_ISREG(os.fstat(stream.fileno()).st_mode) or os.fstat(stream.fileno()).st_mode & 0o077:
            raise ObservationError("unsafe ledger lock")
        fcntl.flock(stream, fcntl.LOCK_EX)
        return action(path)


def init(path):
    def action(p):
        if p.exists() or p.is_symlink():
            _load(p)
            return False
        current = now_utc()
        _save(p, {"version": 1, "coverageStartedAt": current, "updatedAt": current,
                  "captureState": "ready", "deployments": []})
        return True
    return _locked(path, action)


def capture_state(path):
    return _locked(path, lambda p: _load(p)["captureState"])


def set_capture_state(path, expected, target):
    def action(p):
        data = _load(p)
        if data["captureState"] != expected:
            raise ObservationError("capture state conflict")
        data["captureState"] = target
        data["updatedAt"] = now_utc()
        _save(p, data)
    return _locked(path, action)


def mark_pending(path):
    return set_capture_state(path, "ready", "pending")


def cancel_pending(path):
    return set_capture_state(path, "pending", "ready")


def pause(path):
    return set_capture_state(path, "ready", "paused")


def resume(path):
    return set_capture_state(path, "paused", "ready")


def _extract_compare(result, baseline, sha, deployed_at):
    if not valid_sha(baseline) or baseline == sha:
        return [], False
    try:
        commits = result["commits"]
        total = result["total_commits"]
        if (not isinstance(commits, list) or type(total) is not int or not 1 <= total <= MAX_COMMITS or
                len(commits) != total or result["base_commit"]["sha"] != baseline or
                result["status"] != "ahead"):
            return [], False
        rows, seen = [], set()
        for item in commits:
            commit_sha = item["sha"]
            committed = timestamp(item["commit"]["committer"]["date"])
            if not valid_sha(commit_sha) or commit_sha in seen or committed > deployed_at:
                return [], False
            seen.add(commit_sha)
            rows.append({"sha": commit_sha, "committedAt": committed})
        if rows[-1]["sha"] != sha:
            return [], False
        return rows, True
    except Exception:
        return [], False


def _compare(client, baseline, sha, deployed_at):
    if not valid_sha(baseline) or baseline == sha:
        return [], False
    try:
        return _extract_compare(client.gh("/compare/" + baseline + "..." + sha),
                                baseline, sha, deployed_at)
    except Exception:
        return [], False


def record(path, client, deployment_id, sha, baseline_sha=None, deployed_at=None):
    if not valid_id(deployment_id) or not valid_sha(sha) or (baseline_sha is not None and not valid_sha(baseline_sha)):
        raise ObservationError("invalid deployment identity")
    deployed_at = timestamp(deployed_at or now_utc())
    def action(p):
        data = _load(p)
        for row in data["deployments"]:
            if row["id"] == deployment_id:
                if row["sha"] != sha or row["baselineSha"] != baseline_sha:
                    raise ObservationError("deployment identity conflict")
                if data["captureState"] != "ready":
                    raise ObservationError("capture state conflict")
                return False
        if data["captureState"] != "pending":
            raise ObservationError("capture not pending")
        if len(data["deployments"]) >= MAX_DEPLOYMENTS:
            raise ObservationError("ledger full")
        if deployed_at < data["coverageStartedAt"]:
            raise ObservationError("deployment predates coverage")
        commits, complete = _compare(client, baseline_sha, sha, deployed_at)
        updated = max(now_utc(), deployed_at, data["updatedAt"])
        data["deployments"].append({"id": deployment_id, "sha": sha, "baselineSha": baseline_sha,
            "deployedAt": deployed_at,
            "classification": "unknown", "commits": commits, "commitCoverageComplete": complete,
            "incidentStartedAt": None, "recoveredAt": None})
        data["updatedAt"] = updated
        data["captureState"] = "ready"
        _save(p, data)
        return True
    return _locked(path, action)


def classify(path, deployment_id, classification, incident_start=None, recovered_at=None):
    if not valid_id(deployment_id) or classification not in CLASSIFICATIONS - {"unknown"}:
        raise ObservationError("invalid classification")
    def action(p):
        data = _load(p)
        row = next((r for r in data["deployments"] if r["id"] == deployment_id), None)
        if row is None:
            raise ObservationError("deployment not found")
        updated = max(now_utc(), data["updatedAt"])
        candidate = dict(row, classification=classification,
                         incidentStartedAt=timestamp(incident_start) if incident_start else None,
                         recoveredAt=timestamp(recovered_at) if recovered_at else None)
        data["deployments"] = [candidate if r["id"] == deployment_id else r for r in data["deployments"]]
        data["updatedAt"] = updated
        validate(data)
        if candidate == row:
            return False
        _save(p, data)
        return True
    return _locked(path, action)


def enrich(path, deployment_id, baseline_sha, comparison):
    if not valid_id(deployment_id) or not valid_sha(baseline_sha):
        raise ObservationError("invalid enrichment identity")
    def action(p):
        data = _load(p)
        row = next((r for r in data["deployments"] if r["id"] == deployment_id), None)
        if row is None:
            raise ObservationError("deployment not found")
        if row["baselineSha"] != baseline_sha:
            raise ObservationError("baseline mismatch")
        if row["commitCoverageComplete"]:
            return False
        commits, complete = _extract_compare(comparison, baseline_sha, row["sha"], row["deployedAt"])
        if not complete:
            raise ObservationError("incomplete comparison")
        row["commits"] = commits
        row["commitCoverageComplete"] = True
        data["updatedAt"] = now_utc()
        _save(p, data)
        return True
    return _locked(path, action)


def read_comparison(path):
    candidate = Path(path)
    if candidate.is_symlink():
        raise ObservationError("unsafe comparison file")
    try:
        info = candidate.stat()
        if not stat.S_ISREG(info.st_mode) or info.st_mode & 0o077 or info.st_size > MAX_BYTES:
            raise ObservationError("invalid comparison file")
        with candidate.open("rb") as stream:
            raw = stream.read(MAX_BYTES + 1)
        if len(raw) > MAX_BYTES:
            raise ObservationError("comparison file too large")
        return json.loads(raw)
    except (OSError, UnicodeError, ValueError, TypeError):
        raise ObservationError("invalid comparison file") from None


def main(argv=None):
    parser = argparse.ArgumentParser(description="Manage the release observation ledger")
    sub = parser.add_subparsers(dest="command", required=True)
    initialize = sub.add_parser("init")
    initialize.add_argument("path")
    change = sub.add_parser("classify")
    change.add_argument("path")
    change.add_argument("deployment_id")
    change.add_argument("--classification", required=True)
    change.add_argument("--incident-start")
    change.add_argument("--recovered-at")
    enrichment = sub.add_parser("enrich")
    enrichment.add_argument("path")
    enrichment.add_argument("deployment_id")
    enrichment.add_argument("--baseline-sha", required=True)
    enrichment.add_argument("--compare-json", required=True)
    for name in ("pause", "resume", "cancel-pending"):
        command = sub.add_parser(name)
        command.add_argument("path")
    args = parser.parse_args(argv)
    try:
        if args.command == "init":
            init(args.path)
        elif args.command == "classify":
            classify(args.path, args.deployment_id, args.classification, args.incident_start, args.recovered_at)
        elif args.command == "enrich":
            enrich(args.path, args.deployment_id, args.baseline_sha, read_comparison(args.compare_json))
        else:
            {"pause": pause, "resume": resume, "cancel-pending": cancel_pending}[args.command](args.path)
    except (ObservationError, OSError):
        print("release observations: operation rejected", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
