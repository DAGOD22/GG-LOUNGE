// Clean, instant offline mock for Yandex Games SDK (YaGames).
// Granny calls YaGames.init() at boot to detect device type and hook ad callbacks.
// This mock resolves instantly with desktop profile and resolves all ad callbacks cleanly.
(function () {
  var mockYsdk = {
    deviceInfo: {
      type: "desktop",
      isMobile: function () {
        return false;
      },
      isTablet: function () {
        return false;
      },
      isDesktop: function () {
        return true;
      },
      isTV: function () {
        return false;
      },
    },
    adv: {
      showFullscreenAdv: function (opt) {
        try {
          if (opt && opt.callbacks && typeof opt.callbacks.onClose === "function") {
            opt.callbacks.onClose(true);
          }
        } catch (e) {}
        return Promise.resolve();
      },
      showRewardedVideo: function (opt) {
        try {
          if (opt && opt.callbacks) {
            if (typeof opt.callbacks.onRewarded === "function") opt.callbacks.onRewarded();
            if (typeof opt.callbacks.onClose === "function") opt.callbacks.onClose();
          }
        } catch (e) {}
        return Promise.resolve();
      },
      getBannerAdvStatus: function () {
        return Promise.resolve({ stickyAdvIsShowing: false });
      },
    },
    auth: {
      isAuthorized: function () {
        return false;
      },
    },
    feedback: {
      canReview: function () {
        return Promise.resolve({ value: false });
      },
    },
  };

  window.YaGames = {
    init: function () {
      return Promise.resolve(mockYsdk);
    },
  };
})();
