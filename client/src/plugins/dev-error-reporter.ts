import type { Plugin } from "vite";

const REPORTER_SCRIPT = `
(function() {
  var reported = {};
  function key(msg) { return String(msg).slice(0, 200); }
  function shouldReport(msg) {
    var k = key(msg);
    var now = Date.now();
    if (reported[k] && now - reported[k] < 2000) return false;
    reported[k] = now;
    return true;
  }
  function send(payload) {
    try { navigator.sendBeacon('/__dev-error', JSON.stringify(payload)); } catch(e) {}
  }

  window.addEventListener('error', function(e) {
    if (!shouldReport(e.message)) return;
    send({
      type: 'error',
      message: e.message || String(e.error),
      source: e.filename,
      line: e.lineno,
      column: e.colno,
      stack: e.error && e.error.stack
    });
  });

  window.addEventListener('unhandledrejection', function(e) {
    var msg = e.reason instanceof Error ? e.reason.message : String(e.reason);
    if (!shouldReport(msg)) return;
    send({
      type: 'error',
      message: msg,
      stack: e.reason instanceof Error ? e.reason.stack : undefined
    });
  });

  var _fetch = window.fetch;
  window.fetch = function() {
    return _fetch.apply(this, arguments).then(function(res) {
      if (res.status >= 400) {
        var url = typeof arguments[0] === 'string' ? arguments[0] : (arguments[0] && arguments[0].url) || '';
        var method = (arguments[1] && arguments[1].method) || 'GET';
        res.clone().text().then(function(body) {
          if (!shouldReport(method + ' ' + url + ' ' + res.status)) return;
          send({
            type: 'fetch',
            method: method.toUpperCase(),
            url: url,
            status: res.status,
            body: body.slice(0, 1000)
          });
        }).catch(function() {});
      }
      return res;
    });
  };
})();
`;

export function devErrorReporter(): Plugin {
  return {
    name: "dev-error-reporter",
    apply: "serve",

    configureServer(server) {
      server.middlewares.use("/__dev-error", (req, res) => {
        let body = "";
        req.on("data", (chunk: Buffer) => (body += chunk));
        req.on("end", () => {
          try {
            const data = JSON.parse(body);
            if (data.type === "fetch") {
              const bodyPreview = data.body ? `\n  Body: ${data.body}` : "";
              console.error(
                `\n[browser-fetch-error] ${data.method} ${data.url} → ${data.status}${bodyPreview}\n`,
              );
            } else {
              const loc = data.source
                ? `\n  at ${data.source}${data.line ? `:${data.line}` : ""}${data.column ? `:${data.column}` : ""}`
                : "";
              const stack = data.stack ? `\n  ${data.stack}` : "";
              console.error(
                `\n[browser-error] ${data.message}${loc}${stack}\n`,
              );
            }
          } catch {
            // ignore malformed payloads
          }
          res.statusCode = 204;
          res.end();
        });
      });
    },

    transformIndexHtml() {
      return [
        {
          tag: "script",
          children: REPORTER_SCRIPT,
          injectTo: "head-prepend",
        },
      ];
    },
  };
}
