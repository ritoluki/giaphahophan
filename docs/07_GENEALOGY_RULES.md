# 07. Quy tắc nghiệp vụ gia phả

## GR-01 — Người là thực thể độc lập

Một người có canonical UUID ổn định và mã hiển thị riêng trong tree. Tên có thể thay đổi, trùng với người khác hoặc có nhiều cách ghi. Không dùng tên, số thứ tự đời, email hoặc vị trí node làm khóa. Person không phải user account; một người đã mất không cần tài khoản; một tài khoản có thể được xác minh liên kết với một hồ sơ qua claim có duyệt.

Không chỉ ghi người họ Phan: vợ/chồng, con gái, con nuôi và quan hệ ngoài họ vẫn được biểu diễn. Bộ lọc dòng chính chỉ là cách xem, không xóa hoặc bỏ dữ liệu nền.

## GR-02 — Quan hệ cha mẹ–con không suy từ hôn nhân

`parent_links(parent_id, child_id, kind, status, source)` là nguồn quan hệ. `kind=biological|adoptive|guardian|step`; `status=confirmed|disputed`. Người đóng góp dùng proposal, không thêm edge chính thức ngay. Một union biểu diễn quan hệ kết đôi/gia đình, không mặc nhiên tạo quan hệ sinh học với mọi đứa con liên quan.

Parent-child không được self-link. Cặp cùng kind không được lặp active. Biological/adoptive confirmed tạo ancestry DAG; step/guardian không dùng tính tổ tiên mặc định. Thông tin >2 biological parent confirmed cho cùng con phải bị chặn pending review đặc biệt, không tự chọn bớt theo giới tính. Những khẳng định cạnh tranh giữ ở nguồn/proposal/disputed, không xóa vì “không hợp cây”.

## GR-03 — Chặn chu trình và race condition

Khi thêm P→C, truy vấn ancestry confirmed từ C xuống các hậu duệ; nếu P nằm trong tập, reject `ANCESTRY_CYCLE`. Bản 1 serialize các mutation cấu trúc trong một tree bằng transaction-scoped advisory lock theo tree_id, rồi kiểm tra lại bên trong cùng transaction. Không chỉ kiểm tra ở frontend hoặc trước transaction, vì hai request đối nghịch có thể cùng vượt qua.

Batch import/merge cũng lấy lock tương tự và kiểm tra **toàn bộ tập cạnh sau thay đổi**, không chỉ từng cạnh tách rời. Union giữa họ hàng tạo vòng trong đồ thị vô hướng nhưng không nhất thiết tạo ancestry cycle; không được cấm chỉ vì graph có vòng.

## GR-04 — Hôn phối, gia đình và cha/mẹ chưa rõ

Cho nhiều union theo thời gian, góa, ly hôn, sống chung hoặc chưa rõ hình thức. Không yêu cầu một nam/một nữ để dữ liệu hợp lệ; không suy giới tính từ tên. Union có từ một partner đã xác định; người chưa rõ được giữ dưới dạng ghi chú/placeholder quan hệ, không tự tạo người tên “Không rõ” dùng chung cả hệ thống.

Con liên kết với union chỉ để nhóm hiển thị; cha/mẹ thật vẫn theo parent_links. Quan hệ với một người chỉ biết tên có thể tạo person tối thiểu với trạng thái unknown và nguồn. Không tự gộp mọi người thiếu tên.

## GR-05 — Đời và chi nhánh

`generation` là giá trị tương đối với một root và bộ quy tắc lineage, không phải số tuyệt đối trên person. Pedigree collapse có thể đưa một người đến nhiều độ sâu; hiển thị tập/range, và riêng “đời theo gia phả” nếu được nhập có nguồn. Không dùng minimum depth như chân lý duy nhất.

Branch có parent_branch_id, founder_person_id tùy chọn, mã, tên, mô tả, nguồn. Người có thể liên quan nhiều chi qua nguồn và khoảng thời gian; một `primary_branch_id` chỉ để sắp xếp, không là cơ sở tự động cấp mọi quyền. Không suy branch bằng họ tên. Chưa biết nối giữa hai nhánh thì để disconnected roots.

## GR-06 — Ngày tháng không chắc chắn

Lưu cấu trúc GenealogyDate kèm nguyên văn. Precision có exact, month, month_day, year, about, before, after, range, text, unknown. `month_day` dành cho ngày/tháng đã biết nhưng chưa biết năm (ví dụ ngày giỗ); không ép năm giả. Không biết tháng/ngày thì bỏ field trong API, lưu NULL trong SQL; không dùng 01/01 thay thế. Không biết sống/mất thì `life_status=unknown`; chính sách riêng tư coi như còn sống.

