import { ChevronDown, ChevronUp, Pause, Play, RotateCcw, StepBack, StepForward } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useStore } from 'zustand';
import { useAppState } from '../../app/app-context';
import type { PlaybackController } from '../../app/playback/playback-controller';
import { MINUTES_PER_DAY, PLAYBACK_SPEEDS, dayOf, dayTicks, missionTimeLabel } from '../../core/playback/timeline';
import type { ScriptedEvent } from '../../core/playback/timeline';
import { tierTheme } from '../../theme/tiers';
import { exitPlayback } from './exit-playback';
import { keyAction, keyBelongsToPage } from './playback-keys';
import { setPlayerHidden, usePlayerHidden } from './player-visibility';

const CLASS_LABEL: Record<ScriptedEvent['truth'], string> = {
  individual: 'individual',
  environmental: 'environmental',
  shared: 'shared, not environmental',
};

/**
 * Fixed at the bottom of every view while a DEMO scenario is loaded: the full bar, or (hidden) a small pill with the play
 * state, the mission time and "Show player". Hiding never touches the playback itself; the keys keep working.
 */
export function PlaybackBar() {
  const playback = useAppState((s) => s.playback);
  return playback ? <Player playback={playback} /> : null;
}

function Player({ playback }: { playback: PlaybackController }) {
  const { span } = playback;
  const hidden = usePlayerHidden();
  const announcement = useStore(playback.store, (s) => s.announcement);
  // Set by a click, so focus only moves after the user toggled (not on the first render).
  const moveFocus = useRef(false);

  // Keyboard: not while typing, and not inside menus and dialogs. Active while the bar is hidden too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const action = keyAction(e);
      if (!action || !keyBelongsToPage(e.target, e.key)) return;
      e.preventDefault();
      switch (action) {
        case 'toggle':
          return playback.toggle();
        case 'prev-reading':
          return void playback.step(-1);
        case 'next-reading':
          return void playback.step(1);
        case 'prev-day':
          return void playback.stepMinutes(-MINUTES_PER_DAY);
        case 'next-day':
          return void playback.stepMinutes(MINUTES_PER_DAY);
        case 'start':
          return void playback.seek(span.startT);
        case 'end':
          return void playback.seek(span.endT);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playback, span]);

  // The overall status of the signed-in view, for the live region when the cabin page is not open.
  const highest = useAppState((s) => s.session?.evaluation.highest ?? null);
  const previousHighest = useRef(highest);
  useEffect(() => {
    if (highest !== previousHighest.current && highest !== null) {
      playback.announce(highest === 'none' ? 'Overall status back to No findings.' : `Overall status changed to ${tierTheme(highest).label}.`);
    }
    previousHighest.current = highest;
  }, [highest, playback]);

  const toggleHidden = (next: boolean) => {
    moveFocus.current = true;
    setPlayerHidden(next);
  };
  const focusOnMount = () => {
    const wanted = moveFocus.current;
    moveFocus.current = false;
    return wanted;
  };

  return (
    <>
      {hidden ? (
        <Pill playback={playback} focusOnMount={focusOnMount} onShow={() => toggleHidden(false)} onExit={() => exitPlayback(playback)} />
      ) : (
        <Bar playback={playback} focusOnMount={focusOnMount} onHide={() => toggleHidden(true)} onExit={() => exitPlayback(playback)} />
      )}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
    </>
  );
}

function Pill({ playback, focusOnMount, onShow, onExit }: { playback: PlaybackController; focusOnMount: () => boolean; onShow: () => void; onExit: () => void }) {
  const t = useStore(playback.store, (s) => s.t);
  const playing = useStore(playback.store, (s) => s.playing);
  const show = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (focusOnMount()) show.current?.focus();
  }, [focusOnMount]);
  return (
    <section className="playback-pill" aria-label="Mission playback (hidden)">
      {playing ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
      <span className="mono" data-testid="mission-time">
        <span className="sr-only">Mission time </span>
        {missionTimeLabel(t)}
      </span>
      <button ref={show} type="button" className="button button--small" aria-label="Show player" title="Show player" onClick={onShow}>
        <ChevronUp size={16} aria-hidden="true" />
      </button>
      <button type="button" className="button button--small button--ghost" onClick={onExit}>
        Exit playback
      </button>
    </section>
  );
}

