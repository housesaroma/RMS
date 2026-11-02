# syntax=docker/dockerfile:1

# ── Stage 1: build Angular app ────────────────────────────────────────────────
FROM node:24-alpine AS build

WORKDIR /app

# Кэшируемый слой установки зависимостей
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Продакшен-сборка с реальным бэкендом (RMS_BACKEND=true отключает моки)
RUN npx ng build --define RMS_BACKEND='"true"'

# ── Stage 2: nginx для раздачи статики ───────────────────────────────────────
FROM nginx:1.27-alpine

# Статика собранного приложения
COPY --from=build /app/dist/rms/browser /usr/share/nginx/html

# Шаблон конфигурации: официальный образ nginx подставит переменные окружения
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template

# Адрес бэкенда, на который nginx проксирует /v1 (переопределяется в compose)
ENV BACKEND_URL=http://rms-service-backend-pre:8080

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1
