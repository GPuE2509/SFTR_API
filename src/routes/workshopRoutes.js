const express = require('express');
const router = express.Router();
const workshopAccountController = require('../controllers/workshop/accountController');
const workshopProfileController = require('../controllers/workshop/profileController');
const reviewController = require('../controllers/workshop/reviewController');
const { authenticateUser } = require('../middlewares/authMiddleware');
const { uploadSingleImage } = require('../utils/multerConfig');

// Register a new workshop profile
router.post('/register', authenticateUser, workshopAccountController.registerWorkshopProfile);

// Get workshop profile of current user
router.get('/me', authenticateUser, workshopProfileController.getWorkshopProfile);

// Update workshop profile of current user
router.put('/me', authenticateUser, workshopProfileController.updateWorkshopProfile);

// Cancel workshop registration request
router.put('/me/cancel', authenticateUser, workshopAccountController.cancelWorkshopRegistration);

// Toggle workshop status (pause/resume)
router.put('/me/status', authenticateUser, workshopAccountController.toggleWorkshopStatus);

// Upload cover photo for workshop
router.put('/me/cover-photo', authenticateUser, uploadSingleImage, workshopProfileController.uploadCoverPhoto);

// Reviews for a specific workshop
router.get('/:id/reviews', reviewController.getWorkshopReviews);
router.post('/:id/reviews', authenticateUser, reviewController.createWorkshopReview);

// Get a workshop by ID (public, for detail view)
router.get('/:id', workshopProfileController.getWorkshopById);

module.exports = router;
