/** Public-facing copy is selected by code; server/debug messages are never rendered. */
const errorMessages: Readonly<Record<string, string>> = {
  UNAUTHENTICATED: "Phiên đăng nhập đã hết hạn. Đăng nhập lại để tiếp tục.",
  AUTH_REQUIRED: "Đăng nhập để tiếp tục.",
  SESSION_EXPIRED: "Phiên đăng nhập đã hết hạn. Đăng nhập lại để tiếp tục.",
  FORBIDDEN: "Bạn chưa được cấp quyền thực hiện thao tác này.",
  PERMISSION_DENIED: "Bạn chưa được cấp quyền thực hiện thao tác này.",
  CAPABILITY_REQUIRED: "Bạn chưa được cấp quyền thực hiện thao tác này.",
  MFA_REQUIRED: "Xác thực hai bước để tiếp tục.",
  AAL2_REQUIRED: "Xác thực hai bước để tiếp tục.",
  NOT_FOUND: "Không tìm thấy thông tin trong phạm vi bạn được xem.",
  VERSION_CONFLICT: "Thông tin đã thay đổi. Tải lại bản mới trước khi tiếp tục.",
  STALE_VERSION: "Thông tin đã thay đổi. Tải lại bản mới trước khi tiếp tục.",
  CONFLICT: "Thông tin đã thay đổi. Tải lại bản mới trước khi tiếp tục.",
  INVALID_INPUT: "Có thông tin chưa hợp lệ. Kiểm tra lại các mục đã nhập.",
  VALIDATION_ERROR: "Có thông tin chưa hợp lệ. Kiểm tra lại các mục đã nhập.",
  INVALID_REQUEST: "Không thể gửi yêu cầu. Kiểm tra lại các mục đã nhập.",
  CSRF_INVALID: "Phiên xác nhận đã hết hạn. Tải lại trang rồi thử lại.",
  ORIGIN_INVALID: "Không thể xác nhận trang gửi yêu cầu. Mở lại website rồi thử lại.",
  RATE_LIMITED: "Bạn thao tác quá nhanh. Chờ một lát rồi thử lại.",
  RATE_LIMIT_EXCEEDED: "Bạn thao tác quá nhanh. Chờ một lát rồi thử lại.",
  SELF_REVIEW_FORBIDDEN: "Đề nghị cần được một người khác duyệt.",
  SELF_APPROVAL_FORBIDDEN: "Đề nghị cần được một người khác duyệt.",
  EXPORT_MEDIA_PACKAGING_NOT_IMPLEMENTED: "Chức năng xuất kèm ảnh đang được hoàn thiện. Có thể tiếp tục xuất phần thông tin.",
  EXPORT_EXPIRED: "Bản xuất đã hết hạn. Tạo yêu cầu xuất mới để tiếp tục.",
  QUOTA_EXCEEDED: "Đã đạt giới hạn cho phép. Thử lại sau hoặc liên hệ người phụ trách.",
  UPLOAD_TOO_LARGE: "Tệp vượt dung lượng cho phép. Chọn tệp nhỏ hơn rồi thử lại.",
  INVALID_CREDENTIALS: "Thông tin đăng nhập chưa đúng. Kiểm tra lại email và mật khẩu.",
  EMAIL_NOT_CONFIRMED: "Cần xác nhận email trước khi đăng nhập.",
};

export function getUiErrorMessage(error: unknown, fallback = "Chưa thể thực hiện thao tác này. Thử lại sau giây lát."): string {
  if (typeof error !== "object" || error === null) return fallback;
  const candidates = [error, "error" in error ? error.error : null, "data" in error ? error.data : null];
  for (const candidate of candidates) {
    if (typeof candidate === "object" && candidate !== null && "code" in candidate && typeof candidate.code === "string") {
      if (!Object.hasOwn(errorMessages, candidate.code)) continue;
      const message = errorMessages[candidate.code];
      if (typeof message === "string") return message;
    }
  }
  return fallback;
}
