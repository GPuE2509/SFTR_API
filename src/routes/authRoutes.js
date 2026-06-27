const express = require('express');
const { authenticateUser } = require('../middlewares/authMiddleware');
const validate = require('../middlewares/validateMiddleware');
const { uploadSingleImage } = require('../utils/multerConfig');

const authController = require('../controllers/auth/authController');
const profileController = require('../controllers/user/profileController');
const { loginLimiter } = require('../middlewares/rateLimiter');

const router = express.Router();

router.post('/register', validate.validateRegister, authController.register);
router.post('/login', loginLimiter, validate.validateLogin, authController.login);
router.post('/verify', validate.validateVerifyOtp, authController.verifyOtp);
router.post('/resend-otp', validate.validateResendOtp, authController.resendOtp);
router.post('/logout', authenticateUser, authController.logout);
router.post('/refresh-token', authController.refreshToken);
router.post('/google-login', authController.googleLogin);

router.post('/forgot-password', validate.validateForgotPassword, authController.forgotPassword);
router.post('/verify-reset-otp', validate.validateVerifyResetOtp, authController.verifyResetOtp);
router.post('/reset-password', validate.validateResetPassword, authController.resetPassword);

router.get('/profile', authenticateUser, profileController.getProfile);
router.put('/profile', authenticateUser, profileController.updateProfile);
router.put('/profile/avatar', authenticateUser, uploadSingleImage, profileController.updateAvatar);
router.delete('/profile/avatar', authenticateUser, profileController.deleteAvatar);
router.post('/change-password', authenticateUser, validate.validateChangePassword, profileController.changePassword);

// Admin sub-router
const adminRoutes = require('./adminRoutes');
router.use('/admin', adminRoutes);

module.exports = router;
