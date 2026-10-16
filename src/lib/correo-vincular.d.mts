// Tipos sidecar para correo-vincular.mjs (correo de suscripción pendiente, S-13, C11).
export const VINCULAR_URL: string;
export const REMITENTE_POR_DEFECTO: Readonly<{ email: string; name: string }>;

export function planCorreoVincular(
  leer: (k: string) => string | undefined,
):
  | { modo: 'plantilla'; apiKey: string; templateId: number }
  | { modo: 'inline'; apiKey: string; sender: { email: string; name: string } }
  | null;

export function contenidoCorreoVincular(d?: { nombre?: string | null; url?: string }): {
  subject: string;
  text: string;
  html: string;
};
