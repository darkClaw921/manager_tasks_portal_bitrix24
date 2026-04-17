#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# TaskHub — Production (Docker Compose)
# ============================================================
# Usage:
#   ./scripts/deploy-prod.sh                  # preflight + plan + build + start
#   ./scripts/deploy-prod.sh preflight        # server + env checks only (no build)
#   ./scripts/deploy-prod.sh stop             # stop containers
#   ./scripts/deploy-prod.sh restart          # restart
#   ./scripts/deploy-prod.sh logs             # tail logs
#   ./scripts/deploy-prod.sh status           # show status
#   ./scripts/deploy-prod.sh rebuild          # force rebuild + start
#   ./scripts/deploy-prod.sh backup           # backup database
#
# Options:
#   --port 8080       override port (default 3000)
#   --attached        run in foreground (default: detached)
#   --yes             skip interactive confirmation
#   --non-interactive fail on missing values instead of prompting
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PROJECT_DIR/.env.production"

# Read PORT from .env.production, default to 3000
if [ -f "$ENV_FILE" ]; then
    PORT=$(grep "^PORT=" "$ENV_FILE" | tail -1 | cut -d= -f2- || true)
fi
PORT="${PORT:-3000}"
ATTACHED=false
COMMAND="up"
ASSUME_YES=false
INTERACTIVE=true

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        stop)              COMMAND="stop"; shift ;;
        restart)           COMMAND="restart"; shift ;;
        logs)              COMMAND="logs"; shift ;;
        status)            COMMAND="status"; shift ;;
        rebuild)           COMMAND="rebuild"; shift ;;
        backup)            COMMAND="backup"; shift ;;
        preflight)         COMMAND="preflight"; shift ;;
        --port)            PORT="$2"; shift 2 ;;
        --attached)        ATTACHED=true; shift ;;
        --yes|-y)          ASSUME_YES=true; shift ;;
        --non-interactive) INTERACTIVE=false; shift ;;
        -h|--help)         COMMAND="help"; shift ;;
        *) echo "Unknown option: $1. Run with --help"; exit 1 ;;
    esac
done

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC}  $1"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }
step()  { echo -e "${CYAN}[STEP]${NC}  $1"; }
plan()  { echo -e "  ${YELLOW}•${NC} $1"; }

env_get() {
    local var="$1"
    [ -f "$ENV_FILE" ] || { echo ""; return; }
    grep "^${var}=" "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2- || true
}

FORCE_NOCACHE=false

env_set() {
    local var="$1" value="$2"
    local old
    old=$(env_get "$var")
    if grep -q "^${var}=" "$ENV_FILE" 2>/dev/null; then
        local tmp="${ENV_FILE}.tmp"
        awk -v k="${var}" -v v="${value}" 'BEGIN{FS=OFS="="} $1==k{$0=k"="v} {print}' "$ENV_FILE" > "$tmp" && mv "$tmp" "$ENV_FILE"
    else
        echo "${var}=${value}" >> "$ENV_FILE"
    fi
    if [[ "$var" == NEXT_PUBLIC_* ]] && [ "$old" != "$value" ]; then
        FORCE_NOCACHE=true
    fi
}

prompt_value() {
    local var="$1" description="$2" default="${3:-}" current
    current=$(env_get "$var")
    if [ "$INTERACTIVE" = false ]; then
        echo "$current"
        return
    fi
    local shown="${current:-$default}"
    local prompt_text
    if [ -n "$shown" ]; then
        prompt_text="${CYAN}?${NC} ${var} (${description}) [${shown}]: "
    else
        prompt_text="${CYAN}?${NC} ${var} (${description}): "
    fi
    read -rp "$(echo -e "$prompt_text")" input
    echo "${input:-$shown}"
}

ask_yn() {
    local q="$1" default="${2:-n}" yn
    if [ "$ASSUME_YES" = true ]; then return 0; fi
    if [ "$INTERACTIVE" = false ]; then
        [ "$default" = "y" ] && return 0 || return 1
    fi
    local hint="[y/N]"
    [ "$default" = "y" ] && hint="[Y/n]"
    read -rp "$(echo -e "${CYAN}?${NC} ${q} ${hint}: ")" yn
    yn="${yn:-$default}"
    [[ "$yn" =~ ^[Yy]$ ]]
}

