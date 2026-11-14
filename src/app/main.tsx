import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../brand/fonts';
import '../theme/global.css';
import { BrandProvider } from '../brand/brand-context';
import { applyBrand } from '../brand/apply-brand';
import { App } from './App';
import { boot } from './boot';
import { brandConfig } from './composition-root';

// The composition root picks the brand: write it onto the page before the first render.
applyBrand(brandConfig);

const root = createRoot(document.getElementById('root')!);

void boot(window.location.search).then((result) => {
  root.render(
    <StrictMode>
      <BrandProvider value={brandConfig}>
        <App boot={result} />
      </BrandProvider>
    </StrictMode>,
  );
});
