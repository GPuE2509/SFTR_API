const express = require('express');
const router = express.Router();
const IotController = require('../controllers/iot/IotController');

const { uploadSingleImage } = require('../utils/multerConfig');

// Route: GET /api/iot/config
router.get('/config', IotController.getSystemConfig);

// Route: GET /api/iot/devices
router.get('/devices', IotController.getAllDevices);

// Route: POST /api/iot/devices
router.post('/devices', uploadSingleImage, IotController.addDevice);

// Route: GET /api/iot/devices/:id
router.get('/devices/:id', IotController.getDeviceDetails);

// Route: PUT /api/iot/devices/:id
router.put('/devices/:id', uploadSingleImage, IotController.updateDevice);

// Route: POST /api/iot/gps (or /gps if mounted at root)
router.post('/gps', IotController.receiveTelemetry);

// Route: PATCH /api/iot/devices/:id/disable  — toggle is_disabled
router.patch('/devices/:id/disable', IotController.toggleDisable);

module.exports = router;
