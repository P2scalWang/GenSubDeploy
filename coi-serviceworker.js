/*! coi-serviceworker v0.1.7 | MIT License | https://github.com/gzguidoti/coi-serviceworker */
if (typeof window === "undefined") {
    self.addEventListener("install", () => self.skipWaiting());
    self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
    self.addEventListener("fetch", e => {
        if (e.request.cache === "only-if-cached" && e.request.mode !== "same-origin") return;
        e.respondWith(
            fetch(e.request).then(r => {
                if (r.status === 0) return r;
                const headers = new Headers(r.headers);
                headers.set("Cross-Origin-Embedder-Policy", "require-corp");
                headers.set("Cross-Origin-Opener-Policy", "same-origin");
                return new Response(r.body, { status: r.status, statusText: r.statusText, headers });
            }).catch(err => console.error(err))
        );
    });
} else {
    (() => {
        const script = document.currentScript;
        if (window.isSecureContext && "serviceWorker" in navigator) {
            navigator.serviceWorker.register(script.src).then(reg => {
                reg.addEventListener("updatefound", () => {
                    try {
                        window.location.reload();
                    } catch {}
                });
                if (navigator.serviceWorker.controller) {
                    console.log("COI Service Worker Active");
                } else {
                    window.location.reload();
                }
            }).catch(err => console.error("COI registration failed", err));
        }
    })();
}
