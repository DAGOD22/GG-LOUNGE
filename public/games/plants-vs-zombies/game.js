// ==================== 游戏配置 ====================
const CONFIG = {
    CELL_WIDTH: 80,  // 格子宽度（从81减少到80）
    CELL_HEIGHT: 95,  // 格子高度（从85增加到95，增加10px）
    GRID_ROWS: 5,
    GRID_COLS: 9,  // 从8增加到9，右侧增加一列
    CELL_GAP: 3,
    TOP_OFFSET: 90,
    GRID_LEFT_OFFSET: 255,   // 从260减少到255（左移5px）
    GAME_WIDTH: 1400,
    GAME_HEIGHT: 600,
    SUN_VALUE: 25,
    INITIAL_SUN: 150,
    ZOMBIE_BASE_SPEED: 0.3,
    PEA_SPEED: 8,
    // 植物和僵尸的尺寸配置
    PLANT_WIDTH: 70,
    PLANT_HEIGHT: 70,
    ZOMBIE_WIDTH: 110,
    ZOMBIE_HEIGHT: 115
};

// ==================== DOM精灵管理器 ====================
class SpriteManager {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.sprites = new Map();
    }

    createSprite(id, src, x, y, width, height) {
        if (!this.container) {
            console.error('SpriteManager container not found!');
            return null;
        }

        let img = this.sprites.get(id);
        const needNewSrc = !img || !img.hasAttribute('data-current-src') || img.getAttribute('data-current-src') !== src;

        if (!img) {
            img = document.createElement('img');
            img.id = id;
            img.className = 'sprite';
            img.setAttribute('data-current-src', src);
            img.src = src;
            img.style.left = x + 'px';
            img.style.top = y + 'px';
            img.style.width = width + 'px';
            img.style.height = height + 'px';
            img.style.position = 'absolute';
            img.style.pointerEvents = 'none';
            this.container.appendChild(img);
            this.sprites.set(id, img);
            console.log('Created sprite:', id, src, 'at', x, y);
        } else {
            // 只在src真正改变时才更新
            if (needNewSrc) {
                img.setAttribute('data-current-src', src);
                img.src = src;
                console.log('Updated sprite src:', id, src);
            }
            img.style.left = x + 'px';
            img.style.top = y + 'px';
            img.style.width = width + 'px';
            img.style.height = height + 'px';
            img.style.display = 'block';
        }

        return img;
    }

    updateSprite(id, x, y) {
        const img = this.sprites.get(id);
        if (img) {
            img.style.left = x + 'px';
            img.style.top = y + 'px';
        }
    }

    removeSprite(id) {
        const img = this.sprites.get(id);
        if (img) {
            img.style.display = 'none';
            // 标记为可重用，不立即删除
        }
    }

    clear() {
        this.container.innerHTML = '';
        this.sprites.clear();
    }
}

// ==================== 资源加载器 ====================
class AssetLoader {
    constructor() {
        this.images = {};
        this.sounds = {};
        this.loaded = false;
    }

    loadImage(key, path) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                this.images[key] = img;
                resolve(img);
            };
            img.onerror = reject;
            img.src = path;
        });
    }

    loadAudio(key, path) {
        return new Promise((resolve, reject) => {
            const audio = new Audio(path);
            audio.addEventListener('canplaythrough', () => {
                this.sounds[key] = audio;
                resolve(audio);
            });
            audio.onerror = reject;
            audio.load();
        });
    }

    async loadAll() {
        const imagePromises = [
            // 只加载Canvas绘制需要的图片
            this.loadImage('background', 'images/Background.jpg'),
            this.loadImage('shop', 'images/Shop.png'),
            this.loadImage('card', 'images/Card.png'),
            this.loadImage('shovel', 'images/Shovel.png'),
            this.loadImage('shovelBank', 'images/ShovelBank.png'),
            this.loadImage('button', 'images/Button.png'),
            this.loadImage('sun', 'images/Sun.gif'),

            // 植物卡片图标（静态PNG）
            this.loadImage('peashooter', 'images/Peashooter.png'),
            this.loadImage('snowpea', 'images/SnowPea.png'),
            this.loadImage('sunflower', 'images/SunFlower.png'),
            this.loadImage('wallnut', 'images/WallNut.png'),
            this.loadImage('potatomine', 'images/PotatoMine.png'),
            this.loadImage('cherrybomb', 'images/CherryBomb.png'),
            this.loadImage('repeater', 'images/Repeater.png'),

            // 子弹
            this.loadImage('pea', 'images/Pea.png'),
            this.loadImage('peasnow', 'images/PeaSnow.png'),

            // 特效
            this.loadImage('boom', 'images/Boom.gif'),
            this.loadImage('burn', 'images/Burn.gif'),
            this.loadImage('potatomine_bomb', 'images/PotatoMineBomb.gif'),
        ];

        const audioPromises = [
            this.loadAudio('bgm', 'Grazy Dave.mp3'),
        ];

        try {
            await Promise.all([...imagePromises, ...audioPromises]);
            this.loaded = true;
            console.log('所有资源加载完成');
        } catch (error) {
            console.error('资源加载失败:', error);
        }
    }
}

// ==================== 植物类定义 ====================
class Plant {
    constructor(x, y, gridX, gridY) {
        this.x = x;
        this.y = y;
        this.gridX = gridX;
        this.gridY = gridY;
        // 计算居中位置
        this.width = CONFIG.PLANT_WIDTH;
        this.height = CONFIG.PLANT_HEIGHT;
        this.offsetX = (CONFIG.CELL_WIDTH - CONFIG.CELL_GAP * 2 - this.width) / 2;
        this.offsetY = (CONFIG.CELL_HEIGHT - CONFIG.CELL_GAP * 2 - this.height) / 2;
        this.health = 100;
        this.maxHealth = 100;
        this.timer = 0;
        this.frameX = 0;
        this.frameY = 0;
        this.sprite = null;
        this.spriteSrc = null; // GIF路径
        this.spriteId = `plant_${Math.random().toString(36).substr(2, 9)}`;
        this.animationSpeed = 100;
        this.lastAnimationUpdate = 0;
        this.useGif = false; // 是否使用GIF动画
    }

