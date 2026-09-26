# 25. Nguồn tham khảo và cách sử dụng

Ngày tra cứu: **26/09/2026**. Đây là nguồn chính thức của nhà cung cấp/chuẩn hoặc repository của tác giả. Các lựa chọn kiến trúc, thiết kế, budget và quy trình trong bộ hồ sơ là đề xuất của dự án; không phải nội dung đã có sẵn trong những sản phẩm được tham khảo.

| ID | Nguồn | URL | Dùng cho |
|---|---|---|---|
| S01 | Gramps Web — User Guide / Features | https://www.grampsweb.org/user-guide/ ; https://www.grampsweb.org/features/ | Module gia phả, sources, reports, collaboration |
| S02 | webtrees — Features | https://webtrees.net/features/ | Người/gia đình/cây/tư liệu/tìm kiếm và calendar |
| S03 | webtrees — Privacy | https://webtrees.net/user/privacy/ | Tham khảo bảo vệ living/unknown và quyền chi tiết; không sao chép public defaults |
| S04 | Next.js 16.3 / Next.js 16 | https://nextjs.org/blog/next-16-3 ; https://nextjs.org/blog/next-16 | Nhánh phát hành, App Router và proxy.ts; patch phải kiểm tra lại |
| S05 | Node.js releases | https://nodejs.org/en/about/previous-releases | Node 24 LTS; production dùng nhánh còn hỗ trợ |
| S06 | Supabase Database | https://supabase.com/docs/guides/database/overview | PostgreSQL, Auth/Storage và ranh giới hệ thống |
| S07 | Supabase SSR / advanced auth / getClaims | https://supabase.com/docs/guides/auth/server-side/advanced-guide ; https://supabase.com/docs/guides/auth/server-side/creating-a-client?queryGroups=framework&framework=nextjs ; https://supabase.com/docs/reference/javascript/auth-getclaims | Cookie refresh, session, getClaims/getUser, tránh cache chéo người |
| S08 | Supabase RLS / API security | https://supabase.com/docs/guides/database/postgres/row-level-security ; https://supabase.com/docs/guides/api/securing-your-api | Grants, RLS, SECURITY DEFINER, exposed schemas |
| S09 | Supabase Backups | https://supabase.com/docs/guides/platform/backups | DB backup không bao gồm object bytes; restore và role passwords |
| S10 | React Flow — Performance | https://reactflow.dev/learn/advanced-use/performance | Memoization, graph giới hạn, collapse branches |
| S11 | React Flow — Accessibility | https://reactflow.dev/learn/advanced-use/accessibility | Keyboard, screen reader, localization |
| S12 | FamilySearch GEDCOM 7 specification | https://gedcom.io/specifications/FamilySearchGEDCOMv7.html | Format, dates, relationships, sources, extension |
| S13 | Supabase local development | https://supabase.com/docs/guides/local-development ; https://supabase.com/docs/guides/local-development/cli/getting-started | Local stack, Docker/CLI, network binding |
| S14 | pg-boss repository | https://github.com/timgit/pg-boss | PostgreSQL job queue, compatibility, transactional jobs |
| S15 | GEDCOM specifications index | https://gedcom.io/specs/ | Tra bản 5.5.1/7 và tài liệu conformance trước viết adapter |
| S16 | @dqcai/vn-lunar — repository tác giả | https://github.com/cuongdqpayment/dqcai-vn-lunar | Ứng viên adapter lịch Việt; phải kiểm chứng, không nhận tuyên bố accuracy như bảo đảm |
| S17 | Tailwind CSS — Theme variables | https://tailwindcss.com/docs/theme | Theme tokens CSS-first |
| S18 | W3C WCAG 2.2 — Contrast minimum | https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html | Contrast text thường 4.5:1, chữ lớn 3:1 |
| S19 | W3C WCAG 2.2 — Target size minimum | https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html | Mức AA 24px; dự án chọn 44–48px là tiêu chuẩn nội bộ |
| S20 | Google web.dev — Core Web Vitals | https://web.dev/articles/vitals ; https://web.dev/articles/defining-core-web-vitals-thresholds | LCP/INP/CLS và p75, phân biệt lab/field |
| S21 | Playwright — Emulation | https://playwright.dev/docs/emulation | Viewport/touch/locale/timezone; emulation không thay real device |
| S22 | OWASP ASVS | https://owasp.org/projects/asvs | Checklist phát triển/kiểm thử bảo mật, bản stable được tra 5.0.0 |
| S23 | Supabase Pricing | https://supabase.com/pricing ; https://supabase.com/pricing.md | Mức nền và compute riêng project; tham khảo dự toán |
| S24 | Google Fonts — Noto Serif | https://fonts.google.com/noto/specimen/Noto+Serif | Nhận diện font; agent kiểm tra Noto Sans/Serif license/subsets khi build |
| S25 | Cloudflare R2 Pricing | https://developers.cloudflare.com/r2/pricing/ | Storage/operations cho bản sao lưu; không phải báo giá cố định |
| S26 | Chính phủ — Luật 91/2025/QH15 | https://vanban.chinhphu.vn/?classid=1&docid=214590&pageid=27160 | Metadata luật, ngày hiệu lực 01/01/2026; không thay rà soát nghĩa vụ triển khai |
| S27 | Railway Pricing | https://railway.com/pricing | Minimum usage/usage billing; agent xác nhận cấu hình và giá tại H2 |
| S28 | Resend Pricing | https://resend.com/pricing | Email quota/giá nền và giới hạn ngày |

## Quy tắc nguồn

Không dùng blog không rõ tác giả làm nguồn chuẩn cho auth/RLS/date semantics. Không đưa tutorial public-open RLS vào sản phẩm có dữ liệu gia đình. Không sao chép tuyên bố “100% accurate” từ thư viện làm tiêu chí nghiệm thu. Nguồn tham khảo không thay số đo trên build thực.

Các URL về thuật toán âm lịch lịch sử có thể thay đổi/không truy cập được; bộ hồ sơ không giả nhận đã kiểm chứng toàn bộ thuật toán từ trang không mở được. Agent phải lưu nguồn golden dates và bằng chứng license/API thực tế khi chốt adapter.
