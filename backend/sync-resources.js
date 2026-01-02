const axios = require('axios');
const pool = require('./db');

// New token provided by user
const TOKEN = 'eyJ4NXQjUzI1NiI6IlV6LU1BTlgyS0VncEFpb2I3cEVwQlZWSmtZSzFvV2FRczBacHhMbDI5NWciLCJ4NXQiOiJGNmE4X1lJMENCTEI3LVpkd3RWNjM5bXFqZ0kiLCJraWQiOiJTSUdOSU5HX0tFWSIsImFsZyI6IlJTMjU2In0.eyJjbGllbnRfb2NpZCI6Im9jaWQxLmRvbWFpbmFwcC5vYzEuYXAtbXVtYmFpLTEuYW1hYWFhYWFhcXRwNWJhYWp3c2JicW9wa3cydXFxcG9jcm52YWl1YXdsdGl6bXkyZmNueDVlbG96Ym1hIiwidXNlcl90eiI6IkFzaWEvS29sa2F0YSIsInN1YiI6ImFnZWwuZm9yZWNhc3RpbmdAYWRhbmkuY29tIiwidXNlcl9sb2NhbGUiOiJlbiIsInNpZGxlIjo0ODAsInVzZXIudGVuYW50Lm5hbWUiOiJpZGNzLWQyYWE5Y2U2MDFjZDQ4NGFhZTQzNGY4YTJmMDBhMTQ3IiwiaXNzIjoiaHR0cHM6Ly9pZGVudGl0eS5vcmFjbGVjbG91ZC5jb20vIiwiZG9tYWluX2hvbWUiOiJhcC1tdW1iYWktMSIsImNhX29jaWQiOiJvY2lkMS50ZW5hbmN5Lm9jMS4uYWFhYWFhYWFrejRrZnl3cGVjc3h3dHBqc2tiZ2d5ZGNuNzdidGp2cmpocWVhaGJ5dGZ3dWczeXBnamJxIiwidXNlcl90ZW5hbnRuYW1lIjoiaWRjcy1kMmFhOWNlNjAxY2Q0ODRhYWU0MzRmOGEyZjAwYTE0NyIsImNsaWVudF9pZCI6IlByaW1hdmVyYVdUU1NfQWRhbmlfUHJvZHVjdGlvbl9BUFBJRCIsImRvbWFpbl9pZCI6Im9jaWQxLmRvbWFpbi5vYzEuLmFhYWFhYWFhNGx6NWV1ZDVtZzZ2bzZ4Z2psbmU1am1sczNvbHo2NmZmdDdqdGN3Z2didGwzdHM2eWhzcSIsInN1Yl90eXBlIjoidXNlciIsInNjb3BlIjoidXJuOm9wYzppZG06dC5zZWN1cml0eS5jbGllbnQgdXJuOm9wYzppZG06dC51c2VyLmF1dGhuLmZhY3RvcnMiLCJ1c2VyX29jaWQiOiJvY2lkMS51c2VyLm9jMS4uYWFhYWFhYWF2ZDcydWQ2bmZoeDV1bjMyZ2d2dGEzZGJtaXA1MmxhNng2cmdmYTRtbXJ4Znhucnl0ZWdxIiwiY2xpZW50X3RlbmFudG5hbWUiOiJpZGNzLWQyYWE5Y2U2MDFjZDQ4NGFhZTQzNGY4YTJmMDBhMTQ3IiwicmVnaW9uX25hbWUiOiJhcC1tdW1iYWktaWRjcy0xIiwidXNlcl9sYW5nIjoiZW4iLCJ1c2VyQXBwUm9sZXMiOlsiQXV0aGVudGljYXRlZCJdLCJleHAiOjE3NjczODM1MTYsImlhdCI6MTc2NzM0NzUxNiwiY2xpZW50X2d1aWQiOiI5ZDRkMDQ1NjUxYzA0OTgyOGI3NDFjZWYzNmM3M2UzZiIsImNsaWVudF9uYW1lIjoiUHJpbWF2ZXJhV1RTU19BZGFuaV9Qcm9kdWN0aW9uIiwidGVuYW50IjoiaWRjcy1kMmFhOWNlNjAxY2Q0ODRhYWU0MzRmOGEyZjAwYTE0NyIsImp0aSI6Ijc1ZmUzYzAwODU2OTQ3ZTViNTY5OTBlM2Y3YzBiNGM2IiwiZ3RwIjoicm8iLCJ1c2VyX2Rpc3BsYXluYW1lIjoiQWdlbCBmb3JjYXN0aW5nIiwib3BjIjp0cnVlLCJzdWJfbWFwcGluZ2F0dHIiOiJ1c2VyTmFtZSIsInByaW1UZW5hbnQiOnRydWUsInRva190eXBlIjoiQVQiLCJhdWQiOlsidXJuOm9wYzpsYmFhczpsb2dpY2FsZ3VpZD1pZGNzLWQyYWE5Y2U2MDFjZDQ4NGFhZTQzNGY4YTJmMDBhMTQ3IiwiaHR0cHM6Ly9pZGNzLWQyYWE5Y2U2MDFjZDQ4NGFhZTQzNGY4YTJmMDBhMTQ3LmFwLW11bWJhaS1pZGNzLTEuc2VjdXJlLmlkZW50aXR5Lm9yYWNsZWNsb3VkLmNvbSIsImh0dHBzOi8vaWRjcy1kMmFhOWNlNjAxY2Q0ODRhYWU0MzRmOGEyZjAwYTE0Ny5pZGVudGl0eS5vcmFjbGVjbG91ZC5jb20iXSwiY2FfbmFtZSI6ImFkYW5pIiwic3R1IjoiUFJJTUFWRVJBIiwidXNlcl9pZCI6ImIwNmRmZDFlMGUyMTQ2MDVhNTAwOWMxOWZiOTU4ZDJhIiwiZG9tYWluIjoiRGVmYXVsdCIsImNsaWVudEFwcFJvbGVzIjpbIlVzZXIgVmlld2VyIiwiQXV0aGVudGljYXRlZCBDbGllbnQiLCJDbG91ZCBHYXRlIl0sInRlbmFudF9pc3MiOiJodHRwczovL2lkY3MtZDJhYTljZTYwMWNkNDg0YWFlNDM0ZjhhMmYwMGExNDcuaWRlbnRpdHkub3JhY2xlY2xvdWQuY29tOjQ0MyJ9.t6jAXH0xsqfmznNRKRATf9whSmhR093T6XE8-MEIOimM_bJ4SRzzSfXacd-cY3Rxh5puRGgd4dTVbxY3oLkzXKtzDHxTxoX4p66pOUjGKp7JgzWxNnpSv-cfdOstz5zy8cwy2H46f7cmStCefP9dYmIJC5CigzV9JHW1z-LCV9m2bY0u7_Au_G_KOWhI0u5clbiL0dkHoGGMKB5WQvXCQOMgqMagCwg3XSjzCAw-wmKgXBTyxrLSfBvJw-B0SzLnd8LCpGdDLEEmOIy2sQXIZTDe8SoZwAVAVlQpcavAlGnfsRUd6U0g_J7h9pxeJaVo0mGR8v7b8c4I8JNjWx5E-A';

