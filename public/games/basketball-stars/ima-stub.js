/* Offline stub of Google IMA3 (imasdk.googleapis.com/js/sdkloader/ima3.js).
 * The game shows video ads through IMA; at school (or offline) those are
 * unreachable, so every ad request instantly "errors" — the game already
 * handles AD_ERROR gracefully and plays on without ads. */
(function () {
  function noop() {}
  var TYPES = [
    "AD_BREAK_READY", "AD_METADATA", "ALL_ADS_COMPLETED", "CLICK", "COMPLETE",
    "CONTENT_PAUSE_REQUESTED", "CONTENT_RESUME_REQUESTED", "DURATION_CHANGE",
    "FIRST_QUARTILE", "IMPRESSION", "LINEAR_CHANGED", "LOADED", "LOG", "MIDPOINT",
    "PAUSED", "RESUMED", "SKIPPABLE_STATE_CHANGED", "SKIPPED", "STARTED",
    "THIRD_QUARTILE", "USER_CLOSE", "VIDEO_CLICKED", "VIDEO_ICON_CLICKED",
    "VOLUME_CHANGED", "VOLUME_MUTED",
  ];
  var AdEventType = {};
  TYPES.forEach(function (t) { AdEventType[t] = t; });

  function FakeError() {}
  FakeError.prototype.getMessage = function () { return "ads unavailable (offline stub)"; };
  FakeError.prototype.getErrorCode = function () { return -1; };
  function FakeErrorEvent() { this.type = "AD_ERROR"; }
  FakeErrorEvent.prototype.getError = function () { return new FakeError(); };

  function AdsLoader() { this._listeners = {}; }
  AdsLoader.prototype.addEventListener = function (type, handler, capture, scope) {
    (this._listeners[type] = this._listeners[type] || []).push({ fn: handler, scope: scope });
  };
  AdsLoader.prototype.removeEventListener = function (type, handler) {
    var arr = this._listeners[type] || [];
    this._listeners[type] = arr.filter(function (l) { return l.fn !== handler; });
  };
  AdsLoader.prototype.requestAds = function () {
    var self = this;
    // Always fail fast: no ads available, game continues.
    setTimeout(function () {
      var arr = self._listeners["AD_ERROR"] || self._listeners[window.google.ima.AdErrorEvent.Type.AD_ERROR] || [];
      var ev = new FakeErrorEvent();
      arr.forEach(function (l) { try { l.fn.call(l.scope || null, ev); } catch (e) {} });
    }, 0);
  };
  AdsLoader.prototype.contentComplete = noop;
  AdsLoader.prototype.destroy = noop;

  function AdDisplayContainer() {}
  AdDisplayContainer.prototype.initialize = noop;
  AdDisplayContainer.prototype.destroy = noop;

  function AdsRequest() {
    this.adTagUrl = "";
    this.linearAdSlotWidth = 0;
    this.linearAdSlotHeight = 0;
    this.nonLinearAdSlotWidth = 0;
    this.nonLinearAdSlotHeight = 0;
  }
  function AdsRenderingSettings() {
    this.enablePreloading = false;
    this.restoreCustomPlaybackStateOnAdBreakComplete = false;
    this.uiElements = [];
  }

  window.google = window.google || {};
  window.google.ima = {
    settings: {
      setVpaidMode: noop,
      setLocale: noop,
      setDisableCustomPlaybackForIOS10Plus: noop,
      setNumRedirects: noop,
    },
    ImaSdkSettings: { VpaidMode: { ENABLED: 0, INSECURE: 1, DISABLED: 2 } },
    ViewMode: { NORMAL: "normal", FULLSCREEN: "fullscreen" },
    UiElements: { AD_ATTRIBUTION: "adAttribution", COUNTDOWN: "countdown" },
    AdsRequest: AdsRequest,
    AdsRenderingSettings: AdsRenderingSettings,
    AdDisplayContainer: AdDisplayContainer,
    AdsLoader: AdsLoader,
    AdsManagerLoadedEvent: { Type: { ADS_MANAGER_LOADED: "ADS_MANAGER_LOADED" } },
    AdErrorEvent: { Type: { AD_ERROR: "AD_ERROR" } },
    AdEvent: { Type: AdEventType },
  };
})();
