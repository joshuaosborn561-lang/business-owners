#!/usr/bin/env python3
"""Download + index Florida Sunbiz quarterly bulk files (free, FL DOS).

Credentials: FL DOS publishes a shared public login on
https://dos.fl.gov/sunbiz/other-services/data-downloads/quarterly-data/ .
Pass it via FL_SFTP_USER / FL_SFTP_PASS (never commit it).

Outputs (in FL_SUNBIZ_DIR, default /tmp/fl-sunbiz), sorted by normalized name:
  fl_active.sorted.tsv   key, doc, city, principal street, mail street, RA, RA type, RA street, officers
  fic_active.sorted.tsv  key, doc, city, street, owner, owner type, owner street, owner corp doc
Usage: python3 scripts/build_fl_sunbiz.py [--skip-download]
"""
import glob, os, re, subprocess, sys
D = os.environ.get('FL_SUNBIZ_DIR', '/tmp/fl-sunbiz'); os.makedirs(D, exist_ok=True)
BASE = 'https://sftp.floridados.gov/Public/doc/quarterly'
def dl(path, out):
    u, p = os.environ['FL_SFTP_USER'], os.environ['FL_SFTP_PASS']
    subprocess.check_call(['curl', '-sf', '-A', 'Mozilla/5.0', '-u', f'{u}:{p}', '-o', out, f'{BASE}/{path}'])
    subprocess.check_call(['unzip', '-o', '-q', out, '-d', D])
def norm(n):
    n = n.upper().replace('&', ' AND ')
    n = re.sub(r'\b(L\s*\.?\s*L\s*\.?\s*C\.?|LLC|INC|INCORPORATED|CORP|CORPORATION|CO|COMPANY|LTD|THE|SERIES)\b\.?', ' ', n)
    return re.sub(r'[^A-Z0-9]', '', n)
def pname(s):
    return ' '.join(x for x in (s[20:34].strip(), s[34:42].strip(), s[0:20].strip()) if x)
if '--skip-download' not in sys.argv:
    dl('cor/cordata.zip', f'{D}/cordata.zip'); dl('fic/ficdata.zip', f'{D}/ficdata.zip')
with open(f'{D}/fl_active.tsv', 'w') as out:
    for fn in sorted(glob.glob(f'{D}/cordata*.txt')):
        for l in open(fn, encoding='latin-1'):
            if len(l) < 700 or l[204] != 'A': continue
            g = lambda a, b: l[a-1:b].strip()
            offs = []
            for i in range(6):
                o = 669 + i * 128
                if g(o+4, o+4) == 'P' and l[o+4:o+46].strip():
                    offs.append(f"{g(o, o+3)}:{pname(l[o+4:o+46])}:{g(o+47, o+88)}")
            rt = g(587, 587); ra = pname(l[544:586]) if rt == 'P' else g(545, 586)
            out.write('\t'.join([norm(g(13, 204)), g(1, 12), g(305, 332), g(221, 262), g(347, 388), ra, rt, g(588, 629), '|'.join(offs)]) + '\n')
with open(f'{D}/fic_active.tsv', 'w') as out:
    for l in open(f'{D}/FICFILE.TXT', encoding='latin-1'):
        if len(l) < 560 or l[351] != 'A': continue
        g = lambda a, b: l[a-1:b].strip()
        t = g(456, 456); owner = f"{g(421, 455)} {g(401, 420)}".strip() if t == 'P' else g(401, 455)
        out.write('\t'.join([norm(g(13, 204)), g(1, 12), g(297, 324), g(217, 296), owner, t, g(457, 496), g(545, 556)]) + '\n')
for f in ('fl_active', 'fic_active'):
    subprocess.check_call(f"LC_ALL=C sort -t$'\\t' -k1,1 -S 1G {D}/{f}.tsv -o {D}/{f}.sorted.tsv", shell=True, executable='/bin/bash')
print('ok')
