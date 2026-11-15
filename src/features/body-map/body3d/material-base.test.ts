import { MeshStandardMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { materialBase } from './Body3D';

describe('cached material state', () => {
  it('records the authored state once and ignores later fading', () => {
    const material = new MeshStandardMaterial({ transparent: false, opacity: 1, depthWrite: true });
    expect(materialBase(material)).toEqual({ transparent: false, opacity: 1, depthWrite: true });
    // A focus fades it, then the component unmounts and mounts again over the same cached material.
    material.transparent = true;
    material.opacity = 0.12;
    material.depthWrite = false;
    expect(materialBase(material)).toEqual({ transparent: false, opacity: 1, depthWrite: true });
  });
});
