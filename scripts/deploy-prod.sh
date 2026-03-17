#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# TaskHub — Production (Docker Compose)
# ============================================================
# Usage:
#   ./scripts/deploy-prod.sh                  # build + start
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

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        stop)       COMMAND="stop"; shift ;;
        restart)    COMMAND="restart"; shift ;;
        logs)       COMMAND="logs"; shift ;;
        status)     COMMAND="status"; shift ;;
        rebuild)    COMMAND="rebuild"; shift ;;
        backup)     COMMAND="backup"; shift ;;
        --port)     PORT="$2"; shift 2 ;;
        --attached) ATTACHED=true; shift ;;
        -h|--help)  COMMAND="help"; shift ;;
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
        echo "  (default)   Build image, apply migrations, start service"
        echo "  stop        Stop running containers"
        echo "  restart     Restart containers"
        echo "  logs        Tail container logs (Ctrl+C to exit)"
        echo "  status      Show container status"
        echo "  rebuild     Force rebuild image and restart"
        echo "  backup      Backup SQLite database from volume"
        echo ""
        echo "Options:"
        echo "  --port N    Override exposed port (default: 3000)"
        echo "  --attached  Run in foreground instead of detached"
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
# Full deployment: up / rebuild
# --------------------------------------------------

echo ""
echo "============================================"
echo "  TaskHub — Production Deployment"
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

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
    error "Fix these in .env.production:"
    for var in "${MISSING_VARS[@]}"; do
        error "  - $var"
    done
    exit 1
fi

ENC_KEY=$(grep "^ENCRYPTION_KEY=" "$ENV_FILE" | cut -d= -f2-)
if [ ${#ENC_KEY} -ne 64 ]; then
    error "ENCRYPTION_KEY must be 64 hex chars."
    exit 1
fi

ok "Environment validated"

# 3. Stop existing container if running
if docker compose ps --format json 2>/dev/null | grep -q "taskhub"; then
    info "Stopping existing container..."
    docker compose down
    ok "Stopped"
fi

# 4. Build image
info "Building Docker image..."
docker compose build
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
