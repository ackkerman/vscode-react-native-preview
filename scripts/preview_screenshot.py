"""Capture a preview screenshot of the Expo web app.

Usage:
  make preview-screenshot

Requirements:
  pip install playwright
  python -m playwright install chromium
"""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Optional

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright


def capture(url: str, output: Path, timeout_ms: int, wait_ms: int) -> None:
  output.parent.mkdir(parents=True, exist_ok=True)
  with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 720})
    page.goto(url, timeout=timeout_ms)
    page.wait_for_timeout(wait_ms)
    page.screenshot(path=str(output), full_page=True)
    browser.close()


def parse_args(argv: Optional[list[str]] = None) -> argparse.Namespace:
  parser = argparse.ArgumentParser(description="Capture preview screenshot from Expo web app.")
  parser.add_argument("--url", required=True, help="Expo web preview URL (e.g., http://localhost:19006)")
  parser.add_argument("--out", required=True, type=Path, help="Output image path (e.g., artifacts/preview.png)")
  parser.add_argument(
    "--timeout",
    type=int,
    default=15000,
    help="Navigation timeout in milliseconds (default: 15000)",
  )
  parser.add_argument(
    "--wait",
    type=int,
    default=2000,
    help="Additional wait after load in milliseconds to allow UI to settle (default: 2000)",
  )
  return parser.parse_args(argv)


def main(argv: Optional[list[str]] = None) -> int:
  args = parse_args(argv)
  try:
    capture(args.url, args.out, args.timeout, args.wait)
  except PlaywrightTimeoutError as exc:
    print(f"Navigation timed out: {exc}")
    return 1
  except Exception as exc:  # noqa: BLE001
    print(f"Failed to capture screenshot: {exc}")
    return 1
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