    draw(ctx, spriteManager) {
        // 计算实际显示位置（居中）
        const displayX = this.x + this.offsetX;
        const displayY = this.y + this.offsetY;

        // 如果使用GIF动画
        if (this.useGif && this.spriteSrc) {
            if (spriteManager) {
                spriteManager.createSprite(
                    this.spriteId,
                    this.spriteSrc,
                    displayX,
                    displayY,
                    this.width,
                    this.height
                );
            }
        } else if (this.sprite) {
            // 使用Canvas绘制静态图片
            ctx.drawImage(this.sprite, displayX, displayY, this.width, this.height);
        }

        // 绘制血条（居中显示）
        if (this.health < this.maxHealth) {
            const healthPercent = Math.max(0, this.health / this.maxHealth);
            const barWidth = this.width;
            const barX = displayX;
            const barY = displayY - 12;

            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(barX, barY, barWidth, 8);
            ctx.fillStyle = 'rgba(255, 0, 0, 0.8)';
            ctx.fillRect(barX, barY, barWidth, 8);
            ctx.fillStyle = 'rgba(0, 255, 0, 0.9)';
            ctx.fillRect(barX, barY, barWidth * healthPercent, 8);
        }

        // 受伤闪烁效果
        if (this.health < this.maxHealth * 0.3) {
            const flashAlpha = 0.2 + Math.sin(Date.now() / 100) * 0.1;
            ctx.fillStyle = `rgba(255, 0, 0, ${flashAlpha})`;
            ctx.fillRect(displayX, displayY, this.width, this.height);
        }
    }

    update(deltaTime) {
        this.timer += deltaTime;
    }

    takeDamage(amount) {
        this.health -= amount;

        // 坚果墙的损伤状态更新
        if (this.type === 'wallnut') {
            const healthPercent = this.health / this.maxHealth;
            if (healthPercent < 0.33 && this.cracked < 2) {
                this.cracked = 2;
                this.sprite = this.game?.assets?.images['wallnut2_anim'] || this.sprite;
            } else if (healthPercent < 0.66 && this.cracked < 1) {
                this.cracked = 1;
                this.sprite = this.game?.assets?.images['wallnut1_anim'] || this.sprite;
            }
        }

        return this.health <= 0;
    }
}

class Peashooter extends Plant {
    constructor(x, y, gridX, gridY) {
        super(x, y, gridX, gridY);
        this.health = 200;
        this.maxHealth = 200;
        this.shootTimer = 0;
        this.shootInterval = 1500;
        this.type = 'peashooter';
        this.recoil = 0;
        this.useGif = true;
        this.spriteSrc = 'images/Peashooter.gif';
    }

    update(deltaTime, game) {
        super.update(deltaTime);
        this.shootTimer += deltaTime;

        // 后坐力恢复
        if (this.recoil > 0) {
            this.recoil *= 0.9;
        }

        if (this.shootTimer >= this.shootInterval) {
            if (game.hasZombieInRow(this.gridY)) {
                game.shootPea(this);
                this.shootTimer = 0;
                this.recoil = 5; // 射击后坐力
            }
        }
    }
}

class SnowPea extends Plant {
    constructor(x, y, gridX, gridY) {
        super(x, y, gridX, gridY);
        this.health = 200;
        this.maxHealth = 200;
        this.shootTimer = 0;
        this.shootInterval = 1500;
        this.type = 'snowpea';
        this.recoil = 0;
        this.useGif = true;
        this.spriteSrc = 'images/SnowPea.gif';
    }

    update(deltaTime, game) {
        super.update(deltaTime);
        this.shootTimer += deltaTime;

        // 后坐力恢复
        if (this.recoil > 0) {
            this.recoil *= 0.9;
        }

        if (this.shootTimer >= this.shootInterval) {
            if (game.hasZombieInRow(this.gridY)) {
                game.shootPea(this, true);
                this.shootTimer = 0;
                this.recoil = 5;
            }
        }
    }
}

class Sunflower extends Plant {
    constructor(x, y, gridX, gridY) {
        super(x, y, gridX, gridY);
        this.health = 150;
        this.maxHealth = 150;
        this.productionTimer = 0;
        this.productionInterval = 10000;
        this.type = 'sunflower';
        this.producing = false;
        this.produceTimer = 0;
        this.useGif = true;
        this.spriteSrc = 'images/SunFlower.gif';
    }

    update(deltaTime, game) {
        super.update(deltaTime);
        this.productionTimer += deltaTime;

        // 生产时的闪光效果
        if (this.producing) {
            this.produceTimer += deltaTime;
            if (this.produceTimer > 500) {
                this.producing = false;
            }
        }

        if (this.productionTimer >= this.productionInterval) {
            game.spawnSun(this.x + this.width / 2, this.y + this.height / 2, 25);
            this.productionTimer = 0;
            this.producing = true;
            this.produceTimer = 0;
        }
    }
}

class WallNut extends Plant {
    constructor(x, y, gridX, gridY) {
        super(x, y, gridX, gridY);
        this.health = 2000;
        this.maxHealth = 2000;
        this.type = 'wallnut';
        this.cracked = 0;
        this.useGif = true;
        this.spriteSrc = 'images/WallNut.gif';
    }

    takeDamage(amount) {
        this.health -= amount;

        const healthPercent = this.health / this.maxHealth;
        if (healthPercent < 0.33 && this.cracked < 2) {
            this.cracked = 2;
            this.spriteSrc = 'images/WallNut2.gif';
        } else if (healthPercent < 0.66 && this.cracked < 1) {
            this.cracked = 1;
            this.spriteSrc = 'images/WallNut1.gif';
        }

        return this.health <= 0;
    }
}

class PotatoMine extends Plant {
    constructor(x, y, gridX, gridY) {
        super(x, y, gridX, gridY);
        this.health = 100;
        this.maxHealth = 100;
        this.type = 'potatomine';
        this.armed = false;
        this.armTimer = 0;
        this.armTime = 14000;
        this.exploded = false;
        this.useGif = true;
        this.spriteSrc = 'images/PotatoMine1.gif';
    }

    update(deltaTime, game) {
        super.update(deltaTime);

        if (!this.armed) {
            this.armTimer += deltaTime;
            if (this.armTimer >= this.armTime) {
                this.armed = true;
                this.spriteSrc = 'images/PotatoMine.gif';
            }
        }
    }

    explode(game) {
        if (this.armed && !this.exploded) {
            this.exploded = true;
            game.createExplosion(this.x, this.y, 'potato');
            return true;
        }
        return false;
    }
}

class CherryBomb extends Plant {
    constructor(x, y, gridX, gridY) {
        super(x, y, gridX, gridY);
        this.health = 10000;
        this.type = 'cherrybomb';
        this.timer = 0;
        this.explosionTime = 1000;
        this.exploded = false;
        this.useGif = true;
        this.spriteSrc = 'images/CherryBomb.gif';
    }

    update(deltaTime, game) {
        super.update(deltaTime);
        this.timer += deltaTime;

        if (this.timer >= this.explosionTime && !this.exploded) {
            this.exploded = true;
            game.createExplosion(this.x, this.y, 'cherry');
        }
    }
}

class Repeater extends Plant {
    constructor(x, y, gridX, gridY) {
        super(x, y, gridX, gridY);
        this.health = 250;
        this.maxHealth = 250;
        this.shootTimer = 0;
        this.shootInterval = 1500;
        this.type = 'repeater';
        this.recoil = 0;
        this.useGif = true;
        this.spriteSrc = 'images/Repeater.gif';
    }

