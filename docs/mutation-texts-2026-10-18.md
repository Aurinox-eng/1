# Описания мутаций башен (тексты при выборе на 2-м и 4-м уровне) — на решение владельца, 18 октября 2026

Мутации выбираются в карточке башни на двух порогах (при достижении 2-го и 4-го уровня слиянием): на каждом пороге — два варианта на выбор. Ниже — все мутации: название и описание на русском и английском (`src/i18n.ts`, ключи `mut…` и `mutd…`). Решение владельца 18 октября 2026: пока оставлены, список передан для отдельного решения (убрать описания, оставить, сократить).


## Таблетка

| Ключ | Название (ru) | Описание (ru) | Название (en) | Описание (en) |
|---|---|---|---|---|
| `mutPillRapid` | Скорострел | Пауза −35 % | Rapid fire | Pause −35% |
| `mutPillPierce` | Бронебойная | Игнорирует броню | Armor-piercing | Ignores armor |
| `mutPillDouble` | Двойной выстрел | Бьёт две цели сразу | Double shot | Hits two targets at once |
| `mutPillHunter` | Охотник | Бьёт самую прочную, урон ×1,5 | Hunter | Hits the toughest, damage ×1.5 |

## Сироп

| Ключ | Название (ru) | Описание (ru) | Название (en) | Описание (en) |
|---|---|---|---|---|
| `mutSyrupSticky` | Липкая | Замедляет сильнее | Sticky | Slows more |
| `mutSyrupWide` | Большая лужа | Радиус лужи ×1,6 | Wide puddle | Puddle radius ×1.6 |
| `mutSyrupCaustic` | Едкая | Лужа жжёт 1,5 HP/с | Caustic | Puddle burns 1.5 HP/s |
| `mutSyrupTwin` | Две капли | Две лужи за выстрел | Two drops | Two puddles per shot |

## Шипучка

| Ключ | Название (ru) | Описание (ru) | Название (en) | Описание (en) |
|---|---|---|---|---|
| `mutFizzBig` | Большой взрыв | Радиус взрыва ×1,5 | Big blast | Blast radius ×1.5 |
| `mutFizzFast` | Быстрая | Пауза −35 % | Fast | Pause −35% |
| `mutFizzChain` | Цепная | Второй взрыв рядом | Chain | A second blast nearby |
| `mutFizzAcid` | Кислота | Ближним целям: +50 % урона 3 с | Acid | Nearest targets: +50% damage 3 s |

## Шприц

| Ключ | Название (ru) | Описание (ru) | Название (en) | Описание (en) |
|---|---|---|---|---|
| `mutSyringeMore` | Больше ударов | +1 удар в очереди | More hits | +1 hit in a burst |
| `mutSyringePierce` | Бронебойный | Урон ×1,5, игнорирует броню | Armor-piercing | Damage ×1.5, ignores armor |
| `mutSyringeTwin` | Второй луч | Под 90° к первому | Second beam | At 90° to the first |
| `mutSyringeSpiral` | Спираль | Каждый удар сильнее на 2 | Spiral | Each hit is stronger by 2 |

## Ампула

| Ключ | Название (ru) | Описание (ru) | Название (en) | Описание (en) |
|---|---|---|---|---|
| `mutAmpuleRapid` | Скорострел | Пауза −35 % | Rapid fire | Pause −35% |
| `mutAmpulePierce` | Бронебой | Игнорирует броню | Armor-piercing | Ignores armor |
| `mutAmpuleMight` | Мощь | Урон ×1,6 | Might | Damage ×1.6 |
| `mutAmpuleTwin` | Два снаряда | Второй снаряд в следующую по прочности цель | Two shots | A second shot at the next toughest target |

## Антибиотик

| Ключ | Название (ru) | Описание (ru) | Название (en) | Описание (en) |
|---|---|---|---|---|
| `mutAntibioticLong` | Долгий яд | Яд идёт в 1,5 раза дольше | Long poison | Poison lasts 1.5 times longer |
| `mutAntibioticQuick` | Быстрый приём | Пауза −35 % | Quick dose | Pause −35% |
| `mutAntibioticStrong` | Сильный яд | Яд сильнее в 1,6 раза | Strong poison | Poison is 1.6 times stronger |
| `mutAntibioticSpread` | Заражение | Яд ещё на одну цель | Infection | Poison one more target |

## Лампа

| Ключ | Название (ru) | Описание (ru) | Название (en) | Описание (en) |
|---|---|---|---|---|
| `mutLampNarrow` | Узкий пучок | Угол 30°, урон ×1,5 | Narrow beam | Angle 30°, damage ×1.5 |
| `mutLampWide` | Широкий пучок | Угол 80° | Wide beam | Angle 80° |
| `mutLampBlaze` | Раскал | Урон ×1,6 | Blaze | Damage ×1.6 |
| `mutLampFar` | Дальний свет | Длина ×1,4 | Far light | Length ×1.4 |

## Витамин

| Ключ | Название (ru) | Описание (ru) | Название (en) | Описание (en) |
|---|---|---|---|---|
| `mutVitaminBoost` | Усиление | Прибавка к скорости ×1,5 | Boost | Speed-up bonus ×1.5 |
| `mutVitaminFar` | Дальний | Радиус ×1,3 | Far reach | Radius ×1.3 |
| `mutVitaminStrong` | Сильное усиление | Прибавка к скорости ×1,5 | Strong boost | Speed-up bonus ×1.5 |
| `mutVitaminDouble` | Двойной | Радиус ×1,3 | Double | Radius ×1.3 |

## Холод

| Ключ | Название (ru) | Описание (ru) | Название (en) | Описание (en) |
|---|---|---|---|---|
| `mutFrostDeep` | Глубокая заморозка | Время заморозки ×1,5 | Deep freeze | Freeze time ×1.5 |
| `mutFrostFrequent` | Частый холод | Пауза −30 % | Frequent frost | Pause −30 % |
| `mutFrostLong` | Долгий мороз | Время заморозки ×1,5 | Long frost | Freeze time ×1.5 |
| `mutFrostWide` | Широкий круг | Радиус ×1,4 | Wide circle | Radius ×1.4 |

## Пластырь

| Ключ | Название (ru) | Описание (ru) | Название (en) | Описание (en) |
|---|---|---|---|---|
| `mutPatchSticky` | Липкий | Время приклеивания ×1,5 | Sticky | Stick time ×1.5 |
| `mutPatchQuick` | Скорый | Пауза −35 % | Quick | Pause −35 % |
| `mutPatchCaustic` | Едкий | Урон ловушки ×2 | Caustic | Trap damage ×2 |
| `mutPatchTwin` | Две ловушки | Ловушка ещё под одну цель | Two traps | A trap under one more target |
