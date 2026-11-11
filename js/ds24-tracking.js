(function () {
  var CAM_KEY = "mb_ds24_cam";
  var UTM_KEY = "mb_ds24_utms";
  var UTM_NAMES = ["utm_source", "utm_medium", "utm_campaign", "utm_content"];
  var HOST = /^(?:https?:)?\/\/(?:[^/?#]*\.)?(?:checkout-ds24\.com|digistore24\.com)(?:[/?#]|$)/i;

  function params() {
    try {
      return new URLSearchParams(window.location.search);
    } catch (err) {
      return new URLSearchParams();
    }
  }

  function cleanCam(value) {
    var token = String(value || "").trim().toLowerCase();
    return /^[a-z0-9_-]{1,40}$/.test(token) ? token : "";
  }

  function cleanUtm(value) {
    var token = String(value || "").trim();
    return /^[A-Za-z0-9._~:-]{1,80}$/.test(token) ? token : "";
  }

  function readStore(key) {
    try {
      return window.sessionStorage.getItem(key);
    } catch (err) {
      return null;
    }
  }

  function writeStore(key, value) {
    try {
      window.sessionStorage.setItem(key, value);
    } catch (err) {}
  }

  function campaign() {
    var query = params();
    var fromUrl = cleanCam(query.get("cam")) || cleanCam(query.get("utm_source"));
    if (fromUrl) {
      writeStore(CAM_KEY, fromUrl);
      return fromUrl;
    }
    return cleanCam(readStore(CAM_KEY));
  }

  function utms() {
    var query = params();
    var stored = {};
    try {
      stored = JSON.parse(readStore(UTM_KEY) || "{}") || {};
    } catch (err) {
      stored = {};
    }
    var next = {};
    for (var i = 0; i < UTM_NAMES.length; i++) {
      var name = UTM_NAMES[i];
      var fresh = cleanUtm(query.get(name));
      if (fresh) next[name] = fresh;
      else if (cleanUtm(stored[name])) next[name] = cleanUtm(stored[name]);
    }
    if (campaign()) writeStore(UTM_KEY, JSON.stringify(next));
    return next;
  }

  function isCheckout(href) {
    return HOST.test(href || "");
  }

  function withTracking(href, cam, extra) {
    var hash = "";
    var hashAt = href.indexOf("#");
    if (hashAt !== -1) {
      hash = href.slice(hashAt);
      href = href.slice(0, hashAt);
    }
    var queryAt = href.indexOf("?");
    var path = queryAt === -1 ? href : href.slice(0, queryAt);
    var parts = queryAt === -1 || href.slice(queryAt + 1) === "" ? [] : href.slice(queryAt + 1).split("&");
    var index = {};
    for (var i = 0; i < parts.length; i++) {
      if (!parts[i]) continue;
      var eq = parts[i].indexOf("=");
      var key = eq === -1 ? parts[i] : parts[i].slice(0, eq);
      try {
        key = decodeURIComponent(key.replace(/\+/g, " "));
      } catch (err) {}
      index[key] = i;
    }
    function setParam(key, value) {
      var encoded = encodeURIComponent(key) + "=" + encodeURIComponent(value);
      if (Object.prototype.hasOwnProperty.call(index, key)) parts[index[key]] = encoded;
      else {
        index[key] = parts.length;
        parts.push(encoded);
      }
    }
    setParam("cam", cam);
    for (var u = 0; u < UTM_NAMES.length; u++) {
      var name = UTM_NAMES[u];
      if (extra[name] && !Object.prototype.hasOwnProperty.call(index, name)) setParam(name, extra[name]);
    }
    var kept = [];
    for (var j = 0; j < parts.length; j++) if (parts[j]) kept.push(parts[j]);
    return path + (kept.length ? "?" + kept.join("&") : "") + hash;
  }

  function decorate(anchor) {
    if (!anchor || anchor.nodeType !== 1 || anchor.tagName !== "A") return;
    var href = anchor.getAttribute("href");
    if (!href || !isCheckout(href)) return;
    var cam = campaign();
    if (!cam) return;
    var next = withTracking(href, cam, utms());
    if (next !== href) anchor.setAttribute("href", next);
  }

  function decorateTree(node) {
    if (!node || node.nodeType !== 1) return;
    decorate(node);
    if (node.querySelectorAll) {
      var links = node.querySelectorAll("a[href]");
      for (var i = 0; i < links.length; i++) decorate(links[i]);
    }
  }

  function boot() {
    campaign();
    var links = document.querySelectorAll("a[href]");
    for (var i = 0; i < links.length; i++) decorate(links[i]);
    if (!window.MutationObserver || !document.documentElement) return;
    var observer = new MutationObserver(function (records) {
      for (var r = 0; r < records.length; r++) {
        var record = records[r];
        if (record.type === "attributes") decorate(record.target);
        for (var n = 0; n < record.addedNodes.length; n++) decorateTree(record.addedNodes[n]);
      }
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["href"]
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
