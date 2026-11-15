import { CameraControls, Html, Stars, useAnimations, useGLTF, useProgress } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Box3, Color, Group, Mesh, MeshStandardMaterial, Object3D, Vector3 } from 'three';
import { useBrand } from '../../../brand/brand-context';
import type { ZoneId, ZoneStatus } from '../../../core/health/model';
import { tierTheme } from '../../../theme/tiers';
import { tierStyle } from '../../../ui/TierChip';
import type { BodyModelProps, ZoneView } from '../body-model';
import { ORGAN_ZONE, ZONE_FOCUS, ZONE_PIN, meshesOfZone, pickZone } from './organ-map';

export const BODY_MODEL_URL = '/models/body.glb';
/** The model is authored in centimetres; the scene works in metres. */
const MODEL_SCALE = 0.01;
const ALERTING: ReadonlySet<ZoneStatus> = new Set(['notice', 'caution', 'warning']);
const FADED_OPACITY = 0.12;

interface OrganMaterial {
  material: MeshStandardMaterial;
  zone: ZoneId | null;
  baseTransparent: boolean;
  baseOpacity: number;
}

function Loader() {
  const { progress } = useProgress();
  return (
    <Html center>
      <p className="body3d__loading" role="status">
        Loading body model {Math.round(progress)}%
      </p>
    </Html>
  );
}

function Pins({
  meshes,
  zones,
  hidden,
  selectedZoneId,
  onSelect,
}: {
  meshes: ReadonlyMap<string, Mesh>;
  zones: readonly ZoneView[];
  hidden: (id: ZoneId) => boolean;
  selectedZoneId: ZoneId | null;
  onSelect(id: ZoneId): void;
}) {
  const anchors = useMemo(() => {
    const out = new Map<ZoneId, Vector3>();
    for (const zone of zones) {
      const pin = ZONE_PIN[zone.id];
      if (typeof pin === 'string') {
        const mesh = meshes.get(pin);
        if (mesh) {
          // Parents' world matrices may be stale before the first frame: refresh the whole chain first.
          mesh.updateWorldMatrix(true, false);
          out.set(zone.id, new Box3().setFromObject(mesh).getCenter(new Vector3()));
        }
      } else {
        out.set(zone.id, new Vector3(...pin).multiplyScalar(MODEL_SCALE));
      }
    }
    return out;
  }, [meshes, zones]);

  return (
    <>
      {zones.map((zone) => {
        const at = anchors.get(zone.id);
        if (!at) return null;
        // Hidden pins stay mounted: unmounting drei <Html> mid-commit breaks under React 19.
        const off = hidden(zone.id);
        const theme = tierTheme(zone.status);
        const Icon = theme.icon;
        const alerting = ALERTING.has(zone.status);
        return (
          <Html key={zone.id} position={at} center zIndexRange={[20, 0]}>
            <button
              type="button"
              className={`organ-pin${alerting ? ' organ-pin--alert' : ''}${off ? ' organ-pin--hidden' : ''}`}
              tabIndex={off ? -1 : undefined}
              aria-hidden={off || undefined}
              style={tierStyle(zone.status)}
              aria-label={`${zone.label}, ${theme.label}`}
              aria-pressed={zone.id === selectedZoneId}
              onClick={() => onSelect(zone.id)}
            >
              <span className="organ-pin__dot" aria-hidden="true">
                <Icon size={12} weight="bold" />
              </span>
              <span className="organ-pin__label">{zone.label}</span>
            </button>
          </Html>
        );
      })}
    </>
  );
}

/** Writes the status glow onto the organ materials. Runs every frame, outside React state. */
function applyGlow(
  entries: readonly OrganMaterial[],
  tint: Color,
  status: ReadonlyMap<ZoneId, ZoneStatus>,
  pulse: number,
  hovered: ZoneId | null,
  focused: ZoneId | null,
) {
  for (const entry of entries) {
    const zoneStatus = entry.zone ? status.get(entry.zone) : undefined;
    const alerting = zoneStatus !== undefined && ALERTING.has(zoneStatus) && entry.zone !== 'bone';
    const isHover = entry.zone !== null && entry.zone === hovered;
    const isSelected = entry.zone !== null && entry.zone === focused;
    if (alerting) {
      entry.material.emissive.copy(tint.set(tierTheme(zoneStatus).color));
      entry.material.emissiveIntensity = (isSelected ? 0.5 : 0.35) * pulse + (isHover ? 0.15 : 0);
    } else if (isHover) {
      entry.material.emissive.setScalar(1);
      entry.material.emissiveIntensity = 0.08;
    } else {
      entry.material.emissiveIntensity = 0;
    }
  }
}

