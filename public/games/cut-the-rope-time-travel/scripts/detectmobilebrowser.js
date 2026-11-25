/* GG-LOUNGE: the original build loaded jquery.browser-style mobile detection
   from a script that is no longer distributed. These builds only branch on a
   coarse "is this a phone" check, so a tiny UA test is enough. */
(function (w) {
  var ua = navigator.userAgent || '';
  var mobile = /android|iphone|ipad|ipod|iemobile|blackberry|opera mini|mobile/i.test(ua);
  w.detectMobileBrowser = function () { return mobile; };
  w.isMobile = { any: mobile, android: /android/i.test(ua), ios: /iphone|ipad|ipod/i.test(ua) };
})(window);
