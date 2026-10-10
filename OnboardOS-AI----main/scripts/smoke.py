"""Read the running demo via the frontend proxy; only tool audit logs are written."""
import json
import httpx


def main():
    with httpx.Client(base_url='http://127.0.0.1:5173', timeout=30) as client:
        web = client.get('/')
        assert web.status_code == 200 and 'root' in web.text
        health = client.get('/api/health').raise_for_status().json()
        workspace = client.get('/api/workspace').raise_for_status().json()
        candidates = workspace['candidates']
        assert len(candidates) >= 2
        a = next(c for c in candidates if c['name'] == '张晨')
        b = next(c for c in candidates if c['name'] == '刘静')
        assert 'tripartite' in {t['code'] for t in a['tasks']}
        assert {'background','dispatch'} <= {t['code'] for t in b['tasks']}
        reply = client.post('/api/agent/chat', json={'role':'candidate', 'candidate_id':a['id'],
                            'message':'我还有什么材料没交？请查询缺失材料。'}).raise_for_status().json()
        assert reply['logs'] and all(l['success'] for l in reply['logs'])
        missing_log = next(l for l in reply['logs'] if l['tool'] == 'get_missing_documents')
        assert json.loads(missing_log['result'])[0]['missing'] == a['missing_documents']
        stored = client.get('/api/agent/logs').raise_for_status().json()
        assert any(l['run_id'] == reply['run_id'] for l in stored)
        print(json.dumps({'web':'ok','api':health['status'],'database':health['database'],
                          'mode':reply['mode'],'candidate_count':len(candidates),
                          'case_task_counts':[a['total'],b['total']], 'real_tool_logs':len(reply['logs']),
                          'database_result_verified':True,'run_id':reply['run_id']}))


if __name__ == '__main__':
    main()
