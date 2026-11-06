// Entry point: the core and adapter files have already loaded (see manifest.json for the order).
// background.js also starts these files in LinkedIn frames that have no working copy (after an
// update, say); `started` tells it this frame has one. Frames the manifest leaves out
// (/tscp-serving/, blank ad frames) are skipped.
if (!CN.started && location.hostname === 'www.linkedin.com' && !location.pathname.startsWith('/tscp-serving/')) {
  CN.started = true;
  CN.start();
}
