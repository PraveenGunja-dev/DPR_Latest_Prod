// server/utils/systemLogger.js
// Shared utility for system logging

let pool;

const setPool = (dbPool) => {
  pool = dbPool;
};

const createSystemLog = async (actionType, performedBy, targetEntity, remarks = null) => {
  if (!pool) {
    console.warn('System logger pool not initialized');
    return;
  }
  
  try {
    await pool.query(
      `INSERT INTO system_logs (action_type, performed_by, target_entity, remarks) 
       VALUES ($1, $2, $3, $4)`,
      [actionType, performedBy, targetEntity, remarks]
    );
  } catch (error) {
    console.error('Error creating system log:', error);
    // Don't throw error - logging failures shouldn't break the main operation
  }
};

module.exports = { createSystemLog, setPool };

