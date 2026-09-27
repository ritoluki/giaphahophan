"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getDemoGraph } from "../../lib/demo-data";
import { collapseGraphOccurrences, type GraphMode } from "@phan/domain";

type TreeExplorerProps = { rootId: string };

const modes: Array<{ value: GraphMode; label: string; hint: string }> = [
  { value: "family", label: "Gia đình gần", hint: "Cha mẹ, con, bạn đời và con trong union" },
  { value: "ancestors", label: "Tổ tiên", hint: "Lần theo các cha mẹ đã được ghi nhận" },
  { value: "descendants", label: "Hậu duệ", hint: "Lần theo các con đã được ghi nhận" },
  { value: "roots", label: "Các gốc rời", hint: "Những gốc chưa có cha mẹ trong projection" }
];

export function TreeExplorer({ rootId }: TreeExplorerProps) {
  const [mode, setMode] = useState<GraphMode>("family");
  const [depth, setDepth] = useState(3);
  const [maxNodes, setMaxNodes] = useState(120);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showOccurrences, setShowOccurrences] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const updateCap = () => {
      setIsDesktop(media.matches);
      setMaxNodes(media.matches ? 300 : 120);
    };
    updateCap();
    media.addEventListener("change", updateCap);
    return () => media.removeEventListener("change", updateCap);
  }, []);

  const graph = useMemo(() => {
    try {
      return getDemoGraph(rootId, mode, depth, maxNodes);
    } catch {
      return null;
    }
  }, [rootId, mode, depth, maxNodes]);

  const occurrenceGroups = useMemo(() => graph ? collapseGraphOccurrences(graph) : [], [graph]);
  const visibleNodes = useMemo(() => {
    if (!graph) return [];
    if (showOccurrences) return graph.nodes.map((node) => ({ ...node, occurrenceCount: 1 }));
    return occurrenceGroups.flatMap((group) => {
      const representative = graph.nodes.find((node) => node.occurrenceId === group.occurrenceIds[0]);
      return representative ? [{ ...representative, occurrenceCount: group.occurrenceIds.length }] : [];
    });
  }, [graph, occurrenceGroups, showOccurrences]);
  const currentNode = graph?.nodes.find((node) => node.person.id === rootId && node.depth === 0);
  const modeLabel = modes.find((item) => item.value === mode)?.label ?? "Cây gia phả";
  const canExpand = Boolean(graph?.nextExpansion && (graph.nextExpansion.depth > depth || (isDesktop && graph.nextExpansion.maxNodes > maxNodes)));
  const expandProjection = () => {
    const expansion = graph?.nextExpansion;
    if (!expansion || !canExpand) return;
    setDepth(expansion.depth);
    setMaxNodes(isDesktop ? expansion.maxNodes : 120);
  };

  return (
    <section className={"tree-explorer" + (isFullscreen ? " tree-explorer-fullscreen" : "")} aria-labelledby="tree-explorer-title">
      <div className="tree-explorer-header">
        <div>
          <p className="eyebrow">M04 · Projection theo quyền</p>
          <h2 id="tree-explorer-title">Cây gia phả</h2>
          <p className="muted">Mỗi occurrence giữ đường đi riêng; bấm tên luôn về một hồ sơ canonical.</p>
        </div>
        <button className="button-secondary" type="button" onClick={() => setIsFullscreen((open) => !open)} aria-pressed={isFullscreen}>
          {isFullscreen ? "Thoát toàn màn hình" : "Mở toàn màn hình"}
        </button>
      </div>

      <div className="tree-toolbar" aria-label="Bộ lọc cây gia phả">
        <div className="tree-mode-tabs" role="tablist" aria-label="Chế độ cây">
          {modes.map((item) => (
            <button
              className={"tree-mode-tab" + (mode === item.value ? " tree-mode-tab-active" : "")}
              key={item.value}
              type="button"
              role="tab"
              aria-selected={mode === item.value}
              onClick={() => setMode(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <button className="button-secondary tree-collapse-toggle" type="button" onClick={() => setShowOccurrences((open) => !open)} aria-pressed={showOccurrences}>
          {showOccurrences ? "Gộp hồ sơ trùng" : "Hiện từng occurrence"}
        </button>
        <label>
          Độ sâu
          <select value={depth} onChange={(event) => setDepth(Number(event.target.value))}>
            {[1, 2, 3, 4, 5, 6].map((value) => <option key={value} value={value}>{value} đời</option>)}
          </select>
        </label>
        <label>
          Giới hạn
          <select value={maxNodes} onChange={(event) => setMaxNodes(Number(event.target.value))}>
            <option value={120}>120 người ở mobile</option>
            {isDesktop ? <option value={300}>300 người ở desktop</option> : null}
          </select>
        </label>
      </div>

      <div className="tree-mode-note" aria-live="polite">
        <strong>{modeLabel}</strong>
        <span>{modes.find((item) => item.value === mode)?.hint}</span>
        <span>{graph ? `${visibleNodes.length} hồ sơ · ${graph.nodes.length} occurrence · revision ${graph.graphRevision}` : "Không thể dựng projection"}</span>
      </div>

      {!graph ? (
        <div className="tree-state tree-state-error" role="alert">
          <strong>Không thể mở projection cây</strong>
          <p>Thử giảm độ sâu hoặc tải lại trang. Dữ liệu bị giới hạn không được hiển thị thay bằng giá trị đoán.</p>
        </div>
      ) : graph.nodes.length === 0 ? (
        <div className="tree-state" role="status">
          <strong>Chưa có nhánh được phép xem</strong>
          <p>Projection hiện tại không có hồ sơ trong phạm vi được phép.</p>
        </div>
      ) : (
        <>
          <div className="tree-viewport" tabIndex={0} aria-label="Vùng cuộn sơ đồ cây gia phả">
            <div className="tree-node-grid" role="list">
              {visibleNodes.map((node) => (
                <Link className={"tree-person-card" + (node.person.id === rootId ? " tree-person-card-current" : "")} href={"/nguoi/" + node.person.id} key={node.occurrenceId} role="listitem">
                  <span className="monogram" aria-hidden="true">{node.person.displayName.slice(0, 1)}</span>
                  <span className="tree-person-copy">
                    <strong>{node.person.displayName}</strong>
                    <small>{node.person.yearLabel ?? "Chưa rõ"} · {node.depth === 0 ? "Điểm bắt đầu" : `Độ sâu ${node.depth}`}</small>
                    <small>{node.occurrenceCount > 1 ? `${node.occurrenceCount} occurrence · cùng hồ sơ canonical` : "Hồ sơ canonical · occurrence riêng"}</small>
                  </span>
                </Link>
              ))}
            </div>
          </div>
          {graph.truncated ? (
            <div className="tree-truncation" role="status">
              <strong>Cây đang được giới hạn ở {maxNodes} occurrence.</strong> Giảm độ sâu hoặc mở rộng từ một hồ sơ để xem tiếp; hệ thống không tải toàn bộ graph xuống trình duyệt.
              {graph.nextExpansion ? <button className="button-secondary tree-expand-toggle" type="button" onClick={expandProjection} disabled={!canExpand}>Mở rộng projection</button> : null}
            </div>
          ) : null}
          <div className="tree-legend" aria-label="Chú giải quan hệ">
            <span><i className="tree-legend-line" /> Quan hệ đã ghi nhận</span>
            <span><i className="tree-legend-line tree-legend-adoptive" /> Con nuôi / giám hộ</span>
            <span><i className="tree-legend-dot" /> {currentNode ? "Hồ sơ đang chọn" : "Nhiều gốc trong projection"}</span>
            {graph.edges.some((edge) => edge.status === "disputed") ? <span className="tree-warning">Có cảnh cần đối chiếu nguồn</span> : null}
          </div>
        </>
      )}
    </section>
  );
}