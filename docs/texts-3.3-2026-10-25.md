# Тексты мутаций и узлов древа простыми словами — на решение владельца (п. 3.3 сообщения 5 от 25 октября 2026)

В игру не внесено: таблица — до внесения. Числа «станет» посчитаны из `src/config.ts` (раздел `mutations`, `meta.upgrades`). Пауза: «пауза ×0,65» = «в 1 / 0,65 = 1,54 ≈ 1,5 раза чаще», «×0,7» = «в 1,43 ≈ 1,4 раза чаще». После «да» тексты вносятся в `src/i18n.ts`, проверка `card` (числа в текстах сверяются с `config.ts`) переводится на новые формулировки.

## 1. Мутации (40)

| Башня, порог | Мутация | Было (RU / EN) | Станет (RU / EN) |
|---|---|---|---|
| Таблетка, 1 | Скорострел | Пауза −35 % / Pause −35% | Стреляет в 1,5 раза чаще / Fires 1.5 times as often |
| Таблетка, 1 | Бронебойная | Игнорирует броню / Ignores armor | Броня бактерий не ослабляет удар / Bacteria armor does not weaken the hit |
| Таблетка, 2 | Двойной выстрел | Бьёт две цели сразу / Hits two targets at once | Бьёт сразу две бактерии / Hits two bacteria at once |
| Таблетка, 2 | Охотник | Бьёт самую прочную, урон ×1,5 / Hits the toughest, damage ×1.5 | Бьёт самую крепкую бактерию в 1,5 раза сильнее / Hits the toughest bacterium 1.5 times harder |
| Сироп, 1 | Липкая | Замедляет сильнее / Slows more | Бактерии в луже идут ещё медленнее / Bacteria in the puddle move even slower |
| Сироп, 1 | Большая лужа | Радиус лужи ×1,6 / Puddle radius ×1.6 | Лужа в 1,6 раза шире / The puddle is 1.6 times wider |
| Сироп, 2 | Едкая | Лужа жжёт 1,5 HP/с / Puddle burns 1.5 HP/s | Лужа ранит бактерий, пока они в ней / The puddle hurts bacteria while they are in it |
| Сироп, 2 | Две капли | Две лужи за выстрел / Two puddles per shot | Сразу две лужи / Two puddles at once |
| Шипучка, 1 | Большой взрыв | Радиус взрыва ×1,5 / Blast radius ×1.5 | Взрыв в 1,5 раза шире / The blast is 1.5 times wider |
| Шипучка, 1 | Быстрая | Пауза −35 % / Pause −35% | Взрывает в 1,5 раза чаще / Blasts 1.5 times as often |
| Шипучка, 2 | Цепная | Второй взрыв рядом / A second blast nearby | После взрыва — второй рядом / A second blast follows nearby |
| Шипучка, 2 | Кислота | Первые 5 целей взрыва получают от всех башен +50 % урона 3 с / The first 5 blast targets take +50% damage from all towers for 3 s | Задетые взрывом ненадолго получают от всех башен в 1,5 раза больше урона / Bacteria hit by the blast briefly take 1.5 times more damage from all towers |
| Шприц, 1 | Больше ударов | +1 удар в очереди / +1 hit in a burst | На один удар больше за раз / One more hit each time |
| Шприц, 1 | Бронебойный | Урон ×1,5, игнорирует броню / Damage ×1.5, ignores armor | В 1,5 раза сильнее, броня не ослабляет удар / 1.5 times harder, armor does not weaken the hit |
| Шприц, 2 | Второй луч | Под 90° к первому / At 90° to the first | Второй луч поперёк первого / A second beam across the first |
| Шприц, 2 | Спираль | Каждый следующий удар сильнее на {n} / Each next hit is stronger by {n} | Каждый следующий удар сильнее предыдущего на {n} / Each next hit is {n} stronger than the one before |
| Ампула, 1 | Скорострел | Пауза −35 % / Pause −35% | Стреляет в 1,5 раза чаще / Fires 1.5 times as often |
| Ампула, 1 | Бронебой | Игнорирует броню / Ignores armor | Броня бактерий не ослабляет удар / Bacteria armor does not weaken the hit |
| Ампула, 2 | Мощь | Урон ×1,6 / Damage ×1.6 | Бьёт в 1,6 раза сильнее / Hits 1.6 times harder |
| Ампула, 2 | Два снаряда | Второй снаряд в следующую по прочности цель / A second shot at the next toughest target | Второй снаряд — в следующую по крепости бактерию / A second shot at the next toughest bacterium |
| Антибиотик, 1 | Долгий яд | Яд идёт в 1,5 раза дольше / Poison lasts 1.5 times longer | без изменений |
| Антибиотик, 1 | Быстрый приём | Пауза −35 % / Pause −35% | Даёт яд в 1,5 раза чаще / Poisons 1.5 times as often |
| Антибиотик, 2 | Сильный яд | Яд сильнее в 1,6 раза / Poison is 1.6 times stronger | без изменений |
| Антибиотик, 2 | Заражение | Яд ещё на одну цель / Poison one more target | Отравляет сразу две бактерии / Poisons two bacteria at once |
| Лампа, 1 | Узкий пучок | Угол 30°, урон ×1,5 / Angle 30°, damage ×1.5 | Свет уже, но жжёт в 1,5 раза сильнее / Narrower light that burns 1.5 times harder |
| Лампа, 1 | Широкий пучок | Угол 75° / Angle 75° | Свет в 1,6 раза шире / Light 1.6 times wider |
| Лампа, 2 | Раскал | Урон ×1,6 / Damage ×1.6 | Жжёт в 1,6 раза сильнее / Burns 1.6 times harder |
| Лампа, 2 | Дальний свет | Длина ×1,4 / Length ×1.4 | Светит в 1,4 раза дальше / Shines 1.4 times farther |
| Витамин, 1 | Усиление | Прибавка к скорости ×1,5 / Speed-up bonus ×1.5 | Ускоряет соседей в 1,5 раза сильнее / Speeds up neighbours 1.5 times more |
| Витамин, 1 | Дальний | Радиус ×1,3 / Radius ×1.3 | Достаёт в 1,3 раза дальше / Reaches 1.3 times farther |
| Витамин, 2 | Сильное усиление | Прибавка к скорости ×1,5 / Speed-up bonus ×1.5 | Ускоряет соседей в 1,5 раза сильнее / Speeds up neighbours 1.5 times more |
| Витамин, 2 | Двойной | Радиус ×1,3 / Radius ×1.3 | Достаёт в 1,3 раза дальше / Reaches 1.3 times farther |
| Холод, 1 | Глубокая заморозка | Заморозка ×1,5, не дольше половины паузы / Freeze ×1.5, at most half the delay | Держит во льду в 1,5 раза дольше / Keeps bacteria frozen 1.5 times longer |
| Холод, 1 | Частый холод | Пауза −30 % / Pause −30 % | Замораживает в 1,4 раза чаще / Freezes 1.4 times as often |
| Холод, 2 | Долгий мороз | Заморозка ×1,5, не дольше половины паузы / Freeze ×1.5, at most half the delay | Держит во льду в 1,5 раза дольше / Keeps bacteria frozen 1.5 times longer |
| Холод, 2 | Широкий круг | Радиус ×1,4 / Radius ×1.4 | Замораживает в 1,4 раза дальше / Freezes 1.4 times farther |
| Пластырь, 1 | Липкий | Время приклеивания ×1,5 / Stick time ×1.5 | Держит в 1,5 раза дольше / Holds 1.5 times longer |
| Пластырь, 1 | Скорый | Пауза −35 % / Pause −35 % | Приклеивает в 1,5 раза чаще / Sticks 1.5 times as often |
| Пластырь, 2 | Едкий | Урон ловушки ×2 / Trap damage ×2 | Ранит пойманную вдвое сильнее / Hurts the caught bacterium twice as hard |
| Пластырь, 2 | Две ловушки | Ловушка ещё под одну цель / A trap under one more target | Ловит сразу две бактерии / Catches two bacteria at once |

