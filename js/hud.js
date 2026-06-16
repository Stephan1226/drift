// DOM HUD: signal bar, stats, danger vignette, and the radar minimap.

export class HUD {
  constructor() {
    this.barFill   = document.getElementById('barFill');
    this.signalPct = document.getElementById('signalPct');
    this.distanceEl= document.getElementById('distance');
    this.coresEl   = document.getElementById('cores');
    this.timeEl    = document.getElementById('time');
    this.vignette  = document.getElementById('vignette');

    this.radar = document.getElementById('radar');
    this.rctx  = this.radar.getContext('2d');
    this.radarRange = 700;

    this._danger = 0;
  }

  update(state) {
    const pct = Math.max(0, Math.min(100, state.integrity));
    this.barFill.style.width = pct + '%';

    // bar shifts cyan -> amber -> red as it drops
    let col;
    if (pct > 50)      col = 'linear-gradient(90deg,#1aa6c8,#4fe9ff)';
    else if (pct > 25) col = 'linear-gradient(90deg,#c89a1a,#ffcf7a)';
    else               col = 'linear-gradient(90deg,#c8261a,#ff4d5e)';
    this.barFill.style.background = col;
    this.signalPct.textContent = Math.ceil(pct) + '%';

    this.distanceEl.textContent = Math.floor(state.distance).toLocaleString();
    this.coresEl.textContent = state.cores;
    this.timeEl.textContent = formatTime(state.time);

    // danger vignette ramps in under 30%, pulsing harder the lower it gets
    const danger = pct < 30 ? (1 - pct / 30) : 0;
    const pulse = danger > 0 ? (0.55 + 0.45 * Math.sin(state.time * (4 + danger * 6))) : 0;
    this.vignette.style.opacity = (danger * pulse).toFixed(3);
  }

  drawRadar(player, cores) {
    const ctx = this.rctx;
    const W = this.radar.width, H = this.radar.height;
    const cx = W / 2, cy = H / 2, R = W / 2 - 6;
    ctx.clearRect(0, 0, W, H);

    // rings
    ctx.strokeStyle = 'rgba(79,233,255,0.18)';
    ctx.lineWidth = 2;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.arc(cx, cy, R * i / 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R);
    ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy);
    ctx.strokeStyle = 'rgba(79,233,255,0.10)';
    ctx.stroke();

    // core blips, rotated so the player heading points "up"
    const yaw = player.yaw;
    const sin = Math.sin(-yaw), cos = Math.cos(-yaw);
    for (const c of cores) {
      if (!c.visible) continue;
      let dx = c.position.x - player.camera.position.x;
      let dz = c.position.z - player.camera.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > this.radarRange) continue;
      // world -> radar: forward (-Z) maps to up
      const rx =  dx * cos - dz * sin;
      const rz =  dx * sin + dz * cos;
      const px = cx + (rx / this.radarRange) * R;
      const py = cy + (rz / this.radarRange) * R;
      const a = 1 - dist / this.radarRange;
      ctx.fillStyle = `rgba(255,207,122,${0.4 + a * 0.6})`;
      ctx.beginPath();
      ctx.arc(px, py, 3 + a * 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // player triangle at centre
    ctx.fillStyle = '#eaf6ff';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 8);
    ctx.lineTo(cx - 5, cy + 6);
    ctx.lineTo(cx + 5, cy + 6);
    ctx.closePath();
    ctx.fill();
  }
}

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}
