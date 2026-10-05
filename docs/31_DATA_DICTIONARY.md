# 31. Từ điển dữ liệu chi tiết

Nguồn máy đọc: contracts/data-dictionary.json. Blueprint chưa có đầy đủ policy/function/trigger, do đó không được dùng trực tiếp production. Null có nghĩa chưa có/không biết, không tự điền dữ liệu giả.

Tất cả bảng có UUID, version, created_at/updated_at, created_by. Bảng scoped có tree_id và composite FK để không lẫn tree. Auth identity thuộc Supabase, không seed từ JSON fixture.

## trees — Dòng họ/miền dữ liệu
| Trường | SQL type | Null | Ý nghĩa / FK |
|---|---|---|---|
| id | uuid | Không | Canonical UUID |
| version | bigint | Không | Optimistic locking |
| created_at | timestamptz | Không | Thời điểm ghi UTC |
| updated_at | timestamptz | Không | Thời điểm cập nhật UTC |
| created_by | uuid | Có | Actor; không suy từ payload → auth.users |
| slug | text | Không | Slug tree |
| name | text | Không | Tên dòng/chi được xác nhận |
| data_mode | text | Không | Tách demo/real |
| policy_version | bigint | Không | Tăng khi quyền/policy đổi |
| graph_revision | bigint | Không | Tăng khi cấu trúc đổi |
| settings | jsonb | Không | Settings có schema, không secrets |

UNIQUE: (slug).


## branches — Chi nhánh và tổ chức phả hệ
| Trường | SQL type | Null | Ý nghĩa / FK |
|---|---|---|---|
| id | uuid | Không | Canonical UUID |
| tree_id | uuid | Không | Bắt buộc cô lập tree → trees |
| version | bigint | Không | Optimistic locking |
| created_at | timestamptz | Không | Thời điểm ghi UTC |
| updated_at | timestamptz | Không | Thời điểm cập nhật UTC |
| created_by | uuid | Có | Actor; không suy từ payload → auth.users |
| code | text | Không | Mã chi |
| name | text | Không | Tên chi |
| parent_branch_id | uuid | Có | Chi cha, chống cycle → branches |
| founder_person_id | uuid | Có | Không bắt buộc biết thủy tổ → persons |
| description | text | Có | Phả ký của chi |
| visibility | text | Không | Giới hạn đọc |

CHECK: parent_branch_id IS NULL OR parent_branch_id <> id.

UNIQUE: (tree_id, code).


## memberships — Quyền tham gia tree
| Trường | SQL type | Null | Ý nghĩa / FK |
|---|---|---|---|
| id | uuid | Không | Canonical UUID |
| tree_id | uuid | Không | Bắt buộc cô lập tree → trees |
| version | bigint | Không | Optimistic locking |
| created_at | timestamptz | Không | Thời điểm ghi UTC |
| updated_at | timestamptz | Không | Thời điểm cập nhật UTC |
| created_by | uuid | Có | Actor; không suy từ payload → auth.users |
| auth_user_id | uuid | Không | Auth identity được xác minh → auth.users |
| role | text | Không | Base role |
| status | text | Không | Không tự active khi đăng ký |
| person_id | uuid | Có | Claim được duyệt, không tự nối → persons |
| approved_by | uuid | Có | Reviewer → auth.users |

UNIQUE: (tree_id, auth_user_id).


## capability_grants — Capability theo phạm vi
| Trường | SQL type | Null | Ý nghĩa / FK |
|---|---|---|---|
| id | uuid | Không | Canonical UUID |
| tree_id | uuid | Không | Bắt buộc cô lập tree → trees |
| version | bigint | Không | Optimistic locking |
| created_at | timestamptz | Không | Thời điểm ghi UTC |
| updated_at | timestamptz | Không | Thời điểm cập nhật UTC |
| created_by | uuid | Có | Actor; không suy từ payload → auth.users |
| membership_id | uuid | Không | Người nhận quyền → memberships |
| capability | text | Không | Quyền allowlist |
| branch_id | uuid | Có | Null = tree scope đã được duyệt → branches |
| expires_at | timestamptz | Có | Hết hạn quyền |
| revoked_at | timestamptz | Có | Thu hồi quyền |


## invitations — Lời mời có giới hạn
| Trường | SQL type | Null | Ý nghĩa / FK |
|---|---|---|---|
| id | uuid | Không | Canonical UUID |
| tree_id | uuid | Không | Bắt buộc cô lập tree → trees |
| version | bigint | Không | Optimistic locking |
| created_at | timestamptz | Không | Thời điểm ghi UTC |
| updated_at | timestamptz | Không | Thời điểm cập nhật UTC |
| created_by | uuid | Có | Actor; không suy từ payload → auth.users |
| email_hash | text | Không | Match email normalized không log plaintext |
| email_ciphertext | text | Có | Email mã hóa để gửi nếu cần |
| token_hash | text | Không | Không lưu raw token |
| intended_role | text | Không | Role allowlist, không nhận từ URL |
| expires_at | timestamptz | Không | TTL |
| accepted_at | timestamptz | Có | Single-use |
| revoked_at | timestamptz | Có | Thu hồi |

UNIQUE: (token_hash).


## person_claims — Claim tài khoản với hồ sơ
| Trường | SQL type | Null | Ý nghĩa / FK |
|---|---|---|---|
| id | uuid | Không | Canonical UUID |
| tree_id | uuid | Không | Bắt buộc cô lập tree → trees |
| version | bigint | Không | Optimistic locking |
| created_at | timestamptz | Không | Thời điểm ghi UTC |
| updated_at | timestamptz | Không | Thời điểm cập nhật UTC |
| created_by | uuid | Có | Actor; không suy từ payload → auth.users |
| membership_id | uuid | Không | Người đề nghị → memberships |
| person_id | uuid | Không | Hồ sơ muốn liên kết → persons |
| status | text | Không | Quy trình xác minh |
| reviewed_by | uuid | Có | Khác requester → auth.users |
| reason | text | Có | Lý do, tối thiểu PII |


