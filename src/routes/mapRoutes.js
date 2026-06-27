const express = require('express');
const router = express.Router();
const mapController = require('../controllers/map/mapController');

// Route for map search query
router.get('/search', mapController.searchArea);

// Route for fetching active workshops
router.get('/workshops', mapController.getActiveWorkshops);

// Route for path calculation/routing
router.get('/route', mapController.getRoute);

module.exports = router;
