#	-*- Makefile -*-
# Copyright (C) 2014, Christof Meerwald
# http://cmeerw.org
#

DONT_PACKAGE=.svn Makefile README hikingmaps.svg manifest.json screenshots

IGNORE_APPCACHE=LICENSE hikingmaps*.png manifest.webapp offline.appcache

.PHONY:	manifest.webapp offline.appcache

all:
	@echo "Nothing to do"

manifest.webapp:
	@sed -i -e 's/"version"\s*:\s*"[0-9.]\+"/"version": "$(VERSION)"/' $@

offline.appcache:
	@{ echo "CACHE MANIFEST" && echo "# v0.1" && \
	find . \
		$(foreach fname,$(DONT_PACKAGE) $(IGNORE_APPCACHE),-name "$(fname)" -prune -o) \
		-type f -print | \
	cut -b2- | sort; } > $@

ifdef VERSION
release:	manifest.webapp offline.appcache
	@echo "Building HikingMaps-$(VERSION).zip"
	@rm -f "../HikingMaps-$(VERSION).zip"
	@{ \
		find . $(foreach fname,$(IGNORE_APPCACHE),-name "$(fname)" -o) \
			-false && \
		tail -n +3 offline.appcache | \
		sed -e 's|^/|./|' ; \
	} | \
	zip "../HikingMaps-$(VERSION).zip" -@rpX
else
release:
	@echo "Need to define version for release"
	@exit 1
endif