## persons — Hồ sơ canonical
| Trường | SQL type | Null | Ý nghĩa / FK |
|---|---|---|---|
| id | uuid | Không | Canonical UUID |
| tree_id | uuid | Không | Bắt buộc cô lập tree → trees |
| version | bigint | Không | Optimistic locking |
| created_at | timestamptz | Không | Thời điểm ghi UTC |
| updated_at | timestamptz | Không | Thời điểm cập nhật UTC |
| created_by | uuid | Có | Actor; không suy từ payload → auth.users |
| code | text | Không | Mã hiển thị stable |
| display_name | text | Không | Unicode NFC, không unique |
| name_search | text | Không | Khóa tìm kiếm không dấu |
| recorded_sex | text | Có | Theo nguồn, không suy từ tên |
| life_status | text | Không | Unknown bảo vệ như living |
| visibility | text | Không | Intent; effective policy có thể chặt hơn |
| protected_minor | boolean | Không | Đánh dấu thận trọng; derive/review theo nguồn |
| primary_branch_id | uuid | Có | Chỉ hiển thị, không tự cấp quyền → branches |
| portrait_asset_id | uuid | Có | Asset có policy độc lập → media_assets |
| biography | text | Có | Tiểu sử đã lọc theo audience |
| confidence | text | Không | Mức xác minh |
| merged_into_id | uuid | Có | Tombstone redirect → persons |
| deleted_at | timestamptz | Có | Soft deletion |

CHECK: merged_into_id IS NULL OR merged_into_id <> id.

UNIQUE: (tree_id, code).


## person_names — Tên gọi khác, không gộp theo tên
| Trường | SQL type | Null | Ý nghĩa / FK |
|---|---|---|---|
| id | uuid | Không | Canonical UUID |
| tree_id | uuid | Không | Bắt buộc cô lập tree → trees |
| version | bigint | Không | Optimistic locking |
| created_at | timestamptz | Không | Thời điểm ghi UTC |
| updated_at | timestamptz | Không | Thời điểm cập nhật UTC |
| created_by | uuid | Có | Actor; không suy từ payload → auth.users |
| person_id | uuid | Không | Chủ tên → persons |
| name | text | Không | Tên nguyên văn |
| name_search | text | Không | Search key |
| kind | text | Không | Tên chính/tự/hiệu/khác |
| is_preferred | boolean | Không | Một preferred active/person |


## person_private — Dữ liệu cần giới hạn đặc biệt
| Trường | SQL type | Null | Ý nghĩa / FK |
|---|---|---|---|
| id | uuid | Không | Canonical UUID |
| tree_id | uuid | Không | Bắt buộc cô lập tree → trees |
| version | bigint | Không | Optimistic locking |
| created_at | timestamptz | Không | Thời điểm ghi UTC |
| updated_at | timestamptz | Không | Thời điểm cập nhật UTC |
| created_by | uuid | Có | Actor; không suy từ payload → auth.users |
| person_id | uuid | Không | Chủ thông tin → persons |
| contact_ciphertext | text | Có | Encrypted contact payload, không API thường |
| key_id | text | Có | Key ở vault tách backup |
| last_verified_at | timestamptz | Có | Kiểm tra mục đích/đúng dữ liệu |

UNIQUE: (tree_id, person_id).


## person_branches — Một người có thể liên quan nhiều chi
| Trường | SQL type | Null | Ý nghĩa / FK |
|---|---|---|---|
| id | uuid | Không | Canonical UUID |
| tree_id | uuid | Không | Bắt buộc cô lập tree → trees |
| version | bigint | Không | Optimistic locking |
| created_at | timestamptz | Không | Thời điểm ghi UTC |
| updated_at | timestamptz | Không | Thời điểm cập nhật UTC |
| created_by | uuid | Có | Actor; không suy từ payload → auth.users |
| person_id | uuid | Không | Person → persons |
| branch_id | uuid | Không | Branch → branches |
| membership_kind | text | Không | Theo nguồn, không auth membership |
| source_id | uuid | Có | Nguồn → sources |
| generation_note | text | Có | Đời được ghi nguyên văn theo root/source |

UNIQUE: (tree_id, person_id, branch_id, membership_kind).


## unions — Hôn phối/gia đình không tự suy quan hệ sinh học
| Trường | SQL type | Null | Ý nghĩa / FK |
|---|---|---|---|
| id | uuid | Không | Canonical UUID |
| tree_id | uuid | Không | Bắt buộc cô lập tree → trees |
| version | bigint | Không | Optimistic locking |
| created_at | timestamptz | Không | Thời điểm ghi UTC |
| updated_at | timestamptz | Không | Thời điểm cập nhật UTC |
| created_by | uuid | Có | Actor; không suy từ payload → auth.users |
| kind | text | Không | Kiểu quan hệ |
| status | text | Không | Tình trạng theo nguồn |
| start_date | jsonb | Có | GenealogyDate |
| end_date | jsonb | Có | GenealogyDate |
| notes | text | Có | Ghi chú có quyền |
| visibility | text | Không | Visibility |


## union_partners — Các người tham gia union
| Trường | SQL type | Null | Ý nghĩa / FK |
|---|---|---|---|
| id | uuid | Không | Canonical UUID |
| tree_id | uuid | Không | Bắt buộc cô lập tree → trees |
| version | bigint | Không | Optimistic locking |
| created_at | timestamptz | Không | Thời điểm ghi UTC |
| updated_at | timestamptz | Không | Thời điểm cập nhật UTC |
| created_by | uuid | Có | Actor; không suy từ payload → auth.users |
| union_id | uuid | Không | Union → unions |
| person_id | uuid | Không | Partner → persons |
| role_label | text | Có | Nguyên văn theo nguồn, không ép giới tính |

UNIQUE: (tree_id, union_id, person_id).


## union_children — Nhóm hiển thị, không thay parent_links
| Trường | SQL type | Null | Ý nghĩa / FK |
|---|---|---|---|
| id | uuid | Không | Canonical UUID |
| tree_id | uuid | Không | Bắt buộc cô lập tree → trees |
| version | bigint | Không | Optimistic locking |
| created_at | timestamptz | Không | Thời điểm ghi UTC |
| updated_at | timestamptz | Không | Thời điểm cập nhật UTC |
| created_by | uuid | Có | Actor; không suy từ payload → auth.users |
| union_id | uuid | Không | Nhóm family → unions |
| child_id | uuid | Không | Child → persons |
| ordinal | integer | Có | Thứ tự khi có nguồn |
| source_id | uuid | Có | Nguồn xác nhận nhóm/thứ tự → sources |

CHECK: ordinal IS NULL OR ordinal > 0.