function Bar({ playback, focusOnMount, onHide, onExit }: { playback: PlaybackController; focusOnMount: () => boolean; onHide: () => void; onExit: () => void }) {
  const { span } = playback;
  const t = useStore(playback.store, (s) => s.t);
  const playing = useStore(playback.store, (s) => s.playing);
  const speedId = useStore(playback.store, (s) => s.speedId);
  const [showScript, setShowScript] = useState(false);
  const root = useRef<HTMLElement>(null);
  const hide = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (focusOnMount()) hide.current?.focus();
  }, [focusOnMount]);

  // The shell leaves room below the content for the bar, whatever height it has at this width.
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const apply = () => document.documentElement.style.setProperty('--playback-h', `${el.offsetHeight}px`);
    apply();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(apply);
    observer?.observe(el);
    return () => {
      observer?.disconnect();
      document.documentElement.style.removeProperty('--playback-h');
    };
  }, []);

  const activeEvent = span.events.find((e) => t >= e.startT && t < e.endT) ?? null;
  const nextEvent = span.events.find((e) => e.startT > t) ?? null;

  return (
    <section ref={root} className="playback" aria-label="Mission playback">
      <div className="playback__row">
        <div className="playback__group" role="group" aria-label="Transport">
          <button type="button" className="icon-button playback__play" aria-label="Play" aria-pressed={playing} onClick={() => playback.toggle()}>
            {playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
          </button>
          <button type="button" className="icon-button" aria-label="Previous reading" title="Previous reading (Left)" onClick={() => void playback.step(-1)}>
            <StepBack size={16} aria-hidden="true" />
          </button>
          <button type="button" className="icon-button" aria-label="Next reading" title="Next reading (Right)" onClick={() => void playback.step(1)}>
            <StepForward size={16} aria-hidden="true" />
          </button>
          <button type="button" className="button button--small button--ghost" aria-label="Back 1 hour" onClick={() => void playback.stepMinutes(-60)}>
            -1 h
          </button>
          <button type="button" className="button button--small button--ghost" aria-label="Forward 1 hour" onClick={() => void playback.stepMinutes(60)}>
            +1 h
          </button>
          <button type="button" className="icon-button" aria-label="Restart" title="Restart (back to where the scenario began)" onClick={() => void playback.restart()}>
            <RotateCcw size={16} aria-hidden="true" />
          </button>
        </div>

        <p className="playback__time mono" data-testid="mission-time">
          <span className="sr-only">Mission time </span>
          {missionTimeLabel(t)}
        </p>

        <div className="playback__group" role="group" aria-label="Speed">
          {PLAYBACK_SPEEDS.map((s) => (
            <button key={s.id} type="button" className="playback__speed" aria-pressed={speedId === s.id} onClick={() => playback.setSpeed(s.id)}>
              {s.label}
            </button>
          ))}
        </div>

        <label className="playback__script">
          <input type="checkbox" checked={showScript} onChange={(e) => setShowScript(e.target.checked)} />
          <span>Show script</span>
        </label>
        <button type="button" className="button button--small button--ghost playback__exit" onClick={onExit}>
          Exit playback
        </button>
        <button ref={hide} type="button" className="icon-button" aria-label="Hide player" title="Hide player" onClick={onHide}>
          <ChevronDown size={16} aria-hidden="true" />
        </button>
      </div>

      <Scrubber playback={playback} t={t} showScript={showScript} />

      <p className="playback__caption small">
        {showScript
          ? activeEvent
            ? `Scripted event: ${activeEvent.name} (${CLASS_LABEL[activeEvent.truth]}), ${missionTimeLabel(activeEvent.startT)} to ${missionTimeLabel(activeEvent.endT - 1)}.`
            : nextEvent
              ? `Next scripted event: ${nextEvent.name} (${CLASS_LABEL[nextEvent.truth]}), from ${missionTimeLabel(nextEvent.startT)}.`
              : 'No more scripted events.'
          : 'The injected script is hidden. Turn on Show script to compare it with what the engine flags.'}
      </p>
    </section>
  );
}

const pct = (t: number, startT: number, endT: number) => `${((t - startT) / (endT - startT)) * 100}%`;

function Scrubber({ playback, t, showScript }: { playback: PlaybackController; t: number; showScript: boolean }) {
  const { span } = playback;
  const { startT, endT } = span;
  const track = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const ticks = dayTicks(startT, endT);

  const tAt = (clientX: number): number => {
    const rect = track.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return t;
    return startT + Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * (endT - startT);
  };
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    dragging.current = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    e.currentTarget.focus();
    playback.scrub(tAt(e.clientX));
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragging.current) playback.scrub(tAt(e.clientX));
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    void playback.seek(tAt(e.clientX));
  };
  // Page Up/Down move by one hour on the slider itself; the arrows are handled for the whole page.
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault();
      void playback.stepMinutes(e.key === 'PageUp' ? 60 : -60);
    }
  };

  return (
    <div className="playback__scrub">
      <div
        ref={track}
        className="playback__track"
        role="slider"
        tabIndex={0}
        aria-label="Mission time"
        aria-valuemin={startT}
        aria-valuemax={endT}
        aria-valuenow={t}
        aria-valuetext={missionTimeLabel(t)}
        aria-orientation="horizontal"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={onKeyDown}
      >
        <span className="playback__rail" aria-hidden="true" />
        <span className="playback__played" aria-hidden="true" style={{ width: pct(t, startT, endT) }} />
        {ticks.map((tick) => (
          <span key={tick} className="playback__tick" aria-hidden="true" style={{ left: pct(tick, startT, endT) }} />
        ))}
        <span className="playback__thumb" aria-hidden="true" style={{ left: pct(t, startT, endT) }} />
      </div>
      {showScript ? (
        <div className="playback__events">
          {span.events.map((ev) => (
              <button
                key={ev.id}
                type="button"
                className="playback__event"
                data-class={ev.truth}
                aria-label={`Scripted event: ${ev.name}, ${missionTimeLabel(ev.startT)} to ${missionTimeLabel(ev.endT - 1)}`}
                title={`Scripted event: ${ev.name}`}
                style={{ left: pct(ev.startT, startT, endT), width: `calc(${pct(ev.endT, startT, endT)} - ${pct(ev.startT, startT, endT)})` }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => void playback.seek(ev.startT)}
              />
            ))}
        </div>
      ) : null}
      <div className="playback__days small" aria-hidden="true">
        {ticks
          .filter((_, i) => i % Math.max(1, Math.ceil(ticks.length / 8)) === 0)
          .map((tick) => (
            <span key={tick} style={{ left: pct(tick, startT, endT) }}>
              {dayOf(tick)}
            </span>
          ))}
      </div>
    </div>
  );
}