    update(deltaTime, game) {
        super.update(deltaTime);
        this.shootTimer += deltaTime;

        if (this.recoil > 0) {
            this.recoil *= 0.9;
        }

        if (this.shootTimer >= this.shootInterval) {
            if (game.hasZombieInRow(this.gridY)) {
                game.shootPea(this);
                setTimeout(() => game.shootPea(this), 200);
                this.shootTimer = 0;
                this.recoil = 8;
            }
        }
    }
}

// ==================== 僵尸类定义 ====================
class Zombie {
    constructor(y, row) {
        this.x = CONFIG.GAME_WIDTH;
        this.y = y;
        this.row = row;
        // 使用新的僵尸尺寸，并居中
        this.width = CONFIG.ZOMBIE_WIDTH;
        this.height = CONFIG.ZOMBIE_HEIGHT;
        this.offsetY = (CONFIG.CELL_HEIGHT - CONFIG.CELL_GAP * 2 - this.height) / 2;
        // 碰撞判定范围（比显示尺寸小）
        this.hitboxInsetX = 25;  // 左右各缩小25px
        this.hitboxInsetY = 20;  // 上下各缩小20px
        this.health = 100;
        this.maxHealth = 100;
        this.speed = CONFIG.ZOMBIE_BASE_SPEED;
        this.damage = 0.5;
        this.eating = false;
        this.eatTimer = 0;
        this.eatInterval = 500; // 每0.5秒造成一次伤害
        this.frozen = false;
        this.frozenTimer = 0;
        this.frozenDuration = 3000;
        this.type = 'normal';
        this.spriteSrc = null;
        this.attackSpriteSrc = null;
        this.spriteId = `zombie_${Math.random().toString(36).substr(2, 9)}`;
        this.walkFrame = 0;
        this.attackFrame = 0;
        this.animationTimer = 0;
        this.animationInterval = 150;
        this.dying = false;
        this.deathTimer = 0;
        this.remove = false;
    }

    draw(ctx, spriteManager) {
        // 计算实际显示位置（垂直居中）
        const displayY = this.y + this.offsetY;

        // 使用DOM精灵显示GIF动画
        const currentSrc = this.eating ? this.attackSpriteSrc : this.spriteSrc;

        if (currentSrc && !this.dying) {
            spriteManager.createSprite(
                this.spriteId,
                currentSrc,
                this.x,
                displayY,
                this.width,
                this.height
            );
        } else if (this.dying) {
            spriteManager.removeSprite(this.spriteId);
        }

        // 在Canvas上绘制血条
        if (this.health < this.maxHealth && !this.dying) {
            const healthPercent = this.health / this.maxHealth;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(this.x, displayY - 12, this.width, 8);
            ctx.fillStyle = 'rgba(255, 0, 0, 0.8)';
            ctx.fillRect(this.x, displayY - 12, this.width, 8);
            ctx.fillStyle = 'rgba(0, 255, 0, 0.9)';
            ctx.fillRect(this.x, displayY - 12, this.width * healthPercent, 8);
        }

        // 减速效果 - 冰蓝色叠加
        if (this.frozen && !this.dying) {
            const flashAlpha = 0.15 + Math.sin(Date.now() / 200) * 0.08;
            ctx.fillStyle = `rgba(0, 191, 255, ${flashAlpha})`;
            ctx.fillRect(this.x, displayY, this.width, this.height);
        }

        // 进食时的红色边框
        if (this.eating && !this.dying) {
            ctx.strokeStyle = 'rgba(255, 100, 100, 0.6)';
            ctx.lineWidth = 3;
            ctx.strokeRect(this.x, displayY, this.width, this.height);
        }
    }

    update(deltaTime, game) {
        if (this.dying) {
            this.deathTimer += deltaTime;
            if (this.deathTimer > 500) {
                this.remove = true;
            }
            return;
        }

        // 减速效果
        if (this.frozen) {
            this.frozenTimer += deltaTime;
            if (this.frozenTimer >= this.frozenDuration) {
                this.frozen = false;
                this.frozenTimer = 0;
                this.speed = this.maxSpeed;
            }
        }

        this.eating = false;

        // 检测是否接触到植物
        // 检查僵尸与植物是否有重叠区域（使用更小的碰撞判定范围）
        let plant = null;
        const hitboxX = this.x + this.hitboxInsetX;
        const hitboxWidth = this.width - this.hitboxInsetX * 2;

        for (let p of game.plants) {
            if (p.gridY === this.row) {
                // 检查水平方向是否有重叠（使用缩小后的判定范围）
                if (hitboxX < p.x + p.width && hitboxX + hitboxWidth > p.x) {
                    plant = p;
                    break;
                }
            }
        }

        if (plant) {
            this.eating = true;
            this.eatTimer += deltaTime;

            // 持续造成伤害 - 增加伤害速度
            const damagePerMs = 100 / this.eatInterval;  // 从20提升到100
            const damageThisFrame = damagePerMs * deltaTime;

            if (plant.takeDamage(damageThisFrame)) {
                game.removePlant(plant);
                this.eating = false;
                this.eatTimer = 0;
            }
        } else {
            // 没有植物，继续移动
            this.x -= this.speed;
            this.eatTimer = 0;
        }

        // 检查是否到达房子
        if (this.x < -50) {
            game.gameOver();
        }
    }

    takeDamage(amount, freeze = false) {
        this.health -= amount;

        if (freeze && !this.frozen) {
            this.frozen = true;
            this.frozenTimer = 0;
            this.maxSpeed = this.speed;
            this.speed = this.speed * 0.5;
        }

        if (this.health <= 0 && !this.dying) {
            this.dying = true;
            return true;
        }
        return false;
    }
}

class NormalZombie extends Zombie {
    constructor(y, row) {
        super(y, row);
        this.health = 180;
        this.maxHealth = 180;
        this.speed = CONFIG.ZOMBIE_BASE_SPEED;
        this.type = 'normal';
        this.spriteSrc = 'images/ZombieWalk1.gif';
        this.attackSpriteSrc = 'images/ZombieAttack.gif';
    }
}

class ConeZombie extends Zombie {
    constructor(y, row) {
        super(y, row);
        this.health = 560;
        this.maxHealth = 560;
        this.speed = CONFIG.ZOMBIE_BASE_SPEED;
        this.type = 'cone';
        this.spriteSrc = 'images/ConeZombieWalk.gif';
        this.attackSpriteSrc = 'images/ConeZombieAttack.gif';
    }
}

class BucketZombie extends Zombie {
    constructor(y, row) {
        super(y, row);
        this.health = 1100;
        this.maxHealth = 1100;
        this.speed = CONFIG.ZOMBIE_BASE_SPEED;
        this.type = 'bucket';
        this.spriteSrc = 'images/BucketZombieWalk.gif';
        this.attackSpriteSrc = 'images/BucketZombieAttack.gif';
    }
}

