PREVIEW_URL ?= http://localhost:19006
PREVIEW_OUT ?= artifacts/preview.png

.PHONY: build preview-deps preview-screenshot

build:
	pnpm run build

package: build
	pnpm run package

preview-deps:
	python -m pip install --upgrade -r scripts/requirements.txt
	python -m playwright install --with-deps chromium

preview-screenshot: preview-deps
	python scripts/preview_screenshot.py --url $(PREVIEW_URL) --out $(PREVIEW_OUT)