## 2. Узлы древа — описания с числом (подпись: значение)

Экран «Улучшения» делит строку по первому «: » на подпись и значение; формат сохраняется. «Сейчас → станет» считается так же, по уровню узла.

| Действие узла | Было (RU / EN) | Станет (RU / EN) |
|---|---|---|
| урон всех башен (`damage`) | урон всех башен: +{n} % / damage of all towers: +{n} % | все башни бьют сильнее: +{n} % / all towers hit harder: +{n} % |
| стартовые монеты (`coins`) | стартовых монет: +{n} / starting coins: +{n} | без изменений |
| награда (`reward`) | награда за бактерий: +{n} % / reward for bacteria: +{n} % | монет за каждую бактерию: +{n} % / coins for each bacterium: +{n} % |
| жизни (`lives`) | жизней в начале партии: +{n} / lives at the start: +{n} | без изменений |
| щит (`shield`) | бактерий за партию, гасимых щитом: {n} / bacteria per game absorbed by the shield: {n} | щит не пускает к организму бактерий за партию: {n} / the shield stops bacteria per game: {n} |
| возврат (`sellRefund`) | возврат при продаже башни: {n} % / refund when selling a tower: {n} % | при продаже возвращается: {n} % цены / selling returns: {n} % of the price |
| монеты за волну (`waveCoins`) | монет в начале каждой волны: +{n} / coins at the start of every wave: +{n} | без изменений |
| урон башни (`towerDamage`) | урон башни: +{n} % / tower damage: +{n} % | башня бьёт сильнее: +{n} % / the tower hits harder: +{n} % |
| цена (`price`) | цена башни: −{n} % / tower price: −{n} % | башня дешевле: на {n} % / the tower is cheaper: by {n} % |
| пауза (`cooldown`) | пауза между выстрелами: −{n} % / time between shots: −{n} % | стреляет чаще: в {k} раза / fires more often: {k} times as often (k = 1 / (1 − n/100), например 5 уровней −20 % → в 1,25 раза) |
| радиус (`range`) | радиус стрельбы: +{n} % / firing range: +{n} % | стреляет дальше: +{n} % / fires farther: +{n} % |
| лужа (`puddleSec`) | время жизни лужи: +{n} % / puddle lifetime: +{n} % | лужа держится дольше: +{n} % / the puddle lasts longer: +{n} % |
| луч (`beamWidth`) | полуширина луча: +{n} px / beam half-width: +{n} px | луч шире: +{n} px с каждой стороны / the beam is wider: +{n} px on each side |
| аура (`auraBoost`) | усиление башен рядом: пауза ещё на {n} % короче / nearby towers boost: pause another {n} % shorter | соседние башни стреляют ещё чаще: +{n} % / nearby towers fire even more often: +{n} % |
| заморозка (`freezeTime`) | время заморозки: +{n} % / freeze time: +{n} % | держит во льду дольше: +{n} % / keeps bacteria frozen longer: +{n} % |

