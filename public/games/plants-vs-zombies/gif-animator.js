// GIF Animator - 简化的GIF动画处理系统
// 这个系统会加载PNG静态图作为备用，同时支持将来添加真正的GIF帧动画

class AnimatedSprite {
    constructor(frames, frameDuration = 150) {
        this.frames = frames; // Image对象数组
        this.frameDuration = frameDuration; // 每帧持续时间（毫秒）
        this.currentFrame = 0;
        this.lastFrameUpdate = 0;
        this.looping = true;
    }

    getCurrentFrame() {
        return this.frames[this.currentFrame];
    }

    update(deltaTime) {
        this.lastFrameUpdate += deltaTime;

        if (this.lastFrameUpdate >= this.frameDuration) {
            this.currentFrame = (this.currentFrame + 1) % this.frames.length;
            this.lastFrameUpdate = 0;
        }
    }

    reset() {
        this.currentFrame = 0;
        this.lastFrameUpdate = 0;
    }

    draw(ctx, x, y, width, height) {
        const frame = this.getCurrentFrame();
        if (frame) {
            ctx.drawImage(frame, x, y, width, height);
        }
    }
}

// 为没有多帧的图片创建单帧动画
function createSingleFrameAnimation(image) {
    return new AnimatedSprite([image], 100);
}

// 创建带有摇晃效果的动画模拟行走
function createWalkingAnimation(image, shakeIntensity = 2) {
    const frame1 = image;
    return {
        currentImage: image,
        shakeIntensity: shakeIntensity,
        time: 0,
        update: function(deltaTime) {
            this.time += deltaTime;
        },
        draw: function(ctx, x, y, width, height) {
            const offset = Math.sin(this.time / 150) * this.shakeIntensity;
            ctx.drawImage(this.currentImage, x, y + offset, width, height);
        }
    };
}