cd "$PROJECT_DIR"
export PORT

# --------------------------------------------------
# Quick commands (no env validation needed)
# --------------------------------------------------

case "$COMMAND" in
    help)
        echo ""
        echo "TaskHub Production Deployment"
        echo ""
        echo "Usage: ./scripts/deploy-prod.sh [command] [options]"
        echo ""
        echo "Commands:"
        echo "  (default)   Preflight + plan + build + start"
        echo "  preflight   Run server + env checks only (no build)"
        echo "  stop        Stop running containers"
        echo "  restart     Restart containers"
        echo "  logs        Tail container logs (Ctrl+C to exit)"
        echo "  status      Show container status"
        echo "  rebuild     Force rebuild image and restart"
        echo "  backup      Backup SQLite database from volume"
        echo ""
        echo "Options:"
        echo "  --port N            Override exposed port (default: 3000)"
        echo "  --attached          Run in foreground instead of detached"
        echo "  --yes, -y           Skip interactive confirmation"
        echo "  --non-interactive   Fail on missing values instead of prompting"
        echo ""
        exit 0
        ;;
    stop)
        info "Stopping TaskHub..."
        docker compose down
        ok "TaskHub stopped"
        exit 0
        ;;
    restart)
        info "Restarting TaskHub..."
        docker compose restart
        ok "TaskHub restarted"
        exit 0
        ;;
    logs)
        docker compose logs -f
        exit 0
        ;;
    status)
        docker compose ps
        exit 0
        ;;
    backup)
        info "Backing up database from Docker volume..."
        BACKUP_DIR="$PROJECT_DIR/data/backups"
        mkdir -p "$BACKUP_DIR"
        BACKUP_FILE="$BACKUP_DIR/taskhub_$(date +%Y%m%d_%H%M%S).db"
        docker compose cp taskhub:/app/data/taskhub.db "$BACKUP_FILE" 2>/dev/null || {
            error "Failed to backup. Is the container running?"
            exit 1
        }
        ok "Database backed up to $BACKUP_FILE"
        # Keep last 10 backups
        ls -t "$BACKUP_DIR"/taskhub_*.db 2>/dev/null | tail -n +11 | xargs -r rm -f
        info "Keeping last 10 backups"
        exit 0
        ;;
esac

# --------------------------------------------------
# Preflight: server checks
# --------------------------------------------------

SERVER_WARNINGS=()
SERVER_ERRORS=()

check_server_config() {
    step "Проверка сервера"

    if command -v docker &> /dev/null; then
        ok "docker: $(docker --version | awk '{print $3}' | tr -d ',')"
    else
        SERVER_ERRORS+=("docker не установлен")
        error "docker не найден"
    fi

    if docker compose version &> /dev/null; then
        ok "docker compose v2"
    else
        SERVER_ERRORS+=("docker compose v2 недоступен")
    fi

    if command -v nginx &> /dev/null; then
        ok "nginx: $(nginx -v 2>&1 | awk -F/ '{print $2}')"
    else
        SERVER_WARNINGS+=("nginx не установлен (reverse proxy нужен для HTTPS)")
        warn "nginx не найден — нужен reverse proxy"
    fi

    if command -v certbot &> /dev/null; then
        ok "certbot: $(certbot --version 2>&1 | awk '{print $2}')"
    else
        SERVER_WARNINGS+=("certbot не установлен (нужен для Let's Encrypt)")
        warn "certbot не найден"
    fi

    if command -v ufw &> /dev/null; then
        local ufw_status
        ufw_status=$(ufw status 2>/dev/null | head -1 || echo "")
        ok "ufw: ${ufw_status}"
        if ! ufw status 2>/dev/null | grep -qE "7881.*(ALLOW|allow)"; then
            SERVER_WARNINGS+=("ufw: 7881/tcp не открыт (LiveKit TCP fallback)")
        fi
        if ! ufw status 2>/dev/null | grep -qE "50000.*50100.*(ALLOW|allow)"; then
            SERVER_WARNINGS+=("ufw: 50000-50100/udp не открыт (WebRTC media)")
        fi
    else
        SERVER_WARNINGS+=("ufw не установлен — проверьте firewall вручную")
    fi

    if command -v dig &> /dev/null; then
        local app_host livekit_host app_url livekit_url
        app_url=$(env_get NEXT_PUBLIC_APP_URL)
        livekit_url=$(env_get NEXT_PUBLIC_LIVEKIT_URL)
        app_host=$(echo "$app_url" | sed -E 's|^https?://||; s|/.*||')
        livekit_host=$(echo "$livekit_url" | sed -E 's|^wss?://||; s|/.*||')
        if [ -n "$app_host" ]; then
            if dig +short "$app_host" A | grep -qE '^[0-9]'; then
                ok "DNS A ${app_host}"
            else
                SERVER_WARNINGS+=("DNS: A-запись ${app_host} не резолвится")
            fi
        fi
        if [ -n "$livekit_host" ] && [ "$livekit_host" != "$app_host" ]; then
            if dig +short "$livekit_host" A | grep -qE '^[0-9]'; then
                ok "DNS A ${livekit_host}"
            else
                SERVER_WARNINGS+=("DNS: A-запись ${livekit_host} не резолвится")
            fi
        fi
    else
        SERVER_WARNINGS+=("dig не установлен — DNS-проверка пропущена")
    fi
}

