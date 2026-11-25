/* GG-Lounge: Grindcraft's Orange Games publisher bumper loads its fonts,
 * images and spine atlases from fbrq.io. That host is unreachable offline and
 * on most school networks, so the bumper crashes while building its spine
 * sprites and the browser never reaches the real game.
 *
 * The bumper also loads the game's own texture atlas, so we cannot just skip
 * it. Instead we make the missing publisher assets harmless: spine sprites
 * become inert when their data failed to load, and the bumper's own code then
 * finishes its transition into the "Game" state as normal. */
(function () {
  var tries = 0;
  var timer = setInterval(function () {
    tries++;
    if (typeof Phaser === "undefined" || !Phaser.GameObjectFactory) {
      if (tries > 200) clearInterval(timer);
      return;
    }
    clearInterval(timer);
    var factory = Phaser.GameObjectFactory.prototype;
    var originalSpine = factory.spine;
    if (typeof originalSpine !== "function") return;
    factory.spine = function (x, y, key) {
      try {
        return originalSpine.apply(this, arguments);
      } catch (e) {
        // Missing publisher atlas: hand back an empty sprite so callers
        // that add it to the world simply draw nothing.
        var sprite = new Phaser.Sprite(this.game, x, y, key);
        sprite.create = function () {};
        sprite.setAnimationByName = function () {};
        sprite.setSkinByName = function () {};
        sprite.update = function () {};
        return sprite;
      }
    };
  }, 50);
})();