UNIQUE: (tree_id, union_id, child_id).


## parent_links — Quan hệ có hướng, mutation cần ancestry lock
| Trường | SQL type | Null | Ý nghĩa / FK |
|---|---|---|---|
| id | uuid | Không | Canonical UUID |
| tree_id | uuid | Không | Bắt buộc cô lập tree → trees |
| version | bigint | Không | Optimistic locking |
| created_at | timestamptz | Không | Thời điểm ghi UTC |
| updated_at | timestamptz | Không | Thời điểm cập nhật UTC |
| created_by | uuid | Có | Actor; không suy từ payload → auth.users |
| parent_id | uuid | Không | Parent → persons |
| child_id | uuid | Không | Child → persons |
| kind | text | Không | Loại quan hệ |
| status | text | Không | Confirmed/disputed |
| ordinal | integer | Có | Thứ tự có nguồn trong nhóm |
| source_id | uuid | Không | Nguồn tối thiểu → sources |
| deleted_at | timestamptz | Có | Soft deletion |

CHECK: parent_id <> child_id; ordinal IS NULL OR ordinal > 0.


## person_facts — Facts/sự kiện đời người
| Trường | SQL type | Null | Ý nghĩa / FK |
|---|---|---|---|
| id | uuid | Không | Canonical UUID |
| tree_id | uuid | Không | Bắt buộc cô lập tree → trees |
| version | bigint | Không | Optimistic locking |
| created_at | timestamptz | Không | Thời điểm ghi UTC |
| updated_at | timestamptz | Không | Thời điểm cập nhật UTC |
| created_by | uuid | Có | Actor; không suy từ payload → auth.users |
| person_id | uuid | Có | Subject person → persons |
| union_id | uuid | Có | Hoặc subject union → unions |
| kind | text | Không | birth/death/burial/occupation/other |
| value_date | jsonb | Có | GenealogyDate, không fake exact |
| value_text | text | Có | Nội dung theo nguồn |
| place_id | uuid | Có | Place → places |
| confidence | text | Không | Mức xác minh |
| visibility | text | Không | Field scope |

CHECK: num_nonnulls(person_id, union_id) = 1.


## sources — Nguồn chứng cứ không mặc định public
| Trường | SQL type | Null | Ý nghĩa / FK |
|---|---|---|---|
| id | uuid | Không | Canonical UUID |
| tree_id | uuid | Không | Bắt buộc cô lập tree → trees |
| version | bigint | Không | Optimistic locking |
| created_at | timestamptz | Không | Thời điểm ghi UTC |
| updated_at | timestamptz | Không | Thời điểm cập nhật UTC |
| created_by | uuid | Có | Actor; không suy từ payload → auth.users |
| title | text | Không | Tên nguồn |
| kind | text | Không | book/document/oral/photo/web/other |
| provider_name | text | Có | Người/tổ chức cung cấp; policy riêng |
| provenance | text | Có | Nguồn gốc/quyền sử dụng |
| recorded_date | jsonb | Có | GenealogyDate |
| original_asset_id | uuid | Có | Tư liệu nguyên gốc → media_assets |
| visibility | text | Không | Policy của source |
| rights_note | text | Có | Được phép dùng vào việc gì |


## citations — Liên kết source có FK thật
| Trường | SQL type | Null | Ý nghĩa / FK |
|---|---|---|---|
| id | uuid | Không | Canonical UUID |
| tree_id | uuid | Không | Bắt buộc cô lập tree → trees |
| version | bigint | Không | Optimistic locking |
| created_at | timestamptz | Không | Thời điểm ghi UTC |
| updated_at | timestamptz | Không | Thời điểm cập nhật UTC |
| created_by | uuid | Có | Actor; không suy từ payload → auth.users |
| source_id | uuid | Không | Nguồn → sources |
| person_id | uuid | Có | Đối tượng được trích nguồn → persons |
| fact_id | uuid | Có | Đối tượng được trích nguồn → person_facts |
| parent_link_id | uuid | Có | Đối tượng được trích nguồn → parent_links |
| union_id | uuid | Có | Đối tượng được trích nguồn → unions |
| content_revision_id | uuid | Có | Đối tượng được trích nguồn → content_revisions |
| place_id | uuid | Có | Đối tượng được trích nguồn → places |
| event_rule_id | uuid | Có | Đối tượng được trích nguồn → event_rules |
| locator | text | Không | Trang/mục/crop/timecode |
| quoted_text | text | Có | Trích ngắn có quyền |
| confidence | text | Có | Mức hỗ trợ claim |

CHECK: num_nonnulls(person_id, fact_id, parent_link_id, union_id, content_revision_id, place_id, event_rule_id) = 1.


## media_assets — Files private và derivatives
| Trường | SQL type | Null | Ý nghĩa / FK |
|---|---|---|---|
| id | uuid | Không | Canonical UUID |
| tree_id | uuid | Không | Bắt buộc cô lập tree → trees |
| version | bigint | Không | Optimistic locking |
| created_at | timestamptz | Không | Thời điểm ghi UTC |
| updated_at | timestamptz | Không | Thời điểm cập nhật UTC |
| created_by | uuid | Có | Actor; không suy từ payload → auth.users |
| bucket | text | Không | Private bucket |
| object_key | text | Không | Server-generated opaque key |
| sha256 | text | Có | Content hash sau finalize |
| mime_type | text | Có | Magic-verified MIME |
| size_bytes | bigint | Không | Kích thước thực |
| state | text | Không | Upload/scan lifecycle |
| visibility | text | Không | Policy độc lập |
| alt_text | text | Có | Mô tả ảnh |
| derivatives | jsonb | Không | Object versions, không public URLs |
| deleted_at | timestamptz | Có | Cleanup theo manifest |

CHECK: size_bytes >= 0.

UNIQUE: (bucket, object_key).


## media_links — Link không làm nâng quyền asset
| Trường | SQL type | Null | Ý nghĩa / FK |
|---|---|---|---|
| id | uuid | Không | Canonical UUID |
| tree_id | uuid | Không | Bắt buộc cô lập tree → trees |
| version | bigint | Không | Optimistic locking |
| created_at | timestamptz | Không | Thời điểm ghi UTC |
| updated_at | timestamptz | Không | Thời điểm cập nhật UTC |
| created_by | uuid | Có | Actor; không suy từ payload → auth.users |
| asset_id | uuid | Không | Media → media_assets |
| person_id | uuid | Có | Subject → persons |
| source_id | uuid | Có | Subject → sources |
| content_revision_id | uuid | Có | Subject → content_revisions |
| place_id | uuid | Có | Subject → places |
| event_rule_id | uuid | Có | Subject → event_rules |
| caption | text | Có | Caption có scope |