check_nginx_sites() {
    step "Проверка nginx сайтов"
    local app_url livekit_url app_host livekit_host
    app_url=$(env_get NEXT_PUBLIC_APP_URL)
    livekit_url=$(env_get NEXT_PUBLIC_LIVEKIT_URL)
    app_host=$(echo "$app_url" | sed -E 's|^https?://||; s|/.*||')
    livekit_host=$(echo "$livekit_url" | sed -E 's|^wss?://||; s|/.*||')

    local nginx_dirs=("/etc/nginx/sites-enabled" "/etc/nginx/conf.d")
    local found_app=false found_livekit=false
    for d in "${nginx_dirs[@]}"; do
        [ -d "$d" ] || continue
        if grep -RslE "server_name.*${app_host//./\\.}" "$d" 2>/dev/null | head -1 | grep -q .; then
            found_app=true
        fi
        if [ -n "$livekit_host" ] && grep -RslE "server_name.*${livekit_host//./\\.}" "$d" 2>/dev/null | head -1 | grep -q .; then
            found_livekit=true
        fi
    done
    $found_app && ok "nginx: сайт ${app_host}" || SERVER_WARNINGS+=("nginx: server_name ${app_host} не найден")
    if [ -n "$livekit_host" ]; then
        $found_livekit && ok "nginx: сайт ${livekit_host}" || SERVER_WARNINGS+=("nginx: server_name ${livekit_host} не найден (wss reverse proxy)")
    fi

    local cert_dir="/etc/letsencrypt/live"
    if [ -d "$cert_dir" ]; then
        [ -d "${cert_dir}/${app_host}" ] && ok "TLS-сертификат ${app_host}" || SERVER_WARNINGS+=("TLS: сертификат для ${app_host} не найден")
        if [ -n "$livekit_host" ]; then
            [ -d "${cert_dir}/${livekit_host}" ] && ok "TLS-сертификат ${livekit_host}" || SERVER_WARNINGS+=("TLS: сертификат для ${livekit_host} не найден — certbot --nginx -d ${livekit_host}")
        fi
    fi
}

check_livekit_yaml_sync() {
    step "Проверка синхронизации infra/livekit.yaml"
    local yaml="$PROJECT_DIR/infra/livekit.yaml"
    if [ ! -f "$yaml" ]; then
        SERVER_WARNINGS+=("infra/livekit.yaml отсутствует")
        warn "infra/livekit.yaml не найден"
        return
    fi
    local env_key env_secret
    env_key=$(env_get LIVEKIT_API_KEY)
    env_secret=$(env_get LIVEKIT_API_SECRET)
    if [ -n "$env_key" ] && grep -qE "^\s*${env_key}\s*:" "$yaml"; then
        ok "livekit.yaml содержит LIVEKIT_API_KEY"
    else
        SERVER_WARNINGS+=("infra/livekit.yaml: LIVEKIT_API_KEY не совпадает — запустить node scripts/sync-livekit-keys.mjs")
    fi
}

