export type SyncUiState = 'ok' | 'pending' | 'partial-error';

export const getSyncUiBadge = (state: SyncUiState): { label: string; className: string } => {
  if (state === 'ok') {
    return { label: 'Ok', className: 'bg-green-100 text-green-800' };
  }
  if (state === 'partial-error') {
    return { label: 'Sincronizacion incompleta', className: 'bg-red-100 text-red-800' };
  }
  return { label: 'Pendiente de sincronizacion', className: 'bg-yellow-100 text-yellow-800' };
};

export const getSyncUiMessage = (state: SyncUiState): string => {
  if (state === 'ok') return 'Sincronizacion completa.';
  if (state === 'partial-error') return 'Error: reintenta mas tarde o contacta soporte.';
  return 'Pendiente de sincronizacion.';
};
