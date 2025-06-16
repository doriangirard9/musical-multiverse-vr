const express = require('express')
const path = require("path");
const cors = require('cors')
const fs = require('node:fs');

const app = express()

const port = 3000


var corsOptions = {
    origin: 'https://wamjamparty.i3s.univ-cotedazur.fr',
    optionsSuccessStatus: 200 // For legacy browser support
}

app.use(cors(corsOptions));

app.use(express.static(__dirname + "/public"));

app.get('/coreConfig/:name', (req, res) => {
    const filePath = path.join(__dirname, `/public/coreConfig/${req.params.name}.json`);
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error("Error reading file:", err);
            res.status(500).send("Error reading file").end();
            return;
        }
        console.log("user ask for json file");
        res.status(200).json(data).end();
    });
})

app.get('/wamsConfig/:name', (req, res) => {
    const filePath = path.join(__dirname, `/public/wamsConfig/${req.params.name}.json`);
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error("Error reading file:", err);
            res.status(500).send("Error reading file").end();
            return;
        }
        res.status(200).json(data).end();
    });
})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})