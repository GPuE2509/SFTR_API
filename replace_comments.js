const fs = require('fs');

const replacements = {
  "// Kiểm tra xem user đã có tiệm (với tư cách là chủ sở hữu) đang hoạt động hoặc chờ duyệt hay chưa": "// Check if user already has an active or pending workshop (as owner)",
  "// Validation cơ bản": "// Basic validation",
  "// Tạo Workshop mới (status mặc định: Pending_Approval)": "// Create new Workshop (default status: Pending_Approval)",
  "// Tạo thông tin Chủ tiệm trong WorkshopStaff (status: Inactive khi chưa được duyệt)": "// Create Owner info in WorkshopStaff (status: Inactive when not yet approved)",
  "// Lưu Refresh Token vào Database": "// Save Refresh Token to Database",
  "// Thu hồi nếu token không hợp lệ (hết hạn hoặc giả mạo) để dọn rác": "// Revoke if token is invalid (expired or forged) to clean up",
  "// Kiểm tra trong cơ sở dữ liệu": "// Check in database",
  "// Lấy thông tin user hiện tại (để cập nhật role/trạng thái mới nhất nếu có)": "// Get current user info (to update latest role/status if any)",
  "// Cập Access Token mới": "// Issue new Access Token",
  "// Lấy thông tin tiệm của người dùng hiện tại (để hiển thị trạng thái)": "// Get workshop info of current user (to display status)",
  "// Cập nhật thông tin hồ sơ tiệm sửa xe": "// Update workshop profile information",
  "// Đăng ký mở tiệm mới": "// Register new workshop",
  "// Hủy yêu cầu đăng ký mở tiệm": "// Cancel workshop registration request",
  "// Tạm ngưng hoặc tiếp tục hoạt động tiệm": "// Pause or resume workshop activity",
  "// Lấy thông tin hồ sơ tình nguyện viên của người dùng hiện tại": "// Get volunteer profile of current user",
  "// Cập nhật thông tin hồ sơ tình nguyện viên": "// Update volunteer profile information",
  "// Nếu file là Buffer (từ multer)": "// If file is Buffer (from multer)",
  "// Nếu file là đường dẫn hoặc base64 string": "// If file is path or base64 string",
  "// Xóa file tạm nếu được upload từ server (chỉ chạy với đường dẫn file hợp lệ)": "// Delete temporary file if uploaded from server (only runs with valid file path)",
  "// Cấu hình storage (lưu trữ tạm thời trước khi upload lên Cloudinary)": "// Configure storage (temporary storage before uploading to Cloudinary)",
  "const storage = multer.memoryStorage(); // Lưu vào RAM, không cần file tạm": "const storage = multer.memoryStorage(); // Save to RAM, no temporary file needed",
  "// Các loại file được phép": "// Allowed file types",
  "// Validate từng file": "// Validate each file",
  "// Tự động xóa token khi hết hạn (TTL Index)": "// Auto delete token when expired (TTL Index)",
  "// Trả về thông tin rate limit trong header `RateLimit-*`": "// Return rate limit info in `RateLimit-*` header",
  "// Vô hiệu hóa header `X-RateLimit-*`": "// Disable `X-RateLimit-*` header",
  "// Bỏ qua rate limit cho admin": "// Skip rate limit for admin",
  "// Không tính những request thành công": "// Do not count successful requests",
  "// Sử dụng email hoặc IP để phân biệt": "// Use email or IP to differentiate"
};

const files = [
  "src/services/workshop/accountService.js",
  "src/services/auth/authService.js",
  "src/controllers/workshop/profileController.js",
  "src/controllers/workshop/accountController.js",
  "src/controllers/volunteer/profileController.js",
  "src/utils/uploadCloudinary.js",
  "src/utils/multerConfig.js",
  "src/utils/uploadHelper.js",
  "src/models/RefreshToken.js"
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
