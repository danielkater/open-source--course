export type Role = 'hr' | 'candidate' | 'external'
export type TaskStatus = 'pending' | 'in_progress' | 'pending_review' | 'completed' | 'blocked'
export interface Task { id: number; candidate_id: number; code: string; title: string; kind: string; owner: Role; status: TaskStatus; description: string; result: string; dependencies: string[]; blocked_by: string[]; updated_at: string; actions: {action: string; role: Role; label: string}[] }
export interface Candidate { id: number; name: string; identity: string; job_category: string; position: string; employment: string; department: string; start_date: string; status: string; progress: number; completed: number; total: number; days_until_start: number; risk: string; risk_reasons: string[]; missing_documents: string[]; tasks: Task[]; events: AuditEvent[]; notifications: {id: number; message: string; created_at: string}[] }
export interface AuditEvent { id: number; name?: string; actor: string; action: string; detail: string; created_at: string }
export interface Proposal { id: number; candidate_id: number; name: string; title: string; reason: string; status: string }
export interface Followup { id: number; candidate_id: number; name: string; title: string; status: string }
export interface Workspace { candidates: Candidate[]; metrics: {total: number; pending_review: number; risk: number; upcoming: number; progress: number}; proposals: Proposal[]; followups: Followup[]; events: AuditEvent[]; mode: string; server_time: string }
export interface ToolLog { id: number; run_id: string; mode: string; role: string; tool: string; arguments: string; result: string; success: number; duration_ms: number; created_at: string }
export interface ChatReply { run_id: string; mode: string; answer: string; warning: string | null; logs: ToolLog[] }
