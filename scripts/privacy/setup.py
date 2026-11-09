"""Create the local privacy environment and download the language models.

Clones are expected in third_party/pii-mask and third_party/presidio.
Presidio is installed from PyPI; its source tree is kept for review.
"""

from __future__ import annotations

import subprocess
import sys
import venv
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
VENV = ROOT / "third_party" / ".venv"
PII = ROOT / "third_party" / "pii-mask"
PRESIDIO = ROOT / "third_party" / "presidio"


def python_bin() -> Path:
    folder = "Scripts" if sys.platform == "win32" else "bin"
    name = "python.exe" if sys.platform == "win32" else "python"
    return VENV / folder / name


def run(cmd: list[str]) -> None:
    subprocess.check_call(cmd, cwd=ROOT)


def clone(url: str, dest: Path) -> None:
    if dest.exists():
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    subprocess.check_call(["git", "clone", "--depth", "1", url, str(dest)], cwd=ROOT)


def main() -> None:
    clone("https://github.com/dewil/pii-mask.git", PII)
    clone("https://github.com/microsoft/presidio.git", PRESIDIO)
    if not (PII / "pii_mask").is_dir() or not (PRESIDIO / "presidio-analyzer").is_dir():
        raise SystemExit("Не удалось скачать pii-mask или Presidio")
    if not VENV.exists():
        venv.create(VENV, with_pip=True)
    py = str(python_bin())
    run([py, "-m", "pip", "install", "--upgrade", "pip"])
    run([py, "-m", "pip", "install", "-e", str(PII)])
    run([py, "-m", "pip", "install", "presidio-analyzer>=2.2,<3", "presidio-anonymizer>=2.2,<3"])
    run([py, "-m", "spacy", "download", "en_core_web_sm"])


if __name__ == "__main__":
    main()
