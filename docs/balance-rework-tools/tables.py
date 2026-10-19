import json,glob,statistics as st
def load(d):
    by={}
    for f in sorted(glob.glob(d+'/**/*.json',recursive=True)):
        j=json.load(open(f,encoding='utf-8'))
        for g in j.get('games',[]): by.setdefault(g['profile'],[]).append(g)
    return by
def R(games,w):
    rows=[]
    for g in games:
        tl=g['timeline']
        if len(tl)>w:
            r=tl[w-1];nx=tl[w]; rows.append((r['dps']*(nx['t']-r['t'])/r['hpSpawned'], r['coins'], r['towers'], r['dps'], r['hpSpawned']))
    return rows
f=lambda x,n=1:str(round(x,n)).replace('.',',')
B=load('teleB'); A=load('teleA')
waves=[1,4,8,10,12,14,16,17,18,19,20,21]
print('| Волна | HP волны | expert: урон обороны, HP/с | expert: запас | strong: запас | average: запас |')
print('|---|---|---|---|---|---|')
for w in waves:
    e=R(B['expert'],w); s=R(B['strong'],w); a=R(B['average'],w)
    cell=lambda rows:f(st.mean(r[0] for r in rows),2) if rows else '—'
    print(f"| {w} | {f(st.mean(r[4] for r in e),0) if e else '—'} | {f(st.mean(r[3] for r in e),0) if e else '—'} | {cell(e)} | {cell(s)} | {cell(a)} |")
print()
print('Уровень 1 (без улучшений):')
print('| Волна | HP волны | expert: запас | strong: запас | average: запас |')
print('|---|---|---|---|---|')
for w in [1,3,5,7,9,11,13,14]:
    e=R(A['expert'],w); s=R(A['strong'],w); a=R(A['average'],w)
    cell=lambda rows:f(st.mean(r[0] for r in rows),2) if rows else '—'
    print(f"| {w} | {f(st.mean(r[4] for r in e),0) if e else '—'} | {cell(e)} | {cell(s)} | {cell(a)} |")
print()
for nm,B_ in [('уровень 2',B),('уровень 1',A)]:
    for prof,games in B_.items():
        for w in (10,20):
            rows=R(games,w)
            if rows: print(nm,prof,'монет на старте',w,'-й волны:',f(st.mean(r[1] for r in rows),0),'башен',f(st.mean(r[2] for r in rows),1),'n',len(rows))
