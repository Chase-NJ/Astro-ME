const express = require('express');
const app = express();
const path = require('path');
const readline = require("readline");
const portNumber = 5001;
const { MongoClient } = require('mongodb');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'templates'));

const uri = process.env.MONGO_CONNECTION_STRING
const client = new MongoClient(uri);

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

client.connect().then(() => {
    console.log("Connected to MongoDB successfully");

    app.listen(portNumber, () => {
        console.log(`Web server started and running at http://localhost:${portNumber}`);
        
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        console.log('Type "stop" to shutdown the server: ');

        rl.on('line', (input) => {
            if (input.trim().toLowerCase() === 'stop') {
                console.log('Shutting down the server');
                rl.close();
                client.close().then(() => {
                    console.log('MongoDB connection closed');
                    process.exit(0);
                });
            } else {
                console.log(`Invalid command: ${input.trim()}`);
            }
        }).on('close', () => {
            client.close().then(() => {
                console.log('MongoDB connection closed');
                console.log('Server has been shut down.');
                process.exit(0);
            });
        });
    });

}).catch(error => {
    console.error("Failed to connect to MongoDB", error);
});