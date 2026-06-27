const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin/accountController');
const configController = require('../controllers/admin/configController');
const { authenticateUser, authorizeRoles } = require('../middlewares/authMiddleware');

// Route configurations
router.get('/users', authenticateUser, authorizeRoles('Admin'), adminController.getAllUsers);
router.put('/config', authenticateUser, authorizeRoles('Admin'), configController.updateConfig);
router.patch('/users/:id/role', authenticateUser, authorizeRoles('Admin'), adminController.updateUserRole);
router.patch('/users/:id/status', authenticateUser, authorizeRoles('Admin'), adminController.updateUserStatus);

// Role Upgrade Requests
router.get('/role-requests', authenticateUser, authorizeRoles('Admin'), adminController.getRoleRequests);
router.put('/role-requests/:id', authenticateUser, authorizeRoles('Admin'), adminController.handleRoleRequest);

module.exports = router;