CHECK: num_nonnulls(person_id, source_id, content_revision_id, place_id, event_rule_id) = 1.


## albums — Nhóm media
| Trường | SQL type | Null | Ý nghĩa / FK |
|---|---|---|---|
| id | uuid | Không | Canonical UUID |
| tree_id | uuid | Không | Bắt buộc cô lập tree → trees |
| version | bigint | Không | Optimistic locking |
| created_at | timestamptz | Không | Thời điểm ghi UTC |
| updated_at | timestamptz | Không | Thời điểm cập nhật UTC |
| created_by | uuid | Có | Actor; không suy từ payload → auth.users |
| title | text | Không | Album |
| description | text | Có | Mô tả |
| visibility | text | Không | Scope |


## album_items — Mục album
| Trường | SQL type | Null | Ý nghĩa / FK |
|---|---|---|---|
| id | uuid | Không | Canonical UUID |
| tree_id | uuid | Không | Bắt buộc cô lập tree → trees |
| version | bigint | Không | Optimistic locking |
| created_at | timestamptz | Không | Thời điểm ghi UTC |
| updated_at | timestamptz | Không | Thời điểm cập nhật UTC |
| created_by | uuid | Có | Actor; không suy từ payload → auth.users |
| album_id | uuid | Không | Album → albums |
| asset_id | uuid | Không | Asset → media_assets |
| ordinal | integer | Không | Thứ tự |

UNIQUE: (tree_id, album_id, asset_id).


## content_pages — Content identity
| Trường | SQL type | Null | Ý nghĩa / FK |
|---|---|---|---|
| id | uuid | Không | Canonical UUID |
| tree_id | uuid | Không | Bắt buộc cô lập tree → trees |
| version | bigint | Không | Optimistic locking |
| created_at | timestamptz | Không | Thời điểm ghi UTC |
| updated_at | timestamptz | Không | Thời điểm cập nhật UTC |
| created_by | uuid | Có | Actor; không suy từ payload → auth.users |
| slug | text | Không | Slug không lộ PII |
| kind | text | Không | history/news/guide/policy |
| published_revision_id | uuid | Có | Revision đã duyệt → content_revisions |
| visibility | text | Không | Scope |

UNIQUE: (tree_id, slug).


## content_revisions — Revision bất biến sau publish theo policy
| Trường | SQL type | Null | Ý nghĩa / FK |
|---|---|---|---|
| id | uuid | Không | Canonical UUID |
| tree_id | uuid | Không | Bắt buộc cô lập tree → trees |
| version | bigint | Không | Optimistic locking |
| created_at | timestamptz | Không | Thời điểm ghi UTC |
| updated_at | timestamptz | Không | Thời điểm cập nhật UTC |
| created_by | uuid | Có | Actor; không suy từ payload → auth.users |
| page_id | uuid | Không | Page → content_pages |
| title | text | Không | Title |
| body | jsonb | Không | Rich text allowlist |
| status | text | Không | Draft không public |
| approved_by | uuid | Có | Reviewer → auth.users |
| publish_at | timestamptz | Có | Schedule tùy chọn |


## publications — Projection không thay current authorization
| Trường | SQL type | Null | Ý nghĩa / FK |
|---|---|---|---|
| id | uuid | Không | Canonical UUID |
| tree_id | uuid | Không | Bắt buộc cô lập tree → trees |
| version | bigint | Không | Optimistic locking |
| created_at | timestamptz | Không | Thời điểm ghi UTC |
| updated_at | timestamptz | Không | Thời điểm cập nhật UTC |
| created_by | uuid | Có | Actor; không suy từ payload → auth.users |
| revision_id | uuid | Không | Source revision → content_revisions |
| projection | jsonb | Không | Allowlisted public DTO |
| policy_version | bigint | Không | Phải recheck khi đọc |
| revoked_at | timestamptz | Có | Ngừng publish |


## places — Địa điểm và nơi thờ
| Trường | SQL type | Null | Ý nghĩa / FK |
|---|---|---|---|
| id | uuid | Không | Canonical UUID |
| tree_id | uuid | Không | Bắt buộc cô lập tree → trees |
| version | bigint | Không | Optimistic locking |
| created_at | timestamptz | Không | Thời điểm ghi UTC |
| updated_at | timestamptz | Không | Thời điểm cập nhật UTC |
| created_by | uuid | Có | Actor; không suy từ payload → auth.users |
| name | text | Không | Tên địa điểm |
| kind | text | Không | Loại địa điểm |
| address_text | text | Có | Địa chỉ có scope |
| latitude | numeric(10,7) | Có | Không gửi provider tự động |
| longitude | numeric(10,7) | Có | Không gửi provider tự động |
| visibility | text | Không | Scope |
| coordinate_visibility | text | Không | Scope riêng tọa độ |

CHECK: latitude IS NULL OR latitude BETWEEN -90 AND 90; longitude IS NULL OR longitude BETWEEN -180 AND 180.


## burial_records — Mộ phần có quyền riêng
| Trường | SQL type | Null | Ý nghĩa / FK |
|---|---|---|---|
| id | uuid | Không | Canonical UUID |
| tree_id | uuid | Không | Bắt buộc cô lập tree → trees |
| version | bigint | Không | Optimistic locking |
| created_at | timestamptz | Không | Thời điểm ghi UTC |
| updated_at | timestamptz | Không | Thời điểm cập nhật UTC |
| created_by | uuid | Có | Actor; không suy từ payload → auth.users |
| person_id | uuid | Không | Người → persons |
| place_id | uuid | Không | Nơi an táng → places |
| locator | text | Có | Khu/lô restricted |
| source_id | uuid | Có | Nguồn → sources |
| visibility | text | Không | Scope |


