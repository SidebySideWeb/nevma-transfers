import { useHoldCountdown, type HoldCountdownArgs } from './useHoldCountdown';

export type HeroStepKey = 'search' | 'vehicle' | 'details' | 'review';
export const HERO_STEPS: HeroStepKey[] = ['search', 'vehicle', 'details', 'review'];

/** Copy of `siteHeader` (08-book carries it inside `appHero`); strings and links come from siteSettings / uiStrings. */
export type HeroHeader = {
  homeHref: string;
  homeLabel: string;
  logoSrc: string;
  logoAlt: string;
  navLabel: string;
  nav: { href: string; label: string }[];
  phone: string;
  phoneHref: string;
  bookHref: string;
  bookLabel: string;
  menuLabel: string;
};

export type HeroHold = Omit<HoldCountdownArgs, 'announceTemplate' | 'warningText'> &
  Partial<Pick<HoldCountdownArgs, 'announceTemplate' | 'warningText'>> & {
    /** Already filled, e.g. "V-CLASS HELD FOR". */
    label: string;
    timerLabel: string;
  };

export type BookingHeroProps = {
  header: HeroHeader;
  step: HeroStepKey;
  title: string;
  /** The four step names, in order. */
  stepLabels: [string, string, string, string];
  stepsLabel: string;
  hold?: HeroHold | null;
  /** Called for a finished step; later steps are not clickable. */
  onGoStep?: (step: HeroStepKey) => void;
};

/** `appHero` of 08-book .. 08-book-4: header, title, hold badge and the four-step indicator. */
export function BookingHero({
  header,
  step,
  title,
  stepLabels,
  stepsLabel,
  hold,
  onGoStep,
}: BookingHeroProps) {
  const current = HERO_STEPS.indexOf(step);
  const { mmss, announce } = useHoldCountdown(
    hold
      ? {
          expiresAt: hold.expiresAt,
          serverSkewMs: hold.serverSkewMs,
          announceTemplate: hold.announceTemplate ?? '',
          warningText: hold.warningText ?? '',
          onExpired: hold.onExpired,
        }
      : null,
  );

  return (
    <>
      <section data-block="appHero" className="bgx1 s5e090">
        <header data-block="siteHeader" className="s5420c">
          <div className="s9b0ab">
            <a className="s5d8d1" href={header.homeHref} aria-label={header.homeLabel}>
              <img className="sf7837" src={header.logoSrc} alt={header.logoAlt} />
            </a>
            <nav className="nav" aria-label={header.navLabel}>
              {header.nav.map((item) => (
                <a key={item.href} href={item.href}>
                  {item.label}
                </a>
              ))}
            </nav>
            <div className="sb7318">
              <a className="hide-m sf0e3c" href={header.phoneHref}>
                {header.phone}
              </a>
              <a className="btn btn-gold hide-m sb2d40" href={header.bookHref}>
                {header.bookLabel}
              </a>
              {/* Same hooks as SiteHeader.astro: v2-menu.ts opens the panel from `.js-menu-open`. */}
              <button
                type="button"
                className="burger s5aee5 js-menu-open"
                aria-label={header.menuLabel}
                aria-expanded="false"
                aria-controls="v2-menu"
              >
                ☰
              </button>
              <a className="burger s5aee5 v2-menu-nojs" href="#menu" aria-label={header.menuLabel}>
                ☰
              </a>
            </div>
          </div>
        </header>

        <div className="sc68e2">
          <div className="s3a80d">
            <h1 className="display sd5a38" tabIndex={-1}>
              {title}
            </h1>
            {hold ? (
              <div className="s96e22" role="timer" aria-label={hold.timerLabel}>
                <span className="sb3186" aria-hidden="true" />
                <span className="sf3294">{hold.label}</span>
                <span className="sd7eda">{mmss}</span>
              </div>
            ) : null}
          </div>
          <ol className="s27bfa" aria-label={stepsLabel}>
            {stepLabels.map((label, i) => {
              const done = i < current;
              const active = i === current;
              return (
                <li key={HERO_STEPS[i]} className="saea88" aria-current={active ? 'step' : 'false'}>
                  <span className={done || active ? 's9eec8' : 'sdb8ef'} />
                  <button
                    type="button"
                    className={`stepbtn ${active ? 's832a0' : done ? 's8b46f' : 's6d4c6'}`}
                    disabled={!done && !active}
                    onClick={done ? () => onGoStep?.(HERO_STEPS[i]!) : undefined}
                  >
                    <span className="sdc5b9">{i + 1}.</span>
                    {done ? '✓ ' : ''}
                    {label}
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </section>
      {/* Not part of the design block (keeps its text exact): one polite announcement a minute. */}
      <span className="js-sr-only" role="status" aria-live="polite" data-testid="hold-live">
        {announce}
      </span>
    </>
  );
}
