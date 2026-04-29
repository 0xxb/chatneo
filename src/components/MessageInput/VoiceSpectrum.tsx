import { useRef, useEffect, type RefObject } from 'react';

export default function VoiceSpectrum({
  analyserRef,
}: {
  analyserRef: RefObject<AnalyserNode | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const accentColor = getComputedStyle(canvas).getPropertyValue('--color-accent').trim() || '#007AFF';
    let dataBuffer: Uint8Array | null = null;
    let w = 0;
    let h = 0;

    const syncSize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      w = rect.width * dpr;
      h = rect.height * dpr;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };

    syncSize();
    const ro = new ResizeObserver(syncSize);
    ro.observe(canvas);

    let animId: number;

    const draw = () => {
      const analyser = analyserRef.current;
      if (!analyser) {
        animId = requestAnimationFrame(draw);
        return;
      }

      if (!dataBuffer || dataBuffer.length !== analyser.frequencyBinCount) {
        dataBuffer = new Uint8Array(analyser.frequencyBinCount);
      }
      analyser.getByteFrequencyData(dataBuffer);

      ctx.clearRect(0, 0, w, h);

      const dpr = window.devicePixelRatio || 1;
      const barCount = Math.min(dataBuffer.length, 48);
      const gap = 2 * dpr;
      const barWidth = Math.max(2 * dpr, (w - gap * (barCount - 1)) / barCount);
      const totalWidth = barCount * barWidth + (barCount - 1) * gap;
      const offsetX = (w - totalWidth) / 2;
      const minHeight = 2 * dpr;

      ctx.fillStyle = accentColor;

      for (let i = 0; i < barCount; i++) {
        const value = dataBuffer[i] / 255;
        const barHeight = Math.max(minHeight, value * h * 0.85);
        const x = offsetX + i * (barWidth + gap);
        const y = (h - barHeight) / 2;
        const radius = Math.min(barWidth / 2, 2 * dpr);

        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, radius);
        ctx.fill();
      }

      animId = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
    };
  }, [analyserRef]);

  return (
    <div
      className="flex-1 h-7 min-w-0"
      style={{
        maskImage: 'linear-gradient(to right, transparent, black 15%, black 85%, transparent)',
        WebkitMaskImage: 'linear-gradient(to right, transparent, black 15%, black 85%, transparent)',
      }}
    >
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}
