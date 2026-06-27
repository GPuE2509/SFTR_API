const fs = require('fs');

const replacements = {
  // src/utils/uploadHelper.js
  " * Xử lý upload ảnh với error handling": " * Handle image upload with error handling",
  " * @param {Buffer|string} file - File buffer hoặc path": " * @param {Buffer|string} file - File buffer or path",
  " * @param {string} folder - Thư mục Cloudinary": " * @param {string} folder - Cloudinary folder",
  " * @param {string} type - Loại upload (avatar, post, report, etc.)": " * @param {string} type - Upload type (avatar, post, report, etc.)",
  " * Xử lý upload nhiều ảnh": " * Handle multiple image uploads",
  " * @param {Array<Buffer>} files - Mảng buffers": " * @param {Array<Buffer>} files - Array of buffers",
  " * Validate file trước khi upload": " * Validate file before upload",
  " * Validate nhiều files": " * Validate multiple files",
  " * @param {Array<File>} files - Mảng files": " * @param {Array<File>} files - Array of files",
  " * @param {number} maxFiles - Số lượng file tối đa": " * @param {number} maxFiles - Maximum number of files",
  " * Sanitize public ID (loại bỏ các ký tự không hợp lệ)": " * Sanitize public ID (remove invalid characters)",
  " * @param {string} str - String cần sanitize": " * @param {string} str - String to sanitize",
  " * Tạo các version khác nhau của ảnh": " * Create different image versions",
  " * @param {string} public_id - Public ID trên Cloudinary": " * @param {string} public_id - Public ID on Cloudinary",
  " * Cleanup - Xóa file tạm trên server": " * Cleanup - Delete temporary file on server",
  " * @param {string} filePath - Đường dẫn file": " * @param {string} filePath - File path",

  // src/utils/uploadCloudinary.js
  " * @param {string} publicId - Public ID của ảnh": " * @param {string} publicId - Public ID of image",

  // src/services/admin/accountService.js
  "message: 'Chỉ có thể thay đổi vai trò thành User hoặc Manager.'": "message: 'Role can only be changed to User or Manager.'",

  // src/models/Workshop.js
  "maxlength: [10, 'Số điện thoại không được vượt quá 10 ký tự']": "maxlength: [10, 'Phone number cannot exceed 10 characters']",

  // src/controllers/volunteer/accountController.js
  "message: action === 'pause' ? 'Đã tạm ngưng hoạt động thành công.' : 'Đã chuyển sang trạng thái sẵn sàng hoạt động.'": "message: action === 'pause' ? 'Successfully paused activity.' : 'Successfully switched to ready state.'",
  "message: 'Lỗi server khi cập nhật trạng thái hoạt động.'": "message: 'Server error while updating activity status.'",
  "message: 'Rút khỏi Đội cứu hộ thành công. Hệ thống đang thu hồi quyền điều phối.'": "message: 'Successfully withdrew from Rescue Team. System is revoking coordination rights.'",
  "message: 'Lỗi server khi hủy yêu cầu/rút khỏi hệ thống.'": "message: 'Server error while cancelling request/withdrawing from system.'",

  // src/controllers/admin/accountController.js
  "message: 'Cập nhật vai trò thành công.'": "message: 'Role updated successfully.'",
  "message: 'Lỗi server khi cập nhật vai trò người dùng.'": "message: 'Server error while updating user role.'",
  "message: `Đã ${updatedStatus === 'locked' ? 'lock' : 'unlock'} tài khoản thành công.`": "message: `Account successfully ${updatedStatus === 'locked' ? 'locked' : 'unlocked'}.`",
  "message: `Đã ${action === 'approve' ? 'approve' : 'reject'} yêu cầu thành công.`": "message: `Request successfully ${action === 'approve' ? 'approved' : 'rejected'}.`"
};

const files = [
  "src/utils/uploadHelper.js",
  "src/utils/uploadCloudinary.js",
  "src/services/admin/accountService.js",
  "src/models/Workshop.js",
  "src/controllers/volunteer/accountController.js",
  "src/controllers/admin/accountController.js"
];

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let modified = false;
  for (const [vietnamese, english] of Object.entries(replacements)) {
    if (content.includes(vietnamese)) {
      content = content.replace(vietnamese, english);
      modified = true;
    }
  }
  if (modified) {
    fs.writeFileSync(file, content, 'utf8');
    console.log('Updated: ' + file);
  }
});