need_sudo() {
    if [ "$(id -u)" -eq 0 ]; then
        SUDO=""
    else
        SUDO="sudo"
    fi
}

offer_fixes() {
    step "Автоисправления (каждое требует подтверждения)"
    need_sudo

    local app_host livekit_host
    app_host=$(env_get NEXT_PUBLIC_APP_URL | sed -E 's|^https?://||; s|/.*||')
    livekit_host=$(env_get NEXT_PUBLIC_LIVEKIT_URL | sed -E 's|^wss?://||; s|/.*||')

    if command -v ufw &>/dev/null; then
        if ! ufw status 2>/dev/null | grep -qE "7881.*(ALLOW|allow)"; then
            if ask_yn "Исправить: открыть 7881/tcp (LiveKit TCP fallback) через ufw?" "y"; then
                $SUDO ufw allow 7881/tcp && ok "ufw: 7881/tcp открыт" || warn "ufw не удалось"
            fi
        fi
        if ! ufw status 2>/dev/null | grep -qE "50000.*50100.*(ALLOW|allow)"; then
            if ask_yn "Исправить: открыть 50000:50100/udp (WebRTC media) через ufw?" "y"; then
                $SUDO ufw allow 50000:50100/udp && ok "ufw: 50000-50100/udp открыт" || warn "ufw не удалось"
            fi
        fi
    fi

    if [ -n "$livekit_host" ] && [ -d /etc/nginx ]; then
        local nginx_conf="/etc/nginx/sites-available/${livekit_host}.conf"
        local enabled="/etc/nginx/sites-enabled/${livekit_host}.conf"
        local has_site=false
        grep -RslE "server_name.*${livekit_host//./\\.}" /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null | head -1 | grep -q . && has_site=true

        if ! $has_site; then
            echo ""
            info "Будет создан файл: ${nginx_conf}"
            info "Содержимое: reverse proxy 127.0.0.1:7880 с WebSocket upgrade, listen 80"
            if ask_yn "Исправить: создать nginx site ${livekit_host}?" "y"; then
                $SUDO tee "$nginx_conf" >/dev/null <<NGINX
server {
    server_name ${livekit_host};

    location / {
        proxy_pass http://127.0.0.1:7880;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    listen 80;
    listen [::]:80;
}
NGINX
                $SUDO ln -sf "$nginx_conf" "$enabled"
                if $SUDO nginx -t; then
                    $SUDO systemctl reload nginx && ok "nginx site ${livekit_host} создан (HTTP)"
                else
                    error "nginx -t failed — config не применён"
                fi
            fi
        fi

        if [ ! -d "/etc/letsencrypt/live/${livekit_host}" ] && command -v certbot &>/dev/null; then
            local admin_email
            admin_email=$(env_get ADMIN_EMAIL)
            echo ""
            info "certbot выпустит Let's Encrypt для ${livekit_host} и добавит redirect 80→443"
            if ask_yn "Исправить: выпустить TLS-сертификат для ${livekit_host}?" "y"; then
                $SUDO certbot --nginx -d "$livekit_host" --non-interactive --agree-tos -m "${admin_email:-admin@${app_host}}" --redirect \
                    && ok "TLS выпущен для ${livekit_host}" \
                    || error "certbot не смог выпустить сертификат"
            fi
        fi
    fi

    local env_key yaml="$PROJECT_DIR/infra/livekit.yaml"
    env_key=$(env_get LIVEKIT_API_KEY)
    if [ -f "$yaml" ] && [ -n "$env_key" ] && ! grep -qE "^\s*${env_key}\s*:" "$yaml"; then
        if ask_yn "Исправить: синхронизировать LIVEKIT_API_KEY в infra/livekit.yaml?" "y"; then
            if [ -f "$PROJECT_DIR/scripts/sync-livekit-keys.mjs" ]; then
                (cd "$PROJECT_DIR" && node scripts/sync-livekit-keys.mjs) \
                    && ok "livekit.yaml синхронизирован" \
                    || warn "sync-livekit-keys.mjs завершился с ошибкой"
            else
                warn "scripts/sync-livekit-keys.mjs отсутствует — править вручную"
            fi
        fi
    fi

    local vp nvp
    vp=$(env_get VAPID_PUBLIC_KEY)
    nvp=$(env_get NEXT_PUBLIC_VAPID_PUBLIC_KEY)
    if [ -n "$vp" ] && [ -n "$nvp" ] && [ "$vp" != "$nvp" ]; then
        if ask_yn "Исправить: NEXT_PUBLIC_VAPID_PUBLIC_KEY ← VAPID_PUBLIC_KEY?" "y"; then
            env_set NEXT_PUBLIC_VAPID_PUBLIC_KEY "$vp"
            ok "VAPID keys синхронизированы"
        fi
    fi
}

# --------------------------------------------------
# Full deployment: up / rebuild / preflight
# --------------------------------------------------

echo ""
echo "============================================"
if [ "$COMMAND" = "preflight" ]; then
    echo "  TaskHub — Preflight проверка"
else
    echo "  TaskHub — Production Deployment"
fi
echo "============================================"
echo ""

# 1. Check Docker
info "Checking Docker..."

if ! command -v docker &> /dev/null; then
    error "Docker not found. Install Docker: https://docs.docker.com/get-docker/"
    exit 1
fi

if ! docker compose version &> /dev/null; then
    error "Docker Compose V2 not found. Update Docker."
    exit 1
fi

ok "Docker $(docker --version | cut -d' ' -f3 | tr -d ',')"

# 2. Check / create .env.production
MISSING_VARS=()

check_env_var() {
    local var_name="$1"
    local required="${2:-true}"
    if [ -f "$ENV_FILE" ]; then
        local value
        value=$(grep "^${var_name}=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- | head -1)
        if [ -z "$value" ]; then
            [ "$required" = "true" ] && MISSING_VARS+=("$var_name")
            return 1
        fi
    else
        [ "$required" = "true" ] && MISSING_VARS+=("$var_name")
        return 1
    fi
    return 0
}

if [ ! -f "$ENV_FILE" ]; then
    warn ".env.production not found. Creating template..."

    # Generate secrets
    if command -v node &> /dev/null; then
        JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
        ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
    elif command -v openssl &> /dev/null; then
        JWT_SECRET=$(openssl rand -hex 32)
        ENCRYPTION_KEY=$(openssl rand -hex 32)
    else
        JWT_SECRET=$(docker run --rm node:20-alpine node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
        ENCRYPTION_KEY=$(docker run --rm node:20-alpine node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
    fi

    # Generate VAPID keys
    info "Generating VAPID keys..."
    VAPID_KEYS=""
    if command -v npx &> /dev/null; then
        VAPID_KEYS=$(npx web-push generate-vapid-keys --json 2>/dev/null || echo "")
    fi
    if [ -z "$VAPID_KEYS" ]; then
        VAPID_KEYS=$(docker run --rm node:20-alpine sh -c "npm install --silent web-push 2>/dev/null && npx web-push generate-vapid-keys --json 2>/dev/null" || echo "")
    fi

    if [ -n "$VAPID_KEYS" ]; then
        VAPID_PUBLIC=$(echo "$VAPID_KEYS" | grep -o '"publicKey":"[^"]*"' | cut -d'"' -f4)
        VAPID_PRIVATE=$(echo "$VAPID_KEYS" | grep -o '"privateKey":"[^"]*"' | cut -d'"' -f4)
        ok "VAPID keys generated"
    else
        VAPID_PUBLIC=""
        VAPID_PRIVATE=""
        warn "Could not generate VAPID keys — push notifications disabled"
    fi

    cat > "$ENV_FILE" <<EOF
# ============================================================
# TaskHub — Production Environment
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# ============================================================

# ===== REQUIRED =====

NODE_ENV=production

# JWT secret (auto-generated, keep safe)
JWT_SECRET=${JWT_SECRET}

# AES-256-GCM encryption key (auto-generated, KEEP SAFE!)
ENCRYPTION_KEY=${ENCRYPTION_KEY}

# Admin account (created on first start)
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=CHANGE_ME_NOW_Strong1!

# Public URL (no trailing slash)
NEXT_PUBLIC_APP_URL=https://your-domain.com

# ===== WEB PUSH (VAPID) =====
VAPID_PUBLIC_KEY=${VAPID_PUBLIC}
VAPID_PRIVATE_KEY=${VAPID_PRIVATE}
VAPID_SUBJECT=mailto:admin@your-domain.com
NEXT_PUBLIC_VAPID_PUBLIC_KEY=${VAPID_PUBLIC}

# ===== OPTIONAL =====

# AI features (leave empty to disable)
OPENROUTER_API_KEY=
EOF

    echo ""
    error "=================================================="
    error "  .env.production created — edit it first!"
    error ""
    error "  Required changes:"
    error "    ADMIN_PASSWORD   → strong password"
    error "    NEXT_PUBLIC_APP_URL → your domain"
    error ""
    error "  Optional:"
    error "    VAPID keys (for push notifications)"
    error "    OPENROUTER_API_KEY (for AI features)"
    error "=================================================="
    echo ""
    error "Then re-run: ./scripts/deploy-prod.sh"
    exit 1
fi

info "Validating .env.production..."

check_env_var "JWT_SECRET"
check_env_var "ENCRYPTION_KEY"
check_env_var "ADMIN_EMAIL"
check_env_var "ADMIN_PASSWORD"
check_env_var "NEXT_PUBLIC_APP_URL"
check_env_var "LIVEKIT_API_KEY"
check_env_var "LIVEKIT_API_SECRET"
check_env_var "LIVEKIT_URL"
check_env_var "NEXT_PUBLIC_LIVEKIT_URL"
check_env_var "MEETING_WORKER_URL"

check_env_var "VAPID_PUBLIC_KEY" false || warn "VAPID keys not set — push disabled"
check_env_var "VAPID_PRIVATE_KEY" false || true
check_env_var "NEXT_PUBLIC_VAPID_PUBLIC_KEY" false || true
check_env_var "OPENROUTER_API_KEY" false || warn "OPENROUTER_API_KEY not set — AI disabled"

if grep -q "CHANGE_ME_NOW" "$ENV_FILE" 2>/dev/null; then
    MISSING_VARS+=("ADMIN_PASSWORD (still placeholder)")
fi

APP_URL=$(grep "^NEXT_PUBLIC_APP_URL=" "$ENV_FILE" | cut -d= -f2-)
if [[ "$APP_URL" == *"your-domain"* ]]; then
    MISSING_VARS+=("NEXT_PUBLIC_APP_URL (still placeholder)")
fi

LK_PUB_URL=$(env_get NEXT_PUBLIC_LIVEKIT_URL)
if [[ "$LK_PUB_URL" == *"localhost"* ]]; then
    MISSING_VARS+=("NEXT_PUBLIC_LIVEKIT_URL (содержит localhost — нужен wss://домен)")
fi
if [ -n "$LK_PUB_URL" ] && [[ "$LK_PUB_URL" != wss://* ]] && [[ "$APP_URL" == https://* ]]; then
    MISSING_VARS+=("NEXT_PUBLIC_LIVEKIT_URL должен начинаться с wss:// для HTTPS-сайта")
fi

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
    warn "Не заполнены/невалидны:"
    for var in "${MISSING_VARS[@]}"; do
        echo "    - $var"
    done

    if [ "$INTERACTIVE" = false ]; then
        error "Запустите без --non-interactive или исправьте .env.production вручную."
        exit 1
    fi

    if ask_yn "Запросить значения интерактивно и записать в .env.production?" "y"; then
        NEW_APP_URL=$(prompt_value NEXT_PUBLIC_APP_URL "публичный URL, https://домен" "https://task-hub.example.com")
        env_set NEXT_PUBLIC_APP_URL "$NEW_APP_URL"

        NEW_LK_URL=$(prompt_value NEXT_PUBLIC_LIVEKIT_URL "публичный LiveKit, wss://livekit.домен" "wss://livekit.$(echo "$NEW_APP_URL" | sed -E 's|^https?://||')")
        env_set NEXT_PUBLIC_LIVEKIT_URL "$NEW_LK_URL"

        NEW_ADMIN_PW=$(prompt_value ADMIN_PASSWORD "пароль админа (минимум 12 символов)")
        if [ -n "$NEW_ADMIN_PW" ] && [ "$NEW_ADMIN_PW" != "$(env_get ADMIN_PASSWORD)" ]; then
            env_set ADMIN_PASSWORD "$NEW_ADMIN_PW"
        fi

        NEW_ADMIN_EMAIL=$(prompt_value ADMIN_EMAIL "email администратора" "admin@$(echo "$NEW_APP_URL" | sed -E 's|^https?://||')")
        env_set ADMIN_EMAIL "$NEW_ADMIN_EMAIL"

        # LiveKit URL для docker-сети (перекрывается docker-compose, но фиксируем значение)
        NEW_LK_INT=$(prompt_value LIVEKIT_URL "internal LiveKit (http://livekit:7880 для docker)" "http://livekit:7880")
        env_set LIVEKIT_URL "$NEW_LK_INT"

        NEW_MW_URL=$(prompt_value MEETING_WORKER_URL "internal meeting-worker" "http://meeting-worker:3100")
        env_set MEETING_WORKER_URL "$NEW_MW_URL"

        # повторная валидация
        MISSING_VARS=()
        check_env_var "ADMIN_PASSWORD"
        check_env_var "NEXT_PUBLIC_APP_URL"
        check_env_var "NEXT_PUBLIC_LIVEKIT_URL"
        [[ "$(env_get NEXT_PUBLIC_APP_URL)" == *"your-domain"* ]] && MISSING_VARS+=("NEXT_PUBLIC_APP_URL")
        [[ "$(env_get ADMIN_PASSWORD)" == *"CHANGE_ME_NOW"* ]] && MISSING_VARS+=("ADMIN_PASSWORD")
        [[ "$(env_get NEXT_PUBLIC_LIVEKIT_URL)" == *"localhost"* ]] && MISSING_VARS+=("NEXT_PUBLIC_LIVEKIT_URL")
        if [ ${#MISSING_VARS[@]} -gt 0 ]; then
            error "Всё ещё пусто: ${MISSING_VARS[*]}"
            exit 1
        fi
        ok "Значения записаны в .env.production"
    else
        error "Отмена. Отредактируйте .env.production вручную."
        exit 1
    fi
fi

ENC_KEY=$(grep "^ENCRYPTION_KEY=" "$ENV_FILE" | cut -d= -f2-)
if [ ${#ENC_KEY} -ne 64 ]; then
    error "ENCRYPTION_KEY must be 64 hex chars."
    exit 1
fi

# sync check: NEXT_PUBLIC_VAPID_PUBLIC_KEY == VAPID_PUBLIC_KEY
VP=$(env_get VAPID_PUBLIC_KEY)
NVP=$(env_get NEXT_PUBLIC_VAPID_PUBLIC_KEY)
if [ -n "$VP" ] && [ -n "$NVP" ] && [ "$VP" != "$NVP" ]; then
    warn "VAPID_PUBLIC_KEY != NEXT_PUBLIC_VAPID_PUBLIC_KEY — клиентские подписки будут невалидны"
    if ask_yn "Синхронизировать NEXT_PUBLIC_VAPID_PUBLIC_KEY с VAPID_PUBLIC_KEY?" "y"; then
        env_set NEXT_PUBLIC_VAPID_PUBLIC_KEY "$VP"
        ok "VAPID синхронизирован"
    fi
fi

ok "Environment validated"

# --------------------------------------------------
# Server preflight + plan
# --------------------------------------------------

check_server_config
check_nginx_sites
check_livekit_yaml_sync

if [ ${#SERVER_WARNINGS[@]} -gt 0 ] && [ "$INTERACTIVE" = true ]; then
    echo ""
    warn "Обнаружены предупреждения:"
    for w in "${SERVER_WARNINGS[@]}"; do
        echo "    - $w"
    done
    echo ""
    if ask_yn "Запустить автоисправления (каждое с апрувом)?" "y"; then
        offer_fixes
        SERVER_WARNINGS=()
        check_server_config
        check_nginx_sites
        check_livekit_yaml_sync
    fi
fi

APP_URL=$(env_get NEXT_PUBLIC_APP_URL)
LK_URL=$(env_get NEXT_PUBLIC_LIVEKIT_URL)

echo ""
step "План выполнения"
plan "Проверен .env.production (JWT/ENCRYPTION/ADMIN/LiveKit/VAPID)"
plan "APP_URL  = ${APP_URL}"
plan "LIVEKIT  = ${LK_URL}"
plan "PORT     = ${PORT}"
if [ "$COMMAND" != "preflight" ]; then
    plan "docker compose down (если запущен)"
    plan "docker compose build"
    plan "docker compose up -d (taskhub + livekit + livekit-egress + redis + meeting-worker)"
    plan "Ожидание healthcheck taskhub"
fi

if [ ${#SERVER_WARNINGS[@]} -gt 0 ]; then
    echo ""
    warn "Предупреждения сервера:"
    for w in "${SERVER_WARNINGS[@]}"; do
        echo "    - $w"
    done
fi

if [ ${#SERVER_ERRORS[@]} -gt 0 ]; then
    echo ""
    error "Ошибки сервера:"
    for e in "${SERVER_ERRORS[@]}"; do
        echo "    - $e"
    done
    exit 1
fi

if [ "$COMMAND" = "preflight" ]; then
    echo ""
    ok "Preflight завершён. Запустите ./scripts/deploy-prod.sh для деплоя."
    exit 0
fi

echo ""
if ! ask_yn "Продолжить деплой?" "y"; then
    info "Отменено пользователем."
    exit 0
fi

# 3. Stop existing container if running
if docker compose ps --format json 2>/dev/null | grep -q "taskhub"; then
    info "Stopping existing container..."
    docker compose down
    ok "Stopped"
fi

# 4. Build image
BUILD_FLAGS=""
if [ "$COMMAND" = "rebuild" ] || [ "$FORCE_NOCACHE" = true ]; then
    BUILD_FLAGS="--no-cache"
    info "Building Docker image (--no-cache: ${COMMAND}${FORCE_NOCACHE:+ / NEXT_PUBLIC_* изменены})..."
else
    info "Building Docker image..."
fi
docker compose build $BUILD_FLAGS
ok "Image built"

# 5. Start container
if [ "$ATTACHED" = true ]; then
    info "Starting TaskHub (foreground, Ctrl+C to stop)..."
    echo ""
    docker compose up
else
    info "Starting TaskHub..."
    docker compose up -d

    # 6. Wait for healthy
    info "Waiting for service to be ready..."
    RETRIES=0
    MAX_RETRIES=30
    while [ $RETRIES -lt $MAX_RETRIES ]; do
        if docker compose ps --format json 2>/dev/null | grep -q '"Health":"healthy"'; then
            break
        fi
        # Check if container crashed
        if ! docker compose ps --format json 2>/dev/null | grep -q '"running"'; then
            if [ $RETRIES -gt 5 ]; then
                error "Container is not running. Logs:"
                docker compose logs --tail 30
                exit 1
            fi
        fi
        sleep 2
        RETRIES=$((RETRIES + 1))
    done

    if [ $RETRIES -lt $MAX_RETRIES ]; then
        ok "TaskHub is healthy!"
    else
        warn "Healthcheck timeout — container may still be starting"
        info "Check with: ./scripts/deploy-prod.sh logs"
    fi

    echo ""
    echo "============================================"
    echo -e "  ${GREEN}TaskHub is running!${NC}"
    echo "============================================"
    echo ""
    echo "  URL:        $APP_URL"
    echo "  Port:       $PORT"
    echo "  Container:  taskhub"
    echo ""
    echo "  Management:"
    echo "    ./scripts/deploy-prod.sh logs      # view logs"
    echo "    ./scripts/deploy-prod.sh status    # check status"
    echo "    ./scripts/deploy-prod.sh restart   # restart"
    echo "    ./scripts/deploy-prod.sh stop      # stop"
    echo "    ./scripts/deploy-prod.sh backup    # backup DB"
    echo "    ./scripts/deploy-prod.sh rebuild   # rebuild + restart"
    echo ""
    echo -e "  ${YELLOW}Notes:${NC}"
    echo "    - Data persisted in Docker volume: taskhub-data"
    echo "    - DB migrations apply automatically on start"
    echo "    - Cron jobs enabled (overdue checks, digests, reports)"
    echo "    - Set up reverse proxy (nginx/caddy) with HTTPS"
    echo ""
fi
