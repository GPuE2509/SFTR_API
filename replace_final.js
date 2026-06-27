const fs = require('fs');

const replacements = {
  // uploadCloudinary.js
  " * Upload ảnh đơn lên Cloudinary": " * Upload single image to Cloudinary",
  " * @param {string|Buffer} file - Đường dẫn file hoặc Buffer": " * @param {string|Buffer} file - File path or Buffer",
  " * @param {string} folder - Thư mục trên Cloudinary (mặc định: 'smart-flood-traffic')": " * @param {string} folder - Folder on Cloudinary (default: 'smart-flood-traffic')",
  " * @param {string} publicId - Tên file trên Cloudinary (tùy chọn)": " * @param {string} publicId - File name on Cloudinary (optional)",
  " * @returns {Promise<Object>} - Object chứa url, public_id, secure_url": " * @returns {Promise<Object>} - Object containing url, public_id, secure_url",
  " * Upload nhiều ảnh lên Cloudinary": " * Upload multiple images to Cloudinary",
  " * @param {Array<Buffer>} files - Mảng Buffer hoặc đường dẫn": " * @param {Array<Buffer>} files - Array of Buffers or paths",
  " * @param {string} folder - Thư mục trên Cloudinary": " * @param {string} folder - Folder on Cloudinary",
  " * @returns {Promise<Array>} - Mảng chứa thông tin các ảnh": " * @returns {Promise<Array>} - Array containing image infos",
  " * Xóa ảnh từ Cloudinary": " * Delete image from Cloudinary",
  " * @param {string} publicId - Public ID của ảnh trên Cloudinary": " * @param {string} publicId - Public ID of image on Cloudinary",
  " * @returns {Promise<boolean>} - True nếu xóa thành công": " * @returns {Promise<boolean>} - True if successfully deleted",
  " * Xóa nhiều ảnh từ Cloudinary": " * Delete multiple images from Cloudinary",
  " * @param {Array<string>} publicIds - Mảng public ID": " * @param {Array<string>} publicIds - Array of public IDs",
  " * @returns {Promise<number>} - Số lượng ảnh đã xóa": " * @returns {Promise<number>} - Number of images deleted",
  " * Lấy thông tin ảnh từ Cloudinary": " * Get image info from Cloudinary",
  " * @param {string} publicId - Public ID của ảnh": " * @param {string} publicId - Public ID of image",
  " * @returns {Promise<Object>} - Thông tin ảnh": " * @returns {Promise<Object>} - Image info",
  " * Tạo URL ảnh với kích thước được tùy chỉnh": " * Create image URL with custom size",
  " * @param {number} width - Chiều rộng (px)": " * @param {number} width - Width (px)",
  " * @param {number} height - Chiều cao (px)": " * @param {number} height - Height (px)",
  " * @param {string} crop - Cách crop ảnh (fill, scale, fit, etc.)": " * @param {string} crop - Crop method (fill, scale, fit, etc.)",
  " * @returns {string} - URL ảnh đã được resize": " * @returns {string} - Resized image URL",
  " * Lấy thumbnail ảnh": " * Get image thumbnail",
  " * @param {number} size - Kích thước (mặc định: 150)": " * @param {number} size - Size (default: 150)",
  " * Tạo URL ảnh cho avatar": " * Create avatar image URL",
  // multerConfig.js
  " * Middleware upload ảnh đơn": " * Single image upload middleware",
  " * Middleware upload nhiều ảnh": " * Multiple images upload middleware",
  " * Middleware upload ảnh với các field khác nhau": " * Image upload middleware with different fields",
  " * Cho phép:": " * Allows:",
  " * - 1 ảnh avatar (field: 'avatar')": " * - 1 avatar image (field: 'avatar')",
  " * - 5 ảnh bài viết (field: 'post_images')": " * - 5 post images (field: 'post_images')",
  // Error messages
  "'Số điện thoại di động Việt Nam không hợp lệ.'": "'Invalid Vietnamese mobile phone number.'",
  "'Vĩ độ không hợp lệ.'": "'Invalid latitude.'",
  "'Kinh độ không hợp lệ.'": "'Invalid longitude.'",
  "'Bán kính phục vụ không hợp lệ.'": "'Invalid service radius.'",
  "'Hành động không hợp lệ. Chỉ chấp nhận \"pause\" or \"resume\".'": "'Invalid action. Only \"pause\" or \"resume\" are accepted.'",
  "'Vai trò mới là bắt buộc.'": "'New role is required.'",
  "'Vai trò mới không hợp lệ.'": "'Invalid new role.'",
  "'Bạn không thể tự thay đổi vai trò của chính mình.'": "'You cannot change your own role.'"
};

const files = [
  "src/utils/uploadCloudinary.js",
  "src/utils/multerConfig.js",
  "src/services/workshop/profileService.js",
  "src/services/workshop/accountService.js",
  "src/services/volunteer/accountService.js",
  "src/services/admin/accountService.js"
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
