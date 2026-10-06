"use client";

import Link from "next/link";
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { exportCancelFormSchema, exportContextSchema, exportDraftFormSchema, exportDraftSchema, exportJobSchema, exportProjectionSchema, exportRequestSchema, idempotencyKeySchema, type ExportCancelFormOutput, type ExportDraft, type ExportDraftFormInput, type ExportDraftFormOutput, type ExportJob, type ExportRequest } from "@phan/contracts";

const formatLabels: Record<ExportRequest["format"], string> = {
  canonical_json: "JSON — dữ liệu theo scope", csv: "CSV — danh sách hồ sơ", gedcom_551: "GEDCOM 5.5.1 — subset",
  gedcom_7: "GEDCOM 7 — subset", book_pdf: "PDF — sách gia phả", svg: "SVG — phả đồ",
};
const statusLabels: Record<ExportJob["status"], string> = {
  queued: "Đã lưu · Chờ xử lý", running: "Đang xử lý", complete: "Đã hoàn tất", failed: "Xử lý chưa thành công", cancelled: "Đã hủy",
};
const draftStorageKey = "pgp-export-draft-v1";
const draftLifetimeMs = 15 * 60 * 1000;

function bookmark(id: string) {
  const url = new URL(window.location.href); url.searchParams.set("job", id); window.history.replaceState(null, "", url);
}

async function responseData(response: Response): Promise<unknown> {
  const body: unknown = await response.json();
  if (!body || typeof body !== "object" || !("data" in body)) throw new Error("Phản hồi máy chủ không hợp lệ.");
  const envelope = body as { data: unknown; meta?: { requestId?: unknown } };
  if (!response.ok) {
    const detail = envelope.data && typeof envelope.data === "object" && "message" in envelope.data ? envelope.data.message : null;
    const requestId = typeof envelope.meta?.requestId === "string" ? ` Mã yêu cầu: ${envelope.meta.requestId}.` : "";
    throw new Error(`${typeof detail === "string" ? detail : "Chưa thể hoàn tất thao tác."}${requestId}`);
  }
  return envelope.data;
}

export function ExportWorkspace() {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: {
    queries: { retry: false, staleTime: 0, gcTime: 0, refetchOnWindowFocus: false },
    mutations: { retry: false, gcTime: 0 },
  } }));
  useEffect(() => () => queryClient.clear(), [queryClient]);
  return <QueryClientProvider client={queryClient}><ExportWorkflow /></QueryClientProvider>;
}

function ExportCancelForm({ job, pending, onCancel }: { job: ExportJob; pending: boolean; onCancel: (reason: ExportCancelFormOutput) => Promise<void> }) {
  const { register, handleSubmit, formState: { errors } } = useForm<ExportCancelFormOutput>({ resolver: zodResolver(exportCancelFormSchema), defaultValues: { reason: "" } });
  return <form className="import-form" onSubmit={handleSubmit(onCancel)}><label htmlFor="export-cancel-reason">Lý do hủy yêu cầu xuất</label>
    <input id="export-cancel-reason" minLength={5} maxLength={1000} required disabled={pending} aria-invalid={errors.reason ? "true" : "false"} aria-describedby={errors.reason ? "export-cancel-error" : undefined} {...register("reason")} />
    {errors.reason?.message && <p id="export-cancel-error" className="form-error" role="alert">{errors.reason.message}</p>}
    <button className="button-secondary" disabled={pending}>{pending ? "Đang hủy…" : "Hủy yêu cầu xuất · v" + job.version}</button></form>;
}