function BodyModel({
  zones,
  focusZoneId,
  selectedZoneId,
  reducedMotion,
  onSelectZone,
  onReady,
}: {
  zones: readonly ZoneView[];
  focusZoneId: ZoneId | null;
  selectedZoneId: ZoneId | null;
  reducedMotion: boolean;
  onSelectZone(id: ZoneId): void;
  onReady(root: Object3D, meshes: ReadonlyMap<string, Mesh>): void;
}) {
  const { scene, animations } = useGLTF(BODY_MODEL_URL);
  const group = useRef<Group>(null);
  const { actions } = useAnimations(animations, group);
  const [hovered, setHovered] = useState<ZoneId | null>(null);
  const status = useMemo(() => new Map(zones.map((z) => [z.id, z.status])), [zones]);

  const { meshes, materials } = useMemo(() => {
    const meshes = new Map<string, Mesh>();
    const materials: OrganMaterial[] = [];
    scene.traverse((obj) => {
      if (!(obj instanceof Mesh)) return;
      const name = typeof obj.material?.name === 'string' && obj.material.name in ORGAN_ZONE ? obj.material.name : obj.name;
      meshes.set(name, obj);
      obj.userData.organ = name;
      const material = obj.material as MeshStandardMaterial;
      materials.push({
        material,
        zone: ORGAN_ZONE[name] ?? null,
        baseTransparent: material.transparent,
        baseOpacity: material.opacity,
      });
    });
    return { meshes, materials };
  }, [scene]);

  useEffect(() => {
    if (group.current) onReady(group.current, meshes);
  }, [meshes, onReady]);

  useEffect(() => {
    const action = Object.values(actions)[0];
    if (!action) return;
    if (reducedMotion) action.stop();
    else action.reset().play();
    return () => void action.stop();
  }, [actions, reducedMotion]);

  // Focus: everything outside the focused zone fades, so an enclosed organ (brain in skull) shows.
  useEffect(() => {
    const keep = focusZoneId ? meshesOfZone(focusZoneId) : null;
    for (const m of meshes.values()) {
      const organ = m.userData.organ as string;
      const entry = materials.find((x) => x.material === m.material);
      if (!entry) continue;
      const faded = keep !== null && !keep.has(organ);
      entry.material.transparent = faded || entry.baseTransparent;
      entry.material.opacity = faded ? FADED_OPACITY : entry.baseOpacity;
      entry.material.depthWrite = !faded;
      entry.material.needsUpdate = true;
      m.renderOrder = faded ? 1 : 0;
    }
  }, [focusZoneId, meshes, materials]);

  // Status glow: alerting zones glow in their tier color; hover lifts any selectable zone slightly.
  // Three.js objects are mutated every frame, so the render loop reads them through a ref.
  const live = useRef({ materials, tint: new Color() });
  useEffect(() => {
    live.current.materials = materials;
  }, [materials]);
  useFrame(({ clock }) => {
    const { materials: entries, tint } = live.current;
    const pulse = reducedMotion ? 0.6 : 0.45 + 0.35 * Math.sin(clock.elapsedTime * 2.4);
    applyGlow(entries, tint, status, pulse, hovered, focusZoneId !== null ? selectedZoneId : null);
  });

  const hitNames = (e: ThreeEvent<PointerEvent | MouseEvent>) =>
    e.intersections.map((i) => (i.object.userData.organ as string | undefined) ?? i.object.name);

  return (
    <group
      ref={group}
      scale={MODEL_SCALE}
      onPointerMove={(e) => {
        e.stopPropagation();
        const zone = pickZone(hitNames(e));
        setHovered(zone);
        document.body.style.cursor = zone ? 'pointer' : 'grab';
      }}
      onPointerOut={() => {
        setHovered(null);
        document.body.style.cursor = '';
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (e.delta > 4) return; // that was a drag to rotate, not a click
        const zone = pickZone(hitNames(e));
        if (zone) onSelectZone(zone);
      }}
    >
      <primitive object={scene} />
    </group>
  );
}

