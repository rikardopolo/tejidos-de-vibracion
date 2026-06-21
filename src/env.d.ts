/// <reference path="../.astro/types.d.ts" />

interface ImportMetaEnv {
  readonly BREVO_API_KEY: string;
  readonly BREVO_LISTA_LIBRO: string;
  readonly BREVO_TEMPLATE_DOI: string;
  readonly BREVO_TEMPLATE_BIENVENIDA: string;
  readonly BREVO_TEMPLATE_BUNDLE_PREVENTA: string;
  readonly ACCESS_TOKEN_SECRET: string;
  readonly GATING_ACTIVO: string;
  readonly SUSCRIPCION_ACTIVA: string;
  readonly COMUNIDAD_ACTIVA: string;
  readonly LEMONSQUEEZY_API_KEY: string;
  readonly LS_STORE_ID: string;
  readonly LS_VARIANT_BUNDLE_PREVENTA: string;
  readonly LS_WEBHOOK_SECRET: string;
  readonly PUBLIC_SITE_URL: string;
  readonly SITE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
