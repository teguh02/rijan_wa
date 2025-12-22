#!/usr/bin/env bash
set -euo pipefail

SCRIPT_NAME="rijan_wa-linux-installer"

info() { printf '[%s] %s\n' "$SCRIPT_NAME" "$*"; }
warn() { printf '[%s] WARNING: %s\n' "$SCRIPT_NAME" "$*" >&2; }
die() { printf '[%s] ERROR: %s\n' "$SCRIPT_NAME" "$*" >&2; exit 1; }

require_cmd() {
	command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

is_linux() {
	[[ "$(uname -s 2>/dev/null || true)" == "Linux" ]]
}

have_cmd() {
	command -v "$1" >/dev/null 2>&1
}

get_install_dir() {
	# Default: repo root if present, otherwise current directory
	local script_dir
	script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

	if have_cmd git; then
		local git_root
		git_root="$(git -C "$script_dir" rev-parse --show-toplevel 2>/dev/null || true)"
		if [[ -n "$git_root" ]]; then
			printf '%s' "$git_root"
			return
		fi
	fi

	# fallback: two levels up (scripts/installation -> repo root)
	printf '%s' "$(cd "$script_dir/../.." && pwd)"
}

detect_pkg_manager() {
	if have_cmd apt-get; then
		echo "apt"
	elif have_cmd dnf; then
		echo "dnf"
	elif have_cmd yum; then
		echo "yum"
	else
		echo "unknown"
	fi
}

install_docker_apt() {
	info "Installing Docker Engine + Docker Compose (apt)…"
	require_cmd sudo
	require_cmd curl
	require_cmd gpg

	sudo apt-get update -y
	sudo apt-get install -y ca-certificates curl gnupg

	sudo install -m 0755 -d /etc/apt/keyrings

	if [[ ! -f /etc/apt/keyrings/docker.gpg ]]; then
		curl -fsSL https://download.docker.com/linux/$(. /etc/os-release && echo "$ID")/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
		sudo chmod a+r /etc/apt/keyrings/docker.gpg
	fi

	local arch codename os_id
	arch="$(dpkg --print-architecture)"
	codename="$(. /etc/os-release && echo "${VERSION_CODENAME:-}")"
	os_id="$(. /etc/os-release && echo "$ID")"

	if [[ -z "$codename" ]]; then
		if have_cmd lsb_release; then
			codename="$(lsb_release -cs)"
		fi
	fi
	[[ -n "$codename" ]] || die "Cannot detect distro codename for Docker repo (VERSION_CODENAME/lsb_release missing)."

	sudo tee /etc/apt/sources.list.d/docker.list >/dev/null <<EOF
deb [arch=${arch} signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${os_id} ${codename} stable
EOF

	sudo apt-get update -y
	sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

	sudo systemctl enable --now docker
}

install_docker_rhel() {
	local pm="$1"
	info "Installing Docker Engine + Docker Compose (${pm})…"
	require_cmd sudo
	require_cmd curl

	if [[ "$pm" == "dnf" ]]; then
		sudo dnf -y install dnf-plugins-core
		sudo dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
		sudo dnf -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
	else
		sudo yum -y install yum-utils
		sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
		sudo yum -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
	fi

	sudo systemctl enable --now docker
}

ensure_docker_installed() {
	if have_cmd docker; then
		return
	fi

	local pm
	pm="$(detect_pkg_manager)"
	case "$pm" in
		apt)
			install_docker_apt
			;;
		dnf|yum)
			install_docker_rhel "$pm"
			;;
		*)
			die "Unsupported Linux distro/package manager. Please install Docker manually: https://docs.docker.com/engine/install/"
			;;
	esac
}

DOCKER_USE_SUDO=0

init_docker_access() {
	# Prefer docker without sudo if accessible; fallback to sudo docker.
	if docker ps >/dev/null 2>&1; then
		DOCKER_USE_SUDO=0
		return
	fi
	if have_cmd sudo && sudo docker ps >/dev/null 2>&1; then
		DOCKER_USE_SUDO=1
		return
	fi
	die "Docker is installed but not usable (permission). Try: sudo usermod -aG docker $USER ; then re-login."
}

