import json
from datetime import date, timedelta
from fastapi import HTTPException
from .db import now, today, event
from .engine import generate_tasks, allowed_actions, sync_dependencies


def candidate_row(conn, candidate_id):
    row = conn.execute('SELECT * FROM candidates WHERE id=?', (candidate_id,)).fetchone()
    if not row:
        raise HTTPException(404, '候选人不存在')
    return dict(row)


def view_candidate(conn, candidate_id):
    c = candidate_row(conn, candidate_id)
    tasks = [dict(t) for t in conn.execute('SELECT * FROM tasks WHERE candidate_id=? ORDER BY id', (candidate_id,))]
    state = {t['code']: t for t in tasks}
    for t in tasks:
        t['dependencies'] = json.loads(t['dependencies'])
        t['blocked_by'] = [state[d]['title'] for d in t['dependencies'] if state[d]['status'] != 'completed']
        t['actions'] = allowed_actions(t)
    c['tasks'] = tasks
    c['completed'] = sum(t['status'] == 'completed' for t in tasks)
    c['total'] = len(tasks)
    c['progress'] = round(c['completed'] / len(tasks) * 100) if tasks else 0
    c['days_until_start'] = (date.fromisoformat(c['start_date']) - today()).days
    c['missing_documents'] = [t['title'] for t in tasks if t['kind'] == 'document' and t['status'] in ('pending', 'blocked')]
    incomplete = [t for t in tasks if t['status'] != 'completed']
    # Scheduling heuristics only, not legal or hiring judgements.
    c['risk'] = 'high' if incomplete and c['days_until_start'] <= 7 else 'medium' if incomplete and c['days_until_start'] <= 14 else 'normal'
    c['risk_reasons'] = ([f"距入职 {c['days_until_start']} 天，仍有 {len(incomplete)} 项任务未完成"] if c['risk'] != 'normal' else [])
    if c['missing_documents']:
        c['risk_reasons'].append('待补交：' + '、'.join(c['missing_documents']))
    c['events'] = [dict(e) for e in conn.execute('SELECT * FROM events WHERE candidate_id=? ORDER BY id DESC LIMIT 30', (candidate_id,))]
    c['notifications'] = [dict(n) for n in conn.execute('SELECT * FROM notifications WHERE candidate_id=? ORDER BY id DESC', (candidate_id,))]
    return c


def list_candidates(conn):
    return [view_candidate(conn, r['id']) for r in conn.execute('SELECT id FROM candidates ORDER BY id')]


def insert_candidate(conn, data):
    cur = conn.execute('''INSERT INTO candidates(name,identity,job_category,position,employment,department,start_date,created_at)
                          VALUES(?,?,?,?,?,?,?,?)''',
                       (data['name'].strip(), data['identity'], data['job_category'], data['position'].strip(),
                        data['employment'], data['department'].strip(), str(data['start_date']), now()))
    event(conn, cur.lastrowid, 'hr', '创建候选人', '虚构模拟数据')
    return cur.lastrowid


def seed(conn):
    if conn.execute('SELECT COUNT(*) FROM candidates').fetchone()[0]:
        return
    # Next Monday relative to Asia/Shanghai date: always suitable for the live "next week" query.
    monday = today() + timedelta(days=7 - today().weekday())
    examples = [dict(name='张晨', identity='graduate', job_category='staff', position='前端开发工程师',
                     employment='direct', department='技术研发部', start_date=monday),
                dict(name='刘静', identity='experienced', job_category='executive', position='业务发展总监',
                     employment='dispatch', department='战略发展部', start_date=monday + timedelta(days=2))]
    for data in examples:
        cid = insert_candidate(conn, data)
        generate_tasks(conn, candidate_row(conn, cid))
        conn.execute("UPDATE tasks SET status='completed',result='预置演示：已确认 Offer' WHERE candidate_id=? AND code='offer'", (cid,))
        conn.execute("UPDATE tasks SET status='completed',result='预置演示材料已审核' WHERE candidate_id=? AND code='basic_docs'", (cid,))
        if data['name'] == '刘静':
            conn.execute("UPDATE tasks SET status='in_progress',result='预置演示：外服已接收，正在协调模拟调查' WHERE candidate_id=? AND code='background'", (cid,))
        sync_dependencies(conn, cid)
        event(conn, cid, 'system', '演示案例已就绪', '所有身份、材料、服务结果均为虚构；可继续操作主流程')
