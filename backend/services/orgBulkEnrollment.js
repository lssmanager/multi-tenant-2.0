// Servicio de matrícula masiva organizacional
// organizationId siempre debe venir del backend autenticado
async function bulkEnroll({ organizationId, rows }) {
  if (!organizationId) throw new Error('organizationId required');
  // Aquí iría la integración real con Logto, Moodle, WordPress, etc.
  // Simulación de respuesta alineada a contrato frontend
  return rows.map((row, index) => ({
    rowNumber: row?.rowNumber || index + 1,
    email: row?.email || '',
    status: row?.email ? 'created' : 'error',
    message: row?.email ? 'Enrolled successfully (simulado)' : 'Missing email.',
  }));
}

module.exports = { bulkEnroll };