import { useCallback, useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Activity, ArrowDownToLine, ArrowRight, Bell, Bot, BriefcaseBusiness, Building2, CalendarDays, Check, CheckCheck, CheckCircle2, ChevronDown, ChevronRight, Circle, CircleHelp, Clock3, FileCheck2, FileText, GitBranch, LayoutDashboard, ListChecks, Loader2, LockKeyhole, MessageSquare, Network, Plus, RefreshCw, Search, Send, ShieldCheck, Sparkles, Terminal, TriangleAlert, Users, X } from 'lucide-react'
import { api } from './api'
import type { AuditEvent, Candidate, ChatReply, Role, Task, TaskStatus, ToolLog, Workspace } from './types'

const roleNames: Record<Role, string> = {hr: '企业 HR', candidate: '候选人', external: '上海外服'}
const statusNames: Record<TaskStatus, string> = {pending: '待处理', in_progress: '进行中', pending_review: '待审核', completed: '已完成', blocked: '已阻塞'}
const identityNames: Record<string, string> = {graduate: '应届毕业生', experienced: '社会招聘', direct: '直接用工', dispatch: '劳务派遣', staff: '普通员工', executive: '中高管'}
type View = 'overview' | 'candidates' | 'reviews' | 'services' | 'records' | 'workflow' | 'messages'
const navItems: {id: View; label: string; icon: typeof Users}[] = [
  {id: 'overview', label: '协同总览', icon: LayoutDashboard}, {id: 'candidates', label: '候选人管理', icon: Users},
  {id: 'reviews', label: '材料与结果审核', icon: FileCheck2}, {id: 'services', label: '外服协同', icon: Network},
  {id: 'messages', label: '督办与消息', icon: Bell}, {id: 'records', label: '执行与审计', icon: Activity},
  {id: 'workflow', label: '动态流程引擎', icon: GitBranch},
]
const time = (s: string) => new Date(s).toLocaleString('zh-CN', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Shanghai'})
const pretty = (s: string) => {try {return JSON.stringify(JSON.parse(s), null, 2)} catch {return s}}

function Badge({status}: {status: TaskStatus}) {
  const Icon = status === 'completed' ? CheckCircle2 : status === 'blocked' ? LockKeyhole : status === 'pending_review' ? FileCheck2 : Clock3
  return <span className={`badge ${status}`}><Icon size={12}/>{statusNames[status]}</span>
}
function Progress({value}: {value: number}) { return <div className="progress-track"><span style={{width: `${value}%`}}/></div> }
function Empty({children}: {children: ReactNode}) { return <div className="empty"><CheckCheck size={30}/><p>{children}</p></div> }
function Modal({title, subtitle, children, close}: {title: string; subtitle?: string; children: ReactNode; close: () => void}) {
  return <div className="modal-backdrop" onMouseDown={e => {if(e.target === e.currentTarget) close()}}><section className="modal" role="dialog" aria-modal="true" aria-label={title}><div className="modal-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" onClick={close} aria-label="关闭"><X size={20}/></button></div>{children}</section></div>
}
function ToolRecords({logs}: {logs: ToolLog[]}) {
  return <div className="tool-records">{logs.map(l => <details key={l.id} className="tool-record"><summary><Terminal size={13}/><span>{l.tool}</span><span className={l.success ? 'text-green' : 'text-red'}>{l.success ? '成功' : '失败'}</span><small>{l.duration_ms}ms</small></summary><div className="tool-meta">#{l.run_id} · {l.mode} · {time(l.created_at)}</div><label>实际参数</label><pre>{pretty(l.arguments)}</pre><label>数据库返回</label><pre>{pretty(l.result)}</pre></details>)}</div>
}

function AgentPanel({role, candidate, mode, refresh, viewLogs}: {role: Role; candidate?: Candidate; mode: string; refresh: () => Promise<void>; viewLogs: () => void}) {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<{question: string; reply?: ChatReply}[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const questions = role === 'hr' ? ['检查下周入职延期风险并给出督办建议', '当前候选人缺少什么材料？', '为什么入职流程卡住了？'] : role === 'candidate' ? ['我还有什么材料没交？', '我的入职流程进行到哪一步了？', '为什么我的入职流程卡住了？', '入职第一天需要准备什么？'] : ['当前候选人的外服服务进行到哪一步了？', '为什么入职流程卡住了？']
  async function send(question: string) {
    if (!question.trim() || busy) return
    setBusy(true); setError(''); setInput('')
    setMessages(m => [...m, {question}])
    try {
      const reply = await api<ChatReply>('/agent/chat', {message: question, role, candidate_id: candidate?.id})
      setMessages(m => [...m.slice(0,-1), {question, reply}])
      await refresh()
    } catch(e) { setError(e instanceof Error ? e.message : '请求失败') }
    finally {setBusy(false)}
  }
  return <aside className="agent-panel">
    <div className="agent-heading"><span className="agent-avatar"><Sparkles size={22}/></span><div><h3>{role === 'candidate' ? 'AI 入职陪伴官' : 'AI 流程指挥官'}</h3><p><span className="live-dot"/>{mode === 'llm' ? 'LLM 工具调用模式' : '规则驱动演示模式'}</p></div><span className="ai-label">AI</span></div>
    <div className="agent-context"><span><ShieldCheck size={14}/>已连接演示业务数据库</span><small>{candidate ? `当前上下文：${candidate.name} #${candidate.id}` : '当前上下文：全部候选人'}</small></div>
    <div className="agent-conversation" aria-live="polite">
      <div className="agent-intro"><div className="tiny-label">YOUR ONBOARDING COPILOT</div><h4>让每一步，都有回应。</h4><p>我可以查询实时流程、定位材料缺口，并给出下一步行动建议。</p><div className="agent-note"><LockKeyhole size={13}/>审批与督办发送，始终由人确认。</div></div>
      <div className="quick-questions">{questions.map(q => <button key={q} disabled={busy} onClick={() => send(q)}><MessageSquare size={13}/><span>{q}</span><ArrowRight size={13}/></button>)}</div>
      {messages.map((m,i) => <div className="chat-turn" key={i}><div className="user-message">{m.question}</div>{m.reply && <><div className="assistant-message"><span className="reply-label"><Bot size={14}/>{m.reply.mode === 'llm' ? 'LLM · 工具查询' : '规则驱动 · 数据库查询'}</span>{m.reply.warning && <p className="warning-note">{m.reply.warning}</p>}<p>{m.reply.answer}</p></div><details className="run-details"><summary><Terminal size={13}/>{m.reply.logs.length} 次真实工具执行 <ChevronDown size={12}/></summary><ToolRecords logs={m.reply.logs}/></details></>}</div>)}
      {busy && <div className="agent-thinking"><Loader2 size={15} className="spin"/>正在查询业务数据…</div>}
      {error && <div className="inline-error">{error}<button onClick={() => send(messages[messages.length-1]?.question || questions[0])}>重试</button></div>}
    </div>
    <div className="agent-bottom"><form onSubmit={e => {e.preventDefault(); void send(input)}}><input aria-label="向 Agent 提问" placeholder="询问进度、材料或阻塞原因…" value={input} onChange={e => setInput(e.target.value)} maxLength={2000}/><button disabled={busy || !input.trim()} aria-label="发送问题"><Send size={17}/></button></form><div><span>仅限虚构演示数据</span><button onClick={viewLogs}>查看执行记录 <ArrowRight size={11}/></button></div></div>
  </aside>
}

function TaskList({tasks, role, onAction, compact = false}: {tasks: Task[]; role: Role; onAction: (task: Task, action: string) => void; compact?: boolean}) {
  return <div className={`task-list ${compact ? 'compact' : ''}`}>{tasks.map((task,i) => <article key={task.id} className={`task-row task-${task.status}`}>
    <div className="timeline-point">{task.status === 'completed' ? <Check size={14}/> : task.status === 'blocked' ? <LockKeyhole size={12}/> : <span>{String(i+1).padStart(2,'0')}</span>}</div>
    <div className="task-main"><div className="task-title"><strong>{task.title}</strong><Badge status={task.status}/></div><div className="task-description">{task.description}</div><div className="task-meta"><span>{task.kind === 'service' ? <Network size={12}/> : <Users size={12}/>} {roleNames[task.owner]}负责</span>{task.result && <span className="task-result"><FileText size={12}/>{task.result}</span>}</div>{task.blocked_by.length > 0 && <div className="dependency"><GitBranch size={12}/>前置依赖：{task.blocked_by.join('、')}</div>}</div>
    <div className="task-actions">{task.actions.filter(a => a.role === role).map(a => <button key={a.action} className={`button ${a.action === 'reject' || a.action === 'progress' ? 'subtle' : 'small-primary'}`} onClick={() => onAction(task, a.action)}>{a.label}{a.action !== 'reject' && <ChevronRight size={13}/>}</button>)}{task.status === 'pending_review' && role !== 'hr' && <span className="muted">等待 HR 确认</span>}</div>
  </article>)}</div>
}

function CandidateTable({candidates, selected, select, search, setSearch}: {candidates: Candidate[]; selected?: Candidate; select: (c: Candidate) => void; search: string; setSearch: (s: string) => void}) {
  const [filter, setFilter] = useState('all')
  const filtered = candidates.filter(c => (!search || `${c.name}${c.department}${c.position}`.includes(search)) && (filter === 'all' || filter === 'risk' && c.risk !== 'normal' || filter === 'draft' && c.status === 'draft'))
  return <section className="panel candidates-panel"><div className="panel-heading"><div><h3>候选人入职看板 <span className="count">{candidates.length}</span></h3><p>从 Offer 到入职，所有进展实时协同</p></div><label className="search-box"><Search size={15}/><input placeholder="搜索候选人" aria-label="搜索候选人" value={search} onChange={e => setSearch(e.target.value)}/></label></div><div className="table-tabs">{[['all','全部候选人'],['risk','需要关注'],['draft','待启动']].map(([id,label]) => <button className={filter === id ? 'active' : ''} key={id} onClick={() => setFilter(id)}>{label}</button>)}<span><span className="live-dot"/>实时同步</span></div><div className="table-scroll"><table><thead><tr><th>候选人 / 岗位</th><th>身份与用工</th><th>入职日期</th><th>流程进度</th><th>排期状态</th><th/></tr></thead><tbody>{filtered.map(c => <tr key={c.id} className={selected?.id === c.id ? 'selected' : ''} onClick={() => select(c)}><td><button className="person-button" onClick={e => {e.stopPropagation(); select(c)}}><span className={`person-avatar avatar-${c.id%3}`}>{c.name.slice(-2)}</span><span><strong>{c.name}</strong><small>{c.position}</small></span></button></td><td><span>{identityNames[c.identity]}</span><small>{identityNames[c.employment]} · {identityNames[c.job_category]}</small></td><td><span className="tabular">{c.start_date.slice(5).replace('-',' / ')}</span><small>{c.department}</small></td><td><div className="table-progress"><span>{c.progress}%</span><small>{c.completed}/{c.total} 项</small></div><Progress value={c.progress}/></td><td><span className={`risk-pill ${c.status === 'draft' ? 'draft' : c.status === 'onboarded' ? 'normal' : c.risk}`}><span/>{c.status === 'draft' ? '待启动' : c.status === 'onboarded' ? '已入职' : c.risk === 'high' ? '延期风险' : c.risk === 'medium' ? '需要关注' : '按计划推进'}</span></td><td><ChevronRight size={16}/></td></tr>)}</tbody></table>{filtered.length === 0 && <Empty>未找到匹配候选人</Empty>}</div></section>
}

function CandidateDetail({candidate, role, onAction, launch}: {candidate: Candidate; role: Role; onAction: (task: Task, action: string) => void; launch: () => void}) {
  const [filter, setFilter] = useState('all')
  const tasks = candidate.tasks.filter(t => filter === 'all' || filter === 'todo' && t.status !== 'completed' || filter === 'completed' && t.status === 'completed')
  return <section className="panel candidate-detail"><div className="panel-heading"><div><div className="eyebrow">ONBOARDING JOURNEY</div><h3>{candidate.name}的入职旅程 <span className="detail-id">#{String(candidate.id).padStart(4,'0')}</span></h3><p>{candidate.department} · {identityNames[candidate.identity]} · {identityNames[candidate.employment]}</p></div><div className="journey-fraction"><strong>{candidate.completed}<span> / {candidate.total}</span></strong><small>任务已完成</small></div></div>
    <div className="journey-progress"><Progress value={candidate.progress}/><span>{candidate.progress}%</span></div>
    {candidate.status === 'draft' ? <div className="draft-state"><Send size={30}/><h3>准备好开启新的入职旅程</h3><p>发送模拟 Offer 后，流程引擎将根据身份、岗位与用工模式生成任务。</p>{role === 'hr' && <button className="button primary" onClick={launch}><Send size={15}/>发送 Offer / 启动入职流程</button>}</div> : <><div className="task-filter"><div>{[['all','全部任务'],['todo','待办事项'],['completed','已完成']].map(([id,label]) => <button key={id} className={filter === id ? 'active' : ''} onClick={() => setFilter(id)}>{label}</button>)}</div><span><GitBranch size={13}/>角色驱动动态流程</span></div><TaskList tasks={tasks} role={role} onAction={onAction}/>{tasks.length === 0 && <Empty>该分类暂无任务</Empty>}</>}
  </section>
}

function EventFeed({events}: {events: AuditEvent[]}) {
  return <section className="panel"><div className="panel-heading"><div><h3>协同动态</h3><p>每一次推进，都有迹可循</p></div><Activity size={18} className="muted"/></div><div className="event-list">{events.map(e => <div key={e.id} className="event-item"><span className={`event-dot ${e.actor}`}/><div><strong>{e.name ? e.name + ' · ' : ''}{e.action}</strong><p>{e.detail}</p><small>{roleNames[e.actor as Role] || (e.actor === 'agent' ? 'Agent 助手' : '系统')} · {time(e.created_at)}</small></div></div>)}{!events.length && <Empty>暂无协同记录</Empty>}</div></section>
}

export default function App() {
  const [workspace, setWorkspace] = useState<Workspace>()
  const [role, setRole] = useState<Role>('hr')
  const [view, setView] = useState<View>('overview')
  const [selectedId, setSelectedId] = useState<number>()
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [actionModal, setActionModal] = useState<{task?: Task; action: string; proposalId?: number; followupId?: number}>()
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [logs, setLogs] = useState<ToolLog[]>([])
  const [scanning, setScanning] = useState(false)
  const selected = workspace?.candidates.find(c => c.id === selectedId) || workspace?.candidates[0]
  const refresh = useCallback(async () => {
    const next = await api<Workspace>('/workspace'); setWorkspace(next); setError('')
  }, [])
  useEffect(() => {void refresh().catch(e => setError(e.message)); const id = setInterval(() => {void refresh().catch(e => setError(e.message))}, 5000); return () => clearInterval(id)}, [refresh])
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(''), 4500); return () => clearTimeout(id) }, [toast])
  useEffect(() => {if(view === 'records') void api<ToolLog[]>('/agent/logs').then(setLogs).catch(e => setError(e.message))}, [view, workspace?.server_time])
  function select(c: Candidate) {setSelectedId(c.id)}
  function taskAction(task: Task, action: string) {setSelectedId(task.candidate_id); setNote(''); setActionModal({task, action})}
  async function scanRisks() {
    if (scanning) return
    setScanning(true)
    try {
      const r = await api<ChatReply>('/agent/chat',{message:'帮我检查下周入职的候选人，找出存在延期风险的人，并给出处理建议。',role:'hr'})
      await refresh()
      setToast(r.mode === 'llm' ? '风险分析已完成，请查看督办建议与工具记录' : '规则驱动风险检查已完成，请查看督办建议与工具记录')
      setView('messages')
    } catch(e) {setError(e instanceof Error ? e.message : '风险检查失败')} finally {setScanning(false)}
  }
  async function execute() {
    if (!actionModal) return
    setBusy(true)
    try {
      if (actionModal.task) await api(`/tasks/${actionModal.task.id}/action`, {action: actionModal.action, role, candidate_id: selected?.id, note, confirmed: true})
      else if (actionModal.proposalId) await api(`/proposals/${actionModal.proposalId}/confirm`, {role, confirmed: true})
      else if (actionModal.followupId) await api(`/followups/${actionModal.followupId}/complete`, {role, confirmed: true})
      setActionModal(undefined); await refresh(); setToast('操作已保存，三方工作台已同步')
    } catch(e) {setError(e instanceof Error ? e.message : '操作失败')} finally {setBusy(false)}
  }
  async function launch() {
    if (!selected || busy) return
    setBusy(true)
    try { await api(`/candidates/${selected.id}/launch`, {role: 'hr'}); await refresh(); setToast('模拟 Offer 已发送，动态入职任务已生成') } catch(e) {setError(e instanceof Error ? e.message : '启动失败')} finally {setBusy(false)}
  }
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true)
    const data = Object.fromEntries(new FormData(e.currentTarget))
    try {const c = await api<Candidate>('/candidates', {...data, role:'hr'}); setSelectedId(c.id); setCreateOpen(false); setView('candidates'); await refresh(); setToast('候选人已保存，请发送 Offer 启动流程') } catch(e) {setError(e instanceof Error ? e.message : '创建失败')} finally {setBusy(false)}
  }
  const allTasks = workspace?.candidates.flatMap(c => c.tasks.map(t => ({...t, candidate: c}))) || []
  const reviewTasks = allTasks.filter(t => t.status === 'pending_review' || t.owner === 'hr' && t.status === 'pending')
  const serviceTasks = allTasks.filter(t => t.owner === 'external')
  const roleNav = navItems.filter(n => role === 'hr' || role === 'candidate' && ['overview','messages','workflow'].includes(n.id) || role === 'external' && ['overview','services','records','workflow'].includes(n.id))
  const title = role === 'candidate' ? `你好，${selected?.name || '新同事'}。` : role === 'external' ? '专业协同，让入职更顺畅。' : view === 'overview' ? '入职协同，井然有序。' : navItems.find(n => n.id === view)?.label || '协同工作台'
  const actionLabels: Record<string,string> = {submit:'提交模拟材料',complete:actionModal?.task?.kind === 'final' ? '确认正式入职' : '人工确认完成',approve:'审核通过',reject:'退回补充',accept:'接收服务任务',progress:'更新服务进度',submit_result:'提交模拟服务结果',followup:'确认督办并发送站内提醒',close_followup:'完成督办任务'}
  return <div className="app-shell">
    <aside className="sidebar"><a className="brand" href="#" onClick={e => {e.preventDefault(); setView('overview')}}><span className="brand-mark"><Network size={24}/></span><span>OnboardOS<span className="brand-ai">AI</span><small>智能入职协同中枢</small></span></a>
      <div className="organization"><div className="org-icon"><Building2 size={18}/></div><div><strong>上海外服 · 解决方案</strong><small>企业协同演示空间</small></div><LockKeyhole size={13}/></div>
      <div className="nav-label">WORKSPACE</div><nav>{roleNav.map(n => <button key={n.id} className={view === n.id ? 'active' : ''} onClick={() => setView(n.id)}><n.icon size={18}/><span>{role === 'candidate' && n.id === 'overview' ? '我的入职旅程' : n.label}</span>{n.id === 'reviews' && !!workspace?.metrics.pending_review && <b>{workspace.metrics.pending_review}</b>}{view === n.id && <span className="nav-active-dot"/>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="workflow-note"><span><GitBranch size={18}/><span>规则驱动 · 协作有序</span></span><p>每个角色，各司其职。<br/>每段旅程，实时可见。</p><button onClick={() => setView('workflow')}>了解流程引擎 <ArrowRight size={13}/></button></div><div className="user-profile"><span className="profile-avatar">{role === 'hr' ? 'HR' : role === 'external' ? '外服' : selected?.name.slice(-2)}</span><div><strong>{roleNames[role]}工作空间</strong><small>演示角色 · 无真实认证</small></div><ShieldCheck size={17}/></div></div>
    </aside>
    <div className="app-main"><header className="topbar"><div className="breadcrumb"><span>工作空间</span><ChevronRight size={14}/><strong>{roleNames[role]}工作台</strong></div><div className="topbar-right"><span className="environment"><span/>虚构数据演示</span><button className="icon-button" onClick={() => {void refresh().then(() => setToast('已从后端刷新最新数据')).catch(e => setError(e.message))}} aria-label="刷新数据"><RefreshCw size={17}/></button><button className="icon-button notification-button" onClick={() => setView('messages')} aria-label="站内消息"><Bell size={18}/>{!!selected?.notifications.length && <i/>}</button><div className="top-avatar">{role === 'hr' ? 'HR' : role === 'external' ? '外服' : selected?.name.slice(-2)}</div></div></header>
      <div className="rolebar"><div className="role-caption"><Network size={15}/><span>三方协同，一份业务数据</span></div><div className="role-switch" aria-label="演示角色切换">{(['hr','candidate','external'] as Role[]).map(r => <button key={r} className={role === r ? 'active' : ''} onClick={() => {setRole(r); setView('overview'); setError('')}}>{r === 'hr' ? <Building2 size={14}/> : r === 'candidate' ? <Users size={14}/> : <BriefcaseBusiness size={14}/>}<span>{roleNames[r]}</span></button>)}</div>{role !== 'hr' && <select className="context-select" aria-label="选择候选人" value={selected?.id || ''} onChange={e => setSelectedId(Number(e.target.value))}>{workspace?.candidates.map(c => <option key={c.id} value={c.id}>{c.name} · {c.position}</option>)}</select>}<span className="demo-label">DEMO WORKSPACE</span></div>
      <main className="main-content"><div className="page-heading"><div><div className="eyebrow">{role === 'hr' ? 'HR COMMAND CENTER' : role === 'candidate' ? 'YOUR NEXT CHAPTER' : 'FSG COLLABORATION DESK'}</div><h1>{title}</h1><p>{role === 'candidate' ? '新的旅程即将开始，你的入职事项都在这里。' : role === 'external' ? '接收服务、更新进展、回传结果，与企业 HR 实时协作。' : '连接候选人、企业与上海外服，让每一次入职顺利发生。'}</p></div><div className="heading-actions"><span className="date-display"><CalendarDays size={15}/>{workspace ? new Date(workspace.server_time).toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'short',timeZone:'Asia/Shanghai'}) : '连接中'}</span>{role === 'hr' && <button className="button primary" onClick={() => setCreateOpen(true)}><Plus size={17}/>创建候选人</button>}</div></div>
      {error && <div className="error-banner" role="alert"><TriangleAlert size={16}/><span>{error}</span><button onClick={() => setError('')} aria-label="关闭错误"><X size={15}/></button></div>}
      {!workspace ? <div className="loading-state"><Loader2 size={30} className="spin"/><h3>正在连接入职协同中枢</h3><p>请确认 FastAPI 后端已启动于 8000 端口。</p><button className="button secondary" onClick={() => {void refresh().catch(e => setError(e.message))}}>重新连接</button></div> : <>
      {role === 'hr' && <div className="metrics-grid">{[{label:'候选人总数',value:workspace.metrics.total,icon:Users,color:'purple',sub:'全流程入职管理'},{label:'待审核事项',value:workspace.metrics.pending_review,icon:FileCheck2,color:'orange',sub:'等待 HR 人工确认'},{label:'排期风险人数',value:workspace.metrics.risk,icon:TriangleAlert,color:'red',sub:'未来 14 天未完结流程'},{label:'即将入职',value:workspace.metrics.upcoming,icon:CalendarDays,color:'green',sub:'未来 14 天入职安排'}].map(m => <section className="metric-card" key={m.label}><div><span>{m.label}</span><span className={`metric-icon ${m.color}`}><m.icon size={18}/></span></div><strong>{m.value}<small>{m.label === '待审核事项' ? '项' : '人'}</small></strong><p><span className={`metric-dot ${m.color}`}/>{m.sub}</p></section>)}</div>}
      <div className="workspace-grid"><div className="workspace-content">
      {role === 'candidate' && selected && <section className="candidate-hero"><div><span className="hero-pill"><Sparkles size={12}/>每一步，都在为你准备</span><h2>{selected.status === 'onboarded' ? '欢迎正式加入！' : '距离新旅程，还有 ' + selected.days_until_start + ' 天'}</h2><p>{selected.position} · {selected.department}</p><div className="candidate-hero-date"><CalendarDays size={15}/>{selected.start_date} 入职 <span>·</span>{identityNames[selected.employment]}</div></div><div className="progress-ring"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="49"/><circle cx="60" cy="60" r="49" strokeDasharray={`${selected.progress * 3.079} 308`}/></svg><div><strong>{selected.progress}<small>%</small></strong><span>入职准备度</span></div></div></section>}
      {(view === 'overview' || view === 'candidates') && role === 'hr' && <><div className="insight-strip"><span className="insight-icon"><Sparkles size={19}/></span><div><strong>让协同先行一步</strong><p>{workspace.metrics.risk ? `${workspace.metrics.risk} 位候选人的排期需要关注，建议优先处理材料缺口与外服回执。` : '当前没有临近入职的未完结风险，继续推进各方待办。'}</p></div><button disabled={scanning} onClick={() => {void scanRisks()}}>{scanning ? <Loader2 size={14} className="spin"/> : <>一键检查 <ArrowRight size={14}/></>}</button></div><CandidateTable candidates={workspace.candidates} selected={selected} select={select} search={search} setSearch={setSearch}/></>}
      {(view === 'overview' || view === 'candidates') && role !== 'external' && selected && <CandidateDetail key={selected.id} candidate={selected} role={role} onAction={taskAction} launch={() => {void launch()}}/>}
      {view === 'reviews' && role === 'hr' && <section className="panel"><div className="panel-heading"><div><h3>待办审核队列 <span className="count">{reviewTasks.length}</span></h3><p>逐项确认材料与外服回传结果，最终入职保留人工决策</p></div><ShieldCheck size={21} className="text-purple"/></div>{reviewTasks.map(t => <div className="queue-item" key={t.id}><div className="queue-person"><span className="person-avatar">{t.candidate.name.slice(-2)}</span><div><strong>{t.candidate.name}</strong><small>{t.candidate.position} · {t.candidate.start_date}</small></div><button onClick={() => {select(t.candidate); setView('candidates')}}>查看完整流程 <ArrowRight size={12}/></button></div><TaskList tasks={[t]} role={role} onAction={taskAction} compact/></div>)}{!reviewTasks.length && <Empty>当前没有可审核事项，等待候选人或外服提交</Empty>}</section>}
      {(view === 'services' || view === 'overview' && role === 'external') && <section className="panel"><div className="panel-heading"><div><div className="eyebrow">CROSS-ORGANIZATION COLLABORATION</div><h3>上海外服服务工作台</h3><p>服务结果回传后进入待审批状态，主流程自动同步</p></div><span className="count">{serviceTasks.length} 项服务</span></div><div className="service-summary"><span><Circle size={13}/>待接收 <b>{serviceTasks.filter(t=>t.status==='pending').length}</b></span><span><Clock3 size={13}/>处理中 <b>{serviceTasks.filter(t=>t.status==='in_progress').length}</b></span><span><FileCheck2 size={13}/>待 HR 确认 <b>{serviceTasks.filter(t=>t.status==='pending_review').length}</b></span></div>{serviceTasks.map(t => <div className="queue-item service-item" key={t.id}><div className="queue-person"><span className="service-icon"><Network size={19}/></span><div><strong>{t.candidate.name} · {t.title}</strong><small>{t.candidate.position} · {t.candidate.start_date} 入职</small></div><Badge status={t.status}/></div><TaskList tasks={[t]} role={role} onAction={taskAction} compact/></div>)}{!serviceTasks.length && <Empty>暂无外服任务，启动入职流程后自动分派</Empty>}</section>}
      {view === 'messages' && <section className="panel"><div className="panel-heading"><div><h3>{role === 'hr' ? '督办与站内消息' : '我的站内消息'}</h3><p>提醒仅在演示系统内发送，不接入短信或邮件</p></div><Bell size={20} className="text-purple"/></div>{role === 'hr' ? <><div className="section-label">待人工确认的 Agent 建议</div>{workspace.proposals.filter(p=>p.status==='pending').map(p => <div className="proposal-card" key={p.id}><span className="proposal-icon"><Bot size={19}/></span><div><strong>{p.title}</strong><p>{p.reason}</p><small>{p.name} · 尚未发送提醒 · 建议 #{p.id}</small></div><button className="button small-primary" onClick={() => setActionModal({action:'followup',proposalId:p.id})}>确认督办 <Check size={13}/></button></div>)}{!workspace.proposals.some(p=>p.status==='pending') && <Empty>暂无待确认建议，可在 Agent 面板发起风险检查</Empty>}<div className="section-label">督办任务记录</div>{workspace.followups.map(f => <div className="followup-row" key={f.id}><ListChecks size={17}/><div><strong>{f.title}</strong><small>{f.name} · 站内提醒已发送</small></div>{f.status === 'open' ? <button className="button secondary" onClick={() => setActionModal({action:'close_followup',followupId:f.id})}>标记完成</button> : <Badge status="completed"/>}</div>)}</> : selected?.notifications.length ? selected.notifications.map(n => <div className="message-card" key={n.id}><Bell size={19}/><div><strong>HR 入职提醒</strong><p>{n.message}</p><small>{time(n.created_at)}</small></div></div>) : <Empty>暂无站内提醒，入职事项可在旅程中查看</Empty>}</section>}
      {view === 'records' && <><section className="panel"><div className="panel-heading"><div><h3>Agent 真实工具执行记录</h3><p>仅记录实际执行；规则驱动、LLM 与人工确认分别标识</p></div><Terminal size={20} className="text-purple"/></div><div className="logs-content"><ToolRecords logs={logs}/>{!logs.length && <Empty>发起 Agent 查询后，这里会显示真实工具记录</Empty>}</div></section><EventFeed events={workspace.events}/></>}
      {view === 'workflow' && <section className="panel workflow-panel"><div className="panel-heading"><div><div className="eyebrow">DYNAMIC WORKFLOW ENGINE</div><h3>角色驱动动态流程引擎</h3><p>Python 配置生成 · 后端依赖校验 · SQLite 持久化</p></div><GitBranch size={24} className="text-purple"/></div><div className="workflow-banner"><ShieldCheck size={22}/><p>以下规则仅用于模拟验证，不代表正式劳动法规或真实企业政策。</p></div><div className="rule-grid">{[{when:'应届毕业生',add:'三方协议',icon:FileText},{when:'中高管',add:'外服背景调查',icon:Network},{when:'劳务派遣',add:'派遣用工协议',icon:BriefcaseBusiness}].map(r => <div className="rule-card" key={r.when}><r.icon size={23}/><small>当候选人属于</small><strong>{r.when}</strong><span><Plus size={13}/>自动增加{r.add}</span></div>)}</div><div className="section-label">所有候选人的核心路径</div><div className="flow-steps">{['Offer 确认','模拟材料提交','HR 材料审核','外服服务与 HR 确认','最终人工入职确认'].map((s,i) => <div key={s}><span>{i+1}</span><strong>{s}</strong>{i<4 && <ChevronRight size={16}/>}</div>)}</div><div className="engine-features"><p><CheckCircle2 size={15}/>必需前置任务未完成，下游按钮不可操作；直接调用 API 也会拒绝。</p><p><CheckCircle2 size={15}/>候选人提交与外服回传都保留“待审核”，不会自动代替 HR 审批。</p><p><CheckCircle2 size={15}/>身份、岗位、用工模式三项参数组合生成不同任务清单。</p></div></section>}
      {view === 'overview' && role === 'candidate' && selected && <EventFeed events={selected.events.slice(0,5)}/>}
      {view === 'overview' && role === 'external' && <EventFeed events={workspace.events.filter(e=>e.actor==='external'||e.actor==='hr').slice(0,5)}/>}
      </div><AgentPanel key={`${role}-${selected?.id}`} role={role} candidate={selected} mode={workspace.mode} refresh={refresh} viewLogs={() => setView('records')}/></div>
      <footer><span><ShieldCheck size={13}/>虚构模拟数据 · 无真实身份核验、健康信息或背景调查</span><span>OnboardOS AI · Demo v1.0</span></footer></>}
      </main>
    </div>
    {toast && <div className="toast" role="status"><CheckCircle2 size={18}/>{toast}</div>}
    {createOpen && <Modal title="创建候选人" subtitle="填写虚构信息，保存后发送 Offer 启动入职流程" close={() => {if(!busy) setCreateOpen(false)}}><form onSubmit={create} className="candidate-form"><div className="form-notice"><ShieldCheck size={15}/>比赛演示请仅填写虚构身份信息</div><div className="form-grid"><label>姓名<input name="name" required placeholder="如：王晓（模拟）" maxLength={40}/></label><label>身份类别<select name="identity" defaultValue="graduate"><option value="graduate">应届毕业生</option><option value="experienced">社会招聘</option></select></label><label>岗位名称<input name="position" required placeholder="如：产品经理" maxLength={80}/></label><label>岗位类别<select name="job_category"><option value="staff">普通员工</option><option value="executive">中高管</option></select></label><label>用工模式<select name="employment"><option value="direct">直接用工</option><option value="dispatch">劳务派遣</option></select></label><label>所属部门<input name="department" required placeholder="如：产品创新部" maxLength={60}/></label><label className="full">入职日期<input name="start_date" type="date" required defaultValue={workspace?.candidates[0]?.start_date || ''}/></label></div><div className="modal-footer"><button type="button" className="button secondary" disabled={busy} onClick={() => setCreateOpen(false)}>取消</button><button type="submit" className="button primary" disabled={busy}>{busy ? <Loader2 size={15} className="spin"/> : <Plus size={15}/>}保存候选人</button></div></form></Modal>}
    {actionModal && <Modal title={actionLabels[actionModal.action]} subtitle={actionModal.task?.title || '此操作由当前演示 HR 人工确认执行'} close={() => {if(!busy) setActionModal(undefined)}}><form className="action-form" onSubmit={e=>{e.preventDefault(); void execute()}}>
      {actionModal.action === 'submit' && <div className="simulation-file"><FileText size={27}/><div><strong>{actionModal.task?.title}_模拟材料.pdf</strong><p>演示占位文件 · 不含真实个人信息 · 不上传实际文件</p></div><ArrowDownToLine size={20}/></div>}
      <div className="form-notice"><CircleHelp size={16}/>{actionModal.action === 'submit' ? '提交后进入待审核，必须由 HR 审核通过。' : actionModal.action === 'submit_result' ? '仅回传虚构服务结果，主流程进入待 HR 确认状态。' : actionModal.action === 'followup' ? '确认后将创建督办任务，并向候选人发送站内模拟提醒。' : actionModal.action === 'reject' ? '请明确填写需要补充的内容，任务将退回待处理。' : '操作将写入业务数据库和审计记录，请确认后继续。'}</div>
      {actionModal.task && actionModal.action !== 'accept' && <label className="note-label">{actionModal.action === 'reject' ? '补充要求（必填）' : actionModal.action === 'progress' ? '服务进度（必填）' : '说明 / 模拟结果（可选）'}<textarea value={note} onChange={e => setNote(e.target.value)} required={['reject','progress'].includes(actionModal.action)} maxLength={1000} placeholder={actionModal.action === 'submit_result' ? '例：模拟服务协调完成，仅供流程演示，请 HR 人工确认。' : '填写本次操作说明…'} rows={3}/></label>}
      {actionModal.task?.kind === 'final' && <p className="warning-note">这是最终人工入职确认。AI 不参与录用决定；所有信息均为虚构演示。</p>}
      {error && <p className="inline-error">{error}</p>}
      <div className="modal-footer"><button type="button" className="button secondary" disabled={busy} onClick={() => setActionModal(undefined)}>取消</button><button type="submit" className="button primary" disabled={busy}>{busy ? <Loader2 size={15} className="spin"/> : <Check size={15}/>}确认{actionModal.action === 'submit' ? '提交' : '执行'}</button></div></form></Modal>}
  </div>
}