class FootballZombie extends Zombie {
    constructor(y, row) {
        super(y, row);
        this.health = 1600;
        this.maxHealth = 1600;
        this.speed = CONFIG.ZOMBIE_BASE_SPEED * 2;
        this.type = 'football';
        this.spriteSrc = 'images/FootballZombieWalk.gif';
        this.attackSpriteSrc = 'images/FootballZombieAttack.gif';
    }
}

class ScreenZombie extends Zombie {
    constructor(y, row) {
        super(y, row);
        this.health = 500;
        this.maxHealth = 500;
        this.speed = CONFIG.ZOMBIE_BASE_SPEED * 0.7;
        this.type = 'screen';
        this.spriteSrc = 'images/ScreenZombieWalk.gif';
        this.attackSpriteSrc = 'images/ScreenZombieAttack.gif';
    }
}

// ==================== 子弹类 ====================
class Pea {
    constructor(x, y, damage, isFrozen = false) {
        this.x = x;
        this.y = y;
        this.width = 20;
        this.height = 20;
        this.speed = CONFIG.PEA_SPEED;
        this.damage = damage;
        this.isFrozen = isFrozen;
        this.remove = false;
        this.sprite = null;
    }

    draw(ctx) {
        if (this.sprite) {
            ctx.drawImage(this.sprite, this.x, this.y, this.width, this.height);
        }
    }

    update(deltaTime, game) {
        this.x += this.speed;

        if (this.x > CONFIG.GAME_WIDTH) {
            this.remove = true;
            return;
        }

        // 碰撞检测（使用僵尸的缩小判定范围）
        for (let zombie of game.zombies) {
            if (!zombie.dying) {
                // 使用僵尸的碰撞盒范围
                const hitboxX = zombie.x + zombie.hitboxInsetX;
                const hitboxWidth = zombie.width - zombie.hitboxInsetX * 2;
                const hitboxY = zombie.y + zombie.offsetY + zombie.hitboxInsetY;
                const hitboxHeight = zombie.height - zombie.hitboxInsetY * 2;

                if (this.x < hitboxX + hitboxWidth &&
                    this.x + this.width > hitboxX &&
                    this.y < hitboxY + hitboxHeight &&
                    this.y + this.height > hitboxY) {

                    zombie.takeDamage(this.damage, this.isFrozen);
                    this.remove = true;
                    break;
                }
            }
        }
    }
}

// ==================== 阳光类 ====================
class Sun {
    constructor(x, y, value, targetY) {
        this.x = x;
        this.y = y;
        this.targetY = targetY || y;
        this.value = value;
        this.width = 60;
        this.height = 60;
        this.remove = false;
        this.collected = false;
        this.sprite = null;
        this.falling = true;
        this.alpha = 1;

        // GIF动画支持
        this.spriteId = `sun_${Math.random().toString(36).substr(2, 9)}`;
        this.spriteSrc = null;
    }

    draw(ctx, spriteManager) {
        if (this.collected) {
            // 收集后隐藏DOM精灵
            if (spriteManager && this.spriteId) {
                spriteManager.removeSprite(this.spriteId);
            }
            // 使用Canvas绘制淡出效果
            if (this.sprite) {
                ctx.globalAlpha = this.alpha;
                ctx.drawImage(this.sprite, this.x, this.y, this.width, this.height);
                ctx.globalAlpha = 1;
            }
        } else if (this.spriteSrc && spriteManager) {
            // 使用GIF动画
            spriteManager.createSprite(this.spriteId, this.spriteSrc, this.x, this.y, this.width, this.height);
        } else if (this.sprite) {
            // 回退到静态图片
            ctx.globalAlpha = this.alpha;
            ctx.drawImage(this.sprite, this.x, this.y, this.width, this.height);
            ctx.globalAlpha = 1;
        }
    }

    update(deltaTime) {
        if (this.falling && this.y < this.targetY) {
            this.y += 2;
        }

        if (this.collected) {
            this.alpha -= 0.1;
            this.y -= 3;
            if (this.alpha <= 0) {
                this.remove = true;
            }
        }
    }

    isClicked(mouseX, mouseY) {
        return !this.collected &&
               mouseX > this.x &&
               mouseX < this.x + this.width &&
               mouseY > this.y &&
               mouseY < this.y + this.height;
    }
}

// ==================== 爆炸特效类 ====================
class Explosion {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.type = type;
        this.width = type === 'cherry' ? 200 : 100;
        this.height = type === 'cherry' ? 200 : 100;
        this.timer = 0;
        this.duration = 500;
        this.remove = false;
        this.damage = type === 'cherry' ? 1800 : 1800;
        this.sprite = null;
    }

    draw(ctx) {
        if (this.sprite) {
            const progress = this.timer / this.duration;
            const scale = 1 + progress * 0.5;
            const alpha = 1 - progress;

            ctx.globalAlpha = alpha;
            ctx.drawImage(
                this.sprite,
                this.x - (this.width * scale - this.width) / 2,
                this.y - (this.height * scale - this.height) / 2,
                this.width * scale,
                this.height * scale
            );
            ctx.globalAlpha = 1;
        }
    }

    update(deltaTime) {
        this.timer += deltaTime;
        if (this.timer >= this.duration) {
            this.remove = true;
        }
    }
}

// ==================== 植物卡片类 ====================
class PlantCard {
    constructor(x, y, type, cost, name, assetKey) {
        this.x = x;
        this.y = y;
        this.width = 70;
        this.height = 85;
        this.type = type;
        this.cost = cost;
        this.name = name;
        this.assetKey = assetKey;
        this.cooldown = 0;
        this.maxCooldown = 5000;
        this.selected = false;
        this.sprite = null;
        this.cardSprite = null;
    }

    draw(ctx, assets, currentSun) {
        this.drawAt(ctx, assets, currentSun, this.x, this.y);
    }

    drawAt(ctx, assets, currentSun, x, y) {
        // 绘制卡片背景
        if (this.cardSprite) {
            ctx.drawImage(this.cardSprite, x, y, this.width, this.height);
        }

        // 绘制植物图标
        const plantImg = assets.images[this.assetKey];
        if (plantImg) {
            ctx.drawImage(plantImg, x + 10, y + 10, 50, 50);
        }

        // 绘制冷却遮罩
        if (this.cooldown > 0) {
            const cooldownPercent = this.cooldown / this.maxCooldown;
            ctx.fillStyle = `rgba(0, 0, 0, ${cooldownPercent * 0.7})`;
            ctx.fillRect(x, y, this.width, this.height);
        }

        // 绘制阳光不足遮罩
        if (currentSun < this.cost) {
            ctx.fillStyle = 'rgba(128, 128, 128, 0.5)';
            ctx.fillRect(x, y, this.width, this.height);
        }

        // 绘制选中效果
        if (this.selected) {
            ctx.strokeStyle = '#00ff00';
            ctx.lineWidth = 3;
            ctx.strokeRect(x, y, this.width, this.height);
        }

        // 绘制花费
        ctx.fillStyle = '#ffff00';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(this.cost, x + this.width / 2, y + this.height - 8);
    }

