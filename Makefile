#	-*- Makefile -*-
# Copyright (C) 2014, Christof Meerwald
# http://cmeerw.org
#

IGNORE_APPCACHE=hikingmaps*.png offline.appcache

.PHONY:	www/index.html ubuntu/manifest.json fxos/manifest.webapp www/offline.appcache

ifdef VERSION
all:	www/index.html fxos/manifest.webapp ubuntu/manifest.json www/offline.appcache
else
all:
	@echo "Need to define version"
	@exit 1
endif

fxos/manifest.webapp:
	@sed -i -e 's/"version"\s*:\s*"[0-9a-zA-Z.-]\+"/"version": "$(VERSION)"/' $@

ubuntu/manifest.json:
	@sed -i -e 's/"version"\s*:\s*"[0-9a-zA-Z.-]\+"/"version": "$(VERSION)"/' $@

www/index.html:
	@sed -i -e 's|\(<span id="hikingmaps-version">\)[0-9a-zA-Z.-]\+\(</span>\)|\1$(VERSION)\2|' $@

www/offline.appcache:
	@{ echo "CACHE MANIFEST" && echo "# v$(VERSION)" && \
	find www \
		$(foreach fname,$(IGNORE_APPCACHE),-name "$(fname)" -prune -o) \
		-type f -print | \
	sed -e 's|^www/|/|' | sort; \
	echo ""; \
	echo "NETWORK:"; \
	echo "*"; } > $@

release:	all
	@echo "Building HikingMaps-$(VERSION).zip"
	@rm -f "../HikingMaps-$(VERSION).zip"
	@{ \
		find www $(foreach fname,$(IGNORE_APPCACHE),-name "$(fname)" -o) \
			-false | sed -e 's|^www/|./|' && \
		tail -n +3 www/offline.appcache | head -n -3 | \
		sed -e 's|^/|./|' ; \
	} | \
	{ zip "../HikingMaps-$(VERSION).zip" -rpX LICENSE &&
	  cd fxos && zip "../../HikingMaps-$(VERSION).zip" -rpX * && cd .. && \
	  cd www && zip "../../HikingMaps-$(VERSION).zip" -@rpX && cd .. ; }
