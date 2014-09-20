#	-*- Makefile -*-
# Copyright (C) 2014, Christof Meerwald
# http://cmeerw.org
#

DONT_PACKAGE=.svn Makefile README hikingmaps.svg manifest.json screenshots tests

IGNORE_APPCACHE=LICENSE hikingmaps*.png manifest.webapp offline.appcache

.PHONY:	index.html manifest.json manifest.webapp offline.appcache

ifdef VERSION
all:	index.html manifest.webapp manifest.json offline.appcache
else
all:
	@echo "Need to define version"
	@exit 1
endif

manifest.webapp:
	@sed -i -e 's/"version"\s*:\s*"[0-9a-zA-Z.-]\+"/"version": "$(VERSION)"/' $@

manifest.json:
	@sed -i -e 's/"version"\s*:\s*"[0-9a-zA-Z.-]\+"/"version": "$(VERSION)"/' $@

index.html:
	@sed -i -e 's|\(<span id="hikingmaps-version">\)[0-9a-zA-Z.-]\+\(</span>\)|\1$(VERSION)\2|' $@

offline.appcache:
	@{ echo "CACHE MANIFEST" && echo "# v$(VERSION)" && \
	find . \
		$(foreach fname,$(DONT_PACKAGE) $(IGNORE_APPCACHE),-name "$(fname)" -prune -o) \
		-type f -print | \
	cut -b2- | sort; \
	echo ""; \
	echo "NETWORK:"; \
	echo "*"; } > $@

release:	all
	@echo "Building HikingMaps-$(VERSION).zip"
	@rm -f "../HikingMaps-$(VERSION).zip"
	@{ \
		find . $(foreach fname,$(IGNORE_APPCACHE),-name "$(fname)" -o) \
			-false && \
		tail -n +3 offline.appcache | head -n -3 | \
		sed -e 's|^/|./|' ; \
	} | \
	zip "../HikingMaps-$(VERSION).zip" -@rpX