    update(deltaTime) {
        if (this.cooldown > 0) {
            this.cooldown -= deltaTime;
            if (this.cooldown < 0) this.cooldown = 0;
        }
    }

    isClickable(currentSun) {
        return this.cooldown <= 0 && currentSun >= this.cost;
    }

    isClicked(mouseX, mouseY) {
        return mouseX > this.x &&
               mouseX < this.x + this.width &&
               mouseY > this.y &&
               mouseY < this.y + this.height;
    }

    select() {
        this.selected = true;
    }

    deselect() {
        this.selected = false;
    }

    activateCooldown() {
        this.cooldown = this.maxCooldown;
    }
}

// ==================== 游戏主类 ====================
class Game {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.assets = new AssetLoader();
        this.spriteManager = new SpriteManager('spriteLayer');

        this.canvas.width = CONFIG.GAME_WIDTH;
        this.canvas.height = CONFIG.GAME_HEIGHT;

        this.gameGrid = [];
        this.plants = [];
        this.zombies = [];
        this.peas = [];
        this.suns = [];
        this.explosions = [];

        this.sun = CONFIG.INITIAL_SUN;
        this.frame = 0;
        this.lastTime = 0;
        this.gameOverFlag = false;
        this.gameStarted = false;

        this.selectedCard = null;
        this.plantCards = [];
        this.shovelSelected = false;

        this.wave = 1;
        this.zombieSpawnTimer = 0;
        this.zombieSpawnInterval = 10000;
        this.sunSpawnTimer = 0;
        this.sunSpawnInterval = 10000;  // 从5000增加到10000，减少阳光掉落频率

        this.mouseX = 0;
        this.mouseY = 0;

        // 卡片滚动相关
        this.cardScrollOffset = 0;
        this.isScrolling = false;
        this.lastMouseX = 0;