Lịch gốc là gregorian, vietnamese_lunar, julian hoặc unknown. Số liệu trước phạm vi adapter/âm lịch lịch sử được giữ nguyên văn, không tự chuyển rồi gắn nhãn chính xác. UTC chỉ cho thời điểm hệ thống; ngày sinh/mất không biến thành timestamp UTC gây lệch ngày.

## GR-07 — Nguồn và xung đột

Một fact/relationship có nhiều citation: source_id, trang/mục/vị trí ảnh, trích đoạn ngắn có quyền, người cung cấp, ngày ghi nhận. Source có loại sổ gia phả, giấy tờ, ảnh bia mộ, lời kể, bài viết, bản số hóa và visibility riêng.

Confidence: unverified, supported, verified, disputed. “Verified” là người duyệt xác nhận dựa trên nguồn đã xem, không phải chứng minh khoa học. Mâu thuẫn giữ cả các claim và trình bày rõ; canonical fact có người chọn và lý do. AI không tự nâng confidence.

## GR-08 — Trùng người và merge

Tên trùng chỉ là tín hiệu. Candidate scoring dùng tên chuẩn hóa, thời gian có khoảng, quan hệ đã biết và nguồn; chỉ xếp hàng, không auto-merge. Preview merge phải liệt kê tên/alias, facts, edges, branches, media, citations, claims, user link, events, finances và các tham chiếu.

Merge giữ survivor UUID; loser thành redirect/tombstone, version tăng. Gộp dữ liệu trong transaction, lưu mapping và merge manifest; kiểm tra cycle/unique/version; hủy toàn bộ nếu lỗi. Không tự merge hai tài khoản hoặc đồng ý công khai thay cho người dùng. “Undo” là compensating change có kiểm tra những sửa đổi sau merge, không đơn thuần phục hồi một row cũ đè mất dữ liệu mới.

## GR-09 — Tìm đường quan hệ

BFS trên graph đã lọc quyền, tối đa 12 bước, 10.000 visited nodes, timeout 500ms phía domain; nếu vượt trả `limit_reached`, không nói không có họ. Ưu tiên đường ít cạnh, trả tối đa 3 đường ngang nhau với nhãn quan hệ sinh học/nuôi/hôn phối. Không ghi tên hoặc số lượng người ẩn vào thông báo.

Mô tả “A là con của B; B là anh/chị/em của C…” đáng tin cậy hơn một danh xưng tự suy. Bản 1 cung cấp cách gọi phổ biến chỉ cho tập quan hệ được rule engine chứng minh đủ dữ liệu; trả “Chưa đủ dữ liệu để gợi ý xưng hô” cho trường hợp mơ hồ. Xưng hô không phải suy luận chắc chắn theo tuổi, vùng hoặc giới tính chưa biết.

## GR-10 — Sửa, xóa, thứ tự và quyền

Thứ tự con thuộc một nhóm anh chị em/quan hệ, không là thuộc tính toàn cục. Có trường ordinal được nguồn xác nhận; khi thiếu, sắp theo khoảng ngày rồi tên/mã ổn định, ghi “Thứ tự hiển thị”. Không suy “con trưởng” từ thứ tự sort.

Soft delete giữ tham chiếu và audit trong thời hạn được duyệt; person có người phụ thuộc cần preview tác động trước xóa. Erasure dữ liệu riêng tư dùng quy trình riêng, có thể bỏ PII khỏi audit/snapshot; audit nghiệp vụ không phải lý do giữ toàn bộ dữ liệu cá nhân mãi mãi.

## Bất biến bắt buộc kiểm thử

Không self-parent; không ancestry cycle kể cả concurrent writes; không cross-tree FK; alias không unique theo tên; disconnected roots hợp lệ; multiple unions hợp lệ; người nữ/con nuôi không biến mất khi tìm toàn họ; unknown không bị công khai; ngày năm-only round-trip không thành 01/01; merge/export không làm lộ dữ liệu ẩn; generation root-dependent; không suy quan hệ qua người bị ẩn.

## Nền tham khảo

Các phần mềm gia phả trưởng thành phân biệt người, gia đình, sự kiện, địa điểm, nguồn, media và quyền ở nhiều cấp. Bộ quy tắc trên là thiết kế riêng phù hợp nhu cầu dự án, không sao chép nguyên trạng chính sách public của phần mềm khác. [S01][S02][S03]
