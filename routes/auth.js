const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();
const SECRET = process.env.JWT_SECRET || 'pizzaria-secret-key';

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Campos obrigatórios' });
  }

  const cred = db.prepare('SELECT * FROM credentials WHERE id = 1').get();
  if (!cred || cred.username !== username) {
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }
  if (!bcrypt.compareSync(password, cred.password_hash)) {
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }

  const token = jwt.sign({ id: 1 }, SECRET, { expiresIn: '7d' });
  res.json({ token });
});

router.post('/credentials', requireAuth, (req, res) => {
  const { username, password } = req.body;
  if (!username && !password) {
    return res.status(400).json({ error: 'Informe usuário ou senha' });
  }

  const cred = db.prepare('SELECT * FROM credentials WHERE id = 1').get();
  const newUsername = username || cred.username;
  const newHash = password ? bcrypt.hashSync(password, 10) : cred.password_hash;

  db.prepare('UPDATE credentials SET username = ?, password_hash = ? WHERE id = 1')
    .run(newUsername, newHash);
  res.json({ ok: true });
});

module.exports = router;