        this.setupEventListeners();
    }

    async init() {
        await this.assets.loadAll();
        this.createGrid();
        this.createPlantCards();
        this.gameStarted = true;
        // 显示阳光计数器
        document.getElementById('sunCounter').style.display = 'block';
        this.gameLoop(0);
    }

    createGrid() {
        for (let y = 0; y < CONFIG.GRID_ROWS; y++) {
            for (let x = 0; x < CONFIG.GRID_COLS; x++) {
                this.gameGrid.push({
                    x: x * CONFIG.CELL_WIDTH + CONFIG.CELL_GAP + CONFIG.GRID_LEFT_OFFSET,
                    y: y * CONFIG.CELL_HEIGHT + CONFIG.CELL_GAP + CONFIG.TOP_OFFSET,
                    width: CONFIG.CELL_WIDTH - CONFIG.CELL_GAP * 2,
                    height: CONFIG.CELL_HEIGHT - CONFIG.CELL_GAP * 2
                });
            }
        }
    }

    createPlantCards() {
        const cardTypes = [
            { type: 'peashooter', cost: 100, name: '豌豆射手', key: 'peashooter' },
            { type: 'sunflower', cost: 50, name: '向日葵', key: 'sunflower' },
            { type: 'wallnut', cost: 50, name: '坚果墙', key: 'wallnut' },
            { type: 'snowpea', cost: 175, name: '寒冰射手', key: 'snowpea' },
            { type: 'potatomine', cost: 25, name: '土豆雷', key: 'potatomine' },
            { type: 'cherrybomb', cost: 150, name: '樱桃炸弹', key: 'cherrybomb' },
            { type: 'repeater', cost: 200, name: '双发射手', key: 'repeater' },
        ];

        let startX = 140;
        for (let i = 0; i < cardTypes.length; i++) {
            const card = cardTypes[i];
            this.plantCards.push(new PlantCard(
                startX + i * 80,
                10,
                card.type,
                card.cost,
                card.name,
                card.key
            ));
        }
    }

    setupEventListeners() {
        this.canvas.addEventListener('click', (e) => {
            if (this.gameOverFlag || !this.gameStarted) return;

            const rect = this.canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            this.handleClick(mouseX, mouseY);
        });

        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.mouseX = e.clientX - rect.left;
            this.mouseY = e.clientY - rect.top;

            // 处理拖拽滚动
            if (this.isScrolling) {
                const deltaX = this.mouseX - this.lastMouseX;
                this.cardScrollOffset -= deltaX;
                // 限制滚动范围
                const maxScroll = Math.max(0, this.plantCards.length * 80 - 413); // 413是卡片区域宽度
                this.cardScrollOffset = Math.max(0, Math.min(this.cardScrollOffset, maxScroll));
                this.lastMouseX = this.mouseX;
            }
        });

        this.canvas.addEventListener('mousedown', (e) => {
            if (this.gameOverFlag || !this.gameStarted) return;

            const rect = this.canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            // 检查是否在卡片区域内（准备滚动）
            if (mouseY > 10 && mouseY < 95) {
                this.isScrolling = true;
                this.lastMouseX = mouseX;
            }
        });

        this.canvas.addEventListener('mouseup', () => {
            this.isScrolling = false;
        });

        this.canvas.addEventListener('mouseleave', () => {
            this.isScrolling = false;
        });

        // 添加鼠标滚轮支持
        this.canvas.addEventListener('wheel', (e) => {
            if (this.gameOverFlag || !this.gameStarted) return;

            const rect = this.canvas.getBoundingClientRect();
            const mouseY = e.clientY - rect.top;

            // 只有在卡片区域才响应滚轮
            if (mouseY > 10 && mouseY < 95) {
                e.preventDefault();

                // 增加滚动速度和响应性
                const scrollSpeed = 2; // 滚动速度倍数
                const scrollDelta = e.deltaY * scrollSpeed;
                this.cardScrollOffset += scrollDelta;

                // 计算最大滚动范围
                const shop = this.assets.images['shop'];
                if (shop) {
                    const scale = 100 / shop.height;
                    const scaledWidth = shop.width * scale;
                    const cardAreaWidth = scaledWidth - 100;
                    const maxScroll = Math.max(0, this.plantCards.length * 80 - cardAreaWidth);

                    // 平滑限制滚动范围
                    this.cardScrollOffset = Math.max(0, Math.min(this.cardScrollOffset, maxScroll));
                }
            }
        }, { passive: false });
    }

    handleClick(x, y) {
        // 检查是否点击阳光
        for (let sun of this.suns) {
            if (sun.isClicked(x, y)) {
                sun.collected = true;
                this.sun += sun.value;
                this.updateUI();
                return;
            }
        }

        // 检查是否点击植物卡片（考虑滚动偏移）
        const shop = this.assets.images['shop'];
        if (shop) {
            const scale = 100 / shop.height;
            const scaledWidth = shop.width * scale;
            const shopX = (CONFIG.GAME_WIDTH - scaledWidth) / 2;
            const cardAreaX = shopX + 90; // 与绘制时保持一致

            for (let i = 0; i < this.plantCards.length; i++) {
                const card = this.plantCards[i];
                const cardX = cardAreaX + i * 80 - this.cardScrollOffset;

                // 检查点击
                if (x >= cardX && x <= cardX + card.width && y >= 10 && y <= 95) {
                    if (card.isClickable(this.sun)) {
                        this.selectCard(card);
                    }
                    return;
                }
            }
        }

        // 检查是否点击铲子
        const shovelX = CONFIG.GAME_WIDTH - 80;
        if (x > shovelX && x < shovelX + 70 && y > 10 && y < 95) {
            this.shovelSelected = !this.shovelSelected;
            if (this.shovelSelected && this.selectedCard) {
                this.selectedCard.deselect();
                this.selectedCard = null;
            }
            return;
        }

        // 放置植物或移除植物
        if (y > CONFIG.TOP_OFFSET) {
            const gridY = Math.floor((y - CONFIG.TOP_OFFSET) / CONFIG.CELL_HEIGHT);
            const gridX = Math.floor((x - CONFIG.GRID_LEFT_OFFSET) / CONFIG.CELL_WIDTH);

            if (gridY >= 0 && gridY < CONFIG.GRID_ROWS && gridX >= 0 && gridX < CONFIG.GRID_COLS) {
                if (this.selectedCard) {
                    this.placePlant(gridX, gridY);
                } else if (this.shovelSelected) {
                    this.removePlantAt(gridX, gridY);
                    this.shovelSelected = false;
                }
            }
        }

        // 取消选择
        if (y < CONFIG.TOP_OFFSET && this.selectedCard) {
            this.selectedCard.deselect();
            this.selectedCard = null;
        }
    }

    selectCard(card) {
        if (this.selectedCard) {
            this.selectedCard.deselect();
        }
        this.selectedCard = card;
        card.select();
        this.shovelSelected = false;
    }

    placePlant(gridX, gridY) {
        if (!this.selectedCard) return;

        // 检查该位置是否已有植物
        for (let plant of this.plants) {
            if (plant.gridX === gridX && plant.gridY === gridY) {
                return;
            }
        }

        const x = gridX * CONFIG.CELL_WIDTH + CONFIG.CELL_GAP + CONFIG.GRID_LEFT_OFFSET;
        const y = gridY * CONFIG.CELL_HEIGHT + CONFIG.CELL_GAP + CONFIG.TOP_OFFSET;

        let plant;
        switch (this.selectedCard.type) {
            case 'peashooter':
                plant = new Peashooter(x, y, gridX, gridY);
                break;
            case 'sunflower':
                plant = new Sunflower(x, y, gridX, gridY);
                break;
            case 'wallnut':
                plant = new WallNut(x, y, gridX, gridY);
                break;
            case 'snowpea':
                plant = new SnowPea(x, y, gridX, gridY);
                break;
            case 'potatomine':
                plant = new PotatoMine(x, y, gridX, gridY);
                break;
            case 'cherrybomb':
                plant = new CherryBomb(x, y, gridX, gridY);
                break;
            case 'repeater':
                plant = new Repeater(x, y, gridX, gridY);
                break;
        }

        if (plant) {
            this.plants.push(plant);
            this.sun -= this.selectedCard.cost;
            this.selectedCard.activateCooldown();
            this.selectedCard.deselect();
            this.selectedCard = null;
            this.updateUI();
        }
    }

    removePlantAt(gridX, gridY) {
        for (let i = this.plants.length - 1; i >= 0; i--) {
            const plant = this.plants[i];
            if (plant.gridX === gridX && plant.gridY === gridY) {
                // 移除DOM精灵
                if (plant.spriteId && this.spriteManager) {
                    this.spriteManager.removeSprite(plant.spriteId);
                }
                this.plants.splice(i, 1);
                console.log(`已铲除植物: gridX=${gridX}, gridY=${gridY}`);
                break;
            }
        }
    }

    removePlant(plant) {
        const index = this.plants.indexOf(plant);
        if (index > -1) {
            // 移除DOM精灵
            if (plant.spriteId && this.spriteManager) {
                this.spriteManager.removeSprite(plant.spriteId);
            }
            this.plants.splice(index, 1);
        }
    }

    getPlantAt(x, y) {
        for (let plant of this.plants) {
            if (x > plant.x && x < plant.x + plant.width &&
                y > plant.y && y < plant.y + plant.height) {
                return plant;
            }
        }
        return null;
    }

    shootPea(plant, isFrozen = false) {
        const pea = new Pea(
            plant.x + plant.width - 10,
            plant.y + plant.height / 2 - 15,
            25,
            isFrozen
        );
        pea.sprite = isFrozen ? this.assets.images['peasnow'] : this.assets.images['pea'];
        this.peas.push(pea);
    }

    hasZombieInRow(row) {
        for (let zombie of this.zombies) {
            if (zombie.row === row && !zombie.dying) {
                return true;
            }
        }
        return false;
    }

    spawnSun(x, y, value) {
        const sun = new Sun(x, y, value, y);
        sun.sprite = this.assets.images['sun'];
        sun.spriteSrc = 'images/Sun.gif';
        this.suns.push(sun);
    }

    spawnNaturalSun() {
        const x = Math.random() * (CONFIG.GAME_WIDTH - 100) + 50;
        const targetY = Math.random() * (CONFIG.GAME_HEIGHT - CONFIG.TOP_OFFSET - 100) + CONFIG.TOP_OFFSET + 50;
        const sun = new Sun(x, -50, CONFIG.SUN_VALUE, targetY);
        sun.sprite = this.assets.images['sun'];
        sun.spriteSrc = 'images/Sun.gif';
        this.suns.push(sun);
        console.log('自然阳光已生成:', { x, y: -50, targetY, totalSuns: this.suns.length });
    }

    spawnZombie() {
        const row = Math.floor(Math.random() * CONFIG.GRID_ROWS);
        const y = row * CONFIG.CELL_HEIGHT + CONFIG.CELL_GAP + CONFIG.TOP_OFFSET;

        let zombie;
        const rand = Math.random();

        if (this.wave >= 1 && rand < 0.4) {
            zombie = new NormalZombie(y, row);
            zombie.sprite = this.assets.images['zombie_walk1'];
            zombie.attackSprite = this.assets.images['zombie_attack'];
        } else if (this.wave >= 2 && rand < 0.6) {
            zombie = new ConeZombie(y, row);
            zombie.sprite = this.assets.images['conezombie_walk'];
            zombie.attackSprite = this.assets.images['conezombie_attack'];
        } else if (this.wave >= 3 && rand < 0.75) {
            zombie = new BucketZombie(y, row);
            zombie.sprite = this.assets.images['bucketzombie_walk'];
            zombie.attackSprite = this.assets.images['bucketzombie_attack'];
        } else if (this.wave >= 4 && rand < 0.85) {
            zombie = new FootballZombie(y, row);
            zombie.sprite = this.assets.images['footballzombie_walk'];
            zombie.attackSprite = this.assets.images['footballzombie_attack'];
        } else if (this.wave >= 2 && rand < 0.95) {
            zombie = new ScreenZombie(y, row);
            zombie.sprite = this.assets.images['screenzombie_walk'];
            zombie.attackSprite = this.assets.images['screenzombie_attack'];
        } else {
            zombie = new NormalZombie(y, row);
            zombie.sprite = this.assets.images['zombie_walk2'];
            zombie.attackSprite = this.assets.images['zombie_attack'];
        }

        this.zombies.push(zombie);
    }

    createExplosion(x, y, type) {
        const explosion = new Explosion(x, y, type);
        explosion.sprite = type === 'cherry' ?
            this.assets.images['boom'] :
            this.assets.images['potatomine_bomb'];

        this.explosions.push(explosion);

        // 对范围内的僵尸造成伤害
        const range = type === 'cherry' ? 150 : 80;
        for (let zombie of this.zombies) {
            if (!zombie.dying) {
                const dx = zombie.x + zombie.width / 2 - (x + 100);
                const dy = zombie.y + zombie.height / 2 - (y + 50);
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < range) {
                    zombie.takeDamage(explosion.damage);
                }
            }
        }

        // 如果是樱桃炸弹，找到并移除对应的植物
        if (type === 'cherry') {
            for (let i = this.plants.length - 1; i >= 0; i--) {
                const plant = this.plants[i];
                // 找到与爆炸位置匹配的樱桃炸弹
                if (plant.type === 'cherrybomb' && Math.abs(plant.x - x) < 10 && Math.abs(plant.y - y) < 10) {
                    // 移除DOM精灵
                    if (plant.spriteId && this.spriteManager) {
                        this.spriteManager.removeSprite(plant.spriteId);
                    }
                    this.plants.splice(i, 1);
                    console.log('樱桃炸弹已爆炸并消失');
                    break;
                }
            }
        }
    }

    gameOver() {
        this.gameOverFlag = true;
        this.showMessage('僵尸吃掉了你的脑子!', true);
    }

    showMessage(text, permanent = false) {
        const messageEl = document.getElementById('message');
        messageEl.textContent = text;
        messageEl.classList.add('show');

        if (!permanent) {
            setTimeout(() => {
                messageEl.classList.remove('show');
            }, 2000);
        }
    }

    updateUI() {
        document.getElementById('sunAmount').textContent = this.sun;
        document.getElementById('waveNumber').textContent = this.wave;
    }

    update(deltaTime) {
        if (this.gameOverFlag) return;

        // 更新植物卡片
        for (let card of this.plantCards) {
            card.update(deltaTime);
        }

        // 更新植物
        for (let plant of this.plants) {
            plant.update(deltaTime, this);

            // 检查土豆雷触发
            if (plant.type === 'potatomine') {
                for (let zombie of this.zombies) {
                    if (!zombie.dying &&
                        zombie.row === plant.gridY &&
                        Math.abs(zombie.x - plant.x) < 100) {
                        if (plant.explode(this)) {
                            this.removePlant(plant);
                            if (zombie.takeDamage(1800)) {
                                // 僵尸被消灭
                            }
                        }
                        break;
                    }
                }
            }
        }

        // 更新僵尸
        for (let zombie of this.zombies) {
            zombie.update(deltaTime, this);
        }

        // 更新子弹
        for (let pea of this.peas) {
            pea.update(deltaTime, this);
        }

        // 更新阳光
        for (let sun of this.suns) {
            sun.update(deltaTime);
        }

        // 更新爆炸
        for (let explosion of this.explosions) {
            explosion.update(deltaTime);
        }

        // 移除已销毁的对象
        this.peas = this.peas.filter(pea => !pea.remove);
        this.suns = this.suns.filter(sun => !sun.remove);

        // 移除僵尸的DOM精灵
        for (let zombie of this.zombies) {
            if (zombie.remove && zombie.spriteId) {
                this.spriteManager.removeSprite(zombie.spriteId);
            }
        }
        this.zombies = this.zombies.filter(zombie => !zombie.remove);

        this.explosions = this.explosions.filter(exp => !exp.remove);

        // 生成僵尸
        this.zombieSpawnTimer += deltaTime;
        if (this.zombieSpawnTimer >= this.zombieSpawnInterval) {
            this.spawnZombie();
            this.zombieSpawnTimer = 0;

            // 逐渐增加难度
            if (this.zombieSpawnInterval > 3000) {
                this.zombieSpawnInterval -= 100;
            }
        }

        // 生成自然阳光
        this.sunSpawnTimer += deltaTime;
        if (this.sunSpawnTimer >= this.sunSpawnInterval) {
            this.spawnNaturalSun();
            this.sunSpawnTimer = 0;
        }

        // 波次管理
        this.frame++;
        if (this.frame % 3000 === 0) {
            this.wave++;
            this.updateUI();
            this.showMessage(`第 ${this.wave} 波僵尸来袭!`);
        }
    }

    draw() {
        // 清空画布
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // 绘制背景（完整显示，不拉伸）
        if (this.assets.images['background']) {
            const bg = this.assets.images['background'];
            // 直接使用背景图的原始尺寸，完美匹配画布尺寸
            this.ctx.drawImage(bg, 0, 0);
        }

        // 绘制网格
        this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
        this.ctx.lineWidth = 1;
        for (let cell of this.gameGrid) {
            this.ctx.strokeRect(cell.x, cell.y, cell.width, cell.height);
        }

        // 绘制选中框
        if (this.selectedCard && this.mouseY > CONFIG.TOP_OFFSET) {
            const gridY = Math.floor((this.mouseY - CONFIG.TOP_OFFSET) / CONFIG.CELL_HEIGHT);
            const gridX = Math.floor((this.mouseX - CONFIG.GRID_LEFT_OFFSET) / CONFIG.CELL_WIDTH);

            if (gridY >= 0 && gridY < CONFIG.GRID_ROWS && gridX >= 0 && gridX < CONFIG.GRID_COLS) {
                this.ctx.globalAlpha = 0.5;
                this.ctx.fillStyle = '#00ff00';
                this.ctx.fillRect(
                    gridX * CONFIG.CELL_WIDTH + CONFIG.CELL_GAP + CONFIG.GRID_LEFT_OFFSET,
                    gridY * CONFIG.CELL_HEIGHT + CONFIG.CELL_GAP + CONFIG.TOP_OFFSET,
                    CONFIG.CELL_WIDTH - CONFIG.CELL_GAP * 2,
                    CONFIG.CELL_HEIGHT - CONFIG.CELL_GAP * 2
                );
                this.ctx.globalAlpha = 1;
            }
        }

        // 绘制植物
        for (let plant of this.plants) {
            plant.draw(this.ctx, this.spriteManager);
        }

        // 绘制僵尸
        for (let zombie of this.zombies) {
            zombie.draw(this.ctx, this.spriteManager);
        }

        // 绘制子弹
        for (let pea of this.peas) {
            pea.draw(this.ctx);
        }

        // 绘制阳光
        for (let sun of this.suns) {
            sun.draw(this.ctx, this.spriteManager);
        }

        // 绘制爆炸
        for (let explosion of this.explosions) {
            explosion.draw(this.ctx);
        }

        // 绘制商店背景（保持高度100，宽度按比例缩放，居中显示）
        if (this.assets.images['shop']) {
            const shop = this.assets.images['shop'];
            // Shop.png原始尺寸是446x87
            // 目标高度是100，计算对应的宽度
            const scale = 100 / shop.height;
            const scaledWidth = shop.width * scale;
            // 居中显示
            const shopX = (CONFIG.GAME_WIDTH - scaledWidth) / 2;
            this.ctx.drawImage(shop, shopX, 0, scaledWidth, 100);

            // 绘制可滚动的植物卡片区域
            // 计算可显示的卡片区域（在商店背景内，左侧留出90px给阳光计数器）
            const cardAreaX = shopX + 90; // 左侧偏移90px
            const cardAreaWidth = scaledWidth - 100; // 左侧90px，右侧10px，最大化宽度
            const cardAreaHeight = 85;
            const cardAreaY = 10;

            // 使用ctx.save()和restore()来裁剪区域
            this.ctx.save();
            this.ctx.beginPath();
            this.ctx.rect(cardAreaX, cardAreaY, cardAreaWidth, cardAreaHeight);
            this.ctx.clip();

            // 绘制可见的卡片
            const visibleCards = Math.floor(cardAreaWidth / 80);
            const scrollOffset = this.cardScrollOffset || 0;

            for (let i = 0; i < this.plantCards.length; i++) {
                const card = this.plantCards[i];
                // 计算卡片位置（基于滚动偏移）
                const cardX = cardAreaX + i * 80 - scrollOffset;

                // 只绘制在可见区域内的卡片
                if (cardX >= cardAreaX - 80 && cardX <= cardAreaX + cardAreaWidth) {
                    card.drawAt(this.ctx, this.assets, this.sun, cardX, cardAreaY);
                }
            }

            this.ctx.restore();

            // 绘制滚动条（如果需要）
            if (this.plantCards.length * 80 > cardAreaWidth) {
                const scrollbarWidth = cardAreaWidth;
                const scrollbarHeight = 8;
                const scrollbarY = cardAreaY + cardAreaHeight;
                const scrollProgress = scrollOffset / (this.plantCards.length * 80 - cardAreaWidth);
                const handleWidth = 40;
                const handleX = cardAreaX + (scrollbarWidth - handleWidth) * scrollProgress;

                // 滚动条背景
                this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
                this.ctx.fillRect(cardAreaX, scrollbarY, scrollbarWidth, scrollbarHeight);

                // 滚动条手柄
                this.ctx.fillStyle = 'rgba(100, 255, 100, 0.8)';
                this.ctx.fillRect(handleX, scrollbarY, handleWidth, scrollbarHeight);
            }
        }

        // 绘制铲子（居右显示）
        const shovelImg = this.assets.images['shovel'];
        const shovelBankImg = this.assets.images['shovelBank'];
        const shovelX = CONFIG.GAME_WIDTH - 80; // 距离右边缘80px

        if (shovelBankImg) {
            this.ctx.drawImage(shovelBankImg, shovelX, 10, 70, 85);
        }

        if (shovelImg) {
            this.ctx.globalAlpha = this.shovelSelected ? 1 : 0.7;
            this.ctx.drawImage(shovelImg, shovelX, 10, 70, 85);
            this.ctx.globalAlpha = 1;

            if (this.shovelSelected) {
                this.ctx.strokeStyle = '#00ff00';
                this.ctx.lineWidth = 3;
                this.ctx.strokeRect(shovelX, 10, 70, 85);
            }
        }

        // 绘制跟随鼠标的铲子（当选中时）
        if (this.shovelSelected && shovelImg) {
            // 在鼠标位置绘制铲子
            const shovelSize = 60;
            const shovelX = this.mouseX - shovelSize / 2;
            const shovelY = this.mouseY - shovelSize / 2;

            this.ctx.globalAlpha = 0.8;
            this.ctx.drawImage(shovelImg, shovelX, shovelY, shovelSize, shovelSize);
            this.ctx.globalAlpha = 1;

            // 绘制红色高亮框表示要铲除的植物
            if (this.mouseY > CONFIG.TOP_OFFSET) {
                const gridY = Math.floor((this.mouseY - CONFIG.TOP_OFFSET) / CONFIG.CELL_HEIGHT);
                const gridX = Math.floor((this.mouseX - CONFIG.GRID_LEFT_OFFSET) / CONFIG.CELL_WIDTH);

                if (gridY >= 0 && gridY < CONFIG.GRID_ROWS && gridX >= 0 && gridX < CONFIG.GRID_COLS) {
                    this.ctx.strokeStyle = 'rgba(255, 0, 0, 0.7)';
                    this.ctx.lineWidth = 3;
                    this.ctx.strokeRect(
                        gridX * CONFIG.CELL_WIDTH + CONFIG.CELL_GAP + CONFIG.GRID_LEFT_OFFSET,
                        gridY * CONFIG.CELL_HEIGHT + CONFIG.CELL_GAP + CONFIG.TOP_OFFSET,
                        CONFIG.CELL_WIDTH - CONFIG.CELL_GAP * 2,
                        CONFIG.CELL_HEIGHT - CONFIG.CELL_GAP * 2
                    );
                }
            }
        }
    }

    gameLoop(timestamp) {
        const deltaTime = timestamp - this.lastTime;
        this.lastTime = timestamp;

        this.update(deltaTime);
        this.draw();

        requestAnimationFrame((t) => this.gameLoop(t));
    }

    startBGM() {
        const bgm = this.assets.sounds['bgm'];
        if (bgm) {
            bgm.loop = true;
            bgm.volume = 0.3;
            bgm.play().catch(e => console.log('BGM播放失败:', e));
        }
    }
}

// ==================== 游戏启动 ====================
const canvas = document.getElementById('gameCanvas');
const game = new Game(canvas);

document.getElementById('startButton').addEventListener('click', async () => {
    document.getElementById('startScreen').classList.add('hidden');
    await game.init();
    game.startBGM();
    game.showMessage('准备保卫你的花园!');
});