## event_rules — Quy tắc ngày giỗ/sự kiện là nguồn thật
| Trường | SQL type | Null | Ý nghĩa / FK |
|---|---|---|---|
| id | uuid | Không | Canonical UUID |
| tree_id | uuid | Không | Bắt buộc cô lập tree → trees |
| version | bigint | Không | Optimistic locking |
| created_at | timestamptz | Không | Thời điểm ghi UTC |
| updated_at | timestamptz | Không | Thời điểm cập nhật UTC |
| created_by | uuid | Có | Actor; không suy từ payload → auth.users |
| title | text | Không | Tên sự kiện |
| kind | text | Không | Giỗ/họp/khuyến học/khác |
| person_id | uuid | Có | Nếu liên quan người → persons |
| source_date | jsonb | Không | Ngày nguồn, có precision |
| recurrence | text | Không | Kiểu lặp |
| leap_policy | text | Không | Theo gia đình |
| short_month_policy | text | Không | Ngày 30 không tồn tại |
| timezone | text | Không | Zone nguồn |
| review_status | text | Không | Không gửi nếu chưa duyệt |
| place_id | uuid | Có | Địa điểm → places |
| visibility | text | Không | Scope |


## event_occurrences — Cache lần diễn ra, không thay ngày nguồn
| Trường | SQL type | Null | Ý nghĩa / FK |
|---|---|---|---|
| id | uuid | Không | Canonical UUID |
| tree_id | uuid | Không | Bắt buộc cô lập tree → trees |
| version | bigint | Không | Optimistic locking |
| created_at | timestamptz | Không | Thời điểm ghi UTC |
| updated_at | timestamptz | Không | Thời điểm cập nhật UTC |
| created_by | uuid | Có | Actor; không suy từ payload → auth.users |
| rule_id | uuid | Không | Rule → event_rules |
| logical_key | text | Không | Giữ ổn định qua sửa lịch |
| rule_version | bigint | Không | Phiên bản nguồn |
| algorithm_version | text | Không | Adapter/calculation version |
| occurs_on | date | Không | Ngày dương địa phương |
| starts_at | timestamptz | Có | Giờ nếu có |
| ends_at | timestamptz | Có | Giờ kết thúc |
| override_reason | text | Có | Override cần reviewer |
| status | text | Không | Trạng thái |

UNIQUE: (tree_id, rule_id, logical_key).


## event_rsvps — RSVP private
| Trường | SQL type | Null | Ý nghĩa / FK |
|---|---|---|---|
| id | uuid | Không | Canonical UUID |
| tree_id | uuid | Không | Bắt buộc cô lập tree → trees |
| version | bigint | Không | Optimistic locking |
| created_at | timestamptz | Không | Thời điểm ghi UTC |
| updated_at | timestamptz | Không | Thời điểm cập nhật UTC |
| created_by | uuid | Có | Actor; không suy từ payload → auth.users |
| occurrence_id | uuid | Không | Event → event_occurrences |
| membership_id | uuid | Không | Người RSVP → memberships |
| response | text | Không | Lựa chọn |
| headcount | integer | Không | Người đi cùng tính theo quy định |
| note | text | Có | Ghi chú restricted |

CHECK: headcount BETWEEN 0 AND 20.

UNIQUE: (tree_id, occurrence_id, membership_id).


## proposals — Đề nghị thay đổi
| Trường | SQL type | Null | Ý nghĩa / FK |
|---|---|---|---|
| id | uuid | Không | Canonical UUID |
| tree_id | uuid | Không | Bắt buộc cô lập tree → trees |
| version | bigint | Không | Optimistic locking |
| created_at | timestamptz | Không | Thời điểm ghi UTC |
| updated_at | timestamptz | Không | Thời điểm cập nhật UTC |
| created_by | uuid | Có | Actor; không suy từ payload → auth.users |
| kind | text | Không | Loại thay đổi |
| status | text | Không | Lifecycle |
| submitted_by | uuid | Không | Actor thật → auth.users |
| branch_id | uuid | Có | Phạm vi review → branches |
| reason | text | Có | Lý do |
| base_snapshot_hash | text | Có | Diff snapshot hash |
| submitted_at | timestamptz | Có | Thời điểm submit |


## proposal_items — Lệnh thay đổi typed; target integrity ở apply transaction
| Trường | SQL type | Null | Ý nghĩa / FK |
|---|---|---|---|
| id | uuid | Không | Canonical UUID |
| tree_id | uuid | Không | Bắt buộc cô lập tree → trees |
| version | bigint | Không | Optimistic locking |
| created_at | timestamptz | Không | Thời điểm ghi UTC |
| updated_at | timestamptz | Không | Thời điểm cập nhật UTC |
| created_by | uuid | Có | Actor; không suy từ payload → auth.users |
| proposal_id | uuid | Không | Proposal → proposals |
| target_kind | text | Không | Typed allowlist |
| target_id | uuid | Có | Existing hoặc planned ID theo schema |
| base_version | bigint | Có | Optimistic lock |
| patch | jsonb | Không | Typed commands, không raw SQL |
| source_ids | jsonb | Không | Citation/source staging |


## review_decisions — Review history
| Trường | SQL type | Null | Ý nghĩa / FK |
|---|---|---|---|
| id | uuid | Không | Canonical UUID |
| tree_id | uuid | Không | Bắt buộc cô lập tree → trees |
| version | bigint | Không | Optimistic locking |
| created_at | timestamptz | Không | Thời điểm ghi UTC |
| updated_at | timestamptz | Không | Thời điểm cập nhật UTC |
| created_by | uuid | Có | Actor; không suy từ payload → auth.users |
| proposal_id | uuid | Không | Proposal → proposals |
| reviewer_id | uuid | Không | Reviewer thật → auth.users |
| decision | text | Không | Decision |
| reason | text | Có | Lý do |
| applied_version | bigint | Có | Version sau apply |


## audit_events — Audit append-only, retention riêng
| Trường | SQL type | Null | Ý nghĩa / FK |
|---|---|---|---|
| id | uuid | Không | Canonical UUID |
| tree_id | uuid | Không | Bắt buộc cô lập tree → trees |
| version | bigint | Không | Optimistic locking |
| created_at | timestamptz | Không | Thời điểm ghi UTC |
| updated_at | timestamptz | Không | Thời điểm cập nhật UTC |
| created_by | uuid | Có | Actor; không suy từ payload → auth.users |
| actor_id | uuid | Có | Actor hoặc null system → auth.users |
| action | text | Không | Action allowlist |
| resource_kind | text | Không | Type |
| resource_id | uuid | Có | ID, không PII |
| before_version | bigint | Có | Version |
| after_version | bigint | Có | Version |
| redacted_diff | jsonb | Có | Không lưu secret/PII dư thừa |
| request_id | uuid | Có | Correlation |
| reason | text | Có | Lý do |


