PREVIEW_URL ?= http://localhost:19006
PREVIEW_OUT ?= artifacts/preview.png
PLAYWRIGHT_BROWSER ?= chromium
PLAYWRIGHT_WITH_DEPS ?= 0

ifeq ($(PLAYWRIGHT_WITH_DEPS),1)
PLAYWRIGHT_INSTALL_ARGS = --with-deps $(PLAYWRIGHT_BROWSER)
else
PLAYWRIGHT_INSTALL_ARGS = $(PLAYWRIGHT_BROWSER)
endif

.PHONY: build lint test preview-deps preview-screenshot

install:
	pnpm install

build: install
	pnpm run build

package: build
	pnpm run package
	
pubslish: build
	pnpm run publish

lint:
	npm run lint

test:
	npm test

preview-deps:
	uv venv .venv
	uv pip install --python .venv/bin/python --upgrade -r scripts/requirements.txt
	uv run --python .venv/bin/python playwright install $(PLAYWRIGHT_INSTALL_ARGS)

preview-screenshot: preview-deps
	uv run --python .venv/bin/python scripts/preview_screenshot.py --url $(PREVIEW_URL) --out $(PREVIEW_OUT)

clean:
	rm -rf artifacts dist node_modules .vscode-test .venv .mypy_cache
	rm -f *.vsix
	rm -rf .venv
