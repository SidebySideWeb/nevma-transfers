import { useEffect, useRef, useState } from 'react';

export type HoldCountdownArgs = {
  /** Server `expiresAt` (ISO 8601 with offset). The countdown is derived from it, never from a local start. */
  expiresAt: string;
  serverSkewMs: number;
  /** "Your vehicle is held for {minutes} minutes." */
  announceTemplate: string;
  warningText: string;
  onExpired: () => void;
};

export const formatMmSs = (ms: number): string => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * Ticks every second for the visible digits. `announce` changes at most once a minute (whole minutes
 * left, rounded up) plus once with `warningText` at 2 minutes, so a live region on it stays calm.
 */
export function useHoldCountdown(args: HoldCountdownArgs | null): { mmss: string; announce: string } {
  const [leftMs, setLeftMs] = useState(() =>
    args ? new Date(args.expiresAt).getTime() - (Date.now() - args.serverSkewMs) : 0,
  );
  const [announce, setAnnounce] = useState('');
  const lastMinute = useRef<number | null>(null);
  const warned = useRef(false);
  const expired = useRef(false);
  const onExpired = useRef(args?.onExpired);
  onExpired.current = args?.onExpired;

  const expiresAt = args?.expiresAt;
  const serverSkewMs = args?.serverSkewMs ?? 0;
  const announceTemplate = args?.announceTemplate ?? '';
  const warningText = args?.warningText ?? '';

  useEffect(() => {
    lastMinute.current = null;
    warned.current = false;
    expired.current = false;
    if (!expiresAt) {
      setAnnounce('');
      return;
    }
    const tick = () => {
      const ms = new Date(expiresAt).getTime() - (Date.now() - serverSkewMs);
      setLeftMs(ms);
      if (ms <= 0) {
        if (!expired.current) {
          expired.current = true;
          onExpired.current?.();
        }
        return;
      }
      const minutes = Math.ceil(ms / 60_000);
      if (lastMinute.current !== minutes) {
        lastMinute.current = minutes;
        setAnnounce(announceTemplate.replace('{minutes}', String(minutes)));
      }
      if (ms <= 2 * 60_000 && !warned.current) {
        warned.current = true;
        setAnnounce(warningText);
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [expiresAt, serverSkewMs, announceTemplate, warningText]);

  return { mmss: formatMmSs(leftMs), announce };
}
