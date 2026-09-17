const { Client } = require('pg');
const client = new Client({
  host: '127.0.0.1',
  port: 5432,
  database: 'DPR',
  user: 'postgres',
  password: 'Nikitha'
});
client.connect().then(() => {
  return client.query(`
    SELECT name, wbs_name 
    FROM solar_activities 
    WHERE project_object_id = 31872
      AND wbs_name ILIKE '%PCS%'
    LIMIT 20
  `);
}).then(res => {
  console.log(res.rows);
  client.end();
});
