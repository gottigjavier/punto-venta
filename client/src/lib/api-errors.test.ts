import { describe, it, expect } from 'vitest';
import { getApiErrorMessage, parseRestoreSuggestion } from './api-errors';

describe('getApiErrorMessage', () => {
  it('extracts the backend message from the axios error shape', () => {
    const e = { response: { data: { error: { message: 'Ya existe un producto activo con este código' } } } };
    expect(getApiErrorMessage(e)).toBe('Ya existe un producto activo con este código');
  });

  it('falls back when there is no message (server 500 without message)', () => {
    const e = { response: { data: { error: { code: 'INTERNAL_ERROR' } } } };
    expect(getApiErrorMessage(e)).toBe('No se pudo completar la operación. Intenta de nuevo.');
  });

  it('falls back on network errors (no response)', () => {
    const e = new Error('Network Error');
    expect(getApiErrorMessage(e)).toBe('No se pudo completar la operación. Intenta de nuevo.');
  });

  it('falls back on null/undefined input', () => {
    expect(getApiErrorMessage(null)).toBe('No se pudo completar la operación. Intenta de nuevo.');
    expect(getApiErrorMessage(undefined)).toBe('No se pudo completar la operación. Intenta de nuevo.');
  });

  it('falls back when message is an empty/blank string', () => {
    const e = { response: { data: { error: { message: '   ' } } } };
    expect(getApiErrorMessage(e)).toBe('No se pudo completar la operación. Intenta de nuevo.');
  });
});

describe('parseRestoreSuggestion', () => {
  it('returns { producto_id } when restaurable is true and producto_id present', () => {
    const e = {
      response: {
        data: {
          error: { code: 'CONFLICT', message: 'Ya existe un producto inactivo...', producto_id: '50', activo: false, restaurable: true },
        },
      },
    };
    expect(parseRestoreSuggestion(e)).toEqual({ producto_id: '50' });
  });

  it('returns null when there is no restaurable field', () => {
    const e = {
      response: {
        data: { error: { code: 'CONFLICT', message: 'Ya existe un producto activo...' } },
      },
    };
    expect(parseRestoreSuggestion(e)).toBeNull();
  });

  it('returns null when restaurable is false', () => {
    const e = {
      response: {
        data: {
          error: { code: 'CONFLICT', message: 'Ya existe...', producto_id: '51', activo: false, restaurable: false },
        },
      },
    };
    expect(parseRestoreSuggestion(e)).toBeNull();
  });

  it('returns null for weird payloads', () => {
    expect(parseRestoreSuggestion(null)).toBeNull();
    expect(parseRestoreSuggestion(undefined)).toBeNull();
    expect(parseRestoreSuggestion({ response: { data: {} } })).toBeNull();
    expect(
      parseRestoreSuggestion({ response: { data: { error: { restaurable: true } } } }),
    ).toBeNull();
    expect(
      parseRestoreSuggestion({
        response: { data: { error: { restaurable: true, producto_id: '' } } },
      }),
    ).toBeNull();
  });
});
