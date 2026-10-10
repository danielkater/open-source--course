"""Six real business tools, shared by deterministic and LLM orchestration."""
import json
import time
from datetime import timedelta
from fastapi import HTTPException
from .db import connect, today, now, event
from .service import list_candidates, view_candidate, candidate_row
from .engine import CONFIG


def scope(conn, candidate_id=None, period='all'):
    candidates = [view_candidate(conn, candidate_id)] if candidate_id else list_candidates(conn)
    if period == 'next_week':
        monday = today() + timedelta(days=7 - today().weekday())
        candidates = [c for c in candidates if monday.isoformat() <= c['start_date'] <= (monday + timedelta(days=6)).isoformat()]
    return candidates


def get_candidate_status(conn, candidate_id=None, period='all'):
    return [{k: c[k] for k in ('id', 'name', 'start_date', 'status', 'progress', 'completed', 'total',
                               'days_until_start', 'risk', 'risk_reasons')} | {
        'unfinished_tasks': [{'title': t['title'], 'owner': t['owner'], 'status': t['status']}
                             for t in c['tasks'] if t['status'] != 'completed']
    } for c in scope(conn, candidate_id, period)]


def get_missing_documents(conn, candidate_id=None, period='all'):
    return [{'candidate_id': c['id'], 'name': c['name'], 'missing': c['missing_documents'],
             'awaiting_review': [t['title'] for t in c['tasks'] if t['kind'] == 'document' and t['status'] == 'pending_review']}
            for c in scope(conn, candidate_id, period)]


def find_blocked_tasks(conn, candidate_id=None, period='all'):
    return [{'candidate_id': c['id'], 'name': c['name'], 'blocked': [
        {'title': t['title'], 'blocked_by': t['blocked_by'],
         'suggestion': '先完成并人工审核：' + '、'.join(t['blocked_by'])}
        for t in c['tasks'] if t['status'] == 'blocked']}
        for c in scope(conn, candidate_id, period)]


def get_external_service_status(conn, candidate_id=None, period='all'):
    return [{'candidate_id': c['id'], 'name': c['name'], 'services': [
        {k: t[k] for k in ('title', 'status', 'result', 'updated_at')} for t in c['tasks'] if t['kind'] == 'service']}
        for c in scope(conn, candidate_id, period)]


def create_followup_task(conn, candidate_id, title='补交材料与流程督办', reason='请跟进入职未完成事项', *, confirmed=False, proposal_id=None):
    candidate_row(conn, candidate_id)
    if not confirmed:
        existing = conn.execute("SELECT * FROM proposals WHERE candidate_id=? AND title=? AND status='pending'", (candidate_id, title)).fetchone()
        if existing:
            return dict(existing) | {'requires_confirmation': True, 'message': '建议已保存，等待 HR 人工确认；尚未发送提醒。'}
        cur = conn.execute('INSERT INTO proposals(candidate_id,title,reason,created_at) VALUES(?,?,?,?)',
                           (candidate_id, title, reason, now()))
        event(conn, candidate_id, 'agent', '生成督办建议', title + '；尚未发送')
        return {'id': cur.lastrowid, 'candidate_id': candidate_id, 'title': title, 'reason': reason,
                'status': 'pending', 'requires_confirmation': True, 'message': '等待 HR 人工确认；尚未发送提醒。'}
    proposal = conn.execute('SELECT * FROM proposals WHERE id=? AND candidate_id=?', (proposal_id, candidate_id)).fetchone()
    if not proposal:
        raise HTTPException(404, '督办建议不存在')
    if proposal['status'] != 'pending':
        raise HTTPException(409, '此建议已处理，请勿重复确认')
    cur = conn.execute('INSERT INTO followups(candidate_id,proposal_id,title,created_at) VALUES(?,?,?,?)',
                       (candidate_id, proposal_id, proposal['title'], now()))
    conn.execute("UPDATE proposals SET status='confirmed' WHERE id=?", (proposal_id,))
    conn.execute('INSERT INTO notifications(candidate_id,message,created_at) VALUES(?,?,?)',
                 (candidate_id, proposal['title'] + '：' + proposal['reason'], now()))
    event(conn, candidate_id, 'hr', '确认督办并发送站内提醒', proposal['title'])
    return {'followup_id': cur.lastrowid, 'status': 'open', 'channel': '仅站内模拟消息', 'message': 'HR 已确认，督办任务和站内提醒已写入数据库。'}


