'use client';

import React, { useEffect, useRef, useState } from 'react';
import Matter from 'matter-js';

type DotMatrix404Props = {
  className?: string;
  onBoundsCalculated?: (bounds: { bottom: number }) => void;
};

// --- Collision Categories ---
const CAT_WALL    = 0x0001;
const CAT_ART     = 0x0002; // static art blocks
const CAT_BALL    = 0x0004;
const CAT_PADDLE  = 0x0008;
const CAT_DEBRIS  = 0x0010; // broken art blocks (fall, ignore ball)
const CAT_TOKEN   = 0x0020; // powerup tokens (fall, caught by paddle)

const POWERUPS = [null, null, null, null, null, '+1', '+1', '+2', '⚡', null] as const;
type Powerup = typeof POWERUPS[number];

interface Token {
  x: number;
  y: number;
  vy: number;
  powerup: Powerup;
  alpha: number;
  size: number;
}

interface Floater {
  x: number; y: number;
  text: string;
  life: number; maxLife: number;
  vx: number; vy: number;
}

export default function DotMatrix404({ className = '', onBoundsCalculated }: DotMatrix404Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const [isReducedMotion, setIsReducedMotion] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [ballCount, setBallCount] = useState(4);
  const MAX_BALLS = 8;

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setIsReducedMotion(mq.matches);
    const h = (e: MediaQueryListEvent) => setIsReducedMotion(e.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);

  useEffect(() => {
    if (!containerRef.current || !canvasRef.current) return;

    const container = containerRef.current;
    const canvas    = canvasRef.current;
    const ctx       = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const cs = getComputedStyle(container);
    let fgColor     = cs.getPropertyValue('--dm404-fg').trim()  || '#10b981';
    let bgColor     = cs.getPropertyValue('--dm404-bg').trim()  || '#000000';
    let accentColor = cs.getPropertyValue('--dm404-accent').trim() || '#ffffff';

    let cw = container.clientWidth;
    let ch = container.clientHeight;
    canvas.width  = cw;
    canvas.height = ch;

    // ---- Matter.js ----
    const { Engine, Bodies, Body, Composite, Events, Vector } = Matter;
    const engine = Engine.create({
      gravity: { x: 0, y: 1 },
      positionIterations: 10,
      velocityIterations: 10,
    });

    let artBlocks:  Matter.Body[] = [];
    let debrisBlocks: Matter.Body[] = []; // broken, fall freely (no ball collision)
    let balls:      Matter.Body[] = [];
    let paddle:     Matter.Body | null = null;

    // Canvas-drawn tokens (NOT physics bodies — simple 2-D objects that fall)
    let tokens: Token[] = [];
    let floaters: Floater[] = [];
    let combo = 0;

    const ballTrails: Map<number, { x: number; y: number }[]> = new Map();

    // ---- Boundaries ----
    const addBounds = () => {
      const wallMask = 0xFFFF; // walls collide with everything
      const opts = (x: number, y: number, w: number, h: number) =>
        Bodies.rectangle(x, y, w, h, {
          isStatic: true, friction: 0, restitution: 1,
          collisionFilter: { category: CAT_WALL, mask: wallMask },
        });
      Composite.add(engine.world, [
        opts(cw / 2, ch + 50, cw + 200, 100),
        opts(-50,    ch / 2, 100, ch + 200),
        opts(cw + 50, ch / 2, 100, ch + 200),
        opts(cw / 2,  -50,   cw + 200, 100),
      ]);
    };

    // ---- Art Generation ----
    const generateArt = () => {
      const ow = Math.min(cw, 800);
      const oh = Math.min(ch, 800);
      const off = document.createElement('canvas');
      off.width = ow; off.height = oh;
      const oct = off.getContext('2d')!;

      oct.fillStyle = 'black';
      oct.fillRect(0, 0, ow, oh);
      oct.fillStyle = 'white';

      const fcx = ow / 2;
      const fcy = oh * 0.35;
      const rad = Math.min(ow, oh) * 0.15;

      // Face
      oct.beginPath();
      oct.arc(fcx, fcy, rad, 0, Math.PI * 2);
      oct.lineWidth = rad * 0.1;
      oct.strokeStyle = 'white';
      oct.stroke();

      oct.lineWidth = rad * 0.08;
      const eo = rad * 0.35, es = rad * 0.15;
      const drawX = (cx: number, cy: number) => {
        oct.beginPath(); oct.moveTo(cx - es, cy - es); oct.lineTo(cx + es, cy + es); oct.stroke();
        oct.beginPath(); oct.moveTo(cx + es, cy - es); oct.lineTo(cx - es, cy + es); oct.stroke();
      };
      drawX(fcx - eo, fcy); drawX(fcx + eo, fcy);

      oct.beginPath();
      oct.arc(fcx, fcy + rad * 0.5, rad * 0.3, Math.PI + 0.2, Math.PI * 2 - 0.2);
      oct.stroke();

      oct.font = `bold ${rad * 2.5}px sans-serif`;
      oct.textAlign = 'center';
      oct.textBaseline = 'top';
      oct.fillText('404', fcx, fcy + rad * 1.2);

      const id   = oct.getImageData(0, 0, ow, oh).data;
      const isMob = cw < 768;
      const step  = isMob ? 12 : 8;
      const bs    = step - 2;

      const ox = (cw - ow) / 2;
      const oy = (ch - oh) / 2;
      let maxY = 0;

      for (let y = 0; y < oh; y += step) {
        for (let x = 0; x < ow; x += step) {
          if (id[(y * ow + x) * 4] > 128) {
            const bx = ox + x;
            const by = oy + y;
            if (by > maxY) maxY = by;

            const b = Bodies.rectangle(bx, by, bs, bs, {
              isStatic: true,
              friction: 0, restitution: 0,
              collisionFilter: {
                category: CAT_ART,
                mask: CAT_BALL | CAT_WALL,
              },
            });
            // @ts-ignore
            b.isArtBlock = true;
            // @ts-ignore
            b.powerup = POWERUPS[Math.floor(Math.random() * POWERUPS.length)];
            artBlocks.push(b);
          }
        }
      }

      Composite.add(engine.world, artBlocks);
      if (onBoundsCalculated) onBoundsCalculated({ bottom: maxY + bs / 2 });
    };

    // ---- Balls ----
    const spawnBalls = () => {
      const n = 4, r = 7;
      for (let i = 0; i < n; i++) {
        const ball = Bodies.circle(
          Math.random() * cw,
          Math.random() * ch * 0.25,
          r,
          {
            restitution: 1, friction: 0, frictionAir: 0,
            inertia: Infinity,
            collisionFilter: {
              category: CAT_BALL,
              mask: CAT_ART | CAT_WALL | CAT_PADDLE,
            },
          }
        );
        Body.setVelocity(ball, {
          x: (Math.random() - 0.5) * 10,
          y: -(6 + Math.random() * 6), // start going UP toward art
        });
        // @ts-ignore
        ball.isBall = true;
        balls.push(ball);
        ballTrails.set(ball.id, []);
      }
      Composite.add(engine.world, balls);
    };

    // ---- Paddle ----
    const spawnPaddle = () => {
      const pw = Math.min(cw * 0.3, 200);
      paddle = Bodies.rectangle(cw / 2, ch - 100, pw, 18, {
        isStatic: true,
        chamfer: { radius: 9 },
        friction: 0,
        restitution: 1.3,
        collisionFilter: {
          category: CAT_PADDLE,
          mask: CAT_BALL | CAT_WALL,
          // Tokens are canvas-only, no physics body needed
        },
      });
      Composite.add(engine.world, paddle);
    };

    // ---- Break Block ----
    const breakBlock = (b: Matter.Body) => {
      if (!b.isStatic) return;

      // Move from art to debris
      const idx = artBlocks.indexOf(b);
      if (idx !== -1) artBlocks.splice(idx, 1);

      Body.setStatic(b, false);
      b.collisionFilter.category = CAT_DEBRIS;
      b.collisionFilter.mask = CAT_WALL; // debris only collides with walls/ground
      const f = 0.004 * b.mass;
      Body.applyForce(b, b.position, {
        x: (Math.random() - 0.5) * f,
        y: (Math.random() - 0.5) * f,
      });
      debrisBlocks.push(b);

      // Spawn a visible token that falls toward the paddle
      // @ts-ignore
      const powerup: Powerup = b.powerup;
      if (powerup !== null) {
        tokens.push({
          x:  b.position.x,
          y:  b.position.y,
          vy: 2 + Math.random() * 1.5,  // gentle fall speed
          powerup,
          alpha: 1,
          size: 26,
        });
      }
    };

    // ---- Collect Token by Paddle ----
    const tryCollectTokens = () => {
      if (!paddle) return;
      const px  = paddle.position.x;
      const py  = paddle.position.y;
      const phw = (paddle.bounds.max.x - paddle.bounds.min.x) / 2;
      const phh = (paddle.bounds.max.y - paddle.bounds.min.y) / 2 + 20; // generous hit zone

      for (let i = tokens.length - 1; i >= 0; i--) {
        const t = tokens[i];
        const inX = Math.abs(t.x - px) < phw + t.size / 2;
        const inY = Math.abs(t.y - py) < phh + t.size / 2;
        if (inX && inY) {
          // Claim it!
          applyPowerup(t.powerup);
          floaters.push({
            x: t.x, y: py - 30,
            text: t.powerup ?? '+1',
            life: 70, maxLife: 70,
            vx: (Math.random() - 0.5) * 3,
            vy: -2.5,
          });
          tokens.splice(i, 1);
        }
      }
    };

    const MAX_BALLS = 8;

    const spawnOneBall = (fromX?: number, fromY?: number) => {
      if (balls.length >= MAX_BALLS) return null; // cap to prevent lag
      const r = 7;
      const ball = Bodies.circle(
        fromX ?? Math.random() * cw,
        fromY ?? Math.random() * ch * 0.25,
        r,
        {
          restitution: 1, friction: 0, frictionAir: 0,
          inertia: Infinity,
          collisionFilter: {
            category: CAT_BALL,
            mask: CAT_ART | CAT_WALL | CAT_PADDLE,
          },
        }
      );
      Body.setVelocity(ball, {
        x: (Math.random() - 0.5) * 10,
        y: -(6 + Math.random() * 6),
      });
      // @ts-ignore
      ball.isBall = true;
      balls.push(ball);
      ballTrails.set(ball.id, []);
      Composite.add(engine.world, ball);
      setBallCount(balls.length);
      return ball;
    };

    const applyPowerup = (p: Powerup) => {
      if (p === '+1') {
        spawnOneBall(paddle?.position.x, (paddle?.position.y ?? ch - 100) - 30);
      } else if (p === '+2') {
        // Spawn 2 extra balls near the paddle
        for (let k = 0; k < 2; k++) {
          spawnOneBall(
            (paddle?.position.x ?? cw / 2) + (Math.random() - 0.5) * 60,
            (paddle?.position.y ?? ch - 100) - 30
          );
        }
      } else if (p === '⚡') {
        balls.forEach(b => {
          // @ts-ignore
          b.isPiercing = 180;
          b.collisionFilter.mask = CAT_WALL | CAT_PADDLE;
        });
      }
    };

    // ---- Collision Events ----
    Events.on(engine, 'collisionStart', (ev) => {
      ev.pairs.forEach(({ bodyA, bodyB }) => {
        // @ts-ignore
        const bA = bodyA.isBall, bB = bodyB.isBall;
        // @ts-ignore
        const aA = bodyA.isArtBlock && bodyA.isStatic;
        // @ts-ignore
        const aB = bodyB.isArtBlock && bodyB.isStatic;
        const pA = bodyA === paddle, pB = bodyB === paddle;

        // Ball hits art block
        if (bA && aB) breakBlock(bodyB);
        if (bB && aA) breakBlock(bodyA);

        // Ball hits paddle — boost upward
        if (bA && pB) {
          Body.setVelocity(bodyA, {
            x: bodyA.velocity.x,
            y: -Math.abs(bodyA.velocity.y) - 10,
          });
        }
        if (bB && pA) {
          Body.setVelocity(bodyB, {
            x: bodyB.velocity.x,
            y: -Math.abs(bodyB.velocity.y) - 10,
          });
        }
      });
    });

    // ---- Input ----
    let targetX = cw / 2;
    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      targetX = e.clientX - rect.left;
    };
    const onTouch = (e: TouchEvent) => {
      const rect = canvas.getBoundingClientRect();
      targetX = e.touches[0].clientX - rect.left;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onTouch, { passive: true });

    // ---- Init ----
    addBounds();
    generateArt();
    if (!isReducedMotion) {
      spawnBalls();
      spawnPaddle();
    }

    // ---- Render Loop ----
    let raf: number;
    let lastT = performance.now();

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const raw = now - lastT;
      lastT = now;
      const dt = Math.min(raw, 32);

      if (!isReducedMotion) {
        // Substep for better collision at high speeds
        const steps = 3;
        for (let s = 0; s < steps; s++) {
          Engine.update(engine, dt / steps);
        }
      }

      // -- Clear --
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, cw, ch);

      if (isReducedMotion) {
        ctx.fillStyle = fgColor;
        artBlocks.forEach(b => {
          // @ts-ignore
          const p = b.originalPos ?? b.position;
          const bw = b.bounds.max.x - b.bounds.min.x;
          const bh = b.bounds.max.y - b.bounds.min.y;
          ctx.fillRect(p.x - bw / 2, p.y - bh / 2, bw, bh);
        });
        return;
      }

      // -- Paddle --
      if (paddle) {
        const cx = paddle.position.x + (targetX - paddle.position.x) * 0.2;
        Body.setPosition(paddle, {
          x: Math.max(120, Math.min(cw - 120, cx)),
          y: paddle.position.y,
        });
      }

      // -- Art Blocks --
      ctx.fillStyle = fgColor;
      artBlocks.forEach(b => {
        const bw = b.bounds.max.x - b.bounds.min.x;
        const bh = b.bounds.max.y - b.bounds.min.y;
        ctx.fillRect(b.position.x - bw / 2, b.position.y - bh / 2, bw, bh);
      });

      // -- Debris (broken blocks, fade out) --
      for (let i = debrisBlocks.length - 1; i >= 0; i--) {
        const b = debrisBlocks[i];
        // @ts-ignore
        if (!b._fade) b._fade = 1.0;
        // @ts-ignore
        b._fade -= 0.008;
        // @ts-ignore
        if (b._fade <= 0 || b.position.y > ch + 100) {
          Composite.remove(engine.world, b);
          debrisBlocks.splice(i, 1);
          continue;
        }
        ctx.save();
        ctx.translate(b.position.x, b.position.y);
        ctx.rotate(b.angle);
        // @ts-ignore
        ctx.globalAlpha = Math.max(0, b._fade);
        ctx.fillStyle = fgColor;
        const bw = b.bounds.max.x - b.bounds.min.x;
        const bh = b.bounds.max.y - b.bounds.min.y;
        ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
        ctx.globalAlpha = 1;
        ctx.restore();
      }

      // -- Tokens (powerup catcher icons, no physics body) --
      for (let i = tokens.length - 1; i >= 0; i--) {
        const t = tokens[i];
        t.y += t.vy;
        t.vy = Math.min(t.vy + 0.12, 8); // gentle gravity
        if (t.y > ch + 60) { tokens.splice(i, 1); continue; }

        const { x, y, size } = t;

        // Glow
        const grad = ctx.createRadialGradient(x, y, 0, x, y, size * 0.8);
        grad.addColorStop(0, fgColor + 'aa');
        grad.addColorStop(1, fgColor + '00');
        ctx.beginPath();
        ctx.arc(x, y, size * 0.8, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();

        // Pill background
        const hw = size * 1.3, hh = size * 0.7;
        const pr = hh / 2;
        ctx.beginPath();
        ctx.moveTo(x - hw / 2 + pr, y - hh / 2);
        ctx.lineTo(x + hw / 2 - pr, y - hh / 2);
        ctx.arcTo(x + hw / 2, y - hh / 2, x + hw / 2, y, pr);
        ctx.arcTo(x + hw / 2, y + hh / 2, x + hw / 2 - pr, y + hh / 2, pr);
        ctx.lineTo(x - hw / 2 + pr, y + hh / 2);
        ctx.arcTo(x - hw / 2, y + hh / 2, x - hw / 2, y, pr);
        ctx.arcTo(x - hw / 2, y - hh / 2, x - hw / 2 + pr, y - hh / 2, pr);
        ctx.closePath();
        ctx.fillStyle = bgColor;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = fgColor;
        ctx.stroke();

        // Label
        ctx.fillStyle = accentColor;
        ctx.font = `bold ${Math.round(size * 0.55)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(t.powerup ?? '', x, y);
      }

      // Check token collection every frame
      tryCollectTokens();

      // -- Balls --
      balls.forEach(ball => {
        // @ts-ignore
        if (typeof ball.isPiercing === 'number' && ball.isPiercing > 0) {
          // @ts-ignore
          ball.isPiercing--;
          // @ts-ignore
          if (ball.isPiercing === 0) {
            ball.collisionFilter.mask = CAT_ART | CAT_WALL | CAT_PADDLE;
          }
          // pierce: break nearby static art blocks
          const br = (ball.bounds.max.x - ball.bounds.min.x) / 2;
          for (let i = artBlocks.length - 1; i >= 0; i--) {
            const bl = artBlocks[i];
            const dx = Math.abs(ball.position.x - bl.position.x);
            const dy = Math.abs(ball.position.y - bl.position.y);
            const hs = (bl.bounds.max.x - bl.bounds.min.x) / 2;
            if (dx < br + hs + 4 && dy < br + hs + 4) breakBlock(bl);
          }
        }

        // Speed clamp (lower max prevents tunneling)
        const spd = Vector.magnitude(ball.velocity);
        if (spd > 14) {
          Body.setVelocity(ball, Vector.mult(Vector.normalise(ball.velocity), 14));
        } else if (spd < 5) {
          Body.setVelocity(ball, Vector.mult(Vector.normalise(ball.velocity), 5));
        }

        // Respawn
        if (ball.position.y > ch + 40) {
          Body.setPosition(ball, { x: Math.random() * cw, y: -20 });
          Body.setVelocity(ball, { x: (Math.random() - 0.5) * 8, y: -(5 + Math.random() * 5) });
          ballTrails.set(ball.id, []);
          // @ts-ignore
          ball.isPiercing = 0;
          ball.collisionFilter.mask = CAT_ART | CAT_WALL | CAT_PADDLE;
        }

        // Trail
        const trail = ballTrails.get(ball.id) || [];
        trail.push({ x: ball.position.x, y: ball.position.y });
        if (trail.length > 8) trail.shift();
        ballTrails.set(ball.id, trail);

        // @ts-ignore
        const piercing = ball.isPiercing > 0;
        const bc = piercing ? accentColor : fgColor;
        for (let i = 0; i < trail.length; i++) {
          const alpha = (i / trail.length) * 0.45;
          ctx.beginPath();
          ctx.arc(trail[i].x, trail[i].y, (i / trail.length) * 6, 0, Math.PI * 2);
          ctx.fillStyle = bc;
          ctx.globalAlpha = alpha;
          ctx.fill();
        }
        ctx.globalAlpha = 1;

        ctx.save();
        ctx.beginPath();
        ctx.arc(ball.position.x, ball.position.y, 7, 0, Math.PI * 2);
        ctx.fillStyle = bc;
        if (piercing) {
          ctx.shadowColor = accentColor;
          ctx.shadowBlur = 12;
        }
        ctx.fill();
        ctx.restore();
      });

      // -- Paddle --
      if (paddle) {
        ctx.save();
        ctx.translate(paddle.position.x, paddle.position.y);
        ctx.rotate(paddle.angle);
        const pw = paddle.bounds.max.x - paddle.bounds.min.x;
        const ph = paddle.bounds.max.y - paddle.bounds.min.y;
        const pr2 = ph / 2;
        ctx.beginPath();
        ctx.moveTo(-pw / 2 + pr2, -ph / 2);
        ctx.lineTo(pw / 2 - pr2, -ph / 2);
        ctx.arcTo(pw / 2, -ph / 2, pw / 2, 0, pr2);
        ctx.arcTo(pw / 2, ph / 2, pw / 2 - pr2, ph / 2, pr2);
        ctx.lineTo(-pw / 2 + pr2, ph / 2);
        ctx.arcTo(-pw / 2, ph / 2, -pw / 2, 0, pr2);
        ctx.arcTo(-pw / 2, -ph / 2, -pw / 2 + pr2, -ph / 2, pr2);
        ctx.closePath();
        ctx.fillStyle = fgColor;
        ctx.fill();
        ctx.restore();
      }

      // -- Floaters --
      for (let i = floaters.length - 1; i >= 0; i--) {
        const f = floaters[i];
        f.x += f.vx; f.y += f.vy; f.life--;
        if (f.life <= 0) { floaters.splice(i, 1); continue; }
        ctx.globalAlpha = f.life / f.maxLife;
        ctx.fillStyle = fgColor;
        ctx.font = 'bold 20px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(f.text, f.x, f.y);
      }
      ctx.globalAlpha = 1;

      // -- Combo --
      if (combo > 0) {
        ctx.fillStyle = fgColor;
        ctx.font = 'bold 22px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`COMBO x${combo}`, cw / 2, 72);
      }

      // -- Ball pip HUD (bottom-left, mirrors the HTML overlay for canvas clarity) --
      const PR = 5, PG = 14, PY = ch - 16, PX0 = 16;
      for (let i = 0; i < MAX_BALLS; i++) {
        const filled = i < balls.length;
        ctx.save();
        ctx.beginPath();
        ctx.arc(PX0 + i * PG, PY, PR, 0, Math.PI * 2);
        if (filled) {
          ctx.shadowColor = fgColor;
          ctx.shadowBlur = 8;
          ctx.fillStyle = fgColor;
          ctx.fill();
        } else {
          ctx.strokeStyle = fgColor + '33';
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
        ctx.restore();
      }
      ctx.font = '9px monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = fgColor + '55';
      ctx.fillText('BALLS', PX0, PY - PR - 5);
    };

    raf = requestAnimationFrame(tick);

    const onResize = () => {
      cw = container.clientWidth;
      ch = container.clientHeight;
      canvas.width = cw;
      canvas.height = ch;
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('touchmove', onTouch);
      Engine.clear(engine);
      Composite.clear(engine.world, false, true);
    };
  }, [isReducedMotion, resetKey]);

  return (
    <div ref={containerRef} className={`relative w-full h-full overflow-hidden ${className}`}>
      <canvas ref={canvasRef} className="block w-full h-full" />

      {/* HUD overlay — reset button + ball counter */}
      <div className="absolute top-4 right-4 flex flex-col items-end gap-2 z-10 pointer-events-none">
        {/* Ball meter */}
        <div className="flex items-center gap-1.5 bg-black/50 backdrop-blur-sm border border-white/10 rounded-full px-3 py-1.5">
          <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: 'var(--dm404-fg, #10b981)', opacity: 0.6 }}>balls</span>
          <div className="flex gap-1">
            {Array.from({ length: MAX_BALLS }).map((_, i) => (
              <span
                key={i}
                className="block w-2 h-2 rounded-full transition-all duration-200"
                style={{
                  background: i < ballCount ? 'var(--dm404-fg, #10b981)' : 'transparent',
                  border: `1.5px solid ${ i < ballCount ? 'var(--dm404-fg, #10b981)' : 'rgba(255,255,255,0.2)'}`,
                  boxShadow: i < ballCount ? '0 0 6px var(--dm404-fg, #10b981)' : 'none',
                }}
              />
            ))}
          </div>
          <span className="text-[10px] font-mono" style={{ color: 'var(--dm404-fg, #10b981)', opacity: 0.5 }}>{ballCount}/{MAX_BALLS}</span>
        </div>

        {/* Reset button */}
        <button
          className="pointer-events-auto text-[11px] font-mono tracking-widest uppercase px-3 py-1.5 rounded-full border transition-all duration-200 active:scale-95"
          style={{
            color: 'var(--dm404-fg, #10b981)',
            borderColor: 'var(--dm404-fg, #10b981)',
            background: 'rgba(0,0,0,0.5)',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--dm404-fg, #10b981)', e.currentTarget.style.color = '#000')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.5)', e.currentTarget.style.color = 'var(--dm404-fg, #10b981)')}
          onClick={() => { setResetKey(k => k + 1); setBallCount(4); }}
        >
          ↺ reset
        </button>
      </div>
    </div>
  );
}
