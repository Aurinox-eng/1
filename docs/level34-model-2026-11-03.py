# Модель состава 50 волн уровней 3–4 (docs/level34-plan-2026-11-03.md): берёт волны уровня 2 из src/config.ts, часть кокков заменяет видами главы 2, ставит стены и боссов главы. Запуск из корня проекта: python3 docs/level34-model-2026-11-03.py
import re,json,sys
src=open('src/config.ts').read()
i=src.index('// Уровень 2 «Нос»'); j=src.index('] as PlanWave[]',i)
rows=re.findall(r"\{ mix: \{([^}]*)\}(?:, wall: \['(\w+)', (\d+)\])?(?:, boss: '(\w+)')? \}, // (\d+)",src[i:j])
L2=[]
for mix,wk,wn,boss,n in rows:
  m={k:int(v) for k,v in re.findall(r"(\w+): (\d+)",mix)}
  L2.append(dict(mix=m,wall=(wk,int(wn)) if wk else None,boss=boss or None))
assert len(L2)==50
RU={'coccus':'кокк','rod':'палочка','swarm':'рой','runner':'бегун','spore':'спора','splitter':'делящаяся','healer':'лекарь','armored':'бронир.','leaper':'прыгун','slick':'слизень','stealth':'скрытная','film':'Плёнка'}
BOSS={'sporeling':'Споровик','shaman':'Знахарь','hopper':'Скакун','sporeMother':'Мать спор','caries':'Кариес','shadow':'Тень','tartar':'Зубной камень','armadillo':'Броненосец','swarmQueen':'Матка роя','cariesPlus':'Кариес (усиленный)'}
def build(level):
  out=[]
  for n,w in enumerate(L2,1):
    m=dict(w['mix'])
    base=sum(m.values())
    # new kinds of chapter 2: stealth from 8 (L3) / 1st..; film from 12 (L3)
    s_from,f_from=(8,12) if level==3 else (4,6)
    if n>=s_from: m['stealth']=max(1,round(m.get('coccus',0)*0.18))
    if n>=f_from: m['film']=max(1,round(m.get('coccus',0)*0.14))
    # keep totals: take from coccus
    add=m.get('stealth',0)+m.get('film',0)
    m['coccus']=max(1,m['coccus']-add)
    wall=w['wall']
    if level==3:
      wall={9:('stealth',4),16:('stealth',8),23:('film',6),33:('film',9),43:('stealth',16)}.get(n,wall)
      boss={10:'sporeling',20:'shaman',30:'hopper',40:'sporeMother',50:'caries'}.get(n)
    else:
      wall={5:('stealth',3),9:('film',4),16:('film',8),23:('stealth',10),29:('film',12),36:('stealth',14),43:('film',16),48:('stealth',24)}.get(n,wall)
      boss={10:'shadow',20:'tartar',30:'armadillo',40:'swarmQueen',50:'cariesPlus'}.get(n)
    if n==50: m={k:v for k,v in m.items()}
    out.append((n,m,wall,boss))
  return out
for level in (3,4):
  print(f'\n### Уровень {level}\n')
  print('| Волна | Состав (вперемешку) | Стена | Босс | Всего |')
  print('|---|---|---|---|---|')
  for n,m,wall,boss in build(level):
    order=['coccus','rod','swarm','runner','spore','splitter','healer','armored','leaper','slick','stealth','film']
    mix=', '.join(f'{RU[k]} {m[k]}' for k in order if m.get(k))
    tot=sum(m.values())+(wall[1] if wall else 0)
    print(f"| {n} | {mix} | {RU[wall[0]]+' '+str(wall[1]) if wall else '—'} | {BOSS.get(boss,'—') if boss else '—'} | {tot} |")
