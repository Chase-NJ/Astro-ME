const express = require('express');
const app = express();
const path = require('path');
const readline = require("readline");
const portNumber = 5001;
const { MongoClient } = require('mongodb');
const https = require('https');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'templates'));

const uri = process.env.MONGO_CONNECTION_STRING
const client = new MongoClient(uri);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get('/', (req, res) => {
    res.render('index', { errorMessage: null });
});

const fetchWithRetry = async (url, retries = 3, delay = 1000) => {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error(`Fetch error (${url}): ${error.message}`);
            if (i < retries - 1) {
                await new Promise(res => setTimeout(res, delay));
            } else {
                throw error;
            }
        }
    }
};

app.get('/home', async (req, res) => {
    const username = req.query.user;

    try {
        const searchResponse = await fetchWithRetry('https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&q=painting');
        const searchData = searchResponse;
        const objectIDs = searchData.objectIDs.slice(0, 1000);

        const batchSize = 50;
        let publicObjects = [];

        for (let i = 0; i < objectIDs.length; i += batchSize) {
            const batchIDs = objectIDs.slice(i, i + batchSize);
            const objectDetailsPromises = batchIDs.map(id => 
                fetchWithRetry(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`)
            );
            const objectDetails = await Promise.all(objectDetailsPromises);

            publicObjects = publicObjects.concat(
                objectDetails.filter(object => object.primaryImage)
            );

            if (publicObjects.length > 0) break;
        }

        const randomIndex = Math.floor(Math.random() * publicObjects.length);
        let artworkData = publicObjects[randomIndex];

        const imageURL = artworkData.primaryImage;
        const imageTitle = artworkData.title || '(Unknown)';
        const imageMedium = artworkData.medium || '(Unknown)';
        const imageType = artworkData.objectName || '(Unknown)';
        const imageDate = artworkData.objectDate || '(Unknown)';
        const artistName = artworkData.artistDisplayName || '(Unknown)';
        const artistBio = artworkData.artistDisplayBio || '(Unknown)';

        const imageDescription = `${imageTitle}, ${imageType} (medium: ${imageMedium}) by ${artistName} (${artistBio}), ${imageDate}`;
        console.log(imageDescription);
        
        await client.connect();
        const database = client.db('ASTRO-ME_DB');
        const users = database.collection('userData');

        const user = await users.findOne({ username });
        const isFavorited = user && user.favorites.some(favorite => favorite.imageURL === imageURL);

        res.render('home', { username, imageURL, imageTitle, imageDescription, isFavorited });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Error occurred while fetching painting!');
    } finally {
        await client.close();
    }
});

app.get('/create-account', (req, res) => {
    res.render('create-account', { errorMessage: null });
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).send("All fields are required!");
    }

    try {
        await client.connect();
        const database = client.db('ASTRO-ME_DB');
        const users = database.collection('userData');

        const user = await users.findOne({ $or: [{ username }, { email: username }] });
        if (!user) {
            return res.render('index', { errorMessage: 'Invalid username or password' });
        }
        res.redirect(`/home?user=${user.username}`);
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
            return res.render('create-account', { errorMessage: 'User already exists!' });
        }

        const newUser = {
            username,
            email,
            password,
            favorites: []
        };
        await users.insertOne(newUser);
        res.redirect(`/home?user=${newUser.username}`);
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