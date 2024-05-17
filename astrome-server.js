const express = require('express');
const app = express();
const path = require('path');
const readLine = require("readline");
const portNumber = 5001;

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

app.listen(portNumber, () => {
    console.log(`Web Server started and running at http://localhost:${portNumber}`);
    const rl = readLine.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: `Stop to shutdown the server: `
    });
    rl.prompt();
    rl.on('line', line => {
        input = line.trim();
        if (input === 'stop') {
            console.log(`Shutting down the server`);
            rl.close();
        } else {
            console.log(`Invalid command: ${input}`);
        }
        rl.prompt();
    }).on('close', () => {
        process.exit(0);
    })
});