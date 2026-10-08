export type Desenlace =
  | 'checkout_creado'
  | 'rechazado_formato'
  | 'rechazado_datos'
  | 'honeypot'
  | 'limitado_por_ritmo'
  | 'mal_configurado'
  | 'error_proveedor'
  | 'sin_sesion'
  | 'correo_sin_verificar'
  | 'base_no_disponible';

export const TIPO_EVENTO: 'checkout_intento';
export const ORIGEN_EVENTO: 'checkout/bundle-preventa';
export const ORIGEN_SUSCRIPCION: 'checkout/suscripcion';
export const PRODUCTO_SUSCRIPCION: 'suscripcion-libro';
export const DESENLACES_HUMANOS: readonly Desenlace[];

export function construyeMetadata(
  desenlace: Desenlace,
  extra?: Record<string, unknown>,
  producto?: string,
): Record<string, unknown>;

/**
 * Lo mínimo que el registro necesita de un cliente. Deliberadamente estructural
 * y con `PromiseLike`: el `insert()` de Supabase devuelve un builder que se
 * puede `await` pero NO es un `Promise`, así que exigir `Promise` obligaba a un
 * cast en el llamador — y un cast ahí habría escondido un desajuste real.
 */
export interface ClienteRegistro {
  from(tabla: string): {
    insert(fila: unknown): PromiseLike<{ error?: { message?: string } | null }>;
  };
}

export function registraIntento(
  supabase: ClienteRegistro | null,
  desenlace: Desenlace,
  extra?: Record<string, unknown>,
  donde?: { origen?: string; producto?: string },
): Promise<boolean>;
