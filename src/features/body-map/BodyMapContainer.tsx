import { Component, lazy, Suspense, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { useZones } from '../insights/use-zones';
import { EmptyState } from '../../ui/Panel';
import type { BodyModel, BodyModelProps } from './body-model';
import { SvgBody } from './SvgBody';

/** Every body implementation behind the same contract. The 3D body is code-split: three.js loads only here. */
const BODY_REGISTRY: Record<'svg' | 'anatomy3d', BodyModel> = {
  svg: SvgBody,
  anatomy3d: lazy(() => import('./body3d/Body3D')),
};

let webglCache: boolean | null = null;
/** True when the browser can create a WebGL context. jsdom and locked-down browsers cannot. */
export function supportsWebGL(): boolean {
  if (webglCache !== null) return webglCache;
  try {
    if (typeof window === 'undefined' || /jsdom/i.test(navigator.userAgent)) return (webglCache = false);
    const canvas = document.createElement('canvas');
    webglCache = Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    webglCache = false;
  }
  return webglCache;
}

const reducedMotionQuery = '(prefers-reduced-motion: reduce)';
function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (notify) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {};
      const mq = window.matchMedia(reducedMotionQuery);
      mq.addEventListener('change', notify);
      return () => mq.removeEventListener('change', notify);
    },
    () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(reducedMotionQuery).matches : false),
  );
}

/** If the 3D body fails (model missing, context lost), show the 2D body instead of a broken canvas. */
class BodyFallback extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function BodyMapContainer() {
  const { views, selectedZoneId, focusZoneId, selectZone } = useZones();
  const reducedMotion = useReducedMotion();
  if (views.length === 0) return <EmptyState>Loading body map.</EmptyState>;
  const props: BodyModelProps = { zones: views, selectedZoneId, focusZoneId, onSelectZone: selectZone, reducedMotion };
  const flat = <SvgBody {...props} />;
  if (!supportsWebGL()) return flat;
  const Body = BODY_REGISTRY.anatomy3d;
  return (
    <BodyFallback fallback={flat}>
      <Suspense fallback={<p className="body3d__loading" role="status">Loading body model.</p>}>
        <Body {...props} />
      </Suspense>
    </BodyFallback>
  );
}
