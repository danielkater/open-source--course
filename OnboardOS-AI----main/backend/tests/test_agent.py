import json
from datetime import timedelta
from conftest import action
from app.db import connect, today
from app.agent_tools import execute_tool
from app import agent


def test_real_queries_reflect_changed_database(client):
    request = {'role':'candidate','candidate_id':1,'message':'我还有什么材料没交？为什么卡住了？'}
    reply = client.post('/api/agent/chat',json=request).json()
    assert reply['mode'] == 'rules'
    assert '三方协议' in reply['answer'] and '阻塞' in reply['answer']
    assert len(reply['logs']) == 4
    assert {l['tool'] for l in reply['logs']} == {'get_candidate_status','get_missing_documents','find_blocked_tasks','get_external_service_status'}
    assert all(l['success'] == 1 and l['mode'] == 'rules' for l in reply['logs'])
    c = client.get('/api/candidates/1').json()
    action(client,c,'tripartite','submit','candidate')
    reply = client.post('/api/agent/chat',json=request).json()
    assert '待补交：暂无未提交材料' in reply['answer']
    assert '待 HR 审核：三方协议' in reply['answer']
    db_log = client.get('/api/agent/logs').json()[0]
    assert db_log['run_id'] == reply['run_id']


def test_risk_next_week_and_confirmed_followup(client):
    with connect() as conn:
        # Out of range candidate must not leak into a next-week result.
        conn.execute('UPDATE candidates SET start_date=? WHERE id=2', ((today()+timedelta(days=40)).isoformat(),))
    reply = client.post('/api/agent/chat',json={'role':'hr','message':'帮我检查下周入职的候选人，找出延期风险并给出督办建议'}).json()
    assert '张晨' in reply['answer'] and '刘静' not in reply['answer']
    assert '三方协议' in reply['answer'] and '建议' in reply['answer']
    workspace = client.get('/api/workspace').json()
    assert len(workspace['proposals']) == 1 and workspace['followups'] == []
    assert workspace['candidates'][0]['notifications'] == []
    pid = workspace['proposals'][0]['id']
    assert client.post(f'/api/proposals/{pid}/confirm',json={'role':'candidate','confirmed':True}).status_code == 403
    assert client.post(f'/api/proposals/{pid}/confirm',json={'role':'hr','confirmed':False}).status_code == 403
    assert client.post(f'/api/proposals/{pid}/confirm',json={'role':'hr','confirmed':True}).status_code == 200
    assert client.post(f'/api/proposals/{pid}/confirm',json={'role':'hr','confirmed':True}).status_code == 409
    workspace = client.get('/api/workspace').json()
    assert len(workspace['followups']) == 1 and len(workspace['candidates'][0]['notifications']) == 1


def test_policy_and_tool_scope(client):
    reply = client.post('/api/agent/chat',json={'role':'candidate','candidate_id':1,'message':'入职第一天需要准备什么？'}).json()
    assert reply['logs'][0]['tool'] == 'get_onboarding_policy'
    assert '演示报到指引' in reply['answer']
    result = execute_tool('get_candidate_status',{'candidate_id':2},run_id='scope-test',role='candidate',candidate_id=1)
    assert 'error' in result
    result = execute_tool('create_followup_task',{'candidate_id':1,'title':'x','reason':'y'},run_id='scope-test',role='candidate',candidate_id=1)
    assert 'error' in result
    result = execute_tool('create_followup_task',{'candidate_id':1,'confirmed':True},run_id='scope-test',role='hr')
    assert 'error' in result
    assert client.post('/api/agent/chat',json={'role':'candidate','message':'状态'}).status_code == 422


def test_llm_function_loop_with_mock_provider(client, monkeypatch):
    monkeypatch.setenv('LLM_ENABLED','true'); monkeypatch.setenv('LLM_API_KEY','mock-only'); monkeypatch.setenv('LLM_MODEL','mock-model')
    class FakeResponse:
        def __init__(self, content): self.content = content
        def raise_for_status(self): pass
        def json(self): return {'choices':[{'message':self.content}]}
    class FakeClient:
        def __init__(self, **kwargs): self.turn = 0
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def post(self, url, **kwargs):
            self.turn += 1
            if self.turn == 1:
                assert kwargs['json']['tool_choice'] == 'required'
                return FakeResponse({'role':'assistant','content':None,'tool_calls':[{'id':'test1','type':'function','function':{'name':'get_missing_documents','arguments':'{"candidate_id":1}'}}]})
            returned = json.loads(kwargs['json']['messages'][-1]['content'])
            assert returned[0]['missing'] == ['三方协议']
            return FakeResponse({'role':'assistant','content':'真实工具结果显示：张晨缺少三方协议。'})
    monkeypatch.setattr(agent.httpx,'Client',FakeClient)
    reply = client.post('/api/agent/chat',json={'role':'hr','candidate_id':1,'message':'缺少什么材料'}).json()
    assert reply['mode'] == 'llm' and reply['logs'][0]['mode'] == 'llm'
    assert reply['logs'][0]['tool'] == 'get_missing_documents'


def test_llm_failure_explicit_fallback(client, monkeypatch):
    monkeypatch.setenv('LLM_ENABLED','true'); monkeypatch.setenv('LLM_API_KEY','mock-only'); monkeypatch.setenv('LLM_MODEL','mock-model')
    def fail(*a, **k): raise ValueError('mock provider failed')
    monkeypatch.setattr(agent,'llm_reply',fail)
    reply = client.post('/api/agent/chat',json={'role':'candidate','candidate_id':1,'message':'缺什么材料'}).json()
    assert reply['mode'] == 'rules_fallback'
    assert '已切换至规则驱动演示模式' in reply['warning']
    assert all(l['mode'] == 'rules_fallback' for l in reply['logs'])
