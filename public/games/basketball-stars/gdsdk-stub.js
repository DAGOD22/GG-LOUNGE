(function () {
  window.gdsdk = {
    play: function () {},
    preloadAd: function () {
      return Promise.resolve();
    },
    showAd: function () {
      return Promise.resolve();
    },
    openConsole: function () {},
    showBanner: function () {
      return Promise.resolve();
    },
  };

  function boot() {
    try {
      if (window.GD_OPTIONS && typeof window.GD_OPTIONS.onEvent === "function") {
        window.GD_OPTIONS.onEvent({ name: "SDK_READY" });
        window.GD_OPTIONS.onEvent({ name: "SDK_GAME_START" });
      }
      var l = document.getElementById("loader");
      if (l) l.style.display = "none";
      var content = document.getElementById("content");
      if (content) {
        content.dispatchEvent(new Event("SDK_GAME_START"));
      }
    } catch (e) {
      console.warn("Basketball stars stub event:", e);
    }
  }

  if (document.readyState === "complete") {
    setTimeout(boot, 100);
  } else {
    window.addEventListener("load", function () {
      setTimeout(boot, 100);
    });
  }
})();
