import { useEffect, useRef, useState } from 'react';

type Props = {
  expiresAt: string;
  serverSkewMs: number;
  timerTemplate: string;
  warningText: string;
  onExpired: () => void;
};

function fillMinutes(template: string, mmss: string): string {
  return template.replace('{minutes}', mmss);
}

export function HoldTimer({
  expiresAt,
  serverSkewMs,
  timerTemplate,
  warningText,
  onExpired,
}: Props) {
  const [leftMs, setLeftMs] = useState(() => new Date(expiresAt).getTime() - (Date.now() - serverSkewMs));
  const [announce, setAnnounce] = useState('');
  const lastMinuteAnnounced = useRef<number | null>(null);
  const warned = useRef(false);
  const expired = useRef(false);

  useEffect(() => {
    const tick = () => {
      const ms = new Date(expiresAt).getTime() - (Date.now() - serverSkewMs);
      setLeftMs(ms);
      if (ms <= 0) {
        if (!expired.current) {
          expired.current = true;
          onExpired();
        }
        return;
      }
      const totalSec = Math.ceil(ms / 1000);
      const mins = Math.floor(totalSec / 60);
      if (lastMinuteAnnounced.current !== mins) {
        lastMinuteAnnounced.current = mins;
        const mm = String(mins).padStart(2, '0');
        const ss = String(totalSec % 60).padStart(2, '0');
        setAnnounce(fillMinutes(timerTemplate, `${mm}:${ss}`));
      }
      if (ms <= 2 * 60_000 && !warned.current) {
        warned.current = true;
        setAnnounce(warningText);
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [expiresAt, serverSkewMs, timerTemplate, warningText, onExpired]);

  const totalSec = Math.max(0, Math.ceil(leftMs / 1000));
  const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const ss = String(totalSec % 60).padStart(2, '0');
  const mmss = `${mm}:${ss}`;
  const [before = '', after = ''] = timerTemplate.split('{minutes}');

  return (
    <>
      <p className="timer" aria-hidden="true">
        {before}
        <strong>{mmss}</strong>
        {after}
      </p>
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>
    </>
  );
}
