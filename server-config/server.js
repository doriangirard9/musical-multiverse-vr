const express = require('express')
const path = require("path");
const cors = require('cors')
const fs = require('node:fs');

const app = express()


const port = 3000
// Serve only the static files form the dist directory
// __dirname est le répertoire courant

var corsOptions = {
    origin: ["https://0.0.0.0:5173","http://0.0.0.0:5173",
      "https://musical-multiverse-vr-1.onrender.com","http://localhost:517","https://localhost:5173",
      "https://192.168.122.110:5173","https://192.168.200.110:5173","https://musical-metaverse.onrender.com","https://moustik.dev"
    ],
    optionsSuccessStatus: 200 // For legacy browser support
    }


app.use(cors(corsOptions));

app.use(express.static(__dirname + "/public"));
// Middleware to set headers for all responses
app.use((req, res, next) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
    next();
});
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
