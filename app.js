const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', require('./routes/auth'));
app.use('/api/items', require('./routes/items'));
app.use('/api/trips', require('./routes/trips'));
app.use('/api/template', require('./routes/template'));
app.use('/api/stock', require('./routes/stock'));
app.use('/api/analytics', require('./routes/analytics'));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

module.exports = app;
