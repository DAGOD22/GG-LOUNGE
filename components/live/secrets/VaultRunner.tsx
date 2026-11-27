'use client';

/**
 * Vault Runner — the game hidden inside the vault page.
 *
 * A one-button endless runner: the runner moves right at climbing speed, the
 * world's obstacles come left, space or a tap jumps. That is the whole game —
 * it earns its place as a secret by being small, real and finished, not by
 * being deep.
 *
 * The loop is a plain requestAnimationFrame at a fixed step. There is no
 * delta-time scaling on purpose: the physics constants were tuned for one
 * step, and a fixed step makes those constants true on a 144 Hz monitor and a
 * potato alike. A background tab is the one place rAF stops anyway, so the
 * timer is simply re-based on return instead of simulating the pause.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Play, RotateCcw, Trophy } from 'lucide-react';
import {
  GROUND_Y,
  JUMP_VELOCITY,
  PLAYER_SIZE,
  PLAYER_X,
  STAGE_HEIGHT,
  STAGE_WIDTH,
  gapFor,
  hitsPlayer,
  scoreFor,
  speedFor,
  stepFall,
} from './runner-core';
import { recordRunnerScore, runnerBest } from '@/lib/secrets';

type Obstacle = { x: number; w: number; h: number };
type Phase = 'idle' | 'run' | 'over';

export function VaultRunner() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [isNewBest, setIsNewBest] = useState(false);

  const world = useRef({
    y: GROUND_Y - PLAYER_SIZE,
    vy: 0,
    grounded: true,
    distance: 0,
    obstacles: [] as Obstacle[],
    nextGap: 260,
    running: false,
  });

  useEffect(() => {
    setBest(runnerBest());
  }, []);

  const reset = useCallback(() => {
    const state = world.current;
    state.y = GROUND_Y - PLAYER_SIZE;
    state.vy = 0;
    state.grounded = true;
    state.distance = 0;
    state.obstacles = [];
    state.nextGap = 260;
  }, []);

  const jump = useCallback(() => {
    const state = world.current;
    if (!state.running) {
      // Starting from the idle or game-over screen is also a jump request.
      reset();
      state.running = true;
      setPhase('run');
      setIsNewBest(false);
      setScore(0);
      return;
    }
    if (state.grounded) {
      state.vy = JUMP_VELOCITY;
      state.grounded = false;
    }
  }, [reset]);

  /* ---- the loop ----------------------------------------------------------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;

    const paint = (state: typeof world.current) => {
      context.clearRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
      // Sky
      context.fillStyle = '#070a10';
      context.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
      // Ground
      context.strokeStyle = 'rgba(190, 242, 100, 0.6)';
      context.beginPath();
      context.moveTo(0, GROUND_Y + 0.5);
      context.lineTo(STAGE_WIDTH, GROUND_Y + 0.5);
      context.stroke();
      // Obstacles
      context.fillStyle = '#ff6c83';
      for (const obstacle of state.obstacles) {
        context.fillRect(obstacle.x, GROUND_Y - obstacle.h, obstacle.w, obstacle.h);
      }
      // Runner
      context.fillStyle = '#bef264';
      context.fillRect(PLAYER_X, state.y, PLAYER_SIZE, PLAYER_SIZE);
      // HUD
      const current = scoreFor(state.distance);
      context.fillStyle = 'rgba(255,255,255,.85)';
      context.font = '800 12px ui-monospace, monospace';
      context.textAlign = 'right';
      context.fillText(`SCORE ${current}`, STAGE_WIDTH - 12, 20);
      context.textAlign = 'left';
      context.fillText(`BEST ${Math.max(best, current)}`, 12, 20);
    };

    let raf = 0;
    let last = performance.now();
    let shownScore = -1;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      // Fixed 60 fps step: run at most 3 catch-up steps, never simulate a
      // background tab's whole absence in one go.
      const state = world.current;
      if (state.running) {
        let steps = Math.min(3, Math.round((now - last) / 16.7));
        while (steps-- > 0) {
          const speed = speedFor(scoreFor(state.distance));
          state.distance += speed;
          // Move obstacles, drop the ones off the left edge.
          for (const obstacle of state.obstacles) obstacle.x -= speed;
          state.obstacles = state.obstacles.filter(obstacle => obstacle.x + obstacle.w > -8);
          // Spawn: the last obstacle's right edge plus the scored gap.
          const rightmost = state.obstacles.length
            ? state.obstacles[state.obstacles.length - 1].x + state.obstacles[state.obstacles.length - 1].w
            : -1;
          if (rightmost < STAGE_WIDTH - state.nextGap) {
            const height = 18 + Math.round(Math.random() * 30);
            const width = 14 + Math.round(Math.random() * 18);
            state.obstacles.push({ x: STAGE_WIDTH + 8, w: width, h: height });
            state.nextGap = gapFor(scoreFor(state.distance), Math.random());
          }
          // Physics
          const fall = stepFall(state.y, state.vy);
          state.y = fall.y;
          state.vy = fall.velocityY;
          state.grounded = fall.grounded;
          // Collision
          const player = { x: PLAYER_X, y: state.y, w: PLAYER_SIZE, h: PLAYER_SIZE };
          for (const obstacle of state.obstacles) {
            if (hitsPlayer(player, { x: obstacle.x, y: GROUND_Y - obstacle.h, w: obstacle.w, h: obstacle.h })) {
              state.running = false;
              const final = scoreFor(state.distance);
              setScore(final);
              setPhase('over');
              if (recordRunnerScore(final)) {
                setBest(final);
                setIsNewBest(true);
              }
              break;
            }
          }
        }
      }
      // One state write per frame at most, and only when the number moved —
      // a React render per physics step is how idle games burn laptops.
      const shown = scoreFor(state.distance);
      if (shown !== shownScore) {
        shownScore = shown;
        setScore(shown);
      }
      last = now;
      paint(state);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [best]);
  /* ---- input: keyboard on the canvas, pointer anywhere on it -------------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== ' ' && event.key !== 'ArrowUp') return;
      event.preventDefault();
      jump();
    };
    canvas.addEventListener('keydown', onKey);
    return () => canvas.removeEventListener('keydown', onKey);
  }, [jump]);

  return (
    <div className="gg-runner">
      <canvas
        ref={canvasRef}
        className="gg-runner-stage"
        width={STAGE_WIDTH}
        height={STAGE_HEIGHT}
        tabIndex={0}
        role="application"
        aria-label="Vault Runner — jump with space or a tap"
        onPointerDown={jump}
      />
      <div className="gg-runner-bar">
        <span className="gg-runner-score">
          <Trophy size={13} /> Best {best}
          {isNewBest && <em>new!</em>}
        </span>
        {phase === 'over' && <span className="gg-runner-note">Crashed at {score}.</span>}
        <button
          type="button"
          className="gg-runner-play"
          onClick={() => {
            reset();
            world.current.running = true;
            setPhase('run');
            setIsNewBest(false);
            setScore(0);
            canvasRef.current?.focus();
          }}
        >
          {phase === 'idle' ? <Play size={13} /> : <RotateCcw size={13} />}
          {phase === 'idle' ? 'Run' : 'Restart'}
        </button>
      </div>
      <p className="gg-runner-hint">
        Space or a tap jumps. The speed climbs with your score; the obstacles do not get the courtesy of slowing down.
      </p>
    </div>
  );
}
