const express = require('express');
const app = express();
app.use(express.json());
app.use('/api', require('./routes/auth'));
app.use('/api/items', require('./routes/items'));
module.exports = app;