## import_jobs — Import staged và idempotent
| Trường | SQL type | Null | Ý nghĩa / FK |
|---|---|---|---|
| id | uuid | Không | Canonical UUID |
| tree_id | uuid | Không | Bắt buộc cô lập tree → trees |
| version | bigint | Không | Optimistic locking |
| created_at | timestamptz | Không | Thời điểm ghi UTC |
| updated_at | timestamptz | Không | Thời điểm cập nhật UTC |
| created_by | uuid | Có | Actor; không suy từ payload → auth.users |
| source_asset_id | uuid | Không | Original → media_assets |
| file_sha256 | text | Không | Nguồn immutable |
| mapping_version | text | Không | Mapping version |
| parser_version | text | Không | Parser version |
| status | text | Không | Progress state |
| approval_hash | text | Có | H5/scope hash |
| counters | jsonb | Không | Processed/succeeded/failed/skipped |
| manifest | jsonb | Không | Applied chunks and warnings |

UNIQUE: (tree_id, file_sha256, mapping_version).


## import_rows — Rows staging không tự canonical
| Trường | SQL type | Null | Ý nghĩa / FK |
|---|---|---|---|
| id | uuid | Không | Canonical UUID |
| tree_id | uuid | Không | Bắt buộc cô lập tree → trees |
| version | bigint | Không | Optimistic locking |
| created_at | timestamptz | Không | Thời điểm ghi UTC |
| updated_at | timestamptz | Không | Thời điểm cập nhật UTC |
| created_by | uuid | Có | Actor; không suy từ payload → auth.users |
| job_id | uuid | Không | Job → import_jobs |
| row_number | integer | Không | Source position |
| external_id | text | Có | Source ID |
| raw_payload | jsonb | Có | Private original record |
| normalized | jsonb | Có | Typed staging |
| status | text | Không | Row state |
| errors | jsonb | Không | Errors sans extra PII |

UNIQUE: (tree_id, job_id, row_number).


## external_id_map — Map chống nhập trùng
| Trường | SQL type | Null | Ý nghĩa / FK |
|---|---|---|---|
| id | uuid | Không | Canonical UUID |
| tree_id | uuid | Không | Bắt buộc cô lập tree → trees |
| version | bigint | Không | Optimistic locking |
| created_at | timestamptz | Không | Thời điểm ghi UTC |
| updated_at | timestamptz | Không | Thời điểm cập nhật UTC |
| created_by | uuid | Có | Actor; không suy từ payload → auth.users |
| source_namespace | text | Không | File/dataset namespace |
| external_id | text | Không | Source key |
| entity_kind | text | Không | Type |
| canonical_id | uuid | Không | Canonical mapping |

UNIQUE: (tree_id, source_namespace, external_id, entity_kind).


## merge_operations — Merge with manifest
| Trường | SQL type | Null | Ý nghĩa / FK |
|---|---|---|---|
| id | uuid | Không | Canonical UUID |
| tree_id | uuid | Không | Bắt buộc cô lập tree → trees |
| version | bigint | Không | Optimistic locking |
| created_at | timestamptz | Không | Thời điểm ghi UTC |
| updated_at | timestamptz | Không | Thời điểm cập nhật UTC |
| created_by | uuid | Có | Actor; không suy từ payload → auth.users |
| survivor_id | uuid | Không | Person sống sót → persons |
| loser_id | uuid | Không | Redirect person → persons |
| proposal_id | uuid | Không | Approval → proposals |
| manifest | jsonb | Không | All references before/after |
| status | text | Không | applied/compensated |
| compensated_by_id | uuid | Có | Operation bù → merge_operations |

CHECK: survivor_id <> loser_id.


## notification_preferences — Preferences
| Trường | SQL type | Null | Ý nghĩa / FK |
|---|---|---|---|
| id | uuid | Không | Canonical UUID |
| tree_id | uuid | Không | Bắt buộc cô lập tree → trees |
| version | bigint | Không | Optimistic locking |
| created_at | timestamptz | Không | Thời điểm ghi UTC |
| updated_at | timestamptz | Không | Thời điểm cập nhật UTC |
| created_by | uuid | Có | Actor; không suy từ payload → auth.users |
| membership_id | uuid | Không | Người nhận → memberships |
| channel | text | Không | email/in_app |
| event_kind | text | Không | Loại notification |
| enabled | boolean | Không | Opt-in |
| settings | jsonb | Không | Hour/lead days schema |

UNIQUE: (tree_id, membership_id, channel, event_kind).


## notifications — Không lưu snapshot tên private không cần thiết
| Trường | SQL type | Null | Ý nghĩa / FK |
|---|---|---|---|
| id | uuid | Không | Canonical UUID |
| tree_id | uuid | Không | Bắt buộc cô lập tree → trees |
| version | bigint | Không | Optimistic locking |
| created_at | timestamptz | Không | Thời điểm ghi UTC |
| updated_at | timestamptz | Không | Thời điểm cập nhật UTC |
| created_by | uuid | Có | Actor; không suy từ payload → auth.users |
| membership_id | uuid | Không | Người nhận → memberships |
| kind | text | Không | Loại |
| resource_kind | text | Không | Type |
| resource_id | uuid | Không | Resource to re-authorize |
| dedupe_key | text | Không | Business idempotency |
| read_at | timestamptz | Có | Đã đọc |
| expires_at | timestamptz | Có | Retention |

UNIQUE: (tree_id, membership_id, dedupe_key).


## delivery_attempts — Delivery audit
| Trường | SQL type | Null | Ý nghĩa / FK |
|---|---|---|---|
| id | uuid | Không | Canonical UUID |
| tree_id | uuid | Không | Bắt buộc cô lập tree → trees |
| version | bigint | Không | Optimistic locking |
| created_at | timestamptz | Không | Thời điểm ghi UTC |
| updated_at | timestamptz | Không | Thời điểm cập nhật UTC |
| created_by | uuid | Có | Actor; không suy từ payload → auth.users |
| notification_id | uuid | Không | Notification → notifications |
| channel | text | Không | Provider channel |
| status | text | Không | queued/accepted/sent/failed/suppressed |
| provider_message_id | text | Có | Reconciliation |
| idempotency_key | text | Không | Provider business key |
| attempt_count | integer | Không | Retry count |
| last_error_code | text | Có | No raw provider payload |


