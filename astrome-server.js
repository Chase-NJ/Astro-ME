const express = require('express');
const app = express();
const path = require('path');

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'templates'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    res.render('index');
});

app.get('/login', (req, res) => {
    res.render('login');
});

app.get('/create-account', (req, res) => {
    res.render('create-account');
});

app.post('/login', (req, res) => {
    // Handle login
});

app.post('/create-account', (req, res) => {
    // Handle account creation
});

app.listen(3000, () => {
    console.log('Server is running on port 3000');
});