import { describe, expect, it } from 'vitest';
import { ARC_DEPTH, SLOT, clampRotation, slotPosition, wheelGeometry } from './AlertRail';

describe('zone wheel geometry', () => {
  const geo = wheelGeometry(600);

  it('fits the circle to the column: x = 0 at top and bottom, x = depth in the middle', () => {
    const at = (y: number) => geo.cx + Math.sqrt(geo.r ** 2 - (y - geo.cy) ** 2);
    expect(at(0)).toBeCloseTo(0, 5);
    expect(at(600)).toBeCloseTo(0, 5);
    expect(at(300)).toBeCloseTo(ARC_DEPTH, 5);
  });

  it('puts the card being turned to at the centre of the arc', () => {
    const { x, y } = slotPosition(2, 2, geo);
    expect(y).toBeCloseTo(300, 5);
    expect(x).toBeCloseTo(ARC_DEPTH, 5);
  });

  it('spaces neighbours one slot apart along the arc and curves them back toward the edge', () => {
    const a = slotPosition(2, 2, geo);
    const b = slotPosition(3, 2, geo);
    expect(Math.abs(b.angle - a.angle) * geo.r).toBeCloseTo(SLOT, 5);
    expect(b.y).toBeGreaterThan(a.y);
    expect(b.x).toBeLessThan(a.x);
  });

  it('turns smoothly: half a turn moves a card halfway between two slots', () => {
    const half = slotPosition(3, 2.5, geo);
    expect(half.y).toBeCloseTo(geo.cy + geo.r * Math.sin((0.5 * SLOT) / geo.r), 5);
  });

  it('stops turning at the first and last card', () => {
    expect(clampRotation(-1, 6)).toBe(0);
    expect(clampRotation(9, 6)).toBe(5);
    expect(clampRotation(2.4, 6)).toBe(2.4);
  });
});
