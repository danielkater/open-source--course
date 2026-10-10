import itertools
from conftest import task, action
from app.db import connect


def new(client, **overrides):
    data = dict(name='测试模拟候选人', identity='graduate', job_category='staff', position='测试工程师',
                employment='direct', department='演示部门', start_date='2026-12-01')
    data.update(overrides)
    response = client.post('/api/candidates', json=data)
    assert response.status_code == 201
    return response.json()


def test_seed_cases_are_distinct_and_blocked(client):
    a, b = client.get('/api/workspace').json()['candidates']
    assert a['name'] == '张晨' and b['name'] == '刘静'
    assert '三方协议' in a['missing_documents']
    assert task(a, 'materials_review')['status'] == 'blocked'
    assert {'background', 'dispatch'} <= {t['code'] for t in b['tasks']}
    assert 'tripartite' not in {t['code'] for t in b['tasks']}


import pytest
@pytest.mark.parametrize('identity,job,employment', list(itertools.product(['graduate','experienced'],['staff','executive'],['direct','dispatch'])))
def test_all_rule_combinations_persist(client, identity, job, employment):
    c = new(client, identity=identity, job_category=job, employment=employment)
    assert c['status'] == 'draft' and c['tasks'] == []
    r = client.post(f"/api/candidates/{c['id']}/launch", json={'role':'hr'})
    assert r.status_code == 200
    c = r.json()
    codes = {t['code'] for t in c['tasks']}
    assert ('tripartite' in codes) == (identity == 'graduate')
    assert ('background' in codes) == (job == 'executive')
    assert ('dispatch' in codes) == (employment == 'dispatch')
    assert {'offer','basic_docs','materials_review','medical','final'} <= codes
    assert client.get(f"/api/candidates/{c['id']}").json()['tasks'] == c['tasks']
    assert client.post(f"/api/candidates/{c['id']}/launch", json={'role':'hr'}).status_code == 409


def test_complete_cross_role_loop_and_manual_gates(client):
    c = new(client, identity='experienced', job_category='executive', employment='dispatch')
    c = client.post(f"/api/candidates/{c['id']}/launch", json={'role':'hr'}).json()
    assert action(client,c,'final','complete','hr',confirmed=True).status_code == 409
    assert action(client,c,'basic_docs','submit','candidate').status_code == 409
    c = action(client,c,'offer','complete','candidate').json()
    c = action(client,c,'basic_docs','submit','candidate').json()
    assert task(c,'basic_docs')['status'] == 'pending_review'
    assert task(c,'materials_review')['status'] == 'blocked'
    assert action(client,c,'basic_docs','approve','hr').status_code == 409
    c = action(client,c,'basic_docs','approve','hr',confirmed=True).json()
    c = action(client,c,'dispatch','submit','candidate').json()
    c = action(client,c,'dispatch','approve','hr',confirmed=True).json()
    assert task(c,'materials_review')['status'] == 'pending'
    c = action(client,c,'materials_review','complete','hr',confirmed=True).json()
    for code in ('background','medical'):
        assert action(client,c,code,'submit_result','external').status_code == 409
        c = action(client,c,code,'accept','external').json()
        c = action(client,c,code,'progress','external',note='模拟协调进行中').json()
        c = action(client,c,code,'submit_result','external',note='虚构服务完成，仅供演示').json()
        assert task(c,code)['status'] == 'pending_review'
        assert task(c,'final')['status'] == 'blocked'
        assert action(client,c,code,'approve','external',confirmed=True).status_code == 409
        c = action(client,c,code,'approve','hr',confirmed=True).json()
    assert task(c,'final')['status'] == 'pending'
    assert action(client,c,'final','complete','hr').status_code == 409
    c = action(client,c,'final','complete','hr',confirmed=True).json()
    assert c['status'] == 'onboarded' and c['progress'] == 100
    with connect() as conn:
        assert conn.execute('SELECT status FROM candidates WHERE id=?',(c['id'],)).fetchone()[0] == 'onboarded'


def test_rejection_resubmission_and_candidate_scope(client):
    c = client.get('/api/candidates/1').json()
    assert client.post(f"/api/tasks/{task(c,'tripartite')['id']}/action", json={'role':'candidate','candidate_id':2,'action':'submit'}).status_code == 403
    c = action(client,c,'tripartite','submit','candidate').json()
    assert action(client,c,'tripartite','reject','hr',confirmed=True).status_code == 422
    c = action(client,c,'tripartite','reject','hr',confirmed=True,note='请补充模拟签字页').json()
    assert task(c,'tripartite')['status'] == 'pending'
    assert task(c,'materials_review')['status'] == 'blocked'
    c = action(client,c,'tripartite','submit','candidate').json()
    c = action(client,c,'tripartite','approve','hr',confirmed=True).json()
    assert task(c,'materials_review')['status'] == 'pending'


def test_validation_and_role_errors(client):
    assert client.post('/api/candidates',json={'name':'   '}).status_code == 422
    assert client.get('/api/candidates/9999').status_code == 404
    assert client.post('/api/candidates/1/launch',json={'role':'external'}).status_code == 403
    assert client.post('/api/tasks/9999/action',json={'role':'hr','action':'approve','confirmed':True}).status_code == 404
