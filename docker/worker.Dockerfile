FROM node:22-alpine

# Install git, ssh, curl, and GitHub CLI
RUN apk add --no-cache \
  git \
  openssh-client \
  curl \
  github-cli \
  && git config --global init.defaultBranch main \
  && mkdir -p /root/.ssh \
  && ssh-keyscan github.com >> /root/.ssh/known_hosts 2>/dev/null

# Worker workspace
WORKDIR /workspace

# Keep container alive for task injection
CMD ["sleep", "infinity"]
