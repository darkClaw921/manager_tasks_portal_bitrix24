#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# TaskHub — Production Deployment
# ============================================================
# Usage:
#   chmod +x scripts/deploy-prod.sh
#   ./scripts/deploy-prod.sh [--skip-build] [--port 3000]
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PROJECT_DIR/.env.production"

SKIP_BUILD=false
PORT=3000

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-build) SKIP_BUILD=true; shift ;;
        --port) PORT="$2"; shift 2 ;;
        *) echo "Unknown option: $1"; exit 1 ;;
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

echo ""
echo "============================================"
echo "  TaskHub — Production Deployment"
echo "============================================"
echo ""

cd "$PROJECT_DIR"

# --------------------------------------------------
# 1. Check Node.js version
# --------------------------------------------------
info "Checking Node.js version..."

if ! command -v node &> /dev/null; then
    error "Node.js not found. Install Node.js 20+."
    exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    error "Node.js 20+ required, found $(node -v)."
    exit 1
fi
ok "Node.js $(node -v)"

# --------------------------------------------------
# 2. Check / create .env.production
# --------------------------------------------------
MISSING_VARS=()

check_env_var() {
    local var_name="$1"
    local required="${2:-true}"

    if [ -f "$ENV_FILE" ]; then
        local value
        value=$(grep "^${var_name}=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- | head -1)
        if [ -z "$value" ]; then
            if [ "$required" = "true" ]; then
                MISSING_VARS+=("$var_name")
            fi
            return 1
        fi
    else
        if [ "$required" = "true" ]; then
            MISSING_VARS+=("$var_name")
        fi
        return 1
    fi
    return 0
}

if [ ! -f "$ENV_FILE" ]; then
    warn ".env.production not found. Creating template..."

    # Generate secrets automatically
    JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
    ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

    cat > "$ENV_FILE" <<EOF
# ============================================================
# TaskHub — Production Environment
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# ============================================================

# ===== REQUIRED =====

NODE_ENV=production

# JWT secret (auto-generated, keep safe)
JWT_SECRET=${JWT_SECRET}

# AES-256-GCM encryption key for DB credentials (auto-generated, KEEP SAFE!)
# If lost, encrypted tokens become unreadable — backup this key!
ENCRYPTION_KEY=${ENCRYPTION_KEY}

# Admin account (created on first start)
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=CHANGE_ME_NOW_Strong1!

# Public URL (no trailing slash)
NEXT_PUBLIC_APP_URL=https://your-domain.com

# Bitrix24 OAuth
BITRIX_CLIENT_ID=
BITRIX_CLIENT_SECRET=

# ===== WEB PUSH (VAPID) =====
# Run: npm run vapid:generate — then paste keys below
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:admin@your-domain.com
NEXT_PUBLIC_VAPID_PUBLIC_KEY=

# ===== OPTIONAL =====

# Database path (default: ./data/taskhub.db)
# DATABASE_PATH=./data/taskhub.db

# AI features (leave empty to disable)
OPENROUTER_API_KEY=
EOF

    echo ""
    error "=================================================="
    error "  .env.production created with PLACEHOLDER values!"
    error "  Edit it before continuing:"
    error "    - Set ADMIN_PASSWORD (strong password)"
    error "    - Set NEXT_PUBLIC_APP_URL"
    error "    - Set BITRIX_CLIENT_ID / SECRET"
    error "    - Run: npm run vapid:generate"
    error "    - Set VAPID keys"
    error "=================================================="
    echo ""
    error "Then re-run: ./scripts/deploy-prod.sh"
    exit 1
fi

info "Validating .env.production..."

# Required variables
check_env_var "JWT_SECRET"
check_env_var "ENCRYPTION_KEY"
check_env_var "ADMIN_EMAIL"
check_env_var "ADMIN_PASSWORD"
check_env_var "NEXT_PUBLIC_APP_URL"
check_env_var "BITRIX_CLIENT_ID"
check_env_var "BITRIX_CLIENT_SECRET"

# Optional but recommended
check_env_var "VAPID_PUBLIC_KEY" false || warn "VAPID_PUBLIC_KEY not set — push notifications disabled"
check_env_var "VAPID_PRIVATE_KEY" false || true
check_env_var "NEXT_PUBLIC_VAPID_PUBLIC_KEY" false || true
check_env_var "OPENROUTER_API_KEY" false || warn "OPENROUTER_API_KEY not set — AI features disabled"

# Check placeholder values
if grep -q "CHANGE_ME_NOW" "$ENV_FILE" 2>/dev/null; then
    MISSING_VARS+=("ADMIN_PASSWORD (still has placeholder)")
fi

APP_URL=$(grep "^NEXT_PUBLIC_APP_URL=" "$ENV_FILE" | cut -d= -f2-)
if [[ "$APP_URL" == *"your-domain"* ]] || [[ "$APP_URL" == *"localhost"* ]]; then
    MISSING_VARS+=("NEXT_PUBLIC_APP_URL (still has placeholder/localhost)")
fi

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
    error "Missing or invalid required variables in .env.production:"
    for var in "${MISSING_VARS[@]}"; do
        error "  - $var"
    done
    exit 1
fi

# Validate ENCRYPTION_KEY length (64 hex chars = 32 bytes)
ENC_KEY=$(grep "^ENCRYPTION_KEY=" "$ENV_FILE" | cut -d= -f2-)
if [ ${#ENC_KEY} -ne 64 ]; then
    error "ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)."
    error "Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    exit 1
fi

ok "Environment variables validated"

# --------------------------------------------------
# 3. Install production dependencies
# --------------------------------------------------
info "Installing dependencies (production)..."

npm ci --silent
ok "Dependencies installed"

# --------------------------------------------------
# 4. Create data directory with proper permissions
# --------------------------------------------------
info "Preparing data directory..."

DATA_DIR="$PROJECT_DIR/data"
mkdir -p "$DATA_DIR"
chmod 700 "$DATA_DIR"
ok "data/ directory ready (mode 700)"

# --------------------------------------------------
# 5. Copy env to .env.local for Next.js
# --------------------------------------------------
# Next.js reads .env.local by default, so we symlink/copy
info "Linking environment file..."

if [ -f "$PROJECT_DIR/.env.local" ] && [ ! -L "$PROJECT_DIR/.env.local" ]; then
    # Backup existing .env.local
    cp "$PROJECT_DIR/.env.local" "$PROJECT_DIR/.env.local.bak.$(date +%s)"
    warn "Existing .env.local backed up"
fi

cp "$ENV_FILE" "$PROJECT_DIR/.env.local"
ok "Production env linked as .env.local"

# --------------------------------------------------
# 6. Type-check
# --------------------------------------------------
info "Running type-check..."
if npm run type-check 2>&1; then
    ok "Type-check passed"
else
    error "Type-check failed. Fix errors before deploying."
    exit 1
fi

# --------------------------------------------------
# 7. Build
# --------------------------------------------------
if [ "$SKIP_BUILD" = true ]; then
    warn "Build skipped (--skip-build)"
else
    info "Building production bundle..."
    NODE_ENV=production npm run build 2>&1
    ok "Build complete"
fi

# --------------------------------------------------
# 8. Encrypt existing tokens (idempotent)
# --------------------------------------------------
info "Running token encryption migration..."
if npx tsx scripts/encrypt-existing-tokens.ts 2>&1; then
    ok "Token encryption migration complete"
else
    warn "Token encryption skipped (may be first deployment)"
fi

# --------------------------------------------------
# 9. Backup database (if exists)
# --------------------------------------------------
DB_PATH=$(grep "^DATABASE_PATH=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- || echo "")
DB_PATH="${DB_PATH:-./data/taskhub.db}"

if [ -f "$DB_PATH" ]; then
    BACKUP_DIR="$PROJECT_DIR/data/backups"
    mkdir -p "$BACKUP_DIR"
    BACKUP_FILE="$BACKUP_DIR/taskhub_$(date +%Y%m%d_%H%M%S).db"
    cp "$DB_PATH" "$BACKUP_FILE"
    ok "Database backed up to $BACKUP_FILE"

    # Keep only last 5 backups
    ls -t "$BACKUP_DIR"/taskhub_*.db 2>/dev/null | tail -n +6 | xargs -r rm -f
    info "Keeping last 5 backups"
else
    info "No existing database — will be created on first start"
fi

# --------------------------------------------------
# 10. Summary & start
# --------------------------------------------------
echo ""
echo "============================================"
echo -e "  ${GREEN}Production deployment ready!${NC}"
echo "============================================"
echo ""
echo "  Start server:"
echo "    PORT=$PORT NODE_ENV=production npm start"
echo ""
echo "  Or with PM2:"
echo "    pm2 start npm --name taskhub -- start"
echo "    pm2 save"
echo ""
echo "  Or with systemd (create /etc/systemd/system/taskhub.service):"
echo "    [Service]"
echo "    WorkingDirectory=$PROJECT_DIR"
echo "    ExecStart=$(which node) $PROJECT_DIR/node_modules/.bin/next start -p $PORT"
echo "    Environment=NODE_ENV=production"
echo "    Restart=always"
echo ""
echo "  App URL:  $APP_URL"
echo "  Port:     $PORT"
echo ""
echo -e "  ${YELLOW}IMPORTANT:${NC}"
echo "    - Backup ENCRYPTION_KEY securely (if lost, tokens are unreadable)"
echo "    - Set up reverse proxy (nginx/caddy) with HTTPS"
echo "    - Set up log rotation for stdout/stderr"
echo "    - Set up periodic database backups"
echo ""
