/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the backend API (no trailing slash), e.g. `http://localhost:8000`. Set at build time. */
  readonly VITE_API_URL: string;
  /** Base URL of the NASA OSDR EDA API; defaults to the same-origin `/nasa-osdr/eda/api` proxy path. */
  readonly VITE_NASA_OSDR_BASE_URL?: string;
  /** EDA mission whose ISS cabin CO2 is the reference; defaults to RR-19. */
  readonly VITE_NASA_OSDR_MISSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
