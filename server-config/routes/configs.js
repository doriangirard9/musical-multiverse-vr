/**
 * The node configs registry.
 * A route that serve node config json files, and a route that list all available configs.
 */

const express = require('express')
const path = require('path')
const fs = require('node:fs');
const { console } = require('node:inspector');


const router = express.Router()

const configRoot = path.join(__dirname, '../public/nodeConfigs/');

/**
 * Get the list of all available node configs (without .json extension)
 */
router.get('/', (req, res) => {
    const globPattern = './**/*.json';
    fs.glob(globPattern, {cwd: configRoot}, (err, files) => {

        if (err) {
            console.error('Error reading directory:', err);
            res.status(500).send('Error reading directory').end();
            return;
        }

        const jsonFiles = files.filter(file => file.endsWith('.json'))
            .map(file => file.replace('.json', ''))
            .map(file => file.replace(/\\/g, '/'))

        res.setHeader('Content-Type', 'application/json');
        res.status(200).json(jsonFiles).end();
    });
})

/**
 * Get a specific node config by name (without .json extension)
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