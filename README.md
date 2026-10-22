# СУР — система управления рисками

Веб-интерфейс системы управления рисками: реестр рисков, оценка по матрице вероятность × тяжесть, меры воздействия и их согласование, дашборды для руководства, настройки методологии и оргструктуры.

## Стек

- Angular 22: standalone-компоненты, signals, zoneless, Signal Forms
- Свои UI-компоненты поверх `@angular/aria` и `@angular/cdk`
- SCSS, дизайн-токены на CSS-переменных, две темы: тёмная и стеклянная
- Vitest

## Запуск

Нужен Node.js 24 (см. `.nvmrc`).

```bash
npm ci
npm start          # http://localhost:4200
npm test -- --watch=false
npm run build      # dist/rms/browser
```

Пока бэкенд в разработке, данные отдают моки.

## Структура

```
src/
  styles/_tokens.scss   токены обеих тем
  app/core/             сервисы приложения (тема, авторизация, API)
  app/ui/               библиотека компонентов
  app/features/         экраны
```

## Деплой

GitHub Actions собирает и тестирует каждый push и PR. Push в `main` выкладывает сборку в бакет Yandex Object Storage со статическим хостингом.

Настройки репозитория:

| Тип | Имя | Значение |
| --- | --- | --- |
| Variable | `YC_BUCKET` | имя бакета |
| Variable | `YC_REGION` | `kz1` (по умолчанию) или `ru-central1` |
| Variable | `YC_STORAGE_ENDPOINT` | `https://storage.yandexcloud.kz` (по умолчанию) или `https://storage.yandexcloud.net` |
| Secret | `YC_ACCESS_KEY_ID` | статический ключ сервисного аккаунта |
| Secret | `YC_SECRET_ACCESS_KEY` | секрет статического ключа |

В настройках хостинга бакета главная страница и страница ошибки — `index.html`, чтобы работали маршруты SPA.
