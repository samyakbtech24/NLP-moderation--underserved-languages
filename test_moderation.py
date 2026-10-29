# =============================================================================
# FairMod — moderation console tests (moderation.py)
# =============================================================================
# Uses a fake classifier and an in-memory database, so it runs in a second
# without the model:   python test_moderation.py
# =============================================================================

import sys

from fastapi import FastAPI
from fastapi.testclient import TestClient

from moderation import detect_language, make_router

# Fake model: the word "bad" (or "गधे") drives the abusive probability.
SCORES = {'quite': 0.62, 'bad': 0.95, 'awful': 0.75, 'mean': 0.75}

def fake_classify(text):
    text = text.strip()
    if not text:
        raise ValueError("Comment is empty.")
    words = text.split()
    p = max([SCORES.get(w.strip('.,!').lower(), 0.03) for w in words] + [0.95 if 'गधे' in text else 0.0])
    scores = [{'word': w, 'score': 0.9 if w.strip('.,!').lower() in SCORES or 'गधे' in w else -0.2} for w in words]
    return {'probabilities': {'normal': 1 - p, 'abusive': p}, 'word_scores': scores, 'latency_ms': 1.0}

app = FastAPI()
app.include_router(make_router(fake_classify, ':memory:'))
c = TestClient(app)

failures = 0
def check(name, cond, info=''):
    global failures
    print(f"{'PASS' if cond else 'FAIL'}  {name:42} {info}")
    failures += not cond

# language detection
check('detect hi', detect_language('तुम जैसे गधे को कोई अक्ल नहीं है।') == 'hi')
check('detect mr', detect_language('तू एकदम मूर्ख आहेस, गप्प बस.') == 'mr')
check('detect kn', detect_language('ನೀನು ಒಬ್ಬ ಮೂರ್ಖ') == 'kn')
check('detect bn', detect_language('তুই একটা আস্ত গাধা') == 'bn')
check('detect other', detect_language('hello there') == 'other')

# default policies: Balanced active (0.5 / 0.9)
pol = c.get('/mod/policies').json()
check('3 seeded policies, Balanced active', len(pol) == 3 and pol[0]['is_active'] == 1)

r = c.post('/mod/moderate', json={'text': 'have a nice day', 'author': 'asha'}).json()
check('low score → allowed', r['auto_action'] == 'allow' and r['status'] == 'allowed', r['rule'])
r = c.post('/mod/moderate', json={'text': 'that is quite rude', 'author': 'ravi'}).json()
check('mid score → review queue', r['status'] == 'pending' and r['decided_at'] is None, r['auto_reason'][:60])
pending_id = r['id']
r = c.post('/mod/moderate', json={'text': 'you are bad', 'author': 'ravi'}).json()
check('high score → removed', r['status'] == 'removed' and r['rule'] == 'auto_remove')
check('reason names key words', 'bad' in r['auto_reason'], r['auto_reason'][-40:])
check('author strikes counted', r['author_strikes'] == 1)

check('empty text → 422', c.post('/mod/moderate', json={'text': '   '}).status_code == 422)

# moderator decision on queued item
d = c.post(f'/mod/items/{pending_id}/decision',
           json={'decision': 'remove', 'moderator': 'meera', 'category': 'Insult / harassment', 'note': 'rude'}).json()
check('decision removes + records moderator', d['status'] == 'removed' and d['decided_by'] == 'meera')
check('final reason has statement', 'Removed by moderator meera after review' in d['final_reason'])
check('queue now empty', c.get('/mod/items', params={'status': 'pending'}).json()['total'] == 0)

# blocklist beats the model; Hindi inflection matches via substring
c.post('/mod/lists', json={'list': 'block', 'term': 'nasty'})
r = c.post('/mod/moderate', json={'text': 'what a nasty take'}).json()
check('blocklist → removed', r['rule'] == 'blocklist' and r['status'] == 'removed')
check('duplicate term → 409', c.post('/mod/lists', json={'list': 'block', 'term': 'nasty'}).status_code == 409)
c.post('/mod/lists', json={'list': 'block', 'term': 'kutta', 'language': 'bn'})
r = c.post('/mod/moderate', json={'text': 'kutta here'}).json()
check('language-scoped term ignored elsewhere', r['rule'] != 'blocklist')

# allowlist: every evidence word is allowlisted → allow
c.post('/mod/lists', json={'list': 'allow', 'term': 'awful'})
r = c.post('/mod/moderate', json={'text': 'the weather is awful'}).json()
check('allowlist → allowed', r['rule'] == 'allowlist' and r['status'] == 'allowed', r['auto_reason'][:50])

# policy switch changes routing
strict = next(p for p in pol if p['name'].startswith('Strict'))
c.post(f"/mod/policies/{strict['id']}/activate")
r = c.post('/mod/moderate', json={'text': 'you are mean'}).json()
check('strict policy removes 0.75', r['status'] == 'removed' and r['policy_name'].startswith('Strict'))
bad = c.put(f"/mod/policies/{strict['id']}", json={'name': 'x', 'review_threshold': 0.9, 'remove_threshold': 0.5})
check('review > remove rejected', bad.status_code == 422)

# batch, analytics, audit, export
b = c.post('/mod/moderate/batch', json={'items': [{'text': 'fine'}, {'text': ''}, {'text': 'bad bad'}]}).json()
check('batch summary + skip empty', b['skipped'] == 1 and b['summary']['remove'] == 1)
a = c.get('/mod/analytics').json()
check('analytics totals', a['total'] == 9 and a['human_reviewed'] == 1 and a['agreement'] == 1.0, a['status'])
check('analytics top words', any(w['word'] == 'bad' for w in a['top_words']))
events = [e['event'] for e in c.get('/mod/audit').json()]
check('audit log', {'item.decision', 'blocklist.added', 'policy.activated'} <= set(events), events[:4])
csv_text = c.get('/mod/export.csv').text
check('csv export', csv_text.count('\n') == 10 and 'final_reason' in csv_text)

print('\nAll moderation checks passed.' if not failures else f'\n{failures} check(s) FAILED.')
sys.exit(1 if failures else 0)