// Using STAGE environment
const BASE_URL = 'https://sin1.p6.oraclecloud.com/adani/stage/p6ws/restapi';

async function syncResources() {
    try {
        console.log('=== Syncing Resources from P6 (STAGE) ===\n');

        // 1. Fetch resources from P6
        console.log('Fetching resources from P6...');
        const resourceResponse = await axios.get(`${BASE_URL}/resource`, {
            headers: {
                'Authorization': `Bearer ${TOKEN}`,
                'Accept': 'application/json'
            },
            params: {
                Fields: 'ObjectId,Id,Name,ResourceType,EmailAddress,ParentObjectId'
            }
        });

        const resources = Array.isArray(resourceResponse.data) ? resourceResponse.data : [];
        console.log(`Found ${resources.length} resources from P6`);

        if (resources.length === 0) {
            console.log('No resources found in P6!');
            return;
        }

        // Show first 5 resources
        console.log('\nSample resources:');
        resources.slice(0, 5).forEach(r => {
            console.log(`  - ${r.Id}: ${r.Name} (${r.ResourceType})`);
        });

        // 2. Create p6_resources table if not exists
        await pool.query(`
      CREATE TABLE IF NOT EXISTS p6_resources (
        id SERIAL PRIMARY KEY,
        object_id INTEGER UNIQUE NOT NULL,
        resource_id VARCHAR(100),
        name VARCHAR(500),
        type VARCHAR(100),
        email VARCHAR(255),
        parent_object_id INTEGER,
        last_sync_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
        console.log('\n✓ p6_resources table ready');

        // 3. Upsert resources - NO FALLBACK VALUES
        let insertedCount = 0;
        for (const r of resources) {
            await pool.query(`
        INSERT INTO p6_resources (object_id, resource_id, name, type, email, parent_object_id, last_sync_at)
        VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
        ON CONFLICT (object_id) DO UPDATE SET
          resource_id = EXCLUDED.resource_id,
          name = EXCLUDED.name,
          type = EXCLUDED.type,
          email = EXCLUDED.email,
          parent_object_id = EXCLUDED.parent_object_id,
          last_sync_at = CURRENT_TIMESTAMP
      `, [
                r.ObjectId,
                r.Id || null,  // No fallback
                r.Name || null,  // No fallback
                r.ResourceType || null,  // No fallback
                r.EmailAddress || null,  // No fallback
                r.ParentObjectId || null  // No fallback
            ]);
            insertedCount++;
        }
        console.log(`✓ Inserted/Updated ${insertedCount} resources`);

        // 4. Show what's in the database
        const dbResult = await pool.query(`
      SELECT resource_id, name, type, email 
      FROM p6_resources 
      ORDER BY name 
      LIMIT 10
    `);
        console.log('\nResources in database:');
        dbResult.rows.forEach(r => {
            console.log(`  - ${r.resource_id}: ${r.name} (${r.type})`);
        });

        console.log('\n✓ Resource sync complete!');

    } catch (error) {
        console.error('Error syncing resources:', error.message);
        if (error.response) {
            console.error('Response:', error.response.status, error.response.data);
        }
    } finally {
        pool.end();
    }
}

syncResources();
