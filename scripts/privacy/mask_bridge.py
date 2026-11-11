"""Local mask/unmask bridge for Sverko.

Russian fragments go through pii-mask (Natasha plus Russian checksums).
Other fragments go through Microsoft Presidio. Both feed one mapping, so the
same person, organization, or number keeps one label across the whole request.
The mapping never leaves this process except back to the Sverko server.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
try:
    from pii_mask.core import Masker
    from pii_mask.recognizers import Entity
except ImportError:
    sys.path.insert(0, str(ROOT / "third_party" / "pii-mask"))
    from pii_mask.core import Masker
    from pii_mask.recognizers import Entity

PRESIDIO_TYPES = {
    "PERSON": "PERSON",
    "EMAIL_ADDRESS": "EMAIL",
    "PHONE_NUMBER": "PHONE",
    "CREDIT_CARD": "CARD",
    "IBAN_CODE": "ACCOUNT",
    "CRYPTO": "ACCOUNT",
    "LOCATION": "ADDRESS",
    "NRP": "PERSON",
}

_analyzer = None
_analyzer_failed = False


def is_russian(text: str) -> bool:
    letters = [ch for ch in text if ch.isalpha()]
    if not letters:
        return True
    cyrillic = sum(1 for ch in letters if "\u0400" <= ch <= "\u04ff")
    return cyrillic / len(letters) >= 0.35


def analyzer():
    global _analyzer, _analyzer_failed
    if _analyzer_failed:
        return None
    if _analyzer is not None:
        return _analyzer
    try:
        from presidio_analyzer import AnalyzerEngine
        from presidio_analyzer.nlp_engine import NlpEngineProvider

        provider = NlpEngineProvider(
            nlp_configuration={
                "nlp_engine_name": "spacy",
                "models": [{"lang_code": "en", "model_name": "en_core_web_sm"}],
            }
        )
        _analyzer = AnalyzerEngine(nlp_engine=provider.create_engine(), supported_languages=["en"])
    except Exception:
        _analyzer_failed = True
        _analyzer = None
    return _analyzer


def presidio_entities(text: str) -> list[Entity]:
    engine = analyzer()
    if engine is None or not text.strip():
        return []
    found: list[Entity] = []
    for item in engine.analyze(text=text, language="en"):
        etype = PRESIDIO_TYPES.get(item.entity_type)
        if not etype:
            continue
        surface = text[item.start : item.end]
        key = " ".join(surface.lower().replace("ё", "е").split())
        if len(key) < 2:
            continue
        found.append(Entity(etype, surface, item.start, item.end, key, source="presidio"))
    return found


def mask_items(items: list[dict]) -> dict:
    mapping: dict = {"version": 1, "labels": {}}
    russian = Masker(ner=True)
    other = Masker(ner=False)
    masked = []
    for item in items:
        text = str(item.get("text") or "")
        if is_russian(text):
            text, mapping = russian.mask(text, mapping)
        else:
            text, mapping = other.mask(text, mapping, extra_entities=presidio_entities(text))
        masked.append({"id": item.get("id"), "text": text})
    return {"items": masked, "mapping": mapping}


def unmask_text(text: str, mapping: dict) -> str:
    return Masker(ner=False).unmask(text, mapping or {"version": 1, "labels": {}})


def main() -> None:
    payload = json.load(sys.stdin)
    action = payload.get("action")
    if action == "mask":
        result = mask_items(payload.get("items") or [])
    elif action == "unmask":
        result = {"text": unmask_text(str(payload.get("text") or ""), payload.get("mapping") or {})}
    else:
        raise SystemExit("unknown action")
    json.dump(result, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
