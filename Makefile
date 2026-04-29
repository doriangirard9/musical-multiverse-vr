.PHONY: help server dev all killall clean

PORT ?= 5179
URL  ?= https://localhost:$(PORT)

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
	-lsof -ti:$(PORT) | xargs kill -9 2>/dev/null
	$(MAKE) -j2 server dev & \
	echo "Waiting for $(URL)..." && \
	until curl -sk -o /dev/null "$(URL)"; do sleep 0.2; done && \
	echo "Server up, opening browser..." && \
	if [ "$$(uname)" = "Darwin" ]; then \
		open -a "Google Chrome" "$(URL)"; \
	else \
		google-chrome "$(URL)"; \
	fi

clean:
	-rm -rf node_modules server-config/node_modules