## outbox — Transactional outbox
| Trường | SQL type | Null | Ý nghĩa / FK |
|---|---|---|---|
| id | uuid | Không | Canonical UUID |
| tree_id | uuid | Không | Bắt buộc cô lập tree → trees |
| version | bigint | Không | Optimistic locking |
| created_at | timestamptz | Không | Thời điểm ghi UTC |
| updated_at | timestamptz | Không | Thời điểm cập nhật UTC |
| created_by | uuid | Có | Actor; không suy từ payload → auth.users |
| event_type | text | Không | Allowlisted event |
| resource_kind | text | Không | Type |
| resource_id | uuid | Không | No sensitive body |
| resource_version | bigint | Có | Version |
| dedupe_key | text | Không | Unique event key |
| requested_by | uuid | Có | Server assigned → auth.users |
| status | text | Không | pending/published/failed |
| available_at | timestamptz | Không | Due |

UNIQUE: (tree_id, dedupe_key).


## funds — Quỹ nội bộ
| Trường | SQL type | Null | Ý nghĩa / FK |
|---|---|---|---|
| id | uuid | Không | Canonical UUID |
| tree_id | uuid | Không | Bắt buộc cô lập tree → trees |
| version | bigint | Không | Optimistic locking |
| created_at | timestamptz | Không | Thời điểm ghi UTC |
| updated_at | timestamptz | Không | Thời điểm cập nhật UTC |
| created_by | uuid | Có | Actor; không suy từ payload → auth.users |
| name | text | Không | Tên quỹ |
| currency | text | Không | VND only |
| closed_through | date | Có | Kỳ đã khóa |
| visibility | text | Không | Report scope |


## fund_accounts — Tài khoản sổ
| Trường | SQL type | Null | Ý nghĩa / FK |
|---|---|---|---|
| id | uuid | Không | Canonical UUID |
| tree_id | uuid | Không | Bắt buộc cô lập tree → trees |
| version | bigint | Không | Optimistic locking |
| created_at | timestamptz | Không | Thời điểm ghi UTC |
| updated_at | timestamptz | Không | Thời điểm cập nhật UTC |
| created_by | uuid | Có | Actor; không suy từ payload → auth.users |
| fund_id | uuid | Không | Quỹ → funds |
| code | text | Không | Account code |
| kind | text | Không | Loại tài khoản sổ |
| name | text | Không | Tên dễ hiểu |

UNIQUE: (tree_id, fund_id, code); (tree_id, fund_id, id).


## journal_entries — Ledger entries immutable when posted
| Trường | SQL type | Null | Ý nghĩa / FK |
|---|---|---|---|
| id | uuid | Không | Canonical UUID |
| tree_id | uuid | Không | Bắt buộc cô lập tree → trees |
| version | bigint | Không | Optimistic locking |
| created_at | timestamptz | Không | Thời điểm ghi UTC |
| updated_at | timestamptz | Không | Thời điểm cập nhật UTC |
| created_by | uuid | Có | Actor; không suy từ payload → auth.users |
| fund_id | uuid | Không | Quỹ → funds |
| code | text | Không | Mã phiếu |
| entry_date | date | Không | Ngày phiếu |
| description | text | Không | Nội dung |
| status | text | Không | Workflow |
| submitted_by | uuid | Không | Tác giả → auth.users |
| approved_by | uuid | Có | Khác tác giả → auth.users |
| posted_at | timestamptz | Có | Bất biến sau post |
| reverses_entry_id | uuid | Có | Phiếu đảo → journal_entries |
| proof_asset_id | uuid | Có | Chứng từ private → media_assets |
| donor_person_id | uuid | Có | Thông tin riêng tư → persons |

CHECK: approved_by IS NULL OR approved_by <> submitted_by; reverses_entry_id IS NULL OR reverses_entry_id <> id.

UNIQUE: (tree_id, code); (tree_id, fund_id, id).


## journal_lines — Lines must balance at posting; trigger/RPC required
| Trường | SQL type | Null | Ý nghĩa / FK |
|---|---|---|---|
| id | uuid | Không | Canonical UUID |
| tree_id | uuid | Không | Bắt buộc cô lập tree → trees |
| version | bigint | Không | Optimistic locking |
| created_at | timestamptz | Không | Thời điểm ghi UTC |
| updated_at | timestamptz | Không | Thời điểm cập nhật UTC |
| created_by | uuid | Có | Actor; không suy từ payload → auth.users |
| fund_id | uuid | Không | Same fund across entry/account → funds |
| entry_id | uuid | Không | Journal → journal_entries |
| account_id | uuid | Không | Account → fund_accounts |
| signed_amount_vnd | bigint | Không | Debit positive, credit negative |

CHECK: signed_amount_vnd <> 0.


## scholarship_programs — Chương trình khuyến học
| Trường | SQL type | Null | Ý nghĩa / FK |
|---|---|---|---|
| id | uuid | Không | Canonical UUID |
| tree_id | uuid | Không | Bắt buộc cô lập tree → trees |
| version | bigint | Không | Optimistic locking |
| created_at | timestamptz | Không | Thời điểm ghi UTC |
| updated_at | timestamptz | Không | Thời điểm cập nhật UTC |
| created_by | uuid | Có | Actor; không suy từ payload → auth.users |
| fund_id | uuid | Không | Quỹ tài trợ → funds |
| title | text | Không | Chương trình |
| criteria | jsonb | Không | Tiêu chí có schema |
| closes_at | timestamptz | Có | Deadline |
| status | text | Không | draft/open/closed/archived |


## scholarship_applications — Ứng viên/thành tích restricted
| Trường | SQL type | Null | Ý nghĩa / FK |
|---|---|---|---|
| id | uuid | Không | Canonical UUID |
| tree_id | uuid | Không | Bắt buộc cô lập tree → trees |
| version | bigint | Không | Optimistic locking |
| created_at | timestamptz | Không | Thời điểm ghi UTC |
| updated_at | timestamptz | Không | Thời điểm cập nhật UTC |
| created_by | uuid | Có | Actor; không suy từ payload → auth.users |
| program_id | uuid | Không | Program → scholarship_programs |
| person_id | uuid | Không | Ứng viên → persons |
| submitted_by | uuid | Không | Người đề cử → auth.users |
| status | text | Không | Workflow |
| statement | text | Có | Restricted |
| evidence_asset_id | uuid | Có | Private proof → media_assets |

