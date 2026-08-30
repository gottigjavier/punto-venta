/**
 * Helpers puros para interpretar errores de la API (axios).
 * Lógica sin DOM para poder testearla con vitest.
 */

const FALLBACK_MESSAGE = 'No se pudo completar la operación. Intenta de nuevo.';

interface ApiErrorMessageShape {
  success?: boolean;
  error?: {
    code?: string;
    message?: string;
    producto_id?: string | null;
    activo?: boolean;
    restaurable?: boolean;
  };
}

/** Extrae el mensaje real del backend: `e.response.data.error.message`. */
export function getApiErrorMessage(e: unknown): string {
  const err = e as { response?: { data?: ApiErrorMessageShape } } | null | undefined;
  const message = err?.response?.data?.error?.message;
  return typeof message === 'string' && message.trim() !== '' ? message : FALLBACK_MESSAGE;
}

/**
 * Si el 409 de un conflicto de código es "restaurable" (el existente está
 * inactivo y sin lotes activos), devuelve el producto a restaurar. Si no,
 * devuelve `null`.
 */
export function parseRestoreSuggestion(e: unknown): { producto_id: string } | null {
  const err = e as { response?: { data?: ApiErrorMessageShape } } | null | undefined;
  const error = err?.response?.data?.error;
  const restaurable = error?.restaurable;
  const productoId = error?.producto_id;
  if (restaurable === true && typeof productoId === 'string' && productoId !== '') {
    return { producto_id: productoId };
  }
  return null;
}
