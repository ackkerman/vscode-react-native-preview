PREVIEW_URL ?= http://localhost:19006
PREVIEW_OUT ?= artifacts/preview.png

.PHONY: build preview-screenshot

build:
	npm run build

preview-screenshot:
	python scripts/preview_screenshot.py --url $(PREVIEW_URL) --out $(PREVIEW_OUT)
