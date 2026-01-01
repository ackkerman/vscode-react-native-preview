PREVIEW_URL ?= http://localhost:19006
PREVIEW_OUT ?= artifacts/preview.png
PLAYWRIGHT_BROWSER ?= chromium
PLAYWRIGHT_WITH_DEPS ?= 0

ifeq ($(PLAYWRIGHT_WITH_DEPS),1)
PLAYWRIGHT_INSTALL_ARGS = --with-deps $(PLAYWRIGHT_BROWSER)
else
PLAYWRIGHT_INSTALL_ARGS = $(PLAYWRIGHT_BROWSER)
endif

.PHONY: build preview-deps preview-screenshot

build:
	pnpm run build

package: build
	pnpm run package

preview-deps:
	uv venv .venv
	uv pip install --python .venv/bin/python --upgrade -r scripts/requirements.txt
	uv run --python .venv/bin/python playwright install $(PLAYWRIGHT_INSTALL_ARGS)

preview-screenshot: preview-deps
	uv run --python .venv/bin/python scripts/preview_screenshot.py --url $(PREVIEW_URL) --out $(PREVIEW_OUT)

clean:
	rm -rf artifacts
	rm -rf dist
	rm -rf node_modules
	rm -rf .vscode-test
	rm *.vsix
	rm -rf .venv
