/// <reference path="../.astro/types.d.ts" />

interface ImportMetaEnv {
  readonly BREVO_API_KEY: string;
  readonly BREVO_LISTA_LIBRO: string;
  readonly BREVO_TEMPLATE_LIBRO: string;
  readonly GATING_ACTIVO: string;
  readonly COMUNIDAD_ACTIVA: string;
  readonly SITE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
