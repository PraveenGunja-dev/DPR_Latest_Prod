const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3422,
  path: '/api/custom-activities?projectId=1&sheetType=wind_stone_column',
  method: 'GET'
  // I don't have a token. But I can bypass it if I query the DB via pg module? Let's just create a quick test server route or skip API.
};

http.request(options, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log(data.slice(0, 500)));
}).end();
