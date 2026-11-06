// Entry point: the core and adapter files have already loaded (see manifest.json for the order).
// background.js also injects these files into LinkedIn tabs open during an update, into every frame;
// skip the frames the manifest leaves out (/tscp-serving/, and blank ad frames).
if (location.hostname === 'www.linkedin.com' && !location.pathname.startsWith('/tscp-serving/')) CN.start();