## 3. Узлы древа — описания без числа (ключевые узлы и умения)

| Узел | Было (RU / EN) | Станет (RU / EN) |
|---|---|---|
| башня (`upgInfoTower`) | Открывает башню «{name}» на всех уровнях / Unlocks the “{name}” tower on all levels | без изменений |
| Лихорадка | Умение в партии: все башни стреляют вдвое чаще 8 с, перезарядка 60 с / In-game skill: all towers fire twice as fast for 8 s, recharge 60 s | Кнопка в бою: все башни ненадолго стреляют вдвое чаще / A button in battle: for a short time all towers fire twice as often |
| Автостарт волны | Следующая волна выходит сразу, как только на поле не осталось бактерий / The next wave starts as soon as the field is clear | без изменений |
| Рикошет (Таблетка) | Таблетка отскакивает во вторую цель с половиной урона / The pill bounces to a second target with half damage | Таблетка отскакивает во вторую бактерию вполсилы / The pill bounces to a second bacterium at half strength |
| Разлив (Сироп) | Лужа растекается вдоль дорожки: длина ×2 / The puddle spreads along the path: length ×2 | Лужа растекается вдоль дорожки вдвое дальше / The puddle spreads twice as far along the path |
| Осколки (Шипучка) | Взрыв разбрасывает 4 осколка по 30 % урона / The blast throws 4 shards with 30% damage each | Взрыв разбрасывает осколки, они ранят бактерий рядом / The blast throws shards that hurt bacteria nearby |
| Сквозной разряд (Шприц) | Первая цель на линии теряет броню на 3 с / The first target on the line loses armor for 3 s | Первая бактерия на луче ненадолго теряет броню / The first bacterium on the beam briefly loses its armor |
| Разрыв (Ампула) | Убитая цель взрывается: половина урона в 60 px / A killed target explodes: half damage within 60 px | Убитая бактерия взрывается и ранит соседей / A killed bacterium explodes and hurts its neighbours |
| Эпидемия (Антибиотик) | Яд погибшей бактерии переходит на ближайшую / Poison of a dead bacterium passes to the nearest one | без изменений |
| Прожектор (Лампа) | Бактерии в круге Лампы получают от всех башен +20 % урона / Bacteria in the Lamp circle take +20% damage from all towers | Бактерии в свете Лампы получают от всех башен больше урона / Bacteria in the Lamp light take more damage from all towers |
| Иммунитет (Витамин) | Башни в ауре не глушат спора и токсин / Towers in the aura are immune to spores and toxin | Споры и облака токсина не глушат башни рядом с Витамином / Spores and toxin clouds do not silence towers next to the Vitamin |
| Хрупкость (Холод) | Замёрзшие получают +30 % урона / Frozen bacteria take +30% damage | Замёрзшие бактерии получают больше урона / Frozen bacteria take more damage |
| Капкан (Пластырь) | Ловушка держит две цели / The trap holds two targets | Ловушка держит сразу две бактерии / The trap holds two bacteria at once |

## 4. Решения, которые нужны вместе с таблицей

1. **Числа в описаниях.** В таблице мутации сохраняют множитель («в 1,5 раза»), как в примере владельца; у ключевых узлов числа убраны там, где без них смысл понятен (Осколки, Разрыв, Прожектор, Хрупкость, Лихорадка). Вариант Б — оставить числа и у них («ранит соседей вполсилы в 60 px»). Рекомендация — как в таблице: на экране «Улучшения» число узла видно в строке «Сейчас → станет» у узлов с числом, а у ключевых узлов строка одна.
2. **«Едкая» (Сироп).** «Было»: 1,5 HP/с; в таблице «станет» — без числа (урон лужи в секунду противоречил бы п. 3.2: урон за одно применение у лужи зависит от того, сколько бактерия в ней стоит). Вариант Б — «ранит на N за каждую секунду в луже».
