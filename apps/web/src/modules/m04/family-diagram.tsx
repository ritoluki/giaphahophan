"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FocusEvent } from "react";
import { Handle, Position, ReactFlow, useReactFlow, type AriaLabelConfig, type Edge, type Node, type NodeProps, type ReactFlowInstance } from "@xyflow/react";
import { branchName } from "../../lib/demo-data";
import { buildFamilyDiagram, familyDiagramLanes, familyHref, type FamilyDataset, type FamilyPerson, type FamilyViewOptions } from "../../lib/family-view-model";
import { familyLayoutResultSchema, type FamilyLayoutRequest } from "./family-layout-types";
import "@xyflow/react/dist/style.css";

type PersonDiagramNode = Node<{ person: FamilyPerson; current: boolean; onSelect: (person: FamilyPerson) => void }, "familyPerson">;
type ReadyLayout = { status: "ready"; nodes: Array<{ id: string; x: number; y: number }> };
type LayoutState = { status: "loading" | "error" } | ReadyLayout;

const ariaLabels: Partial<AriaLabelConfig> = {
  "node.a11yDescription.default": "Nhấn Enter hoặc phím cách để xem tóm tắt về người này.",
  "node.a11yDescription.keyboardDisabled": "Nhấn Enter hoặc phím cách để xem tóm tắt về người này.",
  "node.a11yDescription.ariaLiveMessage": ({ x, y }) => `Vị trí đang xem: ngang ${Math.round(x)}, dọc ${Math.round(y)}.`,
  "edge.a11yDescription.default": "Quan hệ đã được ghi nhận giữa hai người.",
  "controls.ariaLabel": "Điều khiển sơ đồ",
  "controls.zoomIn.ariaLabel": "Phóng to",
  "controls.zoomOut.ariaLabel": "Thu nhỏ",
  "controls.fitView.ariaLabel": "Xem toàn sơ đồ",
  "controls.interactive.ariaLabel": "Bật hoặc tắt thao tác với sơ đồ",
  "minimap.ariaLabel": "Sơ đồ thu nhỏ",
  "handle.ariaLabel": "Điểm nối quan hệ"
};

function PersonDiagramCard({ data }: NodeProps<PersonDiagramNode>) {
  const { getNode, getZoom, setCenter } = useReactFlow<PersonDiagramNode>();
  function revealOnFocus(event: FocusEvent<HTMLButtonElement>) {
    if (!event.currentTarget.matches(":focus-visible")) return;
    const node = getNode(data.person.id);
    if (node) void setCenter(node.position.x + 124, node.position.y + (node.height ?? 112) / 2, { zoom: Math.max(.7, getZoom()) });
  }
  return (
    <div className={`family-diagram-node${data.current ? " family-diagram-node-current" : ""}`}>
      <Handle id="parent" type="target" position={Position.Top} isConnectable={false} />
      <Handle id="child" type="source" position={Position.Bottom} isConnectable={false} />
      <Handle id="partner-left" type="target" position={Position.Left} isConnectable={false} />
      <Handle id="partner-right" type="source" position={Position.Right} isConnectable={false} />
      <Handle id="partner-source-left" type="source" position={Position.Left} isConnectable={false} />
      <Handle id="partner-target-right" type="target" position={Position.Right} isConnectable={false} />
      <button type="button" className="nodrag nopan" onFocus={revealOnFocus} onClick={() => data.onSelect(data.person)}>
        {data.current ? <span>Đang xem</span> : null}
        <strong>{data.person.displayName}</strong>
        <small>{data.person.yearLabel === "Chưa rõ" ? "Chưa rõ năm sinh" : `Sinh năm ${data.person.yearLabel}`}</small>
      </button>
    </div>
  );
}
const nodeTypes = { familyPerson: PersonDiagramCard };

function nodeHeight(person: FamilyPerson): number {
  return Math.max(112, Math.ceil(person.displayName.length / 22) * 27 + 64);
}

