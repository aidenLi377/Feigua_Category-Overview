// 运行在页面 MAIN world，拦截真实 XHR / fetch
(function () {
  if (window.__feigua_interceptor_loaded) return;
  window.__feigua_interceptor_loaded = true;

  const MATCH = 'salesTrendData?periodType=';

  function save(url, body) {
    const div = document.getElementById('__feigua_data') || document.createElement('div');
    div.id = '__feigua_data';
    div.style.display = 'none';
    div.dataset.url = url;
    div.dataset.body = body;
    div.dataset.time = Date.now();
    if (!div.parentNode) document.body.appendChild(div);
  }

  // Hook XHR（构造器级）
  const OrigXHR = window.XMLHttpRequest;
  window.XMLHttpRequest = function () {
    const xhr = new OrigXHR();
    const origOpen = xhr.open;
    const origSend = xhr.send;
    xhr.open = function (method, url) { this.__fg_url = url; return origOpen.apply(this, arguments); };
    xhr.send = function (body) {
      const url = this.__fg_url || '';
      if (url && url.includes(MATCH)) {
        const self = this;
        self.addEventListener('load', () => {
          try {
            const b = self.responseType === 'json' ? JSON.stringify(self.response) : (self.responseText || String(self.response));
            save(url, String(b));
          } catch (_) {}
        });
      }
      return origSend.apply(this, arguments);
    };
    return xhr;
  };
  window.XMLHttpRequest.prototype = OrigXHR.prototype;

  // Hook fetch
  const origFetch = window.fetch;
  window.fetch = function (url, options) {
    const urlStr = (typeof url === 'string') ? url : (url && url.url) || '';
    if (urlStr.includes(MATCH)) {
      const promise = origFetch.apply(this, arguments);
      return promise.then(resp => {
        resp.clone().text().then(body => save(urlStr, body)).catch(() => {});
        return resp;
      });
    }
    return origFetch.apply(this, arguments);
  };
})();