docker_exec() {
	if (( DOCKER_USE_SUDO == 1 )); then
		sudo docker "$@"
	else
		docker "$@"
	fi
}

ensure_compose_v2() {
	if docker_exec compose version >/dev/null 2>&1; then
		return
	fi

	warn "Docker Compose v2 plugin not found. Installing docker-compose-plugin…"

	local pm
	pm="$(detect_pkg_manager)"
	case "$pm" in
		apt)
			require_cmd sudo
			sudo apt-get update -y
			sudo apt-get install -y docker-compose-plugin
			;;
		dnf)
			require_cmd sudo
			sudo dnf -y install docker-compose-plugin
			;;
		yum)
			require_cmd sudo
			sudo yum -y install docker-compose-plugin
			;;
		*)
			die "Cannot auto-install docker-compose-plugin on this distro. Install Docker Compose v2 manually."
			;;
	esac
}

gen_master_password() {
	local len="$1"
	# Alphanumeric only (copy/paste friendly)
	LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c "$len"
}

sha256_hex() {
	local input="$1"
	# sha256sum outputs: "<hex>  -"
	printf '%s' "$input" | sha256sum | awk '{print $1}'
}

write_compose_file() {
	local install_dir="$1"
	local image_repo="$2"
	local image_tag="$3"
	local host_port="$4"

	local compose_path
	compose_path="$install_dir/docker-compose.yml"

	if [[ -f "$compose_path" ]]; then
		local backup_path
		backup_path="$compose_path.bak.$(date +%Y%m%d%H%M%S)"
		warn "docker-compose.yml already exists; backing up to: $backup_path"
		cp "$compose_path" "$backup_path"
	fi

	info "Writing docker-compose.yml (env_file-driven)…"
	cat >"$compose_path" <<EOF
services:
  rijan_wa:
    image: ${image_repo}:${image_tag}
    container_name: rijan_wa
    restart: unless-stopped
    ports:
      - "${host_port}:3000"
    env_file:
      - .env
    volumes:
      - rijan_wa_data:/app/data
      - rijan_wa_sessions:/app/sessions
      - rijan_wa_logs:/app/logs

volumes:
  rijan_wa_data:
  rijan_wa_sessions:
  rijan_wa_logs:
EOF
}

wait_for_container_healthy() {
	local container_name="$1"
	local timeout_sec="$2"

	local start_ts now_ts elapsed status
	start_ts="$(date +%s)"

	while true; do
		now_ts="$(date +%s)"
		elapsed=$((now_ts - start_ts))
		if (( elapsed > timeout_sec )); then
			warn "Timed out waiting for container '$container_name' to become healthy."
			warn "Check logs: docker logs $container_name"
			return 1
		fi

		status="$(docker_exec inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' "$container_name" 2>/dev/null || true)"

		case "$status" in
			healthy)
				info "Container is healthy."
				return 0
				;;
			unhealthy)
				warn "Container reported unhealthy (will keep waiting)…"
				;;
			no-healthcheck)
				warn "No Docker healthcheck detected; assuming container is running."
				return 0
				;;
			"")
				# container may not exist yet
				;;
			*)
				# starting
				;;
		esac

		sleep 2
	done
}

