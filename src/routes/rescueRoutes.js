const express = require('express');
const router = express.Router();
const rescueController = require('../controllers/rescue/rescueController');
const { authenticateUser } = require('../middlewares/authMiddleware');

// Route to create a new rescue request (SOS)
router.post('/', authenticateUser, rescueController.createRescueRequest);

// Route to get active rescue requests for volunteer
router.get('/', authenticateUser, rescueController.getActiveRescueRequests);

// Route to accept a pending rescue request (volunteer only)
router.put('/:id/accept', authenticateUser, rescueController.acceptRescueRequest);

// Route to cancel a rescue request (requester only)
router.put('/:id/cancel', authenticateUser, rescueController.cancelRescueRequest);

// Route to confirm safety of the victim (requester only)
router.put('/:id/safe', authenticateUser, rescueController.confirmSafety);

// Route to start moving to a rescue request (volunteer only)
router.put('/:id/start', authenticateUser, rescueController.startRescueRequest);

// Route to mark arrival at rescue scene (volunteer only)
router.put('/:id/arrive', authenticateUser, rescueController.arriveRescueRequest);

// Route to complete a rescue request (volunteer only)
router.put('/:id/complete', authenticateUser, rescueController.completeRescueRequest);

// Route to get current user's active rescue request
router.get('/current', authenticateUser, rescueController.getCurrentRescueRequest);

module.exports = router;
