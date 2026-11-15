/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the backend API (no trailing slash), e.g. `http://localhost:8000`. Set at build time. */
  readonly VITE_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