main() {
	is_linux || die "This installer is for Linux only."

	local image_repo image_tag install_dir master_len host_port
	image_repo="${RIJAN_WA_IMAGE_REPO:-teguh02/rijan_wa}"
	image_tag="${RIJAN_WA_IMAGE_TAG:-latest}"
	install_dir="${RIJAN_WA_INSTALL_DIR:-$(get_install_dir)}"
	host_port="${RIJAN_WA_HOST_PORT:-3000}"

	if ! [[ "$host_port" =~ ^[0-9]+$ ]]; then
		die "RIJAN_WA_HOST_PORT must be a number."
	fi
	if (( host_port < 1 || host_port > 65535 )); then
		die "RIJAN_WA_HOST_PORT must be between 1 and 65535."
	fi

	master_len="${RIJAN_WA_MASTER_PASSWORD_LEN:-16}"
	if ! [[ "$master_len" =~ ^[0-9]+$ ]]; then
		die "RIJAN_WA_MASTER_PASSWORD_LEN must be a number (12-20)."
	fi
	if (( master_len < 12 || master_len > 20 )); then
		die "RIJAN_WA_MASTER_PASSWORD_LEN must be between 12 and 20."
	fi

	info "Install dir: $install_dir"
	info "Image: ${image_repo}:${image_tag}"
	info "Host port: ${host_port} -> container 3000"

	# Generate and print credentials FIRST (before any Docker pull/run)
	info "Generating new .env (MASTER_KEY) …"
	mkdir -p "$install_dir"

	local master_password master_key_hash
	master_password="$(gen_master_password "$master_len")"
	if [[ -z "$master_password" ]]; then
		die "Failed to generate random master password."
	fi
	master_key_hash="$(sha256_hex "$master_password")"
	if [[ ${#master_key_hash} -ne 64 ]]; then
		die "Generated MASTER_KEY hash is invalid (expected 64 hex chars)."
	fi

	local env_path
	env_path="$install_dir/.env"
	if [[ -f "$env_path" ]]; then
		warn ".env already exists at $env_path — backing up to .env.bak"
		cp "$env_path" "$install_dir/.env.bak"
	fi

	cat >"$env_path" <<EOF
# Generated by $SCRIPT_NAME at $(date -u +%Y-%m-%dT%H:%M:%SZ)
NODE_ENV=production
PORT=3000
LOG_LEVEL=info
TIMEZONE=Asia/Jakarta

# IMPORTANT:
# - This value MUST be a SHA256 hex hash (64 chars).
# - Use the *plain* master password (printed below) in request header: X-Master-Key
MASTER_KEY=${master_key_hash}

# Database inside container (docker-compose.yml uses this path)
DATABASE_PATH=/app/data/rijan_wa.db

RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=60000
ENCRYPTION_ALGORITHM=aes-256-gcm
EOF

	printf '\n'
	printf '================= IMPORTANT OUTPUT =================\n'
	printf 'Install dir       : %s\n' "$install_dir"
	printf 'Docker image      : %s\n' "${image_repo}:${image_tag}"
	printf 'Env file          : %s\n' "$env_path"
	printf '\n'
	printf 'MASTER PASSWORD (PLAIN TEXT)  : %s\n' "$master_password"
	printf 'MASTER_KEY (SHA256 HASH in .env): %s\n' "$master_key_hash"
	printf '\n'
	printf 'Use this header for admin API:\n'
	printf '  X-Master-Key: %s\n' "$master_password"
	printf '====================================================\n'
	printf '\n'

	write_compose_file "$install_dir" "$image_repo" "$image_tag" "$host_port"

	ensure_docker_installed
	init_docker_access
	ensure_compose_v2

	info "Docker version: $(docker_exec version --format '{{.Server.Version}}' 2>/dev/null || docker_exec version | head -n 5 | tr -d '\r')"
	info "Compose version: $(docker_exec compose version 2>/dev/null | tr -d '\r')"

	info "Pulling image…"
	docker_exec pull "${image_repo}:${image_tag}"

	info "Starting rijan_wa via docker compose…"
	(cd "$install_dir" && docker_exec compose up -d)

	wait_for_container_healthy "rijan_wa" 120 || true

	info "Manage service:"
	printf '  cd %s\n' "$install_dir"
	printf '  docker compose ps\n'
	printf '  docker compose logs -f --tail 200 rijan_wa\n'
	printf '  docker compose restart rijan_wa\n'
	printf '  docker compose down\n'

	printf '\n'
	info "Health check:"
	printf '  curl http://localhost:%s/health\n' "$host_port"
}

main "$@"
