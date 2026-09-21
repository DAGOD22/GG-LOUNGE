// Classic requests mouse capture during startup. Modern browsers only allow it
// after a gesture. Skip the premature request; real clicks still use the native
// API. Handle both older synchronous exceptions and modern rejected promises.
(() => {
  const native = Element.prototype.requestPointerLock;
  if (!native) return;
  Element.prototype.requestPointerLock = function (...args) {
    if (navigator.userActivation && !navigator.userActivation.isActive && !document.pointerLockElement) return Promise.resolve();
    try { return Promise.resolve(native.apply(this, args)).catch(() => {}); }
    catch { return Promise.resolve(); }
  };
})();
