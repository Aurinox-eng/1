import json,glob,sys,statistics as st
d=sys.argv[1]
by={}
for f in sorted(glob.glob(d+'/**/*.json',recursive=True)):
    j=json.load(open(f,encoding='utf-8'))
    if 'games' not in j: continue
    for g in j['games']:
        by.setdefault(g['profile'],[]).append(g)
def fmt(x,n=1):
    return '—' if x is None else (str(round(x,n)).replace('.',','))
for prof,games in by.items():
    print(f"\n### {prof}: партий {len(games)}; результат {[ (g['result'],g['wave']) for g in games]}")
    maxw=max(len(g['timeline']) for g in games)
    print('| Волна | партий | HP волны | урон обороны, HP/с | запас (урон×время/HP) | монет на старте волны | башен | действий за волну |')
    print('|---|---|---|---|---|---|---|---|')
    for w in range(1,maxw+1):
        rows=[]
        for g in games:
            tl=g['timeline']
            if len(tl)>=w and len(tl)>w:  # волна закончена (есть следующая)
                r=tl[w-1]; nxt=tl[w]
                dt=nxt['t']-r['t']
                rows.append(dict(hp=r.get('hpSpawned'),dps=r.get('dps'),dt=dt,coins=r['coins'],towers=r['towers'],
                                 acts=(r.get('builds') or 0)+(nxt['merges']-r['merges'])+(nxt['picks']-r['picks'])))
        if not rows: continue
        hp=st.mean(x['hp'] for x in rows); dps=st.mean(x['dps'] for x in rows)
        R=st.mean(x['dps']*x['dt']/x['hp'] for x in rows if x['hp'])
        print(f"| {w} | {len(rows)} | {fmt(hp,0)} | {fmt(dps)} | {fmt(R,2)} | {fmt(st.mean(x['coins'] for x in rows),0)} | {fmt(st.mean(x['towers'] for x in rows),1)} | {fmt(st.mean(x['acts'] for x in rows),1)} |")
    # решения в минуту и самая длинная серия волн без решений
    per_min=[]; streaks=[]
    for g in games:
        tl=g['timeline']; acts=g['merges']+g['picks']+len(g['builds'])
        per_min.append(acts/(g['gameSec']/60) if g['gameSec'] else 0)
        s=best=0
        for i in range(len(tl)-1):
            a=(tl[i].get('builds') or 0)+(tl[i+1]['merges']-tl[i]['merges'])+(tl[i+1]['picks']-tl[i]['picks'])
            s=s+1 if a==0 else 0; best=max(best,s)
        streaks.append(best)
    print(f"\nрешений в минуту (постройки+слияния+мутации): {fmt(st.mean(per_min),2)}; самая длинная серия волн без решений: {streaks}")
