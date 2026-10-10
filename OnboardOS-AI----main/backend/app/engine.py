"""All business routing and dependency gates live here, never in the frontend."""
import json
from pathlib import Path
from fastapi import HTTPException
from .db import now, event

CONFIG = json.loads(Path(__file__).with_name('workflow.json').read_text(encoding='utf-8'))


def generate_tasks(conn, candidate):
    if candidate['status'] != 'draft':
        raise HTTPException(409, '该候选人的入职流程已经启动，请勿重复发送。')
    templates = [t for t in CONFIG['tasks'] if all(candidate[k] == v for k, v in t.get('when', {}).items())]
    groups = {'$documents': [t['code'] for t in templates if t['kind'] == 'document'],
              '$services': [t['code'] for t in templates if t['kind'] == 'service']}
    for t in templates:
        deps = [code for dep in t['dependencies'] for code in groups.get(dep, [dep])]
        conn.execute('''INSERT INTO tasks(candidate_id,code,title,kind,owner,status,dependencies,description,updated_at)
                       VALUES(?,?,?,?,?,?,?,?,?)''',
                     (candidate['id'], t['code'], t['title'], t['kind'], t['owner'],
                      'blocked' if deps else 'pending', json.dumps(deps), t['description'], now()))
    conn.execute("UPDATE candidates SET status='active' WHERE id=?", (candidate['id'],))
    event(conn, candidate['id'], 'hr', '发送 Offer / 启动入职流程', f"已按 {CONFIG['version']} 生成 {len(templates)} 项任务")


def sync_dependencies(conn, candidate_id):
    tasks = conn.execute('SELECT * FROM tasks WHERE candidate_id=?', (candidate_id,)).fetchall()
    state = {t['code']: t['status'] for t in tasks}
    for task in tasks:
        if task['status'] not in ('pending', 'blocked'):
            continue
        ready = all(state.get(d) == 'completed' for d in json.loads(task['dependencies']))
        status = 'pending' if ready else 'blocked'
        if status != task['status']:
            conn.execute('UPDATE tasks SET status=?, updated_at=? WHERE id=?', (status, now(), task['id']))
    final = state.get('final')
    if final == 'completed':
        conn.execute("UPDATE candidates SET status='onboarded' WHERE id=?", (candidate_id,))


def allowed_actions(task):
    if task['status'] in ('completed', 'blocked'):
        return []
    if task['status'] == 'pending_review':
        return [{'action': 'approve', 'role': 'hr', 'label': '审核通过'},
                {'action': 'reject', 'role': 'hr', 'label': '退回补充'}]
    if task['owner'] == 'candidate':
        return [{'action': 'complete' if task['code'] == 'offer' else 'submit', 'role': 'candidate',
                 'label': '确认 Offer' if task['code'] == 'offer' else '提交模拟材料'}]
    if task['owner'] == 'external':
        if task['status'] == 'pending':
            return [{'action': 'accept', 'role': 'external', 'label': '接收任务'}]
        return [{'action': 'progress', 'role': 'external', 'label': '更新进度'},
                {'action': 'submit_result', 'role': 'external', 'label': '提交模拟结果'}]
    return [{'action': 'complete', 'role': 'hr', 'label': '确认正式入职' if task['kind'] == 'final' else '确认材料完整'}]


def act_on_task(conn, task_id, action, role, note='', confirmed=False):
    task = conn.execute('SELECT * FROM tasks WHERE id=?', (task_id,)).fetchone()
    if not task:
        raise HTTPException(404, '任务不存在')
    tasks = conn.execute('SELECT code,status FROM tasks WHERE candidate_id=?', (task['candidate_id'],)).fetchall()
    states = {t['code']: t['status'] for t in tasks}
    unfinished = [d for d in json.loads(task['dependencies']) if states.get(d) != 'completed']
    if unfinished:
        raise HTTPException(409, '前置任务尚未完成，不能跳过依赖：' + '、'.join(unfinished))
    if not any(a['action'] == action and a['role'] == role for a in allowed_actions(task)):
        raise HTTPException(409, '当前角色或任务状态不允许此操作')
    if action in ('approve', 'reject') or task['kind'] in ('review', 'final'):
        if not confirmed:
            raise HTTPException(409, '此操作需要人工确认')
    if action == 'reject' and not note.strip():
        raise HTTPException(422, '退回时请填写补充要求')
    if action == 'progress' and not note.strip():
        raise HTTPException(422, '请填写服务进度')
    status = {'complete': 'completed', 'submit': 'pending_review', 'accept': 'in_progress',
              'progress': 'in_progress', 'submit_result': 'pending_review',
              'approve': 'completed', 'reject': 'pending'}[action]
    result = note.strip() or {'submit': '已提交虚构演示材料；等待 HR 审核',
                              'submit_result': '模拟服务已完成，无真实调查或健康数据；等待 HR 人工确认',
                              'approve': task['result'], 'complete': '已由操作人确认'}.get(action, task['result'])
    conn.execute('UPDATE tasks SET status=?,result=?,updated_at=? WHERE id=?', (status, result, now(), task_id))
    labels = {'complete': '人工完成', 'submit': '提交模拟材料', 'accept': '外服接收任务', 'progress': '外服更新进度',
              'submit_result': '外服回传模拟结果', 'approve': 'HR 审核通过', 'reject': 'HR 退回补充'}
    event(conn, task['candidate_id'], role, labels[action], f"{task['title']} · {result}")
    sync_dependencies(conn, task['candidate_id'])
