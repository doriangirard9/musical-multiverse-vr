.PHONY: help server dev all killall clean

PORT     ?= 5179
API_PORT ?= 3000
URL      ?= https://localhost:$(PORT)
API_URL  ?= http://localhost:$(API_PORT)

help:
	@echo "Usage: make [target]"
	@echo "Targets:"
	@echo "  server   - Start the server"
	@echo "  dev      - Start the development environment"
	@echo "  all      - Start both, open browser at $(URL)"
	@echo "  clean    - Remove node_modules directories"

server:
	cd server-config && npm install && node server.js

dev:
	npm install && VITE_PORT=$(PORT) npm run dev -- --port $(PORT)

all:
	-lsof -ti:$(PORT)     | xargs kill -9 2>/dev/null
	-lsof -ti:$(API_PORT) | xargs kill -9 2>/dev/null
	$(MAKE) -j2 server dev & \
	echo "Waiting for backend ($(API_URL))..." && \
	until curl -sf -o /dev/null "$(API_URL)/api/sessions/public"; do sleep 0.2; done && \
	echo "Waiting for frontend ($(URL))..." && \
	until curl -sk -o /dev/null "$(URL)"; do sleep 0.2; done && \
	echo "Both up, opening browser..." && \
	if [ "$$(uname)" = "Darwin" ]; then \
		open -a "Google Chrome" "$(URL)"; \
	else \
		google-chrome "$(URL)"; \
	fi

clean:
	-rm -rf node_modules server-config/node_modules