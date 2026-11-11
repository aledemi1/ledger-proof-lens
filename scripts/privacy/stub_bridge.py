"""Deterministic mask/unmask stand-in for tests and machines without the local models.

The published server uses mask_bridge.py. This stub speaks the same JSON
protocol and only replaces email addresses and 10- or 12-digit identifiers,
so the TypeScript call path runs on every ordinary test.
"""

from __future__ import annotations

import json
import re
import sys

EMAIL = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
NUMBER = re.compile(r"(?<!\d)\d{10}(?:\d{2})?(?!\d)")


def mask_text(text: str, mapping: dict) -> str:
    labels: dict = mapping["labels"]

    def place(kind: str, original: str) -> str:
        key = original.lower()
        for token, meta in labels.items():
            if meta.get("type") == kind and meta.get("key") == key:
                return token
        number = 1 + sum(1 for meta in labels.values() if meta.get("type") == kind)
        token = "{{" + kind + "_" + str(number) + "}}"
        labels[token] = {"type": kind, "original": original, "key": key, "n": number}
        return token

    text = EMAIL.sub(lambda match: place("EMAIL", match.group(0)), text)
    return NUMBER.sub(lambda match: place("INN", match.group(0)), text)


def main() -> None:
    payload = json.load(sys.stdin)
    action = payload.get("action")
    if action == "mask":
        mapping = {"version": 1, "labels": {}}
        items = []
        for item in payload.get("items") or []:
            items.append({"id": item.get("id"), "text": mask_text(str(item.get("text") or ""), mapping)})
        json.dump({"items": items, "mapping": mapping}, sys.stdout, ensure_ascii=False)
        return
    if action == "unmask":
        text = str(payload.get("text") or "")
        labels = (payload.get("mapping") or {}).get("labels") or {}
        for token, meta in labels.items():
            original = meta.get("original") if isinstance(meta, dict) else None
            if original:
                text = text.replace(str(token), str(original))
        json.dump({"text": text}, sys.stdout, ensure_ascii=False)
        return
    raise SystemExit("unknown action")


if __name__ == "__main__":
    main()