def get_onboarding_policy(conn, topic='first_day'):
    return {'topic': topic, 'content': CONFIG['policies'].get(topic, CONFIG['policies']['first_day']),
            'notice': CONFIG['notice'], 'source': 'workflow.json / demo-1.0'}


FUNCTIONS = {f.__name__: f for f in (get_candidate_status, get_missing_documents, find_blocked_tasks,
                                    get_external_service_status, create_followup_task, get_onboarding_policy)}
DESCRIPTIONS = {
    'get_candidate_status': '查询候选人真实入职进度、未完成任务和基于日期的风险。period=next_week 严格筛选下周一至周日。',
    'get_missing_documents': '查询尚未提交及已提交待审核材料。',
    'find_blocked_tasks': '查询真实被阻塞任务、前置依赖和处理建议。',
    'get_external_service_status': '查询外服服务真实状态及模拟回传结果。',
    'create_followup_task': '为候选人创建待 HR 确认的督办建议。不会发送通知或改变审批状态。',
    'get_onboarding_policy': '读取虚构演示政策、第一天报到指引或审核规则。'}


def tool_schemas(role):
    schemas = []
    for name in FUNCTIONS:
        if name == 'create_followup_task' and role != 'hr':
            continue
        properties = {'candidate_id': {'type': 'integer', 'description': '候选人 ID；省略则查询当前授权范围内全部候选人'},
                      'period': {'type': 'string', 'enum': ['all', 'next_week']}}
        required = []
        if name == 'create_followup_task':
            properties = {'candidate_id': {'type': 'integer'}, 'title': {'type': 'string', 'maxLength': 120},
                          'reason': {'type': 'string', 'maxLength': 1000}}
            required = ['candidate_id', 'title', 'reason']
        elif name == 'get_onboarding_policy':
            properties = {'topic': {'type': 'string', 'enum': ['first_day', 'materials', 'approval']}}
        schemas.append({'type': 'function', 'function': {'name': name, 'description': DESCRIPTIONS[name],
                        'parameters': {'type': 'object', 'properties': properties, 'required': required, 'additionalProperties': False}}})
    return schemas


def execute_tool(name, arguments, *, run_id, role, candidate_id=None, mode='rules'):
    start = time.perf_counter()
    success = False
    executed_arguments = arguments
    try:
        schema = next((s['function']['parameters'] for s in tool_schemas(role) if s['function']['name'] == name), None)
        if schema is None:
            raise ValueError('当前角色不允许调用该工具')
        args = dict(arguments)
        if set(args) - set(schema['properties']) or any(k not in args for k in schema['required']):
            raise ValueError('工具参数不合法')
        for key, value in args.items():
            spec = schema['properties'][key]
            if spec['type'] == 'integer' and (type(value) is not int or value <= 0):
                raise ValueError('候选人 ID 必须为正整数')
            if spec['type'] == 'string' and (not isinstance(value, str) or len(value) > spec.get('maxLength', 1000)):
                raise ValueError('工具字符串参数不合法')
            if 'enum' in spec and value not in spec['enum']:
                raise ValueError('工具参数不在允许范围内')
        if role == 'candidate' and name != 'get_onboarding_policy':
            if not candidate_id or args.get('candidate_id', candidate_id) != candidate_id:
                raise ValueError('候选人只能查询当前演示身份的流程')
            args['candidate_id'] = candidate_id
        executed_arguments = args
        with connect() as conn:
            result = FUNCTIONS[name](conn, **args)
        success = True
    except (ValueError, TypeError, HTTPException) as exc:
        result = {'error': exc.detail if isinstance(exc, HTTPException) else str(exc)}
    with connect() as conn:
        conn.execute('''INSERT INTO tool_logs(run_id,mode,role,tool,arguments,result,success,duration_ms,created_at)
                        VALUES(?,?,?,?,?,?,?,?,?)''', (run_id, mode, role, name, json.dumps(executed_arguments, ensure_ascii=False),
                        json.dumps(result, ensure_ascii=False), int(success), round((time.perf_counter()-start)*1000), now()))
    return result