function ExportWorkflow() {
  const queryClient = useQueryClient();
  const [scopeIndex, setScopeIndex] = useState(0);
  const [jobId, setJobId] = useState("");
  const [previewEnabled, setPreviewEnabled] = useState(false);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [draftNotice, setDraftNotice] = useState("");
  const hydratedActor = useRef("");
  const { register, control, reset, handleSubmit, formState: { errors: formErrors } } = useForm<ExportDraftFormInput, undefined, ExportDraftFormOutput>({
    resolver: zodResolver(exportDraftFormSchema), mode: "onBlur", defaultValues: { format: "canonical_json", audience: "members", includeMedia: false, reason: "" },
  });
  const draftFormat = useWatch({ control, name: "format" });
  const draftAudience = useWatch({ control, name: "audience" });
  const draftIncludeMedia = useWatch({ control, name: "includeMedia" });
  const draftReason = useWatch({ control, name: "reason" });
  const contextQuery = useQuery({
    queryKey: ["m16-export-context"],
    queryFn: async ({ signal }) => exportContextSchema.parse(await responseData(await fetch("/api/v1/exports", { cache: "no-store", signal }))),
  });
  const context = contextQuery.isError ? null : contextQuery.data ?? null;
  const jobQuery = useQuery({
    queryKey: ["m16-export-job", jobId], enabled: Boolean(jobId),
    queryFn: async ({ signal }) => exportJobSchema.parse(await responseData(await fetch("/api/v1/exports/" + jobId, { cache: "no-store", signal }))),
    refetchInterval: (query) => ["queued", "running"].includes(query.state.data?.status ?? "") ? 3_000 : false,
  });
  const job = jobQuery.isError ? null : jobQuery.data ?? null;
  const previewQuery = useQuery({
    queryKey: ["m16-export-preview", jobId], enabled: previewEnabled && Boolean(jobId),
    queryFn: async ({ signal }) => exportProjectionSchema.parse(await responseData(await fetch("/api/v1/exports/" + jobId + "/preview", { cache: "no-store", signal }))),
  });
  const projection = previewQuery.isError ? null : previewQuery.data ?? null;
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const requestKey = useRef<{ signature: string; key: string } | null>(null);
  const cancelKey = useRef<{ signature: string; key: string } | null>(null);
  const choice = context?.scopes[scopeIndex];

  const createMutation = useMutation({
    mutationFn: async ({ input, key, csrfToken }: { input: ExportRequest; key: string; csrfToken: string }) =>
      exportJobSchema.parse(await responseData(await fetch("/api/v1/exports", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken, "Idempotency-Key": key }, body: JSON.stringify(input) }))),
    onSuccess: (result) => { queryClient.setQueryData(["m16-export-job", result.id], result); void queryClient.invalidateQueries({ queryKey: ["m16-export-context"] }); },
  });
  const cancelMutation = useMutation({
    mutationFn: async ({ id, body, key, csrfToken }: { id: string; body: { baseVersion: number; reason: string }; key: string; csrfToken: string }) =>
      exportJobSchema.parse(await responseData(await fetch("/api/v1/exports/" + id + "/cancel", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken, "Idempotency-Key": key }, body: JSON.stringify(body) }))),
    onSuccess: (result, variables) => { queryClient.setQueryData(["m16-export-job", variables.id], result); void queryClient.removeQueries({ queryKey: ["m16-export-preview", variables.id] }); void queryClient.invalidateQueries({ queryKey: ["m16-export-context"] }); },
  });
  const refreshContext = useCallback(async () => {
    const result = await contextQuery.refetch({ throwOnError: true });
    if (!result.data) throw new Error("Chưa tải được phạm vi xuất.");
    return result.data;
  }, [contextQuery]);
  const loadJob = useCallback(async (id: string) => {
    const parsed = idempotencyKeySchema.parse(id);
    setPreviewEnabled(false);
    const result = await queryClient.fetchQuery({
      queryKey: ["m16-export-job", parsed], staleTime: 0,
      queryFn: async ({ signal }) => exportJobSchema.parse(await responseData(await fetch("/api/v1/exports/" + parsed, { cache: "no-store", signal }))),
    });
    setJobId(parsed); bookmark(parsed); return result;
  }, [queryClient]);
  useEffect(() => {
    if (!contextQuery.isFetched || jobId || contextQuery.error) return;
    const id = new URL(window.location.href).searchParams.get("job");
    if (!id) return;
    const timeout = window.setTimeout(() => {
      void loadJob(id).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Chưa tải được trạng thái bản xuất."));
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [contextQuery.dataUpdatedAt, contextQuery.error, contextQuery.isFetched, jobId, loadJob]);

  useEffect(() => {
    if (!context || hydratedActor.current === context.actorId) return;
    const currentContext = context;
    const timeout = window.setTimeout(() => {
      hydratedActor.current = currentContext.actorId;
      try {
        const raw = sessionStorage.getItem(draftStorageKey);
        if (!raw) { setDraftHydrated(true); return; }
        const parsed = exportDraftSchema.safeParse(JSON.parse(raw) as unknown);
        if (!parsed.success || Date.now() - parsed.data.savedAt > draftLifetimeMs || parsed.data.savedAt > Date.now() + 60_000 || parsed.data.actorId !== currentContext.actorId) {
          sessionStorage.removeItem(draftStorageKey); setDraftHydrated(true); return;
        }
        const index = currentContext.scopes.findIndex((scope) => scope.treeId === parsed.data.treeId && JSON.stringify(scope.scope) === JSON.stringify(parsed.data.scope));
        if (index < 0) { sessionStorage.removeItem(draftStorageKey); setDraftHydrated(true); return; }
        setScopeIndex(index);
        reset({ format: parsed.data.format, audience: parsed.data.audience, includeMedia: parsed.data.includeMedia, reason: parsed.data.reason });
        requestKey.current = parsed.data.request;
        setDraftNotice("Đã khôi phục bản nháp trong thẻ trình duyệt này.");
        setDraftHydrated(true);
      } catch {
        try { sessionStorage.removeItem(draftStorageKey); } catch { /* Storage may be disabled. */ }
        setDraftHydrated(true);
      }
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [context, reset]);

  useEffect(() => {
    if (!context || !draftHydrated || hydratedActor.current !== context.actorId || !choice || draftReason === undefined) return;
    const timeout = window.setTimeout(() => {
      const requestInput = exportRequestSchema.safeParse({
        treeId: choice.treeId, scope: choice.scope, format: draftFormat, reason: draftReason,
        audience: choice.scope.kind === "personal" ? "self" : draftAudience, includeMedia: draftIncludeMedia,
      });
      const signature = requestInput.success ? JSON.stringify(requestInput.data) : "";
      const request = signature && requestKey.current?.signature === signature ? requestKey.current : null;
      const draft = exportDraftSchema.safeParse({
        version: 1, actorId: context.actorId, treeId: choice.treeId, scope: choice.scope, format: draftFormat,
        audience: choice.scope.kind === "personal" ? "members" : draftAudience, includeMedia: draftIncludeMedia,
        reason: draftReason, savedAt: Date.now(), request,
      });
      if (draft.success) {
        try { sessionStorage.setItem(draftStorageKey, JSON.stringify(draft.data)); } catch { setDraftNotice("Không thể lưu bản nháp trong thẻ trình duyệt này."); }
      }
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [choice, context, draftAudience, draftFormat, draftHydrated, draftIncludeMedia, draftReason]);

  async function requestExport(draft: ExportDraftFormOutput) {
    if (!choice || !context) return;
    const input = exportRequestSchema.safeParse({ treeId: choice.treeId, scope: choice.scope, ...draft,
      audience: choice.scope.kind === "personal" ? "self" : draft.audience });
    if (!input.success) { setError("Chọn phạm vi hợp lệ và ghi lý do từ 5 đến 1.000 ký tự."); return; }
    const signature = JSON.stringify(input.data);
    if (requestKey.current?.signature !== signature) requestKey.current = { signature, key: crypto.randomUUID() };
    setPending("request"); setError(""); setNotice(""); setPreviewEnabled(false);
    try { sessionStorage.setItem(draftStorageKey, JSON.stringify(exportDraftSchema.parse({ version: 1, actorId: context.actorId, treeId: choice.treeId, scope: choice.scope, ...draft, savedAt: Date.now(), request: requestKey.current } satisfies ExportDraft))); } catch { setDraftNotice(""); }
    try {
      const result = await createMutation.mutateAsync({ input: input.data, key: requestKey.current.key, csrfToken: context.csrfToken });
      setJobId(result.id); bookmark(result.id);
      try { sessionStorage.removeItem(draftStorageKey); } catch { /* Storage may be disabled. */ }
      setDraftNotice(""); setNotice("Yêu cầu đã được lưu. Trạng thái chờ không có nghĩa đã tạo tệp.");
      await refreshContext();
    } catch (cause: unknown) { setError(cause instanceof Error ? cause.message : "Chưa lưu được yêu cầu. Thử lại giữ nguyên mã thao tác."); }
    finally { setPending(""); }
  }
  function handleExportSubmit(event: React.FormEvent<HTMLFormElement>) {
    void handleSubmit((draft) => { void requestExport(draft); })(event);
  }
  async function preview() {
    if (!job) return; setPending("preview"); setError(""); setPreviewEnabled(true);
    try { await previewQuery.refetch({ throwOnError: true }); }
    catch (cause: unknown) { setError(cause instanceof Error ? cause.message : "Chưa tải được dữ liệu theo quyền."); }
    finally { setPending(""); }
  }
  async function cancel(draft: ExportCancelFormOutput) {
    if (!job || !context) return;
    const body = { baseVersion: job.version, reason: draft.reason };
    const signature = JSON.stringify({ jobId: job.id, ...body });
    if (cancelKey.current?.signature !== signature) cancelKey.current = { signature, key: crypto.randomUUID() };
    setPending("cancel"); setError(""); setNotice("");
    try {
      const result = await cancelMutation.mutateAsync({ id: job.id, body, key: cancelKey.current.key, csrfToken: context.csrfToken });
      setPreviewEnabled(false); setNotice("Đã hủy yêu cầu xuất. Không xóa hồ sơ hoặc tư liệu gốc và không hoàn lại quota.");
      await refreshContext();
    } catch (cause: unknown) { setError(cause instanceof Error ? cause.message : "Chưa hủy được yêu cầu. Hãy tải lại trạng thái."); }
    finally { setPending(""); }
  }
  async function reload(id?: string) {
    setPending("reload"); setError(""); setNotice("");
    try { await refreshContext(); if (id) await loadJob(id); }
    catch (cause: unknown) { setJobId(""); setPreviewEnabled(false); setError(cause instanceof Error ? cause.message : "Chưa tải được trạng thái."); }
    finally { setPending(""); }
  }

  return <section className="import-workspace" aria-label="Khu vực xuất liệu" aria-busy={Boolean(pending) || contextQuery.isLoading || jobQuery.isFetching || previewQuery.isFetching}>
    <div className="card import-result export-intro"><p>Phạm vi → Yêu cầu → Xem dữ liệu theo quyền → Theo dõi</p>
      <p>Hiện kiểm thử local: đã lưu job và lọc dữ liệu tại DB; worker tạo tệp chưa tích hợp. Không có tệp tải giả hoặc trạng thái hoàn tất giả.</p>
      {contextQuery.isLoading && <p role="status">Đang kiểm tra phiên và phạm vi được phép…</p>}
      {(error || (contextQuery.error instanceof Error ? contextQuery.error.message : "")) && <p className="form-error" role="alert">{error || (contextQuery.error instanceof Error ? contextQuery.error.message : "")}</p>}{notice && <p role="status">{notice}</p>}
      <button type="button" className="button-secondary" disabled={Boolean(pending)} onClick={() => void reload(job?.id)}>Tải lại trạng thái xuất</button>
    </div>
    {!context && !contextQuery.isLoading && !pending && <div className="restricted-card"><h2>Chưa mở được phạm vi xuất</h2><p>Đăng nhập và xác thực hai bước đối với xuất hàng loạt. Không hiển thị dữ liệu riêng tư khi thiếu phiên.</p><Link className="button-secondary" href="/dang-nhap">Đăng nhập</Link></div>}
    {context && context.scopes.length === 0 && <div className="restricted-card"><h2>Chưa có phạm vi được phép</h2><p>Cần hồ sơ cá nhân được duyệt hoặc grant xuất hàng loạt kèm MFA. Dữ liệu thật chưa được bật.</p><Link className="button-secondary" href="/thiet-lap-mfa">Xác thực hai bước</Link></div>}
    {choice && <form className="card import-form" onSubmit={handleExportSubmit}>
      <h2>Yêu cầu bản xuất</h2><label htmlFor="export-scope">Phạm vi</label>
      <select id="export-scope" value={scopeIndex} onChange={(event) => setScopeIndex(Number(event.target.value))} disabled={Boolean(pending)}>
        {context?.scopes.map((scope, index) => <option key={JSON.stringify([scope.treeId, scope.scope])} value={index}>{scope.treeName} · {scope.label}</option>)}
      </select><label htmlFor="export-format">Định dạng xuất</label>
      <select id="export-format" disabled={Boolean(pending) || createMutation.isPending} {...register("format")}>
        {Object.entries(formatLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select><label htmlFor="export-audience">Đối tượng nhận</label>
      <select id="export-audience" disabled={Boolean(pending) || createMutation.isPending || choice.scope.kind === "personal"} {...register("audience")}>
        {choice.scope.kind === "personal" ? <option value="members">Chính chủ · hồ sơ đã duyệt</option> : <><option value="members">Thành viên · theo consent từng trường</option><option value="public">Công khai · chờ workflow xuất bản</option></>}
      </select>{draftAudience === "public" && choice.scope.kind !== "personal" && <p>Chưa nối duyệt xuất bản hồ sơ: preview công khai hiện không trả dữ liệu người.</p>}
      <label htmlFor="export-media"><input id="export-media" type="checkbox" disabled={Boolean(pending) || createMutation.isPending} {...register("includeMedia")} /> Yêu cầu kèm tư liệu được phép</label>
      <p>Tùy chọn được lưu; chưa tạo gói media. Không bao gồm tư liệu restricted hoặc đường dẫn kho riêng.</p>
      <label htmlFor="export-reason">Lý do xuất</label><input id="export-reason" minLength={5} maxLength={1000} required disabled={Boolean(pending) || createMutation.isPending} aria-invalid={formErrors.reason ? "true" : "false"} aria-describedby={formErrors.reason ? "export-reason-error" : undefined} {...register("reason")} />
      {formErrors.reason?.message && <p id="export-reason-error" className="form-error" role="alert">{formErrors.reason.message}</p>}
      <button className="button-primary" disabled={Boolean(pending) || createMutation.isPending}>{createMutation.isPending ? "Đang lưu yêu cầu…" : "Lưu yêu cầu xuất"}</button>
      <p>Tối đa 3 yêu cầu trong 24 giờ, kể cả yêu cầu đã hủy. File mặc định hết hạn sau 24 giờ; quyền được kiểm tra lại ở mỗi bước.</p>
      <p aria-live="polite">{draftNotice || (draftHydrated ? "Bản nháp lưu tạm trong thẻ trình duyệt 15 phút; dữ liệu gia phả không được lưu trong bản nháp." : "")}</p>
    </form>}
    <section className="card import-result" aria-label="Trạng thái xuất">
      <h2>Yêu cầu đã lưu</h2>{!job && <p>Chọn yêu cầu gần đây hoặc lưu yêu cầu mới để theo dõi. Chưa tạo file.</p>}
      {context && context.jobs.length > 0 && <><label htmlFor="export-jobs">Yêu cầu còn hiệu lực</label><select id="export-jobs" value={job?.id ?? ""} disabled={Boolean(pending) || jobQuery.isFetching} onChange={(event) => { if (event.target.value) void reload(event.target.value); }}>
        <option value="">Chọn yêu cầu</option>{context.jobs.map((item) => <option key={item.id} value={item.id}>{formatLabels[item.format]} · {statusLabels[item.status]}</option>)}
      </select></>}
      {job && <><p role="status" data-testid="export-status">{statusLabels[job.status]} · Phiên bản {job.version}</p>
        <p>Định dạng: {formatLabels[job.format]} · Hết hạn: {new Date(job.expiresAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</p>
        {job.warnings.length > 0 && <ul>{job.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
        <button type="button" className="button-secondary" disabled={Boolean(pending) || !["queued", "running", "complete"].includes(job.status)} onClick={() => void preview()}>Xem dữ liệu theo quyền</button>
        {projection && <div role="status" data-testid="export-preview"><p>Được phép: {projection.people.length} hồ sơ · {projection.parentLinks.length} quan hệ · {projection.unions.length} gia đình · {projection.citations.length} trích dẫn.</p><p>Không hiển thị số lượng hoặc mã hồ sơ bị ẩn. Preview không phải file hoàn tất.</p></div>}
        {job.status === "complete" ? <div className="export-downloads" aria-label="Tệp xuất đã hoàn tất">
          <Link className="button-primary" href={`/api/v1/exports/${job.id}/download?file=primary`}>Tải tệp {formatLabels[job.format].split(" — ")[0]}</Link>
          {(job.format === "gedcom_551" || job.format === "gedcom_7") && <Link className="button-secondary" href={`/api/v1/exports/${job.id}/download?file=sidecar`}>Tải JSON sidecar</Link>}
        </div> : <p role="status">Tệp chỉ xuất hiện sau khi worker lưu artifact riêng tư và DB xác nhận hoàn tất.</p>}
        {(job.status === "queued" || job.status === "running") && <ExportCancelForm job={job} pending={Boolean(pending) || cancelMutation.isPending} onCancel={cancel} />}
      </>}
    </section>
  </section>;
}
