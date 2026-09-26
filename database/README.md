# SQL blueprint — không chạy trực tiếp trên production

`schema.blueprint.sql` và `contracts/data-dictionary.json` mô tả 53 bảng cùng ràng buộc cơ bản. File SQL phụ thuộc Supabase roles/auth.users; bật RLS và revoke grants để fail-closed. Đây chưa phải migration hoàn chỉnh phục vụ app: chưa có authorized RPC helpers, policies/grants hoàn thiện, worker role setup, cycle/financial triggers, updated_at/version triggers hoặc seed auth.

Agent phải tách migration có thứ tự, triển khai helpers SECURITY DEFINER ở private với authorization, wrappers SECURITY INVOKER ở api và grant tối thiểu như docs/30. Không expose schema private, không mở policy USING(true) để “chạy cho nhanh”. Các constraints concurrent graph/journal cần test transaction thực.

Chuyển schema có review khi xóa auth account: FK attribution không cascade xóa gia phả/quỹ. Public projection là dữ liệu đã duyệt, không raw persons view. Test local reset chỉ trên database local được xác minh, cấm nhầm remote URL. Migration production là job one-off theo manifest H4; schema phải backward-compatible cho rolling app/worker.
