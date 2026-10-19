import json,glob,sys,statistics as st
d,level=sys.argv[1],sys.argv[2]
wt=json.load(open('wave-table.json'))[level]['rows']
hpw={r['w']:r['hp'] for r in wt}
THR_LEAK=1.7  # R, при котором начинаются первые прорывы (по телеметрии уровня 2)
by={}
for f in sorted(glob.glob(d+'/**/*.json',recursive=True)):
    j=json.load(open(f,encoding='utf-8'))
    if 'games' not in j: continue
    for g in j['games']: by.setdefault(g['profile'],[]).append(g)
for prof,games in by.items():
    print('###',prof)
    # для каждого старта n0: сколько волн подряд замороженная оборона держит R>=THR
    maxw=max(len(g['timeline']) for g in games)
    out=[]
    for n0 in range(1,maxw):
        ks=[]
        for g in games:
            tl=g['timeline']
            if len(tl)<=n0: continue
            dps=tl[n0-1]['dps']  # оборона на старте волны n0
            # dt по волнам; за пределами — последний известный
            dts=[tl[i+1]['t']-tl[i]['t'] for i in range(len(tl)-1)]
            k=0
            for m in range(n0,31):
                dt=dts[m-1] if m-1<len(dts) else dts[-1]
                R=dps*dt/hpw[m]
                if R<THR_LEAK: break
                k+=1
            ks.append(k)
        if ks: out.append((n0,len(ks),st.mean(ks),min(ks)))
    print(' | '.join(f"с {n0}-й: {m:.1f} (мин {mn}, n={n})" for n0,n,m,mn in out))