/** Frames the whole body, or the focused zone, with an animated camera move. */
function useCameraFocus(
  controls: RefObject<CameraControls | null>,
  model: { root: Object3D; meshes: ReadonlyMap<string, Mesh> } | null,
  focusZoneId: ZoneId | null,
  reducedMotion: boolean,
) {
  useEffect(() => {
    const cc = controls.current;
    if (!cc || !model) return;
    const box = new Box3();
    const focus = focusZoneId ? ZONE_FOCUS[focusZoneId] : 'all';
    if (focus === 'all') box.setFromObject(model.root);
    else for (const name of focus) {
      const mesh = model.meshes.get(name);
      if (mesh) box.expandByObject(mesh);
    }
    if (box.isEmpty()) return;
    const whole = focus === 'all';
    void cc.fitToBox(box, !reducedMotion, {
      paddingTop: whole ? 0.08 : 0.06,
      paddingBottom: whole ? 0.08 : 0.06,
      paddingLeft: whole ? 0.2 : 0.06,
      paddingRight: whole ? 0.2 : 0.06,
    });
  }, [controls, model, focusZoneId, reducedMotion]);
}

function Scene(props: BodyModelProps) {
  const { zones, selectedZoneId, onSelectZone, reducedMotion = false } = props;
  const focusZoneId = props.focusZoneId ?? null;
  const brand = useBrand();
  const controls = useRef<CameraControls>(null);
  const [model, setModel] = useState<{ root: Object3D; meshes: ReadonlyMap<string, Mesh> } | null>(null);
  const onReady = useMemo(() => (root: Object3D, meshes: ReadonlyMap<string, Mesh>) => setModel({ root, meshes }), []);
  useCameraFocus(controls, model, focusZoneId, reducedMotion);

  return (
    <>
      <color attach="background" args={[brand.colors[brand.scene.background]]} />
      <hemisphereLight args={[brand.colors[brand.scene.keyLight], brand.colors[brand.scene.background], 1.1]} />
      <directionalLight position={[2, 3, 2]} intensity={2.2} color={brand.colors[brand.scene.keyLight]} />
      <directionalLight position={[-2, 1, -2]} intensity={0.9} color={brand.colors[brand.scene.rimLight]} />
      <Stars radius={60} depth={30} count={3500} factor={3} saturation={0} fade speed={reducedMotion ? 0 : 0.4} />
      <Suspense fallback={<Loader />}>
        <BodyModel
          zones={zones}
          focusZoneId={focusZoneId}
          selectedZoneId={selectedZoneId}
          reducedMotion={reducedMotion}
          onSelectZone={onSelectZone}
          onReady={onReady}
        />
        {model ? (
          <Pins
            meshes={model.meshes}
            zones={zones}
            selectedZoneId={selectedZoneId}
            onSelect={onSelectZone}
            hidden={(id) => focusZoneId !== null && id !== focusZoneId}
          />
        ) : null}
      </Suspense>
      <CameraControls ref={controls} makeDefault minDistance={0.25} maxDistance={6} smoothTime={0.35} />
    </>
  );
}

/**
 * The 3D body: the anatomical model in its own colors, floating in space. Drag to rotate, scroll to zoom,
 * click an organ (or its pin) to focus it. Alerting zones glow in their tier color.
 */
export default function Body3D(props: BodyModelProps) {
  return (
    <div className="body3d">
      <Canvas
        camera={{ position: [0, 1, 3.2], fov: 35, near: 0.01, far: 200 }}
        dpr={[1, 2]}
        gl={{ antialias: true }}
        aria-label="3D body model. Drag to rotate, click an organ to focus it."
        role="img"
      >
        <Scene {...props} />
      </Canvas>
    </div>
  );
}

useGLTF.preload(BODY_MODEL_URL);
