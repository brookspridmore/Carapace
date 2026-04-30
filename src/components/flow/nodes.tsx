import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  User, Send, Terminal, Globe, Clock, ArrowDownToLine,
  PlayCircle, Search, Brain, FileText, Volume2, Database,
  HardDrive, Camera, Cpu, ListTodo, BookOpen, PenLine, Moon,
  FileOutput, ShieldAlert, AlertTriangle, MessageSquare,
} from "lucide-react";
import { StatusPill } from "@/components/shell/StatusPill";
import { cn } from "@/lib/utils";

const INPUT_ICONS = {
  human: User, telegram: Send, terminal: Terminal, api: Globe, cron: Clock, parent: ArrowDownToLine,
} as const;

const TOOL_ICONS = {
  exec: PlayCircle, web: Globe, search: Search, memory: Brain, file: FileText, tts: Volume2,
} as const;

const INFRA_ICONS = {
  db: Database, fts: Search, snapshots: Camera, openclaw: Cpu, disk: HardDrive,
} as const;

export function AgentNode({ data }: NodeProps) {
  const d = data as {
    name: string; role: string; model: string; provider: string;
    status: string; activeTask?: string; tokensUsed: number; tokensMax: number;
    contextPressure: number; compact?: boolean; dim?: boolean;
  };
  if (d.compact) {
    return (
      <div className={cn("relative w-[180px] rounded-lg panel border px-3 py-2", d.dim ? "border-border opacity-70" : "border-yellow/50")}>
        <Handle type="target" position={Position.Left} className="!bg-muted-foreground !border-0 !w-2 !h-2" />
        <Handle type="source" position={Position.Right} className="!bg-muted-foreground !border-0 !w-2 !h-2" />
        <Handle type="target" position={Position.Top} className="!bg-muted-foreground !border-0 !w-2 !h-2" />
        <Handle type="source" position={Position.Bottom} className="!bg-muted-foreground !border-0 !w-2 !h-2" />
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-semibold truncate">{d.name}</div>
          <StatusPill status={d.status} />
        </div>
        <div className="text-[10px] text-mono text-muted-foreground mt-0.5 truncate">{d.model}</div>
      </div>
    );
  }
  const tokenPct = Math.min(100, Math.round((d.tokensUsed / d.tokensMax) * 100));
  return (
    <div className="relative w-[280px] rounded-xl panel border border-yellow/60 glow-yellow">
      <Handle type="target" position={Position.Left} className="!bg-muted-foreground !border-0 !w-2 !h-2" />
      <Handle type="source" position={Position.Right} className="!bg-muted-foreground !border-0 !w-2 !h-2" />
      <Handle type="target" position={Position.Top} className="!bg-muted-foreground !border-0 !w-2 !h-2" />
      <Handle type="source" position={Position.Bottom} className="!bg-muted-foreground !border-0 !w-2 !h-2" />
      <div className="px-4 py-3 border-b border-border flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold tracking-tight truncate">{d.name}</div>
          <div className="text-[11px] text-muted-foreground truncate">{d.role}</div>
        </div>
        <StatusPill status={d.status} />
      </div>
      <div className="px-4 py-3 space-y-2.5">
        <div className="flex items-center justify-between text-[11px] text-mono">
          <span className="text-muted-foreground">{d.provider}</span>
          <span className="text-foreground">{d.model}</span>
        </div>
        {d.activeTask && (
          <div className="text-[11px] text-muted-foreground">
            <span className="text-mono uppercase opacity-60 mr-1.5">Task</span>
            <span className="text-foreground">{d.activeTask}</span>
          </div>
        )}
        <div>
          <div className="flex items-center justify-between text-[10px] text-mono text-muted-foreground mb-1">
            <span>Tokens</span>
            <span>{d.tokensUsed.toLocaleString()} / {d.tokensMax.toLocaleString()}</span>
          </div>
          <div className="h-1.5 rounded-full surface overflow-hidden">
            <div className="h-full bg-yellow" style={{ width: `${tokenPct}%` }} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ContextRing value={d.contextPressure} />
          <div className="text-[10px] text-mono text-muted-foreground">
            <div>context</div>
            <div className="text-foreground">{Math.round(d.contextPressure * 100)}%</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ContextRing({ value }: { value: number }) {
  const r = 14, c = 2 * Math.PI * r, off = c * (1 - value);
  const color = value > 0.8 ? "var(--carapace-coral)" : value > 0.6 ? "var(--carapace-yellow)" : "var(--carapace-sky)";
  return (
    <svg width={36} height={36} viewBox="0 0 36 36" className="shrink-0">
      <circle cx={18} cy={18} r={r} stroke="var(--color-border)" strokeWidth={3} fill="none" />
      <circle
        cx={18} cy={18} r={r} stroke={color} strokeWidth={3} fill="none"
        strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off}
        transform="rotate(-90 18 18)"
      />
    </svg>
  );
}

export function InputNode({ data }: NodeProps) {
  const d = data as { kind: keyof typeof INPUT_ICONS; label: string; rate?: string };
  const Icon = INPUT_ICONS[d.kind];
  return (
    <div className="rounded-lg surface border border-border px-3 py-2 w-[150px]">
      <Handle type="source" position={Position.Right} className="!bg-muted-foreground !border-0 !w-2 !h-2" />
      <div className="flex items-center gap-2">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">{d.label}</span>
      </div>
      {d.rate && <div className="text-[10px] text-muted-foreground text-mono mt-0.5">{d.rate}</div>}
    </div>
  );
}

const TOOL_BORDER: Record<string, string> = {
  exec: "border-coral/50",
  web: "border-sky/50",
  search: "border-sky/50",
  memory: "border-yellow/50",
  file: "border-border",
  tts: "border-border",
};

export function ToolNode({ data }: NodeProps) {
  const d = data as { kind: keyof typeof TOOL_ICONS; label: string; calls?: number };
  const Icon = TOOL_ICONS[d.kind];
  return (
    <div className={cn("rounded-lg surface border px-3 py-2 w-[150px]", TOOL_BORDER[d.kind] ?? "border-border")}>
      <Handle type="target" position={Position.Left} className="!bg-muted-foreground !border-0 !w-2 !h-2" />
      <div className="flex items-center gap-2">
        <Icon className="w-3.5 h-3.5" />
        <span className="text-xs font-medium capitalize">{d.label}</span>
      </div>
      {typeof d.calls === "number" && (
        <div className="text-[10px] text-muted-foreground text-mono mt-0.5">{d.calls} calls / 5m</div>
      )}
    </div>
  );
}

export function InfraNode({ data }: NodeProps) {
  const d = data as { kind: keyof typeof INFRA_ICONS; label: string; meta?: string };
  const Icon = INFRA_ICONS[d.kind];
  return (
    <div className="rounded-lg panel border border-border px-3 py-2 w-[160px]">
      <Handle type="target" position={Position.Top} className="!bg-muted-foreground !border-0 !w-2 !h-2" />
      <div className="flex items-center gap-2">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">{d.label}</span>
      </div>
      {d.meta && <div className="text-[10px] text-muted-foreground text-mono mt-0.5">{d.meta}</div>}
    </div>
  );
}

const PRIORITY_TONE: Record<string, string> = {
  high: "text-coral border-coral/40",
  medium: "text-yellow border-yellow/40",
  low: "text-muted-foreground border-border",
};

export function TaskNode({ data }: NodeProps) {
  const d = data as {
    title: string; status: string; priority: "high" | "medium" | "low";
    hasSnapshot?: boolean; hasConversation?: boolean; needsReview?: boolean;
    blocked?: boolean; done?: boolean; focused?: boolean; agentName?: string;
  };
  const borderTone =
    d.focused ? "border-yellow ring-2 ring-yellow/40" :
    d.blocked ? "border-coral/60" :
    d.needsReview ? "border-coral/60" :
    d.done ? "border-border opacity-60" :
    "border-yellow/40";
  const statusTone =
    d.blocked ? "text-coral" :
    d.needsReview ? "text-yellow" :
    d.status === "running" ? "text-sky" :
    "text-muted-foreground";
  return (
    <div className={cn(
      "rounded-md panel border px-3 py-2 w-[210px] cursor-pointer transition-shadow hover:shadow-md",
      borderTone,
    )}>
      <Handle type="target" position={Position.Left} className="!bg-muted-foreground !border-0 !w-2 !h-2" />
      <Handle type="source" position={Position.Right} className="!bg-muted-foreground !border-0 !w-2 !h-2" />
      <Handle type="source" position={Position.Bottom} className="!bg-muted-foreground !border-0 !w-2 !h-2" />
      <div className="flex items-center gap-1.5 mb-1">
        <ListTodo className="w-3 h-3 text-yellow" />
        <span className="text-[10px] text-mono uppercase tracking-wider text-muted-foreground">Task</span>
        <span className={cn("ml-auto text-[10px] text-mono px-1 rounded border", PRIORITY_TONE[d.priority])}>
          {d.priority}
        </span>
      </div>
      <div className="text-xs font-medium leading-snug line-clamp-2">{d.title}</div>
      <div className="flex items-center gap-2 mt-1.5">
        <span className={cn("text-[10px] text-mono", statusTone)}>{d.status.replace("_", " ")}</span>
        {d.agentName && (
          <span className="text-[10px] text-mono text-muted-foreground truncate">· {d.agentName}</span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {d.hasSnapshot && <Camera className="w-3 h-3 text-sky" />}
          {d.hasConversation && <MessageSquare className="w-3 h-3 text-muted-foreground" />}
          {d.needsReview && <AlertTriangle className="w-3 h-3 text-coral" />}
          {d.blocked && <ShieldAlert className="w-3 h-3 text-coral" />}
        </div>
      </div>
    </div>
  );
}

const MEMORY_ICONS = {
  read: BookOpen,
  write_candidate: PenLine,
  snapshot: Camera,
  dream: Moon,
} as const;
const MEMORY_BORDER: Record<string, string> = {
  read: "border-yellow/40",
  write_candidate: "border-yellow/40",
  snapshot: "border-sky/40",
  dream: "border-border",
};
const MEMORY_LABEL: Record<string, string> = {
  read: "Memory Read",
  write_candidate: "Memory Write Candidate",
  snapshot: "Snapshot",
  dream: "Dream",
};

export function MemoryNode({ data }: NodeProps) {
  const d = data as {
    kind: keyof typeof MEMORY_ICONS; ref: string; note?: string;
    // Snapshot-only extras
    status?: "active" | "stale" | "completed";
    importance?: number;
    updatedAt?: string;
    focused?: boolean;
  };
  const Icon = MEMORY_ICONS[d.kind];
  const isSnapshot = d.kind === "snapshot";
  const tone =
    d.focused ? "border-yellow ring-2 ring-yellow/40" :
    isSnapshot && d.status === "active" ? "border-sky/60" :
    isSnapshot && d.status === "stale" ? "border-border opacity-70" :
    isSnapshot && d.status === "completed" ? "border-border opacity-50" :
    MEMORY_BORDER[d.kind];
  return (
    <div className={cn("rounded-lg surface border px-3 py-2 w-[200px] transition-shadow", tone, d.focused && "shadow-[0_0_0_3px_color-mix(in_oklab,var(--carapace-yellow)_30%,transparent)]")}>
      <Handle type="target" position={Position.Left} className="!bg-muted-foreground !border-0 !w-2 !h-2" />
      <Handle type="source" position={Position.Right} className="!bg-muted-foreground !border-0 !w-2 !h-2" />
      <div className="flex items-center gap-2">
        <Icon className={cn("w-3.5 h-3.5", isSnapshot && d.status === "active" ? "text-sky" : "")} />
        <span className="text-[10px] text-mono uppercase tracking-wider text-muted-foreground">{MEMORY_LABEL[d.kind]}</span>
        {isSnapshot && d.status && (
          <span className={cn(
            "ml-auto text-[9px] text-mono px-1 rounded border",
            d.status === "active" ? "border-sky/60 text-sky" :
            d.status === "stale" ? "border-border text-muted-foreground" :
            "border-border text-muted-foreground",
          )}>{d.status}</span>
        )}
      </div>
      <div className="text-xs text-foreground truncate mt-0.5">{d.ref}</div>
      {d.note && <div className="text-[10px] text-muted-foreground truncate">{d.note}</div>}
      {isSnapshot && (typeof d.importance === "number" || d.updatedAt) && (
        <div className="mt-1.5 flex items-center gap-2 text-[9px] text-mono text-muted-foreground">
          {typeof d.importance === "number" && (
            <span className="flex items-center gap-1">
              <span className="w-10 h-1 rounded bg-border overflow-hidden">
                <span className="block h-full bg-yellow" style={{ width: `${Math.round(d.importance * 100)}%` }} />
              </span>
              {Math.round(d.importance * 100)}%
            </span>
          )}
          {d.updatedAt && <span className="ml-auto">upd {new Date(d.updatedAt).toISOString().slice(11, 16)}</span>}
        </div>
      )}
    </div>
  );
}

export function OutputNode({ data }: NodeProps) {
  const d = data as { kind: "artifact" | "review" | "next_action"; label: string; meta?: string; emphasized?: boolean };
  const Icon = d.kind === "review" ? AlertTriangle : FileOutput;
  const tone =
    d.kind === "review" ? "border-coral/50" :
    d.kind === "next_action" ? "border-yellow/70 bg-[color-mix(in_oklab,var(--carapace-yellow)_8%,transparent)]" :
    "border-sky/40";
  return (
    <div className={cn(
      "rounded-lg surface border px-3 py-2 w-[190px]",
      tone,
      d.emphasized && "ring-2 ring-yellow/50",
    )}>
      <Handle type="target" position={Position.Left} className="!bg-muted-foreground !border-0 !w-2 !h-2" />
      <div className="flex items-center gap-2">
        {d.kind === "next_action" ? (
          <span className="w-3.5 h-3.5 rounded-full bg-yellow/80 text-[9px] text-mono text-primary-foreground flex items-center justify-center font-bold">→</span>
        ) : (
          <Icon className={cn("w-3.5 h-3.5", d.kind === "review" ? "text-coral" : "text-sky")} />
        )}
        <span className="text-[10px] text-mono uppercase tracking-wider text-muted-foreground">
          {d.kind === "next_action" ? "Next Action" : d.kind === "review" ? "Review" : "Output"}
        </span>
      </div>
      <div className="text-xs font-medium mt-0.5 leading-snug">{d.label}</div>
      {d.meta && <div className="text-[10px] text-mono text-muted-foreground mt-0.5 truncate">{d.meta}</div>}
    </div>
  );
}

export function ApprovalNode({ data }: NodeProps) {
  const d = data as { label: string; reason: string };
  return (
    <div className="rounded-lg panel border border-coral/60 px-3 py-2 w-[180px]">
      <Handle type="target" position={Position.Left} className="!bg-muted-foreground !border-0 !w-2 !h-2" />
      <Handle type="source" position={Position.Right} className="!bg-muted-foreground !border-0 !w-2 !h-2" />
      <div className="flex items-center gap-2">
        <ShieldAlert className="w-3.5 h-3.5 text-coral" />
        <span className="text-[10px] text-mono uppercase tracking-wider text-coral">Approval Gate</span>
      </div>
      <div className="text-xs font-medium mt-0.5">{d.label}</div>
      <div className="text-[10px] text-muted-foreground truncate">{d.reason}</div>
    </div>
  );
}

export const nodeTypes = {
  agent: AgentNode,
  input: InputNode,
  tool: ToolNode,
  infra: InfraNode,
  task: TaskNode,
  memory: MemoryNode,
  output: OutputNode,
  approval: ApprovalNode,
};
