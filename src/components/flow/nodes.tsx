import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  User, Send, Terminal, Globe, Clock, ArrowDownToLine,
  PlayCircle, Search, Brain, FileText, Volume2, Database,
  HardDrive, Camera, Cpu,
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
    contextPressure: number;
  };
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

export const nodeTypes = { agent: AgentNode, input: InputNode, tool: ToolNode, infra: InfraNode };
