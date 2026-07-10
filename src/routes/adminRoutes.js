const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin/accountController');
const configController = require('../controllers/admin/configController');
const { authenticateUser, authorizeRoles } = require('../middlewares/authMiddleware');

// Route configurations
router.get('/users', authenticateUser, authorizeRoles('Admin', 'Manager'), adminController.getAllUsers);
router.put('/config', authenticateUser, authorizeRoles('Admin', 'Manager'), configController.updateConfig);
router.patch('/users/:id/role', authenticateUser, authorizeRoles('Admin'), adminController.updateUserRole);
router.patch('/users/:id/status', authenticateUser, authorizeRoles('Admin', 'Manager'), adminController.updateUserStatus);

// Role Upgrade Requests
router.get('/role-requests', authenticateUser, authorizeRoles('Admin', 'Manager'), adminController.getRoleRequests);
router.put('/role-requests/:id', authenticateUser, authorizeRoles('Admin', 'Manager'), adminController.handleRoleRequest);

module.exports = router;
