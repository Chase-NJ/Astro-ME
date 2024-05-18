const express = require('express');
const app = express();
const path = require('path');
const readline = require("readline");
const { MongoClient } = require('mongodb');
const https = require('https');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const port = process.env.PORT || 5000;

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

        if (!searchData.objectIDs) {
            throw new Error('No objectIDs found');
        }
        const objectIDs = searchData.objectIDs.slice(0, 5000);

        const batchSize = 250;
        let publicObjects = [];

        for (let i = 0; i < objectIDs.length; i += batchSize) {
            const batchIDs = objectIDs.slice(i, i + batchSize);
            const objectDetailsPromises = batchIDs.map(id => 
                fetchWithRetry(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`).catch(err => {
                    console.error(`Fetch error for ID ${id}: ${err.message}`);
                    return null;
                })
            );
            const objectDetails = await Promise.all(objectDetailsPromises);

            publicObjects = publicObjects.concat(
                objectDetails.filter(object => object && object.primaryImage)
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
        const artistName = artworkData.artistDisplayName || '(No Artist Name)';
        const artistBio = artworkData.artistDisplayBio || '(No Artist Info)';

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

app.get('/displayFavorites', async (req, res) => {
    const username = req.query.user;

    try {
        await client.connect();
        const database = client.db('ASTRO-ME_DB');
        const users = database.collection('userData');

        const user = await users.findOne({ username });

        if (!user) {
            return res.status(404).send("User not found");
        }

        res.render('favorites', { username, favorites: user.favorites });
    } catch (error) {
        console.error("Error fetching favorites:", error);
        res.status(500).send("Error occurred while fetching favorites!");
    } finally {
        await client.close();
    }
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
        console.error("Error creating account: ", error);
        res.status(500).send("An error occurred while creating your account!");
    } finally {
        await client.close();
    }
});

app.post('/addFavorite', async (req, res) => {
    const username = req.body.username;
    const { imageURL, imageTitle, imageDescription } = req.body;

    try {
        await client.connect();
        const database = client.db('ASTRO-ME_DB');
        const users = database.collection('userData');

        const updateResult = await users.updateOne(
            { username },
            { $addToSet: { favorites: { imageURL, imageTitle, imageDescription } } }
        );
        if (updateResult.matchedCount === 0) {
            return res.status(404).send("User not found");
        }
        res.redirect(`/home?user=${username}`);
    } catch (error) {
        console.error("Error adding favorite:", error);
        res.status(500).send("Error occurred while adding favorite!");
    } finally {
        await client.close();
    }
});

app.post('/removeFavorite', async (req, res) => {
    const username = req.body.username;
    const { imageURL } = req.body;

    try {
        await client.connect();
        const database = client.db('ASTRO-ME_DB');
        const users = database.collection('userData');

        const updateResult = await users.updateOne(
            { username },
            { $pull: { favorites: { imageURL } } }
        );

        if (updateResult.matchedCount === 0) {
            return res.status(404).send("User not found!");
        }
        
        res.redirect(`/displayFavorites?user=${username}`);
    } catch (error) {
        console.error("Error removing favorite:", error);
        res.status(500).send("Error occurred while removing a favorited image!");
    } finally {
        await client.close();
    }
});

client.connect().then(() => {
    console.log("Connected to MongoDB successfully");

    app.listen(port, () => {
        console.log(`Web server started and running at http://localhost:${port}`);
    });
}).catch(error => {
    console.error("Failed to connect to MongoDB", error);
});