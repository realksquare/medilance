const express = require('express');
const app = express();
app.get('/api/health', (req, res) => res.json({ status: 'barebones-ok' }));
app.listen(3000, () => console.log('BAREBONES SERVER ON 3000'));
