#!/usr/bin/env python3
"""Load FL Sunbiz + IL LLC registry files into Supabase business_owners.* (batched, few connections).

Env: BO_SUPABASE_URL, BO_SUPABASE_KEY (anon/publishable), BO_LOAD_TOKEN (checked by sha256 in
business_owners.api_token). Never prints secrets.
Inputs: FL_SUNBIZ_DIR (fl_active.sorted.tsv, fic_active.sorted.tsv from build_fl_sunbiz.py),
        IL_DTA_DIR (.extracted/llcallnam.txt, llcallase.txt, llcallmst.txt, llcallmgr.txt).
Usage: python3 scripts/load_registry_supabase.py [fl_entity fl_officer fl_fictitious il_llc il_llc_name il_llc_manager] [--truncate]
"""
import json, os, re, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
URL, KEY, TOK = os.environ['BO_SUPABASE_URL'].rstrip('/'), os.environ['BO_SUPABASE_KEY'], os.environ['BO_LOAD_TOKEN']
FL = os.environ.get('FL_SUNBIZ_DIR', '/tmp/fl-sunbiz'); IL = os.environ.get('IL_DTA_DIR', '/tmp/il-dta-cache') + '/.extracted'
DBPR_URL = 'https://www2.myfloridalicense.com/sto/file_download/extracts/CONSTRUCTIONLICENSE_1.csv'  # free DBPR public extract
BATCH = int(os.environ.get('BO_BATCH', '2000')); LANES = int(os.environ.get('BO_LANES', '2'))
def rpc(fn, body, tries=6):
    data = json.dumps(body).encode()
    for i in range(tries):
        try:
            req = urllib.request.Request(f'{URL}/rest/v1/rpc/{fn}', data=data, headers={'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json'})
            raw = urllib.request.urlopen(req, timeout=120).read()
            return json.loads(raw) if raw.strip() else None
        except Exception as e:
            if i == tries - 1: raise
            time.sleep(2 * (i + 1))
def norm(n):
    n = n.upper().replace('&', ' AND ')
    n = re.sub(r'\b(L\s*\.?\s*L\s*\.?\s*C\.?|LLC|INC|INCORPORATED|CORP|CORPORATION|CO|COMPANY|LTD|THE|SERIES)\b\.?', ' ', n)
    return re.sub(r'[^A-Z0-9]', '', n)
def il_person(raw):
    n = ' '.join(raw.split())
    m = re.match(r'^([^,]+),\s*(.+)$', n)
    return f'{m.group(2)} {m.group(1)}' if m else n
def rows(tbl):
    if tbl in ('fl_entity', 'fl_officer'):
        for l in open(f'{FL}/fl_active.sorted.tsv', encoding='latin-1'):
            c = l.rstrip('\n').split('\t')
            if len(c) < 9: continue
            if tbl == 'fl_entity':
                yield dict(doc=c[1], name_key=c[0], city=c[2], principal_street=c[3], mail_street=c[4], ra_name=c[5], ra_type=c[6], ra_street=c[7])
            else:
                for o in filter(None, c[8].split('|')):
                    p = o.split(':', 2)
                    if len(p) == 3 and p[1]: yield dict(doc=c[1], title=p[0], name=p[1], street=p[2])
    elif tbl == 'fl_fictitious':
        for l in open(f'{FL}/fic_active.sorted.tsv', encoding='latin-1'):
            c = l.rstrip('\n').split('\t')
            if len(c) >= 8: yield dict(doc=c[1], name_key=c[0], city=c[2], street=c[3], owner_name=c[4], owner_type=c[5], owner_street=c[6], owner_doc=c[7])
    elif tbl == 'fl_license':
        import csv, io
        path = f'{FL}/CONSTRUCTIONLICENSE_1.csv'
        if not os.path.exists(path):
            urllib.request.urlretrieve(DBPR_URL, path)
        for c in csv.reader(open(path, encoding='latin-1')):
            if len(c) < 15 or not c[3].strip(): continue
            k = norm(c[3])
            if len(k) >= 3: yield dict(name_key=k, license_no=c[12], **{'class': c[1]}, person=il_person(c[2]).upper(), city=c[8].strip().upper(), status=c[14])
    elif tbl == 'il_llc':
        for l in open(f'{IL}/llcallmst.txt', encoding='latin-1'):
            if re.match(r'^\d{8}', l): yield dict(file=l[0:8], city=l[88:118].strip().upper())
    elif tbl == 'il_llc_name':
        for fn, kind, a, b in (('llcallnam.txt', 'legal', 8, 128), ('llcallase.txt', 'assumed', 42, 162)):
            for l in open(f'{IL}/{fn}', encoding='latin-1'):
                if re.match(r'^\d{8}', l):
                    k = norm(l[a:b].strip())
                    if len(k) >= 3: yield dict(name_key=k, file=l[0:8], kind=kind)
    elif tbl == 'il_llc_manager':
        for l in open(f'{IL}/llcallmgr.txt', encoding='latin-1'):
            if re.match(r'^\d{8}', l) and l[8:68].strip():
                yield dict(file=l[0:8], name=il_person(l[8:68].strip()).upper(), street=l[68:113].strip(), city=l[113:143].strip())
def batches(it):
    b = []
    for r in it:
        b.append(r)
        if len(b) >= BATCH: yield b; b = []
    if b: yield b
def load(tbl):
    t = time.time(); n = 0
    with ThreadPoolExecutor(LANES) as ex:
        for k, res in enumerate(ex.map(lambda b: rpc('bo_load', {'tok': TOK, 'tbl': tbl, 'rows': b}), batches(rows(tbl)))):
            n += res or 0
            if k % 200 == 0: print(tbl, 'batches', k, 'rows', n, f'{time.time()-t:.0f}s', flush=True)
    print(tbl, 'done rows', n, f'{time.time()-t:.0f}s', flush=True)
if __name__ == '__main__':
    tbls = [a for a in sys.argv[1:] if not a.startswith('--')] or ['fl_entity', 'fl_officer', 'fl_fictitious', 'fl_license', 'il_llc', 'il_llc_name', 'il_llc_manager']
    for tbl in tbls:
        if '--truncate' in sys.argv: rpc('bo_truncate', {'tok': TOK, 'tbl': tbl})
        load(tbl)
