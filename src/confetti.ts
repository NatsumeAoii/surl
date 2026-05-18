/**
 * Confetti animation — lightweight canvas-based particle burst.
 * Call `fireConfetti()` to trigger a celebration animation.
 */

interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    color: string;
    rotation: number;
    rotationSpeed: number;
    life: number;
    decay: number;
    shape: 'rect' | 'circle';
}

const COLORS = ['#818cf8', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#22d3ee', '#fb923c'];

export function fireConfetti(originX?: number, originY?: number): void {
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;inset:0;z-index:9999;pointer-events:none';
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);

    const _ctx = canvas.getContext('2d');
    if (!_ctx) {
        canvas.remove();
        return;
    }
    const ctx = _ctx;
    const cx = originX ?? canvas.width / 2;
    const cy = originY ?? canvas.height * 0.35;

    const particles: Particle[] = [];
    for (let i = 0; i < 80; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 4 + Math.random() * 8;
        particles.push({
            x: cx,
            y: cy,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 3,
            size: 4 + Math.random() * 6,
            color: COLORS[Math.floor(Math.random() * COLORS.length)],
            rotation: Math.random() * Math.PI * 2,
            rotationSpeed: (Math.random() - 0.5) * 0.2,
            life: 1,
            decay: 0.012 + Math.random() * 0.008,
            shape: Math.random() > 0.5 ? 'rect' : 'circle',
        });
    }

    let frameId: number;

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        let alive = false;

        for (const p of particles) {
            if (p.life <= 0) continue;
            alive = true;

            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.15; // gravity
            p.vx *= 0.99; // air resistance
            p.rotation += p.rotationSpeed;
            p.life -= p.decay;

            ctx.save();
            ctx.globalAlpha = Math.max(0, p.life);
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation);
            ctx.fillStyle = p.color;

            if (p.shape === 'rect') {
                ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
            } else {
                ctx.beginPath();
                ctx.arc(0, 0, p.size / 2.5, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }

        if (alive) {
            frameId = requestAnimationFrame(animate);
        } else {
            cancelAnimationFrame(frameId);
            canvas.remove();
        }
    }

    frameId = requestAnimationFrame(animate);
}
