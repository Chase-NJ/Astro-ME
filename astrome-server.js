const express = require('express');
const app = express();
const path = require('path');
const readline = require("readline");
const portNumber = 5001;
const { MongoClient } = require('mongodb');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

app.use(express.static(path.join(__dirname, 'public')));
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

app.post('/login', async (req, res) => {
    const { username, password} = req.body;
    if (!username || !password) {
        return res.status(400).send("All fields are required!");
    }

    try {
        await client.connect();
        const database = client.db('ASTRO-ME_DB');
        const users = database.collection('userData');

        const user = await users.findOne({ $or: [{ username }, { email: username }] });
        if (!user) {
            return res.status(401).send("Invalid username or password!");
        }
        res.render('home', { username: user.username });
    } catch (error) {
        console.error("Error during login:", error);
        res.status(500).send("Error occurred during login!");
    } finally {
        await client.close();
    }
});

app.post('/create-account', async (req, res) => {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        return res.status(400).send("All fields are required");
    }

    try {
        await client.connect();
        const database = client.db('ASTRO-ME_DB');
        const users = database.collection('userData');

        const existingUser = await users.findOne({ $or: [{ username }, { email }] });
        if (existingUser) {
            return res.status(409).send("User with this username or email already exists!");
        }

        const newUser = {
            username,
            email,
            password
        };
        await users.insertOne(newUser);
        res.render('home', { username: newUser.username });
    } catch (error) {
        console.error("Error creating accoint: ", error);
        res.status(500).send("An error occurred while creating your account!");
    } finally {
        await client.close();
    }
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