/** Tipos de patch-vercel-output.mjs (consumidos por astro check y por los tests). */

export interface MdVariant {
  route: string;
  md: string;
}

export interface VercelRouteHas {
  type: string;
  key?: string;
  value?: string;
}

export interface VercelRoute {
  src?: string;
  dest?: string;
  handle?: string;
  status?: number;
  continue?: boolean;
  has?: VercelRouteHas[];
  headers?: Record<string, string>;
}

export interface VercelOutputConfig {
  version?: number;
  routes?: VercelRoute[];
  overrides?: Record<string, { contentType?: string; path?: string }>;
  [k: string]: unknown;
}

export declare const ACCEPT_MD: string;
export declare const MD_VARIANTS: MdVariant[];
export declare function srcFor(route: string): string;
export declare function varySrc(): string;
export declare function assertCatchAll404(config: VercelOutputConfig): void;
export declare function injectMarkdownRoutes(config: VercelOutputConfig): {
  changed: boolean;
  injected: number;
};
