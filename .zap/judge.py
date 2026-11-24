"""Judges a ZAP baseline report: fails on any finding of Medium risk or above.

Usage: python3 .zap/judge.py <report.json> [rules.tsv]

ZAP's own pass/fail works rule by rule, but a rule can report findings at
different risk levels, so the policy "Medium and above fails" is applied here,
to the report itself. Rules marked IGNORE in rules.tsv (triaged, with a reason)
are skipped. A Markdown table of every finding goes to the run's summary page
when GITHUB_STEP_SUMMARY is set, and to standard output either way.
"""

import json
import os
import sys

RISK = {3: "High", 2: "Medium", 1: "Low", 0: "Informational"}
FAIL_AT = 2  # Medium


def ignored_rules(path):
    ids = set()
    if not path or not os.path.exists(path):
        return ids
    with open(path, encoding="utf-8") as f:
        for line in f:
            if line.startswith("#") or not line.strip():
                continue
            parts = line.rstrip("\n").split("\t")
            if len(parts) >= 2 and parts[1].strip() == "IGNORE":
                ids.add(parts[0].strip())
    return ids


def main():
    if len(sys.argv) < 2:
        sys.exit("usage: judge.py <report.json> [rules.tsv]")
    with open(sys.argv[1], encoding="utf-8") as f:
        report = json.load(f)
    ignore = ignored_rules(sys.argv[2] if len(sys.argv) > 2 else None)

    findings = []
    for site in report.get("site", []):
        for alert in site.get("alerts", []):
            if str(alert.get("pluginid")) in ignore:
                continue
            findings.append((int(alert["riskcode"]), alert["pluginid"], alert["alert"], len(alert.get("instances", []))))
    findings.sort(reverse=True)
    failing = [f for f in findings if f[0] >= FAIL_AT]

    lines = ["## ZAP baseline", ""]
    if findings:
        lines += ["| Risk | Rule | Finding | URLs |", "|---|---|---|---|"]
        lines += [f"| {RISK[r]} | {pid} | {name} | {n} |" for r, pid, name, n in findings]
    else:
        lines.append("No findings.")
    verdict = (
        f"**Failed:** {len(failing)} finding(s) of Medium risk or above. Fix them, or triage and "
        "IGNORE them in `.zap/rules.tsv` with the reason."
        if failing
        else "**Passed:** nothing of Medium risk or above."
    )
    lines += ["", verdict, ""]
    text = "\n".join(lines)
    print(text)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as f:
            f.write(text + "\n")
    sys.exit(1 if failing else 0)


if __name__ == "__main__":
    main()
