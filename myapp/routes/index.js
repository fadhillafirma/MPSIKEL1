// routes/index.js

const express = require('express');
const router = express.Router();

/* * GET home page. 
 * Rute ini merespons permintaan GET ke path dasar ('/').
 */
router.get('/', (req, res, next) => {
  // Menggunakan res.render() untuk merender template view bernama 'index'
  // dan mengirimkan variabel 'title' ke template tersebut.
  res.render('index', { title: 'Express' });
});

module.exports = router;