export default function FamilyDiagram({ dataset, options, maxNodes, onChoose, onClose }: {
  dataset: FamilyDataset;
  options: FamilyViewOptions;
  maxNodes: number;
  onChoose: (id: string) => void;
  onClose: () => void;
}) {
  const diagram = useMemo(() => buildFamilyDiagram(dataset, options, maxNodes), [dataset, options, maxNodes]);
  const [layout, setLayout] = useState<LayoutState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<FamilyPerson | null>(null);
  const [instance, setInstance] = useState<ReactFlowInstance<PersonDiagramNode, Edge> | null>(null);
  const summaryRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let current = true;
    let worker: Worker;
    try {
      worker = new Worker(new URL("./family-layout.worker.ts", import.meta.url));
    } catch {
      queueMicrotask(() => { if (current) setLayout({ status: "error" }); });
      return;
    }
    const timeout = window.setTimeout(() => {
      if (current) setLayout({ status: "error" });
      worker.terminate();
    }, 5000);
    worker.onmessage = (event: MessageEvent<unknown>) => {
      if (!current) return;
      window.clearTimeout(timeout);
      const parsed = familyLayoutResultSchema.safeParse(event.data);
      if (parsed.success && parsed.data.ok && parsed.data.nodes.length === diagram.people.length) {
        setLayout({ status: "ready", nodes: parsed.data.nodes });
      } else setLayout({ status: "error" });
      worker.terminate();
    };
    worker.onerror = () => {
      if (current) setLayout({ status: "error" });
      window.clearTimeout(timeout);
      worker.terminate();
    };
    const lanes = familyDiagramLanes(diagram, options.rootId ?? "");
    const request: FamilyLayoutRequest = {
      nodes: diagram.people.map((person) => ({ id: person.id, width: 248, height: nodeHeight(person), lane: lanes.get(person.id) ?? 0 })),
      // Marriage joins people. It must not become a generation in ELK's hierarchy.
      edges: diagram.edges.filter((edge) => edge.kind !== "union").map(({ id, source, target }) => ({ id, source, target }))
    };
    worker.postMessage(request);
    return () => { current = false; window.clearTimeout(timeout); worker.terminate(); };
  }, [diagram, attempt, options.rootId]);

  const nodes: PersonDiagramNode[] = layout.status === "ready" ? diagram.people.flatMap((person) => {
    const position = layout.nodes.find((node) => node.id === person.id);
    return position ? [{ id: person.id, type: "familyPerson", position, width: 248, height: nodeHeight(person), data: { person, current: person.id === options.rootId, onSelect: setSelected } }] : [];
  }) : [];
  const edges: Edge[] = diagram.edges.map((edge) => {
    const partnerToLeft = edge.kind === "union" && (nodes.find((node) => node.id === edge.source)?.position.x ?? 0) > (nodes.find((node) => node.id === edge.target)?.position.x ?? 0);
    return {
    id: edge.id, source: edge.source, target: edge.target,
    sourceHandle: edge.kind === "union" ? partnerToLeft ? "partner-source-left" : "partner-right" : "child",
    targetHandle: edge.kind === "union" ? partnerToLeft ? "partner-target-right" : "partner-left" : "parent",
    type: edge.kind === "union" ? "straight" : "smoothstep",
    label: edge.kind === "union" || (edge.kind === "biological" && !edge.disputed) ? undefined : edge.label,
    ariaLabel: `${dataset.people.find((person) => person.id === edge.source)?.displayName ?? ""} — ${edge.label} — ${dataset.people.find((person) => person.id === edge.target)?.displayName ?? ""}`,
    style: { stroke: edge.disputed ? "var(--danger)" : "var(--ink-muted)", strokeWidth: 2, strokeDasharray: edge.disputed ? "3 5" : edge.kind === "adoptive" || edge.kind === "guardian" || edge.kind === "step" ? "8 5" : undefined },
    labelStyle: { fill: "var(--ink)", fontSize: 14 }, labelBgStyle: { fill: "var(--surface)" }, labelBgPadding: [8, 4]
  }; });

  function centerPerson(flow: ReactFlowInstance<PersonDiagramNode, Edge> | null = instance) {
    const person = nodes.find((node) => node.id === options.rootId);
    if (flow && person) void flow.setCenter(person.position.x + 124, person.position.y + (person.height ?? 112) / 2, { zoom: .9 });
  }

  function closeSummary() {
    if (selected) canvasRef.current?.querySelector<HTMLButtonElement>(`.react-flow__node[data-id="${CSS.escape(selected.id)}"] button`)?.focus({ preventScroll: true });
    setSelected(null);
  }

  useEffect(() => {
    if (!selected || !instance) return;
    summaryRef.current?.focus({ preventScroll: true });
    // The summary reduces the canvas height. Wait for its layout and React Flow's
    // resize observer, then keep the chosen person inside the remaining canvas.
    let resizeFrame = 0;
    const layoutFrame = requestAnimationFrame(() => {
      resizeFrame = requestAnimationFrame(() => {
        const node = instance.getNode(selected.id);
        const canvas = canvasRef.current;
        if (!node || !canvas) return;
        const width = node.measured?.width ?? node.width ?? 248;
        const height = node.measured?.height ?? node.height ?? 112;
        const fit = Math.min((canvas.clientWidth - 24) / width, (canvas.clientHeight - 24) / height);
        void instance.setCenter(node.position.x + width / 2, node.position.y + height / 2, { zoom: Math.max(.15, Math.min(instance.getZoom(), fit)) });
      });
    });
    return () => { cancelAnimationFrame(layoutFrame); cancelAnimationFrame(resizeFrame); };
  }, [selected, instance]);

  useEffect(() => {
    // React Flow does not expose an attribution aria-label in ariaLabelConfig.
    // Keep its visible attribution and link; localize only the accessible label.
    if (instance) canvasRef.current?.querySelector(".react-flow__attribution a")?.setAttribute("aria-label", "Sơ đồ sử dụng React Flow");
  }, [instance]);

  if (layout.status === "loading") return <div className="family-diagram-message" role="status"><p>Đang sắp xếp sơ đồ gia đình…</p><button className="button-secondary" type="button" onClick={onClose}>Xem bằng danh sách</button></div>;
  if (layout.status === "error") return <div className="family-diagram-message" role="alert"><h3>Chưa mở được sơ đồ</h3><p>Bạn vẫn có thể đọc đầy đủ gia đình bằng danh sách.</p><div><button className="button-secondary" type="button" onClick={() => { setLayout({ status: "loading" }); setAttempt((value) => value + 1); }}>Thử lại</button><button className="button-primary" type="button" onClick={onClose}>Xem bằng danh sách</button></div></div>;

  return (
    <div className="family-diagram-workspace">
      <p className="family-diagram-hint">Kéo để di chuyển. Chạm vào tên để xem thông tin.</p>
      <div className="family-diagram-controls" aria-label="Điều khiển sơ đồ gia đình">
        <button type="button" onClick={() => { void instance?.zoomIn(); }} aria-label="Phóng to sơ đồ">+</button>
        <button type="button" onClick={() => { void instance?.zoomOut(); }} aria-label="Thu nhỏ sơ đồ">−</button>
        <button type="button" onClick={() => centerPerson()}>Về người đang xem</button>
        <button type="button" onClick={() => { void instance?.fitView({ padding: .15 }); }}>Xem toàn sơ đồ</button>
      </div>
      <div className="family-diagram-canvas" aria-label="Sơ đồ quan hệ gia đình" ref={canvasRef}>
        <ReactFlow<PersonDiagramNode, Edge>
          aria-label="Sơ đồ quan hệ gia đình"
          nodes={nodes} edges={edges} nodeTypes={nodeTypes}
          onInit={(flow) => { setInstance(flow); centerPerson(flow); }}
          onNodeClick={(_event, node) => setSelected(node.data.person)}
          ariaLabelConfig={ariaLabels}
          nodesDraggable={false} nodesConnectable={false} nodesFocusable={false} edgesFocusable={false}
          elementsSelectable={false} deleteKeyCode={null} minZoom={.15} maxZoom={1.75}
          onPaneClick={() => setSelected(null)}
        />
      </div>
      {selected ? <section className="family-diagram-summary" tabIndex={-1} ref={summaryRef} aria-label={`Tóm tắt về ${selected.displayName}`}>
        <div><h3>{selected.displayName}</h3><p>{selected.yearLabel === "Chưa rõ" ? "Chưa rõ năm sinh" : `Sinh năm ${selected.yearLabel}`} · {branchName(selected.primaryBranchId)}</p></div>
        <div className="family-person-actions"><button type="button" onClick={() => onChoose(selected.id)}>Xem gia đình</button><Link href={`/nguoi/${selected.id}?from=${encodeURIComponent(familyHref(options))}`}>Xem hồ sơ</Link><button type="button" onClick={closeSummary}>Đóng thông tin</button></div>
      </section> : null}
      <div className="family-diagram-legend"><span><i />Cha mẹ – con</span><span>Đường ngang: vợ chồng hoặc bạn đời</span><span><i className="family-line-other" />Nuôi dưỡng hoặc giám hộ</span><span><i className="family-line-review" />Cần đối chiếu</span></div>
      {diagram.truncated ? <p className="family-diagram-cap" role="status">Đang hiển thị một phần gia phả để sơ đồ dễ đọc. Chọn một người rồi xem gia đình của người đó để đi tiếp.</p> : null}
    </div>
  );
}
