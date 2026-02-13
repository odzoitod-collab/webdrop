# Telegram Mini App — Drop Service

Веб-приложение (TMA) для дроп-сервиса. Работает только с Supabase; уведомления в Telegram отправляет Python-бот (по данным в БД или Realtime).

## Запуск

1. Разместите папку `web` на хостинге с HTTPS (или откройте через BotFather Web App URL).
2. В `config.js` укажите свои `SUPABASE_URL` и `SUPABASE_ANON_KEY`.
3. В Supabase Dashboard создайте Storage bucket с именем `checks` (или укажите другое в `config.js` → `STORAGE_BUCKET_CHECKS`). Политика: разрешить загрузку для анонимных/авторизованных (anon key). **Важно:** для пересылки фото чеков мерчанту/админу ботом нужен **Public Read** на бакет (или подписанные URL).

## Структура

- `index.html` — разметка страниц (auth, dashboard, реквизиты, сделки, загрузка чека, кошелёк, профиль) и нижняя навигация.
- `styles.css` — тёмная тема, переменные, скелетоны, тосты, анимация успеха.
- `app.js` — инициализация Telegram WebApp, Supabase, авторизация по `initDataUnsafe`, навигация, загрузка чека в Storage и запись в `checks`, создание заявок в `deals`, вывод в `withdrawals`, Realtime подписка на сделки.
- `config.js` — URL и anon key Supabase, имя bucket для чеков.

## Поведение

- **Auth:** при старте читается `Telegram.WebApp.initDataUnsafe.user.id`, по нему ищется запись в `users`. Если нет — показ «Регистрация в боте». Если `status = pending` — «Ожидание одобрения». Иначе показ приложения.
- **Реквизиты:** выбор страны → банка → показ карты/получателя и кнопка «Я оплатил» (переход к загрузке чека с контекстом `requisite_id`). Либо «Реквизиты по запросу» → форма сумма/время → создание записи в `deals` со статусом `pending_merchants`.
- **Сделки:** вкладка «Мои заявки» — список по `user_telegram_id`; при статусе `waiting_payment` — кнопка «Загрузить чек» (контекст `deal_id`). Вкладка «Биржа» — только для мерчантов (`merchants`), список `pending_merchants`, кнопка «Взять в работу» (update `merchant_telegram_id`, `status = taken`).
- **Чек:** файл загружается в Supabase Storage (bucket `checks`), в `checks` создаётся запись с `file_id` = URL или путь; для сделки дополнительно обновляется `deals.status = check_sent`.
- **Вывод:** форма «Сумма USD» → запись в `withdrawals`.

## Full Connect (Realtime): сайт ↔ бот через Supabase

Сайт и бот общаются только через БД; Supabase Realtime доставляет события по WebSocket (~100–200 мс).

- **Сайт** подписан на `deals` (по `user_telegram_id`) и на `users` (баланс). При смене статуса сделки мерчантом воркер сразу видит обновление и тосты («Мерчант взял сделку», «Реквизиты получены»).
- **Бот** подписан на INSERT в `deals` и `checks`: новая сделка → рассылка мерчантам с кнопкой «Взять сделку»; новый чек по сделке → мерчанту фото (URL из Storage) и кнопки «Подтвердить»/«Отклонить». На UPDATE бот не реагирует (нет цикла на свои изменения).

**Что сделать:**

1. **Realtime publication:** в Supabase SQL выполнить (один раз):  
   `ALTER PUBLICATION supabase_realtime ADD TABLE public.deals;`  
   `ALTER PUBLICATION supabase_realtime ADD TABLE public.checks;`  
   `ALTER PUBLICATION supabase_realtime ADD TABLE public.users;`  
   (Если таблица уже в публикации — ошибку можно игнорировать.)
2. **Бот:** в `config.py` задать `SUPABASE_SERVICE_ROLE_KEY` (Dashboard → Settings → API → service_role). Им бот подключается к Realtime и имеет полный доступ к данным.
3. **Storage:** бакет `checks` должен быть с **Public Read**, чтобы бот мог отправить фото мерчанту по URL из `checks.file_id`.

## Безопасность (RLS и initData)

Сейчас Mini App определяет пользователя только по `Telegram.WebApp.initDataUnsafe.user.id` на клиенте; запросы к Supabase идут с anon-ключом без проверки подписи initData на бэкенде. **Риск:** любой, зная `telegram_id`, может из консоли выполнить, например, `supabase.from('users').update({ balance: 999999 })` для чужого аккаунта, если RLS не ограничивает доступ.

**Рекомендации:**

1. **Включите и настройте RLS (Row Level Security)** в Supabase для таблиц `users`, `deals`, `checks`, `withdrawals`: пользователь может читать/обновлять только свои строки (например, `users`: `auth.uid()` или привязка к JWT после верификации Telegram).
2. **Верификация initData на бэкенде:** используйте Supabase Edge Function или свой сервер: проверяйте подпись Telegram Web App `initData` (алгоритм из документации Telegram), затем выдавайте JWT или устанавливайте `telegram_id` только после проверки. Тогда RLS может опираться на этот JWT.
3. Не храните в коде и не отдавайте на фронт `service_role` ключ — только `anon` с ограниченными политиками.
