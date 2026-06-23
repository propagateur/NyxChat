// Point the download buttons at the assets of the latest GitHub release, so
// the links always track the current version without editing this page.
// Falls back to the releases page if the API call fails (rate limit, offline).
(function () {
  "use strict";

  var REPO = "propagateur/NyxChat";
  var targets = [
    { id: "dl-win", match: function (n) { return /-setup\.exe$/.test(n); } },
    { id: "dl-mac", match: function (n) { return /\.dmg$/.test(n); } },
    { id: "dl-deb", match: function (n) { return /\.deb$/.test(n); } },
    { id: "dl-rpm", match: function (n) { return /\.rpm$/.test(n); } },
  ];

  fetch("https://api.github.com/repos/" + REPO + "/releases/latest", {
    headers: { Accept: "application/vnd.github+json" },
  })
    .then(function (r) {
      if (!r.ok) throw new Error("release lookup failed: " + r.status);
      return r.json();
    })
    .then(function (release) {
      var version = document.getElementById("version");
      if (version && release.tag_name) version.textContent = release.tag_name;

      var assets = release.assets || [];
      targets.forEach(function (t) {
        var el = document.getElementById(t.id);
        if (!el) return;
        var asset = assets.find(function (a) { return t.match(a.name); });
        if (asset) el.setAttribute("href", asset.browser_download_url);
      });
    })
    .catch(function (err) {
      // Buttons keep their default href (the releases page), which is fine.
      console.warn("Could not load latest release:", err);
    });
})();
