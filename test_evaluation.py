# =============================================================================
# FairMod — evaluation bench tests (evaluation.py)
# =============================================================================
# Fake classifier + in-memory DB + a tiny temp test set, so it runs without
# the model:   python test_evaluation.py
# =============================================================================

import os
import sys
import tempfile

from fastapi import FastAPI
from fastapi.testclient import TestClient

from evaluation import compute_metrics, make_router, parse_label

def fake_p(text):
    return 0.9 if 'bad' in text else 0.1

def fake_classify(text):
    if not text.strip():
        raise ValueError("empty")
    p = fake_p(text)
    return {'probabilities': {'normal': 1 - p, 'abusive': p}, 'latency_ms': 2.0,
            'word_scores': [{'word': w, 'score': 0.9 if w == 'bad' else -0.1} for w in text.split()]}

tmp = tempfile.NamedTemporaryFile('w', suffix='.csv', delete=False, encoding='utf-8')
tmp.write("text,label,language,source\n")
for i in range(6):
    tmp.write(f"bad thing {i},1,hi,macd\nnice thing {i},0,hi,macd\nbad word {i},1,bn,bengali_hs\nok word {i},0,bn,bengali_hs\n")
tmp.close()

app = FastAPI()
app.include_router(make_router(fake_classify, lambda ts: [fake_p(t) for t in ts], ':memory:', tmp.name))
c = TestClient(app)

failures = 0
def check(name, cond, info=''):
    global failures
    print(f"{'PASS' if cond else 'FAIL'}  {name:40} {info}")
    failures += not cond

check('labels: words and numbers', [parse_label(x) for x in ['abusive', 'Normal', 1, '0', 'hate', 'x', None]]
      == [1, 0, 1, 0, 1, None, None])

m = compute_metrics([
    {'expected': 1, 'predicted': 1, 'language': 'hi', 'confidence': .9, 'latency_ms': 1},
    {'expected': 1, 'predicted': 0, 'language': 'hi', 'confidence': .6, 'latency_ms': 1},
    {'expected': 0, 'predicted': 0, 'language': 'bn', 'confidence': .8, 'latency_ms': 1},
    {'expected': 0, 'predicted': 1, 'language': 'bn', 'confidence': .7, 'latency_ms': 1},
    {'expected': None, 'predicted': 1, 'language': 'bn', 'confidence': .7, 'latency_ms': 1},
])
check('metrics: accuracy / macro-F1', m['accuracy'] == 0.5 and abs(m['macro_f1'] - 0.5) < 1e-9)
check('metrics: confusion + unlabelled', m['confusion'] == {'tp': 1, 'tn': 1, 'fp': 1, 'fn': 1} and m['unlabelled'] == 1)
check('metrics: per language', set(m['by_language']) == {'hi', 'bn'} and m['by_language']['hi']['n'] == 2)

d = c.get('/eval/datasets').json()
check('datasets', d['total'] == 24 and d['languages']['hi'] == {'abusive': 6, 'normal': 6})
s = c.get('/eval/sample', params={'per_cell': 2, 'languages': 'hi,bn'}).json()['items']
check('sample is stratified', len(s) == 8 and sum(i['label'] for i in s) == 4)

p = c.post('/eval/predict', json={'items': [{'text': 'so bad', 'label': 'abusive'}, {'text': 'lovely', 'label': 'normal'},
                                            {'text': '  '}]}).json()['results']
check('predict: skips empty, scores both', len(p) == 2 and all(r['correct'] for r in p))
check('predict: word scores present', p[0]['word_scores'][1] == {'word': 'bad', 'score': 0.9})

r = c.post('/eval/run', json={'items': s, 'explain': False}).json()
check('run: fast path perfect on fake data', r['metrics']['macro_f1'] == 1.0 and r['results'][0]['word_scores'] is None)
check('run: language from input kept', {x['language'] for x in r['results']} == {'hi', 'bn'})

saved = c.post('/eval/runs', json={'name': 'demo', 'source': 'test', 'results': r['results']}).json()
runs = c.get('/eval/runs').json()
check('runs: saved and listed', runs[0]['id'] == saved['id'] and runs[0]['metrics']['n'] == 8)
check('runs: fetch full', len(c.get(f"/eval/runs/{saved['id']}").json()['results']) == 8)
check('runs: delete', c.delete(f"/eval/runs/{saved['id']}").status_code == 200 and c.get('/eval/runs').json() == [])

os.unlink(tmp.name)
print('\nAll evaluation checks passed.' if not failures else f'\n{failures} check(s) FAILED.')
sys.exit(1 if failures else 0)
