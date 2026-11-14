import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { BrandConfig } from './brand.types';

const BrandContext = createContext<BrandConfig | null>(null);

/** The composition root provides the brand; components never import brand.config.ts. */
export function BrandProvider({ value, children }: { value: BrandConfig; children: ReactNode }) {
  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}

export function useBrand(): BrandConfig {
  const value = useContext(BrandContext);
  if (!value) throw new Error('useBrand needs a BrandProvider.');
  return value;
}
