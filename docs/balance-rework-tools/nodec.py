import json,glob,sys,statistics as st
d,level=sys.argv[1],sys.argv[2]
mode=sys.argv[3] if len(sys.argv)>3 else 'now'
M=lambda n,per,fr,late,lf,hf=1:hf*(1+per*max(0,n-fr)+late*max(0,n-lf))
now=lambda n:M(n,0.08,8,1.15,16)
new=lambda n:M(n,0.2,8,1.6,16,1.5)
wt=json.load(open('wave-table.json'))[level]['rows']; hpw={r['w']:r['hp'] for r in wt}
THR=1.7
by={}
for f in glob.glob(d+'/**/*.json',recursive=True):
    j=json.load(open(f,encoding='utf-8'))
    for g in j.get('games',[]): by.setdefault(g['profile'],[]).append(g)
for prof,games in by.items():
    cnt=tot=0; per_game=[]
    for g in games:
        tl=g['timeline']; dts=[tl[i+1]['t']-tl[i]['t'] for i in range(len(tl)-1)]
        free=n_=0
        for n in range(2,len(tl)):  # волна n, оборона с начала волны n-1
            if n-1>=len(dts) or n>len(dts): break
            dps=tl[n-2]['dps']; dt=dts[n-1]
            scale=1.0 if mode=='now' else now(n)/new(n)
            R=dps*dt/hpw[n]*scale
            n_+=1; free+= (R>=THR)
        per_game.append(free/n_ if n_ else 0); cnt+=free; tot+=n_
    print(f"{prof}: волн, не требующих покупки: {100*cnt/tot:.0f} % ({cnt} из {tot}); по партиям {[round(100*x) for x in per_game]}")
