// Servicio de grupos organizacionales
// organizationId siempre debe venir del backend autenticado
async function createGroupForTeacher({ organizationId, teacherId, teacherName, courseId, groupName }) {
  if (!organizationId) throw new Error('organizationId required');
  // Aquí iría la integración real con Moodle/BuddyBoss
  // Simulación de respuesta alineada a contrato frontend
  return {
    id: `${organizationId}-group-${Date.now()}`,
    name: groupName,
    courseId,
    teacherId,
    teacherName,
    createdAt: new Date().toISOString(),
    status: 'created',
  };
}

module.exports = { createGroupForTeacher };