UNIQUE: (tree_id, program_id, person_id).


## scholarship_awards — Award không tự đồng nghĩa paid
| Trường | SQL type | Null | Ý nghĩa / FK |
|---|---|---|---|
| id | uuid | Không | Canonical UUID |
| tree_id | uuid | Không | Bắt buộc cô lập tree → trees |
| version | bigint | Không | Optimistic locking |
| created_at | timestamptz | Không | Thời điểm ghi UTC |
| updated_at | timestamptz | Không | Thời điểm cập nhật UTC |
| created_by | uuid | Có | Actor; không suy từ payload → auth.users |
| application_id | uuid | Không | Application → scholarship_applications |
| amount_vnd | bigint | Không | Số tiền integer |
| approved_by | uuid | Không | Reviewer → auth.users |
| paid_journal_entry_id | uuid | Có | Chỉ khi posted → journal_entries |
| status | text | Không | approved/paid/reversed/withdrawn |

CHECK: amount_vnd > 0.

UNIQUE: (tree_id, application_id).


## consent_records — Consent granular, không là checkbox global
| Trường | SQL type | Null | Ý nghĩa / FK |
|---|---|---|---|
| id | uuid | Không | Canonical UUID |
| tree_id | uuid | Không | Bắt buộc cô lập tree → trees |
| version | bigint | Không | Optimistic locking |
| created_at | timestamptz | Không | Thời điểm ghi UTC |
| updated_at | timestamptz | Không | Thời điểm cập nhật UTC |
| created_by | uuid | Có | Actor; không suy từ payload → auth.users |
| person_id | uuid | Không | Data subject → persons |
| audience | text | Không | Purpose/audience |
| field_groups | jsonb | Không | Nhóm field được cho phép |
| purpose | text | Không | Mục đích |
| evidence_asset_id | uuid | Có | Bằng chứng có quyền → media_assets |
| representative_person_id | uuid | Có | Nếu cần người đại diện → persons |
| effective_at | timestamptz | Không | Hiệu lực |
| expires_at | timestamptz | Có | Tùy policy |
| withdrawn_at | timestamptz | Có | Thu hồi |


## privacy_requests — Quyền dữ liệu và xử lý yêu cầu
| Trường | SQL type | Null | Ý nghĩa / FK |
|---|---|---|---|
| id | uuid | Không | Canonical UUID |
| tree_id | uuid | Không | Bắt buộc cô lập tree → trees |
| version | bigint | Không | Optimistic locking |
| created_at | timestamptz | Không | Thời điểm ghi UTC |
| updated_at | timestamptz | Không | Thời điểm cập nhật UTC |
| created_by | uuid | Có | Actor; không suy từ payload → auth.users |
| person_id | uuid | Có | Subject → persons |
| kind | text | Không | access/correction/restrict/erase |
| status | text | Không | Workflow |
| verification_state | text | Không | Không đòi dư giấy tờ |
| manifest | jsonb | Không | Affected resources/actions |
| completed_at | timestamptz | Có | Kết quả |


## export_jobs — Export có quyền lúc tạo/chạy/tải
| Trường | SQL type | Null | Ý nghĩa / FK |
|---|---|---|---|
| id | uuid | Không | Canonical UUID |
| tree_id | uuid | Không | Bắt buộc cô lập tree → trees |
| version | bigint | Không | Optimistic locking |
| created_at | timestamptz | Không | Thời điểm ghi UTC |
| updated_at | timestamptz | Không | Thời điểm cập nhật UTC |
| created_by | uuid | Có | Actor; không suy từ payload → auth.users |
| requested_by | uuid | Không | Actor thật → auth.users |
| purpose | text | Không | Private request reason, excluded from job DTO |
| audience | text | Không | self/members/public; self requires approved personal scope |
| include_media | boolean | Không | Private media packaging request, not proof of an artifact |
| format | text | Không | json/csv/gedcom_551/gedcom_7/pdf/svg; API uses canonical_json/book_pdf |
| scope | jsonb | Không | Allowlisted scope |
| policy_version | bigint | Không | Recheck current |
| status | text | Không | queued/running/complete/failed/cancelled |
| result_asset_id | uuid | Có | Private output → media_assets |
| expires_at | timestamptz | Không | TTL |
| warnings | jsonb | Không | Loss report |


## retention_jobs — Purge/retention, không xóa bừa
| Trường | SQL type | Null | Ý nghĩa / FK |
|---|---|---|---|
| id | uuid | Không | Canonical UUID |
| tree_id | uuid | Không | Bắt buộc cô lập tree → trees |
| version | bigint | Không | Optimistic locking |
| created_at | timestamptz | Không | Thời điểm ghi UTC |
| updated_at | timestamptz | Không | Thời điểm cập nhật UTC |
| created_by | uuid | Có | Actor; không suy từ payload → auth.users |
| policy_id | text | Không | Policy/version |
| cutoff_at | timestamptz | Không | Cutoff |
| manifest | jsonb | Không | Objects/records + tombstones |
| status | text | Không | planned/approved/running/completed/failed |
| approved_by | uuid | Có | Approval → auth.users |


## idempotency_records — Mutation dedupe
| Trường | SQL type | Null | Ý nghĩa / FK |
|---|---|---|---|
| id | uuid | Không | Canonical UUID |
| tree_id | uuid | Không | Bắt buộc cô lập tree → trees |
| version | bigint | Không | Optimistic locking |
| created_at | timestamptz | Không | Thời điểm ghi UTC |
| updated_at | timestamptz | Không | Thời điểm cập nhật UTC |
| created_by | uuid | Có | Actor; không suy từ payload → auth.users |
| actor_id | uuid | Không | Requester → auth.users |
| operation | text | Không | Operation scope |
| key | text | Không | Client UUID |
| request_hash | text | Không | Hash canonical body |
| result | jsonb | Có | Allowlisted stored outcome |
| expires_at | timestamptz | Không | TTL |

UNIQUE: (tree_id, actor_id, operation, key).


