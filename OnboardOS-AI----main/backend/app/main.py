import json
import uuid
from contextlib import asynccontextmanager
from datetime import date
from typing import Literal
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
from .db import connect, initialize, now, event
from .service import list_candidates, view_candidate, candidate_row, insert_candidate, seed
from .engine import generate_tasks, act_on_task, CONFIG
from .agent import chat, configured
from .agent_tools import create_followup_task

Role = Literal['hr', 'candidate', 'external']


class CandidateCreate(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    identity: Literal['graduate', 'experienced']
    job_category: Literal['staff', 'executive']
    position: str = Field(min_length=1, max_length=80)
    employment: Literal['direct', 'dispatch']
    department: str = Field(min_length=1, max_length=60)
    start_date: date
    role: Literal['hr'] = 'hr'

    @field_validator('name', 'position', 'department')
    @classmethod
    def not_blank(cls, value):
        if not value.strip():
            raise ValueError('内容不能为空')
        return value.strip()


class HumanAction(BaseModel):
    role: Role
    confirmed: bool = False


class TaskAction(HumanAction):
    action: Literal['complete', 'submit', 'accept', 'progress', 'submit_result', 'approve', 'reject']
    note: str = Field(default='', max_length=1000)
    candidate_id: int | None = Field(default=None, gt=0)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    role: Role
    candidate_id: int | None = Field(default=None, gt=0)

    @field_validator('message')
    @classmethod
    def nonempty(cls, value):
        if not value.strip():
            raise ValueError('消息不能为空')
        return value.strip()


@asynccontextmanager
async def lifespan(app):
    initialize()
    with connect() as conn:
        seed(conn)
    yield


app = FastAPI(title='OnboardOS AI · 智能入职协同中枢', version='1.0.0', lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=['http://localhost:5173', 'http://127.0.0.1:5173'],
                   allow_methods=['GET', 'POST'], allow_headers=['Content-Type'])


@app.get('/api/health')
def health():
    with connect() as conn:
        conn.execute('SELECT 1')
    return {'status': 'ok', 'database': 'sqlite', 'mode': 'llm' if configured() else 'rules',
            'demo': True, 'workflow_version': CONFIG['version'], 'notice': CONFIG['notice']}


@app.get('/api/workspace')
def workspace():
    with connect() as conn:
        candidates = list_candidates(conn)
        tasks = [t for c in candidates for t in c['tasks']]
        return {'candidates': candidates, 'metrics': {
            'total': len(candidates), 'pending_review': sum(t['status'] == 'pending_review' for t in tasks),
            'risk': sum(c['risk'] != 'normal' for c in candidates),
            'upcoming': sum(0 <= c['days_until_start'] <= 14 and c['status'] != 'onboarded' for c in candidates),
            'progress': round(sum(c['progress'] for c in candidates) / len(candidates)) if candidates else 0},
            'proposals': [dict(p) for p in conn.execute('SELECT p.*,c.name FROM proposals p JOIN candidates c ON c.id=p.candidate_id ORDER BY p.id DESC')],
            'followups': [dict(f) for f in conn.execute('SELECT f.*,c.name FROM followups f JOIN candidates c ON c.id=f.candidate_id ORDER BY f.id DESC')],
            'events': [dict(e) for e in conn.execute('SELECT e.*,c.name FROM events e LEFT JOIN candidates c ON c.id=e.candidate_id ORDER BY e.id DESC LIMIT 20')],
            'mode': 'llm' if configured() else 'rules', 'server_time': now()}


@app.post('/api/candidates', status_code=201)
def create_candidate(body: CandidateCreate):
    with connect() as conn:
        cid = insert_candidate(conn, body.model_dump())
        return view_candidate(conn, cid)


@app.get('/api/candidates/{candidate_id}')
def candidate(candidate_id: int):
    with connect() as conn:
        return view_candidate(conn, candidate_id)


@app.post('/api/candidates/{candidate_id}/launch')
def launch(candidate_id: int, body: HumanAction):
    if body.role != 'hr':
        raise HTTPException(403, '仅 HR 可启动入职流程')
    with connect() as conn:
        generate_tasks(conn, candidate_row(conn, candidate_id))
        return view_candidate(conn, candidate_id)


@app.post('/api/tasks/{task_id}/action')
def task_action(task_id: int, body: TaskAction):
    with connect() as conn:
        row = conn.execute('SELECT candidate_id FROM tasks WHERE id=?', (task_id,)).fetchone()
        if not row:
            raise HTTPException(404, '任务不存在')
        if body.role == 'candidate' and body.candidate_id != row['candidate_id']:
            raise HTTPException(403, '请在当前候选人身份下操作')
        act_on_task(conn, task_id, body.action, body.role, body.note, body.confirmed)
        return view_candidate(conn, row['candidate_id'])


@app.post('/api/agent/chat')
def agent_chat(body: ChatRequest):
    if body.role == 'candidate' and not body.candidate_id:
        raise HTTPException(422, '候选人会话需要指定当前候选人')
    if body.candidate_id:
        with connect() as conn:
            candidate_row(conn, body.candidate_id)
    return chat(body.message, body.role, body.candidate_id)


@app.get('/api/agent/logs')
def logs():
    with connect() as conn:
        return [dict(l) for l in conn.execute('SELECT * FROM tool_logs ORDER BY id DESC LIMIT 100')]


@app.post('/api/proposals/{proposal_id}/confirm')
def confirm(proposal_id: int, body: HumanAction):
    if body.role != 'hr' or not body.confirmed:
        raise HTTPException(403, '督办发送需要 HR 人工确认')
    with connect() as conn:
        p = conn.execute('SELECT * FROM proposals WHERE id=?', (proposal_id,)).fetchone()
        if not p:
            raise HTTPException(404, '建议不存在')
        result = create_followup_task(conn, p['candidate_id'], confirmed=True, proposal_id=proposal_id)
        conn.execute('''INSERT INTO tool_logs(run_id,mode,role,tool,arguments,result,success,duration_ms,created_at)
                        VALUES(?,?,?,?,?,?,?,?,?)''', (uuid.uuid4().hex[:12], 'human', 'hr', 'create_followup_task',
                        json.dumps({'proposal_id': proposal_id, 'confirmed': True}), json.dumps(result, ensure_ascii=False), 1, 0, now()))
        return result


@app.post('/api/followups/{followup_id}/complete')
def complete_followup(followup_id: int, body: HumanAction):
    if body.role != 'hr' or not body.confirmed:
        raise HTTPException(403, '需要 HR 人工确认')
    with connect() as conn:
        followup = conn.execute('SELECT * FROM followups WHERE id=?', (followup_id,)).fetchone()
        if not followup:
            raise HTTPException(404, '督办任务不存在')
        if followup['status'] != 'open':
            raise HTTPException(409, '该督办已处理')
        conn.execute("UPDATE followups SET status='completed' WHERE id=?", (followup_id,))
        event(conn, followup['candidate_id'], 'hr', '完成督办', followup['title'])
        return {'status': 'completed'}


@app.get('/api/workflow')
def workflow():
    return CONFIG
