/**
 * The node configs registry.
 * A route that serve node config json files, and a route that list all available configs.
 */

const express = require('express')
const path = require('path')
const fs = require('node:fs');
const { console } = require('node:inspector');


const router = express.Router()

const configRoot = path.join(__dirname, '../public/nodePresets/');

/**
 * Get a specific node preset map by name (without .json extension)
 */
router.get('/:name(*)', (req, res) => {

    const filePath = path.join(configRoot, `/${req.params.name}.json`)
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error('Error reading file:', err);
            res.status(500).send('Error reading file').end();
            return;
        }
        res.setHeader('Content-Type', 'application/json');
        res.status(200).send(data).end();
    })
})

module.exports = router